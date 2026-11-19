var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/webpush.js
var enc = new TextEncoder();
function b64urlToBytes(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
__name(b64urlToBytes, "b64urlToBytes");
function bytesToB64url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(bytesToB64url, "bytesToB64url");
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}
__name(concat, "concat");
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
__name(hmac, "hmac");
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}
__name(hkdf, "hkdf");
async function vapidHeader(endpoint, env) {
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: env.VAPID_PRIVATE_KEY
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = bytesToB64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1e3) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "https://smart-dashboard.ty-projects.workers.dev/"
  })));
  const unsigned = head + "." + body;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${bytesToB64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}
__name(vapidHeader, "vapidHeader");
async function encrypt(subscription, payload) {
  const uaPublic = b64urlToBytes(subscription.keys.p256dh);
  const authSecret = b64urlToBytes(subscription.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}
__name(encrypt, "encrypt");
var PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/
];
function validSubscription(sub) {
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname)) && b64urlToBytes(sub.keys.p256dh).length === 65 && b64urlToBytes(sub.keys.auth).length === 16;
  } catch {
    return false;
  }
}
__name(validSubscription, "validSubscription");
async function sendPush(subscription, message2, env, { ttl = 300 } = {}) {
  const body = await encrypt(subscription, JSON.stringify(message2));
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, env),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "high"
    },
    body
  });
  return { status: res.status, ok: res.ok, gone: res.status === 404 || res.status === 410 };
}
__name(sendPush, "sendPush");

