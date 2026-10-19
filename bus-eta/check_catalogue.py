#!/usr/bin/env python3
"""Check catalogue-compact.json KMB stop IDs against KMB's official route-stop list.

A wrong stop ID makes the dashboard ask for ETAs at a stop the bus never
calls at, so the build fails if too few catalogue stops are official ones.
"""
import json, pathlib, sys, urllib.request
CATALOGUE=pathlib.Path(__file__).resolve().parent/'catalogue-compact.json'
MINIMUM=0.9

def main():
 doc=json.loads(CATALOGUE.read_text(encoding='utf8'))
 req=urllib.request.Request('https://data.etabus.gov.hk/v1/transport/kmb/route-stop',headers={'User-Agent':'HKBusETA-Dashboard/1.0'})
 with urllib.request.urlopen(req,timeout=120) as r:official=json.load(r)['data']
 known={(x['route'],x['bound'],str(x['service_type']),x['stop']) for x in official}
 total=hits=0
 for op,route,direction,service,flat in doc['variants']:
  if op!='KMB':continue
  for i in range(0,len(flat),3):
   total+=1;hits+=(route,direction,service,doc['stop_ids'][flat[i]]) in known
 share=hits/total if total else 0
 print(f'KMB catalogue stops on the official route-stop list: {hits:,} / {total:,} ({share:.1%})')
 if share<MINIMUM:sys.exit(f'Expected at least {MINIMUM:.0%}; the catalogue stop IDs look wrong.')
if __name__=='__main__':main()
