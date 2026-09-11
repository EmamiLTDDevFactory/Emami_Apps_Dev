const express = require("express");

const { grantAccess, revokeAccess } = require("../controllers/internalController");

const router = express.Router();

/**
 * Not reachable by any real end user — only the Emami Apps hub's own backend calls these (see
 * repo root backend/auditCapaSync.js), authenticated with the same HUB_AUTH_JWT_SECRET both
 * backends already share for verifying hub session tokens (see controllers/authController.js).
 * Checked as a plain shared-secret header rather than a signed JWT since there's no per-request
 * claim to carry beyond "this really is the hub" — same trust model already used between this
 * backend and the hub for other server-to-server calls (see the hub's backend/authorizedUsers.js).
 */
function requireInternalSecret(req, res, next) {
    const expected = process.env.HUB_AUTH_JWT_SECRET;
    const provided = req.headers["x-internal-secret"];

    if (!expected) {
        console.error("HUB_AUTH_JWT_SECRET is not set — cannot verify internal hub requests.");
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
