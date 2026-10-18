'use strict';
/* HK Bus ETA 2.0. Route-discovery catalogue != authoritative operator route-stop list. */
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const storage = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const persist = (key, value) => {try {localStorage.setItem(key, JSON.stringify(value));return true;} catch {return false;}};
const operators = ['KMB','LWB','CTB'];
const names = {KMB:'KMB',LWB:'Long Win',CTB:'Citybus'};
const hkTime = () => new Intl.DateTimeFormat('en-HK',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
const hkDate = () => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'long',day:'numeric'}).format(new Date());
const distance = (a,b,c,d) => {const rad=Math.PI/180, x=(c-a)*rad, y=(d-b)*rad*Math.cos((a+c)/2*rad);return Math.round(Math.hypot(x,y)*6371000);};
const fmt = value => Number(value||0).toLocaleString('en-HK');
const present = value => Number.isFinite(Number(value)) && value!==null && value!=='';
const latlon = value => present(value) ? Number(value) : null;
const goodPosition = point => point && point.lat!==null && point.lng!==null && Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.lat>22 && point.lat<22.7 && point.lng>113.7 && point.lng<114.6;
const clean = x => String(x??'').trim().toUpperCase();
const itemID = it => [it.operator,it.route,it.direction,it.stop_id,it.service_type||'1'].join('|');
const groupID = it => it.route+'|'+it.direction;
const favID = f => groupID(f)+'|'+f.variants.map(itemID).sort().join(',');
const demoStops = [
 {route:'102',direction:'O',destination:'美孚',name:'西灣河文娛中心, 筲箕灣道',variants:[{operator:'CTB',route:'102',direction:'O',stop_id:'001303',service_type:'1',name:'西灣河文娛中心, 筲箕灣道',lat:22.281794,lng:114.222021}]},
 {route:'960',direction:'O',destination:'灣仔',name:'Example stop',variants:[{operator:'KMB',route:'960',direction:'O',stop_id:'B8B04CD1E568B8F6',service_type:'1',name:'Example stop',lat:22.281,lng:114.158}]}
];
const state = {view:'overview',demo:storage('hkbus_demo',true),catalogue:[],groups:[],catalogueDate:'',operator:'ALL',query:'',radius:450,position:null,nearby:[],favourites:storage('hkbus_favourites_v2',[]),currentGroup:null,currentStop:null,verified:[],routeFailures:[],busy:false,dialogToken:0,etas:new Map(),routeStops:new Map(),stopDetails:new Map(),notice:'',forceRefresh:false};
state.favourites = Array.isArray(state.favourites)?state.favourites:[];
function normalize(input){
 if(!input || typeof input!=='object')return null;
 const operator=clean(input.operator),route=clean(input.route),direction=clean(input.direction||'O').slice(0,1),stop_id=clean(input.stop_id||input.stop),service_type=String(input.service_type||input.serviceType||'1');
 if(!operators.includes(operator)||!/^\d{1,3}[A-Z]{0,2}$|^[A-Z]{1,3}\d{1,3}[A-Z]?$/.test(route)||!['O','I'].includes(direction)||!/^[0-9]{1,3}$/.test(service_type))return null;
 if(operator==='CTB'?!/^\d{6}$/.test(stop_id):!/^[0-9A-F]{16}$/.test(stop_id))return null;
 const lat=latlon(input.lat),lng=latlon(input.lng??input.long);
 return {operator,route,direction,stop_id,service_type,name:String(input.name||input.stop_name||'Bus stop'),destination:String(input.destination||input.dest||''),lat,lng};
}
function uniqueCatalogue(rows){const map=new Map();for(const raw of rows){const it=normalize(raw);if(it)map.set(itemID(it),it);}return [...map.values()];}
function normalizeCatalogue(json){if(Array.isArray(json.entries))return uniqueCatalogue(json.entries);
 if(json.routes&&json.cells){const coords=new Map();for(const [cell,labels] of Object.entries(json.cells)){const [a,b]=cell.split('_').map(Number);for(const label of labels||[])if(!coords.has(label))coords.set(label,[(a+.5)/100,(b+.5)/100]);}return uniqueCatalogue(Object.entries(json.routes).map(([key,it])=>({...it,name:key.split(' · ').at(-1)||'Stop',lat:coords.get(key)?.[0],lng:coords.get(key)?.[1]})));}
 throw Error('Unsupported catalogue format. Generate catalogue.json using make_catalogue.py');}
