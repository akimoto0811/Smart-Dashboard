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
  liveTram:'Open Tram for routes and fares',noLive:'No live times',noSailing:'No more sailings today',tomorrow:'tomorrow',apart:'min apart',offline:'Offline: live times unavailable',
  foot:'Add this page to your Home Screen to open every dashboard from one icon.',saved:n=>`${n} saved`,
  traffic:'Traffic news',noTraffic:'No traffic incidents reported',trafficSrc:'Transport Department special traffic news',roads:'Roads',close:'Close',alerts:'Alerts',
  greet:['Good morning','Good afternoon','Good evening'],trip:'Your trip',tripTab:'Trip',toWork:'To work',toHome:'Home',edit:'Edit trip',setTrip:'Set up your trip',
  setTripDesc:'Pick the MTR stations nearest your home and work. The card then shows your trip with live trains: to work in the morning, home after 2 pm.',
  homeSt:'Home station',workSt:'Work station',save:'Save',cancel:'Cancel',minTo:n=>`to ${n}`,nextArrive:(w,a)=>`Next train ${w} · arrive ${a}`,arrive:a=>`Arrive about ${a}`,
  remind:'🔔 Remind me',details:'Details ›',all:'All ›',walk:'Walk',noRoute:'No MTR route between these stations.',then:'then',more:'More favourites'},
 tc:{title:'智能交通資訊',place:'香港',bus:'巴士',mtr:'港鐵',tram:'電車',ferry:'渡輪',nearby:'附近',locate:'定位',favs:'收藏',
  locating:'正在定位…',denied:'請為此網站開啟定位，以查看附近交通。',noLocation:'無法取得位置，請按「定位」再試。',
  loading:'載入中…',none:'暫時沒有預報班次',noBus:'600 米內沒有巴士站',nothingNear:'附近沒有巴士、港鐵、電車或渡輪。',min:'分鐘',due:'即將到達',to:'往',towards:'往',
  liveTram:'開啟電車資訊查看路線及車費',noLive:'沒有實時班次',noSailing:'今日已無班次',tomorrow:'明天',apart:'分鐘一班',offline:'離線：未能取得實時資料',
  foot:'將此頁加至主畫面，即可從同一圖示開啟所有資訊板。',saved:n=>`已收藏 ${n} 個`,
  traffic:'交通消息',noTraffic:'暫時沒有交通事故消息',trafficSrc:'運輸署特別交通消息',roads:'道路',close:'關閉',alerts:'提示',
  greet:['早晨','午安','晚安'],trip:'我的行程',tripTab:'行程',toWork:'返工',toHome:'返屋企',edit:'修改行程',setTrip:'設定行程',
  setTripDesc:'選擇住所及公司附近的港鐵站。卡片會顯示行程及實時列車：早上顯示返工，下午 2 時後顯示返屋企。',
  homeSt:'住所車站',workSt:'公司車站',save:'儲存',cancel:'取消',minTo:n=>`往${n}`,nextArrive:(w,a)=>`下一班 ${w} · 約 ${a} 到達`,arrive:a=>`約 ${a} 到達`,
  remind:'🔔 提示我',details:'詳情 ›',all:'全部 ›',walk:'步行',noRoute:'這兩個車站之間沒有港鐵路線。',then:'之後',more:'更多收藏'}};
const ICON={
 bus:'<svg viewBox="0 0 32 32"><rect x="6" y="4" width="20" height="21" rx="5"/><path d="M6 15h20M10 25v3m12-3v3M11 20h1m8 0h1M10 9h12"/></svg>',
 mtr:'<svg viewBox="0 0 32 32"><rect x="6" y="3" width="20" height="23" rx="7"/><path d="M9 14h14M11 9h10M11 26l-3 4m13-4 3 4M12 20h2m4 0h2"/></svg>',
 tram:'<svg viewBox="0 0 32 32"><rect x="7" y="8" width="18" height="17" rx="4"/><path d="M7 16h18M12 3h8M16 3v5M11 25l-3 4m13-4 3 4M12 20h1m6 0h1"/></svg>',
 ferry:'<svg viewBox="0 0 32 32"><path d="M5 19l3 6h16l3-6zM9 19v-7h14v7M13 12V7h6v5M4 29c3 0 3-1.5 6-1.5s3 1.5 6 1.5 3-1.5 6-1.5 3 1.5 6 1.5"/></svg>'};
