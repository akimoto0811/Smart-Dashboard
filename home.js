'use strict';
/* Dashboard menu: app tiles, the nearest bus stop, MTR station, tram stop and
   pier with their next arrivals, and favourites saved in any of the apps. */
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};

const TEXT={
 en:{title:'Smart Dashboard',place:'HONG KONG',bus:'Bus',mtr:'MTR',tram:'Tram',ferry:'Ferry',nearby:'Nearby',locate:'Locate me',favs:'Favourites',
  locating:'Finding where you are…',denied:'Turn on location for this site to see what’s near you.',noLocation:'Location unavailable. Tap Locate me to try again.',
  loading:'Loading…',none:'No arrivals predicted',noBus:'No bus stop within 600 m',nothingNear:'No bus, MTR, tram or ferry nearby.',min:'min',due:'Due',to:'To',towards:'Towards',
  liveTram:'Open Tram ETA for routes and fares',noSailing:'No more sailings today',tomorrow:'tomorrow',apart:'min apart',offline:'Offline: live times unavailable',
  foot:'Add this page to your Home Screen to open every dashboard from one icon.',saved:n=>`${n} saved`},
 tc:{title:'智能交通資訊',place:'香港',bus:'巴士',mtr:'港鐵',tram:'電車',ferry:'渡輪',nearby:'附近',locate:'定位',favs:'收藏',
  locating:'正在定位…',denied:'請為此網站開啟定位，以查看附近交通。',noLocation:'無法取得位置，請按「定位」再試。',
  loading:'載入中…',none:'暫時沒有預報班次',noBus:'600 米內沒有巴士站',nothingNear:'附近沒有巴士、港鐵、電車或渡輪。',min:'分鐘',due:'即將到達',to:'往',towards:'往',
  liveTram:'開啟電車資訊查看路線及車費',noSailing:'今日已無班次',tomorrow:'明天',apart:'分鐘一班',offline:'離線：未能取得實時資料',
  foot:'將此頁加至主畫面，即可從同一圖示開啟所有資訊板。',saved:n=>`已收藏 ${n} 個`}};
const ICON={
 bus:'<svg viewBox="0 0 32 32"><rect x="6" y="4" width="20" height="21" rx="5"/><path d="M6 15h20M10 25v3m12-3v3M11 20h1m8 0h1M10 9h12"/></svg>',
 mtr:'<svg viewBox="0 0 32 32"><rect x="6" y="3" width="20" height="23" rx="7"/><path d="M9 14h14M11 9h10M11 26l-3 4m13-4 3 4M12 20h2m4 0h2"/></svg>',
 tram:'<svg viewBox="0 0 32 32"><rect x="7" y="8" width="18" height="17" rx="4"/><path d="M7 16h18M12 3h8M16 3v5M11 25l-3 4m13-4 3 4M12 20h1m6 0h1"/></svg>',
 ferry:'<svg viewBox="0 0 32 32"><path d="M5 19l3 6h16l3-6zM9 19v-7h14v7M13 12V7h6v5M4 29c3 0 3-1.5 6-1.5s3 1.5 6 1.5 3-1.5 6-1.5 3 1.5 6 1.5"/></svg>'};

let lang=read('dashboard_lang')||read('hkbus_lang')||(navigator.language.startsWith('zh')?'tc':'en');
if(!TEXT[lang])lang='en';
const T=()=>TEXT[lang];
const tc=()=>lang==='tc';

