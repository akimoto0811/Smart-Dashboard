#!/usr/bin/env python3
"""Print a route's live KMB and Citybus stop lists (debugging aid).

  python3 probe_route.py 680
"""
import json, sys, urllib.request
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'HKBusETA-Dashboard/1.0'})
 with urllib.request.urlopen(req,timeout=60) as r:return json.loads(r.read())['data']
route=sys.argv[1] if len(sys.argv)>1 else '680'
for bound in ['outbound','inbound']:
 for svc in ['1','2','3']:
  try:rows=get(f'https://data.etabus.gov.hk/v1/transport/kmb/route-stop/{route}/{bound}/{svc}')
  except Exception as e:print('KMB',bound,svc,'error',e);continue
  if not rows:continue
  print(f'KMB {route} {bound} service {svc}: {len(rows)} stops')
  for r in rows:
   s=get('https://data.etabus.gov.hk/v1/transport/kmb/stop/'+r['stop'])
   print(' ',r['seq'],r['stop'],s['name_en'],s['lat'],s['long'])
 try:rows=get(f'https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/{route}/{bound}')
 except Exception as e:print('CTB',bound,'error',e);continue
 print(f'CTB {route} {bound}: {len(rows)} stops')
 for r in rows:
  s=get('https://rt.data.gov.hk/v2/transport/citybus/stop/'+r['stop'])
  print(' ',r['seq'],r['stop'],s['name_en'],s['lat'],s['long'])
