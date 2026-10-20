'use strict';
/* MTR ETA v1.0. Only operator API timestamps and official CSV snapshots are displayed. */
const $=id=>document.getElementById(id);
const txt=(id,v)=>{const e=$(id);if(e)e.textContent=v};
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LINES={
 ISL:{en:'Island Line',tc:'港島綫',color:'#0878c3',stations:[['KET','Kennedy Town','堅尼地城'],['HKU','HKU','香港大學'],['SYP','Sai Ying Pun','西營盤'],['SHW','Sheung Wan','上環'],['CEN','Central','中環'],['ADM','Admiralty','金鐘'],['WAC','Wan Chai','灣仔'],['CAB','Causeway Bay','銅鑼灣'],['TIH','Tin Hau','天后'],['FOH','Fortress Hill','炮台山'],['NOP','North Point','北角'],['QUB','Quarry Bay','鰂魚涌'],['TAK','Tai Koo','太古'],['SWH','Sai Wan Ho','西灣河'],['SKW','Shau Kei Wan','筲箕灣'],['HFC','Heng Fa Chuen','杏花邨'],['CHW','Chai Wan','柴灣']]},
 TWL:{en:'Tsuen Wan Line',tc:'荃灣綫',color:'#e64d4d',stations:[['CEN','Central','中環'],['ADM','Admiralty','金鐘'],['TST','Tsim Sha Tsui','尖沙咀'],['JOR','Jordan','佐敦'],['YMT','Yau Ma Tei','油麻地'],['MOK','Mong Kok','旺角'],['PRE','Prince Edward','太子'],['SSP','Sham Shui Po','深水埗'],['CSW','Cheung Sha Wan','長沙灣'],['LCK','Lai Chi Kok','荔枝角'],['MEF','Mei Foo','美孚'],['LAK','Lai King','荔景'],['KWF','Kwai Fong','葵芳'],['KWH','Kwai Hing','葵興'],['TWH','Tai Wo Hau','大窩口'],['TSW','Tsuen Wan','荃灣']]},
 KTL:{en:'Kwun Tong Line',tc:'觀塘綫',color:'#16ae73',stations:[['WHA','Whampoa','黃埔'],['HOM','Ho Man Tin','何文田'],['YMT','Yau Ma Tei','油麻地'],['MOK','Mong Kok','旺角'],['PRE','Prince Edward','太子'],['SKM','Shek Kip Mei','石硤尾'],['KOT','Kowloon Tong','九龍塘'],['LOF','Lok Fu','樂富'],['WTS','Wong Tai Sin','黃大仙'],['DIH','Diamond Hill','鑽石山'],['CHH','Choi Hung','彩虹'],['KOB','Kowloon Bay','九龍灣'],['NTK','Ngau Tau Kok','牛頭角'],['KWT','Kwun Tong','觀塘'],['LAT','Lam Tin','藍田'],['YAT','Yau Tong','油塘'],['TIK','Tiu Keng Leng','調景嶺']]},
 TKL:{en:'Tseung Kwan O Line',tc:'將軍澳綫',color:'#9a76da',stations:[['NOP','North Point','北角'],['QUB','Quarry Bay','鰂魚涌'],['YAT','Yau Tong','油塘'],['TIK','Tiu Keng Leng','調景嶺'],['TKO','Tseung Kwan O','將軍澳'],['HAH','Hang Hau','坑口'],['POA','Po Lam','寶琳']]},
 TML:{en:'Tuen Ma Line',tc:'屯馬綫',color:'#b58b65',stations:[['WKS','Wu Kai Sha','烏溪沙'],['MOS','Ma On Shan','馬鞍山'],['HEO','Heng On','恆安'],['TSH','Tai Shui Hang','大水坑'],['SHM','Shek Mun','石門'],['CIO','City One','第一城'],['STW','Sha Tin Wai','沙田圍'],['CKT','Che Kung Temple','車公廟'],['TAW','Tai Wai','大圍'],['HIK','Hin Keng','顯徑'],['DIH','Diamond Hill','鑽石山'],['KAT','Kai Tak','啟德'],['SUW','Sung Wong Toi','宋皇臺'],['TKW','To Kwa Wan','土瓜灣'],['HOM','Ho Man Tin','何文田'],['HUH','Hung Hom','紅磡'],['ETS','East Tsim Sha Tsui','尖東'],['AUS','Austin','柯士甸'],['NAC','Nam Cheong','南昌'],['MEF','Mei Foo','美孚'],['TWW','Tsuen Wan West','荃灣西'],['KSR','Kam Sheung Road','錦上路'],['YUL','Yuen Long','元朗'],['LOP','Long Ping','朗屏'],['TIS','Tin Shui Wai','天水圍'],['SIH','Siu Hong','兆康'],['TUM','Tuen Mun','屯門']]},
 EAL:{en:'East Rail Line',tc:'東鐵綫',color:'#6bc3e5',stations:[['ADM','Admiralty','金鐘'],['EXC','Exhibition Centre','會展'],['HUH','Hung Hom','紅磡'],['MKK','Mong Kok East','旺角東'],['KOT','Kowloon Tong','九龍塘'],['TAW','Tai Wai','大圍'],['SHT','Sha Tin','沙田'],['FOT','Fo Tan','火炭'],['UNI','University','大學'],['TAP','Tai Po Market','大埔墟'],['TWO','Tai Wo','太和'],['FAN','Fanling','粉嶺'],['SHS','Sheung Shui','上水'],['LOW','Lo Wu','羅湖']]},
 TCL:{en:'Tung Chung Line',tc:'東涌綫',color:'#f5aa3a',stations:[['HOK','Hong Kong','香港'],['KOW','Kowloon','九龍'],['OLY','Olympic','奧運'],['NAC','Nam Cheong','南昌'],['LAK','Lai King','荔景'],['TSY','Tsing Yi','青衣'],['SUN','Sunny Bay','欣澳'],['TUC','Tung Chung','東涌']]},
 AEL:{en:'Airport Express',tc:'機場快綫',color:'#16bcb4',stations:[['HOK','Hong Kong','香港'],['KOW','Kowloon','九龍'],['TSY','Tsing Yi','青衣'],['AIR','Airport','機場'],['AWE','AsiaWorld-Expo','博覽館']]},
 SIL:{en:'South Island Line',tc:'南港島綫',color:'#b1c748',stations:[['ADM','Admiralty','金鐘'],['OCP','Ocean Park','海洋公園'],['WCH','Wong Chuk Hang','黃竹坑'],['LET','Lei Tung','利東'],['SOH','South Horizons','海怡半島']]},
 DRL:{en:'Disneyland Resort Line',tc:'迪士尼綫',color:'#ed85b8',stations:[['SUN','Sunny Bay','欣澳'],['DIS','Disneyland Resort','迪士尼']]}
};

