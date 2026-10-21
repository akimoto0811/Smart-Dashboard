"""Build tram-eta/tram-data.json and ferry-eta/ferry-data.json from official open data.

Run weekly by .github/workflows/tram-ferry-data.yml (GitHub's runners can reach
data.gov.hk and the operators' sites). Sources:
  - TD "Routes and fares of public transport": JSON_TRAM.json, JSON_FERRY.json
  - TD "Schedules and Fare Tables of Licensed Ferry Services" (one CSV per service)
  - The Star Ferry timetable and fare CSVs
  - 1823 public holiday calendar
Cross-boundary ferries are not in any of these sources, so none are included.
Set RAW=<dir> to read previously downloaded files instead of fetching.
"""
import csv, io, json, os, re, sys, urllib.request
from datetime import datetime, timezone, timedelta

RAW = os.environ.get('RAW')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TD_FERRY = 'https://www.td.gov.hk/datagovhk_td/ferry-tt-ft/resources/{l}/ferry_{k}_{kind}_{s}.csv'
STAR = 'https://www.starferry.com.hk/sites/default/files/upload/open_data/csv/ferry_sf_{k}_{kind}_{s}.csv'


def fetch(url):
    if RAW:
        name = re.sub(r'[^\w.-]+', '_', url.split('://', 1)[1])[-120:]
        with open(os.path.join(RAW, name), 'rb') as f:
            return f.read()
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 Smart-Dashboard data build'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == 2:
                raise


def rows(url):
    return list(csv.reader(io.StringIO(fetch(url).decode('utf-8-sig', 'replace'))))


def features(name):
    return json.loads(fetch('https://static.data.gov.hk/td/routes-fares-geojson/' + name).decode('utf-8-sig'))['features']


# ---------------------------------------------------------------- tram

def build_tram():
    """Stops are merged across directions ("Kornhill (West bound)" and "(East bound)"
    become one "Kornhill"), and listed west to east, Kennedy Town to Shau Kei Wan."""
    pts, routes = {}, {}
    for f in features('JSON_TRAM.json'):
        p = f['properties']
        en = re.sub(r'\s*\((West|East) bound\)\s*$', '', p['stopNameE'].replace('Kennnedy', 'Kennedy').replace('Patht', 'Path')).strip()
        tc = re.sub(r'\s*[（(][東西]行方向[)）]\s*$', '', p['stopNameC']).strip()
        lng, lat = f['geometry']['coordinates'][:2]
        pts.setdefault(en, {'tc': tc, 'pts': []})['pts'].append((lat, lng))
        r = routes.setdefault(p['routeId'], {
            'id': p['routeId'], 'en': p['routeNameE'], 'tc': re.sub(r'線$', '', p['routeNameC']),
            'mins': p['journeyTime'], 'fare': p['fullFare'], 'dirs': {}})
        r['dirs'].setdefault(p['routeSeq'], []).append((p['stopSeq'], en))
    for r in routes.values():
        r['dirs'] = [[n for _, n in sorted(v)] for _, v in sorted(r['dirs'].items())]
    order = sorted(pts, key=lambda n: sum(y for _, y in pts[n]['pts']) / len(pts[n]['pts']))
    index = {n: i for i, n in enumerate(order)}
    stops = []
    for n in order:
        v = pts[n]
        lat = sum(x for x, _ in v['pts']) / len(v['pts'])
        lng = sum(y for _, y in v['pts']) / len(v['pts'])
        stops.append({'en': n, 'tc': v['tc'], 'lat': round(lat, 6), 'lng': round(lng, 6)})
    out = []
    for r in sorted(routes.values(), key=lambda r: r['id']):
        r['dirs'] = [[index[n] for n in d] for d in r['dirs']]
        out.append(r)
    # HK Tramways' own stop codes (e.g. 32W, 75E), used to ask for live arrivals.
    key = lambda n: re.sub(r'[^a-z0-9]', '', n.lower())
    by_name = {key(st['en']): st for st in stops}
    try:
        for row in rows('https://static.data.gov.hk/tramways/datasets/tram_stops/summary_tram_stops_en.csv')[1:]:
            if len(row) < 3 or row[1].strip() in ('T', 'D', ''):
                continue
            st = by_name.get(key(row[2]))
            if st is None:
                print('tram stop code without a TD stop:', row, file=sys.stderr)
                continue
            st.setdefault('codes', []).append(row[1].strip())
    except Exception as e:
        print('tram stop codes unavailable:', e, file=sys.stderr)
    return {'stops': stops, 'routes': out}


