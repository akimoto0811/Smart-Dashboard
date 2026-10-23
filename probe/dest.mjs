// Fetch real arrivals and check every destination the menu and apps would show.
import fs from 'fs';
const doc=JSON.parse(fs.readFileSync('bus-eta/catalogue-compact.json','utf8'));
const get=async(u,tries=2)=>{for(let i=0;i<tries;i++){try{const r=await fetch(u,{signal:AbortSignal.timeout(15000)});if(r.ok)return await r.json();}catch{}}return null;};
// --- bus: same logic as home.js
const busDest=new Map(),stops=new Map();
for(const [op,route,dir,,flat] of doc.variants){const d=doc.destinations?.[flat[flat.length-3+2]],k=op+'|'+route+'|'+dir;if(d&&!busDest.has(k))busDest.set(k,d);
 for(let i=0;i+2<flat.length;i+=3){const id=doc.stop_ids[flat[i]],loc=doc.locations[flat[i+1]];const operator=op==='CTB'?'CTB':'KMB';const key=operator+'|'+id;if(!stops.has(key))stops.set(key,{operator,id,name:loc?.[0],lat:loc?.[2],lng:loc?.[3],routes:new Set()});stops.get(key).routes.add(route);}}
const all=[...stops.values()];
const pick=op=>{const l=all.filter(s=>s.operator===op);const out=[];for(let i=0;i<l.length;i+=Math.floor(l.length/60))out.push(l[i]);return out.slice(0,60);};
const near=(lat,lng)=>all.filter(s=>Math.hypot(s.lat-lat,s.lng-lng)<0.004);
const sample=[...pick('CTB'),...pick('CTB').map((x,i,a)=>all.filter(s=>s.operator==='CTB')[i*37+11]).filter(Boolean),...near(22.3075,114.26)];
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const enTc=new Map();for(const [tc,en] of doc.destinations||[])if(en&&tc&&!enTc.has(norm(en)))enTc.set(norm(en),tc);
let ctbTotal=0,ctbHit=0;const misses=new Map();
const stats={},bad=[],keys=new Set(),dirs={};
const destOf=(s,x,tc)=>{const c=busDest.get(s.operator+'|'+x.route+'|'+x.dir)||[];return (tc?x.dest_tc||c[0]||x.dest_en||x.dest||c[1]:x.dest_en||x.dest||c[1]||x.dest_tc||c[0])||'';};
for(const s of sample){
 const u=s.operator==='CTB'?`https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/${encodeURIComponent(s.id)}`:`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${encodeURIComponent(s.id)}`;
 const j=await get(u);const st=stats[s.operator]??={stops:0,noResp:0,etas:0,apiTc:0,apiEn:0,fallbackTc:0,emptyTc:0,emptyEn:0,mismatchEn:0};st.stops++;
 if(!j){st.noResp++;continue;}
 for(const x of j.data||[]){if(!x.eta)continue;st.etas++;Object.keys(x).forEach(k=>keys.add(s.operator+':'+k));dirs[s.operator+':'+x.dir]=(dirs[s.operator+':'+x.dir]||0)+1;
  if(s.operator==='CTB'){ctbTotal++;const h=enTc.get(norm(x.dest_en||x.dest));if(h)ctbHit++;else misses.set(x.route+' '+(x.dest_en||x.dest),1);}
  if(x.dest_tc)st.apiTc++;if(x.dest_en||x.dest)st.apiEn++;
  const tc=destOf(s,x,true),en=destOf(s,x,false);if(!x.dest_tc&&tc)st.fallbackTc++;if(!tc)st.emptyTc++;if(!en)st.emptyEn++;
  const c=busDest.get(s.operator+'|'+x.route+'|'+x.dir);const api=(x.dest_en||x.dest||'').toUpperCase();
  if(c&&api&&!x.dest_tc){const cat=(c[1]||'').toUpperCase();if(cat&&!(api.includes(cat.slice(0,6))||cat.includes(api.slice(0,6)))){st.mismatchEn++;if(bad.length<25)bad.push(`${s.operator} ${x.route} ${x.dir} api="${x.dest_en||x.dest}" cat="${c[1]}"/${c[0]}`);}}
  if((!tc||!en)&&bad.length<40)bad.push(`EMPTY ${s.operator} ${x.route} ${x.dir} ${JSON.stringify(x).slice(0,200)}`);}
}
console.log('ENMATCH',ctbHit,'/',ctbTotal,'misses',JSON.stringify([...misses.keys()].slice(0,40)));
console.log('BUS',JSON.stringify(stats));console.log('KEYS',[...keys].join(' '));console.log('DIRS',JSON.stringify(dirs));bad.forEach(b=>console.log('BAD',b));