function makeGroups(items){
 const groups=new Map();
 for(const it of items){const key=groupID(it);let g=groups.get(key);if(!g){g={key,route:it.route,direction:it.direction,items:[],operators:new Set(),destCounts:new Map()};groups.set(key,g);}
  g.items.push(it);g.operators.add(it.operator);const dest=it.destination.trim();if(dest)g.destCounts.set(dest,(g.destCounts.get(dest)||0)+1);
 }
 return [...groups.values()].map(g=>({...g,operators:[...g.operators].sort(),destination:[...g.destCounts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'Destination not available',stopCount:new Set(g.items.map(x=>x.operator+'|'+x.stop_id)).size}))
   .sort((a,b)=>a.route.localeCompare(b.route,'en',{numeric:true})||(a.direction===b.direction?0:a.direction==='O'?-1:1));
}
function routeResults(){
 const q=clean(state.query), all=state.demo?makeGroups(demoStops.flatMap(x=>x.variants.map(v=>({...v,destination:x.destination})))):state.groups;
 let groups=all.filter(g=>state.operator==='ALL'||g.operators.includes(state.operator));
 if(q){
  // Route-like queries must match route NUMBER, never a stop name or another route's destination.
  if(/^[A-Z0-9]{1,6}$/.test(q)&&/\d/.test(q)){
   const exact=groups.filter(g=>g.route===q);
   groups=exact.length?exact:groups.filter(g=>g.route.startsWith(q));
  } else groups=groups.filter(g=>g.route.includes(q)||g.destination.toUpperCase().includes(q)||g.items.some(x=>x.name.toUpperCase().includes(q)));
 }
 return groups;
}
function restoreFavs(){
 state.favourites=state.favourites.map(f=>{
  if(Array.isArray(f.variants)){
   const variants=f.variants.map(normalize).filter(Boolean);
   return variants.length?{route:variants[0].route,direction:variants[0].direction,destination:String(f.destination||''),name:String(f.name||variants[0].name),variants}:null;
  }
  const item=normalize(f);return item?{route:item.route,direction:item.direction,destination:item.destination,name:item.name,variants:[item]}:null;
 }).filter(Boolean);
}
restoreFavs();
const banner = msg => {state.notice=msg;const el=$('#notice');el.textContent=msg;el.classList.toggle('hidden',!msg);};
const line = (title,desc) => `<div class="section-title">${esc(title)}</div>${desc?`<div class="section-sub">${esc(desc)}</div>`:''}`;
const operatorChips = ops => `<span class="operators">${ops.map(x=>`<span class="operator-chip">${esc(names[x]||x)}</span>`).join('')}</span>`;
function groupRows(groups){return groups.map((g,i)=>`<button class="route-group" data-action="openGroup" data-group="${esc(g.key)}">
 <span class="arrival-bus">${esc(g.route)}</span><span class="group-info"><strong>${esc(g.destination)}</strong><span class="group-meta">${g.direction==='O'?'Outbound':'Inbound'} · ${fmt(g.stopCount)} stop records</span>${operatorChips(g.operators)}</span><span class="group-arrow">›</span></button>`).join('');}
function favouriteRows(){const arr=state.demo?demoStops:state.favourites;return arr.map((f,i)=>`<button class="route-group" data-action="openFavourite" data-index="${i}"><span class="arrival-bus">${esc(f.route)}</span><span class="group-info"><strong>${esc(f.destination||'Saved bus stop')}</strong><span class="group-meta">${esc(f.name)} · ${f.direction==='O'?'Outbound':'Inbound'}</span>${operatorChips([...new Set(f.variants.map(x=>x.operator))])}</span><span class="group-arrow">›</span></button>`).join('');}
function overview(){const fs=state.demo?demoStops:state.favourites;
 return `<div class="card"><div class="hero-kicker"><span>Bus arrivals</span><span class="mint-tag">${state.demo?'DEMO':'LIVE'}</span></div><div class="hero-minutes">${fmt(fs.length)}<span>saved stops</span></div><div class="hero-description">Select a saved stop to retrieve the next arrivals. Predictions are requested from the operator.</div><div class="stat-grid"><div class="stat"><div class="label">Catalogue routes / directions</div><div class="value">${fmt(state.groups.length)}</div></div><div class="stat"><div class="label">Hong Kong time</div><div class="value muted" style="font-size:19px">${esc(hkTime())}</div></div></div></div>${line('Your favourites','Tap a stop to check live arrivals')}<div class="card no-gap">${fs.length?favouriteRows():'<div class="empty">No favourites yet. Find a route and save your boarding stop.</div>'}</div><div class="buttons"><button class="primary-button" data-view="browse">Find a bus route</button><button class="ghost-button" data-view="nearby">Nearby stops</button></div>`;}
function favourites(){const fs=state.demo?demoStops:state.favourites;return `${line('Saved bus stops','Your chosen route, direction and boarding stop')}<div class="card no-gap">${fs.length?favouriteRows():'<div class="empty">No favourites saved. Add one from Routes or Nearby.</div>'}</div><div class="buttons"><button class="primary-button" data-view="browse">Add a favourite</button><button class="ghost-button" data-action="exportFav">Export backup</button></div>`;}
function browse(){const groups=routeResults();return `<div class="card"><div class="card-title">Search by route number or stop name</div><input id="routeSearch" class="field" autocomplete="off" placeholder="102, 960, 1A, 中環" value="${esc(state.query)}"/><p class="hint">A route number matches that route only. Each direction appears once; participating operators appear together.</p></div><div class="operator-row">${['ALL',...operators].map(op=>`<button data-action="filterOp" data-value="${op}" class="${state.operator===op?'selected':''}">${op==='ALL'?'All':esc(op)}</button>`).join('')}</div>${line('Routes and directions',`${fmt(groups.length)} grouped results · select one to see verified operator stops`)}<div class="card no-gap">${groups.length?groupRows(groups.slice(0,100)):'<div class="empty">No matching routes. Try another route number or stop name.</div>'}</div>${groups.length>100?'<p class="small-note">Showing the first 100 groups. Enter a route number to narrow the results.</p>':''}`;}
function nearby(){const candidates=state.demo?demoStops.flatMap(f=>f.variants):state.nearby;
 const groups=makeGroups(candidates);groups.sort((a,b)=>(a.nearestDistance??Infinity)-(b.nearestDistance??Infinity));
 return `<div class="card"><div class="card-title">Nearby bus services</div><p class="hint">Use your iPhone location to find routes around you. Selecting a route retrieves verified operator stop IDs before requesting ETA.</p><div class="input-row"><select class="select" id="radiusSelect">${[300,450,800,1200].map(n=>`<option value="${n}" ${n===state.radius?'selected':''}>${n} m</option>`).join('')}</select><button class="primary-button" data-action="locate">⌖ Locate me</button></div>${state.position?`<p class="small-note">GPS accuracy ±${Math.round(state.position.accuracy)}m · ${fmt(candidates.length)} matching route-stop entries</p>`:''}</div>${line('Routes near you',state.demo?'Illustration only':state.position?`${fmt(groups.length)} route / direction groups`:'Tap Locate me to search')}<div class="card no-gap">${groups.length?groupRows(groups.slice(0,90)):'<div class="empty">No routes yet. Allow Safari location access while in Hong Kong.</div>'}</div>`;}
function settings(){return `${line('Data and preferences','Stored on this browser unless exported')}<div class="card"><div class="card-title">Bus catalogue</div><div class="stat-grid"><div class="stat"><div class="label">Route-stop records</div><div class="value">${fmt(state.catalogue.length)}</div></div><div class="stat"><div class="label">Last generated</div><div class="value muted" style="font-size:17px">${esc(state.catalogueDate||'Not loaded')}</div></div></div><p class="hint">The catalogue is for route and GPS discovery. Before showing bus times, the dashboard verifies stop membership using official KMB/Citybus route-stop APIs.</p><button class="ghost-button" data-action="importCat">Import catalogue JSON</button></div><div class="card"><div class="card-title">Favourites backup</div><p class="hint">Saved only in this browser. Export before clearing Safari site data or switching devices.</p><div class="buttons"><button class="primary-button" data-action="importFav">Import favourites</button><button class="ghost-button" data-action="exportFav">Export favourites</button></div><p class="small-note">${fmt(state.favourites.length)} saved</p></div><div class="card"><div class="card-title">Diagnostics</div><p class="hint">KMB/LWB and Citybus public APIs are queried directly. A network/CORS failure is reported explicitly, never displayed as a missing bus.</p><div class="buttons"><button class="ghost-button" data-action="clearETAs">Clear ETA cache</button><button class="ghost-button" data-action="clearFav">Clear favourites</button></div></div>`;}
function render(){const titles={overview:['Overview','Your bus arrivals at a glance'],favourites:['Favourites','Your frequently used journeys'],nearby:['Nearby Stops','Services around your location'],browse:['Find a Route','One entry per route and direction'],settings:['Settings','Catalogue, data and permissions']};
 const [title,desc]=titles[state.view];$('#pageTitle').textContent=title;$('#pageCaption').textContent=desc;
 $('#todayLabel').textContent='HONG KONG · '+hkDate().toUpperCase();$('#modeBadge').textContent=state.demo?'DEMO PREVIEW':'LIVE MODE';$('#modeBadge').classList.toggle('demo',state.demo);$('#modeButton').textContent=state.demo?'Go live':'Preview UI';$('#syncLabel').textContent=state.demo?'Sample data · not live':'HK time '+hkTime();
 document.querySelectorAll('.nav-btn').forEach(el=>el.classList.toggle('selected',el.dataset.view===state.view));
 $('#mainContent').innerHTML=({overview,favourites,nearby,browse,settings}[state.view]||overview)();}
function setView(view){state.view=view;banner('');render();scrollTo({top:0,behavior:'instant'});}
async function requestJSON(url,limit=13000){const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),limit);try{const res=await fetch(url,{cache:'no-store',signal:ctrl.signal});if(!res.ok)throw Error('API HTTP '+res.status);return await res.json();}catch(err){if(err.name==='AbortError')throw Error('API request timed out');throw err;}finally{clearTimeout(timeout);}}
// The operator's current route-stop list is authoritative. Catalogue mappings are NOT.
function officialListURL(op,route,direction,service){const bound=direction==='I'?'inbound':'outbound';return op==='CTB'?`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${encodeURIComponent(route)}/${bound}`:`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${encodeURIComponent(route)}/${bound}/${encodeURIComponent(service||'1')}`;}
async function getOfficialStops(op,route,direction,service){const key=[op,route,direction,service].join('|'), cached=state.routeStops.get(key);
 if(cached && Date.now()-cached.at<3600000)return cached.value;
 const doc=await requestJSON(officialListURL(op,route,direction,service));
 if(!Array.isArray(doc.data))throw Error(op+' returned invalid route-stop JSON');
 const list=doc.data.filter(s=>clean(s.route)===route && (!s.dir||s.dir===direction) && (op==='CTB'?/^\d{6}$/.test(s.stop||''):/^[0-9A-F]{16}$/i.test(s.stop||''))).map(s=>({operator:op,route,direction,service_type:service,stop_id:clean(s.stop),seq:Number(s.seq)||9999})).sort((a,b)=>a.seq-b.seq);
 state.routeStops.set(key,{at:Date.now(),value:list});return list;
}
const stopNameURL = it => it.operator==='CTB'?`https://rt.data.gov.hk/v2/transport/citybus/stop/${it.stop_id}`:`https://data.etabus.gov.hk/v1/transport/kmb/stop/${it.stop_id}`;
async function getStopDetails(it){const key=it.operator+'|'+it.stop_id;
 if(state.stopDetails.has(key))return state.stopDetails.get(key);
 const task=(async()=>{const j=await requestJSON(stopNameURL(it),13000),d=j.data;if(!d)throw Error('Missing stop details for '+key);
 const lat=latlon(d.lat),lng=latlon(d.long??d.lng);
 return {...it,name:String(d.name_tc||d.name_en||'Stop '+it.stop_id),lat,lng};})();
 state.stopDetails.set(key,task);task.catch(()=>state.stopDetails.delete(key));return task;}
