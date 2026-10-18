# HK Bus ETA — dark iPhone dashboard

This is a working *HTML/JavaScript dashboard implementation*, inspired by the supplied dashboard screenshot. It is **not a native Shortcuts dashboard view**, and does not modify the existing financial dashboard pictured in the screenshot.

## Files

- `index.html`, `styles.css`, `app.js` — mobile-first dashboard with Overview, Favourites, Nearby, Routes, Settings.
- `make_catalogue.py` — Python standard-library script to produce **geolocated** `catalogue.json` with operator-native stop IDs. It downloads public metadata from hkbus/hk-bus-crawling (data.hkbus.app / GitHub fallback).
- `build_launcher.py` — generates a native two-action **unsigned** `.shortcut` to open the HTTPS-hosted dashboard. Sign on Mac with Apple Shortcuts.
- `manifest.webmanifest` — basic Safari "Add to Home Screen" metadata.

## Try the design immediately

Open `index.html` in a desktop browser. The app starts in **DEMO PREVIEW** mode and shows sample arrivals. These are fictional values and are always labelled as sample data. Preview requires no account, API or hosting.

## Enable live arrivals and Nearby on iPhone

1. On a Mac with Python 3, run `python3 make_catalogue.py`. This downloads public stop metadata and generates `catalogue.json`. **An Internet connection is required on the Mac.** Metadata changes require rebuilding this file; ETA calls are live.
2. Publish the **contents** of this folder (`index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `catalogue.json`) using **HTTPS** static hosting, such as your own GitHub Pages repository. Enable Pages for the main branch/root folder. The site URL will look like `https://USERNAME.github.io/REPOSITORY/`.
3. Open the public HTTPS URL in Safari on your iPhone, choose **Go live**, then grant **Location** permission when using Nearby. Safari's "Add to Home Screen" can pin it like an app.
4. **Apple Shortcut launcher**: On your Mac, run `python3 build_launcher.py 'https://USERNAME.github.io/REPOSITORY/'`, then run the `shortcuts sign --mode anyone` command printed by the script. Import the signed `HK Bus Dashboard.signed.shortcut` in Mac Shortcuts and sync it to iPhone. Its two native actions are URL → Open URLs; the dashboard itself runs in Safari.

### Without hosting

You can inspect the sample dashboard in a desktop browser. Some iPhone local-file viewers disable JavaScript, GPS or API access; **do not expect live Nearby to work from Files > Quick Look or a `data:` URL**. Hosting via HTTPS is the supported interactive configuration.

### Data notes and limitations

- ETA endpoints: KMB/LWB `https://data.etabus.gov.hk/v1/transport/kmb/eta/{stop_id}/{route}/{service_type}`; Citybus V2 `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/{stop_id}/{route}`.
- Browser-to-operator API requests **can be rejected by cross-origin (CORS) policy**. We could not confirm the operators' CORS settings here; if blocked, use a correctly configured server-side relay, or perform requests in native Apple Shortcuts and render a static dashboard. The app **does not fake ETA values on failed live requests**.
- Favourites in the dashboard use local browser storage. To use favourites from the earlier native Shortcut, open **Settings → Import favourites.json**, choose that file from iCloud Drive/Shortcuts/HK Bus ETA. Use **Export favourites** to transfer them back manually.
- An existing v1 `catalogue.json` generated for the earlier native Shortcut can be imported through Settings. However, it contains approximate 0.01-degree grid cells, not exact stop coordinates: Nearby is approximate with that file. The new catalogue script produces exact metadata coordinates.
- Route matching relies on operator-provided metadata; different directions and service types must be checked independently. Predicted ETAs are not guarantees.
- Geolocation occurs in Safari; the GPS coordinates are used inside the browser to find stops locally. The ETA request sends the selected route and stop ID to its operator.
- The Mac-generated Shortcut is an **unverified native workflow** until signed/imported/tested on macOS/iOS. The HTML UI receives local browser smoke testing, but end-to-end ETA/GPS operation requires your device and live network.

## Browser demo test

On macOS, you can optionally preview with:

```sh
python3 -m http.server 8020
```

Then visit `http://localhost:8020/` in your Mac browser. `localhost` also supports development geolocation in most browsers, but it will not make live HK ETAs reachable if operator CORS blocks them.
