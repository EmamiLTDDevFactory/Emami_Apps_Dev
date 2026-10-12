/**
 * Tiny in-memory, fixed-window rate limiter (no extra dependency). Keyed on req.ip.
 *
 * This backend sits behind nginx, so unless TRUST_PROXY is set (see server.js) req.ip is the
 * proxy's address (usually 127.0.0.1) and every caller shares ONE bucket — which is why the
 * default limit is generous. Same rollout convention as middleware/requireAuth.js:
 *   ENFORCE_AUTH=on   -> over the limit gets 429.
 *   anything else     -> LOG-ONLY: one `[auth-would-reject]` line per window per key, request
 *                        goes through unchanged.
 */
const rateLimit = ({ name, windowMs = 60 * 1000, max = 60 } = {}) => {
    const hits = new Map();

    // Drop expired windows now and then so the map can't grow without bound.
    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (entry.resetAt <= now) {
                hits.delete(key);
            }
        }
    }, windowMs);
    sweep.unref();

    return (req, res, next) => {
        const enforce = String(process.env.ENFORCE_AUTH || "").trim().toLowerCase() === "on";
        const key = req.ip || "unknown";
        const now = Date.now();

        let entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs, logged: false };
            hits.set(key, entry);
        }
        entry.count += 1;

        if (entry.count <= max) {
            return next();
        }

        const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

        if (enforce) {
            console.warn(`[auth-rejected] rate-limit ${name || req.path} ip=${key} count=${entry.count}`);
            res.set("Retry-After", String(retryAfter));
            return res.status(429).json({
                message: "Too many sign-in attempts. Please wait a minute and try again."
            });
        }

        if (!entry.logged) {
            entry.logged = true;
            console.warn(`[auth-would-reject] rate-limit ${name || req.path} ip=${key} max=${max}/${Math.round(windowMs / 1000)}s`);
        }
        return next();
    };
};

module.exports = rateLimit;
