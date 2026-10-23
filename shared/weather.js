'use strict';
/* Live Hong Kong weather from the Hong Kong Observatory open data API
   (data.weather.gov.hk, CORS-open). Shown as a small pill beside the
   "‹ Dashboard" button in each app, or in #weather on the menu. Tapping it
   opens a panel with warnings, today's forecast and the next three days.
   The language follows <html lang>, which every app already sets. */
(()=>{
const API='https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=';
const CACHE='hk_weather_v1',EVERY=10*60000;
// Approximate positions of the Observatory's temperature stations, to show
// the reading nearest to you when location is already allowed.
const STATIONS={"King's Park":[22.312,114.173],'Hong Kong Observatory':[22.302,114.174],'Wong Chuk Hang':[22.248,114.174],'Ta Kwu Ling':[22.529,114.157],
 'Lau Fau Shan':[22.469,113.984],'Tai Po':[22.446,114.179],'Sha Tin':[22.402,114.210],'Tuen Mun':[22.386,113.964],'Tseung Kwan O':[22.316,114.256],
 'Sai Kung':[22.376,114.274],'Cheung Chau':[22.201,114.027],'Chek Lap Kok':[22.310,113.922],'Tsing Yi':[22.344,114.110],'Shek Kong':[22.436,114.085],
 'Tsuen Wan Ho Koon':[22.383,114.108],'Tsuen Wan Shing Mun Valley':[22.375,114.127],'Hong Kong Park':[22.278,114.162],'Shau Kei Wan':[22.282,114.236],
 'Kowloon City':[22.335,114.185],'Happy Valley':[22.270,114.184],'Wong Tai Sin':[22.339,114.206],'Stanley':[22.214,114.219],'Kwun Tong':[22.319,114.225],
 'Sham Shui Po':[22.336,114.137],'Kai Tak Runway Park':[22.305,114.216],'Yuen Long Park':[22.441,114.018],'Tai Mei Tuk':[22.475,114.237]};
// Observatory weather icon codes (www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm).
const ICON={50:'☀️',51:'🌤️',52:'⛅',53:'🌦️',54:'🌦️',60:'☁️',61:'☁️',62:'🌧️',63:'🌧️',64:'🌧️',65:'⛈️',
 70:'🌙',71:'🌙',72:'🌙',73:'🌙',74:'🌙',75:'🌙',76:'☁️',77:'🌙',80:'💨',81:'🏜️',82:'💧',83:'🌫️',84:'🌫️',85:'🌫️',90:'🔥',91:'🌡️',92:'🍃',93:'🥶'};
const TEXT={
 en:{title:'Hong Kong weather',near:'Near you',hum:'Humidity',uv:'UV',next:'Next days',src:'Hong Kong Observatory',updated:'updated',none:'No warnings in force',
  rain:'Rain',fail:'Weather unavailable',loading:'Weather…',close:'Close',city:'Hong Kong · Observatory'},
 tc:{title:'香港天氣',near:'你附近',hum:'濕度',uv:'紫外線',next:'未來數天',src:'香港天文台',updated:'更新',none:'現時沒有警告',
  rain:'降雨',fail:'未能取得天氣',loading:'天氣…',close:'關閉',city:'香港 · 天文台'}};
// Short labels for the pill; the panel shows the Observatory's full names.
const SHORT={TC1:'T1',TC3:'T3',TC8NE:'T8',TC8SE:'T8',TC8NW:'T8',TC8SW:'T8',TC9:'T9',TC10:'T10',WRAINA:['Amber rain','黃雨'],WRAINR:['Red rain','紅雨'],WRAINB:['Black rain','黑雨'],
 WTS:['Thunderstorm','雷暴'],WHOT:['Very hot','酷熱'],WCOLD:['Cold','寒冷'],WFIREY:['Fire (yellow)','黃色火災'],WFIRER:['Fire (red)','紅色火災'],WFROST:['Frost','霜凍'],
 WL:['Landslip','山泥傾瀉'],WMSGNL:['Monsoon','強烈季候風'],WTMW:['Tsunami','海嘯'],WFNTSA:['N. NT flooding','新界北部水浸']};
const SEVERE=/^(TC8|TC9|TC10|WRAINR|WRAINB|WTMW)/;

const lang=()=>(document.documentElement.lang||'').startsWith('zh')?'tc':'en';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=()=>{try{return JSON.parse(localStorage.getItem(CACHE))||{}}catch{return {}}};
let cache=read(),here=null,loading=null,open=false;
// Where you are, shared by every app: the last position any of them found
// (kept a day: a station's area is a few km, so an older position still picks the right one
// until a fresh one arrives), so the nearest station shows without asking again.
const HERE='dashboard_here';
try{const h=JSON.parse(localStorage.getItem(HERE));if(h&&Date.now()-h.at<24*3600000)here=[h.lat,h.lng];}catch{}
function remember(p){here=[p.coords.latitude,p.coords.longitude];
 try{localStorage.setItem(HERE,JSON.stringify({lat:here[0],lng:here[1],at:Date.now()}));}catch{}if(pill)draw();}
if(navigator.geolocation){const g=navigator.geolocation;
 for(const k of ['getCurrentPosition','watchPosition']){const f=g[k]?.bind(g);if(f)g[k]=(ok,err,opt)=>f(p=>{remember(p);ok?.(p);},err,opt);}}

async function get(type,l){const r=await fetch(API+type+'&lang='+l,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function load(force){
 // Let a fetch already running finish first: it may be for the other language.
 while(loading)await loading;
 const l=lang(),c=cache[l];if(!force&&c&&Date.now()-c.at<EVERY)return;
 loading=(async()=>{try{
  // English current readings are always fetched: their station names find the nearest one.
  const [rh,rhEn,flw,fnd,warn]=await Promise.all([get('rhrread',l),l==='en'?null:get('rhrread','en'),get('flw',l),get('fnd',l),get('warnsum',l)]);
  cache[l]={at:Date.now(),rh,rhEn:rhEn||rh,flw,fnd,warn};try{localStorage.setItem(CACHE,JSON.stringify(cache));}catch{}
 }catch{if(cache[l])cache[l].failed=true;else cache[l]={failed:true};}finally{loading=null;}})();
 await loading;
}
function km(a,b){const r=x=>x*Math.PI/180,h=Math.sin(r(b[0]-a[0])/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(r(b[1]-a[1])/2)**2;return 12742*Math.asin(Math.sqrt(h));}
function current(c){
 const temps=c.rh?.temperature?.data||[],names=c.rhEn?.temperature?.data||temps;let pick=-1;
 if(here){let best=1e9;names.forEach((t,i)=>{const p=STATIONS[t.place];if(!p)return;const d=km(here,p);if(d<best){best=d;pick=i;}});}
 if(pick<0)pick=Math.max(0,names.findIndex(t=>t.place==='Hong Kong Observatory'));
 const t=temps[pick];
 return {temp:t?.value,place:t?.place,near:!!here,icon:ICON[c.rh?.icon?.[0]]||'🌡️',hum:c.rh?.humidity?.data?.[0]?.value,uv:c.rh?.uvindex?.data?.[0],updated:c.rh?.updateTime};
}
// The summary gives the colour or signal number apart from the name ("Red" + "Fire Danger Warning"); put them together.
const DIR={NE:['North East','東北'],SE:['South East','東南'],NW:['North West','西北'],SW:['South West','西南']};
function fullName(w,tc){const m=/^TC(\d+)(NE|SE|NW|SW)?$/.exec(w.code);
 if(m&&!/\d/.test(w.name))return tc?`${w.name} ${m[1]}號${m[2]?' '+DIR[m[2]][1]:''}`:`${w.name} No. ${m[1]}${m[2]?' '+DIR[m[2]][0]:''}`;
 const ty=w.type&&!String(w.name).includes(w.type)?w.type:'';return ty?(tc?ty+w.name:ty+' '+w.name):w.name;}
function warnings(c){const tc=lang()==='tc';return Object.values(c.warn||{}).filter(w=>w&&w.code&&w.actionCode!=='CANCEL').map(w=>{const s=SHORT[w.code];
 return {code:w.code,name:fullName(w,tc),short:Array.isArray(s)?s[tc?1:0]:s||w.name,severe:SEVERE.test(w.code)};});}
const hhmm=s=>{const d=new Date(s);return isNaN(d)?'':d.toLocaleTimeString('en-GB',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit'});};

function pillHTML(){const t=TEXT[lang()],c=cache[lang()];
 if(!c||!c.rh)return `<span class="wx-ic">🌡️</span><span>${esc(c?.failed?t.fail:t.loading)}</span>`;
 const n=current(c),w=warnings(c),menu=!!document.getElementById('weather');
 // Two lines: the reading on top, where it was taken underneath.
 // The menu has room for every warning's full name on a line of its own; the apps' pill shows a short label.
 const top=`<span class="wx-line"><b>${esc(n.temp??'–')}°</b>`+(n.hum!=null?`<span class="wx-dim">💧${esc(n.hum)}%</span>`:'')+
  (w.length&&!menu?`<span class="wx-warn${w.some(x=>x.severe)?' severe':''}">${esc(w[0].short)}${w.length>1?' +'+(w.length-1):''}</span>`:'')+`</span>`;
 const where=`<span class="wx-line wx-where">${n.near&&n.place?'📍 '+esc(n.place):esc(t.city)}</span>`;
 const warns=w.length&&menu?`<span class="wx-line wx-warnlist">${w.map(x=>`<span class="wx-warn${x.severe?' severe':''}">⚠️ ${esc(x.name)}</span>`).join('')}</span>`:'';
 return `<span class="wx-ic">${n.icon}</span><span class="wx-lines">${top}${where}${warns}</span>`;}
function panelHTML(){const l=lang(),t=TEXT[l],c=cache[l];if(!c||!c.rh)return `<p class="wx-p">${esc(c?.failed?t.fail:t.loading)}</p>`;
 const n=current(c),w=warnings(c),days=(c.fnd?.weatherForecast||[]).slice(0,3);
 return `<div class="wx-now"><span class="wx-big">${n.icon}</span><div><div class="wx-temp">${esc(n.temp??'–')}°C</div><div class="wx-dim">${esc((n.near?t.near+' · ':'')+(n.place||''))}</div></div>
  <div class="wx-facts">${n.hum!=null?`<span>${esc(t.hum)} <b>${esc(n.hum)}%</b></span>`:''}${n.uv?`<span>${esc(t.uv)} <b>${esc(n.uv.value)}</b> ${esc(n.uv.desc)}</span>`:''}</div></div>`+
  `<div class="wx-warns">${w.length?w.map(x=>`<span class="wx-warn${x.severe?' severe':''}">${esc(x.name)}</span>`).join(''):`<span class="wx-dim">${esc(t.none)}</span>`}</div>`+
  (c.flw?.forecastDesc?`<p class="wx-p"><b>${esc(c.flw.forecastPeriod||'')}</b><br>${esc(c.flw.forecastDesc)}</p>`:'')+
  (days.length?`<div class="wx-days">${days.map(d=>`<div><small>${esc(l==='tc'?d.week:d.week.slice(0,3))}</small><span>${ICON[d.ForecastIcon]||''}</span><b>${esc(d.forecastMintemp?.value)}–${esc(d.forecastMaxtemp?.value)}°</b><small>${esc(t.rain)} ${esc(d.PSR)}</small></div>`).join('')}</div>`:'')+
  `<div class="wx-src">${esc(t.src)} · ${esc(t.updated)} ${esc(hhmm(n.updated))}</div>`;}

const STYLE=`.wx-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.wx-row>.home-link{margin-bottom:0}
.wx-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid #293650;background:#131d30;color:#f0f4fc;border-radius:13px;padding:3px 11px 3px 9px;font:inherit;font-size:13px;line-height:1;cursor:pointer;white-space:nowrap;max-width:62vw;overflow:hidden}
.wx-pill b{font-weight:800}.wx-lines{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;overflow:hidden}.wx-line{display:flex;align-items:center;gap:6px;max-width:100%;line-height:1.1}.wx-where{color:#93a0b9;font-size:10.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}#weather .wx-where{font-size:12px}.wx-ic{font-size:16px;line-height:1}.wx-place{overflow:hidden;text-overflow:ellipsis;min-width:0}.wx-dim{color:#93a0b9}
.wx-warn{background:#3a2c12;border:1px solid #8a6a24;color:#ffd98c;border-radius:99px;padding:3px 7px;font-size:10.5px;font-weight:800}.wx-warn.severe{background:#3a1a1e;border-color:#a14450;color:#ff9aa5}
#weather .wx-pill{width:100%;max-width:none;justify-content:flex-start;padding:10px 13px;border-radius:16px;font-size:14px}#weather .wx-warnlist{flex-wrap:wrap;margin-top:3px}#weather .wx-warnlist .wx-warn{white-space:normal;line-height:1.25;font-size:12px}#weather .wx-pill .wx-more{margin-left:auto;color:#6cdea4;font-size:12px;font-weight:700}
.wx-panel{position:fixed;z-index:50;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top) + 64px);width:min(92vw,420px);background:#131d30;border:1px solid #33415e;border-radius:20px;padding:14px 15px 12px;color:#f0f4fc;box-shadow:0 18px 50px rgba(0,0,0,.55);font-size:13px}
.wx-now{display:flex;align-items:center;gap:11px}.wx-big{font-size:34px}.wx-temp{font-size:26px;font-weight:800;letter-spacing:-.5px}.wx-facts{margin-left:auto;text-align:right;display:flex;flex-direction:column;gap:3px;font-size:12px;color:#93a0b9}.wx-facts b{color:#f0f4fc}
.wx-warns{display:flex;flex-wrap:wrap;gap:6px;margin:11px 0 2px;font-size:12px}.wx-p{margin:10px 0 0;line-height:1.45;color:#c9d3e5}.wx-p b{color:#f0f4fc}
.wx-days{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:11px}.wx-days div{background:#0f1728;border:1px solid #293650;border-radius:13px;padding:7px 4px;text-align:center;display:flex;flex-direction:column;gap:3px}
.wx-days small{color:#93a0b9;font-size:10.5px}.wx-days span{font-size:18px}.wx-days b{color:#6cdea4;font-size:13px}.wx-src{margin-top:10px;color:#93a0b9;font-size:10.5px;text-align:center}
.wx-shade{position:fixed;inset:0;z-index:49;background:rgba(2,8,16,.45)}`;

let pill=null;
function mount(){
 const style=document.createElement('style');style.textContent=STYLE;document.head.appendChild(style);
 pill=document.createElement('button');pill.type='button';pill.className='wx-pill';pill.setAttribute('aria-haspopup','dialog');
 const spot=document.getElementById('weather'),back=document.querySelector('.home-link');
 if(spot)spot.appendChild(pill);
 else if(back){const row=document.createElement('div'),cs=getComputedStyle(back);row.className='wx-row';
  // The row takes over the button's spacing and the pill matches its height.
  row.style.margin=cs.margin;pill.style.minHeight=cs.height;pill.style.borderRadius=cs.borderRadius;back.style.margin='0';
  back.parentNode.insertBefore(row,back);row.append(back,pill);}
 else return false;
 pill.addEventListener('click',()=>toggle(true));
 return true;
}
function draw(){if(!pill)return;pill.innerHTML=pillHTML()+(document.getElementById('weather')&&cache[lang()]?.rh?`<span class="wx-more">${esc(TEXT[lang()].next)} ›</span>`:'');pill.title=TEXT[lang()].title;
 const p=document.querySelector('.wx-panel');if(p)p.innerHTML=panelHTML();}
function toggle(on){open=on;document.querySelectorAll('.wx-panel,.wx-shade').forEach(e=>e.remove());if(!on)return;
 const shade=document.createElement('div');shade.className='wx-shade';shade.addEventListener('click',()=>toggle(false));
 const p=document.createElement('div');p.className='wx-panel';p.setAttribute('role','dialog');p.setAttribute('aria-label',TEXT[lang()].title);p.innerHTML=panelHTML();
 document.body.append(shade,p);void refresh(false);}
async function refresh(force){await load(force);draw();}
async function locate(){try{if((await navigator.permissions?.query({name:'geolocation'}))?.state!=='granted')return;}catch{return;}
 navigator.geolocation.getCurrentPosition(()=>{},()=>{},{maximumAge:300000,timeout:15000});}

function start(){if(!mount())return;draw();void refresh(false);void locate();
 new MutationObserver(()=>{draw();void refresh(false);}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open)toggle(false);});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh(false);});
 setInterval(()=>{if(document.visibilityState==='visible')void refresh(false);},60000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
