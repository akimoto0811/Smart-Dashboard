# Smart-Dashboard

Hong Kong public transport in one web app: bus, MTR, tram and ferry arrivals, in English or Chinese. It works on any phone browser and can be added to the Home Screen.

**Open it:** https://smart-dashboard.ty-projects.workers.dev/

## What's inside

| App | What it does |
|---|---|
| **Menu** ([`index.html`](index.html)) | Opens each app. Shows the weather, transport near you with the next arrivals, and favourites saved in any app. |
| **Bus** ([`bus-eta/`](bus-eta/)) | KMB, Long Win and Citybus arrivals, route stop lists, fares and favourites. |
| **MTR** ([`mtr-eta/`](mtr-eta/)) | Next trains, nearest station, and a journey planner with route, changes, estimated time and fare. |
| **Tram** ([`tram-eta/`](tram-eta/)) | Routes, stops, journey time and fare (timetable only: HK Tramways doesn't share live times). |
| **Ferry** ([`ferry-eta/`](ferry-eta/)) | Local ferries and kaitos: next sailings, fares, and live times for Sun Ferry and HKKF. |

Each app has a **‹ Dashboard** button back to the menu. The language you pick is shared by all the apps.

## Making changes

- **Bump the version.** When you change an app, change the `?v=` number on its files in that app's `index.html`. Each page compares these numbers with the live site on open and reloads itself when they differ.
- **Publishing.** The site runs on Cloudflare and updates by itself when a change is merged into `main`.
- **Offline.** `sw.js` keeps a copy of every page so the apps open without a connection. Live arrival times are never saved. Change `CACHE` in `sw.js` only to throw every saved copy away.

## Where the data comes from

Data files are built by GitHub Actions. Some run on their own, and you can run any of them from the Actions tab.

| Data | Built by | When |
|---|---|---|
| Bus routes and stops (`bus-eta/catalogue-compact.json`, official route lists and fares) | **Rebuild bus catalogue** | Every Monday |
| Tram and ferry timetables and fares (`tram-eta/tram-data.json`, `ferry-eta/ferry-data.json`) | **Build tram and ferry data** (`tools/make_tram_ferry.py`) | Every Monday |
| MTR station positions (`mtr-eta/station-coords.json`) | **Build MTR station positions** | Run by hand if stations change |
| Area names for the weather (`shared/hk-places.json`) | **Build Hong Kong area names** (`tools/make_places.py`) | Run by hand |

Sources: Transport Department open data on data.gov.hk, the bus and ferry operators' live APIs, MTR open data, the Hong Kong Observatory, OpenStreetMap and the 1823 public holiday list.

## Good to know

- `shared/mtr-lines.json` is a copy of the MTR lines in `mtr-eta/app.js`. Update both if lines or stations change.
- MTR journey times are estimates: the distance between stations, plus about 4 minutes per change.
- The tram and ferry apps share their look from `shared/transit.css`.
- `tools/tram-proxy/` is no longer used, because HK Tramways stopped sharing live times.
- More detail on the bus app: [`bus-eta/README.md`](bus-eta/README.md).