// ---------------------------------------------------------------- helpers
function km(a,b){const r=x=>x*Math.PI/180,R=6371,dLat=r(b[0]-a[0]),dLng=r(b[1]-a[1]);
 const h=Math.sin(dLat/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
const dist=d=>d<1?`${Math.max(10,Math.round(d*100)*10)} m`:`${d.toFixed(1)} km`;
const mins=at=>Math.max(0,Math.ceil((at-Date.now())/60000));
const whenHTML=(m,sub='')=>m==null?'':`${m<=0?esc(T().due):`${m}<small>${esc(T().min)}${sub?' · '+esc(sub):''}</small>`}`;
const hhmm=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
async function getJSON(url,ms=10000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
 try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(t);}}
const once=new Map();
function load(url,opts){if(!once.has(url))once.set(url,fetch(url,opts||{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).catch(e=>{once.delete(url);throw e;}));return once.get(url);}
function hkNow(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return {ymd:`${p.year}-${p.month}-${p.day}`,wd:p.weekday,min:+p.hour*60+ +p.minute};}

function row({kind,href,title,sub,when,muted,set}){
 return `<a class="row${muted?' muted':''}" href="${href}"${set?` data-set='${esc(JSON.stringify(set))}'`:''}><span class="ic ${kind}">${ICON[kind]}</span><span class="txt"><strong>${esc(title)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</span><span class="when">${when||''}</span></a>`;}

// ---------------------------------------------------------------- MTR
let mtr=null;
async function mtrData(){if(mtr)return mtr;const [lines,coords]=await Promise.all([load('shared/mtr-lines.json'),load('mtr-eta/station-coords.json')]);
 const names=new Map(),linesOf=new Map();
 for(const [code,l] of Object.entries(lines.lines))for(const [s,en,zh] of l.stations){names.set(s,[en,zh]);if(!linesOf.has(s))linesOf.set(s,[]);linesOf.get(s).push(code);}
 return mtr={lines:lines.lines,coords:coords.stations||{},names,linesOf};}
const stName=c=>{const n=mtr?.names.get(c);return n?(tc()?n[1]:n[0]):c;};
const lineName=l=>mtr?.lines[l]?(tc()?mtr.lines[l].tc:mtr.lines[l].en):l;
async function nextTrains(line,sta){
 const j=await getJSON(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${line}&sta=${sta}&lang=${tc()?'TC':'EN'}`);
 const d=j?.data?.[`${line}-${sta}`]||{};
 return ['UP','DOWN'].map(k=>(d[k]||[])[0]).filter(Boolean).map(x=>({dest:x.dest,min:+x.ttnt}));}
function trainText(list){return list.map(x=>`${T().to} ${stName(x.dest)} ${x.min<=0?T().due:x.min+' '+T().min}`).join(' · ');}

// ---------------------------------------------------------------- bus
let busStops=null;
const busNameTC=new Map(),routeTC=new Map();
const nameKey=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const noVia=x=>String(x||'').replace(/\s*[(（](via|經)[^)）]*[)）]\s*$/i,'');
async function busCatalogue(){
 // Reuse the catalogue the Bus app already saved, else download it once.
 const fromDB=await new Promise(yes=>{try{const req=indexedDB.open('hk-bus-eta-dashboard',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('data');
  req.onsuccess=()=>{try{const db=req.result,q=db.transaction('data').objectStore('data').get('catalogue_v5');q.onsuccess=()=>{yes(q.result?.doc||null);db.close();};q.onerror=()=>yes(null);}catch{yes(null);}};
  req.onerror=()=>yes(null);}catch{yes(null);}});
 return fromDB||load('bus-eta/catalogue-compact.json',{cache:'default'});}
async function busData(){
 if(busStops)return busStops;const doc=await busCatalogue(),seen=new Map();
 // Citybus arrivals give the destination in English only: find its Chinese name by matching the English one.
 for(const [tc,en] of doc.destinations||[])if(tc&&en)for(const [k,v] of [[nameKey(en),tc],[nameKey(noVia(en)),noVia(tc)]])if(k&&!busNameTC.has(k))busNameTC.set(k,v);
 for(const [op,,,,flat] of doc.variants)for(let i=0;i+2<flat.length;i+=3){
  const id=doc.stop_ids[flat[i]],loc=doc.locations[flat[i+1]];if(!loc||!Number.isFinite(loc[2]))continue;
  const operator=op==='CTB'?'CTB':'KMB',key=operator+'|'+id;
  if(!seen.has(key))seen.set(key,{operator,id,tc:loc[0],en:loc[1],lat:loc[2],lng:loc[3]});}
 return busStops=[...seen.values()];}
const busStopName=s=>{const n=(tc()?s.tc:s.en)||s.tc||s.en||'';return n.replace(/\s*\([A-Z]{1,3}\d{2,4}\)\s*$/,'');};
async function stopArrivals(s){
 const url=s.operator==='CTB'?`https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/${encodeURIComponent(s.id)}`:`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${encodeURIComponent(s.id)}`;
 const j=await getJSON(url),now=Date.now();
 return (j.data||[]).map(x=>{const en=String(x.dest_en||x.dest||'');
  return {route:x.route,dir:x.dir,stop:s,at:Date.parse(x.eta||''),en,dest:tc()?x.dest_tc||busNameTC.get(nameKey(en))||busNameTC.get(nameKey(noVia(en)))||'':en||x.dest_tc||''};})
  .filter(x=>Number.isFinite(x.at)&&x.at>now-30000);}
async function fillChinese(list){
 // Last resort for Citybus: its per-route arrivals do carry the Chinese destination.
 await Promise.all(list.filter(a=>!a.dest).map(async a=>{
  const k=a.stop.operator+'|'+a.stop.id+'|'+a.route+'|'+a.dir;
  if(!routeTC.has(k)&&a.stop.operator==='CTB')routeTC.set(k,getJSON(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${encodeURIComponent(a.stop.id)}/${encodeURIComponent(a.route)}`,5000)
   .then(j=>(j.data||[]).find(x=>x.dir===a.dir&&x.dest_tc)?.dest_tc||'').catch(()=>''));
  a.dest=(await routeTC.get(k))||a.en;}));}

