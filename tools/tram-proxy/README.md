# Live tram times (optional)

Tram ETA can show the next trams at your stop once this small proxy is running.
It's free on Cloudflare's Workers plan (100,000 requests a day).

1. Sign up at https://dash.cloudflare.com (free), then open **Workers & Pages** → **Create** → **Create Worker**.
2. Name it, for example `hk-tram`, and click **Deploy**.
3. Click **Edit code**, replace everything with the contents of `worker.js` in this folder, and click **Deploy** again.
4. Copy the worker's address, which looks like `https://hk-tram.<your-name>.workers.dev`.
5. In `tram-eta/app.js`, set `TRAM_PROXY` near the top to that address, bump `?v=` in `tram-eta/index.html`, and upload both files.

If the proxy is missing or HK Tramways stops answering, Tram ETA keeps working as before without live times.
