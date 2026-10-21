'use strict';
/* Ferry ETA. Timetables and fares come from the Transport Department's open data
   (ferry-data.json, rebuilt weekly); live positions from Sun Ferry and HKKF. */
const $=id=>document.getElementById(id);
const txt=(id,v)=>{const e=$(id);if(e)e.textContent=v};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PREFS='ferry_prefs';

const TEXT={
 en:{home:'Dashboard',eyebrow:'HONG KONG · SMART DASHBOARD',heading:'Ferry ETA',serviceLabel:'Ferry route',dirLabel:'Direction',locate:'Locate me',locating:'Finding you…',
  nearest:'Nearest pier',locateFail:'Location unavailable.',locateDenied:'Location permission is off.',nextTitle:'Next sailings',nextSailing:'NEXT SAILING',min:'min',
  departs:'Departs',tomorrow:'Tomorrow',noMore:'No more sailings today',noData:'No timetable data',every:'Every',minutes:'min',until:'until',from:'from',to:'To',
  services:'Ferry routes',kaitos:'Kaito (no timetable data)',kaitoNote:'This kaito route has no timetable in the open data. Check the Transport Department page for sailing times.',
  save:'☆ Save route',saved:'★ Saved',all:'All sailings today',hideAll:'Hide sailings',live:'On the water',left:'Left',arrives:'arrives',liveNone:'No sailings on the water right now.',
  timetable:'TIMETABLE',liveBadge:'LIVE + TIMETABLE',w:'Mon–Fri timetable',s:'Saturday timetable',h:'Sunday & public holiday timetable',
  faresTitle:'Fares',adult:'Adult single journey',journey:'Journey time about {m} min',trip:'{m} min trip',fareLabel:'ADULT FARE',fareNote:'Adult fares from the official fare table. Children, seniors and people with disabilities usually pay less.',
  tdLink:'Timetable and fares on the TD website ↗',noFares:'No fare table in the open data for this route.',today:'Today',
  favTitle:'Favourite routes',favCount:n=>`${n} saved`,favHelp:'Save a route from Next sailings for quick access.',favEmpty:'No favourites yet.',
  settingsTitle:'Settings',languageLabel:'Interface language',dataTitle:'Official data',aboutTitle:'About this dashboard',
  dataStatus:d=>`Timetables and fares updated ${d}, from the Transport Department's ferry schedules and The Star Ferry's open data. Live positions come from Sun Ferry and Hong Kong & Kowloon Ferry.`,
  about:'Domestic ferries and kaitos only; cross-boundary ferries are not included. Times are the published timetable, so a sailing can leave a little early or late. Always check notices at the pier.',
  loading:'Loading ferry data…',loadFail:'Could not load ferry data. Check your connection and reopen.',updated:d=>`Data ${d}`,
  days:{w:'Mon–Fri',ws:'Mon–Sat',s:'Sat',sh:'Sat, Sun & PH',h:'Sun & PH',wsh:'Daily'}},
 tc:{home:'主頁',eyebrow:'香港 · 智能交通資訊',heading:'渡輪班次',serviceLabel:'渡輪航線',dirLabel:'方向',locate:'定位',locating:'正在定位…',
  nearest:'最近碼頭',locateFail:'無法取得位置。',locateDenied:'未開啟定位權限。',nextTitle:'下一班船',nextSailing:'下一班',min:'分鐘',
  departs:'開出',tomorrow:'明天',noMore:'今日已無班次',noData:'沒有班次資料',every:'每',minutes:'分鐘一班',until:'直至',from:'由',to:'往',
  services:'渡輪航線',kaitos:'街渡（沒有班次資料）',kaitoNote:'此街渡航線沒有開放班次資料，請查閱運輸署網頁。',
  save:'☆ 收藏航線',saved:'★ 已收藏',all:'今日全部班次',hideAll:'收起班次',live:'航行中',left:'開出',arrives:'預計到達',liveNone:'目前沒有航行中的船。',
  timetable:'時間表',liveBadge:'實時 + 時間表',w:'星期一至五時間表',s:'星期六時間表',h:'星期日及公眾假期時間表',
  faresTitle:'船費',adult:'成人單程',journey:'航程約 {m} 分鐘',trip:'航程 {m} 分鐘',fareLabel:'成人船費',fareNote:'成人船費取自官方收費表。小童、長者及殘疾人士一般有優惠。',
  tdLink:'運輸署網頁的班次及收費 ↗',noFares:'開放資料沒有此航線的收費表。',today:'今日',
  favTitle:'收藏航線',favCount:n=>`已收藏 ${n} 條`,favHelp:'在「下一班船」收藏航線，方便快速查看。',favEmpty:'尚未收藏航線。',
  settingsTitle:'設定',languageLabel:'介面語言',dataTitle:'官方資料',aboutTitle:'關於此資訊板',
  dataStatus:d=>`班次及船費於 ${d} 更新，資料來自運輸署渡輪服務時間表及天星小輪開放資料。航行位置來自新渡輪及港九小輪。`,
  about:'只包括本地渡輪及街渡，不包括跨境渡輪。顯示的是公佈時間表，實際開船時間或會略有不同，請留意碼頭通告。',
  loading:'正在載入渡輪資料…',loadFail:'無法載入渡輪資料，請檢查網絡後重新開啟。',updated:d=>`資料 ${d}`,
  days:{w:'星期一至五',ws:'星期一至六',s:'星期六',sh:'星期六、日及假期',h:'星期日及假期',wsh:'每日'}}};

