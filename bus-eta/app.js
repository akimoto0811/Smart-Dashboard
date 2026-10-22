'use strict';
/* HK Bus ETA 3.4. Route-discovery catalogue != authoritative operator route-stop list. */
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
const nearbyETAState={cache:new Map(),inFlight:new Map(),generation:0,progress:null,updateTimer:null,
 officialKMB:[],officialKMBLoadedAt:0,officialKMBPending:null,officialKMBError:null,scanStops:[],liveCards:[]};
// The version is the cache-buster on app.js in index.html, so it can't drift.
const APP_VERSION=new URL(document.querySelector('script[src*="app.js"]')?.src||location.href).searchParams.get('v')||'dev';
const state = {view:START_PAGES.includes(savedStartPage)?savedStartPage:'nearby',startPage:START_PAGES.includes(savedStartPage)?savedStartPage:'nearby',demo:false,catalogue:[],groups:[],catalogueDate:'',operator:'ALL',query:'',radius:450,position:null,nearby:[],favourites:storage('hkbus_favourites_v2',[]),currentGroup:null,currentStop:null,verified:[],routeFailures:[],nearbyFocus:null,routeRetry:null,loadingNames:0,busy:false,dialogToken:0,etas:new Map(),routeStops:new Map(),stopDetails:new Map(),routeOrientation:new Map(),routeOrientationPending:new Map(),notice:'',forceRefresh:false,lang:['en','tc'].includes(storage('dashboard_lang'))?storage('dashboard_lang'):storage('hkbus_lang','en')==='tc'?'tc':'en',expandedStopKey:null,etaRequests:new Map(),locationRequested:false,tdRoutes:new Map(),tdFares:new Map(),stopFares:null,stopLinkLookup:new Map(),stopLinkStatus:{loaded:false,error:'Mapping not loaded'}};
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
 'Checking live arrivals':'正在查詢即時到站時間','Upcoming buses':'即將到站巴士','Checking ETA…':'正在查詢到站時間…','No upcoming ETA':'暫無預計到站班次','ETA unavailable':'無法取得到站資料',
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
 'Import favourites':'匯入收藏','Export favourites':'匯出收藏','Diagnostics':'系統診斷','Diagnostics & data':'系統診斷及資料',
 'Live ETA uses the KMB and Citybus public APIs. API errors are shown rather than guessed.':'即時到站資料由九巴及城巴公開 API 提供；如有連線錯誤，會顯示錯誤而非猜測到站時間。',
 'Clear ETA cache':'清除到站快取','Clear favourites':'清除所有收藏',
 'Loading…':'載入中…','Loading stop name…':'正在載入站名…','Loading English name…':'正在載入英文站名…',
 'Stop name unavailable':'無法取得站名', 'Nearest':'最近','stops · Ordered from first stop to terminus':'站 · 按行車次序由起點至終點','Checking KMB / Citybus official stop lists…':'正在查閱九巴／城巴官方站點資料…',
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
 'Refresh arrivals':'更新到站資料','Close':'關閉','Dashboard':'主頁'
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
   [/^([\d,]+) stops$/,(m,n)=>n+' 個站'],
   [/^([\d,]+) stops · (\$[\d.]+)$/,(m,n,f)=>n+' 個站 · '+f],
   [/^([\d,]+) stops · Ordered from first stop to terminus$/,(m,n)=>n+' 個站 · 按行車次序由起點至終點'],
   [/^([\d,]+) stops · Full fare (\$[\d.]+) · Ordered from first stop to terminus$/,(m,n,f)=>n+' 個站 · 全程車費 '+f+' · 按行車次序由起點至終點'],
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
// Citybus ETAs often arrive without a Chinese destination; fall back to the
// catalogue's Chinese name for that route direction so 中文 mode stays Chinese.
let destinationTCIndex=null,destinationTCSource=null;
function catalogueDestinationTC(operator,route,direction){
 if(destinationTCSource!==state.catalogue){destinationTCSource=state.catalogue;destinationTCIndex=new Map();
  for(const it of state.catalogue){const k=it.operator+'|'+it.route+'|'+it.direction;if(it.destination_tc&&!destinationTCIndex.has(k))destinationTCIndex.set(k,it.destination_tc);}}
 return destinationTCIndex.get(operator+'|'+route+'|'+direction)||'';
}
const localizedDestination = x => state.lang==='en'?(x.destination_en||x.destination||'Destination'):(x.destination_tc||x.destination||'目的地');
function enrichedRecord(input,extra){return {...input,...extra,name_en:extra.name_en||input.name_en||'',name_tc:extra.name_tc||input.name_tc||input.name||''};}
function uniqueCatalogue(rows){const map=new Map();for(const raw of rows){const it=normalize(raw);if(it)map.set(itemID(it),it);}return [...map.values()];}
// Schema 4 (catalogue-compact.json) stores stop IDs, locations and destinations
// once; each variant lists [stop_id, location, destination] index triples.
function expandCompactCatalogue(json){
 const rows=[];
 for(const [operator,route,direction,service_type,flat] of json.variants){
  for(let i=0;i+2<flat.length;i+=3){
   const [name,name_en,lat,lng,shared_stop_id]=json.locations[flat[i+1]]||[],[destination,destination_en]=json.destinations[flat[i+2]]||[];
   rows.push({operator,route,direction,service_type,stop_id:json.stop_ids[flat[i]],name,name_en,lat,lng,shared_stop_id,destination,destination_en});
  }
 }
 return rows;
}
function normalizeCatalogue(json){if(json.schema_version===4&&Array.isArray(json.variants))return uniqueCatalogue(expandCompactCatalogue(json));
 if(Array.isArray(json.entries))return uniqueCatalogue(json.entries);
 if(json.routes&&json.cells){const coords=new Map();for(const [cell,labels] of Object.entries(json.cells)){const [a,b]=cell.split('_').map(Number);for(const label of labels||[])if(!coords.has(label))coords.set(label,[(a+.5)/100,(b+.5)/100]);}return uniqueCatalogue(Object.entries(json.routes).map(([key,it])=>({...it,name:key.split(' · ').at(-1)||'Stop',lat:coords.get(key)?.[0],lng:coords.get(key)?.[1]})));}
 throw Error('Unsupported catalogue format. Generate catalogue-compact.json using make_catalogue.py');}
// Public operators do not consistently use O/I for the same physical journey.
// For joint routes, never merge opposite operator directions without verification.
function physicalDirection(it, routeOps){
 const mapped=state.routeOrientation.get(it.route)?.mapping?.[it.operator]?.[it.direction];
 if(mapped)return mapped;
 if(routeOps?.has('KMB')&&routeOps.has('CTB')){
  const guess=catalogueMapping(it.route)?.[it.operator]?.[it.direction];
  return guess||it.operator+'_'+it.direction;
 }
 return it.direction;
}
// Until a joint route's directions are verified live, match them from the
// catalogue's own first stops with the same rule ensurePhysicalRoute uses, so
// first-time users see one KMB/Citybus row per direction instead of four.
let catalogueFirsts=null,catalogueFirstsSource=null;
const catalogueMappings=new Map();
function catalogueMapping(route){
 if(catalogueFirstsSource!==state.catalogue){catalogueFirstsSource=state.catalogue;catalogueFirsts=new Map();catalogueMappings.clear();
  for(const x of state.catalogue){if(!goodPosition(x))continue;const k=x.operator+'|'+x.route+'|'+x.direction,old=catalogueFirsts.get(k);
   if(!old||(old.service_type!=='1'&&x.service_type==='1'))catalogueFirsts.set(k,x);}}
 if(catalogueMappings.has(route))return catalogueMappings.get(route);
 const first=(op,d)=>catalogueFirsts.get(op+'|'+route+'|'+d);
 // Each Citybus direction joins the KMB direction starting nearest to it (within
 // 1.8 km, and clearly nearer than the other one). Same-numbered routes in
 // different districts, such as KMB 1 and Citybus 1, start far apart and stay apart.
 const ctb={};
 for(const d of ['O','I']){const c=first('CTB',d);if(!c)continue;
  const near=['O','I'].map(k=>{const s=first('KMB',k);return s?{k,m:distance(s.lat,s.lng,c.lat,c.lng)}:null}).filter(Boolean).sort((x,y)=>x.m-y.m);
  if(near.length&&near[0].m<=1800&&(near.length<2||near[1].m-near[0].m>=350))ctb[d]=near[0].k;}
 const used=Object.values(ctb);
 const out=used.length&&new Set(used).size===used.length?{KMB:{O:'O',I:'I'},CTB:{O:ctb.O||'CTB_O',I:ctb.I||'CTB_I'}}:null;
 catalogueMappings.set(route,out);return out;
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
  return {...g,operators:[...g.operators].sort(),
   // Before a joint route's directions are verified, each operator's own
   // catalogue destination is still the right label for its trip.
   destination:metadata?.tc||fallback,
   destination_en:metadata?.en||g.items.find(x=>x.destination_en)?.destination_en||'',
   destination_tc:metadata?.tc||g.items.find(x=>x.destination_tc)?.destination_tc||'',
   stopCount:tripStopCount(g.items)};
 }).sort((a,b)=>a.route.localeCompare(b.route,'en',{numeric:true})||(a.direction===b.direction?0:a.direction==='O'?-1:b.direction==='O'?1:a.direction==='I'?-1:1));
}

