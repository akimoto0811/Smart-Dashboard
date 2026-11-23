// Favourite alerts, step 2 of notifications.
// Each phone saves its alerts (a favourite bus stop or MTR station, the days and
// time window of the commute, and how many minutes ahead to warn). Every minute
// the cron trigger asks the AlertStore to check live times for the alerts that
// are active now and push a notification when the next arrival is close.
import { DurableObject } from 'cloudflare:workers';
import { sendPush } from './webpush.js';

const MAX_ALERTS = 10;   // per phone
const MAX_PHONES = 300;  // in total
const HK_OFFSET = 8 * 60; // Hong Kong is UTC+8 all year

// Minutes since midnight and weekday (0 = Sunday) in Hong Kong.
function hkClock(now = Date.now()) {
  const d = new Date(now + HK_OFFSET * 60000);
  return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
const clean = (s, n = 80) => String(s ?? '').slice(0, n);

// Keeps only the fields an alert needs, so nothing else is stored.
export function cleanAlert(a) {
  if (!a || typeof a !== 'object') return null;
  const days = [...new Set((Array.isArray(a.days) ? a.days : []).map(Number).filter(d => d >= 0 && d <= 6))];
  const start = toMin(a.start), end = toMin(a.end), lead = Math.min(30, Math.max(1, Number(a.lead) || 5));
  if (!days.length || start === null || end === null) return null;
  const base = { id: clean(a.id, 120), on: a.on !== false, days, start: clean(a.start, 5), end: clean(a.end, 5), lead, title: clean(a.title, 90), stop: clean(a.stop, 90) };
  if (!base.id) return null;
  if (a.kind === 'bus') {
    const variants = (Array.isArray(a.variants) ? a.variants : []).slice(0, 3).map(v => ({
      operator: v?.operator === 'CTB' ? 'CTB' : 'KMB', route: clean(v?.route, 6).toUpperCase(),
      direction: v?.direction === 'I' ? 'I' : 'O', service_type: clean(v?.service_type || '1', 3), stop_id: clean(v?.stop_id, 40),
    })).filter(v => /^[A-Z0-9]{1,6}$/.test(v.route) && /^[A-Za-z0-9]{1,40}$/.test(v.stop_id));
    return variants.length ? { ...base, kind: 'bus', variants } : null;
  }
  if (a.kind === 'mtr') {
    const line = clean(a.line, 4).toUpperCase(), sta = clean(a.sta, 4).toUpperCase();
    if (!/^[A-Z]{2,4}$/.test(line) || !/^[A-Z]{3}$/.test(sta)) return null;
    return { ...base, kind: 'mtr', line, sta, dir: a.dir === 'DOWN' ? 'DOWN' : 'UP', towards: clean(a.towards, 60) };
  }
  return null;
}

function activeNow(a, clock) {
  const s = toMin(a.start), e = toMin(a.end);
  if (!a.on || s === null || e === null) return false;
  // A window that crosses midnight (e.g. 23:30–00:30) counts from the start day.
  if (s <= e) return a.days.includes(clock.day) && clock.min >= s && clock.min <= e;
  return (a.days.includes(clock.day) && clock.min >= s) || (a.days.includes((clock.day + 6) % 7) && clock.min <= e);
}

async function getJSON(url, cache) {
  if (!cache.has(url)) cache.set(url, fetch(url, { headers: { Accept: 'application/json' } }).then(r => r.ok ? r.json() : null).catch(() => null));
  return cache.get(url);
}

// Next arrival times (ms) for an alert, soonest first.
async function arrivals(a, cache) {
  const now = Date.now();
  if (a.kind === 'bus') {
    const lists = await Promise.all(a.variants.map(async v => {
      const url = v.operator === 'CTB'
        ? `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${encodeURIComponent(v.stop_id)}/${encodeURIComponent(v.route)}`
        : `https://data.etabus.gov.hk/v1/transport/kmb/eta/${encodeURIComponent(v.stop_id)}/${encodeURIComponent(v.route)}/${encodeURIComponent(v.service_type || '1')}`;
      const j = await getJSON(url, cache);
      return (j?.data || []).filter(x => String(x.route).trim() === v.route && (!x.dir || x.dir === v.direction) && x.eta)
        .map(x => Date.parse(x.eta)).filter(t => Number.isFinite(t) && t > now - 30000);
    }));
    return lists.flat().sort((x, y) => x - y);
  }
  const j = await getJSON(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${a.line}&sta=${a.sta}`, cache);
  const trains = j?.data?.[`${a.line}-${a.sta}`]?.[a.dir] || [];
  // "time" is MTR's own arrival time (HK clock, to the second). "ttnt" is only
  // whole minutes, so it's the fallback.
  return trains.map(x => {
    const t = Date.parse(String(x.time || '').replace(' ', 'T') + '+08:00');
    return Number.isFinite(t) ? t : now + Number(x.ttnt) * 60000;
  }).filter(Number.isFinite).sort((x, y) => x - y);
}

function message(a, mins, lang) {
  const tc = lang === 'tc';
  const when = mins <= 0 ? (tc ? '即將到達' : 'arriving now') : (tc ? `${mins} 分鐘後到達` : `in ${mins} min`);
  const body = a.kind === 'mtr'
    ? `${a.stop}${a.towards ? (tc ? ` · 往${a.towards}` : ` · to ${a.towards}`) : ''}`
    : a.stop;
  return {
    title: `${a.kind === 'mtr' ? '🚇' : '🚌'} ${a.title} ${when}`,
    body,
    url: a.kind === 'mtr' ? `/mtr-eta/` : `/bus-eta/#fav=${encodeURIComponent(a.variants[0].route + '|' + a.variants[0].stop_id)}`,
    tag: 'alert-' + a.id,
  };
}

export class AlertStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS phones (endpoint TEXT PRIMARY KEY, sub TEXT NOT NULL, lang TEXT, alerts TEXT NOT NULL, sent TEXT NOT NULL DEFAULT '{}', updated INTEGER)`);
  }

  // Replaces this phone's alerts. An empty list removes the phone.
  save(sub, lang, alerts) {
    if (!alerts.length) { this.sql.exec('DELETE FROM phones WHERE endpoint = ?', sub.endpoint); return { ok: true, count: 0 }; }
    const exists = this.sql.exec('SELECT 1 FROM phones WHERE endpoint = ?', sub.endpoint).toArray().length;
    if (!exists && this.sql.exec('SELECT COUNT(*) AS n FROM phones').one().n >= MAX_PHONES) return { ok: false, error: 'full' };
    this.sql.exec(`INSERT INTO phones (endpoint, sub, lang, alerts, updated) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET sub = excluded.sub, lang = excluded.lang, alerts = excluded.alerts, updated = excluded.updated`,
      sub.endpoint, JSON.stringify(sub), lang, JSON.stringify(alerts.slice(0, MAX_ALERTS)), Date.now());
    return { ok: true, count: Math.min(alerts.length, MAX_ALERTS) };
  }

  list(endpoint) {
    const row = this.sql.exec('SELECT alerts FROM phones WHERE endpoint = ?', endpoint).toArray()[0];
    return row ? JSON.parse(row.alerts) : [];
  }

  // Runs every minute from the cron trigger.
  async tick() {
    const clock = hkClock(), cache = new Map(), now = Date.now();
    let pushed = 0;
    for (const row of this.sql.exec('SELECT endpoint, sub, lang, alerts, sent FROM phones').toArray()) {
      const alerts = JSON.parse(row.alerts).filter(a => activeNow(a, clock));
      if (!alerts.length) continue;
      const sent = JSON.parse(row.sent || '{}');
      let changed = false, gone = false;
      for (const a of alerts) {
        // Arrivals already announced in the last 10 minutes (older rows stored one number).
        const before = Array.isArray(sent[a.id]) ? sent[a.id] : typeof sent[a.id] === 'number' ? [sent[a.id]] : [];
        const done = before.filter(t => t > now - 10 * 60000);
        if (done.length !== before.length) { sent[a.id] = done; changed = true; }
        // The soonest bus or train inside the warning time that hasn't been announced.
        // Looking past the first one matters: the train at the platform stays first in
        // MTR's list for a minute or two, and the one behind it must not wait for it.
        const next = (await arrivals(a, cache)).find(t => {
          const m = Math.round((t - now) / 60000);
          return m >= 1 && m <= a.lead && !done.some(d => Math.abs(d - t) < 90000);
        });
        if (!next) continue;
        const mins = Math.round((next - now) / 60000);
        const result = await sendPush(JSON.parse(row.sub), message(a, mins, row.lang), this.env, { ttl: 120 });
        if (result.gone) { gone = true; break; }
        if (result.ok) { sent[a.id] = [...done, next].slice(-6); changed = true; pushed++; }
      }
      if (gone) this.sql.exec('DELETE FROM phones WHERE endpoint = ?', row.endpoint);
      else if (changed) this.sql.exec('UPDATE phones SET sent = ? WHERE endpoint = ?', JSON.stringify(sent), row.endpoint);
    }
    return { pushed };
  }
}

export function store(env) { return env.ALERTS.get(env.ALERTS.idFromName('all')); }