const OPTIONS={en:{eyebrow:'HONG KONG · SMART DASHBOARD',home:'Dashboard',subtitle:'Your next train, at a glance.',live:'● LIVE MTR DATA',loading:'Contacting MTR…',ok:'Official MTR · Live',old:'Predictions are delayed',error:'Unable to reach MTR',choose:'Find your station',line:'MTR line',station:'Station',next:'Next trains',towards:'TOWARDS',refresh:'Refresh',nextDeparture:'NEXT TRAIN',minute:'min',to:'To',platform:'Platform',unavailable:'No upcoming trains',then:'Next',foot:'Official MTR Next Train estimates · refreshed approximately every 20 seconds. Verify platform signs before boarding.',save:'☆ Save station',saved:'★ Saved',stationInfo:'Station information →',favTitle:'Favourite stations',favHelp:'Tap a saved station to check live train arrivals.',noFav:'No favourites yet. Save a station from Next trains.',savedCount:'saved',faresHeader:'OFFICIAL FARE DATA',faresTitle:'Plan your fare',fareDesc:'Choose the origin and destination to view published adult fares.',fareFrom:'From',fareTo:'To',fareService:'Service',fareHeavy:'MTR network',fareAirport:'Airport Express',octopus:'Adult Octopus',single:'Single journey',notLoaded:'Fare unavailable',fareDisclaimer:'Fares reflect the bundled MTR source snapshot, and may change. Check MTR for current tariffs.',fareSource:'Open the official MTR fare dataset ↗',access:'Accessibility',exits:'Station exits',exitsDesc:'The supplied dataset does not provide a complete exit directory. Only accessibility-related exit references, where published, are shown above.',transfer:'Other lines at this station',settings:'Settings',interface:'Interface language',start:'Start page',about:'About MTR ETA',aboutDesc:'Train arrivals come from the MTR public API. Station fares and accessibility come from a separately generated monthly CSV snapshot; the app never estimates missing values.',coverage:'Official API coverage',coverageDesc:'10 MTR lines, up to 4 trains per direction (where provided). Light Rail and High Speed Rail are not in this Next Train API.',navETA:'Trains',navFav:'Favourites',navFares:'Fares',navStation:'Station',navSettings:'Settings',favAdded:'Station saved',favRemoved:'Station removed',dataTitle:'Official data snapshot',noFile:'Fare/accessibility snapshot not installed. Run build_mtr_data.py on your Mac and upload station-data.json.',noFare:'Fare for this station pair not published in the bundled dataset.',noAccess:'Verified accessibility information not available for this station.',noOther:'No interchange lines listed',delay:'MTR has flagged delayed service data. Confirm with station announcements.',special:'Special MTR service arrangement',refreshing:'Refreshing live times…',ago:'Updated',minutesAgo:'min ago',zero:'Due',unknown:'Destination unavailable',na:'—',errorRate:'MTR API rate limit reached. Try again shortly.',errorNet:'Train predictions unavailable. Check your connection and retry.',from:'From',minutes:'minutes'},
 tc:{eyebrow:'香港 · 智能交通資訊',home:'主頁',subtitle:'即時列車到站資訊，一目了然。',live:'● 港鐵即時資料',loading:'正在連接港鐵…',ok:'港鐵官方 · 即時',old:'列車資訊延遲',error:'未能連接港鐵',choose:'選擇港鐵車站',line:'港鐵路綫',station:'車站',next:'下一班列車',towards:'前往',refresh:'更新',nextDeparture:'下一班列車',minute:'分鐘',to:'往',platform:'月台',unavailable:'暫無即將抵達列車',then:'其後',foot:'數據來自港鐵官方下一班列車 API，約每 20 秒更新。請以月台顯示為準。',save:'☆ 收藏車站',saved:'★ 已收藏',stationInfo:'車站資料 →',favTitle:'我的收藏車站',favHelp:'按收藏車站查閱即時列車資訊。',noFav:'尚未收藏任何車站。請在「列車」頁面收藏。',savedCount:'個收藏',faresHeader:'港鐵官方車費',faresTitle:'查詢車費',fareDesc:'選擇起點及終點，查看已公布的成人車費。',fareFrom:'起點',fareTo:'終點',fareService:'車費類型',fareHeavy:'港鐵一般車費',fareAirport:'機場快綫',octopus:'成人八達通',single:'成人單程票',notLoaded:'車費資料暫缺',fareDisclaimer:'車費以已匯入的港鐵 CSV 資料版本為準，可能會調整，請核對港鐵最新資料。',fareSource:'查看港鐵官方車費資料 ↗',access:'無障礙設施',exits:'車站出口',exitsDesc:'所提供數據並非完整的車站出口清單。上方僅展示已公布與無障礙設施相關的出口資料。',transfer:'本站轉車路綫',settings:'設定',interface:'介面語言',start:'啟動畫面',about:'關於港鐵 ETA',aboutDesc:'列車資料來自港鐵官方 API。車費與無障礙資料來自另外製作的每月 CSV 快照；欠缺資料不會推算。',coverage:'官方 API 涵蓋範圍',coverageDesc:'10 條港鐵路綫；每方向最多四班列車（以資料供應為準）。此 API 不包括輕鐵及高速鐵路。',navETA:'列車',navFav:'收藏',navFares:'車費',navStation:'車站',navSettings:'設定',favAdded:'已收藏車站',favRemoved:'已取消收藏',dataTitle:'官方數據快照',noFile:'尚未安裝車費／無障礙資料。請在 Mac 執行 build_mtr_data.py 並上傳 station-data.json。',noFare:'已匯入數據中沒有這對車站的車費。',noAccess:'這個車站沒有可核實的無障礙資料。',noOther:'未列有其他轉車路綫',delay:'港鐵表示列車資訊延遲，請留意車站廣播。',special:'港鐵特別行車安排',refreshing:'正在更新列車資訊…',ago:'更新於',minutesAgo:'分鐘前',zero:'即將到站',unknown:'目的地資料暫缺',na:'—',errorRate:'港鐵 API 請求過於頻繁，請稍後再試。',errorNet:'無法取得列車時間。請檢查網絡並重新整理。',from:'由',minutes:'分鐘'}};
