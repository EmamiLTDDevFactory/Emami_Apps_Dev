const jwt = require("jsonwebtoken");

/**
 * Verifies the app's own session JWT (issued by controllers/authController.js after the hub
 * token exchange) sent as `Authorization: Bearer <token>`, and sets req.user = { email, role }.
 *
 * Rolled out in two steps so a missed caller can't take production down:
 *   ENFORCE_AUTH=on   -> missing/invalid token is rejected with 401.
 *   anything else     -> LOG-ONLY: logs one `[auth-would-reject]` line and lets the request
 *                        through unchanged. Watch the logs for these before switching to "on".
 * req.user is set whenever the token is valid, in either mode.
 */
const requireAuth = (req, res, next) => {
    const enforce = String(process.env.ENFORCE_AUTH || "").trim().toLowerCase() === "on";

    const reject = (reason) => {
        if (enforce) {
            return res.status(401).json({
                message: "Your session has expired. Please reload the page from Emami Apps."
            });
        }

        console.warn(`[auth-would-reject] ${req.method} ${req.originalUrl.split("?")[0]} ${reason}`);
        return next();
    };

    const header = req.headers.authorization || "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const token = match ? match[1].trim() : "";

    if (!token) {
        return reject("missing-token");
    }

    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET is not set — cannot verify Audit & CAPA sessions.");
        return reject("no-jwt-secret");
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (error) {
        return reject(error.name === "TokenExpiredError" ? "expired-token" : "invalid-token");
    }

    if (!payload || !payload.email) {
        return reject("invalid-token");
    }

    req.user = {
        email: payload.email,
        role: payload.role
    };

    return next();
};

module.exports = requireAuth;