// worker/alerts.js
import { DurableObject } from "cloudflare:workers";
var MAX_ALERTS = 10;
var MAX_PHONES = 300;
var HK_OFFSET = 8 * 60;
function hkClock(now = Date.now()) {
  const d = new Date(now + HK_OFFSET * 6e4);
  return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
__name(hkClock, "hkClock");
var toMin = /* @__PURE__ */ __name((s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}, "toMin");
var clean = /* @__PURE__ */ __name((s, n = 80) => String(s ?? "").slice(0, n), "clean");
function cleanAlert(a) {
  if (!a || typeof a !== "object") return null;
  const days = [...new Set((Array.isArray(a.days) ? a.days : []).map(Number).filter((d) => d >= 0 && d <= 6))];
  const start = toMin(a.start), end = toMin(a.end), lead = Math.min(30, Math.max(1, Number(a.lead) || 5));
  if (!days.length || start === null || end === null) return null;
  const base = { id: clean(a.id, 120), on: a.on !== false, days, start: clean(a.start, 5), end: clean(a.end, 5), lead, title: clean(a.title, 90), stop: clean(a.stop, 90) };
  if (!base.id) return null;
  if (a.kind === "bus") {
    const variants = (Array.isArray(a.variants) ? a.variants : []).slice(0, 3).map((v) => ({
      operator: v?.operator === "CTB" ? "CTB" : "KMB",
      route: clean(v?.route, 6).toUpperCase(),
      direction: v?.direction === "I" ? "I" : "O",
      service_type: clean(v?.service_type || "1", 3),
      stop_id: clean(v?.stop_id, 40)
    })).filter((v) => /^[A-Z0-9]{1,6}$/.test(v.route) && /^[A-Za-z0-9]{1,40}$/.test(v.stop_id));
    return variants.length ? { ...base, kind: "bus", variants } : null;
  }
  if (a.kind === "mtr") {
    const line = clean(a.line, 4).toUpperCase(), sta = clean(a.sta, 4).toUpperCase();
    if (!/^[A-Z]{2,4}$/.test(line) || !/^[A-Z]{3}$/.test(sta)) return null;
    return { ...base, kind: "mtr", line, sta, dir: a.dir === "DOWN" ? "DOWN" : "UP", towards: clean(a.towards, 60) };
  }
  return null;
}
__name(cleanAlert, "cleanAlert");
function activeNow(a, clock) {
  const s = toMin(a.start), e = toMin(a.end);
  if (!a.on || s === null || e === null) return false;
  if (s <= e) return a.days.includes(clock.day) && clock.min >= s && clock.min <= e;
  return a.days.includes(clock.day) && clock.min >= s || a.days.includes((clock.day + 6) % 7) && clock.min <= e;
}
__name(activeNow, "activeNow");
async function getJSON(url, cache) {
  if (!cache.has(url)) cache.set(url, fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.ok ? r.json() : null).catch(() => null));
  return cache.get(url);
}
__name(getJSON, "getJSON");
async function arrivals(a, cache) {
  const now = Date.now();
  if (a.kind === "bus") {
    const lists = await Promise.all(a.variants.map(async (v) => {
      const url = v.operator === "CTB" ? `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${encodeURIComponent(v.stop_id)}/${encodeURIComponent(v.route)}` : `https://data.etabus.gov.hk/v1/transport/kmb/eta/${encodeURIComponent(v.stop_id)}/${encodeURIComponent(v.route)}/${encodeURIComponent(v.service_type || "1")}`;
      const j2 = await getJSON(url, cache);
      return (j2?.data || []).filter((x) => String(x.route).trim() === v.route && (!x.dir || x.dir === v.direction) && x.eta).map((x) => Date.parse(x.eta)).filter((t) => Number.isFinite(t) && t > now - 3e4);
    }));
    return lists.flat().sort((x, y) => x - y);
  }
  const j = await getJSON(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${a.line}&sta=${a.sta}`, cache);
  const trains = j?.data?.[`${a.line}-${a.sta}`]?.[a.dir] || [];
  return trains.map((x) => now + Number(x.ttnt) * 6e4).filter(Number.isFinite).sort((x, y) => x - y);
}
__name(arrivals, "arrivals");
function message(a, mins, lang) {
  const tc = lang === "tc";
  const when = mins <= 0 ? tc ? "\u5373\u5C07\u5230\u9054" : "arriving now" : tc ? `${mins} \u5206\u9418\u5F8C\u5230\u9054` : `in ${mins} min`;
  const body = a.kind === "mtr" ? `${a.stop}${a.towards ? tc ? ` \xB7 \u5F80${a.towards}` : ` \xB7 to ${a.towards}` : ""}` : a.stop;
  return {
    title: `${a.kind === "mtr" ? "\u{1F687}" : "\u{1F68C}"} ${a.title} ${when}`,
    body,
    url: a.kind === "mtr" ? `/mtr-eta/` : `/bus-eta/#fav=${encodeURIComponent(a.variants[0].route + "|" + a.variants[0].stop_id)}`,
    tag: "alert-" + a.id
  };
}
__name(message, "message");
var AlertStore = class extends DurableObject {
  static {
    __name(this, "AlertStore");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS phones (endpoint TEXT PRIMARY KEY, sub TEXT NOT NULL, lang TEXT, alerts TEXT NOT NULL, sent TEXT NOT NULL DEFAULT '{}', updated INTEGER)`);
  }
  // Replaces this phone's alerts. An empty list removes the phone.
  save(sub, lang, alerts) {
    if (!alerts.length) {
      this.sql.exec("DELETE FROM phones WHERE endpoint = ?", sub.endpoint);
      return { ok: true, count: 0 };
    }
    const exists = this.sql.exec("SELECT 1 FROM phones WHERE endpoint = ?", sub.endpoint).toArray().length;
    if (!exists && this.sql.exec("SELECT COUNT(*) AS n FROM phones").one().n >= MAX_PHONES) return { ok: false, error: "full" };
    this.sql.exec(
      `INSERT INTO phones (endpoint, sub, lang, alerts, updated) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET sub = excluded.sub, lang = excluded.lang, alerts = excluded.alerts, updated = excluded.updated`,
      sub.endpoint,
      JSON.stringify(sub),
      lang,
      JSON.stringify(alerts.slice(0, MAX_ALERTS)),
      Date.now()
    );
    return { ok: true, count: Math.min(alerts.length, MAX_ALERTS) };
  }
  list(endpoint) {
    const row = this.sql.exec("SELECT alerts FROM phones WHERE endpoint = ?", endpoint).toArray()[0];
    return row ? JSON.parse(row.alerts) : [];
  }
  // Runs every minute from the cron trigger.
  async tick() {
    const clock = hkClock(), cache = /* @__PURE__ */ new Map(), now = Date.now();
    let pushed = 0;
    for (const row of this.sql.exec("SELECT endpoint, sub, lang, alerts, sent FROM phones").toArray()) {
      const alerts = JSON.parse(row.alerts).filter((a) => activeNow(a, clock));
      if (!alerts.length) continue;
      const sent = JSON.parse(row.sent || "{}");
      let changed = false, gone = false;
      for (const a of alerts) {
        const next = (await arrivals(a, cache))[0];
        if (!next) continue;
        const mins = Math.max(0, Math.round((next - now) / 6e4));
        if (mins > a.lead) continue;
        const last = sent[a.id];
        if (last && Math.abs(last - next) < 12e4) continue;
        const result = await sendPush(JSON.parse(row.sub), message(a, mins, row.lang), this.env, { ttl: 120 });
        if (result.gone) {
          gone = true;
          break;
        }
        if (result.ok) {
          sent[a.id] = next;
          changed = true;
          pushed++;
        }
      }
      if (gone) this.sql.exec("DELETE FROM phones WHERE endpoint = ?", row.endpoint);
      else if (changed) this.sql.exec("UPDATE phones SET sent = ? WHERE endpoint = ?", JSON.stringify(sent), row.endpoint);
    }
    return { pushed };
  }
};
function store(env) {
  return env.ALERTS.get(env.ALERTS.idFromName("all"));
}
__name(store, "store");

// worker/index.js
var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
}), "json");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (url.pathname === "/api/push/key" && request.method === "GET") {
      return json({ configured, publicKey: configured ? env.VAPID_PUBLIC_KEY : null });
    }
    if (url.pathname === "/api/push/test" && request.method === "POST") {
      if (!configured) return json({ error: "not-configured" }, 503);
      if (request.headers.get("Origin") !== url.origin) return json({ error: "forbidden" }, 403);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad-request" }, 400);
      }
      const sub = body && body.subscription;
      if (!validSubscription(sub)) return json({ error: "bad-subscription" }, 400);
      const tc = body.lang === "tc";
      const result = await sendPush(sub, {
        title: tc ? "\u{1F514} \u901A\u77E5\u5DF2\u958B\u555F" : "\u{1F514} Notifications are on",
        body: tc ? "\u6E2C\u8A66\u6210\u529F\u3002\u4E4B\u5F8C\u4F60\u7684\u8DEF\u7DDA\u5230\u7AD9\u53CA\u6E2F\u9435\u8ECA\u52D9\u6D88\u606F\u6703\u5728\u9019\u88E1\u986F\u793A\u3002" : "Test worked. Arrival times and MTR service alerts for your lines will show up like this.",
        url: "/alerts/",
        tag: "test"
      }, env, { ttl: 60 });
      return json(result, result.ok ? 200 : 502);
    }
    if ((url.pathname === "/api/alerts/save" || url.pathname === "/api/alerts/list") && request.method === "POST") {
      if (!configured) return json({ error: "not-configured" }, 503);
      if (request.headers.get("Origin") !== url.origin) return json({ error: "forbidden" }, 403);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad-request" }, 400);
      }
      const sub = body && body.subscription;
      if (!validSubscription(sub)) return json({ error: "bad-subscription" }, 400);
      if (url.pathname === "/api/alerts/list") return json({ alerts: await store(env).list(sub.endpoint) });
      const alerts = (Array.isArray(body.alerts) ? body.alerts : []).map(cleanAlert).filter(Boolean);
      const result = await store(env).save({ endpoint: sub.endpoint, keys: sub.keys }, body.lang === "tc" ? "tc" : "en", alerts);
      return json(result, result.ok ? 200 : 429);
    }
    return json({ error: "not-found" }, 404);
  },
  // Every minute: send favourite alerts whose time window is now.
  async scheduled(event, env, ctx) {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
    ctx.waitUntil(store(env).tick());
  }
};

// ../../../tmp/claude-0/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../tmp/claude-0/wr/node_modules/wrangler/templates/middleware/middleware-scheduled.ts
var scheduled = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled") {
    const cron = url.searchParams.get("cron") ?? "";
    await middlewareCtx.dispatch("scheduled", { cron });
    return new Response("Ran scheduled event");
  }
  const resp = await middlewareCtx.next(request, env);
  if (request.headers.get("referer")?.endsWith("/__scheduled") && url.pathname === "/favicon.ico" && resp.status === 500) {
    return new Response(null, { status: 404 });
  }
  return resp;
}, "scheduled");
var middleware_scheduled_default = scheduled;

// ../../../tmp/claude-0/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-tmWmd7/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_scheduled_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../tmp/claude-0/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-tmWmd7/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  AlertStore,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
