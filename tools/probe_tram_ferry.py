"""One-off fetch of raw tram and ferry open data into tools/raw/ (run by GitHub Actions)."""
import json, os, re, urllib.request

OUT = 'tools/raw'
os.makedirs(OUT, exist_ok=True)
log = []

def get(url, headers=None):
    h = {'User-Agent': 'Mozilla/5.0 Smart-Dashboard'}
    h.update(headers or {})
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=60) as r:
        return r.status, dict(r.headers), r.read()

def save(url, name=None, headers=None):
    name = name or re.sub(r'[^\w.-]+', '_', url.split('://', 1)[1])[-120:]
    try:
        s, h, b = get(url, headers)
        open(os.path.join(OUT, name), 'wb').write(b)
        log.append(f'{s} {len(b)} {name} {url} cors={h.get("Access-Control-Allow-Origin")} type={h.get("Content-Type")}')
    except Exception as e:
        log.append(f'ERR {name} {url} {e}')

save('https://static.data.gov.hk/td/routes-fares-geojson/JSON_FERRY.json')
save('https://static.data.gov.hk/td/routes-fares-geojson/JSON_TRAM.json')
for l in ['en', 'tc']:
    save(f'https://static.data.gov.hk/tramways/datasets/tram_stops/summary_tram_stops_{l}.csv')
    save(f'https://static.data.gov.hk/tramways/datasets/main_routes/tramways_main_routes_{l}.csv')

def resources(pkg):
    p = json.loads(get('https://data.gov.hk/en-data/api/3/action/package_show?id=' + pkg)[2])['result']
    return [r['url'] for r in p['resources']]

for pkg in ['hk-td-wcms_8-ferry-services-tt-ft', 'starferry-starferry-ferry-service-timetables-and-fare-tables-of-star-ferry',
            'sunferry-faretables-faretables', 'sunferry-timetables-timetables',
            'ckf-team1-chuen-kee-ferry-service-fare', 'ckf-team1-chuen-kee-ferry-service-time']:
    try:
        for u in resources(pkg):
            if u.lower().endswith('.csv') and not re.search(r'/sc/|_chs\.|_chi1\.', u):
                save(u)
    except Exception as e:
        log.append(f'ERR package {pkg} {e}')

# Other operators' own open data
for kind in ['Timetable', 'Faretable']:
    for r in ['CentralHH', 'NPKT', 'TMTO']:
        for l in ['eng', 'cht']:
            save(f'https://www.hongkongwatertaxi.com.hk/csv/{r}{kind}_{l}.csv')
save('https://www.hkkfeta.com/opendata/route', 'hkkf_route.json')
for path in ['pier', 'time_table', 'fare_table', 'eta']:
    for q in ['/1', '/1/', '?route_id=1', '/1/1', '/1/inbound']:
        save(f'https://www.hkkfeta.com/opendata/{path}{q}', f'hkkf_{path}_{re.sub(r"[^\w]+", "_", q)}.json')
save('https://www.hkkfeta.com/datagovhk/HKKF_ETA_API_Specification.pdf', 'hkkf_spec.pdf')
save('https://www.sunferry.com.hk/eta/SunFerry_ETA_API_Specification_and_Data_Dictionary.pdf', 'sunferry_spec.pdf')
for c in ['CECC', 'CCCE', 'CEMW', 'MWCE', 'NPHH', 'HHNP', 'NPKC', 'KCNP', 'IIPECMUW', 'IIMUWPEC']:
    save(f'https://www.sunferry.com.hk/eta/?route={c}', f'sunferry_eta_{c}.json')
for c in ['32W', '01E', '75E']:
    save(f'https://www.hktramways.com/nextTram/geteat.php?stop_code={c}', f'tram_eat_{c}.xml',
         {'Referer': 'https://www.hktramways.com/en/next-tram/', 'X-Requested-With': 'XMLHttpRequest'})

open(os.path.join(OUT, 'LOG.txt'), 'w').write('\n'.join(log) + '\n')
print('\n'.join(log))