const BUS_COLOUR={KMB:['#d81e05','#fff'],LWB:['#f26f22','#fff'],CTB:['#f9b000','#1a1200']};

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
async function trainsDir(line,sta,dir){
 const j=await getJSON(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${line}&sta=${sta}`);
 return ((j?.data?.[`${line}-${sta}`]||{})[dir]||[]).map(x=>+x.ttnt).filter(Number.isFinite).sort((a,b)=>a-b);}
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
 const slot=(k,html)=>{if(me!==renders)return;rows[k]=html;const all=rows.filter(Boolean);el.innerHTML=all.join('');};
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
  slot(2,row({kind:'tram',href:'tram-eta/',title:`${tramName(d.stops[best.i])} · ${dist(best.d)}`,sub:towards?`${t.towards} ${towards}`:t.liveTram,when:`<small>${esc(t.noLive)}</small>`}));
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

// The top card has two tabs: Your trip and Nearby. The choice is remembered;
// without a saved trip it starts on Nearby.
let tab=read('dashboard_tab')||(read('dashboard_trip')?'trip':'near');
function showTab(t){tab=t==='near'?'near':'trip';write('dashboard_tab',tab);
 document.querySelectorAll('[data-tab]').forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on);});
 $('trip').classList.toggle('hidden',tab!=='trip');$('nearby').classList.toggle('hidden',tab!=='near');$('locateBtn').classList.toggle('hidden',tab!=='near');$('tripPills').classList.toggle('hidden',tab!=='trip');}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));

// ---------------------------------------------------------------- Favourites
// Favourites are glance cards with big live minutes: first MTR, first bus, then the rest.
const badge=(text,bg,fg='#fff')=>`<span class="badge" style="background:${esc(bg)};color:${esc(fg)}">${esc(text)}</span>`;
function glance(it){const t=T(),m=it.mins;
 const big=it.bigHtml?`<div class="big">${it.bigHtml}</div>`:it.loading?'<div class="big none">…</div>':m.length?`<div class="big">${m[0]<=0?esc(t.due):`${m[0]}<small>${esc(t.min)}</small>`}</div>`:`<div class="big none">${esc(t.none)}</div>`;
 return `<a class="card gl row-like" href="${it.href}"${it.set?` data-set='${esc(JSON.stringify(it.set))}'`:''}>${badge(it.badge,it.bg,it.fg)}${big}<div class="sub"><b>${esc(it.place)}</b>${it.dest?' · '+esc(it.dest):''}</div><div class="then">${m.length>1?esc(t.then+' '+m.slice(1,3).join(', ')):''}</div></a>`;}
async function renderFavs(){
 const t=T(),now=hkNow();
 const bus=(read('hkbus_favourites_v2')||[]).filter(f=>Array.isArray(f?.variants)&&f.variants.length);
 const mtrFav=(read('mtr_eta_v1_prefs')?.favourites||[]).filter(x=>typeof x==='string'&&x.includes('|'));
 const ferryFav=(read('ferry_prefs')?.favourites||[]).filter(f=>f&&f.s);
 const total=bus.length+mtrFav.length+ferryFav.length;
 if(!total){$('glance').innerHTML='';return;}
 if(mtrFav.length)await mtrData().catch(()=>null);
 const mtrItems=mtrFav.slice(0,3).map(key=>{const [line,sta]=key.split('|');
  return {kind:'mtr',line,sta,href:`mtr-eta/#to=${encodeURIComponent(key)}`,badge:line,bg:mtr?.lines[line]?.color||'#e2231a',place:stName(sta),dest:lineName(line),mins:[],loading:true};});
 const busItems=bus.slice(0,4).map(f=>{const v=f.variants[0],[bg,fg]=BUS_COLOUR[v.operator]||BUS_COLOUR.KMB;
  const dest=tc()?f.destination_tc||f.destination||f.destination_en:f.destination_en||f.destination||'';
  // Open the Bus app on this route's stop list, with the saved stop marked.
  return {kind:'bus',f,href:`bus-eta/#fav=${encodeURIComponent(v.route+'|'+v.stop_id)}`,badge:f.route,bg,fg,place:(tc()?f.name_tc||f.name:f.name_en||f.name)||'',dest:dest?`${t.to} ${dest}`:'',mins:[],loading:true};});
 const cards=[...mtrItems.slice(0,1),...busItems.slice(0,1),...mtrItems.slice(1),...busItems.slice(1)];
 if(ferryFav.length){try{const d=await load('ferry-eta/ferry-data.json');
  ferryFav.slice(0,3).forEach(f=>{const s=d.services.find(x=>x.id===f.s);const dir=s?.dirs[f.d];if(!dir)return;
   const n=nextSailing(dir,d,now),w=sailingWhen(n,now);
   cards.push({kind:'ferry',href:'ferry-eta/',badge:'⛴',bg:'#1e6fd9',place:`${place(d,dir.f)} → ${place(d,dir.t)}`,dest:'',mins:[],bigHtml:w.html||esc(t.noSailing),set:{key:'ferry_prefs',merge:{service:s.id,dir:f.d}}});});
 }catch{}}
 // All favourites are cards in one row: two show, swipe sideways for the rest.
 const draw=()=>{$('glance').innerHTML=cards.map(glance).join('');$('glance').classList.toggle('many',cards.length>2);};
 draw();
 const live=async it=>{try{
  if(it.kind==='mtr'){const both=await Promise.all(['UP','DOWN'].map(d=>trainsDir(it.line,it.sta,d).catch(()=>[])));it.mins=both.flat().sort((a,b)=>a-b);}
  else it.mins=(await Promise.all(it.f.variants.map(async v=>{const url=v.operator==='CTB'?`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${encodeURIComponent(v.stop_id)}/${encodeURIComponent(v.route)}`:`https://data.etabus.gov.hk/v1/transport/kmb/eta/${encodeURIComponent(v.stop_id)}/${encodeURIComponent(v.route)}/${encodeURIComponent(v.service_type||'1')}`;
    try{const j=await getJSON(url);return (j.data||[]).filter(x=>String(x.route).trim()===v.route&&(!x.dir||x.dir===v.direction)&&x.eta).map(x=>Date.parse(x.eta)).filter(a=>Number.isFinite(a)&&a>Date.now()-30000);}catch{return [];}}))).flat().sort((a,b)=>a-b).map(mins);
 }catch{}it.loading=false;draw();};
 await Promise.all([...mtrItems,...busItems].map(live));
}

// ---------------------------------------------------------------- Your trip
// Home and work MTR stations, set once. Before 2 pm the card shows the trip to
// work, after that the trip home; the pills switch it by hand.
const TRIP_KEY='dashboard_trip';
let tripSide=null,planner=null;
const tripMode=()=>tripSide||(hkNow().min<14*60?'work':'home');
const clock=at=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
async function renderTrip(){
 const el=$('trip'),t=T(),trip=read(TRIP_KEY);
 if(!trip?.home||!trip?.work){$('tripPills').innerHTML='';el.innerHTML=`<div class="trip-empty"><p>${esc(t.setTripDesc)}</p></div><div class="actions"><button class="primary" type="button" data-act="setup">${esc(t.setTrip)}</button></div>`;return;}
 const m=await mtrData().catch(()=>null);if(!m)return;
 planner=planner||window.MTRPlan?.(m.lines,m.coords);
 const mode=tripMode(),from=mode==='work'?trip.home:trip.work,to=mode==='work'?trip.work:trip.home,p=planner?.plan(from,to);
 const pills=`<div class="pills trip-pills"><button type="button" data-trip="work" class="${mode==='work'?'on':''}">${esc(t.toWork)}</button><button type="button" data-trip="home" class="${mode==='home'?'on':''}">${esc(t.toHome)}</button><button type="button" data-act="setup" aria-label="${esc(t.edit)}">✎</button></div>`;
 if(!p){$('tripPills').innerHTML=pills;el.innerHTML=`<div class="trip-empty"><p>${esc(t.noRoute)}</p></div>`;return;}
 const rides=p.legs.filter(l=>l.line!=='WALK'),first=rides[0],last=rides[rides.length-1];
 const colour=l=>l.line==='WALK'?'var(--line)':m.lines[l.line]?.color||'#999';
 const bar=p.legs.map(l=>`<i style="flex:${Math.max(1,Math.round(l.min))};background:${colour(l)}"></i>`).join('');
 const steps=p.legs.map(l=>l.line==='WALK'?`<span>🚶 ${esc(t.walk)} ${Math.round(l.min)} ${esc(t.min)}</span>`:`<span><i style="background:${colour(l)}"></i>${esc(lineName(l.line))} · ${Math.round(l.min)} ${esc(t.min)}</span>`).join('');
 const details=`mtr-eta/#to=${encodeURIComponent(last.line+'|'+to)}&from=${encodeURIComponent(first.line+'|'+from)}`;
 $('tripPills').innerHTML=pills;el.innerHTML=`<div class="total"><span class="n">${p.min}</span><span>${esc(t.min)} ${esc(t.minTo(stName(to)))}</span></div><div class="arr" id="tripArr">${esc(t.arrive(clock(Date.now()+p.min*60000)))}</div>
  <div class="bar">${bar}</div><div class="steps">${steps}</div>
  <div class="actions"><a class="primary" href="alerts/">${esc(t.remind)}</a><a href="${details}">${esc(t.details).replace(' ›','')}</a></div>`;
 // The next train on the first line sets when you would arrive.
 try{const list=await trainsDir(first.line,from,first.dir);if(!list.length||$('tripArr')==null)return;
  const w=list[0];$('tripArr').textContent=t.nextArrive(w<=0?t.due:`${w} ${t.min}`,clock(Date.now()+(w+p.min)*60000));}catch{}
}
function showSetup(on){
 document.querySelectorAll('.setup,.setup-shade').forEach(e=>e.remove());if(!on||!mtr)return;
 const t=T(),trip=read(TRIP_KEY)||{};
 // Start from the nearest station when there is no home yet.
 let near=null;if(!trip.home&&here)for(const [c,p] of Object.entries(mtr.coords)){if(!mtr.linesOf.has(c))continue;const d=km(here,p);if(!near||d<near.d)near={c,d};}
 const lines=Object.entries(mtr.lines).filter(([k])=>k!=='AEL');
 const lineOf=c=>(mtr.linesOf.get(c)||[]).find(l=>l!=='AEL')||lines[0][0];
 const picker=(side,code)=>{const line=lineOf(code);return `<div class="pick"><b>${esc(side==='home'?t.homeSt:t.workSt)}</b><div><select data-line="${side}">${lines.map(([k,l])=>`<option value="${k}"${k===line?' selected':''}>${esc(tc()?l.tc:l.en)}</option>`).join('')}</select><select data-sta="${side}"></select></div></div>`;};
 const shade=document.createElement('div');shade.className='tr-shade setup-shade';shade.addEventListener('click',()=>showSetup(false));
 const p=document.createElement('div');p.className='tr-panel setup';p.setAttribute('role','dialog');p.setAttribute('aria-label',t.setTrip);
 p.innerHTML=`<div class="tr-top"><b>${esc(t.setTrip)}</b><button type="button" class="tr-close" aria-label="${esc(t.close)}">✕</button></div><div class="tr-body"><p>${esc(t.setTripDesc)}</p>${picker('home',trip.home||near?.c||'MOK')}${picker('work',trip.work||'CEN')}</div><div class="actions"><button type="button" data-x="cancel">${esc(t.cancel)}</button><button type="button" class="primary" data-x="save">${esc(t.save)}</button></div>`;
 const fill=(side,keep)=>{const line=p.querySelector(`[data-line="${side}"]`).value,sel=p.querySelector(`[data-sta="${side}"]`);
  sel.innerHTML=mtr.lines[line].stations.map(([c,en,zh])=>`<option value="${c}"${c===keep?' selected':''}>${esc(tc()?zh:en)}</option>`).join('');};
 fill('home',trip.home||near?.c||'MOK');fill('work',trip.work||'CEN');
 p.addEventListener('change',e=>{const side=e.target.dataset.line;if(side)fill(side);});
 p.querySelector('.tr-close').addEventListener('click',()=>showSetup(false));
 p.querySelector('[data-x="cancel"]').addEventListener('click',()=>showSetup(false));
 p.querySelector('[data-x="save"]').addEventListener('click',()=>{write(TRIP_KEY,{home:p.querySelector('[data-sta="home"]').value,work:p.querySelector('[data-sta="work"]').value});tripSide=null;showSetup(false);renderTrip();showTab('trip');});
 document.body.append(shade,p);
}
$('trip').parentElement.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.trip){tripSide=b.dataset.trip;renderTrip();}
 else if(b.dataset.act==='setup'){await mtrData().catch(()=>null);showSetup(true);}});