// Sun Ferry ETA route codes and HKKF route ids, by the places they sail between.
const SUN={CE:'Central',CC:'Cheung Chau',MW:'Mui Wo',NP:'North Point',HH:'Hung Hom',KC:'Kowloon City',PEC:'Peng Chau',MUW:'Mui Wo',CMW:'Chi Ma Wan',CHC:'Cheung Chau'};
const HKKF={1:['Central','Sok Kwu Wan'],2:['Central','Yung Shue Wan'],3:['Central','Peng Chau'],4:['Peng Chau','Hei Ling Chau']};

let data=null,live={key:'',rows:null,at:0};
const state={lang:'en',service:'',dir:0,view:'sailings',favourites:[],showAll:false};
try{Object.assign(state,JSON.parse(localStorage.getItem(PREFS)||'{}'))}catch{}
// The language picked on the dashboard menu (or in any app) wins.
try{const l=JSON.parse(localStorage.getItem('dashboard_lang'));if(TEXT[l])state.lang=l;}catch{}
if(!TEXT[state.lang])state.lang=navigator.language.startsWith('zh')?'tc':'en';
const T=()=>TEXT[state.lang];
const persist=()=>{try{localStorage.setItem(PREFS,JSON.stringify({lang:state.lang,service:state.service,dir:state.dir,favourites:state.favourites}))}catch{}};

const place=p=>state.lang==='tc'?(data.places[p]?.[0]||p):p;
const nm=o=>state.lang==='tc'?o.tc||o.en:o.en;
const svc=()=>state.service.startsWith('k:')?null:data.services.find(s=>s.id===state.service);
const kaito=()=>state.service.startsWith('k:')?data.kaito[+state.service.slice(2)]:null;
const dirName=d=>`${place(d.f)} → ${place(d.t)}${d.via?` (${state.lang==='tc'?'經':'via'} ${place(d.via)})`:''}`;
const hhmm=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

