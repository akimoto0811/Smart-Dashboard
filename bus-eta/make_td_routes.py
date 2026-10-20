#!/usr/bin/env python3
"""Download the Transport Department's official bus route-stop list.

Source: data.gov.hk "Routes and fares of public transport" (JSON_BUS.json).
Joint KMB/Citybus routes appear once there, with one entry per physical stop,
so the app can use it as the reference stop list for joint routes.

  python3 make_td_routes.py --probe   # print the source layout only
"""
import json, sys, urllib.request
URL='https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json'

def fetch():
 req=urllib.request.Request(URL,headers={'User-Agent':'HKBusETA-Dashboard/1.0'})
 with urllib.request.urlopen(req,timeout=120) as r:raw=r.read()
 print('Downloaded',len(raw),'bytes')
 return json.loads(raw.decode('utf-8-sig'))

def probe(doc):
 print('Top-level type:',type(doc).__name__,list(doc)[:10] if isinstance(doc,dict) else len(doc))
 feats=doc.get('features',[]) if isinstance(doc,dict) else doc
 print('Features:',len(feats))
 for f in feats[:3]:print(json.dumps(f,ensure_ascii=False)[:800])
 props=[f.get('properties',f) for f in feats]
 keys={k for p in props[:2000] for k in p}
 print('Property keys:',sorted(keys))
 for p in props:
  if str(p.get('routeNameE') or p.get('ROUTE_NAMEE') or '').strip()=='680':print('680:',json.dumps(p,ensure_ascii=False)[:400])

if __name__=='__main__':
 doc=fetch()
 if '--probe' in sys.argv:probe(doc);sys.exit(0)