// ---------------------------------------------------------------- tram & ferry
const tramName=s=>(tc()?s.tc:s.en).replace(/ Terminus$/,'').replace(/總站$/,'')+(/Terminus|總站/.test(s.en+s.tc)?(tc()?'總站':' Terminus'):'');
function dayType(data,ymd,wd){return data.holidays.includes(ymd)||wd==='Sun'?'h':wd==='Sat'?'s':'w';}
function nextSailing(dir,data,now){
 const list=dir[dayType(data,now.ymd,now.wd)]||[];
 if(dir.bands){const b=list.find(b=>now.min>=b[0]&&now.min<b[1]);return b?{every:b[2]}:(list.find(b=>b[0]>now.min)?{at:list.find(b=>b[0]>now.min)[0]}:null);}
 const m=list.find(m=>m>=now.min);return m==null?null:{at:m};}
const place=(data,p)=>tc()?(data.places[p]?.[0]||p):p;
function sailingWhen(n,now){const t=T();if(!n)return {html:'',sub:t.noSailing};
 if(n.every)return {html:`${esc(n.every)}<small>${esc(t.apart)}</small>`,sub:''};
 const w=n.at-now.min;return {html:w<60?whenHTML(w,hhmm(n.at)):esc(hhmm(n.at)),sub:''};}

