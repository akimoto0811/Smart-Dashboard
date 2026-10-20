"""Build station-coords.json: the map position of every MTR station in app.js.

The official MTR open data has no coordinates, so positions come from
OpenStreetMap. Stations are matched by English or Chinese name; Light Rail
stops are left out. Run by .github/workflows/mtr-data.yml.
"""
import json, math, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
BOX = '(22.15,113.82,22.57,114.45)'  # Hong Kong
QUERY = f"""[out:json][timeout:90];
(node["railway"="station"]{BOX};way["railway"="station"]{BOX};relation["railway"="station"]{BOX};
 node["public_transport"="station"]{BOX};way["public_transport"="station"]{BOX};);
out center tags;"""
SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
           'https://overpass.private.coffee/api/interpreter']

def norm(s):
    s = (s or '').lower().replace('station', '').replace('站', '')
    return re.sub(r'[^0-9a-z一-鿿]', '', s)

def km(a, b):
    la = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * math.cos(la))

stations = re.findall(r"\['([A-Z]{3})','([^']+)','([^']+)'\]", (HERE / 'app.js').read_text())
stations = list({code: (code, en, tc) for code, en, tc in stations}.values())

def fetch():
    for attempt in range(3):
        for url in SERVERS:
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': QUERY}).encode(),
                                             headers={'User-Agent': 'Smart-Dashboard MTR ETA (github.com/akimoto0811/Smart-Dashboard)'})
                return json.load(urllib.request.urlopen(req, timeout=180))['elements']
            except Exception as e:
                print('Overpass', url, 'failed:', e)
        time.sleep(20)
    sys.exit('No Overpass server answered')

elements = fetch()
print(len(elements), 'OpenStreetMap stations')

def light_rail(t):
    return t.get('light_rail') == 'yes' or t.get('station') == 'light_rail' or 'light rail' in (t.get('network', '') + t.get('name:en', '')).lower()

index = {}
for e in elements:
    t = e.get('tags', {})
    pos = (e['lat'], e['lon']) if 'lat' in e else (e['center']['lat'], e['center']['lon']) if 'center' in e else None
    if not pos or light_rail(t):
        continue
    names = {t.get(k) for k in ('name', 'name:en', 'name:zh', 'name:zh-Hant', 'name:zh-HK', 'official_name:en')}
    # "金鐘 Admiralty" style names: index each half too.
    for n in list(names):
        if n and ' ' in n and re.search(r'[一-鿿]', n):
            names.update(n.split(' ', 1))
    mtr = 'mtr' in (t.get('network', '') + t.get('operator', '')).lower() or '港鐵' in t.get('operator', '')
    for n in names:
        if n:
            index.setdefault(norm(n), []).append((pos, mtr))

out, problems = {}, []
for code, en, tc in stations:
    cands = index.get(norm(en), []) + index.get(norm(tc), [])
    if any(m for _, m in cands):
        cands = [c for c in cands if c[1]]
    if not cands:
        problems.append(f'{code} {en}: not found')
        continue
    pts = [p for p, _ in cands]
    lat = sum(p[0] for p in pts) / len(pts)
    lng = sum(p[1] for p in pts) / len(pts)
    spread = max(km(p, (lat, lng)) for p in pts)
    if spread > 0.6:
        problems.append(f'{code} {en}: {len(pts)} matches spread {spread:.1f} km {pts}')
        continue
    out[code] = [round(lat, 5), round(lng, 5)]

for p in problems:
    print('PROBLEM', p)
(HERE / 'station-coords.json').write_text(json.dumps({'schema': 1, 'source': 'OpenStreetMap contributors (ODbL)', 'stations': out}, separators=(',', ':')) + '\n')
print(len(out), 'of', len(stations), 'stations placed')
sys.exit(1 if problems else 0)
