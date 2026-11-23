/* Remove a favourite from a list: swipe the row left to show a Remove button,
   or keep swiping all the way to remove it at once. After a removal, a bar at
   the bottom offers Undo for a few seconds.

     SwipeRemove.attach(listElement, rowSelector, row => { ...remove it... })
     SwipeRemove.undo(message, () => { ...put it back... })

   Only rows being swiped are wrapped (and unwrapped when they close), so the
   list's own layout and styles are left alone the rest of the time. */
(() => {
'use strict';
const tc = () => { try { return JSON.parse(localStorage.getItem('dashboard_lang')) === 'tc'; } catch { return false; } };
const words = () => tc() ? { remove: '移除', removed: '已移除', undo: '復原' } : { remove: 'Remove', removed: 'Removed', undo: 'Undo' };
const OPEN = 92;    // width of the Remove button
const START = 8;    // movement before deciding between swiping and scrolling

const style = document.createElement('style');
style.textContent = `
.sw{position:relative;overflow:hidden}
.sw>.sw-del{position:absolute;top:0;right:0;bottom:0;width:${OPEN}px;border:0;margin:0;background:#e5484d;color:#fff;font:inherit;font-size:14px;font-weight:750;padding:0 0 0 10px;display:flex;align-items:center;justify-content:center}
.sw>.sw-front{position:relative;z-index:1;touch-action:pan-y}
.sw.sw-anim>.sw-front{transition:transform .22s ease}
.sw-toast{position:fixed;z-index:200;left:50%;bottom:calc(env(safe-area-inset-bottom) + 84px);transform:translateX(-50%);display:flex;align-items:center;gap:14px;
 background:#1c2a42;color:#f0f4fc;border:1px solid #33415e;border-radius:14px;padding:10px 12px 10px 16px;font:600 14px -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif;
 box-shadow:0 10px 30px rgba(0,0,0,.45);max-width:calc(100vw - 32px);animation:sw-in .2s ease}
.sw-toast span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sw-toast button{border:0;background:none;color:#6cdea4;font:inherit;font-weight:800;padding:4px 6px;flex-shrink:0}
@keyframes sw-in{from{opacity:0;transform:translate(-50%,10px)}}`;
document.head.append(style);

const saved = new WeakMap();   // row -> its style attribute before wrapping

function opaqueBackground(el) {
  for (; el && el !== document.documentElement; el = el.parentElement) {
    const c = getComputedStyle(el).backgroundColor;
    if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
  }
  return getComputedStyle(document.body).backgroundColor || '#0b1120';
}

function wrap(row) {
  if (row.parentElement && row.parentElement.classList.contains('sw')) return row.parentElement;
  const cs = getComputedStyle(row);
  const keep = { margin: cs.margin, radius: cs.borderRadius,
    borders: ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'].map(k => [k, cs[k]]),
    bg: cs.backgroundColor };
  saved.set(row, row.getAttribute('style'));
  const w = document.createElement('div');
  w.className = 'sw';
  w.style.margin = keep.margin;
  w.style.borderRadius = keep.radius;
  row.before(w);
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'sw-del';
  del.textContent = words().remove;
  w.append(del, row);
  row.classList.add('sw-front');
  row.style.margin = '0';
  // Keep its borders (some lists draw dividers with :last-child rules) and make
  // sure the red button can't show through a see-through row.
  for (const [k, v] of keep.borders) row.style[k] = v;
  if (!keep.bg || keep.bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(keep.bg)) row.style.backgroundColor = opaqueBackground(w.parentElement);
  return w;
}

function unwrap(w) {
  const row = w.querySelector('.sw-front');
  if (!row || !w.isConnected) return;
  w.before(row);
  w.remove();
  row.classList.remove('sw-front');
  const s = saved.get(row);
  if (s == null) row.removeAttribute('style'); else row.setAttribute('style', s);
}

function attach(root, selector, onRemove) {
  if (!root || root.dataset.swipe) return;
  root.dataset.swipe = '1';
  // Let the browser keep vertical scrolling while sideways moves come to us.
  style.textContent += `\n${selector}{touch-action:pan-y}`;
  let drag = null, open = null, swallowClick = false;

  const close = item => {
    if (!item) return;
    item.w.classList.add('sw-anim');
    item.row.style.transform = 'translateX(0)';
    setTimeout(() => { if (open !== item) unwrap(item.w); }, 240);
    if (open === item) open = null;
  };
  const remove = (w, row) => {
    w.classList.add('sw-anim');
    row.style.transform = 'translateX(-110%)';
    if (open && open.w === w) open = null;
    setTimeout(() => onRemove(row), 200);
  };

  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.sw-del')) return;
    const row = e.target.closest(selector);
    if (open && (!row || open.row !== row)) return;   // the click handler closes it
    if (!row || !root.contains(row)) return;
    drag = { row, id: e.pointerId, x: e.clientX, y: e.clientY, mode: null, at: 0, base: open && open.row === row ? -OPEN : 0 };
  });

  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.mode) {
      if (Math.abs(dx) < START && Math.abs(dy) < START) return;
      drag.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'swipe' : 'scroll';
      if (drag.mode === 'swipe') {
        drag.w = wrap(drag.row);
        drag.w.classList.remove('sw-anim');
        try { drag.row.setPointerCapture(e.pointerId); } catch {}
      }
    }
    if (drag.mode !== 'swipe') return;
    e.preventDefault();
    const x = drag.base + dx;
    drag.at = x > 0 ? x / 4 : x;                       // a little give to the right
    drag.row.style.transform = `translateX(${drag.at}px)`;
  });

  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.mode !== 'swipe') return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 400);
    const width = d.row.offsetWidth || 300;
    d.w.classList.add('sw-anim');
    if (e.type !== 'pointercancel' && -d.at > width * 0.6) return remove(d.w, d.row);
    if (e.type !== 'pointercancel' && -d.at > OPEN / 2) {
      d.row.style.transform = `translateX(-${OPEN}px)`;
      open = { row: d.row, w: d.w };
    } else close({ row: d.row, w: d.w });
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  // Runs before the list's own click handlers: a swipe isn't a tap, the Remove
  // button removes, and any other tap while a row is open just closes it.
  root.addEventListener('click', e => {
    const del = e.target.closest('.sw-del');
    if (del && root.contains(del)) {
      e.preventDefault(); e.stopPropagation();
      const w = del.parentElement;
      return remove(w, w.querySelector('.sw-front'));
    }
    if (swallowClick || open) {
      e.preventDefault(); e.stopPropagation();
      swallowClick = false;
      if (open) close(open);
    }
  }, true);

  // Tapping anywhere else on the page closes an open row too.
  document.addEventListener('pointerdown', e => {
    if (open && !open.w.contains(e.target)) close(open);
  }, true);
}

let toast = null, timer = 0;
function undo(message, onUndo) {
  if (toast) toast.remove();
  clearTimeout(timer);
  const w = words();
  toast = document.createElement('div');
  toast.className = 'sw-toast';
  toast.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message ? `${w.removed}: ${message}` : w.removed;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = w.undo;
  const mine = toast;
  btn.onclick = () => { clearTimeout(timer); mine.remove(); if (toast === mine) toast = null; onUndo(); };
  toast.append(text, btn);
  document.body.append(toast);
  timer = setTimeout(() => { mine.remove(); if (toast === mine) toast = null; }, 5000);
}

window.SwipeRemove = { attach, undo, words };
})();
