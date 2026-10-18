'use strict';
/* HK Bus ETA 2.8. Route-discovery catalogue != authoritative operator route-stop list. */
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const storage = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const persist = (key, value) => {try {localStorage.setItem(key, JSON.stringify(value));return true;} catch {return false;}};
const operators = ['KMB','LWB','CTB'];
const names = {KMB:'KMB',LWB:'Long Win',CTB:'Citybus'};
const hkTime = () => new Intl.DateTimeFormat('en-HK',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
const hkDate = () => new Intl.DateTimeFormat(state.lang==='tc'?'zh-HK':'en-GB',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'long',day:'numeric'}).format(new Date());
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
const START_PAGES=['nearby','favourites','browse'];
const savedStartPage=storage('hkbus_start_page','nearby');
const state = {view:START_PAGES.includes(savedStartPage)?savedStartPage:'nearby',startPage:START_PAGES.includes(savedStartPage)?savedStartPage:'nearby',demo:false,catalogue:[],groups:[],catalogueDate:'',operator:'ALL',query:'',radius:450,position:null,nearby:[],favourites:storage('hkbus_favourites_v2',[]),currentGroup:null,currentStop:null,verified:[],routeFailures:[],loadingNames:0,busy:false,dialogToken:0,etas:new Map(),routeStops:new Map(),stopDetails:new Map(),routeOrientation:new Map(),routeOrientationPending:new Map(),notice:'',forceRefresh:false,lang:storage('hkbus_lang','en')==='tc'?'tc':'en',expandedStopKey:null,etaRequests:new Map(),locationRequested:false,stopLinkLookup:new Map(),stopLinkStatus:{loaded:false,error:'Mapping not loaded'}};
// UI translations only. Route numbers/IDs and stored JSON keys are never translated.
const UI_ZH = {
 'Hong Kong ·':'香港 ·', 'HONG KONG ·':'香港 ·',
 'Nearby':'附近','Nearby Stops':'附近巴士站','Favourites':'收藏','Routes':'路線','Settings':'設定',
 'Services around your location':'搜尋附近巴士路線','Your frequently used journeys':'常用巴士路線',
 'Find a Route':'搜尋路線','One entry per route and direction':'按路線及方向顯示','Catalogue, data and permissions':'資料及偏好設定',
 'LIVE MODE':'即時模式','DEMO PREVIEW':'示範模式','Go live':'使用即時資料','Preview UI':'預覽介面',
 'Sample data · not live':'示範資料 · 非即時','Routes and directions':'路線及方向','Route number or stop name':'路線號碼或巴士站名稱',
 'Showing matching routes and directions.':'顯示符合搜尋條件的路線及方向。',
 'No matching routes. Try another number or stop name.':'找不到符合的路線，請輸入其他路線號碼或站名。',
 'Showing the first 100 results; refine your search.':'只顯示首 100 項，請縮窄搜尋範圍。',
 'Enter a route number to find its direction and verified stops.':'輸入路線號碼，查找行車方向及已核實的巴士站。',
 'All':'全部','Inbound':'回程','Outbound':'去程','Long Win':'龍運','Citybus':'城巴','KMB':'九巴',
 'Nearby bus services':'附近巴士路線','Locate me':'定位','⌖ Locate me':'⌖ 定位','☆ Add favourite':'☆ 加入收藏','★ Remove favourite':'★ 移除收藏','↻ Refresh':'↻ 重新整理','Routes near you':'附近路線',
 'No routes yet. Allow Safari location access while in Hong Kong.':'暫未找到路線，請在香港使用時允許 Safari 讀取位置。',
 'Checking your location… Tap Locate me if needed':'正在定位… 如有需要請按「定位」',
 'Illustration only':'僅供示範','ETA':'到站時間','No ETA':'暫無預報','Error':'錯誤','Due':'即將到站',
 'Saved bus stops':'已收藏巴士站','Your chosen route, direction and boarding stop':'已儲存的路線、方向及上車站',
 'No favourites saved. Add one from Routes or Nearby.':'尚未收藏巴士站，可從「路線」或「附近」新增。',
 'Add a favourite':'新增收藏','Export backup':'匯出備份',
 'Preferences':'偏好設定','Choose your language and start page':'選擇介面語言及啟動畫面',
 'Interface language':'介面語言','English':'English','繁體中文':'繁體中文','Start page':'啟動畫面',
 'This page opens when you launch the dashboard. Your choice is saved on this device.':'每次開啟本網站都會先顯示所選頁面；設定只儲存在此裝置。',
 'Joint-route stop mapping':'聯營路線巴士站配對',
 'App information':'應用程式資訊','Bus data and maintenance':'巴士資料與維護',
 'Bus catalogue':'巴士站資料庫','Route-stop records':'路線與巴士站紀錄','Routes / directions':'路線／方向數目',
 'Last generated':'資料更新日期','Hong Kong time':'香港時間','Not loaded':'尚未載入',
 'Stop data is used for discovery. Official operator lists verify boarding stops.':'巴士站資料用於搜尋；上車站以巴士公司的官方路線資料核實。',
 'Import catalogue JSON':'匯入巴士站 JSON','Favourites backup':'收藏備份',
 'Favourites are stored in this browser. Export a backup before clearing Safari data or changing devices.':'收藏只儲存在此瀏覽器。清除 Safari 資料或更換裝置前請先匯出備份。',
 'Import favourites':'匯入收藏','Export favourites':'匯出收藏','Diagnostics':'系統診斷',
 'Live ETA uses the KMB and Citybus public APIs. API errors are shown rather than guessed.':'即時到站資料由九巴及城巴公開 API 提供；如有連線錯誤，會顯示錯誤而非猜測到站時間。',
 'Clear ETA cache':'清除到站快取','Clear favourites':'清除所有收藏',
 'Loading…':'載入中…','Loading stop name…':'正在載入站名…','Loading English name…':'正在載入英文站名…',
 'Stop name unavailable':'無法取得站名','Checking KMB / Citybus official stop lists…':'正在查閱九巴／城巴官方站點資料…',
 'Try again':'重試','Select your boarding stop':'選擇上車站',
 'No verified stops available for this service.':'此路線目前沒有已核實的巴士站。',
 'Upcoming bus arrivals':'即將抵站班次','Loading arrival predictions…':'正在載入到站預報…',
 'No ETA currently predicted for this verified stop.':'此站暫時沒有預計到站時間。',
 'Requesting real-time arrivals from official operators…':'正在向巴士公司取得即時到站資料…',
 'Demo sample only — arrival predictions are not live.':'僅供示範，非即時到站資料。',
 'No ETA predicted by the operator for this verified stop right now. This is not necessarily a cancelled service.':'巴士公司暫未提供此站的預計到站時間，並不代表服務取消。',
 'API unavailable:':'API 暫時無法使用：','Some operators unavailable:':'部分巴士公司資料暫時無法使用：',
 'Some operators could not be loaded:':'部分巴士公司資料無法載入：',
 'Cannot verify route stops:':'無法核實路線站點：','API request error:':'API 請求錯誤：',
 'Check your network or browser API permissions.':'請檢查網絡及瀏覽器 API 權限。',
 'Next bus arrivals · HK time':'下一班巴士 · 香港時間',
 'Other stops on this route':'此路線其他巴士站',
 'Add favourite':'加入收藏','Remove favourite':'移除收藏','Refresh':'重新整理',
 'min':'分鐘','now':'即將抵站','saved':'項已收藏',
 'Bus arrivals':'巴士到站','Your favourites':'我的收藏',
 'Import failed:':'匯入失敗：','Import catalogue failed:':'資料庫匯入失敗：',
 'GPS is not available. Open the HTTPS dashboard in Safari.':'無法使用 GPS，請以 Safari 開啟 HTTPS 網址。',
 'Requesting iPhone location…':'正在取得 iPhone 位置…',
 'Safari location permission denied.':'Safari 位置權限已被拒絕。',
 'Current position unavailable.':'無法取得目前位置。','Location request timed out.':'定位逾時。',
 'You appear to be outside Hong Kong; Nearby needs a Hong Kong GPS position.':'目前位置似乎不在香港；附近路線功能只支援香港。',
 'Location found. Loading the stop catalogue…':'已定位，正在載入巴士站資料…',
 'Demo mode uses illustrative arrival times.':'示範模式顯示模擬到站時間。',
 'Live mode active. Choose a route and boarding stop.':'已切換至即時模式，請選擇路線及上車站。',
 'Switch to Live mode to use GPS.':'請切換至即時模式以使用 GPS。',
 'Switch to Live mode to save favourites.':'請切換至即時模式以儲存收藏。',
 'ETA cache cleared.':'已清除到站快取。','Favourites cleared.':'已清除收藏。',
 'Favourites imported.':'已匯入收藏。','Stop catalogue':'巴士站資料庫',
 'Export':'匯出','Import':'匯入','Routes near you':'附近路線',
 'No routes found':'找不到路線', 'Bus stop':'巴士站','ETA ›':'到站 ›',
 'Remove all saved favourites on this browser?':'確定要刪除此瀏覽器所有收藏嗎？',
 'Refresh arrivals':'更新到站資料','Close':'關閉'
};
const UI_EN_FROM_ZH=Object.fromEntries(Object.entries(UI_ZH).map(([en,zh])=>[zh,en]));
function translatePhrase(s){
 const t=s.trim(); if(!t)return s;
 const lookup=(v)=>state.lang==='tc'?UI_ZH[v]:UI_EN_FROM_ZH[v];
 let translated=lookup(t);
 if(!translated && state.lang==='tc'){
  const rules=[
   [/^HONG KONG · (.+)$/,(m,date)=>'香港 · '+date],
   [/^HK time (.+)$/,(m,v)=>'香港時間 '+v],
   [/^(\d+) grouped results?$/,(m,n)=>n+' 個路線組合'],
   [/^(Outbound|Inbound) · (\d+) stop records$/,(m,d,n)=>(UI_ZH[d]||d)+' · '+n+' 個站點紀錄'],
   [/^(Outbound|Inbound)$/,(m,d)=>UI_ZH[d]],
   [/^(\d+) route \/ direction groups$/,(m,n)=>n+' 組路線／方向'],
   [/^(\d+) nearby route-stop entries$/,(m,n)=>n+' 項附近巴士站紀錄'],
   [/^GPS accuracy ±(\d+)m · (\d+) (?:matching |nearby )?route-stop entries$/,(m,n,z)=>'GPS 精確度 ±'+n+' 米 · '+z+' 項巴士站紀錄'],
   [/^(\d+) stop names are being verified in the background\.$/,(m,n)=>'正在背景核實 '+n+' 個站名。'],
   [/^(\d+) saved$/,(m,n)=>n+' 項已收藏'],
   [/^(\d+) m$/,(m,n)=>n+' 米'],
   [/^ · (\d+) m$/,(m,n)=>' · '+n+' 米'],
   [/^(\d+) min$/,(m,n)=>n+' 分鐘'],
   [/^(.+) · Select your boarding stop$/,(m,d)=>d+' · 選擇上車站'],
   [/^(.+) · (Outbound|Inbound)$/,(m,a,d)=>a+' · '+UI_ZH[d]],
   [/^(.+) · (Outbound|Inbound) · (.*)$/,(m,a,d,b)=>a+' · '+UI_ZH[d]+' · '+b],
   [/^Some operators could not be loaded: (.*)$/,(m,x)=>'部分巴士公司資料無法載入：'+x],
   [/^No ETA currently predicted for this verified stop\.$/,(m)=>UI_ZH[m]],
   [/^([\d,]+) route-stop records imported\.$/,(m,n)=>'已匯入 '+n+' 項站點紀錄。'],
   [/^Imported ([\d,]+) route-stop records\.$/,(m,n)=>'已匯入 '+n+' 項站點紀錄。']
  ];
  for(const [p,fun] of rules){const found=t.match(p);if(found){translated=fun(...found);break;}}
  if(!translated) {
   const partials=[[' · HK time ',' · 香港時間 '],[' · Outbound',' · 去程'],[' · Inbound',' · 回程'],[' · Citybus',' · 城巴'],[' · Long Win',' · 龍運'],[' stop records',' 個站點紀錄'],[' m away',' 米']];
   let adjusted=t;
   for(const [en,zh] of partials)adjusted=adjusted.replaceAll(en,zh);
   if(adjusted!==t)translated=adjusted;
  }
 }
 if(!translated)return s;
 const front=s.slice(0,s.indexOf(t));return front+translated+s.slice(s.indexOf(t)+t.length);
}
function localizeDocument(){
 document.documentElement.lang=state.lang==='tc'?'zh-Hant-HK':'en';
 for(const root of [document.querySelector('.app-shell'),document.querySelector('#modalScrim')]){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let n;
  while((n=walker.nextNode())){
   if(n.parentElement?.closest('script,style,input,textarea'))continue;
   const updated=translatePhrase(n.nodeValue);
   if(n.nodeValue!==updated)n.nodeValue=updated;
  }
  for(const el of root.querySelectorAll('[placeholder],[aria-label],[title]')){
   for(const attr of ['placeholder','aria-label','title'])if(el.hasAttribute(attr)){
    const old=el.getAttribute(attr),value=translatePhrase(old);
    if(value!==old)el.setAttribute(attr,value);
   }
  }
 }
}
let i18nQueued=false;
const i18nObserver=new MutationObserver(()=>{
 if(state.lang!=='tc')return;
 if(i18nQueued)return;
 i18nQueued=true;
 queueMicrotask(()=>{i18nQueued=false;localizeDocument()});
});
i18nObserver.observe(document.body,{subtree:true,childList:true,characterData:true});

