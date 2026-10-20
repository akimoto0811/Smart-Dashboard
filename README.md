# Smart-Dashboard

| App | What it is | Live |
|---|---|---|
| [`index.html`](index.html) | Home menu: choose Bus ETA or MTR ETA | https://akimoto0811.github.io/Smart-Dashboard/ |
| [`bus-eta/`](bus-eta/) | Hong Kong bus arrival dashboard (KMB, Long Win, Citybus) for iPhone Safari and the home screen | https://akimoto0811.github.io/Smart-Dashboard/bus-eta/ |
| [`mtr-eta/`](mtr-eta/) | MTR next trains, Locate me, journey planner (line then station; route, changes, estimated time, fare) with station info and accessibility | https://akimoto0811.github.io/Smart-Dashboard/mtr-eta/ |

The site root is a menu that opens either dashboard; each app has a "‹ Dashboard" link back to it. See [`bus-eta/README.md`](bus-eta/README.md) for deployment and data details.

Each page checks itself on open and when you return to it: if the `?v=` cache-busters in the live `index.html` differ from the ones loaded, it reloads the new version. So always bump `?v=` when changing an app (on the menu page, bump `manifest.webmanifest?v=`).

MTR station positions (`mtr-eta/station-coords.json`, used by Locate me and journey times) come from OpenStreetMap. The **Build MTR station positions** GitHub Action rebuilds them; run it from the Actions tab if stations change. Journey times are estimates from the distance between stations, plus about 4 minutes per change.
