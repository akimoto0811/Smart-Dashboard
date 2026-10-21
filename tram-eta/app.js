'use strict';
/* Tram ETA. Stops, routes, journey times and fares come from the Transport
   Department's open data (tram-data.json, rebuilt weekly). HK Tramways' live
   arrival feed does not allow other websites to read it, so no live times. */
const $=id=>document.getElementById(id);
const txt=(id,v)=>{const e=$(id);if(e)e.textContent=v};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PREFS='tram_prefs';

const TEXT={
 en:{home:'Dashboard',eyebrow:'HONG KONG · SMART DASHBOARD',heading:'Tram ETA',badge:'ROUTES & FARES',fromLabel:'From',toLabel:'To',locate:'Locate me',locating:'Finding you…',
  nearest:'Nearest stop',locateFail:'Location unavailable.',locateDenied:'Location permission is off.',journeyTitle:'Your tram trip',etaLabel:'JOURNEY TIME',min:'min',
  towards:'Towards',stops:n=>`${n} stop${n===1?'':'s'}`,adult:'adult',same:'Pick two different stops.',none:'No tram runs directly between these stops.',
  also:'Other trams',viaRoute:'Route',fare:'Flat fare',
  liveNote:'Live tram arrival times aren’t open to other apps, so this shows the routes, stops, journey time and fare from official data. Journey time is the timetabled average.',
  routesTitle:'Tram routes',routesHint:n=>`${n} routes`,official:'Schedules and fares on HK Tramways ↗',
  settingsTitle:'Settings',languageLabel:'Interface language',dataTitle:'Official data',aboutTitle:'About this dashboard',
  dataStatus:d=>`Stops, routes, journey times and fares updated ${d} from the Transport Department's public transport routes and fares data.`,
  about:'Fares are the adult Octopus or cash fare for any distance. JoyYou Card holders aged 60 to 64 pay $2.',
  loading:'Loading tram data…',loadFail:'Could not load tram data. Check your connection and reopen.',updated:d=>`Data ${d}`,nav:{journey:'Journey',routes:'Routes',settings:'Settings'}},
 tc:{home:'主頁',eyebrow:'香港 · 智能交通資訊',heading:'電車資訊',badge:'路線及車費',fromLabel:'由',toLabel:'往',locate:'定位',locating:'正在定位…',
  nearest:'最近車站',locateFail:'無法取得位置。',locateDenied:'未開啟定位權限。',journeyTitle:'電車行程',etaLabel:'行車時間',min:'分鐘',
  towards:'往',stops:n=>`${n} 個站`,adult:'成人',same:'請選擇兩個不同的車站。',none:'沒有電車直接來往這兩個車站。',
  also:'其他電車',viaRoute:'路線',fare:'劃一車費',
  liveNote:'電車實時到站時間未有開放給其他應用程式，因此這裡顯示官方資料中的路線、車站、行車時間及車費。行車時間為時間表平均值。',
  routesTitle:'電車路線',routesHint:n=>`${n} 條路線`,official:'香港電車網頁的班次及車費 ↗',
  settingsTitle:'設定',languageLabel:'介面語言',dataTitle:'官方資料',aboutTitle:'關於此資訊板',
  dataStatus:d=>`車站、路線、行車時間及車費於 ${d} 更新，資料來自運輸署公共交通路線及車費資料。`,
  about:'車費為任何距離的成人八達通或現金車費。持有樂悠卡的 60 至 64 歲乘客車費為 $2。',
  loading:'正在載入電車資料…',loadFail:'無法載入電車資料，請檢查網絡後重新開啟。',updated:d=>`資料 ${d}`,nav:{journey:'行程',routes:'路線',settings:'設定'}}};

