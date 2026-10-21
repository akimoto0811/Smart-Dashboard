# Smart-Dashboard

| App | What it is | Live |
|---|---|---|
| [`index.html`](index.html) | Home menu: choose Bus, MTR, Tram or Ferry ETA | https://akimoto0811.github.io/Smart-Dashboard/ |
| [`bus-eta/`](bus-eta/) | Hong Kong bus arrival dashboard (KMB, Long Win, Citybus) for iPhone Safari and the home screen | https://akimoto0811.github.io/Smart-Dashboard/bus-eta/ |
| [`mtr-eta/`](mtr-eta/) | MTR next trains, Locate me, journey planner (line then station; route, changes, estimated time, fare) with station info and accessibility | https://akimoto0811.github.io/Smart-Dashboard/mtr-eta/ |
| [`tram-eta/`](tram-eta/) | Hong Kong Tramways: Locate me, stop-to-stop journey (routes, stops, journey time, fare) and route stop lists | https://akimoto0811.github.io/Smart-Dashboard/tram-eta/ |
| [`ferry-eta/`](ferry-eta/) | Domestic ferries and kaitos (no cross-boundary): next sailings from the timetable, live "on the water" for Sun Ferry and HKKF routes, fares, favourites | https://akimoto0811.github.io/Smart-Dashboard/ferry-eta/ |

The site root is a menu that opens each dashboard; each app has a "‹ Dashboard" link back to it. See [`bus-eta/README.md`](bus-eta/README.md) for deployment and data details.

Each page checks itself on open and when you return to it: if the `?v=` cache-busters in the live `index.html` differ from the ones loaded, it reloads the new version. So always bump `?v=` when changing an app (on the menu page, bump `manifest.webmanifest?v=`).

MTR station positions (`mtr-eta/station-coords.json`, used by Locate me and journey times) come from OpenStreetMap. The **Build MTR station positions** GitHub Action rebuilds them; run it from the Actions tab if stations change. Journey times are estimates from the distance between stations, plus about 4 minutes per change.

Tram and ferry data (`tram-eta/tram-data.json`, `ferry-eta/ferry-data.json`) are built by `tools/make_tram_ferry.py` from the Transport Department's open data (routes and fares, licensed ferry timetables and fare tables), The Star Ferry's open data and the 1823 public holiday list. The **Build tram and ferry data** GitHub Action rebuilds them every Monday. HK Tramways' live arrival feed can't be read by other websites, so the tram app has no live times. Both apps share `shared/transit.css`.