async function officialGroup(g){
 const ops=g.operators || [...new Set(g.items.map(i=>i.operator))];
 const jobs=[];for(const op of ops){const candidates=g.items.filter(i=>i.operator===op),services=op==='CTB'?['1']:[...new Set(candidates.map(i=>i.service_type||'1'))].slice(0,4);
   for(const service of services)jobs.push({op,service});}
 const settled=await Promise.all(jobs.map(async job=>{try{return {job,stops:await getOfficialStops(job.op,g.route,g.direction,job.service)}}catch(e){return {job,error:e.message}}}));
 const warnings=settled.filter(z=>z.error).map(z=>z.job.op+': '+z.error),raw=settled.flatMap(z=>z.stops||[]);
 const match=new Map(g.items.map(it=>[it.operator+'|'+it.stop_id,it]));
 const merged=new Map();for(const record of raw){const key=record.operator+'|'+record.route+'|'+record.direction+'|'+record.stop_id;if(!merged.has(key)){
  const m=match.get(record.operator+'|'+record.stop_id);
  merged.set(key,{...record,name:m?.name||'',lat:m?.lat??null,lng:m?.lng??null,destination:g.destination});
 }}
 const items=[...merged.values()];
 // Operator route-stop APIs return IDs only. Prefer catalogue stop details where the
 // route/stop pair was verified, otherwise resolve directly from official stop API.
 const missing=items.filter(it=>!goodPosition(it)||!it.name);
 for(let i=0;i<missing.length;i+=8){await Promise.all(missing.slice(i,i+8).map(async it=>{try{Object.assign(it,await getStopDetails(it));}catch{it.name=it.name||'Stop '+it.stop_id;}}));}
 return {stops:clusterStops(items,g),warnings};
}
function clusterStops(items,g){
 const ordered=items.slice().sort((a,b)=>a.seq-b.seq||a.operator.localeCompare(b.operator));
 const clusters=[];
 for(const it of ordered){let found=null;
  if(goodPosition(it))found=clusters.find(s=>goodPosition(s)&&distance(s.lat,s.lng,it.lat,it.lng)<=25 && (s.name===it.name||s.variants.every(v=>v.operator!==it.operator)));
  if(found){if(!found.variants.some(x=>itemID(x)===itemID(it)))found.variants.push(it);found.seq=Math.min(found.seq,it.seq);}
  else clusters.push({route:g.route,direction:g.direction,destination:g.destination,name:it.name||'Stop '+it.stop_id,lat:it.lat,lng:it.lng,seq:it.seq,variants:[it]});
 }
 const pos=state.position;clusters.forEach(s=>s.distance=pos&&goodPosition(s)?distance(pos.lat,pos.lng,s.lat,s.lng):null);
 return clusters.sort((a,b)=>pos?(a.distance??Infinity)-(b.distance??Infinity)||a.seq-b.seq:a.seq-b.seq);
}
function dialog(title){$('#modalTitle').textContent=title;$('#modalScrim').classList.remove('hidden');$('#modalBody').innerHTML='<p class="hint loading">Loading…</p>';}
function closeDialog(){state.dialogToken++;$('#modalScrim').classList.add('hidden');state.currentGroup=null;state.currentStop=null;}
async function openGroup(key){const groups=state.view==='nearby'?makeGroups(state.nearby):routeResults();let group=groups.find(g=>g.key===key);
 if(!group)return;
 // Nearby discovers the route using local points, but needs all operators on
 // that route when verifying stops (joint KMB + Citybus services).
 if(state.view==='nearby'&&!state.demo)group=state.groups.find(g=>g.key===key)||group;const token=++state.dialogToken;state.currentGroup=group;state.currentStop=null;state.routeFailures=[];dialog(group.route+' · '+(group.direction==='I'?'Inbound':'Outbound'));
 $('#modalBody').innerHTML='<p class="hint loading">Checking KMB / Citybus official stop lists…</p>';
 if(state.demo){state.verified=demoStops.filter(x=>x.route===group.route&&x.direction===group.direction);drawStopPicker(token);return;}
 try{const data=await officialGroup(group);if(token!==state.dialogToken)return;state.verified=data.stops;state.routeFailures=data.warnings;drawStopPicker(token);}
 catch(e){if(token===state.dialogToken)$('#modalBody').innerHTML='<div class="notice">Cannot verify route stops: '+esc(e.message)+'</div><button class="ghost-button" data-action="retryRoute">Try again</button>';}
}
function drawStopPicker(token){if(token!==state.dialogToken)return;let body='<div class="detail"><strong>'+esc(state.currentGroup?.destination||'')+'</strong><p class="hint">Select your actual boarding stop. These stop IDs come from the operator’s current official route list.</p></div>';
 if(state.routeFailures.length)body+='<div class="notice">Some operators could not be loaded: '+esc(state.routeFailures.join('; '))+'</div>';
 if(!state.verified.length){body+='<div class="notice">No verified stops returned for this route and direction. Please try another route or later.</div>';}
 else body+='<div class="result-list">'+state.verified.map((s,i)=>`<button class="result-item" data-action="selectStop" data-index="${i}"><span><span class="result-name">${esc(s.name)}</span><span class="result-sub">${operatorChips([...new Set(s.variants.map(x=>x.operator))])} · ${s.distance!==null?esc(s.distance)+' m away · ':''}${s.variants.map(x=>esc(x.stop_id)).join(' / ')}</span></span><span class="result-right">ETA ›</span></button>`).join('')+'</div>';
 $('#modalBody').innerHTML=body;
}
function etaURL(it){return it.operator==='CTB'?`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${encodeURIComponent(it.stop_id)}/${encodeURIComponent(it.route)}`:`https://data.etabus.gov.hk/v1/transport/kmb/eta/${encodeURIComponent(it.stop_id)}/${encodeURIComponent(it.route)}/${encodeURIComponent(it.service_type||'1')}`;}
async function getETA(it,force=false){const key=itemID(it),old=state.etas.get(key);if(!force&&old&&Date.now()-old.time<45000)return old;
 try{const json=await requestJSON(etaURL(it),14000);if(!Array.isArray(json.data))throw Error('Invalid ETA JSON');
 const now=Date.now();const arr=json.data.filter(x=>clean(x.route)===it.route && (!x.dir||x.dir===it.direction) && (!x.stop||clean(x.stop)===it.stop_id) && x.eta)
 .map(x=>({at:Date.parse(x.eta),operator:it.operator,remark:String(x.rmk_tc||x.rmk_en||'')})).filter(x=>Number.isFinite(x.at)&&x.at>=now-30000&&x.at<=now+10800000).sort((a,b)=>a.at-b.at);
 const out={time:Date.now(),arr:arr.slice(0,3)};state.etas.set(key,out);return out;
 }catch(e){const out={time:Date.now(),arr:[],error:e.message};state.etas.set(key,out);return out;}}
