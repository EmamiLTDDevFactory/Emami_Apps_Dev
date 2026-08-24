/**
 * EmamiApps hub login — Microsoft Entra ID via OAuth2/OIDC Authorization Code flow.
 *
 * Runs on this same Lambda (fronted by API Gateway, not a Lambda Function URL — that was blocked
 * by an unresolved AWS-account-level access issue) as the Manage Access API in server.js. Was
 * briefly hosted on the mouldhealthcheck Azure App Service instead, but that turned out to be
 * Basis-owned infrastructure provisioned specifically for Mould's public SAP APIs, not something
 * this team can deploy unrelated login code onto — moved back here, onto infra this team
 * actually controls.
 *
 * Reuses the SAME Entra app registration as mouldhealthcheck's SAP client-credentials flow
 * (CLIENT_ID below, CLIENT_SECRET from env) with a different, delegated scope — a conscious
 * choice already agreed with Infra, not a new app registration.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const crypto = require('crypto');
const { pool } = require('./db');

const TENANT_ID = 'd016aebd-1f96-4dd1-a22b-eeb0201fb61e';
const CLIENT_ID = '6225aa6f-d228-4127-8f88-81b08e2aca69';
const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
const AUTHORIZE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const SCOPE = 'openid profile email offline_access';
const JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || '';
const FRONTEND_REDIRECT_URL = process.env.HUB_AUTH_FRONTEND_URL || 'https://www.emamiapps.in';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!CLIENT_SECRET) {
    console.warn('[hub-auth] CLIENT_SECRET is not set — hub login will fail at the callback step.');
}
if (!JWT_SECRET) {
    console.warn('[hub-auth] HUB_AUTH_JWT_SECRET is not set — hub login will fail at the callback step.');
}

/**
 * The Manage Access table (emami_apps.authorized_users) is the single source of truth for who
 * can log in — not a hardcoded email domain. Used by every login path (Microsoft OAuth callback,
 * direct email login, and session re-verification) so revoking/deactivating someone in Manage
 * Access takes effect everywhere immediately, not just for new logins.
 */
async function isAuthorized(email) {
    const { rows } = await pool.query(
        'SELECT is_active FROM emami_apps.authorized_users WHERE email = $1',
        [email]
    );
    return rows.length > 0 && rows[0].is_active === true;
}

const jwks = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxAge: 12 * 60 * 60 * 1000,
});

/** Fetches Microsoft's current signing key by `kid` — this is what actually proves the ID token came from Microsoft, not just whoever POSTed it. */
function getSigningKey(header, callback) {
    jwks.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        callback(null, key.getPublicKey());
    });
}

function verifyIdToken(idToken) {
    return new Promise((resolve, reject) => {
        jwt.verify(idToken, getSigningKey, {
            algorithms: ['RS256'],
            audience: CLIENT_ID,
            issuer: ISSUER,
        }, (err, decoded) => {
            if (err) return reject(err);
            resolve(decoded);
        });
    });
}

// CSRF/replay guard for the OAuth redirect — single-instance in-memory store is fine here (a
// cold start just means any in-flight login attempt has to restart too).
const states = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;
function issueState() {
    const state = crypto.randomBytes(16).toString('hex');
    states.set(state, Date.now() + STATE_TTL_MS);
    return state;
}
function consumeState(state) {
    const expiry = states.get(state);
    states.delete(state);
    return !!expiry && Date.now() < expiry;
}

/** Built per-request so it always matches whatever host actually served the request (the API Gateway invoke URL), not a hardcoded guess. */
function getRedirectUri(req) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}${req.baseUrl}/hub-auth/callback`;
}

const router = express.Router();

/** Step 1 — redirect the browser to Microsoft to sign in. */
router.get('/hub-auth/login', (req, res) => {
    const state = issueState();
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: getRedirectUri(req),
        response_mode: 'query',
        scope: SCOPE,
        state,
    });
    res.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
});

/** Step 2 — Microsoft redirects back here with a code. Exchange it, verify the ID token's signature, then bounce the browser to the frontend with a session token (or an error code) in the query string. */
router.get('/hub-auth/callback', async (req, res) => {
    const { code, state, error: oauthError } = req.query;
    if (oauthError || !code || !state || !consumeState(String(state))) {
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=invalid_response`);
    }
    if (!JWT_SECRET || !CLIENT_SECRET) {
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=not_configured`);
    }
    try {
        const tokenRes = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: String(code),
                redirect_uri: getRedirectUri(req),
                scope: SCOPE,
            }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData?.id_token) {
            throw new Error(tokenData?.error_description || 'Token response had no id_token');
        }

        const claims = await verifyIdToken(tokenData.id_token);
        const email = String(claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();
        if (!email || !(await isAuthorized(email))) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=domain_not_allowed`);
        }

        const sessionToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '12h' });
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoToken=${encodeURIComponent(sessionToken)}`);
    } catch (err) {
        console.error('[hub-auth] callback failed:', err.message);
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=invalid_response`);
    }
});

/**
 * Direct email login — no Microsoft redirect at all. Logs the user straight in if their email
 * exists and is active in Manage Access. This is what "Continue" on the login screen calls.
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
            return res.status(403).json({ success: false, error: 'This email does not have access. Contact your admin.' });
        }
        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '12h' });
        return res.json({ success: true, email, token });
    } catch (err) {
        console.error('[hub-auth] db-login failed:', err.message);
        return res.status(500).json({ success: false, error: 'Could not sign in. Please try again.' });
    }
});

/** Step 3 (Microsoft path) / session check (direct-login path) — re-checks live Manage Access status, not just JWT validity, so a deactivation takes effect immediately instead of waiting for the token to expire. */
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
