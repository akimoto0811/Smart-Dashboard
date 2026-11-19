// Alerts page, step 1: turn on push notifications on this phone and send a test.
(() => {
'use strict';
const $ = id => document.getElementById(id);
const lang = (() => { try { return JSON.parse(localStorage.getItem('dashboard_lang')) === 'tc' ? 'tc' : 'en'; } catch { return 'en'; } })();
document.documentElement.lang = lang === 'tc' ? 'zh-Hant-HK' : 'en';

const TEXT = {
  en: {},
  tc: {
    back: '主頁', title: '提示通知',
    installTitle: '請先加入主畫面', installDesc: 'iPhone 只容許主畫面上的 App 發出通知。請在 Safari 按「分享」→「加入主畫面」，再由該圖示開啟 HK Dashboard 並返回此頁。',
    pushTitle: '此手機的通知', enableBtn: '開啟通知', testBtn: '發送測試通知',
    favTitle: '收藏提示', favDesc: '揀選收藏、乘車日子及時間。下一班巴士或列車快到時會通知你。',
    keysTitle: '設定（只限管理員）', keysDesc: '伺服器尚未設定通知金鑰。請在此產生一對金鑰，然後在 Cloudflare 開啟 Workers & Pages → smart-dashboard → Settings → Variables and Secrets，以相同名稱加入為 Secret。請勿公開私密金鑰。',
    genBtn: '產生金鑰',
  },
};
const MSG = {
  en: { checking: 'Checking…', unsupported: 'This browser can\'t receive notifications.', needInstall: 'Open from the Home Screen icon to turn on.',
    off: 'Off', on: 'On for this phone', denied: 'Blocked. Turn on in Settings → Notifications → HK Dashboard.',
    notReady: 'Not available yet: the server isn\'t set up.', working: 'Working…', sent: 'Sent. It should arrive in a few seconds.',
    failed: 'Couldn\'t send. Try turning notifications off and on again.', netErr: 'No connection. Try again.', copied: 'Keys generated. Copy each one into Cloudflare.',
    noFavs: 'No favourites yet. Save a bus stop in Bus or a station in MTR, then come back here.', needOn: 'Turn on notifications above to use alerts.',
    saved: 'Saved. Alerts work even when the app is closed.', saveFailed: 'Couldn\'t save. Check your connection and try again.',
    from: 'From', to: 'to', when: 'Alert when', minAway: 'min away', towards: 'Towards', days: ['S','M','T','W','T','F','S'], to2: 'To' },
  tc: { checking: '檢查中…', unsupported: '此瀏覽器不能接收通知。', needInstall: '請由主畫面圖示開啟後再開啟通知。',
    off: '未開啟', on: '此手機已開啟', denied: '已被封鎖。請到「設定」→「通知」→ HK Dashboard 開啟。',
    notReady: '暫未可用：伺服器尚未設定。', working: '處理中…', sent: '已發送，幾秒內會收到。',
    failed: '未能發送。請嘗試關閉再開啟通知。', netErr: '未能連線，請再試。', copied: '已產生金鑰，請逐一複製到 Cloudflare。',
    noFavs: '暫未有收藏。請先在巴士收藏車站，或在港鐵收藏車站，再返回此頁。', needOn: '請先在上方開啟通知，才可使用提示。',
    saved: '已儲存。即使關閉 App 亦會收到提示。', saveFailed: '未能儲存，請檢查網絡後再試。',
    from: '由', to: '至', when: '到站前', minAway: '分鐘提示', towards: '方向', days: ['日','一','二','三','四','五','六'], to2: '往' },
}[lang];

for (const [id, value] of Object.entries(TEXT[lang])) if ($(id)) $(id).textContent = value;

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const SUB_KEY = 'dashboard_push_subscription';
const ALERTS_KEY = 'dashboard_alerts';
let pushOn = false;

function setStatus(text, kind = '') { $('statusText').textContent = text; $('status').className = 'status ' + kind; }
function say(text) { $('msg').textContent = text || ''; }

async function serverKey() {
  const r = await fetch('/api/push/key', { cache: 'no-store' });
  if (!r.ok) throw new Error('key ' + r.status);
  return r.json();
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
}
function bytesToB64url(buf) {
  let bin = ''; for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function registration() {
  await navigator.serviceWorker.register('../sw.js');
  return navigator.serviceWorker.ready;
}

function showOn() {
  pushOn = true; renderFavs(); void syncFromServer();
  setStatus(MSG.on, 'on');
  $('enableBtn').classList.add('hidden');
  $('testBtn').classList.remove('hidden');
}

async function init() {
  if (isIOS && !standalone) $('installCard').classList.remove('hidden');
  let key = null;
  try { key = await serverKey(); } catch { /* offline or not deployed yet */ }
  if (key && !key.configured) $('keysCard').classList.remove('hidden');

  if (!supported) {
    setStatus(isIOS && !standalone ? MSG.needInstall : MSG.unsupported, 'warn');
    $('enableBtn').disabled = true;
    return;
  }
  if (Notification.permission === 'denied') { setStatus(MSG.denied, 'warn'); $('enableBtn').disabled = true; return; }
  if (key && !key.configured) { setStatus(MSG.notReady, 'warn'); $('enableBtn').disabled = true; return; }

  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      localStorage.setItem(SUB_KEY, JSON.stringify(sub));
      return showOn();
    }
  } catch { /* fall through to Off */ }
  setStatus(MSG.off);
}

$('enableBtn').onclick = async () => {
  say(MSG.working);
  try {
    // iOS only shows the permission prompt when it comes straight from a tap.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { setStatus(MSG.denied, 'warn'); say(''); return; }
    const key = await serverKey();
    if (!key.configured) { setStatus(MSG.notReady, 'warn'); say(''); return; }
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with an older key won't work: replace it.
    if (sub && bytesToB64url(sub.options.applicationServerKey || new ArrayBuffer(0)) !== key.publicKey) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key.publicKey) });
    localStorage.setItem(SUB_KEY, JSON.stringify(sub));
    showOn();
    say('');
  } catch (e) {
    say(MSG.failed);
  }
};

