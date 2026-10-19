# HK Bus ETA — Dashboard v3.4

Native HTML/CSS/JavaScript Hong Kong bus arrival dashboard for GitHub Pages and Apple Shortcuts. English or Traditional Chinese interface (Settings → Interface language); stop and destination names come from the operators.

Live: https://akimoto0811.github.io/Smart-Dashboard/bus-eta/

## Features

- **Nearby** groups routes by stop around your GPS position, showing each route's destination and next three arrivals, and re-checks every minute while visible. Changing the radius re-filters around your last position instead of asking for GPS again.
- **Routes** searches by route number (exact match first) or stop name, with one entry per route and direction. Opening a route verifies its stops against the official operator lists and merges KMB/Citybus poles of the same joint-route stop.
- **Favourites** shows the next arrival for every saved stop. Favourites persist in this browser, with JSON import/export in Settings.
- Arrival minutes stay live: the open route list, the single-stop view and Favourites refresh every 30 seconds, and ETAs older than 45 seconds are re-requested.
- An empty official ETA is shown as "No ETA predicted"; HTTP/network errors are shown separately, never as zero arrivals.
- Home-screen icon and pinch-to-zoom are supported.

## Files

| Path | Purpose |
|---|---|
| `index.html`, `app.js`, `styles.css` | The app. Bump the `?v=` cache-buster in `index.html` when any of them change. |
| `manifest.webmanifest`, `icons/` | Home-screen name and icons. |
| `catalogue-compact.json` | Route/stop discovery catalogue (schema 4, ~1.5 MB). Built by `make_catalogue.py`. |
| `stop-links.json` | Audited KMB ↔ Citybus stop pairs for joint routes. Generated offline from Transport Department joint-route stop anchors; the generator script is not in this repository, so keep this file as is. |
| `make_catalogue.py` | Rebuilds `catalogue-compact.json`. |
| `build_launcher.py` | Optional Mac Shortcut that opens the dashboard. |

The repo root `index.html` redirects https://akimoto0811.github.io/Smart-Dashboard/ to this app.

## Rebuilding the catalogue

```sh
cd bus-eta
python3 make_catalogue.py                        # download the latest hkbus data and rebuild
python3 make_catalogue.py --from catalogue.json  # or convert an old schema 3 catalogue.json
```

Schema 4 stores each stop ID, stop location and destination once and refers to them by index, so it is about 12× smaller than the old one-row-per-stop `catalogue.json` (20 MB). A fresh download also records each stop's hkbus shared stop ID, which the app uses as extra evidence when merging KMB and Citybus poles; the converted file currently in the repo does not have those IDs yet, so rebuilding from the source adds them.

The app caches the catalogue in IndexedDB and re-downloads it at most every 6 hours. Settings → Import catalogue JSON accepts either schema.

## API data architecture

- Catalogue source: `data.hkbus.app/routeFareList.min.json`. Used for **discovering** route numbers, directions and nearby routes only; it may contain stale route-stop associations.
- Citybus route-stop: `https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/{route}/{inbound|outbound}`
- Citybus stop detail: `https://rt.data.gov.hk/v2/transport/citybus/stop/{stop_id}`
- Citybus ETA: `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/{stop_id}/{route}`
- Citybus stop-level ETA (Nearby): `https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/{stop_id}`
- KMB / Long Win route-stop: `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/{route}/{inbound|outbound}/{service_type}`
- KMB / Long Win stop detail: `https://data.etabus.gov.hk/v1/transport/kmb/stop/{stop_id}`
- KMB / Long Win ETA: `https://data.etabus.gov.hk/v1/transport/kmb/eta/{stop_id}/{route}/{service_type}`
- KMB / Long Win stop-level ETA (Nearby): `https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/{stop_id}`

Live ETAs are operator ISO-8601 timestamps converted to minutes remaining; the dashboard never estimates them.

## Browser storage

- `localStorage`: favourites (`hkbus_favourites_v2`), language, start page, verified route directions (1 day) and stop names (14 days).
- IndexedDB: the catalogue document (`catalogue_v5`).
- Official route-stop lists are cached for one hour, ETAs for 45 seconds. The ↻ button clears these caches.
- Safari favourites are not synchronised with the native `.shortcut`; use export/import to move them.

## Mac Shortcut launcher (optional)

```sh
cd bus-eta
python3 build_launcher.py "https://akimoto0811.github.io/Smart-Dashboard/bus-eta/"
shortcuts sign --mode anyone --input "HK Bus Dashboard.unsigned.shortcut" --output "HK Bus Dashboard.signed.shortcut"
```

Open the signed file to import it into Shortcuts.
