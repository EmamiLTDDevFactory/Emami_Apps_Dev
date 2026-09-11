const express = require("express");

const { grantAccess, revokeAccess } = require("../controllers/internalController");

const router = express.Router();

/**
 * Not reachable by any real end user — only the Emami Apps hub's own backend calls these (see
 * repo root backend/auditCapaSync.js), authenticated with a dedicated AUDIT_CAPA_SYNC_SECRET set
 * identically on both sides. Deliberately its own secret rather than reusing HUB_AUTH_JWT_SECRET:
 * on the real deployment, the hub backend's own copy of HUB_AUTH_JWT_SECRET (the PM2 process on
 * 172.17.2.21 that calls this) turned out to already be out of sync with this backend's copy —
 * real end-user logins are verified against a value that comes from a separate Lambda deployment
 * instead, per that .env's own comments — so this endpoint can't assume the two ever match.
 * Checked as a plain shared-secret header rather than a signed JWT since there's no per-request
 * claim to carry beyond "this really is the hub" — same trust model already used between this
 * backend and the hub for other server-to-server calls (see the hub's backend/authorizedUsers.js).
 */
function requireInternalSecret(req, res, next) {
    const expected = process.env.AUDIT_CAPA_SYNC_SECRET;
    const provided = req.headers["x-internal-secret"];

    if (!expected) {
        console.error("AUDIT_CAPA_SYNC_SECRET is not set — cannot verify internal hub requests.");
        return res.status(503).json({ message: "Internal sync is not configured yet." });
    }
    if (!provided || provided !== expected) {
        return res.status(401).json({ message: "Not authorized." });
    }
    next();
}

router.use(requireInternalSecret);
router.post("/access", grantAccess);
router.delete("/access/:email", revokeAccess);

module.exports = router;