// ---------------------------------------------------------------- Nearby
let here=null,locState='idle';
// Further than this and a stop, station or pier isn't "nearby" (km).
const NEAR={bus:.6,mtr:1.5,tram:1,ferry:1.5};
let renders=0;
async function renderNearby(){
 const t=T(),el=$('nearby'),me=++renders;
 if(!here){el.innerHTML=`<div class="empty">${esc(locState==='denied'?t.denied:locState==='fail'?t.noLocation:t.locating)}</div>`;return;}
 const now=hkNow(),rows=[],jobs=[];
 // Each mode fills its own row as soon as its data arrives.
 // A newer render (a sharper location came in) takes over: this one stops drawing.
 const slot=(k,html)=>{if(me!==renders)return;rows[k]=html;el.innerHTML=rows.filter(Boolean).join('');};
 slot(0,row({kind:'bus',href:'bus-eta/',title:t.bus,sub:t.loading}));
 slot(1,row({kind:'mtr',href:'mtr-eta/',title:t.mtr,sub:t.loading}));
 slot(2,row({kind:'tram',href:'tram-eta/',title:t.tram,sub:t.loading}));
 slot(3,row({kind:'ferry',href:'ferry-eta/',title:t.ferry,sub:t.loading}));
 jobs.push((async()=>{try{
  const stops=await busData(),near=stops.map(s=>({s,d:km(here,[s.lat,s.lng])})).filter(x=>x.d<NEAR.bus).sort((a,b)=>a.d-b.d).slice(0,3);
  if(!near.length){slot(0,'');return;}
  const all=(await Promise.all(near.map(x=>stopArrivals(x.s).catch(()=>[])))).flat().sort((a,b)=>a.at-b.at);
  const firsts=[],seen=new Set();for(const a of all){if(seen.has(a.route))continue;seen.add(a.route);firsts.push(a);if(firsts.length===3)break;}
  if(tc())await fillChinese(firsts);
  const head=`${busStopName(near[0].s)} · ${dist(near[0].d)}`;
  slot(0,row({kind:'bus',href:'bus-eta/',title:head,sub:firsts.length?firsts.map(a=>`${a.route}${a.dest?` ${t.to} ${a.dest}`:''} ${mins(a.at)||t.due}${mins(a.at)?' '+t.min:''}`).join(' · '):t.none,when:firsts.length?whenHTML(mins(firsts[0].at),firsts[0].route):'',muted:!firsts.length}));
 }catch{slot(0,row({kind:'bus',href:'bus-eta/',title:t.bus,sub:t.offline,muted:true}));}})());
 jobs.push((async()=>{try{
  const m=await mtrData();let best=null;
  for(const [c,p] of Object.entries(m.coords)){if(c==='RAC'||!m.linesOf.has(c))continue;const d=km(here,p);if(!best||d<best.d)best={c,d};}
  if(!best||best.d>NEAR.mtr){slot(1,'');return;}const line=m.linesOf.get(best.c).find(l=>l!=='AEL')||m.linesOf.get(best.c)[0];
  const set={key:'mtr_eta_v1_prefs',merge:{line,station:best.c,dir:'UP'}};
  slot(1,row({kind:'mtr',href:'mtr-eta/',title:`${stName(best.c)} · ${dist(best.d)}`,sub:lineName(line),set}));
  try{const list=await nextTrains(line,best.c);
   slot(1,row({kind:'mtr',href:'mtr-eta/',title:`${stName(best.c)} · ${dist(best.d)}`,sub:list.length?trainText(list):t.none,when:list.length?whenHTML(Math.min(...list.map(x=>x.min))):'',muted:!list.length,set}));
  }catch{slot(1,row({kind:'mtr',href:'mtr-eta/',title:`${stName(best.c)} · ${dist(best.d)}`,sub:t.offline,muted:true,set}));}
 }catch{slot(1,'');}})());
 jobs.push((async()=>{try{
  const d=await load('tram-eta/tram-data.json');let best=null;
  d.stops.forEach((s,i)=>{const k=km(here,[s.lat,s.lng]);if(!best||k<best.d)best={i,d:k};});
  if(!best||best.d>NEAR.tram){slot(2,'');return;}
  // Stops run west to east, so show the furthest terminus each way.
  let west=null,east=null;for(const r of d.routes)for(const dir of r.dirs){const i=dir.indexOf(best.i);if(i<0||i===dir.length-1)continue;const end=dir[dir.length-1];
   if(end<best.i&&(west==null||end<west))west=end;if(end>best.i&&(east==null||end>east))east=end;}
  const short=i=>tramName(d.stops[i]).replace(/ Terminus$|總站$/,'');
  const towards=[west,east].filter(i=>i!=null).map(short).join(tc()?' / ':' or ');
  slot(2,row({kind:'tram',href:'tram-eta/',title:`${tramName(d.stops[best.i])} · ${dist(best.d)}`,sub:towards?`${t.towards} ${towards}`:t.liveTram,when:best.d<3?`$${d.routes[0].fare}`:''}));
 }catch{slot(2,'');}})());
 jobs.push((async()=>{try{
  const d=await load('ferry-eta/ferry-data.json');let best=null;
  for(const [p,v] of Object.entries(d.places)){if(v[1]==null)continue;const k=km(here,[v[1],v[2]]);if(!best||k<best.d)best={p,d:k};}
  if(!best||best.d>NEAR.ferry){slot(3,'');return;}
  // The soonest sailing from that pier, on any route.
  let pick=null;
  d.services.forEach(s=>s.dirs.forEach((dir,i)=>{if(dir.f!==best.p)return;const n=nextSailing(dir,d,now);if(!n)return;
   const key=n.every?-1:n.at;if(!pick||key<pick.key)pick={key,n,s,i,dir};}));
  const title=`${place(d,best.p)} · ${dist(best.d)}`;
  if(!pick){slot(3,row({kind:'ferry',href:'ferry-eta/',title,sub:t.noSailing,muted:true}));return;}
  const w=sailingWhen(pick.n,now);
  slot(3,row({kind:'ferry',href:'ferry-eta/',title,sub:`${t.to} ${place(d,pick.dir.t)} · ${tc()?pick.s.tc:pick.s.en}`,when:w.html,set:{key:'ferry_prefs',merge:{service:pick.s.id,dir:pick.i}}}));
 }catch{slot(3,'');}})());
 await Promise.all(jobs);
 if(me===renders&&!rows.some(Boolean))el.innerHTML=`<div class="empty">${esc(t.nothingNear)}</div>`;
}