function hkNow(){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return {ymd:`${p.year}-${p.month}-${p.day}`,wd:p.weekday,min:+p.hour*60+ +p.minute};
}
function dayType(ymd,wd){return data.holidays.includes(ymd)||wd==='Sun'?'h':wd==='Sat'?'s':'w';}
function tomorrow(ymd){const d=new Date(ymd+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()+1);
 return {ymd:d.toISOString().slice(0,10),wd:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',weekday:'short'}).format(d)};}

function km(a,b){const r=x=>x*Math.PI/180,R=6371,dLat=r(b[0]-a[0]),dLng=r(b[1]-a[1]);
 const h=Math.sin(dLat/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
const dist=d=>d<1?`${Math.max(10,Math.round(d*100)*10)} m`:`${d.toFixed(1)} km`;

function fillSelects(){
 const t=T(),s=$('serviceSelect');
 s.innerHTML=`<optgroup label="${esc(t.services)}">${data.services.map(x=>`<option value="${x.id}">${esc(nm(x))}</option>`).join('')}</optgroup>`+
  `<optgroup label="${esc(t.kaitos)}">${data.kaito.map((k,i)=>`<option value="k:${i}">${esc(nm(k))}</option>`).join('')}</optgroup>`;
 if(!svc()&&!kaito())state.service=data.services[0].id;
 s.value=state.service;
 const sv=svc(),d=$('dirSelect');
 if(sv){if(state.dir>=sv.dirs.length)state.dir=0;d.disabled=false;d.innerHTML=sv.dirs.map((x,i)=>`<option value="${i}">${esc(dirName(x))}</option>`).join('');d.value=String(state.dir);}
 else{d.disabled=true;d.innerHTML=`<option>—</option>`;}
}

function upcoming(dir,now){
 const dt=dayType(now.ymd,now.wd),list=dir[dt]||[];
 if(dir.bands){const band=list.find(b=>now.min>=b[0]&&now.min<b[1])||list.find(b=>b[0]>now.min);return {dt,band,list};}
 const next=list.filter(m=>m>=now.min);
 if(next.length)return {dt,next,list};
 const tm=tomorrow(now.ymd),tdt=dayType(tm.ymd,tm.wd);
 return {dt,next:[],list,tomorrow:(dir[tdt]||[]).slice(0,3)};
}

function render(){
 if(!data)return;
 const t=T(),now=hkNow(),sv=svc(),k=kaito();
 $('etaMain').classList.remove('empty');$('etaChip').classList.remove('hidden');$('live').classList.add('hidden');
 txt('etaLabel',t.nextSailing);
 if(k){
  $('etaMain').classList.add('empty');txt('etaNumber',`$${k.fare}`);txt('etaUnit','');txt('etaChip',t.trip.replace('{m}',k.mins));txt('etaLabel',t.fareLabel);
  $('etaDest').innerHTML=`${esc(t.noData)}<small>${esc(t.kaitoNote)}</small>`;$('nextList').innerHTML='';txt('dayHint','');
  $('favBtn').classList.add('hidden');$('allBtn').classList.add('hidden');$('allTimes').classList.add('hidden');
  txt('badge',t.timetable);renderFares();return;
 }
 $('favBtn').classList.remove('hidden');$('allBtn').classList.remove('hidden');
 const dir=sv.dirs[state.dir],u=upcoming(dir,now);
 txt('dayHint',t[u.dt]);
 $('etaChip').classList.toggle('hidden',!sv.mins);txt('etaChip',t.trip.replace('{m}',sv.mins));
 $('etaDest').innerHTML=`${esc(t.to)} ${esc(place(dir.t))}<small>${esc(t.from)} ${esc(place(dir.f))}${dir.via?' · '+esc(place(dir.via)):''}</small>`;
 let boxes=[];
 if(dir.bands){
  if(u.band&&now.min>=u.band[0]){txt('etaNumber',u.band[2]);txt('etaUnit',t.min);txt('etaLabel',t.every.toUpperCase());
   boxes=[[`${t.until} ${hhmm(u.band[1])}`,'']];}
  else if(u.band){txt('etaNumber',hhmm(u.band[0]));txt('etaUnit','');boxes=[[t.every+' '+u.band[2]+' '+t.min,'']];}
  else{$('etaMain').classList.add('empty');txt('etaNumber',t.noMore);txt('etaUnit','');}
 }else if(u.next.length){
  const wait=u.next[0]-now.min;
  if(wait<60){txt('etaNumber',String(wait));txt('etaUnit',t.min);}else{txt('etaNumber',hhmm(u.next[0]));txt('etaUnit','');}
  boxes=u.next.slice(wait<60?0:1,(wait<60?0:1)+3).map(m=>[hhmm(m),`${m-now.min} ${t.min}`]);
 }else{
  $('etaMain').classList.add('empty');txt('etaNumber',t.noMore);txt('etaUnit','');
  boxes=(u.tomorrow||[]).map(m=>[hhmm(m),t.tomorrow]);
 }
 $('nextList').innerHTML=boxes.map(([a,b])=>`<div class="nextbox"><strong>${esc(a)}</strong>${b?`<small>${esc(b)}</small>`:''}</div>`).join('');
 const fav=state.favourites.some(f=>f.s===sv.id&&f.d===state.dir);txt('favBtn',fav?t.saved:t.save);
 txt('allBtn',state.showAll?t.hideAll:t.all);txt('allTitle',t.all);
 $('allTimes').classList.toggle('hidden',!state.showAll);$('allTimes').open=state.showAll;
 $('timesList').innerHTML=dir.bands?u.list.map(b=>`<span>${hhmm(b[0])}–${hhmm(b[1])} · ${esc(b[2])} ${t.min}</span>`).join('')
  :u.list.map(m=>`<span class="${m<now.min?'past':m===u.next[0]?'next':''}">${hhmm(m)}</span>`).join('');
 txt('badge',sv.live?t.liveBadge:t.timetable);
 renderLive();renderFares();
}

// Sailings already under way, from the operators' ETA feeds.
function liveSources(){
 const sv=svc();if(!sv?.live)return [];const d=sv.dirs[state.dir],out=[];
 for(const code of sv.live.sun||[]){const c=code.replace(/^II/,''),m=c.length===4?[c.slice(0,2),c.slice(2)]:[c.slice(0,3),c.slice(3)];
  if(SUN[m[0]]===d.f&&SUN[m[1]]===d.t)out.push({kind:'sun',url:`https://www.sunferry.com.hk/eta/?route=${code}`});}
 for(const id of [].concat(sv.live.hkkf||[])){const [a,b]=HKKF[id];
  if(a===d.f&&b===d.t)out.push({kind:'hkkf',url:`https://www.hkkfeta.com/opendata/eta/${id}/outbound`});
  if(b===d.f&&a===d.t)out.push({kind:'hkkf',url:`https://www.hkkfeta.com/opendata/eta/${id}/inbound`});}
 return out;
}
async function loadLive(force=false){
 const src=liveSources(),key=src.map(s=>s.url).join();
 if(!src.length){live={key,rows:null,at:0};return;}
 if(!force&&live.key===key&&Date.now()-live.at<30000)return;
 const rows=[];let ok=false;
 await Promise.all(src.map(async s=>{try{const r=await fetch(s.url,{cache:'no-store'});if(!r.ok)return;const j=await r.json();ok=true;
  for(const x of j.data||[]){
   if(s.kind==='sun')rows.push({left:x.depart_time,eta:x.eta||''});
   else rows.push({left:(x.session_time||'').slice(0,5),eta:(x.ETA||'').slice(11,16)});}}catch{}}));
 if(key!==liveSources().map(s=>s.url).join())return;
 live={key,rows:ok?rows.sort((a,b)=>a.left.localeCompare(b.left)):null,at:Date.now()};renderLive();
}
function renderLive(){
 const t=T(),el=$('live'),src=liveSources();
 if(!src.length||live.key!==src.map(s=>s.url).join()||!live.rows){el.classList.add('hidden');return;}
 el.classList.remove('hidden');
 el.innerHTML=`<div class="micro" style="margin-bottom:3px">${esc(t.live.toUpperCase())}</div>`+(live.rows.length?live.rows.map(r=>
  `<div class="live-row"><span>${esc(t.left)} ${esc(r.left)}</span>${r.eta?`<strong>${esc(t.arrives)} ${esc(r.eta)}</strong>`:''}</div>`).join(''):`<div class="live-row"><span>${esc(t.liveNone)}</span></div>`);
}

function renderFares(){
 const t=T(),sv=svc(),k=kaito(),now=hkNow(),dt=dayType(now.ymd,now.wd),item=sv||k;
 txt('faresRoute',nm(item));
 let rows=[];
 if(k)rows=[[t.adult,'',k.fare,true]];
 else rows=(sv.fares||[]).map(f=>[f.en||f.tc?(state.lang==='tc'?f.tc||f.en:f.en):t.adult,t.days[f.d]||'',f.fare,f.d.includes(dt)]);
 $('fareList').innerHTML=rows.length?rows.map(([label,days,fare,today])=>
  `<div class="listline"><div><strong>${esc(label)}</strong><br><span>${esc(days)}${today&&days?` · ${esc(t.today)}`:''}</span></div><div class="r"><strong style="color:${today?'var(--mint)':'inherit'}">$${Number(fare).toFixed(1)}</strong></div></div>`).join('')
  :`<div class="listline"><span>${esc(t.noFares)}</span></div>`;
 txt('fareNote',[item.mins?t.journey.replace('{m}',item.mins):'',t.fareNote].filter(Boolean).join(' · '));
 const link=state.lang==='tc'?item.link_tc:item.link_en;$('tdLink').classList.toggle('hidden',!link);if(link)$('tdLink').href=link;
 txt('tdLink',t.tdLink);
}

function renderFavourites(){
 const t=T(),list=state.favourites.filter(f=>data.services.some(s=>s.id===f.s));
 txt('favCount',t.favCount(list.length));
 $('favList').innerHTML=list.length?list.map((f,i)=>{const s=data.services.find(x=>x.id===f.s),d=s.dirs[f.d]||s.dirs[0];
  return `<button class="fav" data-fav="${i}" type="button"><span class="label"><strong>${esc(dirName(d))}</strong><small>${esc(nm(s))}</small></span><span class="arrow">›</span></button>`;}).join('')
  :`<div class="empty-note">${esc(t.favEmpty)}</div>`;
 $('favList').querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>{const f=list[+b.dataset.fav];state.service=f.s;state.dir=f.d;fillSelects();persist();show('sailings');refresh();});
}

function texts(){
 const t=T();document.documentElement.lang=state.lang==='tc'?'zh-Hant-HK':'en';
 for(const [id,k] of [['homeLabel','home'],['eyebrow','eyebrow'],['heading','heading'],['serviceLabel','serviceLabel'],['dirLabel','dirLabel'],['locateLabel','locate'],
  ['nextTitle','nextTitle'],['faresTitle','faresTitle'],['favTitle','favTitle'],['favHelp','favHelp'],['settingsTitle','settingsTitle'],['languageLabel','languageLabel'],
  ['dataTitle','dataTitle'],['aboutTitle','aboutTitle'],['aboutText','about']])txt(id,t[k]);
 document.querySelectorAll('[data-nav]').forEach(e=>e.textContent={sailings:state.lang==='tc'?'班次':'Sailings',fares:t.faresTitle,favourites:state.lang==='tc'?'收藏':'Favourites',settings:t.settingsTitle}[e.dataset.nav]);
 document.querySelectorAll('[data-lang]').forEach(b=>b.classList.toggle('sel',b.dataset.lang===state.lang));
 if(data){txt('statusNote',t.updated(data.updated));txt('dataStatus',t.dataStatus(data.updated));}
}

function show(view){state.view=view;
 for(const v of ['sailings','fares','favourites','settings'])$('view-'+v).classList.toggle('hidden',v!==view);
 document.querySelectorAll('.navitem').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 if(view==='favourites')renderFavourites();scrollTo(0,0);}

function refresh(force){render();loadLive(force).then(renderLive);}

async function autoLocate(){try{if((await navigator.permissions?.query({name:'geolocation'}))?.state==='denied')return;}catch{}locate(true);}
function locate(auto=false){
 const t=T(),note=$('locateNote');if(!navigator.geolocation){note.textContent=t.locateFail;return;}
 note.textContent=t.locating;
 navigator.geolocation.getCurrentPosition(pos=>{
  const here=[pos.coords.latitude,pos.coords.longitude];let best=null;
  for(const [p,v] of Object.entries(data.places)){if(v[1]==null)continue;const d=km(here,[v[1],v[2]]);if(!best||d<best.d)best={p,d};}
  if(!best){note.textContent=t.locateFail;return;}
  // Keep the chosen route when it sails from that pier, else take the first route that does.
  const from=s=>s.dirs.findIndex(d=>d.f===best.p),cur=svc();
  if(cur&&from(cur)>=0)state.dir=from(cur);
  else{const s=data.services.find(x=>from(x)>=0);if(s){state.service=s.id;state.dir=from(s);}}
  fillSelects();persist();refresh(true);
  note.textContent=`${t.nearest}: ${place(best.p)} · ${dist(best.d)}`;
 },err=>{note.textContent=auto?'':err.code===1?t.locateDenied:t.locateFail;},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}

function toast(m){const e=$('toast');e.textContent=m;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),2200);}

$('serviceSelect').onchange=e=>{state.service=e.target.value;state.dir=0;fillSelects();persist();refresh(true);};
$('dirSelect').onchange=e=>{state.dir=+e.target.value;persist();refresh(true);};
$('locateBtn').onclick=()=>locate(false);
$('allBtn').onclick=()=>{state.showAll=!state.showAll;render();if(state.showAll)$('allTimes').scrollIntoView({behavior:'smooth',block:'nearest'});};
$('favBtn').onclick=()=>{const sv=svc();if(!sv)return;const i=state.favourites.findIndex(f=>f.s===sv.id&&f.d===state.dir);
 if(i>=0)state.favourites.splice(i,1);else state.favourites.push({s:sv.id,d:state.dir});persist();render();toast(i>=0?'☆':'★ '+dirName(sv.dirs[state.dir]));};
document.querySelectorAll('.navitem').forEach(b=>b.onclick=()=>show(b.dataset.view));
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{state.lang=b.dataset.lang;try{localStorage.setItem('dashboard_lang',JSON.stringify(state.lang))}catch{}persist();texts();fillSelects();render();renderFavourites();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&data)refresh(true);});
setInterval(()=>{if(data&&document.visibilityState==='visible')refresh(false);},30000);

(async()=>{
 texts();txt('statusNote',T().loading);
 try{const r=await fetch('./ferry-data.json?v=1.0.0',{cache:'no-cache'});if(!r.ok)throw 0;data=await r.json();}
 catch{txt('statusNote',T().loadFail);$('badge').classList.add('warning');return;}
 texts();fillSelects();refresh(true);autoLocate();
})();