// ---------------------------------------------------------------- traffic news
// The Transport Department's special traffic news: incidents, closures and diversions
// across Hong Kong, in English and Chinese. Checked every 5 minutes.
let news=null,newsAt=0,newsLoading=null;
async function loadNews(){
 if(newsLoading)return newsLoading;
 if(news&&Date.now()-newsAt<300000)return;
 newsLoading=(async()=>{try{
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),10000);
  const r=await fetch('https://www.td.gov.hk/en/special_news/trafficnews.xml',{cache:'no-store',signal:c.signal});clearTimeout(tm);
  if(!r.ok)throw 0;const doc=new DOMParser().parseFromString(await r.text(),'application/xml');
  const v=(m,k)=>(m.getElementsByTagName(k)[0]?.textContent||'').trim();
  news=[...doc.getElementsByTagName('message')].filter(m=>v(m,'INCIDENT_STATUS_EN').toUpperCase()!=='CLOSED').map(m=>{
   const both=k=>({en:v(m,k+'_EN'),tc:v(m,k+'_CN')});
   return {id:v(m,'INCIDENT_NUMBER')||v(m,'ID'),heading:both('INCIDENT_HEADING'),detail:both('INCIDENT_DETAIL'),place:both('LOCATION'),
    district:both('DISTRICT'),direction:both('DIRECTION'),content:both('CONTENT'),at:Date.parse(v(m,'ANNOUNCEMENT_DATE')+'+08:00')};})
   .sort((a,b)=>(b.at||0)-(a.at||0));
  newsAt=Date.now();
 }catch{}finally{newsLoading=null;}})();
 return newsLoading;
}
// The feed doesn't say which transport a notice is about: sort by what it mentions.
const MODES=[['mtr',/\bMTR\b|railway|train service|Light Rail|港鐵|鐵路|列車|輕鐵/i],['tram',/\btrams?\b|電車/i],
 ['ferry',/ferry service|ferry route|sailing|kai-?to|渡輪服務|渡輪航線|航班|街渡/i],['bus',/\bbus(es)?\b|minibus|public transport|巴士|小巴|公共交通/i]];