state.favourites = Array.isArray(state.favourites)?state.favourites:[];
function normalize(input){
 if(!input || typeof input!=='object')return null;
 const operator=clean(input.operator),route=clean(input.route),direction=clean(input.direction||'O').slice(0,1),stop_id=clean(input.stop_id||input.stop),service_type=String(input.service_type||input.serviceType||'1');
 if(!operators.includes(operator)||!/^\d{1,3}[A-Z]{0,2}$|^[A-Z]{1,3}\d{1,3}[A-Z]?$/.test(route)||!['O','I'].includes(direction)||!/^[0-9]{1,3}$/.test(service_type))return null;
 if(operator==='CTB'?!/^\d{6}$/.test(stop_id):!/^[0-9A-F]{16}$/.test(stop_id))return null;
 const lat=latlon(input.lat),lng=latlon(input.lng??input.long);
 return {operator,route,direction,stop_id,service_type,name:String(input.name||input.stop_name||'Bus stop'),name_en:String(input.name_en||''),name_tc:String(input.name_tc||input.name||''),shared_stop_id:String(input.shared_stop_id||''),destination:String(input.destination||input.dest||''),destination_en:String(input.destination_en||''),destination_tc:String(input.destination_tc||input.destination||''),lat,lng};
}
const localizedStop = x => state.lang==='en'?(x.name_en||(/[^\u0000-\u007F]/.test(x.name||'')?'Loading English name…':x.name)||'Stop name unavailable'):(x.name_tc||x.name||'巴士站');
const localizedDestination = x => state.lang==='en'?(x.destination_en||x.destination||'Destination'):(x.destination_tc||x.destination||'目的地');
function enrichedRecord(input,extra){return {...input,...extra,name_en:extra.name_en||input.name_en||'',name_tc:extra.name_tc||input.name_tc||input.name||''};}
function uniqueCatalogue(rows){const map=new Map();for(const raw of rows){const it=normalize(raw);if(it)map.set(itemID(it),it);}return [...map.values()];}
function normalizeCatalogue(json){if(Array.isArray(json.entries))return uniqueCatalogue(json.entries);
 if(json.routes&&json.cells){const coords=new Map();for(const [cell,labels] of Object.entries(json.cells)){const [a,b]=cell.split('_').map(Number);for(const label of labels||[])if(!coords.has(label))coords.set(label,[(a+.5)/100,(b+.5)/100]);}return uniqueCatalogue(Object.entries(json.routes).map(([key,it])=>({...it,name:key.split(' · ').at(-1)||'Stop',lat:coords.get(key)?.[0],lng:coords.get(key)?.[1]})));}
 throw Error('Unsupported catalogue format. Generate catalogue.json using make_catalogue.py');}
