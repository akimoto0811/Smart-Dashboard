#!/usr/bin/env python3
"""Build td-routes.json: the Transport Department's official stop list for
every joint KMB/Citybus route, and every bus route's full fare; and
td-fares.json: the fare from each stop of every bus route (standard library only).

Source: data.gov.hk "Routes and fares of public transport" (JSON_BUS.json).
A joint route appears there once, with one entry per physical stop, so the app
uses it to decide which KMB and Citybus poles are the same stop. Section fares
come from FARE_BUS.xml, keyed by route, direction and boarding stop.

  python3 make_td_routes.py           # download and rebuild td-routes.json
  python3 make_td_routes.py --probe   # print the source layout only
"""
import json, pathlib, sys, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
URL='https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json'
OUTPUT=pathlib.Path(__file__).resolve().parent/'td-routes.json'
FARE_URL='https://static.data.gov.hk/td/routes-fares-xml/FARE_BUS.xml'
FARES_OUTPUT=pathlib.Path(__file__).resolve().parent/'td-fares.json'

def fetch():
 req=urllib.request.Request(URL,headers={'User-Agent':'HKBusETA-Dashboard/1.0'})
 with urllib.request.urlopen(req,timeout=120) as r:raw=r.read()
 print('Downloaded',len(raw),'bytes')
 return json.loads(raw.decode('utf-8-sig'))

def probe(doc):
 feats=doc.get('features',[])
 print('Features:',len(feats))
 print('Property keys:',sorted({k for f in feats[:2000] for k in f.get('properties',{})}))
 print('Company codes:',sorted({f['properties'].get('companyCode') for f in feats}))

def build(doc):
 trips={};fares={}
 for f in doc.get('features',[]):
  p=f.get('properties') or {};company=str(p.get('companyCode') or '')
  route=str(p.get('routeNameE') or '').strip().upper()
  if route and p.get('fullFare') is not None:
   # Regular trips first; routes like 110 have only special-type trips.
   regular=p.get('serviceMode')=='R' and not p.get('specialType')
   key=(company,p['routeSeq'],p.get('locEndNameE') or '')
   row=[company,p['routeSeq'],float(p['fullFare']),p.get('locEndNameE') or '',p.get('locEndNameC') or '']
   bucket=fares.setdefault(route,{})
   if key not in bucket or (regular and not bucket[key][1]):bucket[key]=(row,regular)
  if '+' not in company:continue  # stop lists for joint routes only
  try:lng,lat=f['geometry']['coordinates'][:2]
  except Exception:continue
  key=(p['routeId'],p['routeSeq'])
  t=trips.setdefault(key,{'route':str(p.get('routeNameE') or '').strip().upper(),'company':company,
   'seq':p['routeSeq'],'mode':p.get('serviceMode') or '','special':p.get('specialType') or 0,
   'from_en':p.get('locStartNameE') or '','from_tc':p.get('locStartNameC') or '',
   'to_en':p.get('locEndNameE') or '','to_tc':p.get('locEndNameC') or '','stops':[]})
  t['stops'].append((int(p.get('stopSeq') or 0),[str(p.get('stopId')),p.get('stopNameE') or '',p.get('stopNameC') or '',round(lat,6),round(lng,6)]))
 routes={}
 for t in trips.values():
  t['stops']=[s for _,s in sorted(t['stops'],key=lambda x:x[0])]
  if t['route'] and len(t['stops'])>=2:routes.setdefault(t.pop('route'),[]).append(t)
 for v in routes.values():v.sort(key=lambda t:(t['mode']!='R',t['special'],t['seq']))
 if len(routes)<50:raise SystemExit(f'Only {len(routes)} joint routes found; refusing to write')
 doc={'schema_version':1,'generated_utc':datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),'source':URL,'routes':routes,'fares':{r:[row for row,_ in sorted(v.values(),key=lambda x:not x[1])] for r,v in fares.items()}}
 OUTPUT.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 print(f'Saved {OUTPUT.name}: {len(routes)} joint routes, {sum(len(v) for v in routes.values())} trips, {OUTPUT.stat().st_size/1e6:.2f} MB')
 print('Fares for',len(fares),'routes; 680:',[r for r,_ in fares.get('680',{}).values()],'110:',[r for r,_ in fares.get('110',{}).values()])
 for r in ['680','110']:
  for t in routes.get(r,[]):print(r,t['mode'],t['special'],t['seq'],t['from_en'],'->',t['to_en'],len(t['stops']),'stops')

def build_stop_fares(doc):
 # Fare when boarding at a stop = the highest section fare from that stop
 # (to the far end of the route), as printed on the stop's fare table.
 board={}
 req=urllib.request.Request(FARE_URL,headers={'User-Agent':'HKBusETA-Dashboard/1.0'})
 with urllib.request.urlopen(req,timeout=300) as r:
  for _,el in ET.iterparse(r):
   if el.tag!='FARE':continue
   try:
    key=(int(el.findtext('ROUTE_ID')),int(el.findtext('ROUTE_SEQ')),int(el.findtext('ON_SEQ')));price=float(el.findtext('PRICE'))
    if price>board.get(key,0):board[key]=price
   except (TypeError,ValueError):pass
   el.clear()
 print('Section fares for',len(board),'boarding stops')
 trips={}
 for f in doc.get('features',[]):
  p=f.get('properties') or {}
  route=str(p.get('routeNameE') or '').strip().upper()
  try:lng,lat=f['geometry']['coordinates'][:2];rid,rseq,sseq=int(p['routeId']),int(p['routeSeq']),int(p.get('stopSeq') or 0)
  except Exception:continue
  if not route:continue
  t=trips.setdefault((rid,rseq),{'route':route,'company':str(p.get('companyCode') or ''),'seq':rseq,
   'to_en':p.get('locEndNameE') or '','regular':p.get('serviceMode')=='R' and not p.get('specialType'),'stops':[]})
  fare=board.get((rid,rseq,sseq))
  t['stops'].append((sseq,[round(lat,5),round(lng,5),fare]))
 routes={}
 for t in trips.values():
  stops=[s for _,s in sorted(t['stops'],key=lambda x:x[0])]
  if len(stops)<2 or not any(s[2] for s in stops):continue
  t['stops']=stops;routes.setdefault(t.pop('route'),[]).append(t)
 for v in routes.values():v.sort(key=lambda t:(not t['regular'],t['seq']))
 if len(routes)<300:raise SystemExit(f'Only {len(routes)} routes with section fares; refusing to write')
 out={'schema_version':1,'generated_utc':datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),'source':FARE_URL,'routes':routes}
 FARES_OUTPUT.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 print(f'Saved {FARES_OUTPUT.name}: {len(routes)} routes, {FARES_OUTPUT.stat().st_size/1e6:.2f} MB')
 for r in ['680','1A','110']:
  for t in routes.get(r,[])[:2]:print(r,t['company'],t['seq'],t['to_en'],[s[2] for s in t['stops']])

if __name__=='__main__':
 doc=fetch()
 if '--probe' in sys.argv:probe(doc)
 else:build(doc);build_stop_fares(doc)
