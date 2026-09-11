const { upsertUserFromHub, deactivateUserByEmail } = require("../models/userModel");

/**
 * Called only by the Emami Apps hub's own backend (see repo root backend/auditCapaSync.js) right
 * after an admin grants/changes a CQA or Depot role in Manage Access — this is what replaces the
 * old "an admin runs sql/seed-users.js by hand" step, and what makes a freshly-granted role take
 * effect the next time this person's browser talks to /auth/login (see routes/auth.js), instead of
 * requiring someone to run that script.
 */
const VALID_ROLES = ["CQA", "Depot"];

const grantAccess = async (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        const role = req.body?.role;
        const depot = req.body?.depot || null;
        const name = String(req.body?.name || "").trim();

        if (!email || !name || !VALID_ROLES.includes(role)) {
            return res.status(400).json({
                message: `email, name, and role (one of ${VALID_ROLES.join(", ")}) are required.`
            });
        }

        const user = await upsertUserFromHub(email, name, role, depot);

        return res.json({ message: "Access synced.", user });
    } catch (error) {
        console.error("Internal grantAccess error:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

const revokeAccess = async (req, res) => {
    try {
        const email = String(req.params?.email || "").trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ message: "email is required." });
        }

        await deactivateUserByEmail(email);

        return res.json({ message: "Access revoked." });
    } catch (error) {
        console.error("Internal revokeAccess error:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

module.exports = {
    grantAccess,
    revokeAccess
};
