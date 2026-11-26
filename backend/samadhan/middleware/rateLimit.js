'use strict';

/*
   Per-person request limits for Samadhan, on top of the API Gateway throttling in front of the backend.
   A sliding one-minute window per signed-in person and bucket:
     read    normal screens                       300 / min
     write   creating / changing / replying         60 / min
     heavy   reports, ticket export, analytics,     10 / min
             list upload, checks
     ai      new AI analysis (ticket / dashboard)   20 / min
   Over the limit -> 429 with Retry-After. Kept in memory per backend copy (bounded in size), so it protects
   each copy from a runaway script or a stuck browser tab without any extra infrastructure.
*/

const WINDOW_MS = 60_000;
const LIMITS = { read: 300, write: 60, heavy: 10, ai: 20 };
const MAX_KEYS = 20_000;
const hits = new Map(); // key -> array of timestamps

function bucketFor(req) {
    const path = req.path.replace(/\/+$/, ''); // "/tickets/export/" reaches the same route
    if (/^\/(reports\/daily|tickets\/export$|analytics|admin\/distributors\/import|jobs\/run|admin\/migration\/[a-z]+\/import)/.test(path)) return 'heavy';
    if (/\/insights/.test(path) && (req.query.generate === '1' || req.query.refresh === '1')) return 'ai';
    return req.method === 'GET' ? 'read' : 'write';
}

function rateLimit(req, res, next) {
    // The signed-in person (set by requireAccess). Never the IP address: everyone behind the office network shares
    // one. The scheduler route, which runs before sign-in, uses one shared key.
    const who = req.verifiedEmail || 'scheduler';
    const bucket = bucketFor(req);
    const key = `${bucket}:${who}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= LIMITS[bucket]) {
        const retry = Math.max(1, Math.ceil((WINDOW_MS - (now - list[0])) / 1000));
        res.set('Retry-After', String(retry));
        return res.status(429).json({ success: false, error: `Too many requests. Please wait ${retry} seconds and try again.` });
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > MAX_KEYS) {
        for (const [k, v] of hits) {
            if (!v.length || now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
        }
        if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value);
    }
    next();
}

module.exports = { rateLimit, LIMITS };
