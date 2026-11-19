// Smart Dashboard Worker.
// Every page, script and data file is still served as a static asset, exactly as
// before. Only /api/... reaches this code (see run_worker_first in wrangler.jsonc).
//
// Step 1 of notifications: phones can subscribe to push and ask for a test.
// Saving alert settings and the scheduled (cron) alerts come in the next steps.
import { sendPush, validSubscription } from './webpush.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

    // The phone needs the public key to subscribe.
    if (url.pathname === '/api/push/key' && request.method === 'GET') {
      return json({ configured, publicKey: configured ? env.VAPID_PUBLIC_KEY : null });
    }

    // Sends one test notification to the subscription in the request.
    if (url.pathname === '/api/push/test' && request.method === 'POST') {
      if (!configured) return json({ error: 'not-configured' }, 503);
      if (request.headers.get('Origin') !== url.origin) return json({ error: 'forbidden' }, 403);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad-request' }, 400); }
      const sub = body && body.subscription;
      if (!validSubscription(sub)) return json({ error: 'bad-subscription' }, 400);
      const tc = body.lang === 'tc';
      const result = await sendPush(sub, {
        title: tc ? '🔔 通知已開啟' : '🔔 Notifications are on',
        body: tc ? '測試成功。之後你的路線到站及港鐵車務消息會在這裡顯示。'
          : 'Test worked. Arrival times and MTR service alerts for your lines will show up like this.',
        url: '/alerts/',
        tag: 'test',
      }, env, { ttl: 60 });
      return json(result, result.ok ? 200 : 502);
    }

    return json({ error: 'not-found' }, 404);
  },
};