const D=S=>LINES[S]?.stations||[];
const stationByCode=new Map(Object.values(LINES).flatMap(line=>line.stations).map(row=>[row[0],row]));
// Supplement branches omitted from UI prototype; these are in the official API station list.
function addStations(){
 function add(line,s,pos){if(!D(line).some(x=>x[0]===s[0]))D(line).splice(pos,0,s)}
 add('EAL',['RAC','Racecourse','馬場'],9);add('EAL',['LMC','Lok Ma Chau','落馬洲'],D('EAL').length);
 add('TKL',['LHP','LOHAS Park','康城'],5);
 // Make sure shared map indexes supplement stations too.
 for(const item of Object.values(LINES).flatMap(l=>l.stations))stationByCode.set(item[0],item);
}
addStations();
// Admin mode: open any page once with ?admin=1 (or ?admin=0 to turn it off).
// It only hides Diagnostics & data from other people; it is not a security
// feature, since the site and its data are public.
const IS_ADMIN=(()=>{const q=new URLSearchParams(location.search).get('admin');
 try{if(q==='1')localStorage.setItem('dashboard_admin','1');else if(q==='0')localStorage.removeItem('dashboard_admin');return localStorage.getItem('dashboard_admin')==='1';}catch{return q==='1';}})();
const prefKey='mtr_eta_v1_prefs';
function load(){try{const p=JSON.parse(localStorage.getItem(prefKey)||'{}');return p&&typeof p==='object'?p:{}}catch{return {}}}
const prev=load();
const state={lang:['en','tc'].includes(prev.lang)?prev.lang:'en',start:['eta','favourites'].includes(prev.start)?prev.start:'eta',favourites:Array.isArray(prev.favourites)?prev.favourites:[],line:LINES[prev.line]?prev.line:'ISL',station:prev.station||'ADM',dir:prev.dir==='DOWN'?'DOWN':'UP',view:['eta','favourites'].includes(prev.start)?prev.start:'eta',api:null,apiKey:'',error:null,loading:false,request:0,receivedAt:0,stamp:0,official:null,dataError:null};
if(!D(state.line).some(s=>s[0]===state.station))state.station=D(state.line)[0][0];
const T=()=>OPTIONS[state.lang];const loc=s=>s?.[state.lang==='tc'?2:1]||s?.[1]||String(s?.[0]||'');
const name=code=>loc(stationByCode.get(code))||T().unknown;
function persist(){try{localStorage.setItem(prefKey,JSON.stringify({lang:state.lang,start:state.start,favourites:state.favourites,line:state.line,station:state.station,dir:state.dir}))}catch{}}
const fmtDollar=value=>typeof value==='number'&&Number.isFinite(value)?'HK$'+value.toFixed(2):T().notLoaded;
function parseHongKong(iso){if(typeof iso!=='string')return NaN;if(!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(iso))return NaN;return Date.parse(iso.replace(' ','T')+'+08:00')}
function minutesUntil(train){const diff=(train.timestamp-Date.now())/60000;return Math.max(0,Math.ceil(diff));}
function decodeTrain(raw){if(!raw||raw.valid==='N'||!raw.dest||!raw.time)return null;const at=parseHongKong(raw.time);if(!Number.isFinite(at))return null;const mins=minutesUntil({timestamp:at});if(mins>180||at<Date.now()-90000)return null;return {timestamp:at,dest:String(raw.dest),plat:raw.plat&&raw.plat!=='-'?String(raw.plat):null,ttnt:raw.ttnt,seq:Number(raw.seq)||0};}
async function getJSON(url,timeoutMs=12000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const res=await fetch(url,{cache:'no-store',signal:controller.signal});if(res.status===429)throw new Error('rate');if(!res.ok)throw new Error('HTTP '+res.status);return await res.json()}finally{clearTimeout(timer)}}
async function refresh(force=false){const key=state.line+'-'+state.station; if(state.loading&&key===state.apiKey&&!force)return;if(!force&&key===state.apiKey&&Date.now()-state.receivedAt<15500)return;
 state.loading=true;state.error=null;state.api=null;state.apiKey=key;const token=++state.request;renderETA();
 try{const url=`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${encodeURIComponent(state.line)}&sta=${encodeURIComponent(state.station)}&lang=${state.lang==='tc'?'TC':'EN'}`;
  const j=await getJSON(url);if(token!==state.request)return;
  if(j.status===0){state.error={special:j.message||T().special,url:/^https:\/\//.test(j.url||'')?j.url:''};state.api=null}
  else if(j.status!==1){state.error={message:j.message||'Unexpected API response'};state.api=null}
  else{const d=j.data?.[key]||{};const up=(Array.isArray(d.UP)?d.UP:[]).map(decodeTrain).filter(Boolean).sort((a,b)=>a.timestamp-b.timestamp);const down=(Array.isArray(d.DOWN)?d.DOWN:[]).map(decodeTrain).filter(Boolean).sort((a,b)=>a.timestamp-b.timestamp);
   state.api={UP:up,DOWN:down,delay:j.isdelay==='Y',sourceTime:parseHongKong(j.curr_time||j.sys_time||'')};state.receivedAt=Date.now();state.error=null;
   if(!state.api[state.dir].length&&state.api[state.dir==='UP'?'DOWN':'UP'].length)state.dir=state.dir==='UP'?'DOWN':'UP';
  }
 }catch(e){if(token===state.request)state.error={message:e.message==='rate'?T().errorRate:T().errorNet}}finally{if(token===state.request){state.loading=false;renderETA();}}
}
function lineName(l){return l?(state.lang==='tc'?l.tc:l.en):''}
function endStation(dir){const rows=D(state.line);return dir==='UP'?rows[rows.length-1]:rows[0]}
function trains(dir){return state.api?.[dir]||[]}
function directionHeading(dir){const v=trains(dir);return v.length?name(v[0].dest):loc(endStation(dir));}
function populateSelects(){const p=$('lineSelect').value||state.line;
 $('lineSelect').innerHTML=Object.entries(LINES).map(([code,l])=>`<option value="${safe(code)}">${safe(lineName(l))}</option>`).join('');$('lineSelect').value=state.line;
 $('stationSelect').innerHTML=D(state.line).map(s=>`<option value="${safe(s[0])}">${safe(loc(s))}</option>`).join('');$('stationSelect').value=state.station;
}
function renderETA(){const T_=T(),line=LINES[state.line];document.documentElement.style.setProperty('--accent',line.color);txt('routeDesc',lineName(line)+' · '+name(state.station));
 for(const dir of ['UP','DOWN']){const n=dir==='UP'?0:1;txt('directionSmall'+n,T_.towards);txt('directionName'+n,directionHeading(dir));$('dir'+n).classList.toggle('selected',state.dir===dir);}
 const all=trains(state.dir),first=all[0];$('etaMain').classList.toggle('empty',!first);
 txt('primaryLabel',T_.nextDeparture);txt('etaFoot',T_.foot);
 txt('etaNumber',state.loading?'···':first?(minutesUntil(first)===0?T_.zero:String(minutesUntil(first))):'—');txt('etaUnit',first?T_.minute:'');
 txt('platformChip',first?.plat?T_.platform+' '+first.plat:T_.platform+' —');
 $('etaDest').childNodes[0].textContent=first?T_.to+' '+name(first.dest):T_.unavailable;
 txt('etaSub',name(state.station)+' · '+lineName(line));
 let rest=all.slice(1,4);$('nextList').innerHTML=rest.length?rest.map((v,i)=>`<div class="nextbox"><strong>${minutesUntil(v)===0?safe(T_.zero):minutesUntil(v)+' <span class="minor">'+safe(T_.minute)+'</span>'}</strong><small>${safe(name(v.dest))}</small><small>${v.plat?safe(T_.platform+' '+v.plat):''}</small></div>`).join(''):'<div class="data-status" style="width:100%">'+safe(state.loading?T_.refreshing:state.error?.special||state.error?.message||T_.unavailable)+'</div>';
 const badge=$('demoBadge');badge.classList.toggle('warning',!!(state.loading||state.api?.delay));badge.classList.toggle('danger',!!state.error);txt('demoBadge',state.loading?T_.loading:state.error?T_.error:state.api?.delay?T_.old:T_.live);
 const age=state.receivedAt?Math.max(0,Math.floor((Date.now()-state.receivedAt)/60000)):null;txt('demoNote',state.error?.special||state.error?.message||(age===null?T_.loading:`${T_.ok} · ${age} ${T_.minutesAgo}`));
 const key=state.line+'|'+state.station;txt('favouriteToggle',state.favourites.includes(key)?T_.saved:T_.save);
}
function fareStations(){const all=new Map();for(const l of Object.values(LINES))for(const s of l.stations)all.set(s[0],s);
 const arr=[...all.values()].sort((a,b)=>loc(a).localeCompare(loc(b),state.lang==='tc'?'zh-HK':'en'));
 for(const select of [$('fareFrom'),$('fareTo')]){const old=select.value|| (select.id==='fareFrom'?'ADM':'CHW');select.innerHTML=arr.map(s=>`<option value="${safe(s[0])}">${safe(loc(s))}</option>`).join('');if(arr.some(s=>s[0]===old))select.value=old;}
}
function renderFare(){const d=state.official;const a=d?.codes?.[$('fareFrom').value],b=d?.codes?.[$('fareTo').value];const prices=$('fareService').value==='airport'?d?.airport_fares:d?.fares;const fare=prices?.[a+'|'+b];txt('octopusValue',fmtDollar(fare?.octopus));txt('singleValue',fmtDollar(fare?.single));txt('fareDisclaimer',d?T().fareDisclaimer+(fare?'':` ${T().noFare}`):T().noFile);}
function renderStation(){const s=stationByCode.get(state.station),names=Object.entries(LINES).filter(([code,l])=>l.stations.some(v=>v[0]===state.station)).map(([c,l])=>lineName(l));
 txt('infoStationName',loc(s));txt('infoLine',lineName(LINES[state.line]));
 const official=state.official,sid=official?.codes?.[state.station];const list=(official?.accessibility?.[sid]||[]);
 $('accessDesc').innerHTML=list.length?`<div class="access-list">${list.map(v=>`<div class="access-item">${safe(state.lang==='tc'?v.tc:v.en)}<small>${safe(state.lang==='tc'?v.note_tc:v.note_en)}</small></div>`).join('')}</div>`:safe(T().noAccess);
 txt('exitDesc',T().exitsDesc);txt('transferDesc',names.length>1?names.join(' · '):T().noOther);
}
function renderFav(){txt('favCount',state.favourites.length+' '+T().savedCount);
 $('favouriteList').innerHTML=state.favourites.length?state.favourites.map(key=>{const [c,id]=key.split('|');const l=LINES[c],s=l?.stations.find(row=>row[0]===id);if(!l||!s)return '';return `<button class="favourite-card" data-key="${safe(key)}"><span class="line-marker" style="background:${safe(l.color)}"></span><span class="label"><strong>${safe(loc(s))}</strong><small>${safe(lineName(l))}</small></span><span class="arrow">›</span></button>`}).join(''):`<div class="smallnotice">${safe(T().noFav)}</div>`;
 for(const btn of $('favouriteList').querySelectorAll('[data-key]'))btn.onclick=()=>{const [l,st]=btn.dataset.key.split('|');state.line=l;state.station=st;state.dir='UP';populateSelects();persist();navigate('eta')};
}
// Same date line as Bus ETA: "HONG KONG · 20 OCTOBER 2026 · 21:57".
function dateLine(){const now=new Date(),date=new Intl.DateTimeFormat(state.lang==='tc'?'zh-HK':'en-GB',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'long',day:'numeric'}).format(now),time=new Intl.DateTimeFormat('en-HK',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
 txt('eyebrow',(state.lang==='tc'?'香港':'HONG KONG')+' · '+date.toUpperCase()+' · '+time);}
setInterval(dateLine,30000);
function translate(){document.documentElement.lang=state.lang==='tc'?'zh-Hant':'en';const t=T();
 const ids={homeLabel:'home',eyebrow:'eyebrow',subtitle:'subtitle',selectTitle:'choose',lineLabel:'line',stationLabel:'station',arrivalTitle:'next',refreshLabel:'refresh',favTitle:'favTitle',favHelp:'favHelp',faresHeader:'faresHeader',faresTitle:'faresTitle',fareDesc:'fareDesc',fareFromLabel:'fareFrom',fareToLabel:'fareTo',fareServiceLabel:'fareService',octopusLabel:'octopus',singleLabel:'single',fareSource:'fareSource',accessTitle:'access',exitTitle:'exits',transferTitle:'transfer',settingsTitle:'settings',languageLabel:'interface',startLabel:'start',settingsInfoTitle:'about',settingsInfoDesc:'aboutDesc',coverageTitle:'coverage',coverageDesc:'coverageDesc',startETA:'navETA',startFav:'navFav',stationDetailsBtn:'stationInfo',dataTitle:'dataTitle'};
 for(const [id,key] of Object.entries(ids))txt(id,t[key]);
 dateLine();
 $('fareService').options[0].text=t.fareHeavy;$('fareService').options[1].text=t.fareAirport;
 for(const [id,key] of Object.entries({eta:'navETA',favourites:'navFav',fares:'navFares',station:'navStation',settings:'navSettings'})){const n=document.querySelector('[data-nav="'+id+'"]');if(n)n.textContent=t[key]}
 document.querySelectorAll('[data-lang]').forEach(b=>b.classList.toggle('sel',b.dataset.lang===state.lang));document.querySelectorAll('[data-start]').forEach(b=>b.classList.toggle('sel',b.dataset.start===state.start));
 populateSelects();fareStations();renderETA();renderFare();renderStation();renderFav();renderDataStatus();
}
function renderDataStatus(){const o=state.official;txt('dataStatus',o?`${state.lang==='tc'?'資料日期':'Generated'}: ${o.generated_utc.slice(0,10)} · ${Object.keys(o.fares||{}).length.toLocaleString()} ${state.lang==='tc'?'筆官方車費':'official fare pairs'} · ${Object.keys(o.accessibility||{}).length} ${state.lang==='tc'?'個車站有無障礙設施資料':'stations with accessibility records'}`:T().noFile)}
function navigate(view){state.view=view;document.querySelectorAll('.app > section').forEach(el=>el.classList.toggle('hidden',el.id!=='view-'+view));document.querySelectorAll('.navitem').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false')});if(view==='favourites')renderFav();if(view==='fares')renderFare();if(view==='station')renderStation();if(view==='eta')void refresh(false);scrollTo({top:0,behavior:'instant'})}
async function loadCSVData(){try{const j=await getJSON('./station-data.json?v=1.0.0',12000);if(j.schema!==1||!j.codes||!j.fares||!j.accessibility||Object.keys(j.fares).length<1000)throw Error('Invalid snapshot');state.official=j;}catch(e){state.official=null;state.dataError=e.message;}renderDataStatus();renderFare();renderStation()}
function install(){translate();navigate(state.view);
 $('lineSelect').addEventListener('change',e=>{state.line=e.target.value;state.station=D(state.line)[Math.min(Math.floor(D(state.line).length/2),D(state.line).length-1)][0];state.dir='UP';state.receivedAt=0;state.apiKey='';populateSelects();persist();refresh(true)});
 $('stationSelect').addEventListener('change',e=>{state.station=e.target.value;state.dir='UP';state.receivedAt=0;state.apiKey='';persist();refresh(true)});
 ['UP','DOWN'].forEach((dir,index)=>$('dir'+index).onclick=()=>{state.dir=dir;persist();renderETA()});
 $('refreshTrains').onclick=()=>refresh(true);
 $('favouriteToggle').onclick=()=>{const key=state.line+'|'+state.station;const i=state.favourites.indexOf(key);if(i>=0)state.favourites.splice(i,1);else state.favourites.push(key);persist();renderETA();renderFav()};
 $('stationDetailsBtn').onclick=()=>navigate('station');
 document.querySelectorAll('.navitem').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
 document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{state.lang=b.dataset.lang;persist();translate();refresh(true)});
 document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>{state.start=b.dataset.start;persist();translate()});
 for(const id of ['fareFrom','fareTo','fareService'])$(id).addEventListener('change',renderFare);
 setInterval(()=>{if(document.visibilityState==='visible'&&state.view==='eta'){if(!state.loading&&Date.now()-state.receivedAt>20000)refresh(true);else renderETA();}},12000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.view==='eta')refresh(true)});
 void loadCSVData();
}
install();
if(!IS_ADMIN)for(const id of ['dataTitle','coverageTitle'])document.getElementById(id)?.closest('.subcard')?.classList.add('hidden');