let data=null;
const state={lang:'en',from:null,to:null};
try{Object.assign(state,JSON.parse(localStorage.getItem(PREFS)||'{}'))}catch{}
// The language picked on the dashboard menu (or in any app) wins.
try{const l=JSON.parse(localStorage.getItem('dashboard_lang'));if(TEXT[l])state.lang=l;}catch{}
if(!TEXT[state.lang])state.lang=navigator.language.startsWith('zh')?'tc':'en';
const T=()=>TEXT[state.lang];
const persist=()=>{try{localStorage.setItem(PREFS,JSON.stringify({lang:state.lang,from:state.from,to:state.to}))}catch{}};
const nm=o=>state.lang==='tc'?o.tc||o.en:o.en;
const stop=i=>nm(data.stops[i]);
const terminus=i=>stop(i).replace(/ Terminus$/,'').replace(/總站$/,'');
const routeName=r=>nm(r).replace(/ - /g,' – ');

function km(a,b){const r=x=>x*Math.PI/180,R=6371,dLat=r(b[0]-a[0]),dLng=r(b[1]-a[1]);
 const h=Math.sin(dLat/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
const dist=d=>d<1?`${Math.max(10,Math.round(d*100)*10)} m`:`${d.toFixed(1)} km`;
const byName=n=>data.stops.findIndex(s=>s.en===n);

function fillSelects(){
 const opts=data.stops.map((s,i)=>`<option value="${i}">${esc(nm(s))}</option>`).join('');
 $('fromSelect').innerHTML=opts;$('toSelect').innerHTML=opts;
 if(!(state.from in data.stops))state.from=Math.max(0,byName('Admiralty MTR Station'));
 if(!(state.to in data.stops))state.to=Math.max(0,byName('Causeway Bay Terminus'));
 $('fromSelect').value=String(state.from);$('toSelect').value=String(state.to);
}

// Every tram that runs from one stop to the other without changing.
function trips(from,to){
 const out=[];
 for(const r of data.routes)for(const d of r.dirs){
  const i=d.indexOf(from);if(i<0)continue;const j=d.indexOf(to,i+1);if(j<0)continue;
  out.push({r,end:d[d.length-1],stops:j-i,mins:Math.max(1,Math.round(r.mins*(j-i)/(d.length-1)))});}
 return out.sort((a,b)=>a.mins-b.mins||a.stops-b.stops);
}

function render(){
 if(!data)return;
 const t=T(),from=+state.from,to=+state.to;
 $('etaMain').classList.remove('empty');txt('etaLabel',t.etaLabel);
 const list=from===to?[]:trips(from,to);
 if(!list.length){
  $('etaMain').classList.add('empty');txt('etaNumber','—');txt('etaUnit','');txt('etaChip','—');
  $('etaDest').innerHTML=`${esc(from===to?t.same:t.none)}<small></small>`;$('tripList').innerHTML='';txt('journeyHint','');return;
 }
 const best=list[0];
 txt('etaNumber',String(best.mins));txt('etaUnit',t.min);txt('etaChip',`$${best.r.fare} ${t.adult}`);
 $('etaDest').innerHTML=`${esc(t.towards)} ${esc(terminus(best.end))}<small>${esc(t.stops(best.stops))} · ${esc(stop(from))} → ${esc(stop(to))}</small>`;
 txt('journeyHint',`${t.fare} $${best.r.fare}`);
 // One line per destination: the routes that serve this trip.
 const seen=new Set(),rows=list.filter(x=>{const k=x.end+'|'+x.r.id;if(seen.has(k))return false;seen.add(k);return true;});
 $('tripList').innerHTML=rows.map(x=>`<div class="trip"><span class="pip"></span><span class="label"><strong>${esc(t.towards)} ${esc(terminus(x.end))}</strong><small>${esc(t.viaRoute)}: ${esc(routeName(x.r))} · ${esc(t.stops(x.stops))}</small></span><span class="big">${x.mins} <small>${esc(t.min)}</small></span></div>`).join('');
}

function renderRoutes(){
 const t=T();txt('routesHint',t.routesHint(data.routes.length));
 $('routeList').innerHTML=data.routes.map(r=>`<details class="more"><summary><span>${esc(routeName(r))}<br><span class="hint">${r.mins} ${esc(t.min)} · $${r.fare}</span></span></summary>`+
  r.dirs.map(d=>`<div class="micro" style="margin-top:4px">${esc(t.towards)} ${esc(terminus(d[d.length-1]))} · ${esc(t.stops(d.length-1))}</div><div class="times">${d.map(i=>`<span>${esc(stop(i))}</span>`).join('')}</div>`).join('')+`</details>`).join('');
}

function texts(){
 const t=T();document.documentElement.lang=state.lang==='tc'?'zh-Hant-HK':'en';
 for(const [id,k] of [['homeLabel','home'],['eyebrow','eyebrow'],['heading','heading'],['badge','badge'],['fromLabel','fromLabel'],['toLabel','toLabel'],['locateLabel','locate'],
  ['journeyTitle','journeyTitle'],['liveNote','liveNote'],['routesTitle','routesTitle'],['officialLink','official'],['settingsTitle','settingsTitle'],['languageLabel','languageLabel'],
  ['dataTitle','dataTitle'],['aboutTitle','aboutTitle'],['aboutText','about']])txt(id,t[k]);
 $('officialLink').href=`https://www.hktramways.com/${state.lang==='tc'?'tc':'en'}/schedules-fares`;
 document.querySelectorAll('[data-nav]').forEach(e=>e.textContent=t.nav[e.dataset.nav]);
 document.querySelectorAll('[data-lang]').forEach(b=>b.classList.toggle('sel',b.dataset.lang===state.lang));
 if(data){txt('statusNote',t.updated(data.updated));txt('dataStatus',t.dataStatus(data.updated));}
}

function show(view){
 for(const v of ['journey','routes','settings'])$('view-'+v).classList.toggle('hidden',v!==view);
 document.querySelectorAll('.navitem').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 if(view==='routes')renderRoutes();scrollTo(0,0);}

async function autoLocate(){try{if((await navigator.permissions?.query({name:'geolocation'}))?.state==='denied')return;}catch{}locate(true);}
function locate(auto=false){
 const t=T(),note=$('locateNote');if(!navigator.geolocation){note.textContent=t.locateFail;return;}
 note.textContent=t.locating;
 navigator.geolocation.getCurrentPosition(pos=>{
  const here=[pos.coords.latitude,pos.coords.longitude];let best=null;
  data.stops.forEach((s,i)=>{const d=km(here,[s.lat,s.lng]);if(!best||d<best.d)best={i,d};});
  state.from=best.i;if(state.to===best.i)state.to=state.from===0?1:0;
  fillSelects();persist();render();
  note.textContent=`${t.nearest}: ${stop(best.i)} · ${dist(best.d)}`;
 },err=>{note.textContent=auto?'':err.code===1?t.locateDenied:t.locateFail;},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}

$('fromSelect').onchange=e=>{state.from=+e.target.value;persist();render();};
$('toSelect').onchange=e=>{state.to=+e.target.value;persist();render();};
$('swapBtn').onclick=()=>{[state.from,state.to]=[state.to,state.from];fillSelects();persist();render();};
$('locateBtn').onclick=()=>locate(false);
document.querySelectorAll('.navitem').forEach(b=>b.onclick=()=>show(b.dataset.view));
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{state.lang=b.dataset.lang;try{localStorage.setItem('dashboard_lang',JSON.stringify(state.lang))}catch{}persist();texts();fillSelects();render();renderRoutes();});

(async()=>{
 texts();txt('statusNote',T().loading);
 try{const r=await fetch('./tram-data.json?v=1.0.0',{cache:'no-cache'});if(!r.ok)throw 0;data=await r.json();}
 catch{txt('statusNote',T().loadFail);$('badge').classList.add('warning');return;}
 texts();fillSelects();render();autoLocate();
})();