# ---------------------------------------------------------------- ferry

# Place names used in the timetables, with Chinese names and the pier position
# (from JSON_FERRY.json's stop coordinates).
PLACES = {
    'Central': ('中環', 22.2879, 114.1585), 'Tsim Sha Tsui': ('尖沙咀', 22.29376, 114.16864),
    'Wan Chai': ('灣仔', 22.28304, 114.17626), 'Cheung Chau': ('長洲', 22.20862, 114.02848),
    'Mui Wo': ('梅窩', 22.26506, 114.00216), 'Peng Chau': ('坪洲', 22.28454, 114.03714),
    'Hei Ling Chau': ('喜靈洲', 22.25796, 114.02774), 'Yung Shue Wan': ('榕樹灣', 22.22632, 114.10886),
    'Sok Kwu Wan': ('索罟灣', 22.20634, 114.1311), 'Discovery Bay': ('愉景灣', 22.29688, 114.01775),
    'Discovery Bay North': ('愉景灣北', 22.30634, 114.01689), 'Ma Wan': ('馬灣', 22.35287, 114.06429),
    'Tsuen Wan': ('荃灣', 22.36673, 114.11073), 'North Point': ('北角', 22.29419, 114.20086),
    'Hung Hom': ('紅磡', 22.30112, 114.19026), 'Kowloon City': ('九龍城', 22.31787, 114.19428),
    'Kwun Tong': ('觀塘', 22.30618, 114.22143), 'Kai Tak': ('啟德', 22.30978, 114.21302),
    'Sai Wan Ho': ('西灣河', 22.2864, 114.22411), 'Sam Ka Tsuen': ('三家村', 22.29078, 114.23648),
    'Tuen Mun': ('屯門', 22.37208, 113.96609), 'Tung Chung': ('東涌', 22.29417, 113.94041),
    'Sha Lo Wan': ('沙螺灣', 22.29376, 113.90401), 'Tai O': ('大澳', 22.2524, 113.86066),
    'Aberdeen': ('香港仔', 22.24705, 114.15425), 'Pak Kok Tsuen': ('北角村', 22.23659, 114.10992),
    'Chi Ma Wan': ('芝麻灣', 22.23965, 114.00027), 'Trappist Monastery': ('聖母神樂院', 22.28199, 114.02304),
    'Mo Tat': ('模達', 22.20924, 114.14556),
}
ALIAS = {'Chueung Chau': 'Cheung Chau', 'Wanchai': 'Wan Chai', 'Peng Chau Public Pier': 'Peng Chau'}

