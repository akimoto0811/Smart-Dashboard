/* Offline support for every dashboard app (scope: the whole site).
   - Pages, scripts, styles and icons open straight from the phone and are
     refreshed in the background (each page's own ?v= check then reloads it
     when a new version is out).
   - Requests that ask for fresh data (cache: 'no-store' / 'no-cache', which
     the apps use for timetables, catalogues and version checks) go to the
     network first and fall back to the saved copy when offline.
   - Live arrival APIs on other sites are never touched. */
const CACHE = 'hk-dashboard-v1';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png',
  './shared/transit.css', './tram-eta/', './tram-eta/tram-data.json', './ferry-eta/', './ferry-eta/ferry-data.json'];

self.addEventListener('install', event => {
  // Islands often have weak signal, so keep the tram and ferry timetables ready.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function save(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const cache = await caches.open(CACHE), url = new URL(request.url);
  // Keep one copy per file: drop older ?v= versions of the same path.
  if (url.search) {
    for (const old of await cache.keys()) {
      const o = new URL(old.url);
      if (o.pathname === url.pathname && o.search !== url.search) cache.delete(old);
    }
  }
  await cache.put(request, response.clone());
  return response;
}

async function saved(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = request.cache === 'no-store' || request.cache === 'no-cache' || request.cache === 'reload';
  if (fresh) {
    event.respondWith(fetch(request).then(r => save(request, r)).catch(async () => (await saved(request)) || Response.error()));
    return;
  }
  // Open instantly from the saved copy, and update it for next time.
  event.respondWith((async () => {
    const cached = await saved(request);
    const network = fetch(request).then(r => save(request, r)).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || Response.error();
  })());
});