function routeResults(){
 const q=clean(state.query), all=state.demo?makeGroups(demoStops.flatMap(x=>x.variants.map(v=>({...v,destination:x.destination})))):state.groups;
 let groups=all.filter(g=>(state.operator==='ALL'||g.operators.includes(state.operator))&&!notOnOfficialList(g));
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
// Special departures (KMB service type 2+) add detour stops; the route view
// and stop counts follow the regular service unless a special one was picked.
const regularServices=(items,picked=[])=>{const all=[...new Set(items.map(i=>String(i.service_type||'1')))].sort((a,b)=>a-b);
 return [...new Set([all.includes('1')?'1':all[0],...picked.map(String).filter(x=>all.includes(x))])].filter(Boolean);};
// Stops on one regular trip: the longest single operator/direction variant,
// not the union of KMB and Citybus poles of a joint route.
function tripStopCount(items){const counts=new Map();
 for(const op of new Set(items.map(x=>x.operator))){const own=items.filter(x=>x.operator===op),svc=regularServices(own)[0];
  for(const x of own)if(String(x.service_type||'1')===svc){const k=op+'|'+x.direction;if(!counts.has(k))counts.set(k,new Set());counts.get(k).add(x.stop_id);}}
 return Math.max(0,...[...counts.values()].map(s=>s.size));}
// Distances of 900 m or more read better in kilometres ("1.2 km").
const distanceText=(near,far=near)=>{
 const tc=state.lang==='tc',km=far>=900,one=v=>km?(v/1000).toFixed(1):String(Math.round(v)),unit=km?(tc?' 公里':' km'):(tc?' 米':' m');
 return one(near)+(Math.round(far)!==Math.round(near)&&one(far)!==one(near)?'–'+one(far):'')+unit;
};
const operatorChips = ops => `<span class="operators">${ops.map(x=>`<span class="operator-chip">${esc(names[x]||x)}</span>`).join('')}</span>`;
function nearbyBoardingItem(g){
 const pos=state.position;
 if(!g.items.length)return null;
 return g.items.slice().sort((a,b)=>{
  if(!pos)return 0;
  return distance(pos.lat,pos.lng,a.lat,a.lng)-distance(pos.lat,pos.lng,b.lat,b.lng);
 })[0];
}
function groupRows(groups,mode='normal'){return groups.map((g,i)=>{
 const n=mode==='nearby'?nearbyGroupETA(g):null;
 const first=n?.arrival;
 const boarding=mode==='nearby'?nearbyBoardingItem(g):null;
 const boardingName=first?.stopName|| (boarding?localizedStop(boarding):'Bus stop');
 const arrival=mode==='nearby'?`<span class="nearby-route-eta ${first?'has-eta':n?.pending?'checking-eta':'no-eta'}">${first?
   `<strong>${etaMinutes(first.at)===0?(state.lang==='tc'?'即將到站':'Due'):etaMinutes(first.at)+(state.lang==='tc'?' 分鐘':' min')}</strong><small>${esc(names[first.operator]||first.operator)}</small>`:
   `<small>${n?.pending?'Checking ETA…':n?.failed?'ETA unavailable':'No upcoming ETA'}</small>`}</span>`:'';
 const nearest=mode==='nearby'&&Number.isFinite(g.nearestDistance)?` · ${distanceText(g.nearestDistance)}`:'';
 const destination=mode==='nearby'?`${state.lang==='tc'?'往':'To'} ${esc(localizedDestination(g))}`:'';
 return `<button class="route-group ${mode==='nearby'?'nearby-route':''}" data-action="openGroup" data-group="${esc(g.key)}">
 <span class="arrival-bus">${esc(g.route)}</span><span class="group-info"><strong>${esc(mode==='nearby'?boardingName:localizedDestination(g))}</strong><span class="group-meta">${mode==='nearby'?destination+nearest:`${fmt(g.stopCount)} stops${routeFare(g)!==null?' · '+fareLabel(routeFare(g)):''}`}</span>${operatorChips(g.operators)}</span>${arrival}<span class="group-arrow">›</span></button>`;
 }).join('');}
function favouriteETAMarkup(f,i){
 const result=state.demo?null:combinedETAs(f),first=result?.arr[0];
 const kind=first?'has-eta':!result?'checking-eta':'no-eta';
 const body=first?`<strong>${etaMinutes(first.at)===0?(state.lang==='tc'?'即將到站':'Due'):etaMinutes(first.at)+(state.lang==='tc'?' 分鐘':' min')}</strong><small>${esc(names[first.operator]||first.operator)}</small>`:
  `<small>${!result?'Checking ETA…':result.errors.length?'ETA unavailable':'No upcoming ETA'}</small>`;
 return `<span class="nearby-route-eta ${kind}" data-fav-eta="${i}">${state.demo?'':body}</span>`;
}
// Favourites show each saved stop's next arrival without opening it.
function refreshFavouriteETAs(force=false){
 if(state.view!=='favourites'||state.demo)return;
 state.favourites.forEach((f,i)=>{void withEtaSlot(()=>Promise.all(f.variants.map(v=>getETA(v,force)))).then(()=>{
  if(state.view!=='favourites'||state.favourites[i]!==f)return;
  const el=document.querySelector(`[data-fav-eta="${i}"]`);if(el)el.outerHTML=favouriteETAMarkup(f,i);
 });});
}
function favouriteRows(){const arr=state.demo?demoStops:state.favourites;return arr.map((f,i)=>`<button class="route-group" data-action="openFavourite" data-index="${i}"><span class="arrival-bus">${esc(f.route)}</span><span class="group-info"><strong>${esc(localizedStop(f))}</strong><span class="group-meta">${state.lang==='tc'?'往':'To'} ${esc(localizedDestination(f))}</span>${operatorChips([...new Set(f.variants.map(x=>x.operator))])}</span>${favouriteETAMarkup(f,i)}<span class="group-arrow">›</span></button>`).join('');}
function favourites(){const fs=state.demo?demoStops:state.favourites;return `${line('Saved bus stops','Your chosen route, direction and boarding stop')}<div class="card no-gap">${fs.length?favouriteRows():'<div class="empty">No favourites saved. Add one from Routes or Nearby.</div>'}</div><div class="buttons"><button class="primary-button" data-view="browse">Add a favourite</button><button class="ghost-button" data-action="exportFav">Export backup</button></div>`;}
function browse(){const q=state.query.trim(), groups=q?routeResults():[], exact=q&&groups.length>0&&groups.every(g=>g.route===clean(q));
 return `<div class="card search-card"><label class="card-title" for="routeSearch">Route number or stop name</label><input id="routeSearch" class="field" autocomplete="off" enterkeyhint="search" placeholder="e.g. 102 or Central" value="${esc(state.query)}"/>${q&&!exact?'<p class="small-note search-hint">Showing matching routes and directions.</p>':''}</div><div class="operator-row route-filters">${['ALL',...operators].map(op=>`<button data-action="filterOp" data-value="${op}" class="${state.operator===op?'selected':''}">${op==='ALL'?'All':esc(op)}</button>`).join('')}</div><section id="routeResults" class="route-results">${q?`${line('Routes and directions',`${fmt(groups.length)} grouped result${groups.length===1?'':'s'}`)}<div class="card no-gap">${groups.length?groupRows(groups.slice(0,100)):'<div class="empty">No matching routes. Try another number or stop name.</div>'}</div>${groups.length>100?'<p class="small-note">Showing the first 100 results; refine your search.</p>':''}`:'<div class="search-empty">Enter a route number to find its direction and verified stops.</div>'}</section>`;}
function nearby(){
 const candidates=state.demo?demoStops.flatMap(f=>f.variants):state.nearby;
 const groups=makeGroups(candidates);groups.forEach(g=>{g.nearestDistance=Math.min(...g.items.map(x=>state.position&&goodPosition(x)?distance(state.position.lat,state.position.lng,x.lat,x.lng):Infinity));});
 const classified=groups.map(g=>({...g,nearby:nearbyGroupETA(g)}));
 classified.sort((a,b)=>{
  const rank=g=>g.nearby.arrival?0:g.nearby.pending?1:g.nearby.failed?3:2;
  return rank(a)-rank(b)||(a.nearby.arrival?.at||Infinity)-(b.nearby.arrival?.at||Infinity)||a.nearestDistance-b.nearestDistance;
 });
 // The operator stop-level feed is the source of truth for ACTIVE nearby
 // services. Routes absent from an older discovery catalogue must appear too.
 const live=nearbyLiveCards();nearbyETAState.liveCards=live;
 const liveRoutes=new Set(live.map(c=>c.route));
 const remaining=classified.filter(g=>!liveRoutes.has(g.route));
 const scan=nearbyETAState.progress;
 const subtitle=state.demo?'Illustration only':!state.position?'Checking your location… Tap Locate me if needed':
   `${fmt(live.length)} ${state.lang==='tc'?'組附近巴士站有預計到站時間':'nearby services with upcoming arrivals'}`;
 const progress=state.position&&scan?.running&&scan.total?`<div class="nearby-progress" role="progressbar" aria-label="${state.lang==='tc'?'正在查詢附近巴士站':'Checking nearby stops'}" aria-valuemin="0" aria-valuemax="${scan.total}" aria-valuenow="${scan.checked}"><span style="width:${Math.max(4,Math.round(scan.checked/scan.total*100))}%"></span></div>`:'';
 const inventoryWarning=nearbyETAState.officialKMBError?`<button class="nearby-warn" data-action="nearbyWarning" aria-label="${state.lang==='tc'?'資料提示':'Data notice'}">⚠</button>`:'';
 const active=live.length?nearbyStopSectionsHTML(live):'';
 const other=remaining.length?`<div class="nearby-list-label nearby-secondary-label">${scan?.running||nearbyETAState.officialKMBPending?(state.lang==='tc'?'正在查詢其他巴士站':'Checking other stops'):(state.lang==='tc'?'其他附近路線 · 暫無預計到站時間':'Other nearby routes · No ETA confirmed at nearby stops')}</div>${groupRows(remaining.slice(0,75),'nearby')}`:'';
 const pending=!live.length&&(scan?.running||nearbyETAState.officialKMBPending)?`<div class="nearby-wait">${state.lang==='tc'?'正在查詢附近各巴士公司的即時到站資料…':'Checking official ETAs for nearby boarding stops…'}</div>`:'';
 const rows=active+pending+other||(state.position?`<div class="empty">${state.lang==='tc'?'此範圍內沒有已確認的巴士站。':'No verified nearby stops found in this radius.'}</div>`:'<div class="empty">No routes yet. Allow Safari location access while in Hong Kong.</div>');
 return `<div class="nearby-toolbar"><select class="select" id="radiusSelect" aria-label="Search radius">${[300,450,800,1200].map(n=>`<option value="${n}" ${n===state.radius?'selected':''}>${n} m</option>`).join('')}</select>${state.position?`<span class="nearby-gps">GPS ±${Math.round(state.position.accuracy)}m</span>`:''}${inventoryWarning}<button class="nearby-locate" data-action="locate"><span aria-hidden="true">⌖</span> <span>Locate me</span></button></div>${progress}<div class="section-sub nearby-summary">${esc(subtitle)}</div><div class="card no-gap nearby-results">${rows}</div>`;
}
const minutesLabel=at=>{const m=etaMinutes(at);return m<=1?(state.lang==='tc'?'即將抵達':'Arriving'):m+(state.lang==='tc'?' 分鐘':' min');};
// Short operator codes shown inside the route tile.
const operatorCodes=ops=>ops.map(x=>state.lang==='tc'?({KMB:'九巴',LWB:'龍運',CTB:'城巴'}[x]||x):({KMB:'KMB',LWB:'LW',CTB:'CTB'}[x]||x)).join('·');
function nearbyLiveCardHTML(c,i){
 const destination=state.lang==='tc'?(c.destination_tc||c.destination_en):(c.destination_en||c.destination_tc);
 const later=(c.times||[]).slice(1).map(x=>etaMinutes(x.at));
 return `<button class="route-group nearby-route nearby-live-card" data-action="openNearbyETA" data-index="${i}">
 <span class="arrival-bus nearby-tile op-${esc(c.operators.join('-').toLowerCase())}">${esc(c.route)}<small>${esc(operatorCodes(c.operators))}</small></span><span class="group-info"><strong>${destination?`${state.lang==='tc'?'往':'To'} ${esc(destination)}`:esc(c.route)}</strong></span>
 <span class="nearby-route-eta has-eta${etaMinutes(c.at)<=1?' arriving':''}"><strong>${minutesLabel(c.at)}</strong><small>${later.length?esc(later.join(' · '))+(state.lang==='tc'?' 分鐘':' min'):esc(names[c.next.operator]||c.next.operator)}</small></span><span class="group-arrow">›</span></button>`;
}
// One heading per boarding stop (its name and distance), then its routes by
// next arrival. Stops are ordered by distance, nearest first.
const NEARBY_STOP_ROWS=4;
function nearbyStopSectionsHTML(cards){
 nearbyETAState.openStops??=new Set();
 const sections=new Map();
 cards.forEach((c,i)=>{
  const name=(state.lang==='tc'?(c.name_tc||c.name_en):(c.name_en||c.name_tc))||'Bus stop';
  const key=clean(name).replace(/[^A-Z0-9\u3400-\u9FFF]/g,'');
  if(!sections.has(key))sections.set(key,{key,name,near:c.distance,far:c.distanceMax,rows:[]});
  const sec=sections.get(key);sec.near=Math.min(sec.near,c.distance);sec.far=Math.max(sec.far,c.distanceMax);sec.rows.push([c,i]);
 });
 return [...sections.values()].sort((a,b)=>a.near-b.near).map(sec=>{
  const range=distanceText(sec.near,sec.far-sec.near>=15?sec.far:sec.near);
  const rows=sec.rows.sort((a,b)=>a[0].at-b[0].at),open=nearbyETAState.openStops.has(sec.key),shown=open?rows:rows.slice(0,NEARBY_STOP_ROWS),hidden=rows.length-shown.length;
  return `<div class="nearby-stop-heading"><span class="nearby-stop-name">${esc(sec.name)}</span><span class="nearby-stop-distance">${range}</span></div>`+
   shown.map(([c,i])=>nearbyLiveCardHTML(c,i)).join('')+
   (hidden>0?`<button class="nearby-more" data-action="showStopRoutes" data-key="${esc(sec.key)}">${state.lang==='tc'?`顯示其餘 ${hidden} 條路線`:`Show ${hidden} more`}</button>`:'');
 }).join('');
}
function settings(){return `${line('Preferences','Choose your language and start page')}
 <div class="card settings-preferences"><div class="card-title">Interface language</div><div class="settings-options"><button class="ghost-button ${state.lang==='en'?'selected-language':''}" data-action="setLanguage" data-value="en">English</button><button class="ghost-button ${state.lang==='tc'?'selected-language':''}" data-action="setLanguage" data-value="tc">繁體中文</button></div>
 <div class="card-title settings-label">Start page</div><div class="settings-options settings-start">${[['nearby','Nearby'],['favourites','Favourites'],['browse','Routes']].map(([id,label])=>`<button class="ghost-button ${state.startPage===id?'selected-language':''}" data-action="setStartPage" data-value="${id}">${label}</button>`).join('')}</div><p class="small-note">This page opens when you launch the dashboard. Your choice is saved on this device.</p></div>
 <div class="card"><div class="card-title">Favourites backup</div><p class="small-note">Favourites are stored in this browser. Export a backup before clearing Safari data or changing devices.</p><div class="buttons"><button class="primary-button" data-action="importFav">Import favourites</button><button class="ghost-button" data-action="exportFav">Export favourites</button></div><p class="small-note">${fmt(state.favourites.length)} saved</p></div>
 <details class="card diagnostics-card"><summary>Diagnostics &amp; data</summary>
 <div class="diag-section"><div class="card-title">Diagnostics</div><p class="small-note">Live ETA uses the KMB and Citybus public APIs. API errors are shown rather than guessed.</p><div class="buttons"><button class="ghost-button" data-action="clearETAs">Clear ETA cache</button><button class="ghost-button" data-action="clearFav">Clear favourites</button></div></div> <div class="diag-section"><div class="card-title">Joint-route stop mapping</div><p class="small-note">${state.stopLinkStatus.loaded?(state.lang==='tc'?`${fmt(state.stopLinkStatus.coverage.mapped_routes)} / ${fmt(state.stopLinkStatus.coverage.discovered_joint_routes)} 條聯營路線 · ${fmt(state.stopLinkStatus.coverage.accepted_stop_pairs)} 組跨公司巴士站配對 · ${fmt(state.stopLinkStatus.coverage.unresolved_routes)} 條未能確認`:`${fmt(state.stopLinkStatus.coverage.mapped_routes)} / ${fmt(state.stopLinkStatus.coverage.discovered_joint_routes)} joint routes · ${fmt(state.stopLinkStatus.coverage.accepted_stop_pairs)} operator stop pairs · ${fmt(state.stopLinkStatus.coverage.unresolved_routes)} unresolved`):(state.lang==='tc'?'尚未載入配對資料 — 使用保守配對模式 (':'Not loaded — using conservative matching (')+esc(state.stopLinkStatus.error||'Check stop-links.json')+')'}</p></div>
 <div class="diag-section"><div class="card-title">Bus catalogue</div><div class="stat-grid"><div class="stat"><div class="label">Route-stop records</div><div class="value">${fmt(state.catalogue.length)}</div></div><div class="stat"><div class="label">Routes / directions</div><div class="value">${fmt(state.groups.length)}</div></div><div class="stat"><div class="label">Last generated</div><div class="value muted" style="font-size:16px">${esc(state.catalogueDate||'Not loaded')}</div></div><div class="stat"><div class="label">Hong Kong time</div><div class="value muted" style="font-size:16px">${esc(hkTime())}</div></div></div><p class="small-note">Stop data is used for discovery. Official operator lists verify boarding stops.</p><button class="ghost-button" data-action="importCat">Import catalogue JSON</button></div></details>
 <p class="small-note app-version">${state.lang==='tc'?'版本':'Version'} ${esc(APP_VERSION)}</p>`;}
function render(){const titles={favourites:['Favourites','Your frequently used journeys'],nearby:['Nearby Stops',''],browse:['Find a Route','One entry per route and direction'],settings:['Settings','Catalogue, data and permissions']};
 const [title,desc]=titles[state.view];$('#pageTitle').textContent=title;$('#pageCaption').textContent=desc;$('#pageCaption').classList.toggle('hidden',!desc);
 $('#todayLabel').textContent='HONG KONG · '+hkDate().toUpperCase()+' · '+hkTime();
 document.querySelectorAll('.nav-btn').forEach(el=>el.classList.toggle('selected',el.dataset.view===state.view));
 $('#mainContent').innerHTML=({favourites,nearby,browse,settings}[state.view]||nearby)();document.body.classList.toggle('route-view',state.view==='browse');document.body.classList.toggle('exact-route',state.view==='browse'&&!!state.query.trim()&&routeResults().length>0&&routeResults().every(g=>g.route===clean(state.query)));localizeDocument();if(state.view==='favourites')refreshFavouriteETAs();}
function refreshNearbyResults(){
 if(state.view!=='nearby')return;
 const main=$('#mainContent');if(!main)return;
 const y=window.scrollY;
 main.innerHTML=nearby();
 localizeDocument();
 if(Math.abs(window.scrollY-y)>1)window.scrollTo(0,y);
}
function scheduleNearbyResults(){
 if(nearbyETAState.updateTimer!==null)return;
 nearbyETAState.updateTimer=setTimeout(()=>{nearbyETAState.updateTimer=null;refreshNearbyResults();},240);
}
function setView(view){state.view=view;banner('');render();scrollTo({top:0,behavior:'instant'});if(view==='nearby'&&!state.demo&&state.catalogue.length){if(state.position)populateNearby();else locate();}}
async function requestJSON(url,limit=13000){const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),limit);try{const res=await fetch(url,{cache:'no-store',signal:ctrl.signal});if(!res.ok)throw Error('API HTTP '+res.status);return await res.json();}catch(err){if(err.name==='AbortError')throw Error('API request timed out');throw err;}finally{clearTimeout(timeout);}}
// The operator's current route-stop list is authoritative. Catalogue mappings are NOT.
function officialListURL(op,route,direction,service){const bound=direction==='I'?'inbound':'outbound';return op==='CTB'?`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${encodeURIComponent(route)}/${bound}`:`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${encodeURIComponent(route)}/${bound}/${encodeURIComponent(service||'1')}`;}
// Requests in flight are shared, so a prefetch and the route view never fetch twice.
const routeStopsPending=new Map();
function getOfficialStops(op,route,direction,service){const key=[op,route,direction,service].join('|'), cached=state.routeStops.get(key);
 if(cached && Date.now()-cached.at<3600000)return Promise.resolve(cached.value);
 if(!routeStopsPending.has(key)){const task=fetchOfficialStops(op,route,direction,service,key);routeStopsPending.set(key,task);task.finally(()=>routeStopsPending.delete(key)).catch(()=>{});}
 return routeStopsPending.get(key);
}
async function fetchOfficialStops(op,route,direction,service,key){
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
let catalogueStopIndex=null,catalogueStopSource=null;
function catalogueStop(it){
 if(catalogueStopSource!==state.catalogue){catalogueStopSource=state.catalogue;catalogueStopIndex=new Map();
  for(const x of state.catalogue)if(goodPosition(x))catalogueStopIndex.set(x.operator+'|'+x.stop_id,x);}
 const hit=catalogueStopIndex.get(it.operator+'|'+it.stop_id);return hit?{...it,lat:hit.lat,lng:hit.lng}:null;
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
  // Fetch destinations and the route-stop lists together; the lists are
  // cached, so the route view that follows needs no further round trip.
  const joint=ops.has('CTB')&&main!=='CTB';
  const lists=joint?Promise.all([getOfficialStops(main,route,'O',service),getOfficialStops('CTB',route,'O','1'),getOfficialStops('CTB',route,'I','1'),
   getOfficialStops(main,route,'I',service).catch(()=>null)]):null;
  lists?.catch(()=>{});
  if(!joint)for(const d of ['O','I'])getOfficialStops(main,route,d,service).catch(()=>{});
  const [outInfo,inInfo,ctbInfo]=await Promise.all([
   main==='CTB'?routeInfo('CTB','O'):routeInfo(main,'O'),
   main==='CTB'?routeInfo('CTB','I'):routeInfo(main,'I'),
   joint?routeInfo('CTB','O'):Promise.resolve(null)
  ]);
  const mapping={};for(const op of ops)mapping[op]={O:'O',I:'I'};
  let separated=false;
  if(ops.has('CTB')&&main!=='CTB'){
   try{
    const [mainStops,ctbOStops,ctbIStops]=await lists;
    if(!mainStops.length||!ctbOStops.length||!ctbIStops.length)throw Error('Route endpoints not supplied');
    // Terminus positions come from the catalogue when it has them, saving a
    // stop-details request per operator.
    const [firstMain,firstCTBO,firstCTBI]=await Promise.all([mainStops[0],ctbOStops[0],ctbIStops[0]].map(it=>catalogueStop(it)||getStopDetails(it)));
    if(!goodPosition(firstMain)||!goodPosition(firstCTBO)||!goodPosition(firstCTBI))throw Error('No verified route terminal coordinates');
    const oDist=distance(firstMain.lat,firstMain.lng,firstCTBO.lat,firstCTBO.lng);
    const iDist=distance(firstMain.lat,firstMain.lng,firstCTBI.lat,firstCTBI.lng);
    if(Math.min(oDist,iDist)>1800||Math.abs(oDist-iDist)<350)throw Error('Terminal direction mapping ambiguous');
    if(iDist<oDist)mapping.CTB={O:'I',I:'O'};
   }catch{
    // Without live data, fall back to the catalogue match; never mix opposite
    // routes if neither can establish it.
    const guess=catalogueMapping(route);
    if(guess)mapping.CTB=guess.CTB;else{separated=true;mapping.CTB={O:'CTB_O',I:'CTB_I'};}
   }
  }
  const directions={O:routeDest(main,outInfo,'O'),I:routeDest(main,inInfo,'I')};
  if(main==='CTB'){directions.O=routeDest('CTB',outInfo,'O');directions.I=routeDest('CTB',inInfo,'I');}
  if(ops.has('CTB')&&main!=='CTB'&&ctbInfo&&separated){
   directions.CTB_O=routeDest('CTB',ctbInfo,'O');directions.CTB_I=routeDest('CTB',ctbInfo,'I');
  }
  // If authoritative metadata is unavailable, do not invent destinations.
  // Missing names fall back to the catalogue's destinations in makeGroups.
  for(const [dir,name] of Object.entries(directions))if(!name?.en&&!name?.tc)delete directions[dir];
  const info={mapping,destinations:directions,verifiedAt:Date.now(),separated};
  state.routeOrientation.set(route,info);
  // Only remember results built from live data, so an offline open isn't kept for a day.
  const saved=(outInfo||inInfo)&&storage(ROUTE_DIRECTION_STORAGE,{});if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
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
async function officialGroup(g,extraServices=[]){
 const ops=g.operators || [...new Set(g.items.map(i=>i.operator))];
 const jobs=[];for(const op of ops){const candidates=g.items.filter(i=>i.operator===op),services=op==='CTB'?['1']:regularServices(candidates,extraServices.filter(x=>x.operator===op).map(x=>x.service_type));
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
  if(state.view==='nearby'&&state.position)startNearbyETAScan();
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
 const official=tdClusters(items,g);if(official)return official;
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
 // The selected route is a JOURNEY, not a list of nearby poles. Keep official
 // operator stop sequence regardless of the user's GPS position. Different
 // operators can use different stop numbering, so never compare their raw seq
 // directly as though both were a single shared sequence.
 return mergeUnlinkedNeighbours(orderJourneyStops(clusters));
}
// Transport Department stop list (td-routes.json, built weekly from
// data.gov.hk). A joint route is listed there once with one entry per physical
// stop, so each KMB and Citybus pole is placed under its nearest official stop,
// keeping the official order. Each operator's poles are walked in their own
// sequence and only matched forwards, so a pole on the opposite side of the
// road (the other direction) is never pulled in.
const TD_MATCH_METRES=250;
function tdAlign(own,stops){
 // Catalogue items have no seq but are already in route order (stable sort).
 const ordered=own.slice().sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0)),out=new Map();let j=0;
 for(const it of ordered){if(!goodPosition(it))continue;
  // Skipping ahead costs 5 m per stop, so a circular route's shared
  // start/end terminus matches the start first.
  let best=-1,bestScore=Infinity;
  for(let k=j;k<Math.min(stops.length,j+10);k++){const d=distance(it.lat,it.lng,stops[k][3],stops[k][4]),score=d+(k-j)*5;if(d<=TD_MATCH_METRES&&score<bestScore){best=k;bestScore=score;}}
  if(best>=0){out.set(it,best);j=best+1;}
 }
 return out;
}
function tdClusters(items,g){
 const trips=state.tdRoutes.get(g.route);
 const ops=[...new Set(items.map(it=>it.operator))];
 if(!trips||ops.length<2)return null;
 // Prefer the regular all-day trip; special trips (detours, short workings)
 // are used only when no regular trip fits these poles.
 let pick=null;
 for(const trip of trips){
  if(pick&&pick.regular&&!(trip.mode==='R'&&!trip.special))break;
  const assigned=new Map();let ok=true,matched=0;
  for(const op of ops){const own=items.filter(it=>it.operator===op),m=tdAlign(own,trip.stops);
   if(m.size<own.filter(goodPosition).length*0.7){ok=false;break;}
   matched+=m.size;m.forEach((k,it)=>assigned.set(it,k));}
  if(ok&&(!pick||matched>pick.matched))pick={trip,assigned,matched,regular:trip.mode==='R'&&!trip.special};
 }
 if(!pick)return null;
 const rows=new Map(),loose=[];
 for(const it of items){const k=pick.assigned.get(it);
  if(k===undefined){loose.push(it);continue;}
  if(!rows.has(k)){const [,rawEN,rawTC,lat,lng]=pick.trip.stops[k];
   // TD names read "KMB NAME/<br>Citybus name"; keep the readable last part.
   const name_en=String(rawEN||'').split(/\/<br>/i).pop().trim(),name_tc=String(rawTC||'').split(/\/<br>/i).pop().trim();
   rows.set(k,{route:g.route,direction:g.direction,destination:g.destination,destination_en:g.destination_en||'',destination_tc:g.destination_tc||g.destination,
    name:name_tc||name_en,name_en,name_tc,lat,lng,seq:k+1,order:k,variants:[]});}
  const row=rows.get(k);if(!row.variants.some(v=>itemID(v)===itemID(it)))row.variants.push(it);
 }
 // Citybus names are mixed case with road context; prefer them for display.
 for(const row of rows.values()){const ctb=row.variants.find(v=>v.operator==='CTB'&&v.name_en);
  if(ctb){row.name_en=ctb.name_en;if(ctb.name_tc)row.name_tc=ctb.name_tc;row.name=ctb.name_tc||ctb.name||row.name;}}
 // A pole not on the official trip is a special-departure stop (e.g. 680 via
 // Chung On) and is hidden, unless it was picked from Nearby or has no
 // position yet; those stay right after the operator's previous matched stop.
 const focus=new Set(state.nearbyFocus?.route===g.route?state.nearbyFocus.keys:[]);
 for(const it of loose){if(goodPosition(it)&&!focus.has(nativeLinkKey(it)))continue;const before=[...pick.assigned].filter(([v,k])=>v.operator===it.operator&&Number(v.seq)<Number(it.seq)).map(([,k])=>k);
  const order=(before.length?Math.max(...before):-1)+0.5;
  rows.set('loose|'+itemID(it),{route:g.route,direction:g.direction,destination:g.destination,destination_en:g.destination_en||'',destination_tc:g.destination_tc||g.destination,
   name:it.name||'Loading stop name…',name_en:it.name_en||'',name_tc:it.name_tc||it.name||'',lat:it.lat,lng:it.lng,seq:Number(it.seq)||0,order,variants:[it]});}
 const out=[...rows.values()].sort((a,b)=>a.order-b.order),pos=state.position;
 for(const c of out){const ds=pos?c.variants.filter(goodPosition).map(v=>distance(pos.lat,pos.lng,v.lat,v.lng)):[];
  c.distance=ds.length?Math.min(...ds):null;c.farthestDistance=ds.length?Math.max(...ds):null;delete c.order;}
 return out;
}
// Full adult fare from the Transport Department list: the regular trip of one
// of the group's operators whose destination matches, else the only fare.
const fareKey=v=>String(v||'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9\u3400-\u9FFF]/g,'');
function routeFare(g){
 const rows=(state.tdFares.get(g.route)||[]).filter(([company])=>(g.operators||g.items?.map(x=>x.operator)||[]).some(op=>company.split('+').includes(op)));
 if(!rows.length)return null;
 const dest=fareKey(g.destination_en),destTC=fareKey(g.destination_tc);
 const hit=rows.find(r=>(dest&&(fareKey(r[3]).startsWith(dest)||dest.startsWith(fareKey(r[3]))))||(destTC&&fareKey(r[4])===destTC));
 const fares=[...new Set(rows.map(r=>r[2]))];
 return hit?hit[2]:fares.length===1?fares[0]:null;
}
const fareLabel=f=>f===null||f===undefined?'':'$'+Number(f).toFixed(1);
// A joint route's catalogue direction that matches none of the Transport
// Department's trips is stale (e.g. a Citybus 110 "inbound" left over from
// before the route became circular), so it is left out of search.
const staleCache=new WeakMap();
function notOnOfficialList(g){
 const trips=state.tdRoutes.get(g.route);
 if(!trips||state.demo)return false;
 const hit=staleCache.get(g);if(hit&&hit.trips===trips)return hit.stale;
 const stale=g.operators.every(op=>{const own=g.items.filter(it=>it.operator===op&&String(it.service_type||'1')==='1'),placed=own.filter(goodPosition);
  return placed.length>=3&&!trips.some(t=>tdAlign(placed,t.stops).size>=placed.length*0.7);});
 staleCache.set(g,{trips,stale});return stale;
}
// Fare from each stop (Transport Department section fares, td-fares.json).
// Loaded the first time a route is opened, then matched to the listed stops
// by position along the best-fitting official trip.
let stopFaresLoading=null;
function loadStopFares(){
 stopFaresLoading??=fetch('./td-fares.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();})
  .then(doc=>{if(doc.schema_version!==1||!doc.routes)throw Error('Invalid td-fares.json');state.stopFares=new Map(Object.entries(doc.routes));})
  .catch(err=>{console.warn('Stop fares unavailable:',err.message);state.stopFares=new Map();});
 return stopFaresLoading;
}
const stopFareCache=new WeakMap();
function stopFares(rows,g){
 if(!state.stopFares||!g)return null;
 const cached=stopFareCache.get(rows);if(cached)return cached;
 const ops=g.operators||[...new Set(g.items?.map(x=>x.operator)||[])];
 const trips=(state.stopFares.get(g.route)||[]).filter(t=>ops.some(op=>t.company.split('+').includes(op)));
 const points=rows.map(r=>{const v=r.variants.find(goodPosition);return v?{lat:v.lat,lng:v.lng}:{lat:null,lng:null};});
 const placed=points.filter(goodPosition).length;
 let best=null,bestCount=0;
 for(const t of trips){const stops=t.stops.map(([lat,lng,fare])=>[0,0,fare,lat,lng]),hit=tdAlign(points,stops);
  if(hit.size>bestCount){bestCount=hit.size;best={stops,hit};}}
 const out=new Array(rows.length).fill(null);
 if(best&&bestCount>=placed*0.6)points.forEach((pt,i)=>{const k=best.hit.get(pt);if(k!==undefined&&best.stops[k][2])out[i]=best.stops[k][2];});
 stopFareCache.set(rows,out);return out;
}
async function loadTDRoutes(){
 try{const response=await fetch('./td-routes.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
  const doc=await response.json();if(doc.schema_version!==1||!doc.routes)throw Error('Invalid td-routes.json');
  state.tdRoutes=new Map(Object.entries(doc.routes));state.tdFares=new Map(Object.entries(doc.fares||{}));
  if(state.view==='browse')render();
 }catch(err){console.warn('Official TD stop list unavailable; using operator matching:',err.message);}
}
// A joint-route stop missing from stop-links.json (e.g. 680 Central Library,
// KMB and Citybus poles ~165 m apart) is left as two adjacent rows. Merge two
// neighbouring single-operator rows of different operators when neither pole
// has an audited link and they share a landmark name within 250 m, or are
// within 60 m (termini named differently, e.g. "POKFIELD ROAD BUS TERMINUS").
function mergeUnlinkedNeighbours(rows){
 const single=r=>{const ops=new Set(r.variants.map(v=>v.operator));return ops.size===1?[...ops][0]:null;};
 const unlinked=r=>r.variants.every(v=>goodPosition(v)&&!state.stopLinkLookup.has(nativeLinkKey(v)));
 const out=[];
 for(const row of rows){
  const prev=out.at(-1),a=prev&&single(prev),b=single(row);
  if(a&&b&&a!==b&&unlinked(prev)&&unlinked(row)&&
     prev.variants.every(x=>row.variants.every(y=>{const d=distance(x.lat,x.lng,y.lat,y.lng);return d<=60||(d<=250&&commonStopLandmark(x,y));}))){
   prev.variants.push(...row.variants);
   const ctb=prev.variants.find(v=>v.operator==='CTB'&&v.name_en);
   if(ctb){prev.name_en=ctb.name_en;if(ctb.name_tc)prev.name_tc=ctb.name_tc;prev.name=ctb.name_tc||ctb.name||prev.name;}
   prev.distance=[prev.distance,row.distance].filter(x=>x!==null).reduce((m,x)=>Math.min(m,x),Infinity);if(prev.distance===Infinity)prev.distance=null;
   prev.farthestDistance=[prev.farthestDistance,row.farthestDistance].filter(x=>x!==null).reduce((m,x)=>Math.max(m,x),-Infinity);if(prev.farthestDistance===-Infinity)prev.farthestDistance=null;
   continue;
  }
  out.push(row);
 }
 return out;
}
function orderJourneyStops(clusters){
 if(!clusters.length)return clusters;
 const preference=['KMB','LWB','CTB'];
 const reference=preference.find(op=>clusters.some(s=>s.variants.some(v=>v.operator===op)))||clusters[0].variants[0].operator;
 const primarySeq=s=>Math.min(...s.variants.filter(v=>v.operator===reference).map(v=>Number(v.seq)||9999));
 const referenceRows=clusters.filter(s=>s.variants.some(v=>v.operator===reference));
 const referenceMaximum=Math.max(1,...referenceRows.map(primarySeq).filter(Number.isFinite));
 const otherOps=[...new Set(clusters.flatMap(s=>s.variants.map(v=>v.operator)))].filter(x=>x!==reference);
 const adjustedSequence=new Map();
 for(const op of otherOps){
  const anchors=clusters.flatMap(s=>{
   const alternate=s.variants.filter(v=>v.operator===op);
   if(!alternate.length||!s.variants.some(v=>v.operator===reference))return [];
   return [{foreign:Math.min(...alternate.map(v=>Number(v.seq)||9999)),main:primarySeq(s)}];
  }).sort((a,b)=>a.foreign-b.foreign);
  const alternateMax=Math.max(1,...clusters.flatMap(s=>s.variants.filter(v=>v.operator===op).map(v=>Number(v.seq)||0)));
  for(const s of clusters){
   if(s.variants.some(v=>v.operator===reference)||!s.variants.some(v=>v.operator===op))continue;
   const foreign=Math.min(...s.variants.filter(v=>v.operator===op).map(v=>Number(v.seq)||9999));
   let position;
   if(!anchors.length){position=(foreign/alternateMax)*referenceMaximum;}
   else{
    const before=anchors.filter(a=>a.foreign<foreign).at(-1);
    const after=anchors.find(a=>a.foreign>foreign);
    if(before&&after){
     position=before.main+(after.main-before.main)*(foreign-before.foreign)/(after.foreign-before.foreign);
    }else if(before){position=before.main+(foreign-before.foreign)*0.5;}
    else if(after){position=after.main-(after.foreign-foreign)*0.5;}
    else position=(foreign/alternateMax)*referenceMaximum;
   }
   const previous=adjustedSequence.get(s);
   if(previous===undefined||position<previous)adjustedSequence.set(s,position);
  }
 }
 const sortable=clusters.map((s,i)=>({s,i,score:s.variants.some(v=>v.operator===reference)?primarySeq(s):adjustedSequence.get(s)??s.seq}));
 sortable.sort((a,b)=>a.score-b.score||a.i-b.i);
 // Displayed ordinal is the sequence of merged boarding locations, NOT any
 // operator-native stop seq. Native seq is retained on each variant for ETAs.
 return sortable.map(({s},index)=>({...s,stopNumber:index+1,totalStops:sortable.length}));
}
// Bring a stop row into view by scrolling only the route dialog, not the page
// behind it (Safari's scrollIntoView also moved the page and hid the header).
function scrollToStop(row){if(!row)return;const modal=row.closest('.modal');
 for(let el=row.parentElement;el;el=el===modal?null:el.parentElement){if(el.scrollHeight<=el.clientHeight+1||getComputedStyle(el).overflowY==='visible')continue;
  el.scrollTop+=row.getBoundingClientRect().top-el.getBoundingClientRect().top-el.clientHeight/3;}}
function dialog(title){$('#modalTitle').textContent=title;$('#modalScrim').classList.remove('hidden');$('#modalBody').innerHTML='<p class="hint loading">Loading…</p>';const panel=$('#modalScrim .modal');if(panel)panel.scrollTop=0;}
function closeDialog(){state.dialogToken++;if(stopObserver){stopObserver.disconnect();stopObserver=null;}state.expandedStopKey=null;state.nearbyFocus=null;state.routeRetry=null;$('#modalScrim').classList.add('hidden');state.currentGroup=null;state.currentStop=null;}
// Nearby's ETA-first card is a route entry, not an isolated ETA dialog.
// Retain its exact native boarding stop IDs while resolving the complete
// operator route-stop lists. This also works for night routes missing from
// the third-party discovery catalogue.
async function openGroup(key,nearbyCard=null){
 const groups=state.view==='nearby'?makeGroups(state.nearby):routeResults();
 let group=nearbyCard?{
  key:nearbyCard.route+'|'+nearbyCard.direction,route:nearbyCard.route,
  direction:nearbyCard.direction,items:nearbyCard.variants.slice(),
  operators:[...new Set(nearbyCard.variants.map(v=>v.operator))],
  destination:nearbyCard.destination_tc||nearbyCard.destination_en||'',
  destination_en:nearbyCard.destination_en||'',
  destination_tc:nearbyCard.destination_tc||''
 }:groups.find(g=>g.key===key);
 if(!group||!group.items?.length)return;
 const selected=nearbyCard?
  (nearbyCard.variants.find(v=>v.operator===nearbyCard.next?.operator&&v.direction===nearbyCard.next?.direction)||nearbyCard.variants[0]):
  group.items[0];
 // The modal opens at stop 1. A marked boarding stop and optional jump
 // control preserve the convenience of the Nearby list without reordering.
 const picked=nearbyCard?nearbyCard.variants:
  state.view==='nearby'?[nearbyBoardingItem(group)].filter(Boolean):[];
 state.nearbyFocus=picked.length?{route:group.route,keys:picked.map(nativeLinkKey)}:null;
 const token=++state.dialogToken;
 state.routeRetry={key,nearbyCard};
 state.currentGroup=group;state.currentStop=null;state.routeFailures=[];state.loadingNames=0;state.expandedStopKey=null;
 dialog(group.route+' → '+localizedDestination(group));
 $('#modalBody').innerHTML='<p class="hint loading">Verifying complete route and stop order…</p>';
 try{
  await ensurePhysicalRoute(group.route);
  if(token!==state.dialogToken)return;
  // Resolve the selected native operator/direction first: a joint route
  // may use opposite O/I direction codes for KMB and Citybus.
  const resolved=physicalDirection(selected,new Set(group.items.map(x=>x.operator)));
  const correctedKey=group.route+'|'+resolved;
  const matchesTrip=g=>g.route===group.route&&g.items.some(v=>
   v.operator===selected.operator&&v.direction===selected.direction);
  const full=state.groups.find(g=>g.key===correctedKey&&matchesTrip(g))||
   state.groups.find(matchesTrip);
  group=full||group;
  if(nearbyCard){
   const items=group.items.slice();
   // Include the selected live native stop even when the catalogue omits
   // this route or its service type; it will be re-verified by officialGroup.
   for(const v of nearbyCard.variants)if(!items.some(x=>
     x.operator===v.operator&&x.direction===v.direction&&x.stop_id===v.stop_id))items.push(v);
   group={...group,items,operators:[...new Set(items.map(v=>v.operator))],
    destination:nearbyCard.destination_tc||group.destination,
    destination_en:nearbyCard.destination_en||group.destination_en||'',
    destination_tc:nearbyCard.destination_tc||group.destination_tc||''};
  }
  state.currentGroup=group;
  $('#modalTitle').textContent=group.route+' → '+localizedDestination(group);
  $('#modalBody').innerHTML='<p class="hint loading">Checking all verified stops from first stop to terminus…</p>';
  await Promise.all([stopLinksReady,tdRoutesReady]);
  if(token!==state.dialogToken)return;
  const data=await officialGroup(group,nearbyCard?.variants||[]);
  if(token!==state.dialogToken)return;
  state.verified=data.stops;state.routeFailures=data.warnings;state.loadingNames=data.missing.length;
  const panel=$('#modalScrim .modal');if(panel)panel.scrollTop=0;
  // Opened from Nearby: start expanded and scrolled at the boarding stop.
  const focus=state.nearbyFocus?.route===group.route?new Set(state.nearbyFocus.keys):null;
  const focusIndex=focus?.size?state.verified.findIndex(s=>s.variants.some(v=>focus.has(nativeLinkKey(v)))):-1;
  if(focusIndex>=0)state.expandedStopKey=stopKey(state.verified[focusIndex]);
  drawStopPicker(token);void resolveStopDetails(data,group,token);
  void loadStopFares().then(()=>{if(token===state.dialogToken)drawStopPicker(token);});
  if(focusIndex>=0){scrollToStop($(`#modalBody [data-stop-index="${focusIndex}"]`));void updateRowETA(focusIndex,token);}
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
   return ds.length?esc(names[op]||op)+': '+distanceText(Math.min(...ds)):'';
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
 const listScrollTop=$('#modalBody .stop-list')?.scrollTop||0;
 const closestIndex=state.position&&state.verified.length?state.verified.reduce((best,s,i)=>s.distance!==null&&(best<0||s.distance<state.verified[best].distance)?i:best,-1):-1;
 const focus=state.nearbyFocus?.route===state.currentGroup?.route?new Set(state.nearbyFocus.keys):null;
 const focusIndex=focus?.size?state.verified.findIndex(s=>s.variants.some(v=>focus.has(nativeLinkKey(v)))):-1;
 const highlightedIndex=focusIndex>=0?focusIndex:closestIndex;
 let body='<div class="stop-picker-caption">Select your boarding stop</div>';
 if(state.verified.length){const fare=state.currentGroup?routeFare(state.currentGroup):null;body+='<p class="small-note journey-summary">'+fmt(state.verified.length)+' stops'+(fare!==null?' · Full fare '+fareLabel(fare):'')+' · Ordered from first stop to terminus</p>';}
 if(state.routeFailures.length)body+='<div class="notice">Some operators could not be loaded: '+esc(state.routeFailures.join('; '))+'</div>';
 if(state.loadingNames>0)body+='<p class="small-note" aria-live="polite">'+fmt(state.loadingNames)+' stop names are being verified in the background.</p>';
 if(!state.verified.length)body+='<div class="notice">No verified stops available for this service.</div>';
 const fares=stopFares(state.verified,state.currentGroup);
 if(state.verified.length)body+='<div class="result-list stop-list">'+state.verified.map((s,i)=>{
 const expanded=state.expandedStopKey===stopKey(s);
  const spread=s.distance!==null&&s.farthestDistance!==null&&s.farthestDistance-s.distance>25;
  const distanceLabel=(s.distance!==null?' · '+esc(distanceText(s.distance,spread?s.farthestDistance:s.distance)):'')+(fares?.[i]?' · <span class="stop-fare">'+fareLabel(fares[i])+'</span>':'');
 return '<div class="stop-row" data-stop-index="'+i+'"><button class="stop-main" type="button" data-action="expandStop" data-index="'+i+'" aria-expanded="'+String(expanded)+'"><span class="stop-ordinal" aria-label="Stop '+(i+1)+'">'+(i+1)+'</span><span class="stop-label"><strong>'+esc(localizedStop(s))+'</strong><small>'+operatorChips([...new Set(s.variants.map(x=>x.operator))])+distanceLabel+(i===highlightedIndex?' <span class="nearest-label">'+(focusIndex>=0?(state.nearbyFocus?.saved?(state.lang==='tc'?'已收藏上車站':'Your saved stop'):state.lang==='tc'?'附近上車站':'Your nearby stop'):(state.lang==='tc'?'最近':'Nearest'))+'</span>':'')+'</small></span><span class="stop-next" data-eta-first="'+i+'">'+stopETAMarkup(s)+'</span><span class="stop-chevron" aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span></button>'+(expanded?stopExpandedMarkup(s):'')+'</div>';
 }).join('')+'</div>';
 $('#modalBody').innerHTML=body;
 if(modal)modal.scrollTop=scrollTop;
 const newList=$('#modalBody .stop-list');if(newList)newList.scrollTop=listScrollTop;
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
const etaPending=new Map();
async function getETA(it,force=false){const key=itemID(it),old=state.etas.get(key);if(!force&&old&&Date.now()-old.time<45000)return old;
 // Favourites, stop rows and the timer can ask for the same stop at once.
 if(!force&&etaPending.has(key))return etaPending.get(key);
 const task=fetchETA(it,key);etaPending.set(key,task);
 try{return await task;}finally{if(etaPending.get(key)===task)etaPending.delete(key);}}
async function fetchETA(it,key){
 try{const json=await requestJSON(etaURL(it),14000);if(!Array.isArray(json.data))throw Error('Invalid ETA JSON');
 const now=Date.now();const arr=json.data.filter(x=>clean(x.route)===it.route && (!x.dir||x.dir===it.direction) && (!x.stop||clean(x.stop)===it.stop_id) && x.eta)
 .map(x=>({at:Date.parse(x.eta),operator:it.operator,remark:String((state.lang==='en'?x.rmk_en:x.rmk_tc)||x.rmk_en||x.rmk_tc||'')})).filter(x=>Number.isFinite(x.at)&&x.at>=now-30000&&x.at<=now+10800000).sort((a,b)=>a.at-b.at);
 const out={time:Date.now(),arr:arr.slice(0,3)};state.etas.set(key,out);return out;
 }catch(e){const out={time:Date.now(),arr:[],error:e.message};state.etas.set(key,out);return out;}}
function isFavourite(s){return state.favourites.some(f=>favID(f)===favID(s));}
function drawETA(s,results,token){if(token!==state.dialogToken)return;
 const errs=results.filter(x=>x.error),etas=results.flatMap(x=>x.arr||[]).sort((a,b)=>a.at-b.at).slice(0,6),fav=isFavourite(s);
 let html=`<div class="detail"><strong>${esc(localizedStop(s))}</strong><p class="hint">${state.lang==='tc'?'往':'To'} ${esc(localizedDestination(s))}<br>${operatorChips([...new Set(s.variants.map(x=>x.operator))])}</p></div><div class="group-heading">Next bus arrivals · HK time ${esc(hkTime())}</div>`;
 if(state.demo)html+='<div class="notice">Demo sample only — arrival predictions are not live.</div>';
 if(errs.length)html+='<div class="notice">API request error: '+esc(errs.map(x=>x.error).join(' · '))+'. Check your network or browser API permissions.</div>';
 if(etas.length)html+='<div class="eta-large">'+etas.map(x=>{const mins=Math.max(0,Math.ceil((x.at-Date.now())/60000));return `<div class="eta-chip"><strong>${mins===0?'Due':mins}</strong><small>${esc(names[x.operator])} · ${mins?'min':'now'}</small></div>`;}).join('')+'</div>';
 else if(!errs.length)html+='<p class="hint">No ETA predicted by the operator for this verified stop right now. This is not necessarily a cancelled service.</p>';
 html+=`<div class="two-buttons"><button class="primary-button" data-action="toggleFav">${fav?'★ Remove favourite':'☆ Add favourite'}</button><button class="ghost-button" data-action="refreshStop">↻ Refresh</button></div>${state.currentGroup?'<button class="back-link" data-action="backToStops">← Other stops on this route</button>':''}`;
 $('#modalBody').innerHTML=html;}
async function showStop(s,force=false){const token=++state.dialogToken;state.currentStop=s;dialog(s.route+' · '+localizedStop(s));
 $('#modalBody').innerHTML='<p class="hint loading">Requesting real-time arrivals from official operators…</p>';
 if(state.demo){const time=Date.now();drawETA(s,[{arr:[3,12,24].map(m=>({at:time+m*60000,operator:s.variants[0].operator}))}],token);return;}
 const result=await Promise.all(s.variants.map(x=>getETA(x,force)));drawETA(s,result,token);}
function toggleFav(){const s=state.currentStop;if(!s||state.demo){banner('Switch to Live mode to save favourites.');return;}
 const idx=state.favourites.findIndex(f=>favID(f)===favID(s));if(idx<0)state.favourites.push({...s});else state.favourites.splice(idx,1);
 persist('hkbus_favourites_v2',state.favourites);showStop(s);render();}
function openFavourite(index){const f=(state.demo?demoStops:state.favourites)[index];state.currentGroup=null;if(f)showStop(f);}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
// Public stop-level ETA APIs make it possible to check ALL routes calling one
// unique stop in one request. In particular, Citybus uses the Digital Policy
// Office batch API; it is NOT the route-specific CTB ETA URL.
const NEARBY_ETA_TTL=55000;
const NEARBY_ETA_CONCURRENCY=5;
function nearbyStopKey(it){return (it.operator==='CTB'?'CTB':'KMB')+'|'+it.stop_id;}
function nearbyStopETAURL(it){return it.operator==='CTB'?
 'https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/'+encodeURIComponent(it.stop_id):
 'https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/'+encodeURIComponent(it.stop_id);}
function parseNearbyETA(it,json){
 if(!Array.isArray(json?.data))throw Error('Invalid stop-level ETA response');
 const map=new Map(),now=Date.now();
 for(const x of json.data){
  const route=clean(x.route),direction=clean(x.dir||x.bound),at=Date.parse(x.eta||'');
  if(!route||!['I','O'].includes(direction)||!Number.isFinite(at)||at<now-30000||at>now+10800000)continue;
  // Never attach another stop's ETA to this boarding location.
  if(x.stop&&clean(x.stop)!==it.stop_id)continue;
  const key=route+'|'+direction;
  if(!map.has(key))map.set(key,[]);
  map.get(key).push({at,operator:clean(x.co)==='LWB'?'LWB':it.operator,stop_id:it.stop_id,route,direction,
    service_type:String(x.service_type||'1'),destination_en:String(x.dest_en||x.dest||''),destination_tc:String(x.dest_tc||'')||catalogueDestinationTC(it.operator,route,direction)});
 }
 for(const a of map.values())a.sort((x,y)=>x.at-y.at);
 return map;
}
async function getNearbyStopETA(it,force=false){
 const key=nearbyStopKey(it),previous=nearbyETAState.cache.get(key);
 if(!force&&previous&&Date.now()-previous.time<NEARBY_ETA_TTL)return previous;
 // Location change and tab switching must not double-request the same stop.
 if(nearbyETAState.inFlight.has(key))return nearbyETAState.inFlight.get(key);
 const task=(async()=>{
  try{
   const j=await requestJSON(nearbyStopETAURL(it),11000),routes=parseNearbyETA(it,j);
   const entry={time:Date.now(),routes,stop:it};nearbyETAState.cache.set(key,entry);return entry;
  }catch(e){
   const entry={time:Date.now(),routes:new Map(),stop:it,error:e.message};nearbyETAState.cache.set(key,entry);return entry;
  }
 })();
 nearbyETAState.inFlight.set(key,task);
 try{return await task;}finally{if(nearbyETAState.inFlight.get(key)===task)nearbyETAState.inFlight.delete(key);}
}
function nearbyGroupETA(g){
 let arrival=null,pending=false,failed=false;
 const visited=new Set(),now=Date.now();
 for(const it of g.items){
  const key=nearbyStopKey(it);if(visited.has(key+'|'+it.route+'|'+it.direction))continue;
  visited.add(key+'|'+it.route+'|'+it.direction);
  const record=nearbyETAState.cache.get(key);
  if(!record||now-record.time>NEARBY_ETA_TTL){pending=true;continue;}
  if(record.error){failed=true;continue;}
  const options=record.routes.get(it.route+'|'+it.direction)||[];
  const next=options.find(x=>x.at>=now-30000);
  if(next&&(!arrival||next.at<arrival.at)){
   arrival={...next,stopName:state.lang==='tc'?(it.name_tc||it.name):(it.name_en||it.name)};
  }
 }
 return {arrival,pending,failed:failed&&!pending&&!arrival};
}
function nearbyLiveCards(){
 const now=Date.now(),pos=state.position;
 if(!pos)return [];
 const candidates=new Map();
 for(const meta of nearbyETAState.scanStops){
  const entry=nearbyETAState.cache.get(nearbyStopKey(meta));
  if(!entry||entry.error||now-entry.time>NEARBY_ETA_TTL)continue;
  const dist=distance(pos.lat,pos.lng,meta.lat,meta.lng);
  if(dist>state.radius+15)continue;
  for(const arrivals of entry.routes.values()){
   const next=arrivals.find(x=>x.at>=now-30000);if(!next)continue;
   const dest=next.destination_en||next.destination_tc||'';
   // Two different operator direction codes can have the SAME destination;
   // do not use raw inbound/outbound letters as the shared journey key.
   const key=next.route+'|'+(dest?clean(dest).replace(/[^A-Z0-9]/g,''):next.operator+'|'+next.direction);
   if(!candidates.has(key))candidates.set(key,[]);
   candidates.get(key).push({meta,next,dist,upcoming:arrivals.filter(x=>x.at>=now-30000).slice(0,3)});
  }
 }
 const cards=[];
 for(const entries of candidates.values()){
  entries.sort((a,b)=>a.next.at-b.next.at||a.dist-b.dist);
  const anchor=entries[0];if(!anchor)continue;
  const route=anchor.next.route;
  const makeVariant=r=>({operator:r.next.operator,route,direction:r.next.direction,
    stop_id:r.meta.stop_id,service_type:r.next.service_type||'1',lat:r.meta.lat,lng:r.meta.lng,
    name:r.meta.name||r.meta.name_tc||r.meta.name_en||'Bus stop',
    name_en:r.meta.name_en||r.meta.name||'',name_tc:r.meta.name_tc||r.meta.name||'',
    destination_en:r.next.destination_en||'',destination_tc:r.next.destination_tc||''});
  const variants=[makeVariant(anchor)];const selected=[anchor];
  // Include both carriers only when the government mapping confirms the
  // exact pair of native stop IDs. Same destination alone is not enough.
  const anchorKey=nativeLinkKey(variants[0]),mate=state.stopLinkLookup.get(anchorKey);
  if(mate){
   const compatible=entries.find(e=>e.next.operator!==anchor.next.operator&&
       nativeLinkKey(makeVariant(e))===mate&&distance(anchor.meta.lat,anchor.meta.lng,e.meta.lat,e.meta.lng)<=170);
   if(compatible){variants.push(makeVariant(compatible));selected.push(compatible);}
  }
  // Citybus generally publishes more readable mixed-case, road-qualified
  // names; prefer that for the combined label when available.
  const display=selected.find(e=>e.next.operator==='CTB'&&e.meta.name_en)||anchor;
  const readableDest=selected.find(e=>e.next.operator==='CTB'&&e.next.destination_en)?.next.destination_en||
    selected.find(e=>e.next.operator==='CTB'&&e.next.destination_en)?.next.destination_en||anchor.next.destination_en||'';
  const near=Math.min(...selected.map(e=>e.dist)),far=Math.max(...selected.map(e=>e.dist));
  cards.push({route,direction:anchor.next.direction,at:anchor.next.at,distance:near,distanceMax:far,
    name_en:display.meta.name_en||display.meta.name||'Bus stop',
    name_tc:display.meta.name_tc||display.meta.name||'巴士站',
    destination_en:readableDest,destination_tc:anchor.next.destination_tc||readableDest,
    next:anchor.next,times:selected.flatMap(e=>e.upcoming).sort((a,b)=>a.at-b.at).slice(0,3),
    operators:[...new Set(variants.map(v=>v.operator))],variants});
 }
 return cards.sort((a,b)=>a.at-b.at||a.distance-b.distance||a.route.localeCompare(b.route,'en',{numeric:true})).slice(0,100);
}
async function ensureOfficialKMBStops(){
 if(nearbyETAState.officialKMBPending)return nearbyETAState.officialKMBPending;
 if(nearbyETAState.officialKMB.length&&Date.now()-nearbyETAState.officialKMBLoadedAt<24*3600000)return;
 const task=(async()=>{
  try{
   let doc=await indexedGet('official_kmb_stop_list_v1');
   if(!doc?.time||Date.now()-doc.time>24*3600000||!Array.isArray(doc.stops)||doc.stops.length<1000){
    const response=await requestJSON('https://data.etabus.gov.hk/v1/transport/kmb/stop',20000);
    if(!Array.isArray(response.data)||response.data.length<1000)throw Error('Invalid official KMB stop list');
    const stops=response.data.map(v=>({operator:'KMB',stop_id:clean(v.stop),
      name_en:String(v.name_en||''),name_tc:String(v.name_tc||''),name:v.name_tc||v.name_en||'',
      lat:latlon(v.lat),lng:latlon(v.long??v.lng)})).filter(x=>/^[0-9A-F]{16}$/.test(x.stop_id)&&goodPosition(x));
    if(stops.length<1000)throw Error('Incomplete KMB stop coordinates');
    doc={time:Date.now(),stops};void indexedPut('official_kmb_stop_list_v1',doc);
   }
   nearbyETAState.officialKMB=doc.stops;nearbyETAState.officialKMBLoadedAt=doc.time;nearbyETAState.officialKMBError=null;
  }catch(e){nearbyETAState.officialKMBError=e.message;console.warn('Official KMB stop inventory unavailable; continuing with catalogue:',e.message);}
 })();
 nearbyETAState.officialKMBPending=task;
 try{await task}finally{nearbyETAState.officialKMBPending=null;if(state.view==='nearby'&&state.position)startNearbyETAScan();}
}
function nearbyScanCandidates(){
 const pos=state.position;if(!pos)return [];
 const near=it=>goodPosition(it)&&distance(pos.lat,pos.lng,it.lat,it.lng)<=state.radius;
 const byKey=new Map();
 // Catalogue stops provide Citybus coverage, and act as a fallback when the
 // operator's whole-stop inventory is temporarily unavailable.
 const verifiedKMBIDs=new Set(nearbyETAState.officialKMB.map(v=>v.stop_id));
 for(const it of state.nearby)if(near(it)&&!(it.operator==='KMB'&&verifiedKMBIDs.has(it.stop_id)))byKey.set(nearbyStopKey(it),it);
 // Official KMB coordinates and stop names replace stale catalogue positions.
 const nearbyKMB=new Map();
 for(const it of nearbyETAState.officialKMB){if(!near(it))continue;
  nearbyKMB.set(it.stop_id,it);byKey.set(nearbyStopKey(it),it);
 }
 // Explicit government-mapped Citybus IDs can be sampled near KMB poles even
 // if the discovery catalogue omitted their route-stop associations. The
 // mapping does not prove an identical pole: use a nearby approximate seed;
 // where catalogue details are available, use those actual coordinates.
 if(nearbyKMB.size&&state.stopLinkLookup.size){
  const ctbCatalogue=new Map(state.catalogue.filter(x=>x.operator==='CTB').map(x=>[x.stop_id,x]));
  for(const [key,partner] of state.stopLinkLookup){
   const parts=key.split('|');if(parts[1]!=='KMB')continue;
   const origin=nearbyKMB.get(parts[3]);if(!origin)continue;
   const cp=partner.split('|'),stop_id=cp[3];if(!/^\d{6}$/.test(stop_id))continue;
   const current=byKey.get('CTB|'+stop_id);if(current)continue;
   const known=ctbCatalogue.get(stop_id);
   if(known&&goodPosition(known)&&!near(known))continue;
   byKey.set('CTB|'+stop_id,known||{operator:'CTB',stop_id,
     lat:origin.lat,lng:origin.lng,name:origin.name,name_en:origin.name_en,name_tc:origin.name_tc,
     approximate:true});
  }
 }
 return [...byKey.values()].filter(near).sort((a,b)=>distance(pos.lat,pos.lng,a.lat,a.lng)-distance(pos.lat,pos.lng,b.lat,b.lng));
}
function startNearbyETAScan(force=false){
 ++nearbyETAState.generation;
 const token=nearbyETAState.generation;
 if(!state.position){nearbyETAState.progress=null;return;}
 const all=nearbyScanCandidates();nearbyETAState.scanStops=all;
 const remaining=all.filter(it=>{
  const prior=nearbyETAState.cache.get(nearbyStopKey(it));return force||!prior||Date.now()-prior.time>=NEARBY_ETA_TTL;
 });
 const progress={token,total:all.length,checked:all.length-remaining.length,running:remaining.length>0};
 nearbyETAState.progress=progress;scheduleNearbyResults();
 if(!remaining.length)return;
 let cursor=0;
 const worker=async()=>{
  while(token===nearbyETAState.generation&&cursor<remaining.length){
   const it=remaining[cursor++];await getNearbyStopETA(it,force);
   if(token!==nearbyETAState.generation)return;
   progress.checked++;scheduleNearbyResults();
  }
 };
 void Promise.all(Array.from({length:Math.min(NEARBY_ETA_CONCURRENCY,remaining.length)},()=>worker())).then(()=>{
  if(token===nearbyETAState.generation){progress.running=false;scheduleNearbyResults();}
 });
}
function populateNearby(){if(!state.position||!state.catalogue.length)return;
 if(!goodPosition(state.position)){state.nearby=[];banner('You appear to be outside Hong Kong; Nearby needs a Hong Kong GPS position.');render();return;}
 const {lat,lng}=state.position,limit=state.radius,la=limit/110900,lo=limit/(110900*Math.cos(lat*Math.PI/180));
 state.nearby=state.catalogue.filter(x=>goodPosition(x)&&Math.abs(x.lat-lat)<=la&&Math.abs(x.lng-lng)<=lo&&distance(lat,lng,x.lat,x.lng)<=limit);
 banner('');render();startNearbyETAScan();void ensureOfficialKMBStops();
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
function applyCatalogue(entries,date){state.catalogue=entries;state.groups=makeGroups(entries);state.catalogueDate=date||'Unknown';render();openPendingFavourite();if(state.view==='browse'&&state.query.trim())void ensurePhysicalRoute(clean(state.query));if(state.view==='nearby'&&!state.demo){if(state.position)populateNearby();else if(!state.locationRequested){state.locationRequested=true;locate();}}}
// The raw source document is cached (the compact file is ~1.5 MB), not the
// expanded rows, so IndexedDB reads and writes stay cheap.
const CATALOGUE_URL='./catalogue-compact.json',CATALOGUE_STORE='catalogue_v5';
async function loadCatalogue(){const saved=await indexedGet(CATALOGUE_STORE);
 if(saved?.doc){try{applyCatalogue(normalizeCatalogue(saved.doc),saved.doc.catalogue_date||saved.date);}catch{}}
 if(saved?.fetchedAt&&Date.now()-saved.fetchedAt<6*3600000)return;
 try{const res=await fetch(CATALOGUE_URL,{cache:'default'});if(!res.ok)throw Error('HTTP '+res.status);const json=await res.json();const entries=normalizeCatalogue(json);if(!entries.length)throw Error('Empty catalogue');applyCatalogue(entries,json.catalogue_date);await indexedPut(CATALOGUE_STORE,{doc:json,fetchedAt:Date.now()});}
 catch(e){if(!state.catalogue.length)banner('Could not load catalogue-compact.json: '+e.message+'. Import the JSON file in Settings.');}}
async function importCatalogue(file){try{const json=JSON.parse(await file.text()),entries=normalizeCatalogue(json);if(!entries.length)throw Error('Empty catalogue');applyCatalogue(entries,json.catalogue_date||'Imported');await indexedPut(CATALOGUE_STORE,{doc:json,date:state.catalogueDate,fetchedAt:Date.now()});banner('Imported '+fmt(entries.length)+' route-stop records.');}catch(e){banner('Catalogue import failed: '+e.message);}}
async function importFavourites(file){try{const json=JSON.parse(await file.text()),arr=Array.isArray(json)?json:Object.values(json);const previous=state.favourites;state.favourites=[...previous,...arr];restoreFavs();state.favourites=[...new Map(state.favourites.map(f=>[favID(f),f])).values()];persist('hkbus_favourites_v2',state.favourites);render();banner('Favourites imported.');}catch(e){banner('Import failed: '+e.message);}}
let inputTimer;
document.addEventListener('input',e=>{if(e.target.id==='routeSearch'){state.query=e.target.value;clearTimeout(inputTimer);inputTimer=setTimeout(()=>{if(state.view!=='browse')return;const el=$('#routeSearch'),pos=el.selectionStart;render();const next=$('#routeSearch');next.focus();next.setSelectionRange(pos,pos);if(state.query.trim()&&routeResults().length<=4&&routeResults().every(g=>g.route===clean(state.query))){const result=$('#routeResults');result?.scrollIntoView({block:'nearest',behavior:'smooth'});void ensurePhysicalRoute(clean(state.query));}},160);}});
document.addEventListener('change',e=>{if(e.target.id==='radiusSelect'){++nearbyETAState.generation;nearbyETAState.progress=null;state.radius=Number(e.target.value);if(state.position)populateNearby();else{state.nearby=[];render();locate();}}
 if(e.target.id==='catalogueFile'){const f=e.target.files?.[0];if(f)importCatalogue(f);e.target.value='';}
 if(e.target.id==='favouritesFile'){const f=e.target.files?.[0];if(f)importFavourites(f);e.target.value='';}});
document.addEventListener('click',e=>{const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
 if(action==='filterOp'){state.operator=el.dataset.value;render();if(state.query.trim()&&routeResults().every(g=>g.route===clean(state.query)))void ensurePhysicalRoute(clean(state.query));}
 if(action==='setLanguage'){state.lang=el.dataset.value==='tc'?'tc':'en';persist('hkbus_lang',state.lang);persist('dashboard_lang',state.lang);render();}
 if(action==='setStartPage'){const next=el.dataset.value;if(START_PAGES.includes(next)){state.startPage=next;persist('hkbus_start_page',next);render();}}
 if(action==='openGroup')openGroup(el.dataset.group);
 if(action==='showStopRoutes'){nearbyETAState.openStops.add(el.dataset.key);render();}
 if(action==='nearbyWarning'){const msg=state.lang==='tc'?'未能取得九巴完整巴士站資料，現使用已儲存站點。':'Official KMB stop inventory unavailable; using cached catalogue stops.';banner(state.notice===msg?'':msg);}
 if(action==='openNearbyETA'){const c=nearbyETAState.liveCards[Number(el.dataset.index)];if(c)void openGroup('',c);} 
 if(action==='openFavourite')openFavourite(Number(el.dataset.index));
 if(action==='expandStop'){const index=Number(el.dataset.index),s=state.verified[index];if(s){state.expandedStopKey=state.expandedStopKey===stopKey(s)?null:stopKey(s);drawStopPicker(state.dialogToken);if(state.expandedStopKey)void updateRowETA(index,state.dialogToken);}}
 if(action==='saveExpanded'){const s=state.verified.find(x=>stopKey(x)===state.expandedStopKey);if(s&&!state.demo){const idx=state.favourites.findIndex(f=>favID(f)===favID(s));if(idx>=0)state.favourites.splice(idx,1);else state.favourites.push({...s});persist('hkbus_favourites_v2',state.favourites);drawStopPicker(state.dialogToken);render();}}
 if(action==='refreshExpanded'){const index=state.verified.findIndex(x=>stopKey(x)===state.expandedStopKey);if(index>=0)void updateRowETA(index,state.dialogToken,true);}
 if(action==='selectStop'){const s=state.verified[Number(el.dataset.index)];if(s)showStop(s);}
 if(action==='backToStops'){++state.dialogToken;state.currentStop=null;$('#modalTitle').textContent=state.currentGroup?.route||'Stops';drawStopPicker(state.dialogToken);}
 if(action==='retryRoute'&&state.routeRetry){const {key,nearbyCard}=state.routeRetry;void openGroup(key,nearbyCard);}
 if(action==='refreshStop'&&state.currentStop)showStop(state.currentStop,true);
 if(action==='toggleFav')toggleFav();
 if(action==='locate')locate();
 if(action==='importCat')$('#catalogueFile').click();
 if(action==='importFav')$('#favouritesFile').click();
 if(action==='exportFav')download('hk-bus-favourites.json',state.favourites);
 if(action==='clearETAs'){state.etas.clear();nearbyETAState.cache.clear();banner('ETA cache cleared.');if(state.view==='nearby')startNearbyETAScan(true);}
 if(action==='clearFav'&&confirm(state.lang==='tc'?UI_ZH['Remove all saved favourites on this browser?']:'Remove all saved favourites on this browser?')){state.favourites=[];persist('hkbus_favourites_v2',[]);banner('Favourites cleared.');render();}
});
persist('hkbus_demo',false); // Retire any saved demo preference from earlier versions.
$('#refreshButton').addEventListener('click',()=>{state.etas.clear();nearbyETAState.cache.clear();state.routeStops.clear();state.routeOrientation.clear();state.routeOrientationPending.clear();persist(ROUTE_DIRECTION_STORAGE,{});state.groups=makeGroups(state.catalogue);banner('Caches refreshed.');render();if(state.view==='browse'&&state.query.trim())void ensurePhysicalRoute(clean(state.query));if(state.view==='nearby'&&state.position){startNearbyETAScan(true);void ensureOfficialKMBStops();}});
$('#closeModal').addEventListener('click',closeDialog);
$('#modalScrim').addEventListener('click',e=>{if(e.target.id==='modalScrim')closeDialog();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeDialog();});
// ETA feeds update roughly every minute. Re-check visible Nearby data without
// polling in other tabs or while Safari is in the background.
setInterval(()=>{
 if(state.view==='nearby'&&state.position&&state.nearby.length&&document.visibilityState==='visible')startNearbyETAScan();
},60000);
// Keep minutes current in the open route/stop dialog and on Favourites. ETAs
// older than the 45 s cache are re-requested; otherwise only the labels redraw.
async function refreshStopView(){const s=state.currentStop,token=state.dialogToken;
 const result=await Promise.all(s.variants.map(x=>getETA(x)));
 if(token!==state.dialogToken||state.currentStop!==s)return;
 const modal=$('#modalScrim .modal'),top=modal?.scrollTop||0;drawETA(s,result,token);if(modal)modal.scrollTop=top;}
function refreshVisibleStopRows(){
 const modal=$('#modalScrim .modal');if(!modal)return;const box=modal.getBoundingClientRect();
 for(const row of document.querySelectorAll('#modalBody [data-stop-index]')){
  const r=row.getBoundingClientRect();if(r.bottom<box.top-70||r.top>box.bottom+70)continue;
  void updateRowETA(Number(row.dataset.stopIndex),state.dialogToken);
 }
}
setInterval(()=>{
 if(document.visibilityState!=='visible'||state.demo)return;
 const modalOpen=!$('#modalScrim').classList.contains('hidden');
 if(modalOpen&&state.currentStop)void refreshStopView();
 else if(modalOpen&&state.verified.length)refreshVisibleStopRows();
 else if(state.view==='favourites')refreshFavouriteETAs();
},30000);
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&state.view==='nearby'&&state.position&&state.nearby.length)startNearbyETAScan();
 if(document.visibilityState==='visible'&&state.view==='favourites')refreshFavouriteETAs();
});
const stopLinksReady=loadOfficialStopLinks();
const tdRoutesReady=loadTDRoutes();
// The dashboard menu opens a favourite on its route's stop list, with the saved
// stop marked (#fav=ROUTE|STOP_ID). It waits for the catalogue to load.
const favLink=decodeURIComponent(location.hash).match(/^#fav=([^|]+)\|(.+)$/);
let favPending=favLink?state.favourites.find(f=>f.variants.some(v=>v.route===favLink[1]&&v.stop_id===favLink[2]))||null:null;
if(favPending)state.view='favourites';
function openPendingFavourite(){if(!favPending||!state.catalogue.length)return;const f=favPending;favPending=null;void openGroup('',f);if(state.nearbyFocus)state.nearbyFocus.saved=true;}
render();if(state.view==='nearby'&&!state.demo){state.locationRequested=true;locate();}loadCatalogue();
