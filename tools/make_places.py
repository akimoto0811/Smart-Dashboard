"""Build shared/hk-places.json: named areas of Hong Kong (Mong Kok, To Kwa Wan,
Stanley...) with their positions, so the weather pill can name the area you
are in without sending your location anywhere.

Areas come from OpenStreetMap (place = town, suburb, quarter or neighbourhood,
inside Hong Kong) and need both an English and a Chinese name.
Run by .github/workflows/places-data.yml.
"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'shared' / 'hk-places.json'
QUERY = """[out:json][timeout:120];
area["ISO3166-1"="HK"]->.hk;
(node(area.hk)["place"~"^(town|suburb|quarter|neighbourhood)$"];
 way(area.hk)["place"~"^(town|suburb|quarter|neighbourhood)$"];
 relation(area.hk)["place"~"^(town|suburb|quarter|neighbourhood)$"];);
out center tags;"""
SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
           'https://overpass.private.coffee/api/interpreter']

def fetch():
    for attempt in range(3):
        for url in SERVERS:
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': QUERY}).encode(),
                                             headers={'User-Agent': 'Smart-Dashboard weather (github.com/akimoto0811/Smart-Dashboard)'})
                return json.load(urllib.request.urlopen(req, timeout=180))['elements']
            except Exception as e:
                print('Overpass', url, 'failed:', e)
        time.sleep(20)
    sys.exit('No Overpass server answered')

CJK = re.compile(r'[一-鿿]')
places = {}
elements = fetch()
print(len(elements), 'OpenStreetMap places')
for e in elements:
    t = e.get('tags', {})
    lat, lng = (e.get('lat'), e.get('lon')) if 'lat' in e else (e.get('center', {}).get('lat'), e.get('center', {}).get('lon'))
    if lat is None:
        continue
    name = t.get('name', '')
    en = t.get('name:en') or (name if name and not CJK.search(name) else '')
    tc = t.get('name:zh-Hant') or t.get('name:zh-HK') or t.get('name:zh') or (name if CJK.search(name) else '')
    tc = tc.split(' ')[0] if CJK.search(tc.split(' ')[0]) else tc
    if not en or not tc:
        continue
    key = (en, tc)
    if key in places:  # same area mapped as a point and a shape: keep one
        continue
    places[key] = [en, tc, round(lat, 5), round(lng, 5), t['place'][0]]

rows = sorted(places.values())
print(len(rows), 'places;', ', '.join(f'{r[0]}/{r[1]}' for r in rows[:15]))
if len(rows) < 80:
    sys.exit('Too few places, keeping the old file')
OUT.write_text('[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n]\n')
