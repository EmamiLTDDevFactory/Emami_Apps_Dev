/*
   Protection and transport for the Publicity Expenses API. Lives in this app's router only: the shared server.js (and
   every other app on it) is not changed. In memory, per process (PM2 runs one instance of the hub backend).

   - securityHeaders: every answer (also 401 / 403 / 404 / 429) says no sniffing, no framing, no caching, no referrer,
     and drops X-Powered-By.
   - ipLimit: before the session check, per client IP (the address nginx forwards), a high flood ceiling.
   - userLimit: after the session check, per user, sliding windows (all requests / reads that skip the cache / drill-downs /
     changes) -> 429 with Retry-After. inFlight: at most N requests of one user at the same time.
   - sapSlot: at most SAP_MAX SAP reads at once for the whole app; others queue (a full queue -> 503), so a burst of users
     cannot flood the SAP gateway. Identical reads are shared already (the cache keeps the promise).
   - sendJson: JSON answers over 1 KB go out compressed (brotli or gzip, as the browser accepts): nginx here compresses
     HTML only, and a summary is ~0.8 MB of JSON.
   Limits can be tuned with env PUBEXP_RATE_* (see LIMITS) without a code change.
*/
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

const num = (name, dflt) => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : dflt; };
const LIMITS = {
    ip: () => num('PUBEXP_RATE_IP_PER_MIN', 3000), // one office behind one NAT address shares this
    all: () => num('PUBEXP_RATE_USER_PER_MIN', 300),
    refresh: () => num('PUBEXP_RATE_REFRESH_PER_5MIN', 30),
    detail: () => num('PUBEXP_RATE_DETAIL_PER_MIN', 90),
    change: () => num('PUBEXP_RATE_CHANGE_PER_MIN', 60),
    inFlight: () => num('PUBEXP_RATE_IN_FLIGHT', 8),
    sap: () => num('PUBEXP_SAP_MAX_PARALLEL', 6),
    sapQueue: () => num('PUBEXP_SAP_MAX_QUEUE', 200),
};

function securityHeaders(req, res, next) {
    res.removeHeader('X-Powered-By');
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
    });
    next();
}

const LOOPBACK = /^(::1|127\.|::ffff:127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::ffff:(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/;
/** Client address: behind the local nginx, the last X-Forwarded-For entry (the one nginx added; earlier ones can be forged). */
function clientIp(req) {
    const remote = req.socket?.remoteAddress || '';
    const xff = String(req.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
    return LOOPBACK.test(remote) && xff.length ? xff[xff.length - 1] : remote;
}

/** Sliding-window counter: hit(key) -> 0 when allowed, else the seconds to wait. Old keys are swept every window. */
function windowCounter(windowMs, max) {
    const hits = new Map();
    const sweep = setInterval(() => {
        const edge = Date.now() - windowMs;
        for (const [k, list] of hits) { while (list.length && list[0] <= edge) list.shift(); if (!list.length) hits.delete(k); }
    }, windowMs);
    sweep.unref();
    return {
        hit(key) {
            const now = Date.now();
            const list = hits.get(key) || [];
            while (list.length && list[0] <= now - windowMs) list.shift();
            const m = max();
            if (list.length >= m) return Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000));
            list.push(now);
            hits.set(key, list);
            return 0;
        },
        reset() { hits.clear(); },
    };
}

const tooMany = (res, wait, what) => res.status(429).set('Retry-After', String(wait))
    .json({ success: false, error: `Too many ${what} in a short time - please wait ${wait} s and try again.` });

const counters = [];
function limiter(windowMs, max, what, when, keyOf) {
    const c = windowCounter(windowMs, max);
    counters.push(c);
    return (req, res, next) => {
        if (when && !when(req)) return next();
        const wait = c.hit(keyOf(req));
        return wait ? tooMany(res, wait, what) : next();
    };
}

const isRefresh = (req) => String(req.query?.refresh ?? req.body?.refresh ?? '') === '1';
const isDetail = (req) => req.path === '/detail';
const isChange = (req) => req.method !== 'GET' && !isDetail(req) && !req.path.endsWith('/preview');

const ipLimit = limiter(60_000, LIMITS.ip, 'requests from your network', null, clientIp);
const userLimits = [
    limiter(60_000, LIMITS.all, 'requests', null, (req) => req.email),
    limiter(5 * 60_000, LIMITS.refresh, 'fresh reads from SAP (Refresh)', isRefresh, (req) => req.email),
    limiter(60_000, LIMITS.detail, 'drill-downs', isDetail, (req) => req.email),
    limiter(60_000, LIMITS.change, 'changes', isChange, (req) => req.email),
];

const active = new Map();
function inFlight(req, res, next) {
    const k = req.email;
    const n = active.get(k) || 0;
    if (n >= LIMITS.inFlight()) return tooMany(res, 2, 'requests at the same time');
    active.set(k, n + 1);
    let done = false;
    const end = () => {
        if (done) return;
        done = true;
        const v = (active.get(k) || 1) - 1;
        if (v <= 0) active.delete(k); else active.set(k, v);
    };
    res.on('finish', end);
    res.on('close', end);
    next();
}

class Busy extends Error { constructor() { super('SAP is busy with other requests - please try again in a minute.'); this.status = 503; } }
let sapActive = 0;
const sapWaiting = [];
/** Run one SAP read in a slot; a finished read hands its slot straight to the next in the queue. */
async function sapSlot(fn) {
    if (sapActive < LIMITS.sap()) sapActive++;
    else {
        if (sapWaiting.length >= LIMITS.sapQueue()) throw new Busy();
        await new Promise((resolve) => sapWaiting.push(resolve));
    }
    try { return await fn(); } finally {
        const next = sapWaiting.shift();
        if (next) next(); else sapActive--;
    }
}
const sapStats = () => ({ active: sapActive, waiting: sapWaiting.length, max: LIMITS.sap() });

/** JSON answer, compressed when it is worth it and the browser accepts it. */
async function sendJson(req, res, status, body) {
    const text = JSON.stringify(body);
    res.status(status).set('Content-Type', 'application/json; charset=utf-8');
    res.vary('Accept-Encoding');
    const accept = String(req.get('accept-encoding') || '').toLowerCase();
    if (text.length >= 1024) {
        try {
            if (/\bbr\b/.test(accept)) {
                const buf = await brotli(Buffer.from(text), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: text.length } });
                return res.set('Content-Encoding', 'br').send(buf);
            }
            if (/\bgzip\b/.test(accept)) return res.set('Content-Encoding', 'gzip').send(await gzip(text, { level: 6 }));
        } catch { /* send it plain */ }
    }
    return res.send(text);
}

/** Tests: forget the counters. */
function resetLimits() { counters.forEach((c) => c.reset()); active.clear(); }

module.exports = { securityHeaders, ipLimit, userLimits, inFlight, sapSlot, sapStats, sendJson, clientIp, resetLimits, Busy, LIMITS };