const modeOf=n=>{const all=[n.heading,n.detail,n.place,n.content].map(x=>x.en+' '+x.tc).join(' ');return (MODES.find(([,re])=>re.test(all))||['road'])[0];};
const ORDER=['bus','mtr','tram','ferry','road'];
const ROAD_ICON='<svg viewBox="0 0 32 32"><path d="M11 4 6 28M21 4l5 24M16 6v4m0 5v4m0 5v4"/></svg>';
const modeName=m=>m==='road'?T().roads:T()[m];
let newsOpen=false;
function newsGroups(){const g=new Map();for(const n of news||[]){const m=modeOf(n);if(!g.has(m))g.set(m,[]);g.get(m).push(n);}return ORDER.filter(m=>g.has(m)).map(m=>[m,g.get(m)]);}
function renderNews(){
 const el=$('traffic');if(!news){el.innerHTML='';return;}
 const t=T();
 if(!news.length){el.innerHTML='';showNews(false);return;}
 el.innerHTML=`<button class="traffic-card" type="button" aria-haspopup="dialog"><span class="tr-ic">🚦</span><span class="tr-sum"><b>${esc(t.traffic)} <span class="tr-n">${news.length}</span></b>`+
  `<small>${newsGroups().map(([m,l])=>`${esc(modeName(m))} ${l.length}`).join(' · ')}</small></span><span class="tr-chev">›</span></button>`;
 el.querySelector('button').addEventListener('click',()=>showNews(true));
 if(newsOpen)showNews(true);
}
function showNews(on){
 newsOpen=on;document.querySelectorAll('.tr-panel,.tr-shade').forEach(e=>e.remove());if(!on||!news?.length)return;
 const t=T(),L=x=>(tc()?x.tc||x.en:x.en||x.tc)||'';
 const time=at=>Number.isFinite(at)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at):'';
 const title=n=>[L(n.heading),L(n.detail)].filter(Boolean).join(' · ');
 const where=n=>[L(n.place),L(n.district),L(n.direction)].filter(Boolean).join(' · ');
 const shade=document.createElement('div');shade.className='tr-shade';shade.addEventListener('click',()=>showNews(false));
 const p=document.createElement('div');p.className='tr-panel';p.setAttribute('role','dialog');p.setAttribute('aria-label',t.traffic);
 p.innerHTML=`<div class="tr-top"><b>🚦 ${esc(t.traffic)}</b><button type="button" class="tr-close" aria-label="${esc(t.close)}">✕</button></div><div class="tr-body">`+
  newsGroups().map(([m,list])=>`<section class="tr-group"><h3><span class="ic ${m}">${m==='road'?ROAD_ICON:ICON[m]}</span>${esc(modeName(m))}<span class="tr-count">${list.length}</span></h3>`+
   list.map(n=>`<div class="tr-item"><div class="tr-head"><b>${esc(title(n))}</b><time>${esc(time(n.at))}</time></div>${where(n)?`<div class="tr-where">${esc(where(n))}</div>`:''}<p>${esc(L(n.content))}</p></div>`).join('')+`</section>`).join('')+
  `</div><div class="tr-src">${esc(t.trafficSrc)}</div>`;
 p.querySelector('.tr-close').addEventListener('click',()=>showNews(false));
 document.body.append(shade,p);
}
addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(newsOpen)showNews(false);});
async function refreshNews(){await loadNews();renderNews();}