// Public operators do not consistently use O/I for the same physical journey.
// For joint routes, never merge opposite operator directions without verification.
function physicalDirection(it, routeOps){
 const mapped=state.routeOrientation.get(it.route)?.mapping?.[it.operator]?.[it.direction];
 if(mapped)return mapped;
 if(routeOps?.has('KMB')&&routeOps.has('CTB'))return it.operator+'_'+it.direction;
 return it.direction;
}
function makeGroups(items){
 const routeOps=new Map();
 for(const it of items){if(!routeOps.has(it.route))routeOps.set(it.route,new Set());routeOps.get(it.route).add(it.operator);}
 const groups=new Map();
 for(const it of items){const direction=physicalDirection(it,routeOps.get(it.route)),key=it.route+'|'+direction;
  let g=groups.get(key);if(!g){g={key,route:it.route,direction,items:[],operators:new Set(),destCounts:new Map()};groups.set(key,g);}
  g.items.push(it);g.operators.add(it.operator);
  const dest=it.destination.trim();if(dest)g.destCounts.set(dest,(g.destCounts.get(dest)||0)+1);
 }
 return [...groups.values()].map(g=>{
  const metadata=state.routeOrientation.get(g.route)?.destinations?.[g.direction];
  const fallback=[...g.destCounts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'Destination unavailable';
  const unverified=routeOps.get(g.route)?.has('KMB')&&routeOps.get(g.route)?.has('CTB');
  return {...g,operators:[...g.operators].sort(),
   destination:metadata?.tc||(unverified?'Checking official destination…':fallback),
   destination_en:metadata?.en||(unverified?'Verifying destination…':g.items.find(x=>x.destination_en)?.destination_en||''),
   destination_tc:metadata?.tc||(unverified?'正在核實目的地…':g.items.find(x=>x.destination_tc)?.destination_tc||''),
   stopCount:new Set(g.items.map(x=>x.operator+'|'+x.stop_id)).size};
 }).sort((a,b)=>a.route.localeCompare(b.route,'en',{numeric:true})||(a.direction===b.direction?0:a.direction==='O'?-1:b.direction==='O'?1:a.direction==='I'?-1:1));
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
   return variants.length?{route:variants[0].route,direction:variants[0].direction,destination:String(f.destination||''),destination_en:String(f.destination_en||''),destination_tc:String(f.destination_tc||''),name:String(f.name||variants[0].name),name_en:String(f.name_en||variants[0].name_en||''),name_tc:String(f.name_tc||variants[0].name_tc||''),variants}:null;
  }
  const item=normalize(f);return item?{route:item.route,direction:item.direction,destination:item.destination,destination_en:item.destination_en,destination_tc:item.destination_tc,name:item.name,name_en:item.name_en,name_tc:item.name_tc,variants:[item]}:null;
 }).filter(Boolean);
}
restoreFavs();
const banner = msg => {state.notice=msg;const el=$('#notice');el.textContent=msg;el.classList.toggle('hidden',!msg);};
const line = (title,desc) => `<div class="section-title">${esc(title)}</div>${desc?`<div class="section-sub">${esc(desc)}</div>`:''}`;
const operatorChips = ops => `<span class="operators">${ops.map(x=>`<span class="operator-chip">${esc(names[x]||x)}</span>`).join('')}</span>`;
function groupRows(groups){return groups.map((g,i)=>`<button class="route-group" data-action="openGroup" data-group="${esc(g.key)}">
 <span class="arrival-bus">${esc(g.route)}</span><span class="group-info"><strong>${esc(localizedDestination(g))}</strong><span class="group-meta">${g.direction==='O'?'Outbound':'Inbound'} · ${fmt(g.stopCount)} stop records</span>${operatorChips(g.operators)}</span><span class="group-arrow">›</span></button>`).join('');}
function favouriteRows(){const arr=state.demo?demoStops:state.favourites;return arr.map((f,i)=>`<button class="route-group" data-action="openFavourite" data-index="${i}"><span class="arrival-bus">${esc(f.route)}</span><span class="group-info"><strong>${esc(localizedDestination(f))}</strong><span class="group-meta">${esc(localizedStop(f))} · ${f.direction==='O'?'Outbound':'Inbound'}</span>${operatorChips([...new Set(f.variants.map(x=>x.operator))])}</span><span class="group-arrow">›</span></button>`).join('');}
function favourites(){const fs=state.demo?demoStops:state.favourites;return `${line('Saved bus stops','Your chosen route, direction and boarding stop')}<div class="card no-gap">${fs.length?favouriteRows():'<div class="empty">No favourites saved. Add one from Routes or Nearby.</div>'}</div><div class="buttons"><button class="primary-button" data-view="browse">Add a favourite</button><button class="ghost-button" data-action="exportFav">Export backup</button></div>`;}
function browse(){const q=state.query.trim(), groups=q?routeResults():[], exact=q&&groups.length>0&&groups.every(g=>g.route===clean(q));
 return `<div class="card search-card"><label class="card-title" for="routeSearch">Route number or stop name</label><input id="routeSearch" class="field" autocomplete="off" enterkeyhint="search" placeholder="e.g. 102 or Central" value="${esc(state.query)}"/>${q&&!exact?'<p class="small-note search-hint">Showing matching routes and directions.</p>':''}</div><div class="operator-row route-filters">${['ALL',...operators].map(op=>`<button data-action="filterOp" data-value="${op}" class="${state.operator===op?'selected':''}">${op==='ALL'?'All':esc(op)}</button>`).join('')}</div><section id="routeResults" class="route-results">${q?`${line('Routes and directions',`${fmt(groups.length)} grouped result${groups.length===1?'':'s'}`)}<div class="card no-gap">${groups.length?groupRows(groups.slice(0,100)):'<div class="empty">No matching routes. Try another number or stop name.</div>'}</div>${groups.length>100?'<p class="small-note">Showing the first 100 results; refine your search.</p>':''}`:'<div class="search-empty">Enter a route number to find its direction and verified stops.</div>'}</section>`;}
function nearby(){const candidates=state.demo?demoStops.flatMap(f=>f.variants):state.nearby;
 const groups=makeGroups(candidates);groups.forEach(g=>{g.nearestDistance=Math.min(...g.items.map(x=>state.position&&goodPosition(x)?distance(state.position.lat,state.position.lng,x.lat,x.lng):Infinity));});groups.sort((a,b)=>(a.nearestDistance??Infinity)-(b.nearestDistance??Infinity));
 return `<div class="card nearby-controls"><div class="nearby-heading">Nearby bus services</div><div class="input-row"><select class="select" id="radiusSelect">${[300,450,800,1200].map(n=>`<option value="${n}" ${n===state.radius?'selected':''}>${n} m</option>`).join('')}</select><button class="primary-button" data-action="locate"><span aria-hidden="true">⌖</span> <span>Locate me</span></button></div>${state.position?`<p class="small-note">GPS accuracy ±${Math.round(state.position.accuracy)}m · ${fmt(candidates.length)} nearby route-stop entries</p>`:''}</div>${line('Routes near you',state.demo?'Illustration only':state.position?`${fmt(groups.length)} route / direction groups`:'Checking your location… Tap Locate me if needed')}<div class="card no-gap">${groups.length?groupRows(groups.slice(0,90)):'<div class="empty">No routes yet. Allow Safari location access while in Hong Kong.</div>'}</div>`;}