$('testBtn').onclick = async () => {
  $('testBtn').disabled = true; say(MSG.working);
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { setStatus(MSG.off); $('enableBtn').classList.remove('hidden'); $('testBtn').classList.add('hidden'); say(''); return; }
    const r = await fetch('/api/push/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), lang }),
    });
    say(r.ok ? MSG.sent : MSG.failed);
  } catch { say(MSG.netErr); }
  finally { $('testBtn').disabled = false; }
};

// Owner setup: makes a VAPID key pair in the browser, so no terminal is needed.
$('genBtn').onclick = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  $('pubOut').value = bytesToB64url(await crypto.subtle.exportKey('raw', pair.publicKey));
  $('privOut').value = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
  $('keyOut').classList.remove('hidden');
  say(MSG.copied);
};

// ---------------------------------------------------------------- favourite alerts
// Each favourite bus stop or MTR station can have one alert: the days and time
// window of the trip, and how many minutes before the arrival to notify. The list
// is kept on the phone and saved to the server, which checks live times.
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
let alerts = (read(ALERTS_KEY) || []).filter(a => a && a.id);
let mtrLines = null;

function favourites() {
  const out = [];
  for (const f of (read('hkbus_favourites_v2') || []).filter(f => Array.isArray(f?.variants) && f.variants.length)) {
    const v0 = f.variants[0], dest = lang === 'tc' ? f.destination_tc || f.destination || f.destination_en : f.destination_en || f.destination || '';
    out.push({ id: `bus:${v0.route}|${v0.stop_id}`, kind: 'bus', title: `${v0.route} ${lang === 'tc' ? '往' : 'to'} ${dest}`.trim(),
      stop: (lang === 'tc' ? f.name_tc || f.name : f.name_en || f.name) || '',
      variants: f.variants.map(v => ({ operator: v.operator, route: v.route, direction: v.direction, service_type: v.service_type, stop_id: v.stop_id })) });
  }
  for (const key of (read('mtr_eta_v1_prefs')?.favourites || []).filter(k => typeof k === 'string' && k.includes('|'))) {
    const [line, sta] = key.split('|'), L = mtrLines?.[line], st = L?.stations.find(s => s[0] === sta);
    const nm = s => s ? (lang === 'tc' ? s[2] : s[1]) : '';
    out.push({ id: `mtr:${key}`, kind: 'mtr', line, sta, title: L ? (lang === 'tc' ? L.tc : L.en) : line, stop: nm(st) || sta,
      ends: L ? { UP: nm(L.stations[L.stations.length - 1]), DOWN: nm(L.stations[0]) } : { UP: '', DOWN: '' } });
  }
  return out;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function alertFor(f) { return alerts.find(a => a.id === f.id); }

function renderFavs() {
  const list = favourites(), box = $('favList');
  if (!list.length) { box.innerHTML = `<p class="fa-empty">${esc(MSG.noFavs)}</p>`; return; }
  box.innerHTML = list.map(f => {
    const a = alertFor(f), on = !!(a && a.on);
    const times = [3, 5, 8, 10, 15];
    const set = on ? `<div class="fa-set">
      <div class="days">${MSG.days.map((d, i) => `<button type="button" data-day="${i}" class="${a.days.includes(i) ? 'on' : ''}">${esc(d)}</button>`).join('')}</div>
      <div class="fa-row">${esc(MSG.from)} <input type="time" data-k="start" value="${esc(a.start)}"> ${esc(MSG.to)} <input type="time" data-k="end" value="${esc(a.end)}"></div>
      <div class="fa-row">${esc(MSG.when)} <select data-k="lead">${times.map(n => `<option value="${n}" ${n === a.lead ? 'selected' : ''}>${n}</option>`).join('')}</select> ${esc(MSG.minAway)}</div>
      ${f.kind === 'mtr' ? `<div class="fa-row">${esc(MSG.towards)} <select data-k="dir">${['UP', 'DOWN'].map(d => `<option value="${d}" ${a.dir === d ? 'selected' : ''}>${esc(MSG.to2)} ${esc(f.ends[d])}</option>`).join('')}</select></div>` : ''}
    </div>` : '';
    return `<div class="fa" data-id="${esc(f.id)}"><div class="fa-head"><span class="fa-ic ${f.kind}">${f.kind === 'mtr' ? '🚇' : '🚌'}</span><div><strong>${esc(f.title)}</strong><small>${esc(f.stop)}</small></div>
      <label class="switch"><input type="checkbox" data-k="on" ${on ? 'checked' : ''} ${pushOn ? '' : 'disabled'} aria-label="${esc(f.title)}"><span></span></label></div>${set}</div>`;
  }).join('');
  if (!pushOn) $('favMsg').textContent = MSG.needOn;
}

let saveTimer = 0;
// redraw = false for time, lead and direction edits: redrawing replaces the
// inputs, which closes the phone's time picker while it is still open.
function changed(redraw = true) {
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts)); } catch {}
  if (redraw) renderFavs();
  clearTimeout(saveTimer); saveTimer = setTimeout(saveToServer, 500);
}