// ---------------------------------------------------------------- page
function texts(){
 const t=T(),hl=tc()?'zh-Hant-HK':'en';if(document.documentElement.lang!==hl)document.documentElement.lang=hl;document.title=t.title;
 for(const [id,k] of [['busName','bus'],['mtrName','mtr'],['tramName','tram'],['ferryName','ferry'],['nearbyTitle','nearby'],['tabTrip','tripTab'],['locateLabel','locate'],['foot','foot'],['alertsName','alerts']])$(id).textContent=t[k];
 const h=hkNow().min;$('title').textContent=t.greet[h>=5*60&&h<12*60?0:h>=12*60&&h<18*60?1:2];
 $('today').textContent=new Intl.DateTimeFormat(tc()?'zh-HK':'en-GB',{timeZone:'Asia/Hong_Kong',day:'numeric',month:'long',weekday:'long'}).format(new Date());
 document.querySelectorAll('[data-lang]').forEach(b=>b.classList.toggle('on',b.dataset.lang===lang));
}
function refresh(){texts();renderTrip();renderNearby();renderFavs();refreshNews();}
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
document.addEventListener('click',e=>{const a=e.target.closest('a[data-set]');if(!a)return;
 try{const {key,merge}=JSON.parse(a.dataset.set);write(key,{...(read(key)||{}),...merge});}catch{}});
document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{lang=b.dataset.lang;write('dashboard_lang',lang);showSetup(false);refresh();}));
$('locateBtn').addEventListener('click',()=>locate(false));
// Back from an app, Safari may show this page from its cache: pick up changes made there.
addEventListener('pageshow',e=>{if(!e.persisted)return;const l=read('dashboard_lang');if(TEXT[l])lang=l;refresh();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')return;
 if(!here&&(locState==='denied'||locState==='fail'))autoLocate();refresh();});
setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);

texts();showTab(tab);renderTrip();renderNearby();renderFavs();refreshNews();autoLocate();