function settings(){return `${line('Preferences','Choose your language and start page')}
 <div class="card settings-preferences"><div class="card-title">Interface language</div><div class="settings-options"><button class="ghost-button ${state.lang==='en'?'selected-language':''}" data-action="setLanguage" data-value="en">English</button><button class="ghost-button ${state.lang==='tc'?'selected-language':''}" data-action="setLanguage" data-value="tc">繁體中文</button></div>
 <div class="card-title settings-label">Start page</div><div class="settings-options settings-start">${[['nearby','Nearby'],['favourites','Favourites'],['browse','Routes']].map(([id,label])=>`<button class="ghost-button ${state.startPage===id?'selected-language':''}" data-action="setStartPage" data-value="${id}">${label}</button>`).join('')}</div><p class="small-note">This page opens when you launch the dashboard. Your choice is saved on this device.</p></div>
 ${line('App information','Bus data and maintenance')}
 <div class="card"><div class="card-title">Joint-route stop mapping</div><p class="small-note">${state.stopLinkStatus.loaded?(state.lang==='tc'?`${fmt(state.stopLinkStatus.coverage.mapped_routes)} / ${fmt(state.stopLinkStatus.coverage.discovered_joint_routes)} 條聯營路線 · ${fmt(state.stopLinkStatus.coverage.accepted_stop_pairs)} 組跨公司巴士站配對 · ${fmt(state.stopLinkStatus.coverage.unresolved_routes)} 條未能確認`:`${fmt(state.stopLinkStatus.coverage.mapped_routes)} / ${fmt(state.stopLinkStatus.coverage.discovered_joint_routes)} joint routes · ${fmt(state.stopLinkStatus.coverage.accepted_stop_pairs)} operator stop pairs · ${fmt(state.stopLinkStatus.coverage.unresolved_routes)} unresolved`):(state.lang==='tc'?'尚未載入配對資料 — 使用保守配對模式 (':'Not loaded — using conservative matching (')+esc(state.stopLinkStatus.error||'Check stop-links.json')+')'}</p></div>
 <div class="card"><div class="card-title">Bus catalogue</div><div class="stat-grid"><div class="stat"><div class="label">Route-stop records</div><div class="value">${fmt(state.catalogue.length)}</div></div><div class="stat"><div class="label">Routes / directions</div><div class="value">${fmt(state.groups.length)}</div></div><div class="stat"><div class="label">Last generated</div><div class="value muted" style="font-size:16px">${esc(state.catalogueDate||'Not loaded')}</div></div><div class="stat"><div class="label">Hong Kong time</div><div class="value muted" style="font-size:16px">${esc(hkTime())}</div></div></div><p class="small-note">Stop data is used for discovery. Official operator lists verify boarding stops.</p><button class="ghost-button" data-action="importCat">Import catalogue JSON</button></div>
 <div class="card"><div class="card-title">Favourites backup</div><p class="small-note">Favourites are stored in this browser. Export a backup before clearing Safari data or changing devices.</p><div class="buttons"><button class="primary-button" data-action="importFav">Import favourites</button><button class="ghost-button" data-action="exportFav">Export favourites</button></div><p class="small-note">${fmt(state.favourites.length)} saved</p></div>
 <div class="card"><div class="card-title">Diagnostics</div><p class="small-note">Live ETA uses the KMB and Citybus public APIs. API errors are shown rather than guessed.</p><div class="buttons"><button class="ghost-button" data-action="clearETAs">Clear ETA cache</button><button class="ghost-button" data-action="clearFav">Clear favourites</button></div></div>`;}
function render(){const titles={favourites:['Favourites','Your frequently used journeys'],nearby:['Nearby Stops','Services around your location'],browse:['Find a Route','One entry per route and direction'],settings:['Settings','Catalogue, data and permissions']};
 const [title,desc]=titles[state.view];$('#pageTitle').textContent=title;$('#pageCaption').textContent=desc;
 $('#todayLabel').textContent='HONG KONG · '+hkDate().toUpperCase();$('#modeBadge').textContent='LIVE MODE';$('#modeBadge').classList.remove('demo');$('#syncLabel').textContent='HK time '+hkTime();
 document.querySelectorAll('.nav-btn').forEach(el=>el.classList.toggle('selected',el.dataset.view===state.view));
 $('#mainContent').innerHTML=({favourites,nearby,browse,settings}[state.view]||nearby)();document.body.classList.toggle('route-view',state.view==='browse');document.body.classList.toggle('exact-route',state.view==='browse'&&!!state.query.trim()&&routeResults().length>0&&routeResults().every(g=>g.route===clean(state.query)));localizeDocument();}
function setView(view){state.view=view;banner('');render();scrollTo({top:0,behavior:'instant'});if(view==='nearby'&&!state.demo&&state.catalogue.length){if(state.position)populateNearby();else locate();}}
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
// Resolve official destinations. KMB O/I and Citybus O/I sometimes refer to
// opposite physical directions (e.g. route 680). The first-stop coordinates
// determine whether to swap CTB's direction, not matching the letters O/I.
const ROUTE_DIRECTION_STORAGE='hkbus_physical_direction_v1';
const routeDirectionStored=storage(ROUTE_DIRECTION_STORAGE,{});
if(routeDirectionStored&&typeof routeDirectionStored==='object'){
 for(const [route,info] of Object.entries(routeDirectionStored))
  if(info?.verifiedAt&&Date.now()-info.verifiedAt<86400000&&info.mapping&&info.destinations)
   state.routeOrientation.set(route,info);
}
function officialRouteURL(op,route,dir,service='1'){
 return op==='CTB'?'https://rt.data.gov.hk/v2/transport/citybus/route/CTB/'+encodeURIComponent(route):
  'https://data.etabus.gov.hk/v1/transport/kmb/route/'+encodeURIComponent(route)+'/'+(dir==='I'?'inbound':'outbound')+'/'+encodeURIComponent(service);
}
function routeDest(op,data,dir){
 if(!data)return null;
 if(op==='CTB'&&dir==='I')return {en:data.orig_en||'',tc:data.orig_tc||''};
 return {en:data.dest_en||'',tc:data.dest_tc||''};
}
async function ensurePhysicalRoute(route){
 if(!route||!state.catalogue.some(x=>x.route===route))return null;
 if(state.routeOrientation.has(route))return state.routeOrientation.get(route);
 if(state.routeOrientationPending.has(route))return state.routeOrientationPending.get(route);
 const task=(async()=>{
  const entries=state.catalogue.filter(x=>x.route===route);
  const ops=new Set(entries.map(x=>x.operator));
  const main=ops.has('KMB')?'KMB':ops.has('LWB')?'LWB':'CTB';
  const service=entries.find(x=>x.operator===main)?.service_type||'1';
  const routeInfo=async(op,d)=>{try{const res=await requestJSON(officialRouteURL(op,route,d,service),10000);return res.data||null}catch{return null}};
  const [outInfo,inInfo,ctbInfo]=await Promise.all([
   main==='CTB'?routeInfo('CTB','O'):routeInfo(main,'O'),
   main==='CTB'?routeInfo('CTB','I'):routeInfo(main,'I'),
   ops.has('CTB')&&main!=='CTB'?routeInfo('CTB','O'):Promise.resolve(null)
  ]);
  const mapping={};for(const op of ops)mapping[op]={O:'O',I:'I'};
  let separated=false;
  if(ops.has('CTB')&&main!=='CTB'){
   try{
    const [mainStops,ctbOStops,ctbIStops]=await Promise.all([
     getOfficialStops(main,route,'O',service),getOfficialStops('CTB',route,'O','1'),getOfficialStops('CTB',route,'I','1')]);
    if(!mainStops.length||!ctbOStops.length||!ctbIStops.length)throw Error('Route endpoints not supplied');
    const [firstMain,firstCTBO,firstCTBI]=await Promise.all([
     getStopDetails(mainStops[0]),getStopDetails(ctbOStops[0]),getStopDetails(ctbIStops[0])]);
    if(!goodPosition(firstMain)||!goodPosition(firstCTBO)||!goodPosition(firstCTBI))throw Error('No verified route terminal coordinates');
    const oDist=distance(firstMain.lat,firstMain.lng,firstCTBO.lat,firstCTBO.lng);
    const iDist=distance(firstMain.lat,firstMain.lng,firstCTBI.lat,firstCTBI.lng);
    if(Math.min(oDist,iDist)>1800||Math.abs(oDist-iDist)<350)throw Error('Terminal direction mapping ambiguous');
    if(iDist<oDist)mapping.CTB={O:'I',I:'O'};
   }catch{
    // Never mix opposite routes if matching cannot be established.
    separated=true;mapping.CTB={O:'CTB_O',I:'CTB_I'};
   }
  }
  const directions={O:routeDest(main,outInfo,'O'),I:routeDest(main,inInfo,'I')};
  if(main==='CTB'){directions.O=routeDest('CTB',outInfo,'O');directions.I=routeDest('CTB',inInfo,'I');}
  if(ops.has('CTB')&&main!=='CTB'&&ctbInfo&&separated){
   directions.CTB_O=routeDest('CTB',ctbInfo,'O');directions.CTB_I=routeDest('CTB',ctbInfo,'I');
  }
  // If authoritative metadata is unavailable, do not invent destinations.
  for(const [dir,name] of Object.entries(directions))if(!name?.en&&!name?.tc)directions[dir]={en:'Destination unavailable',tc:'目的地資料暫缺'};
  const info={mapping,destinations:directions,verifiedAt:Date.now(),separated};
  state.routeOrientation.set(route,info);
  const saved=storage(ROUTE_DIRECTION_STORAGE,{});if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
   saved[route]=info;const keys=Object.keys(saved);
   if(keys.length>100){keys.sort((a,b)=>saved[a].verifiedAt-saved[b].verifiedAt);for(const k of keys.slice(0,keys.length-100))delete saved[k];}
   persist(ROUTE_DIRECTION_STORAGE,saved);
  }
  state.groups=makeGroups(state.catalogue);
  if(state.view==='browse'||state.view==='nearby')render();
  return info;
 })();
 state.routeOrientationPending.set(route,task);
 try{return await task}finally{state.routeOrientationPending.delete(route)}
}
// Successfully resolved stop names can be re-used across routes and browsing sessions.
const STOP_DETAILS_STORE='hkbus_official_stop_details_v2';
const STOP_DETAILS_LIMIT=650;
const stopDetailCache=storage(STOP_DETAILS_STORE,{});
if(!stopDetailCache||typeof stopDetailCache!=='object'||Array.isArray(stopDetailCache)){} // malformed entries ignored when read
function saveStopDetail(key,record){
 if(!record || !record.name)return;
 const data=storage(STOP_DETAILS_STORE,{}),value=data&&typeof data==='object'&&!Array.isArray(data)?data:{};
 value[key]={name:record.name,name_en:record.name_en||'',name_tc:record.name_tc||record.name,lat:record.lat,lng:record.lng,at:Date.now()};
 const keys=Object.keys(value);if(keys.length>STOP_DETAILS_LIMIT){keys.sort((a,b)=>(value[a].at||0)-(value[b].at||0));for(const k of keys.slice(0,keys.length-STOP_DETAILS_LIMIT))delete value[k];}
 persist(STOP_DETAILS_STORE,value);
}
function cachedStopDetail(key){
 const v=stopDetailCache&&typeof stopDetailCache==='object'?stopDetailCache[key]:null;
 if(!v || !v.at || Date.now()-v.at>14*86400000 || !v.name)return null;
 return {name:v.name,name_en:v.name_en||'',name_tc:v.name_tc||v.name,lat:latlon(v.lat),lng:latlon(v.lng)};
}
const stopNameURL = it => it.operator==='CTB'?`https://rt.data.gov.hk/v2/transport/citybus/stop/${it.stop_id}`:`https://data.etabus.gov.hk/v1/transport/kmb/stop/${it.stop_id}`;
async function getStopDetails(it){const key=it.operator+'|'+it.stop_id;
 if(state.stopDetails.has(key))return state.stopDetails.get(key);
 const cached=cachedStopDetail(key);
 if(cached){const promise=Promise.resolve({...it,...cached});state.stopDetails.set(key,promise);return promise;}
 const task=(async()=>{const j=await requestJSON(stopNameURL(it),8500),d=j.data;if(!d)throw Error('Missing stop details for '+key);
 const lat=latlon(d.lat),lng=latlon(d.long??d.lng);
 const record={...it,name:String(d.name_tc||d.name_en||'Stop '+it.stop_id),name_en:String(d.name_en||''),name_tc:String(d.name_tc||''),lat,lng};
 saveStopDetail(key,record);return record;})();
 state.stopDetails.set(key,task);task.catch(()=>{if(state.stopDetails.get(key)===task)state.stopDetails.delete(key)});return task;}