# Services with TD timetables: (key, source, names, JSON_FERRY route names, live ETA)
SERVICES = [
    ('central_cc', 'td', 'Central – Cheung Chau', '中環 – 長洲', ['Central - Cheung Chau'], {'sun': ['CECC', 'CCCE']}),
    ('central_mw', 'td', 'Central – Mui Wo', '中環 – 梅窩', ['Central - Mui Wo'], {'sun': ['CEMW', 'MWCE']}),
    ('central_ysw', 'td', 'Central – Yung Shue Wan', '中環 – 榕樹灣', ['Central - Yung Shue Wan'], {'hkkf': 2}),
    ('central_skw', 'td', 'Central – Sok Kwu Wan', '中環 – 索罟灣', ['Central - Sok Kwu Wan'], {'hkkf': 1}),
    ('central_pc', 'td', 'Central – Peng Chau – Hei Ling Chau', '中環 – 坪洲 – 喜靈洲',
     ['Central - Peng Chau', 'Central - Peng Chau - Hei Ling Chau'], {'hkkf': [3, 4]}),
    ('central_db', 'td', 'Central – Discovery Bay', '中環 – 愉景灣', ['Central - Discovery Bay'], None),
    ('central_tsimshatsui', 'star', 'Star Ferry: Central – Tsim Sha Tsui', '天星小輪：中環 – 尖沙咀', ['Tsim Sha Tsui - Central'], None),
    ('wanchai_tsimshatsui', 'star', 'Star Ferry: Wan Chai – Tsim Sha Tsui', '天星小輪：灣仔 – 尖沙咀', ['Tsim Sha Tsui - Wan Chai'], None),
    ('c_hh', 'td', 'Central – Hung Hom', '中環 – 紅磡', ['Central - Hung Hom'], None),
    ('np_hh', 'td', 'North Point – Hung Hom', '北角 – 紅磡', ['North Point - Hung Hom'], {'sun': ['NPHH', 'HHNP']}),
    ('np_klnc', 'td', 'North Point – Kowloon City', '北角 – 九龍城', ['North Point - Kowloon City'], {'sun': ['NPKC', 'KCNP']}),
    ('np_ktak', 'td', 'North Point – Kwun Tong – Kai Tak', '北角 – 觀塘 – 啟德', ['North Point - Kwun Tong - Kai Tak'], None),
    ('np_kt', 'td', 'North Point – Kwun Tong', '北角 – 觀塘', ['North Point - Kwun Tong'], None),
    ('swh_kt', 'td', 'Sai Wan Ho – Kwun Tong', '西灣河 – 觀塘', ['Sai Wan Ho - Kwun Tong'], None),
    ('swh_skt', 'td', 'Sai Wan Ho – Sam Ka Tsuen', '西灣河 – 三家村', ['Sai Wan Ho - Sam Ka Tsuen'], None),
    ('pc_mw_cmw_cc', 'td', 'Inter-islands: Peng Chau – Mui Wo – Chi Ma Wan – Cheung Chau', '橫水渡：坪洲 – 梅窩 – 芝麻灣 – 長洲',
     ['Peng Chau - Mui Wo - Chi Ma Wan - Cheung Chau', 'Peng Chau - Mui Wo - Cheung Chau', 'Mui Wo - Cheung Chau', 'Peng Chau - Mui Wo'],
     {'sun': ['IIPECMUW', 'IIMUWPEC', 'IIMUWCMW', 'IICMWMUW', 'IICMWCHC', 'IICHCCMW', 'IICHCMUW', 'IIMUWCHC']}),
    ('db_mw', 'td', 'Discovery Bay – Mui Wo', '愉景灣 – 梅窩', ['Discovery Bay - Mui Wo', 'Discovery Bay - Peng Chau - Mui Wo'], None),
    ('db_pc_tm', 'td', 'Peng Chau – Trappist Monastery – Discovery Bay', '坪洲 – 聖母神樂院 – 愉景灣',
     ['Peng Chau - Trappist Monastery - Discovery Bay', 'Peng Chau - Discovery Bay'], None),
    ('mawan_c', 'td', 'Ma Wan – Central', '馬灣 – 中環', ['Ma Wan - Central'], None),
    ('mawan_tw', 'td', 'Ma Wan – Tsuen Wan', '馬灣 – 荃灣', ['Ma Wan - Tsuen Wan'], None),
    ('tm_tc_slw_to', 'td', 'Tuen Mun – Tung Chung – Sha Lo Wan – Tai O', '屯門 – 東涌 – 沙螺灣 – 大澳',
     ['Tuen Mun - Tung Chung - Sha Lo Wan - Tai O', 'Tuen Mun - Tung Chung', 'Tung Chung - Sha Lo Wan - Tai O'], None),
    ('abd_skw', 'td', 'Aberdeen – Sok Kwu Wan (via Mo Tat)', '香港仔 – 索罟灣（經模達）', ['Aberdeen - Sok Kwu Wan'], None),
    ('abd_ysw', 'td', 'Aberdeen – Yung Shue Wan (via Pak Kok Tsuen)', '香港仔 – 榕樹灣（經北角村）', ['Aberdeen - Yung Shue Wan'], None),
]


def place(s):
    s = re.sub(r'\s+', ' ', s).strip()
    return ALIAS.get(s, s)


def days(s):
    """Which day types a 'Service Date' string covers: w = Mon-Fri, s = Sat, h = Sun and public holidays."""
    s = s.lower()
    if 'demand' in s:
        return ''
    if 'daily' in s:
        return 'wsh'
    if 'mon' in s and ('sat' in s or 'mon – sat' in s):
        return 'ws'
    if 'mon' in s and 'fri' in s:
        return 'w'
    if 'sat' in s and 'sun' in s:
        return 'sh'
    if 'sat' in s:
        return 's'
    if 'sun' in s:
        return 'h'
    return ''


