'use strict';
/* The dashboard moved from GitHub Pages to Cloudflare. Loaded first (not
   deferred) on every page.
   - On the old address: open the same page at the new one, carrying this
     phone's favourites and settings in the link (each address keeps its own).
   - On the new address: save what was carried, unless this phone already has
     its own value, then tidy the link before the app reads it.
   Only favourites and settings travel, and only on the first jump: cached
   bus data in the link made it too long for Safari to open. */
(() => {
  const NEW = 'https://smart-dashboard.akimoto0811-apple.workers.dev', OLD = 'akimoto0811.github.io', BASE = '/Smart-Dashboard';
  const KEY = 'dashboard_move', DONE = 'dashboard_moved';
  const CARRY = ['dashboard_lang', 'hkbus_favourites_v2', 'hkbus_lang', 'hkbus_start_page', 'mtr_eta_v1_prefs', 'tram_prefs', 'ferry_prefs'];
  if (location.hostname === OLD) {
    const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) || '/' : location.pathname;
    let carry = '';
    try {
      if (!localStorage.getItem(DONE)) {
        const saved = {};
        for (const k of CARRY) { const v = localStorage.getItem(k); if (v != null) saved[k] = v; }
        const text = encodeURIComponent(JSON.stringify(saved));
        if (Object.keys(saved).length && text.length < 20000) carry = KEY + '=' + text;
        localStorage.setItem(DONE, '1');
      }
    } catch {}
    const hash = [location.hash.slice(1), carry].filter(Boolean).join('&');
    location.replace(NEW + path + location.search + (hash ? '#' + hash : ''));
    return;
  }
  const parts = location.hash.slice(1).split('&'), mine = parts.find(p => p.startsWith(KEY + '='));
  if (!mine) return;
  try {
    const saved = JSON.parse(decodeURIComponent(mine.slice(KEY.length + 1)));
    for (const k in saved) if (localStorage.getItem(k) === null) localStorage.setItem(k, saved[k]);
  } catch {}
  const rest = parts.filter(p => p !== mine).join('&');
  history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : ''));
})();
