"""One-off probe of data.gov.hk tram and ferry datasets (run by GitHub Actions)."""
import json, urllib.request, urllib.parse

def get(url, headers=None):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 Smart-Dashboard probe', 'Origin': 'https://akimoto0811.github.io', **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, dict(r.headers), r.read()

for q in ['tram', 'ferry', 'hktramways']:
    for lang in ['en-data']:
        url = f'https://data.gov.hk/{lang}/api/3/action/package_search?' + urllib.parse.urlencode({'q': q, 'rows': 60})
        try:
            _, _, body = get(url)
            res = json.loads(body)['result']
            print(f'=== {q}: {res["count"]} datasets')
            for p in res['results']:
                org = (p.get('organization') or {}).get('title', '')
                print('*', p['name'], '|', p.get('title'), '|', org)
                for r in p.get('resources', []):
                    print('   -', r.get('format'), r.get('name'), r.get('url'))
        except Exception as e:
            print('search failed', q, e)

for url in ['https://www.hktramways.com/nextTram/geteat.php?stop_code=01E',
            'https://hktramways.com/nextTram/geteat.php?stop_code=01E']:
    try:
        s, h, b = get(url)
        print('\n###', url, s, {k: v for k, v in h.items() if k.lower().startswith(('access-control', 'content-type'))})
        print(b[:1500].decode('utf-8', 'replace'))
    except Exception as e:
        print('###', url, 'failed', e)