function isFavourite(s){return state.favourites.some(f=>favID(f)===favID(s));}
function drawETA(s,results,token){if(token!==state.dialogToken)return;
 const errs=results.filter(x=>x.error),etas=results.flatMap(x=>x.arr||[]).sort((a,b)=>a.at-b.at).slice(0,6),fav=isFavourite(s);
 let html=`<div class="detail"><strong>${esc(s.name)}</strong><p class="hint">${esc(s.destination||'')} · ${s.direction==='O'?'Outbound':'Inbound'}<br>${operatorChips([...new Set(s.variants.map(x=>x.operator))])}</p></div><div class="group-heading">Next bus arrivals · HK time ${esc(hkTime())}</div>`;
 if(state.demo)html+='<div class="notice">Demo sample only — arrival predictions are not live.</div>';
 if(errs.length)html+='<div class="notice">API request error: '+esc(errs.map(x=>x.error).join(' · '))+'. Check your network or browser API permissions.</div>';
 if(etas.length)html+='<div class="eta-large">'+etas.map(x=>{const mins=Math.max(0,Math.ceil((x.at-Date.now())/60000));return `<div class="eta-chip"><strong>${mins===0?'Due':mins}</strong><small>${esc(names[x.operator])} · ${mins?'min':'now'}</small></div>`;}).join('')+'</div>';
 else if(!errs.length)html+='<p class="hint">No ETA predicted by the operator for this verified stop right now. This is not necessarily a cancelled service.</p>';
 html+=`<div class="two-buttons"><button class="primary-button" data-action="toggleFav">${fav?'★ Remove favourite':'☆ Add favourite'}</button><button class="ghost-button" data-action="refreshStop">↻ Refresh</button></div>${state.currentGroup?'<button class="back-link" data-action="backToStops">← Other stops on this route</button>':''}`;
 $('#modalBody').innerHTML=html;}
