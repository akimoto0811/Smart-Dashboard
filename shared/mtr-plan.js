'use strict';
/* MTR journey planner for the dashboard menu's "Your trip" card.
   A copy of the planner in mtr-eta/app.js (planJourney), working from
   shared/mtr-lines.json and mtr-eta/station-coords.json. Keep the two in step. */
window.MTRPlan=(LINES,coords)=>{
 const D=S=>LINES[S]?.stations||[];
 const SUPPLEMENT={RAC:['FOT','UNI'],LMC:['SHS'],LHP:['TKO']};
 const LINE_KMH={AEL:80,EAL:50,TCL:68,TML:40,DRL:35};
 const CHANGE_MIN=4,WALKS=[['CEN','HOK',6],['TST','ETS',5]];
 function km(a,b){const p=coords?.[a],q=coords?.[b];if(!p||!q)return null;const r=Math.PI/180,x=(q[1]-p[1])*r*Math.cos((p[0]+q[0])*r/2),y=(q[0]-p[0])*r;return Math.hypot(x,y)*6371;}
 function rideMinutes(line,a,b){const d=km(a,b);return d===null?2.2:Math.max(1.2,d*1.1/(LINE_KMH[line]||33)*60);}
 function lineOrder(line){return D(line).map(s=>s[0]).filter(c=>!SUPPLEMENT[c]||!SUPPLEMENT[c].every(n=>D(line).some(s=>s[0]===n)));}
 function position(line,c){const o=lineOrder(line),i=o.indexOf(c);return i>=0?i:o.indexOf(SUPPLEMENT[c]?.[0])+.5;}
 const g=new Map(),add=(l,a,b,min)=>{for(const [x,y] of [[a,b],[b,a]]){if(!g.has(x))g.set(x,[]);g.get(x).push({to:y,line:l,min:min??rideMinutes(l,a,b)});}};
 for(const line of Object.keys(LINES)){if(line==='AEL')continue;const o=lineOrder(line);for(let i=1;i<o.length;i++)add(line,o[i-1],o[i]);
  for(const [c,near] of Object.entries(SUPPLEMENT))if(o.length&&D(line).some(s=>s[0]===c)&&!o.includes(c))for(const n of near)add(line,n,c);}
 for(const [a,b,min] of WALKS)add('WALK',a,b,min);
 function legs(path){const out=[];for(const e of path){const last=out[out.length-1];
   if(last&&last.line===e.line&&(e.line==='WALK'||(position(e.line,last.to)>position(e.line,last.from))===(position(e.line,e.to)>position(e.line,e.from)))){last.to=e.to;last.stops++;last.min+=e.min;}
   else out.push({line:e.line,from:e.from,to:e.to,stops:1,min:e.min});}
  for(const l of out)l.dir=l.line==='WALK'?null:position(l.line,l.to)>position(l.line,l.from)?'UP':'DOWN';
  let min=0;out.forEach((l,i)=>{min+=l.min+(i&&l.line!=='WALK'?CHANGE_MIN:0);});
  return {legs:out,min:Math.round(min),changes:out.filter(l=>l.line!=='WALK').length-1};}
 // Dijkstra over (station, line) so each change of line costs CHANGE_MIN.
 function plan(from,to){if(from===to||!g.has(from)||!g.has(to))return null;
  const best=new Set(),queue=[{at:from,line:null,cost:0,path:[]}];
  while(queue.length){queue.sort((a,b)=>a.cost-b.cost);const cur=queue.shift(),key=cur.at+'|'+cur.line;if(best.has(key))continue;best.add(key);if(cur.at===to)return legs(cur.path);
   for(const e of g.get(cur.at)||[]){const cost=cur.cost+e.min+(cur.line&&cur.line!==e.line&&e.line!=='WALK'?CHANGE_MIN:0);if(!best.has(e.to+'|'+e.line))queue.push({at:e.to,line:e.line,cost,path:[...cur.path,{from:cur.at,...e}]});}}
  return null;}
 return {plan,change:CHANGE_MIN};
};
