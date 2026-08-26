/**
 * EmamiApps hub login — direct email sign-in.
 *
 * The Microsoft sign-in path used to live in this file too (first SAML, then OAuth2/OIDC — see
 * git history), but is now a self-contained module (./saml-sso.js) since an admin can reconfigure
 * it entirely from the "Configure SSO" screen (uploading Entra's Federation Metadata XML) without
 * touching this file. Both paths issue/verify the same session token shape (see ./sessionAuth.js)
 * and are gated by the same emami_apps.authorized_users table (./authorizedUsers.js).
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { isAuthorized } = require('./authorizedUsers');
const { JWT_SECRET, issueSessionToken } = require('./sessionAuth');
const { upsertLoginProfile } = require('./userProfile');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = express.Router();

/**
 * Direct email login — no Microsoft redirect at all. Logs the user straight in if their email
 * exists and is active in Manage Access. This is what "Sign In" on the login screen calls.
 */
router.post('/hub-auth/db-login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
    }
    if (!JWT_SECRET) {
        return res.status(503).json({ success: false, error: 'Sign-in is not configured yet. Please contact IT.' });
    }
    try {
        if (!(await isAuthorized(email))) {
            return res.status(403).json({ success: false, error: 'This email-id is not registered. Contact your admin for access.' });
        }
        await upsertLoginProfile(email, null);
        const token = issueSessionToken(email);
        return res.json({ success: true, email, token });
    } catch (err) {
        console.error('[hub-auth] db-login failed:', err.message);
        return res.status(500).json({ success: false, error: 'Could not sign in. Please try again.' });
    }
});

/**
 * Session check — re-checks live Manage Access status, not just JWT validity, so a deactivation
 * takes effect immediately instead of waiting for the token to expire. Used after both the
 * direct-login path above and the Microsoft SAML path (saml-sso.js's ACS callback).
 */
router.post('/hub-auth/session/verify', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token || !JWT_SECRET) {
        return res.status(400).json({ success: false, error: 'Invalid session.' });
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (!payload?.email || !(await isAuthorized(payload.email))) {
            return res.status(401).json({ success: false, error: 'Invalid session.' });
        }
        return res.json({ success: true, email: payload.email });
    } catch {
        return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
    }
});

module.exports = router;