async function officialGroup(g){
 const ops=g.operators || [...new Set(g.items.map(i=>i.operator))];
 const jobs=[];for(const op of ops){const candidates=g.items.filter(i=>i.operator===op),services=op==='CTB'?['1']:[...new Set(candidates.map(i=>i.service_type||'1'))].slice(0,4);
   for(const service of services)jobs.push({op,service,direction:candidates[0]?.direction||g.direction});}
 const settled=await Promise.all(jobs.map(async job=>{try{return {job,stops:await getOfficialStops(job.op,g.route,job.direction,job.service)}}catch(e){return {job,error:e.message}}}));
 const warnings=settled.filter(z=>z.error).map(z=>z.job.op+': '+z.error),raw=settled.flatMap(z=>z.stops||[]);
 const match=new Map(g.items.map(it=>[it.operator+'|'+it.direction+'|'+it.stop_id,it]));
 const merged=new Map();for(const record of raw){const key=record.operator+'|'+record.route+'|'+record.direction+'|'+record.stop_id;if(!merged.has(key)){
  const m=match.get(record.operator+'|'+record.direction+'|'+record.stop_id);
  merged.set(key,{...record,name:m?.name||'',name_en:m?.name_en||'',name_tc:m?.name_tc||m?.name||'',lat:m?.lat??null,lng:m?.lng??null,shared_stop_id:m?.shared_stop_id||'',destination:g.destination,destination_en:g.destination_en||'',destination_tc:g.destination_tc||g.destination});
 }}
 const items=[...merged.values()];
 // Populate from persistent stop details without waiting for network requests.
 for(const it of items){if(!it.name||!goodPosition(it)||(state.lang==='en'&&!it.name_en)){const prior=cachedStopDetail(it.operator+'|'+it.stop_id);if(prior)Object.assign(it,enrichedRecord(it,prior));}}
 const missing=items.filter(it=>!goodPosition(it)||!it.name||(state.lang==='en'&&!it.name_en));
 return {stops:clusterStops(items,g),warnings,items,missing};
}
async function resolveStopDetails(data,g,token){
 const missing=data.missing;
 if(!missing.length)return;
 state.loadingNames=missing.length;
 // Render immediately: stop-name requests are enrichment, not a blocker for ETA.
 for(let i=0;i<missing.length;i+=12){
  if(token!==state.dialogToken||state.currentStop)return;
  const batch=missing.slice(i,i+12);
  await Promise.all(batch.map(async it=>{try{Object.assign(it,await getStopDetails(it))}catch{it.name=it.name||'Stop name unavailable'}}));
  if(token!==state.dialogToken||state.currentStop)return;
  state.loadingNames=Math.max(0,missing.length-i-batch.length);
  // Preserve the expanded stop if enrichment merges two previously separate rows.
  const previous=state.verified.find(row=>stopKey(row)===state.expandedStopKey);
  const expandedIDs=new Set((previous?.variants||[]).map(itemID));
  state.verified=clusterStops(data.items,g);
  if(expandedIDs.size){const successor=state.verified.find(row=>row.variants.some(v=>expandedIDs.has(itemID(v))));
   state.expandedStopKey=successor?stopKey(successor):null;
  }
  drawStopPicker(token);
 }
}
// Government-anchor links are generated by make_stop_links.py from audit v3.
// The key includes each operator's NATIVE route direction, because CTB and KMB
// often invert O/I on jointly operated routes. Keep native IDs for ETA calls.
const nativeLinkKey=it=>[it.route,it.operator,it.direction,it.stop_id].join('|');
function officialCrossLink(a,b){
 if(a.route!==b.route||a.operator===b.operator)return false;
 const k1=state.stopLinkLookup.get(nativeLinkKey(a));
 const k2=state.stopLinkLookup.get(nativeLinkKey(b));
 if(k1!==nativeLinkKey(b)||k2!==nativeLinkKey(a))return false;
 // If the current stop details differ materially from the audited locations,
 // fail closed and leave the poles separate; do not accidentally link road sides.
 return !(goodPosition(a)&&goodPosition(b)&&distance(a.lat,a.lng,b.lat,b.lng)>170);
}
function sameOfficialLinkedStop(item,cluster){
 if(item.route!==cluster.route)return false;
 if(cluster.variants.some(v=>v.operator===item.operator&&v.stop_id!==item.stop_id))return false;
 const other=cluster.variants.filter(v=>v.operator!==item.operator);
 return other.length>0&&other.every(v=>officialCrossLink(item,v));
}
async function loadOfficialStopLinks(){
 try{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  let response;
  try{response=await fetch('./stop-links.json?v=2.8.0',{cache:'no-store',signal:controller.signal});}
  finally{clearTimeout(timer);}
  if(!response.ok)throw Error('HTTP '+response.status);
  const doc=await response.json();
  if(doc.schema_version!==1||doc.mode!=='all_joint_routes'||!doc.coverage||!Array.isArray(doc.links)||doc.links.length<1||doc.coverage.accepted_stop_pairs!==doc.links.length||doc.coverage.attempted_joint_routes!==doc.coverage.discovered_joint_routes)
   throw Error('Invalid stop-links.json schema');
  const mapped=new Map();
  for(const pair of doc.links){
   const route=clean(pair.route),kmb=pair.kmb,ctb=pair.ctb;
   if(!/^[A-Z0-9]{1,7}$/.test(route)||!kmb||!ctb||
      !['O','I'].includes(kmb.direction)||!['O','I'].includes(ctb.direction)||
      !/^[0-9A-F]{16}$/.test(kmb.stop_id)||!/^\d{6}$/.test(ctb.stop_id)||
      !Number.isFinite(Number(pair.operator_gap_m))||Number(pair.operator_gap_m)>150)continue;
   const ka=[route,'KMB',kmb.direction,kmb.stop_id].join('|');
   const kb=[route,'CTB',ctb.direction,ctb.stop_id].join('|');
   if(mapped.has(ka)&&mapped.get(ka)!==kb)throw Error('Conflicting KMB mapping');
   if(mapped.has(kb)&&mapped.get(kb)!==ka)throw Error('Conflicting Citybus mapping');
   mapped.set(ka,kb);mapped.set(kb,ka);
  }
  if(!mapped.size)throw Error('No valid cross-operator links');
  state.stopLinkLookup=mapped;
  state.stopLinkStatus={loaded:true,coverage:doc.coverage};
  if(state.view==='settings')render();
  return true;
 }catch(err){state.stopLinkStatus={loaded:false,error:err.message};if(state.view==='settings')render();console.warn('Network stop mapping unavailable; retaining conservative matching:',err.message);return false;}
}
// Operator stop IDs can differ even for the same boarding landmark. A pair may
// have separated poles (e.g. the two Mary Court stops), so proximity alone is
// insufficient. Require the SAME verified route and physical direction (the
// group already enforces both), close coordinates AND matching landmark names.
// Distinct poles of one operator must never be merged merely by proximity.
function stopLandmark(value){
 return String(value||'').normalize('NFKC').toLowerCase()
  .split(/[,，、（(]/,1)[0]
  .replace(/\b(?:bus stop|stop)\b/g,'').replace(/[\s.'’‘\-_/]/g,'').trim();
}
function commonStopLandmark(a,b){
 const pairs=[['name_en','name_en'],['name_tc','name_tc']];
 for(const [x,y] of pairs){const left=stopLandmark(a[x]),right=stopLandmark(b[y]);
  if(left.length>=3&&left===right)return true;
 }
 // Older catalogues may have names only under the generic field.
 const aName=stopLandmark(a.name),bName=stopLandmark(b.name);
 return aName.length>=3&&aName===bName;
}
function sameBoardingLandmark(item,cluster){
 // Official mapped pairs take precedence over heuristic name/proximity matching.
 // Do not let an unmatched official stop accidentally absorb a mapped neighbour.
 for(const v of cluster.variants){
  if(v.operator!==item.operator &&
     (state.stopLinkLookup.has(nativeLinkKey(item))||state.stopLinkLookup.has(nativeLinkKey(v))) &&
     !officialCrossLink(item,v))return false;
 }
 if(sameOfficialLinkedStop(item,cluster))return true;
 if(!goodPosition(item)||!cluster.variants.every(goodPosition))return false;
 if(cluster.route!==item.route)return false; // all variants were verified for the same physical route group
 // Allow duplicate service types for the exact same operator stop, but not
 // distinct stop IDs from the same operator.
 if(cluster.variants.some(v=>v.operator===item.operator&&v.stop_id!==item.stop_id))return false;
 // A common HKBus aggregate ID is evidence of a shared boarding landmark.
 // Both variants must be officially verified members of the same journey.
 // Keep a conservative geographic guard: an aggregator mismatch must not
 // combine boarding poles hundreds of metres apart.
 const aggregateID=String(item.shared_stop_id||'');
 if(aggregateID && cluster.variants.every(v=>
    v.operator===item.operator || (v.shared_stop_id===aggregateID && distance(item.lat,item.lng,v.lat,v.lng)<=200)))return true;
 return cluster.variants.every(v=>{
  const separation=distance(item.lat,item.lng,v.lat,v.lng);
  if(v.operator===item.operator)return v.stop_id===item.stop_id&&separation<=20;
  return separation<=18 || (separation<=110&&commonStopLandmark(item,v));
 });
}
function clusterStops(items,g){
 const ordered=items.slice().sort((a,b)=>a.seq-b.seq||a.operator.localeCompare(b.operator));
 const clusters=[];
 for(const it of ordered){
  let found=clusters.find(s=>sameOfficialLinkedStop(it,s))||clusters.find(s=>sameBoardingLandmark(it,s));
  if(found){
   if(!found.variants.some(v=>itemID(v)===itemID(it)))found.variants.push(it);
   found.seq=Math.min(found.seq,it.seq);
   if(!found.name_en&&it.name_en)found.name_en=it.name_en;
   if(!found.name_tc&&it.name_tc)found.name_tc=it.name_tc;
   // Citybus provides useful mixed-case English stop names with road context.
   // Keep different native stop IDs internally for accurate ETA requests.
   if(it.operator==='CTB'&&it.name_en){found.name_en=it.name_en;
    if(it.name_tc)found.name_tc=it.name_tc; found.name=it.name_tc||it.name||found.name;}
  }else clusters.push({route:g.route,direction:g.direction,destination:g.destination,
    name:it.name||'Loading stop name…',name_en:it.name_en||'',name_tc:it.name_tc||it.name||'',
    destination_en:g.destination_en||'',destination_tc:g.destination_tc||g.destination,
    lat:it.lat,lng:it.lng,seq:it.seq,variants:[it]});
 }
 const pos=state.position;
 for(const c of clusters){
  const ds=pos?c.variants.filter(goodPosition).map(v=>distance(pos.lat,pos.lng,v.lat,v.lng)):[];
  c.distance=ds.length?Math.min(...ds):null;
  c.farthestDistance=ds.length?Math.max(...ds):null;
 }
 return clusters.sort((a,b)=>pos?(a.distance??Infinity)-(b.distance??Infinity)||a.seq-b.seq:a.seq-b.seq);
}
function dialog(title){$('#modalTitle').textContent=title;$('#modalScrim').classList.remove('hidden');$('#modalBody').innerHTML='<p class="hint loading">Loading…</p>';}
function closeDialog(){state.dialogToken++;if(stopObserver){stopObserver.disconnect();stopObserver=null;}state.expandedStopKey=null;$('#modalScrim').classList.add('hidden');state.currentGroup=null;state.currentStop=null;}
async function openGroup(key){
 const groups=state.view==='nearby'?makeGroups(state.nearby):routeResults();
 let group=groups.find(g=>g.key===key);if(!group)return;
 const token=++state.dialogToken,selected=group.items[0];
 state.currentGroup=group;state.currentStop=null;state.routeFailures=[];state.loadingNames=0;state.expandedStopKey=null;
 dialog(group.route+' · '+(group.direction==='I'?'Inbound':'Outbound'));
 $('#modalBody').innerHTML='<p class="hint loading">Verifying route direction and stops…</p>';
 try{
  await ensurePhysicalRoute(group.route);
  if(token!==state.dialogToken)return;
  // Re-map the selected operator trip to the correct physical direction.
  const resolved=physicalDirection(selected,new Set(group.items.map(x=>x.operator)));
  const correctedKey=group.route+'|'+resolved;
  const all=state.groups.find(g=>g.key===correctedKey);
  group=all||makeGroups(state.view==='nearby'?state.nearby:state.catalogue).find(g=>g.key===correctedKey)||group;
  state.currentGroup=group;
  $('#modalTitle').textContent=group.route+' · '+(group.direction==='I'?'Inbound':group.direction==='O'?'Outbound':group.operators.join(' / '));
  $('#modalBody').innerHTML='<p class="hint loading">Checking verified operator stop lists…</p>';
  await stopLinksReady;
  if(token!==state.dialogToken)return;
  const data=await officialGroup(group);
  if(token!==state.dialogToken)return;
  state.verified=data.stops;state.routeFailures=data.warnings;state.loadingNames=data.missing.length;
  drawStopPicker(token);void resolveStopDetails(data,group,token);
 }catch(e){if(token===state.dialogToken)$('#modalBody').innerHTML='<div class="notice">Cannot verify route stops: '+esc(e.message)+'</div><button class="ghost-button" data-action="retryRoute">Try again</button>';}
}

const stopKey=s=>s.variants.map(itemID).sort().join('~');
function combinedETAs(s){const gathered=s.variants.map(v=>state.etas.get(itemID(v)));if(!gathered.every(Boolean))return null;
 return {arr:gathered.flatMap(x=>x.arr||[]).sort((a,b)=>a.at-b.at).slice(0,6),errors:gathered.filter(x=>x.error).map(x=>x.error)};
}
function etaMinutes(at){return Math.max(0,Math.ceil((at-Date.now())/60000));}
function stopETAMarkup(s){if(state.demo)return '<strong>3 min</strong>';
 const result=combinedETAs(s);if(!result)return '<span class="muted">···</span>';
 if(result.arr.length){const first=result.arr[0],mins=etaMinutes(first.at);
  return '<span class="first-eta"><strong>'+(mins===0?'Due':mins+' min')+'</strong><small>'+esc(names[first.operator]||first.operator)+'</small></span>';
 }
 return '<span class="muted">'+(result.errors.length?'Error':'No ETA')+'</span>';
}
function stopExpandedMarkup(s){const data=state.demo?{arr:[3,12,24].map(n=>({at:Date.now()+n*60000,operator:s.variants[0].operator})),errors:[]}:combinedETAs(s);
 const arrivals=data?.arr||[],errors=data?.errors||[];
 let html='<div class="expanded-stop" role="region"><div class="expanded-heading">Upcoming bus arrivals</div>';
 // Nearby platforms for different operators may be tens of metres apart.
 // Keep each operator's actual walking distance visible when this matters.
 if(state.position&&s.variants.length>1&&s.farthestDistance!==null&&s.distance!==null&&s.farthestDistance-s.distance>25){
  const opDistances=[...new Set(s.variants.map(v=>v.operator))].map(op=>{
   const ds=s.variants.filter(v=>v.operator===op&&goodPosition(v)).map(v=>distance(state.position.lat,state.position.lng,v.lat,v.lng));
   return ds.length?esc(names[op]||op)+': '+Math.min(...ds)+' m':'';
  }).filter(Boolean);
  html+='<p class="small-note">'+opDistances.join(' · ')+'</p>';
 }
 if(!data)html+='<p class="small-note loading">Loading arrival predictions…</p>';
 else if(arrivals.length)html+='<div class="eta-inline">'+arrivals.map(x=>'<span class="eta-inline-chip"><strong>'+esc(etaMinutes(x.at)===0?'Due':etaMinutes(x.at)+' min')+'</strong><small>'+esc(names[x.operator])+'</small></span>').join('')+'</div>';
 else html+='<p class="small-note">'+(errors.length?'API unavailable: '+esc(errors.join(' · ')):'No ETA currently predicted for this verified stop.')+'</p>';
 if(errors.length&&arrivals.length)html+='<p class="small-note">Some operators unavailable: '+esc(errors.join(' · '))+'</p>';
 html+='<div class="expanded-actions"><button class="primary-button" data-action="saveExpanded" type="button">'+(isFavourite(s)?'★ Remove favourite':'☆ Add favourite')+'</button><button class="ghost-button" data-action="refreshExpanded" type="button">↻ Refresh</button></div></div>';
 return html;
}
function drawStopPicker(token){if(token!==state.dialogToken)return;
 const modal=$('#modalScrim .modal'),scrollTop=modal?.scrollTop||0;
 let body='<div class="stop-picker-caption">'+esc(localizedDestination(state.currentGroup||{}))+' · Select your boarding stop</div>';
 if(state.routeFailures.length)body+='<div class="notice">Some operators could not be loaded: '+esc(state.routeFailures.join('; '))+'</div>';
 if(state.loadingNames>0)body+='<p class="small-note" aria-live="polite">'+fmt(state.loadingNames)+' stop names are being verified in the background.</p>';
 if(!state.verified.length)body+='<div class="notice">No verified stops available for this service.</div>';
 else body+='<div class="result-list stop-list">'+state.verified.map((s,i)=>{
 const expanded=state.expandedStopKey===stopKey(s);
  const spread=s.distance!==null&&s.farthestDistance!==null&&s.farthestDistance-s.distance>25;
  const distanceLabel=s.distance!==null?' · '+esc(s.distance)+(spread?'–'+esc(s.farthestDistance):'')+' m':'';
 return '<div class="stop-row" data-stop-index="'+i+'"><button class="stop-main" type="button" data-action="expandStop" data-index="'+i+'" aria-expanded="'+String(expanded)+'"><span class="stop-label"><strong>'+esc(localizedStop(s))+'</strong><small>'+operatorChips([...new Set(s.variants.map(x=>x.operator))])+distanceLabel+'</small></span><span class="stop-next" data-eta-first="'+i+'">'+stopETAMarkup(s)+'</span><span class="stop-chevron" aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span></button>'+(expanded?stopExpandedMarkup(s):'')+'</div>';
 }).join('')+'</div>';
 $('#modalBody').innerHTML=body;
 if(modal)modal.scrollTop=scrollTop;
 observeStopETAs(token);
}
let stopObserver=null;
function observeStopETAs(token){if(stopObserver){stopObserver.disconnect();stopObserver=null;}
 if(state.demo)return;
 const rows=[...document.querySelectorAll('#modalBody [data-stop-index]')];
 if('IntersectionObserver' in window){stopObserver=new IntersectionObserver(entries=>{
  for(const ent of entries)if(ent.isIntersecting){const index=Number(ent.target.dataset.stopIndex);void updateRowETA(index,token);stopObserver?.unobserve(ent.target);}
 },{root:$('#modalScrim .modal'),rootMargin:'70px 0px',threshold:0});rows.forEach(el=>stopObserver.observe(el));}
 else rows.slice(0,7).forEach(el=>void updateRowETA(Number(el.dataset.stopIndex),token));
}
let etaInFlight=0,etaQueue=[];
function withEtaSlot(work){return new Promise((resolve,reject)=>{const run=async()=>{etaInFlight++;try{resolve(await work());}catch(e){reject(e)}finally{etaInFlight--;const next=etaQueue.shift();if(next)next();}};if(etaInFlight<4)run();else etaQueue.push(run);});}
async function updateRowETA(index,token,force=false){const s=state.verified[index];if(!s||state.demo||token!==state.dialogToken)return;
 const key=stopKey(s);if(!force&&state.etaRequests.has(key))return state.etaRequests.get(key);
 const task=withEtaSlot(()=>Promise.all(s.variants.map(v=>getETA(v,force)))).then(()=>{
  if(token!==state.dialogToken||state.currentStop)return;
  const row=document.querySelector('#modalBody [data-stop-index="'+index+'"]');
  if(!row||stopKey(state.verified[index])!==key)return;
  const mark=row.querySelector('[data-eta-first]');if(mark)mark.innerHTML=stopETAMarkup(s);
  if(state.expandedStopKey===key){const expansion=row.querySelector('.expanded-stop');if(expansion){const t=document.createElement('template');t.innerHTML=stopExpandedMarkup(s);expansion.replaceWith(t.content);}}
 }).finally(()=>{if(state.etaRequests.get(key)===task)state.etaRequests.delete(key)});
 state.etaRequests.set(key,task);return task;
}

function etaURL(it){return it.operator==='CTB'?`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${encodeURIComponent(it.stop_id)}/${encodeURIComponent(it.route)}`:`https://data.etabus.gov.hk/v1/transport/kmb/eta/${encodeURIComponent(it.stop_id)}/${encodeURIComponent(it.route)}/${encodeURIComponent(it.service_type||'1')}`;}
async function getETA(it,force=false){const key=itemID(it),old=state.etas.get(key);if(!force&&old&&Date.now()-old.time<45000)return old;
 try{const json=await requestJSON(etaURL(it),14000);if(!Array.isArray(json.data))throw Error('Invalid ETA JSON');
 const now=Date.now();const arr=json.data.filter(x=>clean(x.route)===it.route && (!x.dir||x.dir===it.direction) && (!x.stop||clean(x.stop)===it.stop_id) && x.eta)
 .map(x=>({at:Date.parse(x.eta),operator:it.operator,remark:String((state.lang==='en'?x.rmk_en:x.rmk_tc)||x.rmk_en||x.rmk_tc||'')})).filter(x=>Number.isFinite(x.at)&&x.at>=now-30000&&x.at<=now+10800000).sort((a,b)=>a.at-b.at);
 const out={time:Date.now(),arr:arr.slice(0,3)};state.etas.set(key,out);return out;
 }catch(e){const out={time:Date.now(),arr:[],error:e.message};state.etas.set(key,out);return out;}}
function isFavourite(s){return state.favourites.some(f=>favID(f)===favID(s));}
function drawETA(s,results,token){if(token!==state.dialogToken)return;
 const errs=results.filter(x=>x.error),etas=results.flatMap(x=>x.arr||[]).sort((a,b)=>a.at-b.at).slice(0,6),fav=isFavourite(s);
 let html=`<div class="detail"><strong>${esc(localizedStop(s))}</strong><p class="hint">${esc(localizedDestination(s))} · ${s.direction==='O'?'Outbound':'Inbound'}<br>${operatorChips([...new Set(s.variants.map(x=>x.operator))])}</p></div><div class="group-heading">Next bus arrivals · HK time ${esc(hkTime())}</div>`;
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
function populateNearby(){if(!state.position||!state.catalogue.length)return;
 if(!goodPosition(state.position)){state.nearby=[];banner('You appear to be outside Hong Kong; Nearby needs a Hong Kong GPS position.');render();return;}
 const {lat,lng}=state.position,limit=state.radius,la=limit/110900,lo=limit/(110900*Math.cos(lat*Math.PI/180));
 state.nearby=state.catalogue.filter(x=>goodPosition(x)&&Math.abs(x.lat-lat)<=la&&Math.abs(x.lng-lng)<=lo&&distance(lat,lng,x.lat,x.lng)<=limit);
 banner('');render();
}
function locate(){if(state.demo){banner('Switch to Live mode to use GPS.');return;}
 if(!navigator.geolocation){banner('GPS is not available. Open the HTTPS dashboard in Safari.');return;}
 banner('Requesting iPhone location…');navigator.geolocation.getCurrentPosition(pos=>{const {latitude:lat,longitude:lng,accuracy}=pos.coords;state.position={lat,lng,accuracy};
 if(!state.catalogue.length){banner('Location found. Loading the stop catalogue…');render();return;}
 populateNearby();
 },error=>banner(({1:'Safari location permission denied.',2:'Current position unavailable.',3:'Location request timed out.'})[error.code]||error.message),{enableHighAccuracy:true,timeout:12000,maximumAge:20000});}
async function indexedGet(key){try{const db=await new Promise((yes,no)=>{const req=indexedDB.open('hk-bus-eta-dashboard',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error)});
 return await new Promise((yes,no)=>{const tx=db.transaction('data');const q=tx.objectStore('data').get(key);q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);tx.oncomplete=()=>db.close();});}catch{return null;}}
async function indexedPut(key,value){try{const db=await new Promise((yes,no)=>{const req=indexedDB.open('hk-bus-eta-dashboard',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error)});
 await new Promise((yes,no)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(value,key);tx.oncomplete=()=>{db.close();yes();};tx.onerror=()=>no(tx.error);});}catch{/* Site catalogue still works this session. */}}
function applyCatalogue(entries,date){state.catalogue=entries;state.groups=makeGroups(entries);state.catalogueDate=date||'Unknown';render();if(state.view==='browse'&&state.query.trim())void ensurePhysicalRoute(clean(state.query));if(state.view==='nearby'&&!state.demo){if(state.position)populateNearby();else if(!state.locationRequested){state.locationRequested=true;locate();}}}
async function loadCatalogue(){const saved=await indexedGet('catalogue_v4');if(saved&&Array.isArray(saved.entries)){applyCatalogue(saved.entries,saved.date);}
 // Avoid fetching/parsing the full 14 MB catalogue on every launch.
 if(saved?.fetchedAt&&Date.now()-saved.fetchedAt<6*3600000)return;
 try{const res=await fetch('./catalogue.json',{cache:'default'});if(!res.ok)throw Error('HTTP '+res.status);const json=await res.json();const entries=normalizeCatalogue(json);if(!entries.length)throw Error('Empty catalogue');applyCatalogue(entries,json.catalogue_date);await indexedPut('catalogue_v4',{entries,date:state.catalogueDate,fetchedAt:Date.now()});}
 catch(e){if(!state.catalogue.length)banner('Could not load catalogue.json: '+e.message+'. Import the JSON file in Settings.');}}
async function importCatalogue(file){try{const json=JSON.parse(await file.text()),entries=normalizeCatalogue(json);if(!entries.length)throw Error('Empty catalogue');applyCatalogue(entries,json.catalogue_date||'Imported');await indexedPut('catalogue_v4',{entries,date:state.catalogueDate,fetchedAt:Date.now()});banner('Imported '+fmt(entries.length)+' route-stop records.');}catch(e){banner('Catalogue import failed: '+e.message);}}
async function importFavourites(file){try{const json=JSON.parse(await file.text()),arr=Array.isArray(json)?json:Object.values(json);const previous=state.favourites;state.favourites=[...previous,...arr];restoreFavs();state.favourites=[...new Map(state.favourites.map(f=>[favID(f),f])).values()];persist('hkbus_favourites_v2',state.favourites);render();banner('Favourites imported.');}catch(e){banner('Import failed: '+e.message);}}
let inputTimer;
document.addEventListener('input',e=>{if(e.target.id==='routeSearch'){state.query=e.target.value;clearTimeout(inputTimer);inputTimer=setTimeout(()=>{if(state.view!=='browse')return;const el=$('#routeSearch'),pos=el.selectionStart;render();const next=$('#routeSearch');next.focus();next.setSelectionRange(pos,pos);if(state.query.trim()&&routeResults().length<=4&&routeResults().every(g=>g.route===clean(state.query))){const result=$('#routeResults');result?.scrollIntoView({block:'nearest',behavior:'smooth'});void ensurePhysicalRoute(clean(state.query));}},160);}});
document.addEventListener('change',e=>{if(e.target.id==='radiusSelect'){state.radius=Number(e.target.value);state.nearby=[];state.position=null;render();locate();}
 if(e.target.id==='catalogueFile'){const f=e.target.files?.[0];if(f)importCatalogue(f);e.target.value='';}
 if(e.target.id==='favouritesFile'){const f=e.target.files?.[0];if(f)importFavourites(f);e.target.value='';}});
document.addEventListener('click',e=>{const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
 if(action==='filterOp'){state.operator=el.dataset.value;render();if(state.query.trim()&&routeResults().every(g=>g.route===clean(state.query)))void ensurePhysicalRoute(clean(state.query));}
 if(action==='setLanguage'){state.lang=el.dataset.value==='tc'?'tc':'en';persist('hkbus_lang',state.lang);render();}
 if(action==='setStartPage'){const next=el.dataset.value;if(START_PAGES.includes(next)){state.startPage=next;persist('hkbus_start_page',next);render();}}
 if(action==='openGroup')openGroup(el.dataset.group);
 if(action==='openFavourite')openFavourite(Number(el.dataset.index));
 if(action==='expandStop'){const index=Number(el.dataset.index),s=state.verified[index];if(s){state.expandedStopKey=state.expandedStopKey===stopKey(s)?null:stopKey(s);drawStopPicker(state.dialogToken);if(state.expandedStopKey)void updateRowETA(index,state.dialogToken);}}
 if(action==='saveExpanded'){const s=state.verified.find(x=>stopKey(x)===state.expandedStopKey);if(s&&!state.demo){const idx=state.favourites.findIndex(f=>favID(f)===favID(s));if(idx>=0)state.favourites.splice(idx,1);else state.favourites.push({...s});persist('hkbus_favourites_v2',state.favourites);drawStopPicker(state.dialogToken);render();}}
 if(action==='refreshExpanded'){const index=state.verified.findIndex(x=>stopKey(x)===state.expandedStopKey);if(index>=0)void updateRowETA(index,state.dialogToken,true);}
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
 if(action==='clearFav'&&confirm(state.lang==='tc'?UI_ZH['Remove all saved favourites on this browser?']:'Remove all saved favourites on this browser?')){state.favourites=[];persist('hkbus_favourites_v2',[]);banner('Favourites cleared.');render();}
});
persist('hkbus_demo',false); // Retire any saved demo preference from earlier versions.
$('#refreshButton').addEventListener('click',()=>{state.etas.clear();state.routeStops.clear();state.routeOrientation.clear();state.routeOrientationPending.clear();persist(ROUTE_DIRECTION_STORAGE,{});state.groups=makeGroups(state.catalogue);banner('Caches refreshed.');render();if(state.view==='browse'&&state.query.trim())void ensurePhysicalRoute(clean(state.query));});
$('#closeModal').addEventListener('click',closeDialog);
$('#modalScrim').addEventListener('click',e=>{if(e.target.id==='modalScrim')closeDialog();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeDialog();});
const stopLinksReady=loadOfficialStopLinks();
render();if(state.view==='nearby'&&!state.demo){state.locationRequested=true;locate();}loadCatalogue();