async function showStop(s,force=false){const token=++state.dialogToken;state.currentStop=s;dialog(s.route+' · '+(s.direction==='O'?'Outbound':'Inbound'));
 $('#modalBody').innerHTML='<p class="hint loading">Requesting real-time arrivals from official operators…</p>';
 if(state.demo){const time=Date.now();drawETA(s,[{arr:[3,12,24].map(m=>({at:time+m*60000,operator:s.variants[0].operator}))}],token);return;}
 const result=await Promise.all(s.variants.map(x=>getETA(x,force)));drawETA(s,result,token);}
function toggleFav(){const s=state.currentStop;if(!s||state.demo){banner('Switch to Live mode to save favourites.');return;}
 const idx=state.favourites.findIndex(f=>favID(f)===favID(s));if(idx<0)state.favourites.push({...s});else state.favourites.splice(idx,1);
 persist('hkbus_favourites_v2',state.favourites);showStop(s);render();}
function openFavourite(index){const f=(state.demo?demoStops:state.favourites)[index];state.currentGroup=null;if(f)showStop(f);}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function locate(){if(state.demo){banner('Switch to Live mode to use GPS.');return;}if(!state.catalogue.length){banner('Catalogue not loaded yet. Wait or import it in Settings.');return;}
 if(!navigator.geolocation){banner('GPS is not available. Open the HTTPS dashboard in Safari.');return;}
 banner('Requesting iPhone location…');navigator.geolocation.getCurrentPosition(pos=>{const {latitude:lat,longitude:lng,accuracy}=pos.coords;state.position={lat,lng,accuracy};
  if(!goodPosition(state.position)){state.nearby=[];banner('You appear to be outside Hong Kong; Nearby needs a Hong Kong GPS position.');render();return;}
  const limit=state.radius,la=limit/110900,lo=limit/(110900*Math.cos(lat*Math.PI/180));
  state.nearby=state.catalogue.filter(x=>goodPosition(x)&&Math.abs(x.lat-lat)<=la&&Math.abs(x.lng-lng)<=lo&&distance(lat,lng,x.lat,x.lng)<=limit);
  banner('');render();
 },error=>banner(({1:'Safari location permission denied.',2:'Current position unavailable.',3:'Location request timed out.'})[error.code]||error.message),{enableHighAccuracy:true,timeout:12000,maximumAge:20000});}
