/**
 * Mass-assignment guard for update routes. `fields` is every field the frontend actually sends to
 * that route today (see the route files for where each list comes from). Same rollout convention
 * as middleware/requireAuth.js:
 *   ENFORCE_AUTH=on   -> unknown body fields are dropped before the controller sees them.
 *   anything else     -> LOG-ONLY: one `[auth-would-reject] mass-assignment` line per unknown
 *                        field; the body is passed on untouched.
 */
const allowFields = (route, fields) => {
    const allowed = new Set(fields);

    return (req, res, next) => {
        const body = req.body;

        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return next();
        }

        const enforce = String(process.env.ENFORCE_AUTH || "").trim().toLowerCase() === "on";

        for (const field of Object.keys(body)) {
            if (allowed.has(field)) {
                continue;
            }

            console.warn(
                `[auth-would-reject] mass-assignment field=${field} route=${req.method} ${route} user=${req.user?.email || "-"}`
            );

            if (enforce) {
                delete body[field];
            }
        }

        return next();
    };
};

module.exports = allowFields;
