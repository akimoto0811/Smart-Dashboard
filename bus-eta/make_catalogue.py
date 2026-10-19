#!/usr/bin/env python3
"""Generate bus route/stop discovery catalogue (standard library only).

The third-party data can contain stale/mismatched route-stop pairs. The web app
verifies operator-specific route membership with official APIs at selection time.
Do NOT use catalogue entries directly as authoritative ETA stop assignments.

Output is the compact schema 4 file catalogue-compact.json: stop IDs, stop
locations and destinations are stored once and referenced by index, which keeps
the file about 12x smaller than the old one-object-per-row catalogue.json.

  python3 make_catalogue.py                       # download source and rebuild
  python3 make_catalogue.py --from catalogue.json # convert an old schema 3 file
"""
import json, os, pathlib, sys, tempfile, urllib.request
from datetime import datetime, timezone
SOURCE_URLS=['https://data.hkbus.app/routeFareList.min.json','https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json']
OUTPUT=pathlib.Path(__file__).resolve().parent/'catalogue-compact.json'

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
  destination_en=str(dest.get('en') or '') if isinstance(dest,dict) else str(dest)
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
    stopname_en=str(name.get('en') or '') if isinstance(name,dict) else str(name)
    # routeList stops are the operator's own stop IDs. stopMap lists OTHER
    # stops at the same spot (mostly other operators'), so it only feeds the
    # shared ID used to merge KMB and Citybus poles, never the stop ID itself.
    pairs=[(str(pair[0]).lower(),str(pair[1]).upper()) for pair in (stopmap.get(sharedid) or []) if isinstance(pair,(list,tuple)) and len(pair)>1]
    shared=min([f'{rawop}:{sharedid.upper()}']+[f'{c}:{i}' for c,i in pairs])
    for stopid in [sharedid.upper()]:
     if op=='CTB' and not(len(stopid)==6 and stopid.isdigit()):continue
     if op!='CTB' and not(len(stopid)==16 and all(c in '0123456789ABCDEF' for c in stopid)):continue
     key=(op,route,direction,stopid,service)
     entries[key]={'operator':op,'route':route,'direction':direction,'stop_id':stopid,'service_type':service,
                   'name':stopname,'name_en':stopname_en,'destination':destination,'destination_en':destination_en,'lat':round(lat,6),'lng':round(lng,6),
                   'shared_stop_id':shared}
 return list(entries.values())

def compact(entries):
 """Schema 4: [op,route,dir,service,[stop_id_index,location_index,destination_index,...]] per variant."""
 tables={'stop_ids':{},'locations':{},'destinations':{}}
 def ref(table,key):
  t=tables[table]
  if key not in t:t[key]=len(t)
  return t[key]
 variants={}
 for it in entries:
  flat=variants.setdefault((it['operator'],it['route'],it['direction'],it['service_type']),[])
  flat+=[ref('stop_ids',it['stop_id']),
         ref('locations',(it['name'],it.get('name_en',''),it['lat'],it['lng'],it.get('shared_stop_id',''))),
         ref('destinations',(it['destination'],it.get('destination_en','')))]
 return {'stop_ids':list(tables['stop_ids']),'locations':[list(k) for k in tables['locations']],
         'destinations':[list(k) for k in tables['destinations']],'variants':[[*k,v] for k,v in variants.items()]}

def main():
 if len(sys.argv)==3 and sys.argv[1]=='--from':
  old=json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf8'))
  entries=old['entries'];date=old.get('catalogue_date') or datetime.now(timezone.utc).strftime('%Y-%m-%d')
  source=old.get('source','hkbus/hk-bus-crawling routeFareList.min.json')
 else:
  entries=build(fetch());date=datetime.now(timezone.utc).strftime('%Y-%m-%d');source='hkbus/hk-bus-crawling routeFareList.min.json'
 operators={x['operator'] for x in entries}
 print(f'Parsed {len(entries):,} route-stop records. Operators: {", ".join(sorted(operators))}')
 if len(entries)<1000 or not {'KMB','CTB'}.issubset(operators):raise RuntimeError('Incomplete catalogue: refusing to replace existing output.')
 english_names=sum(bool(it.get('name_en')) for it in entries)
 english_dests=sum(bool(it.get('destination_en')) for it in entries)
 print(f'English names: {english_names:,} / {len(entries):,}; English destinations: {english_dests:,} / {len(entries):,}')
 if english_names<len(entries)*0.7 or english_dests<len(entries)*0.7:raise RuntimeError('Source is missing most English names; refusing to overwrite existing catalogue.')
 data={'schema_version':4,'catalogue_date':date,'source':source,'records':len(entries),**compact(entries)}
 fd,tmp=tempfile.mkstemp(suffix='.json',prefix='.tmp-hkbus-',dir=OUTPUT.parent)
 try:
  with os.fdopen(fd,'w',encoding='utf8') as f:json.dump(data,f,ensure_ascii=False,separators=(',',':'))
  os.replace(tmp,OUTPUT);os.chmod(OUTPUT,0o644)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
 print('Saved:',OUTPUT,'size:',round(OUTPUT.stat().st_size/1e6,2),'MB')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR:',e,file=sys.stderr);sys.exit(1)
