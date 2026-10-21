// Cloudflare Worker that lets Tram ETA read HK Tramways' next-tram times.
// HK Tramways' feed doesn't allow other websites to read it (no CORS), so
// this forwards one request at a time and adds the header that allows it.
// It only ever fetches geteat.php for a stop code, and only for your site.
const ALLOWED_ORIGIN = 'https://akimoto0811.github.io';

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    const code = new URL(request.url).searchParams.get('stop_code') || '';
    if (!/^[0-9A-Z]{1,5}$/.test(code)) return new Response('Bad stop code', { status: 400, headers: cors });
    const upstream = await fetch('https://www.hktramways.com/nextTram/geteat.php?stop_code=' + code, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.hktramways.com/' },
      cf: { cacheTtl: 15, cacheEverything: true },
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'max-age=15' },
    });
  },
};
