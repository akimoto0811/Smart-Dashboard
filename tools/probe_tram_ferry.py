"""One-off probe of data.gov.hk tram and ferry datasets (run by GitHub Actions)."""
import csv, io, json, re, urllib.request, urllib.parse

def get(url, method='GET'):
    req = urllib.request.Request(url, method=method, headers={'User-Agent': 'Mozilla/5.0 Smart-Dashboard probe', 'Origin': 'https://akimoto0811.github.io'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, dict(r.headers), r.read()

def show(url, n=1200, method='GET'):
    try:
        s, h, b = get(url, method)
        hdr = {k: v for k, v in h.items() if k.lower().startswith(('access-control', 'content-type', 'content-length'))}
        print(f'\n### {method} {url} -> {s} {hdr}')
        print(b[:n].decode('utf-8', 'replace'))
        return b
    except Exception as e:
        print(f'\n### {method} {url} FAILED {e}')

# Dataset names mentioning ferry or tram
for base in ['https://data.gov.hk/en-data/api/3/action/package_list']:
    try:
        names = json.loads(get(base)[2])['result']
        hits = [n for n in names if re.search('ferry|tram|ferries', n)]
        print('datasets:', len(names), hits)
        for n in hits:
            try:
                p = json.loads(get('https://data.gov.hk/en-data/api/3/action/package_show?id=' + n)[2])['result']
                print('*', n, '|', p.get('title'))
                for r in p.get('resources', []):
                    print('   -', r.get('format'), '|', r.get('name'), '|', r.get('url'))
            except Exception as e:
                print('*', n, 'show failed', e)
    except Exception as e:
        print('package_list failed', e)

b = show('https://static.data.gov.hk/tramways/datasets/tram_stops/summary_tram_stops_en.csv', 3000)
codes = []
if b:
    rows = list(csv.reader(io.StringIO(b.decode('utf-8-sig', 'replace'))))
    print('tram stop rows', len(rows))
    codes = [r[0] for r in rows[1:6]]
for c in codes[:3] + ['WST', '32W', '01E']:
    show('https://www.hktramways.com/nextTram/geteat.php?stop_code=' + c, 800)
show('https://www.hktramways.com/nextTram/geteat.php?stop_code=WST', 300, 'OPTIONS')

for f in ['JSON_FERRY.json', 'JSON_TRAM.json']:
    b = show('https://static.data.gov.hk/td/routes-fares-geojson/' + f, 1500)
    if b:
        try:
            d = json.loads(b)
            feats = d.get('features', [])
            print(f, 'features', len(feats))
            seen = set()
            for ft in feats:
                pr = ft.get('properties', {})
                key = (pr.get('companyCode'), pr.get('routeNameE'), pr.get('locStartNameE'), pr.get('locEndNameE'))
                if key not in seen:
                    seen.add(key)
                    print('  ', key, pr.get('fullFare'), pr.get('serviceMode'), pr.get('specialType'))
            print('props sample', json.dumps(feats[0].get('properties') if feats else None, ensure_ascii=False)[:800])
        except Exception as e:
            print('parse', e)

for u in ['https://www.hkkfeta.com/opendata/route', 'https://www.hkkfeta.com/opendata/pier',
          'https://www.hkkfeta.com/opendata/time_table/', 'https://www.hkkfeta.com/opendata/fare_table/',
          'https://www.hkkfeta.com/opendata/eta/', 'https://www.sunferry.com.hk/eta/?route=CCCE']:
    show(u, 1500)

import subprocess, sys
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'pypdf'])
from pypdf import PdfReader
for u in ['https://www.hkkfeta.com/datagovhk/HKKF_ETA_API_Specification.pdf',
          'https://www.sunferry.com.hk/eta/SunFerry_ETA_API_Specification_and_Data_Dictionary.pdf']:
    try:
        b = get(u)[2]
        text = '\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(b)).pages)
        print(f'\n### PDF {u}\n{text[:6000]}')
    except Exception as e:
        print('pdf failed', u, e)
