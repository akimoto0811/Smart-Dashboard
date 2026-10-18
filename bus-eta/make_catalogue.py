#!/usr/bin/env python3
"""Generate browser-native, precise-coordinate HK bus stop catalogue (standard library only)."""
import json, os, pathlib, sys, tempfile, urllib.request
from datetime import datetime, timezone
SOURCE_URLS=['https://data.hkbus.app/routeFareList.min.json','https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json']
OUTPUT=pathlib.Path(__file__).resolve().parent/'catalogue.json'

def fetch():
 errors=[]
 for url in SOURCE_URLS:
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'HKBusETA-Dashboard/1.0','Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=55) as r:raw=r.read(50_000_001)
   if len(raw)>50_000_000:raise ValueError('Source exceeds 50 MB')
   db=json.loads(raw)
   if len(db.get('routeList',{}))<100 or len(db.get('stopList',{}))<100 or not isinstance(db.get('stopMap'),dict):
    raise ValueError('Incomplete source route/stop metadata')
   print('Source:',url)
   return db
  except Exception as exc:errors.append(f'{url}: {exc}')
 raise RuntimeError('Catalogue download failed. Check network.\n'+'\n'.join(errors))

def build(db):
 stops=db['stopList'];stopmap=db['stopMap'];entries={}
 for row in db['routeList'].values():
  if not isinstance(row,dict):continue
  route=str(row.get('route') or '').strip().upper()
  if not route:continue
  companies=row.get('co',[])
  if isinstance(companies,str):companies=[companies]
  dest=row.get('dest') or {}
  destination=str(dest.get('zh') or dest.get('en') or 'Destination not supplied') if isinstance(dest,dict) else str(dest)
  allstops=row.get('stops') or {};bounds=row.get('bound') or {};service=str(row.get('serviceType') or '1')
  for rawop in companies:
   rawop=str(rawop).lower();op='CTB' if rawop in ('ctb','nwfb') else rawop.upper()
   if op not in ('KMB','LWB','CTB'):continue
   direction=str(bounds.get(rawop,'O') if isinstance(bounds,dict) else 'O')[:1].upper()
   if direction not in ('I','O'):continue
   for sharedid in allstops.get(rawop,[]):
    sharedid=str(sharedid);s=stops.get(sharedid) or {};p=s.get('location') or {};name=s.get('name') or {}
    try:lat=float(p['lat']);lng=float(p.get('lng',p.get('long')))
    except (KeyError,TypeError,ValueError):continue
    if not(22.0<lat<22.7 and 113.7<lng<114.6):continue
    stopname=str(name.get('zh') or name.get('en') or 'Bus stop') if isinstance(name,dict) else str(name)
    nativeids=[str(pair[1]).upper() for pair in (stopmap.get(sharedid) or []) if isinstance(pair,(list,tuple)) and len(pair)>1 and str(pair[0]).lower()==rawop]
    for stopid in nativeids:
     if op=='CTB' and not(len(stopid)==6 and stopid.isdigit()):continue
     if op!='CTB' and not(len(stopid)==16 and all(c in '0123456789ABCDEF' for c in stopid)):continue
     key=(op,route,direction,stopid,service)
     entries[key]={'operator':op,'route':route,'direction':direction,'stop_id':stopid,'service_type':service,
                   'name':stopname,'destination':destination,'lat':round(lat,6),'lng':round(lng,6)}
 return list(entries.values())

def main():
 db=fetch();entries=build(db)
 operators={x['operator'] for x in entries}
 print(f'Parsed {len(entries):,} route-stop records. Operators: {", ".join(sorted(operators))}')
 if len(entries)<1000 or not {'KMB','CTB'}.issubset(operators):raise RuntimeError('Incomplete catalogue: refusing to replace existing output.')
 data={'schema_version':2,'catalogue_date':datetime.now(timezone.utc).strftime('%Y-%m-%d'),'source':'hkbus/hk-bus-crawling routeFareList.min.json','entries':entries}
 fd,tmp=tempfile.mkstemp(suffix='.json',prefix='.tmp-hkbus-',dir=OUTPUT.parent)
 try:
  with os.fdopen(fd,'w',encoding='utf8') as f:json.dump(data,f,ensure_ascii=False,separators=(',',':'))
  os.replace(tmp,OUTPUT)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
 print('Saved:',OUTPUT,'size:',round(OUTPUT.stat().st_size/1e6,2),'MB')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR:',e,file=sys.stderr);sys.exit(1)
