# Smart-Dashboard

| App | What it is | Live |
|---|---|---|
| [`index.html`](index.html) | Home menu: choose Bus ETA or MTR ETA | https://akimoto0811.github.io/Smart-Dashboard/ |
| [`bus-eta/`](bus-eta/) | Hong Kong bus arrival dashboard (KMB, Long Win, Citybus) for iPhone Safari and the home screen | https://akimoto0811.github.io/Smart-Dashboard/bus-eta/ |
| [`mtr-eta/`](mtr-eta/) | MTR next-train dashboard with fares and accessibility | https://akimoto0811.github.io/Smart-Dashboard/mtr-eta/ |

The site root is a menu that opens either dashboard; each app has a "‹ Dashboard" link back to it. See [`bus-eta/README.md`](bus-eta/README.md) for deployment and data details.

Diagnostics & data in Settings (and the MTR data snapshot and API coverage notes) only show in admin mode: open any page once with `?admin=1` on that device (`?admin=0` turns it off). In the Home Screen app, which has no address bar, tap the version line at the bottom of Bus ETA Settings 7 times to switch admin mode on or off. This just tidies the page for other people; the data itself is public.
