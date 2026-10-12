/**
 * Log-only (never blocks, never changes the request): when the caller has a verified session
 * (req.user from middleware/requireAuth.js) and the request names an acting user that differs
 * from it, log `[auth-would-reject] actor-mismatch`.
 *
 * `fields` lists where the actor is carried, as "body.<name>" or "query.<name>":
 *   - plain spec       -> compared with req.user.email, and only when the value is email-shaped
 *                         (e.g. a numeric user id can't be checked against the token).
 *   - spec + ":role"   -> compared with req.user.role (e.g. the evidence upload's `uploadedBy`,
 *                         which carries a role name like "Depot", not a person).
 * Body fields that name a RECIPIENT (e.g. a notification's userId) must not be listed here.
 */
const actorCheck = (route, fields) => (req, res, next) => {
    if (!req.user) {
        return next();
    }

    for (const spec of fields) {
        const [location, kind] = spec.split(":");
        const [source, name] = location.split(".");
        const container = source === "query" ? req.query : req.body;
        const raw = container && typeof container === "object" ? container[name] : undefined;

        if (typeof raw !== "string" || !raw.trim()) {
            continue;
        }

        const value = raw.trim().toLowerCase();
        const expected = String((kind === "role" ? req.user.role : req.user.email) || "").trim().toLowerCase();

        if (!expected || (kind !== "role" && !value.includes("@"))) {
            continue;
        }

        if (value !== expected) {
            console.warn(
                `[auth-would-reject] actor-mismatch ${req.method} ${route} field=${location} claimed=${raw.trim()} user=${req.user.email} role=${req.user.role}`
            );
        }
    }

    return next();
};

module.exports = actorCheck;
