const jwt = require("jsonwebtoken");

const { findUserByEmail } = require("../models/userModel");

/**
 * Audit & CAPA has no login form of its own — a user is already authenticated by signing in to
 * the Emami Apps hub, which persists its own session JWT (see hub's src/context/AuthContext.tsx)
 * in localStorage. Since this app is served same-origin under /apps/audit-capa, the frontend reads
 * that same token and sends it here as `hubToken`. This verifies it was really issued by the hub
 * (HUB_AUTH_JWT_SECRET must match the value the hub's own backend signs with — see
 * backend/sessionAuth.js at the repo root), then looks the email up in audit_capa.users to decide
 * whether this person has access and what role/depot they have here.
 */
const login = async (req, res) => {
    try {
        const hubToken =
            req.body?.hubToken ||
            (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();

        if (!hubToken) {
            return res.status(401).json({
                message: "No Emami Apps session found. Please sign in to Emami Apps first."
            });
        }

        if (!process.env.HUB_AUTH_JWT_SECRET) {
            console.error("HUB_AUTH_JWT_SECRET is not set — cannot verify hub sessions.");
            return res.status(503).json({
                message: "Sign-in is not configured yet. Please contact IT."
            });
        }

        let hubPayload;
        try {
            hubPayload = jwt.verify(hubToken, process.env.HUB_AUTH_JWT_SECRET);
        } catch (error) {
            return res.status(401).json({
                message: "Your Emami Apps session has expired. Please sign in to Emami Apps again."
            });
        }

        const email = String(hubPayload?.email || "").trim().toLowerCase();

        if (!email) {
            return res.status(401).json({
                message: "Invalid Emami Apps session."
            });
        }

        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(403).json({
                message: "You don't have access to Audit & CAPA. Contact your admin."
            });
        }

        const token = jwt.sign(
            {
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || "8h"
            }
        );

        return res.json({
            message: "Login successful.",
            token,
            user: {
                id: user.id,
                email: user.email,
                // Kept alongside `email` so existing frontend code reading `currentUser.userId`
                // (e.g. Sidebar.js) keeps working unchanged — it's the same value either way now.
                userId: user.email,
                name: user.name,
                role: user.role,
                depot: user.depot
            }
        });

    } catch (error) {
        console.error("SSO login error:", error);

        return res.status(500).json({
            message: "Internal server error."
        });
    }
};

module.exports = {
    login
};
