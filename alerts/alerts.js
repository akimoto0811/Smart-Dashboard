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
    soonTitle: '即將推出', soonDesc: '揀選常用路線及車站、設定到站提示時間，以及在上下班時段接收港鐵車務消息。',
    keysTitle: '設定（只限管理員）', keysDesc: '伺服器尚未設定通知金鑰。請在此產生一對金鑰，然後在 Cloudflare 開啟 Workers & Pages → smart-dashboard → Settings → Variables and Secrets，以相同名稱加入為 Secret。請勿公開私密金鑰。',
    genBtn: '產生金鑰',
  },
};
const MSG = {
  en: { checking: 'Checking…', unsupported: 'This browser can\'t receive notifications.', needInstall: 'Open from the Home Screen icon to turn on.',
    off: 'Off', on: 'On for this phone', denied: 'Blocked. Turn on in Settings → Notifications → HK Dashboard.',
    notReady: 'Not available yet: the server isn\'t set up.', working: 'Working…', sent: 'Sent. It should arrive in a few seconds.',
    failed: 'Couldn\'t send. Try turning notifications off and on again.', netErr: 'No connection. Try again.', copied: 'Keys generated. Copy each one into Cloudflare.' },
  tc: { checking: '檢查中…', unsupported: '此瀏覽器不能接收通知。', needInstall: '請由主畫面圖示開啟後再開啟通知。',
    off: '未開啟', on: '此手機已開啟', denied: '已被封鎖。請到「設定」→「通知」→ HK Dashboard 開啟。',
    notReady: '暫未可用：伺服器尚未設定。', working: '處理中…', sent: '已發送，幾秒內會收到。',
    failed: '未能發送。請嘗試關閉再開啟通知。', netErr: '未能連線，請再試。', copied: '已產生金鑰，請逐一複製到 Cloudflare。' },
}[lang];

for (const [id, value] of Object.entries(TEXT[lang])) if ($(id)) $(id).textContent = value;

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const SUB_KEY = 'dashboard_push_subscription';

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

init();
})();