def minutes(s):
    m = re.search(r'(\d{1,2})(?:[:.](\d\d))?(?::\d\d)?\s*(a\.?\s*m|p\.?\s*m|noon)', s.lower())
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)[0]
    if ap == 'n':
        return 12 * 60 + mi
    h = h % 12 + (12 if ap == 'p' else 0)
    return h * 60 + mi


def direction(text):
    text = re.sub(r'\s+', ' ', text).strip()
    via = ''
    m = re.match(r'(.+?) via (.+)', text)
    if m:
        text, via = m.group(1), re.sub(r' Public Pier$', '', m.group(2))
    m = re.match(r'(.+?) to (.+)', text)
    if not m:
        return None
    return place(m.group(1)), place(m.group(2)), place(via) if via else ''


def td_timetable(key):
    data = rows(TD_FERRY.format(l='en', k=key, kind='timetable', s='eng'))
    head = [h.strip() for h in data[0]]
    dirs = {}
    for r in data[1:]:
        r = dict(zip(head, r))
        if 'Bound' in r:  # Tuen Mun - Tai O: "From" + "Bound" columns
            d = (place(r['From']), place(r['Bound']), '')
            t = r.get('Time', '')
        else:
            d = direction(r.get('Direction', ''))
            t = r.get('Service Hour') or r.get('Timetable') or ''
        dt, m = days(r.get('Service Date', '')), minutes(t)
        if not d or not dt or m is None:
            continue
        flag = bool((r.get('Remark') or r.get('Remarks') or '').strip())
        entry = dirs.setdefault(d, {'f': d[0], 't': d[1], 'via': d[2], 'w': [], 's': [], 'h': []})
        for c in dt:
            entry[c].append(m)
    for e in dirs.values():
        for c in 'wsh':
            e[c] = sorted(set(e[c]))
        if not e['via']:
            del e['via']
    return list(dirs.values())


def star_timetable(key):
    data = rows(STAR.format(k=key, kind='timetable', s='eng'))
    start = next(i for i, r in enumerate(data) if r and r[0].strip() == 'Direction')
    dirs = {}
    for r in data[start + 1:]:
        if len(r) < 4 or ' to ' not in r[0]:
            continue
        d = direction(r[0])
        span = re.match(r'\s*(.+?)\s*-\s*(.+)', r[2])
        if not d or not span:
            continue
        a, b = (minutes(re.sub(r'(am|pm)', r' \1', x)) for x in span.groups())
        every = re.sub(r'\s*-+\s*', '–', r[3].strip())
        entry = dirs.setdefault(d, {'f': d[0], 't': d[1], 'w': [], 's': [], 'h': [], 'bands': True})
        for c in days(r[1]):
            entry[c].append([a, b, every])
    return list(dirs.values())


def fare_rows(source, key):
    if source == 'star':
        data = rows(STAR.format(k=key, kind='faretable', s='eng'))
        start = next(i for i, r in enumerate(data) if r and r[0].strip() == 'Passenger')
        head, adult = data[start], next(r for r in data[start + 1:] if r and r[0].strip().lower() == 'adult')
        out = []
        for h, v in zip(head[1:5], adult[1:5]):
            dt, v = days(h), re.sub(r'[^\d.]', '', v)
            if not v:
                continue
            deck_en = 'Upper deck' if 'Upper' in h else 'Lower deck' if 'Lower' in h else ''
            deck_tc = {'Upper deck': '上層', 'Lower deck': '下層'}.get(deck_en, '')
            out.append({'d': dt, 'en': deck_en, 'tc': deck_tc, 'fare': float(v)})
        return out
    en = rows(TD_FERRY.format(l='en', k=key, kind='faretable', s='eng'))
    tc = rows(TD_FERRY.format(l='tc', k=key, kind='faretable', s='chi'))
    head = [h.strip() for h in en[0]]
    fare_col = next(i for i, h in enumerate(head) if h.startswith('Fare (HK'))
    extra = [i for i, h in enumerate(head) if h in ('Route', 'Ferry Type', 'Journey')]
    date_col = head.index('Service Date') if 'Service Date' in head else None
    pi = head.index('Passenger')
    out = []
    for n, r in enumerate(en[1:], 1):
        if len(r) <= fare_col or not re.search(r'single journey\s*-\s*adult|^adult', r[pi].strip(), re.I):
            continue
        v = re.sub(r'[^\d.]', '', r[fare_col])
        if not v:
            continue
        t = tc[n] if len(tc) == len(en) and len(tc[n]) > max(extra + [0]) and '成人' in ''.join(tc[n]) else r
        note_en = re.search(r'\((.+)\)\s*$', r[pi].strip())
        note_tc = re.search(r'[（(](.+)[)）]\s*$', t[pi].strip())
        label_en = ' · '.join([r[i].strip() for i in extra if r[i].strip()] + ([note_en.group(1)] if note_en else []))
        label_tc = ' · '.join([t[i].strip() for i in extra if t[i].strip()] + ([note_tc.group(1)] if note_tc and t is not r else []))
        out.append({'d': days(r[date_col]) if date_col is not None else 'wsh', 'en': label_en, 'tc': label_tc, 'fare': float(v)})
    return out[:8]