async function indexedGet(key){try{const db=await new Promise((yes,no)=>{const req=indexedDB.open('hk-bus-eta-dashboard',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error)});
 return await new Promise((yes,no)=>{const tx=db.transaction('data');const q=tx.objectStore('data').get(key);q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);tx.oncomplete=()=>db.close();});}catch{return null;}}
async function indexedPut(key,value){try{const db=await new Promise((yes,no)=>{const req=indexedDB.open('hk-bus-eta-dashboard',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error)});
 await new Promise((yes,no)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(value,key);tx.oncomplete=()=>{db.close();yes();};tx.onerror=()=>no(tx.error);});}catch{/* Site catalogue still works this session. */}}
function applyCatalogue(entries,date){state.catalogue=entries;state.groups=makeGroups(entries);state.catalogueDate=date||'Unknown';render();}
async function loadCatalogue(){const saved=await indexedGet('catalogue');if(saved&&Array.isArray(saved.entries)){applyCatalogue(saved.entries,saved.date);}
 try{const res=await fetch('./catalogue.json',{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const json=await res.json();const entries=normalizeCatalogue(json);if(!entries.length)throw Error('Empty catalogue');applyCatalogue(entries,json.catalogue_date);await indexedPut('catalogue',{entries,date:state.catalogueDate});}
 catch(e){if(!state.catalogue.length)banner('Could not load catalogue.json: '+e.message+'. Import the JSON file in Settings.');}}
async function importCatalogue(file){try{const json=JSON.parse(await file.text()),entries=normalizeCatalogue(json);if(!entries.length)throw Error('Empty catalogue');applyCatalogue(entries,json.catalogue_date||'Imported');await indexedPut('catalogue',{entries,date:state.catalogueDate});banner('Imported '+fmt(entries.length)+' route-stop records.');}catch(e){banner('Catalogue import failed: '+e.message);}}
async function importFavourites(file){try{const json=JSON.parse(await file.text()),arr=Array.isArray(json)?json:Object.values(json);const previous=state.favourites;state.favourites=[...previous,...arr];restoreFavs();state.favourites=[...new Map(state.favourites.map(f=>[favID(f),f])).values()];persist('hkbus_favourites_v2',state.favourites);render();banner('Favourites imported.');}catch(e){banner('Import failed: '+e.message);}}
let inputTimer;
document.addEventListener('input',e=>{if(e.target.id==='routeSearch'){state.query=e.target.value;clearTimeout(inputTimer);inputTimer=setTimeout(()=>{if(state.view!=='browse')return;const el=$('#routeSearch'),pos=el.selectionStart;render();const next=$('#routeSearch');next.focus();next.setSelectionRange(pos,pos);},160);}});
document.addEventListener('change',e=>{if(e.target.id==='radiusSelect'){state.radius=Number(e.target.value);state.nearby=[];state.position=null;render();}
 if(e.target.id==='catalogueFile'){const f=e.target.files?.[0];if(f)importCatalogue(f);e.target.value='';}
 if(e.target.id==='favouritesFile'){const f=e.target.files?.[0];if(f)importFavourites(f);e.target.value='';}});
document.addEventListener('click',e=>{const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
 if(action==='filterOp'){state.operator=el.dataset.value;render();}
 if(action==='openGroup')openGroup(el.dataset.group);
 if(action==='openFavourite')openFavourite(Number(el.dataset.index));
 if(action==='selectStop'){const s=state.verified[Number(el.dataset.index)];if(s)showStop(s);}
 if(action==='backToStops'){++state.dialogToken;state.currentStop=null;$('#modalTitle').textContent=state.currentGroup?.route||'Stops';drawStopPicker(state.dialogToken);}
 if(action==='retryRoute'&&state.currentGroup){openGroup(state.currentGroup.key);}
 if(action==='refreshStop'&&state.currentStop)showStop(state.currentStop,true);
 if(action==='toggleFav')toggleFav();
 if(action==='locate')locate();
 if(action==='importCat')$('#catalogueFile').click();
 if(action==='importFav')$('#favouritesFile').click();
 if(action==='exportFav')download('hk-bus-favourites.json',state.favourites);
 if(action==='clearETAs'){state.etas.clear();banner('ETA cache cleared.');}
 if(action==='clearFav'&&confirm('Remove all saved favourites on this browser?')){state.favourites=[];persist('hkbus_favourites_v2',[]);banner('Favourites cleared.');render();}
});
$('#modeButton').addEventListener('click',()=>{state.demo=!state.demo;persist('hkbus_demo',state.demo);state.query='';state.operator='ALL';banner(state.demo?'Demo mode uses illustrative arrival times.':'Live mode active. Choose a route and boarding stop.');render();});
$('#refreshButton').addEventListener('click',()=>{state.etas.clear();state.routeStops.clear();banner('Caches refreshed.');render();});
$('#closeModal').addEventListener('click',closeDialog);
$('#modalScrim').addEventListener('click',e=>{if(e.target.id==='modalScrim')closeDialog();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeDialog();});
render();loadCatalogue();