async function saveToServer() {
  try {
    const reg = await registration(), sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    // Names come from the current favourites, so they follow the chosen language.
    const favs = new Map(favourites().map(f => [f.id, f]));
    const payload = alerts.filter(a => a.on && favs.has(a.id)).map(a => {
      const f = favs.get(a.id);
      return { ...a, kind: f.kind, title: f.title, stop: f.stop, variants: f.variants, line: f.line, sta: f.sta, towards: f.kind === 'mtr' ? f.ends[a.dir || 'UP'] : undefined };
    });
    const r = await fetch('/api/alerts/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), lang, alerts: payload }) });
    $('favMsg').textContent = r.ok ? (payload.length ? MSG.saved : '') : MSG.saveFailed;
  } catch { $('favMsg').textContent = MSG.saveFailed; }
}

// The server copy wins, so alerts set on this phone before a reinstall come back.
async function syncFromServer() {
  try {
    const reg = await registration(), sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const r = await fetch('/api/alerts/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    if (!r.ok) return;
    const server = (await r.json()).alerts || [];
    const ids = new Set(server.map(a => a.id));
    alerts = [...server.map(a => ({ id: a.id, on: true, days: a.days, start: a.start, end: a.end, lead: a.lead, dir: a.dir })), ...alerts.filter(a => !ids.has(a.id)).map(a => ({ ...a, on: false }))];
    try { localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts)); } catch {}
    renderFavs();
  } catch {}
}

$('favList').addEventListener('click', e => {
  const day = e.target.closest('[data-day]'); if (!day) return;
  const a = alerts.find(x => x.id === day.closest('.fa').dataset.id); if (!a) return;
  const d = +day.dataset.day, next = a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d].sort();
  if (!next.length) return; // keep at least one day
  a.days = next; changed();
});
$('favList').addEventListener('change', e => {
  const el = e.target, k = el.dataset.k, id = el.closest('.fa')?.dataset.id; if (!k || !id) return;
  let a = alerts.find(x => x.id === id);
  if (k === 'on') {
    if (!a) { a = { id, on: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '09:00', lead: 5, dir: 'UP' }; alerts.push(a); }
    else a.on = el.checked;
  } else if (a) {
    if ((k === 'start' || k === 'end') && !/^\d{2}:\d{2}$/.test(el.value)) return;
    a[k] = k === 'lead' ? +el.value : el.value;
    return changed(false);
  }
  changed();
});

fetch('../shared/mtr-lines.json').then(r => r.json()).then(j => { mtrLines = j.lines; renderFavs(); }).catch(() => {});
renderFavs();

init();
})();