def holidays():
    try:
        cal = json.loads(fetch('https://www.1823.gov.hk/common/ical/en.json').decode('utf-8-sig'))
        days_ = []
        for ev in cal['vcalendar'][0]['vevent']:
            d = ev['dtstart'][0]
            days_.append(f'{d[:4]}-{d[4:6]}-{d[6:8]}')
        return sorted(days_)
    except Exception as e:
        print('holidays unavailable:', e, file=sys.stderr)
        return []


def build_ferry():
    routes = {}
    for f in features('JSON_FERRY.json'):
        p = f['properties']
        r = routes.setdefault(p['routeNameE'].replace('–', '-'), {
            'en': p['routeNameE'], 'tc': p['routeNameC'], 'fare': p['fullFare'], 'mins': p['journeyTime'],
            'kaito': p['district'] == 'KAITO', 'link_en': p['hyperlinkE'], 'link_tc': p['hyperlinkC'], 'stops': {}})
        lng, lat = f['geometry']['coordinates'][:2]
        r['stops'].setdefault(p['stopNameE'], (p['stopNameC'], round(lat, 6), round(lng, 6), p['routeSeq'], p['stopSeq']))
    used, services = set(), []
    for key, source, en, tc, names, live in SERVICES:
        try:
            dirs = td_timetable(key) if source == 'td' else star_timetable(key)
            fares = fare_rows(source, key)
        except Exception as e:
            print('skipped', key, e, file=sys.stderr)
            continue
        if not dirs:
            continue
        info = [routes[n] for n in names if n in routes]
        used.update(n for n in names if n in routes)
        s = {'id': key, 'en': en, 'tc': tc, 'dirs': dirs, 'fares': fares}
        if info:
            s['mins'] = info[0]['mins']
            s['link_en'], s['link_tc'] = info[0]['link_en'], info[0]['link_tc']
        if live:
            s['live'] = live
        services.append(s)
    kaito = []
    for name, r in sorted(routes.items()):
        if name in used or not r['kaito']:
            continue
        stops = sorted(r['stops'].items(), key=lambda kv: (kv[1][3], kv[1][4]))
        kaito.append({'en': r['en'], 'tc': r['tc'], 'fare': r['fare'], 'mins': r['mins'], 'link_en': r['link_en'], 'link_tc': r['link_tc'],
                      'piers': [{'en': n, 'tc': v[0], 'lat': v[1], 'lng': v[2]} for n, v in stops if v[3] == stops[0][1][3]]})
    places = {}
    for s in services:
        for d in s['dirs']:
            for p in (d['f'], d['t'], d.get('via')):
                if p:
                    places[p] = PLACES.get(p, (p, None, None))
    missing = sorted(p for p, v in places.items() if v[1] is None)
    if missing:
        print('places without a position:', missing, file=sys.stderr)
    return {'holidays': holidays(), 'places': {k: list(v) for k, v in sorted(places.items())}, 'services': services, 'kaito': kaito}


def write(path, data):
    data = {'updated': datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d'), **data}
    with open(os.path.join(ROOT, path), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(path, os.path.getsize(os.path.join(ROOT, path)), 'bytes')


if __name__ == '__main__':
    tram = build_tram()
    assert len(tram['routes']) >= 5 and len(tram['stops']) >= 50, 'tram data looks incomplete'
    write('tram-eta/tram-data.json', tram)
    ferry = build_ferry()
    assert len(ferry['services']) >= 15, 'ferry data looks incomplete'
    write('ferry-eta/ferry-data.json', ferry)