// ---------------------------------------------------------------- Favourites
async function renderFavs(){
 const t=T(),el=$('favs'),now=hkNow();
 const bus=(read('hkbus_favourites_v2')||[]).filter(f=>Array.isArray(f?.variants)&&f.variants.length);
 const mtrFav=(read('mtr_eta_v1_prefs')?.favourites||[]).filter(x=>typeof x==='string'&&x.includes('|'));
 const ferryFav=(read('ferry_prefs')?.favourites||[]).filter(f=>f&&f.s);
 const total=bus.length+mtrFav.length+ferryFav.length;
 $('favBlock').classList.toggle('hidden',!total);if(!total)return;
 $('favHint').textContent=t.saved(total);
 const items=[];
 const draw=()=>{el.innerHTML=items.filter(Boolean).join('');};
 const jobs=[];
 bus.slice(0,4).forEach((f,k)=>{
  const title=`${f.route} ${t.to} ${tc()?f.destination_tc||f.destination||f.destination_en:f.destination_en||f.destination||''}`;
  const stop=(tc()?f.name_tc||f.name:f.name_en||f.name)||'';
  // Open the Bus app on this route's stop list, with the saved stop marked.
  const href=`bus-eta/#fav=${encodeURIComponent(f.variants[0].route+'|'+f.variants[0].stop_id)}`;
  items.push(row({kind:'bus',href,title,sub:stop}));
  const idx=items.length-1;
  jobs.push((async()=>{try{
   const all=(await Promise.all(f.variants.map(async v=>{const url=v.operator==='CTB'?`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${encodeURIComponent(v.stop_id)}/${encodeURIComponent(v.route)}`:`https://data.etabus.gov.hk/v1/transport/kmb/eta/${encodeURIComponent(v.stop_id)}/${encodeURIComponent(v.route)}/${encodeURIComponent(v.service_type||'1')}`;
    try{const j=await getJSON(url);return (j.data||[]).filter(x=>String(x.route).trim()===v.route&&(!x.dir||x.dir===v.direction)&&x.eta).map(x=>Date.parse(x.eta)).filter(a=>Number.isFinite(a)&&a>Date.now()-30000);}catch{return [];}}))).flat().sort((a,b)=>a-b);
   items[idx]=row({kind:'bus',href,title,sub:all.length>1?`${stop} · ${all.slice(1,3).map(a=>mins(a)+' '+t.min).join(', ')}`:stop,when:all.length?whenHTML(mins(all[0])):'',muted:!all.length});draw();
  }catch{}})());
 });
 if(mtrFav.length)await mtrData().catch(()=>null);
 mtrFav.slice(0,3).forEach(key=>{
  // Open the MTR Journey planner with this station as the destination.
  const [line,sta]=key.split('|'),href=`mtr-eta/#to=${encodeURIComponent(key)}`,set=null;
  items.push(row({kind:'mtr',href,title:stName(sta),sub:lineName(line)}));const idx=items.length-1;
  jobs.push(nextTrains(line,sta).then(list=>{items[idx]=row({kind:'mtr',href,title:`${stName(sta)} · ${lineName(line)}`,sub:list.length?trainText(list):t.none,when:list.length?whenHTML(Math.min(...list.map(x=>x.min))):'',muted:!list.length,set});draw();}).catch(()=>{}));
 });
 if(ferryFav.length){try{const d=await load('ferry-eta/ferry-data.json');
  ferryFav.slice(0,3).forEach(f=>{const s=d.services.find(x=>x.id===f.s);const dir=s?.dirs[f.d];if(!dir)return;
   const n=nextSailing(dir,d,now),w=sailingWhen(n,now);
   items.push(row({kind:'ferry',href:'ferry-eta/',title:`${place(d,dir.f)} → ${place(d,dir.t)}`,sub:w.sub||(tc()?s.tc:s.en),when:w.html,muted:!n,set:{key:'ferry_prefs',merge:{service:s.id,dir:f.d}}}));});
 }catch{}}
 draw();await Promise.all(jobs);
}

