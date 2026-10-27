/* Offline support for every dashboard app (scope: the whole site).
   - Pages, scripts, styles, icons and data files open straight from the phone
     and are refreshed in the background for next time. Each page's own ?v=
     check then reloads it when a new version is out, and that reload waits
     for the network so it lands on the new page.
   - Data files (timetables, catalogues) change at most weekly, so a saved
     copy is used at once instead of downloading megabytes on every open.
   - Live arrival APIs on other sites are never touched. */
const CACHE = 'hk-dashboard-v2';  // keep: renaming throws away every saved page
const PRECACHE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png',
  './shared/transit.css', './tram-eta/', './tram-eta/tram-data.json', './ferry-eta/', './ferry-eta/ferry-data.json'];

self.addEventListener('install', event => {
  // Islands often have weak signal, so keep the tram and ferry timetables ready.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cloudflare answers /index.html with a redirect to /. Safari refuses a page a
// service worker hands back with redirects in it, so pass on a plain copy.
function plain(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function save(request, response) {
  response = plain(response);
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

async function saved(request, anyVersion = true) {
  const cache = await caches.open(CACHE);
  return plain((await cache.match(request)) || (anyVersion ? await cache.match(request, { ignoreSearch: true }) : null));
}

// Waits for the network, but on weak signal (which can hang without failing)
// hands back the saved copy after a few seconds and keeps updating behind.
function networkFirst(request, live, wait) {
  const network = fetch(live).then(r => save(request, r));
  return (async () => {
    const cached = await saved(request);
    if (!cached) return network.catch(() => Response.error());
    network.catch(() => {});
    const slow = new Promise(resolve => setTimeout(() => resolve(cached), wait));
    return Promise.race([network.catch(() => cached), slow]);
  })();
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  const page = request.mode === 'navigate';
  const live = page ? new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }) : request;
  // The ?v= reload after a release, and the version check itself, must see the
  // new page: those wait for the network.
  if ((page && url.searchParams.has('v')) || (!page && /\/$|\.html?$/.test(url.pathname) && request.cache === 'no-store'))
    return event.respondWith(networkFirst(request, live, page ? 2500 : 4000));
  event.respondWith((async () => {
    const exact = await saved(request, false);
    // A file whose ?v= changed (new release) isn't saved yet: fetch it, using
    // an older saved version only if the network fails or hangs.
    if (!exact && url.search && !page) return networkFirst(request, live, 4000);
    const network = fetch(live).then(r => save(request, r));
    const cached = exact || await saved(request);
    if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
    return network.catch(() => Response.error());
  })());
});
