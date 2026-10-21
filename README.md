# Smart-Dashboard

| App | What it is | Live |
|---|---|---|
| [`index.html`](index.html) | Home menu: Bus, MTR, Tram and Ferry tiles, plus Nearby (closest bus stop, MTR station, tram stop and pier with next arrivals) and Favourites saved in any app | https://akimoto0811.github.io/Smart-Dashboard/ |
| [`bus-eta/`](bus-eta/) | Hong Kong bus arrival dashboard (KMB, Long Win, Citybus) for iPhone Safari and the home screen | https://akimoto0811.github.io/Smart-Dashboard/bus-eta/ |
| [`mtr-eta/`](mtr-eta/) | MTR next trains, Locate me, journey planner (line then station; route, changes, estimated time, fare) with station info and accessibility | https://akimoto0811.github.io/Smart-Dashboard/mtr-eta/ |
| [`tram-eta/`](tram-eta/) | Hong Kong Tramways: Locate me, stop-to-stop journey (routes, stops, journey time, fare) and route stop lists | https://akimoto0811.github.io/Smart-Dashboard/tram-eta/ |
| [`ferry-eta/`](ferry-eta/) | Domestic ferries and kaitos (no cross-boundary): next sailings from the timetable, live "on the water" for Sun Ferry and HKKF routes, fares, favourites | https://akimoto0811.github.io/Smart-Dashboard/ferry-eta/ |

The site root is a menu that opens each dashboard; each app has a "‹ Dashboard" link back to it. See [`bus-eta/README.md`](bus-eta/README.md) for deployment and data details.

Each page checks itself on open and when you return to it: if the `?v=` cache-busters in the live `index.html` differ from the ones loaded, it reloads the new version. So always bump `?v=` when changing an app (on the menu page, bump `manifest.webmanifest?v=`).

MTR station positions (`mtr-eta/station-coords.json`, used by Locate me and journey times) come from OpenStreetMap. The **Build MTR station positions** GitHub Action rebuilds them; run it from the Actions tab if stations change. Journey times are estimates from the distance between stations, plus about 4 minutes per change.

Tram and ferry data (`tram-eta/tram-data.json`, `ferry-eta/ferry-data.json`) are built by `tools/make_tram_ferry.py` from the Transport Department's open data (routes and fares, licensed ferry timetables and fare tables), The Star Ferry's open data and the 1823 public holiday list. The **Build tram and ferry data** GitHub Action rebuilds them every Monday. HK Tramways' live arrival feed can't be read by other websites directly. `tools/tram-proxy/` has a small Cloudflare Worker that passes it through; once it is deployed and its address is set as `TRAM_PROXY` in `tram-eta/app.js`, the tram app shows the next trams at your stop. Until then it shows timetable information only. Both apps share `shared/transit.css`.

`sw.js` is a service worker for the whole site. Pages and data open from the phone straight away and refresh in the background, data the apps fetch fresh falls back to the saved copy when offline, and live arrival APIs are never cached. Change `CACHE` in `sw.js` only if you need to throw every saved copy away.

The menu's Nearby and Favourites read `shared/mtr-lines.json` (MTR lines and stations, copied from `mtr-eta/app.js`; update it if MTR lines or stations change), the MTR station positions, the bus catalogue (reused from the Bus app's saved copy when there is one) and the tram and ferry data. Tapping an MTR or ferry row opens that app on the same station or route. The Home Screen icon is in `icons/`.