// ---------------------------------------------------------------- page
function texts(){
 const t=T();document.documentElement.lang=tc()?'zh-Hant-HK':'en';document.title=t.title;
 for(const [id,k] of [['title','title'],['busName','bus'],['mtrName','mtr'],['tramName','tram'],['ferryName','ferry'],['nearbyTitle','nearby'],['locateLabel','locate'],['favTitle','favs'],['foot','foot']])$(id).textContent=t[k];
 const date=new Intl.DateTimeFormat(tc()?'zh-HK':'en-GB',{timeZone:'Asia/Hong_Kong',day:'numeric',month:tc()?'numeric':'long',year:tc()?'numeric':undefined,weekday:'short'}).format(new Date());
 $('today').textContent=(t.place+' · '+date).toUpperCase();
 document.querySelectorAll('[data-lang]').forEach(b=>b.classList.toggle('on',b.dataset.lang===lang));
}
function refresh(){renderNearby();renderFavs();}
// On open, a quick rough fix (wifi or phone network) shows something at once, then a GPS fix
// replaces it. A rougher answer never replaces a sharper one.
let acc=Infinity;
function take(p){const a=p.coords.accuracy||5000;if(here&&a>=acc)return;acc=a;here=[p.coords.latitude,p.coords.longitude];locState='ok';renderNearby();}
const denied=async()=>{try{return (await navigator.permissions?.query({name:'geolocation'}))?.state==='denied';}catch{return false;}};
function locate(auto,retry=1){
 if(!navigator.geolocation){locState='fail';renderNearby();return;}
 if(!here){locState='locating';renderNearby();}
 if(!auto)acc=Infinity;
 if(auto)navigator.geolocation.getCurrentPosition(take,()=>{},{enableHighAccuracy:false,timeout:8000,maximumAge:60000});
 navigator.geolocation.getCurrentPosition(take,async e=>{if(here)return;
  // Safari can refuse a request made while its "Allow location" question is still showing,
  // even when you then tap Allow: ask once more unless location really is turned off.
  if(retry&&!(await denied())){setTimeout(()=>{if(!here)locate(auto,retry-1);},1500);return;}
  locState=e.code===1?'denied':'fail';renderNearby();},{enableHighAccuracy:true,timeout:15000,maximumAge:auto?20000:0});
}
async function autoLocate(){
 if(await denied()){locState='denied';renderNearby();}else locate(true);
 // Location turned on later (in the browser's settings): look again.
 try{const s=await navigator.permissions?.query({name:'geolocation'});if(s)s.onchange=()=>{if(s.state!=='denied'&&!here)locate(true);};}catch{}}
// Weather also asks for your location: use its answer when it comes first or is sharper.
addEventListener('dashboard:here',e=>take(e.detail));

// Tapping a nearby or favourite row opens that app on the same stop or route.
document.addEventListener('click',e=>{const a=e.target.closest('a.row[data-set]');if(!a)return;
 try{const {key,merge}=JSON.parse(a.dataset.set);write(key,{...(read(key)||{}),...merge});}catch{}});
document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{lang=b.dataset.lang;write('dashboard_lang',lang);texts();refresh();}));
$('locateBtn').addEventListener('click',()=>locate(false));
// Back from an app, Safari may show this page from its cache: pick up changes made there.
addEventListener('pageshow',e=>{if(!e.persisted)return;const l=read('dashboard_lang');if(TEXT[l])lang=l;texts();refresh();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')return;
 if(!here&&(locState==='denied'||locState==='fail'))autoLocate();refresh();});
setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);

texts();renderNearby();renderFavs();autoLocate();
