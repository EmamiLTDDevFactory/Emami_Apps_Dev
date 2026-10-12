/**
 * The signed-in person's organisation details from Microsoft Entra ID (Graph), for the hub's My Profile page:
 *
 *   GET /me/org-profile   (Authorization: Bearer <Emami Apps session token>)
 *   -> { success, configured, found, org: { id, displayName, jobTitle, department, businessPhones, mobilePhone } }
 *
 * The email comes only from the verified session token, never from the request, so a person can read only their own
 * record. Graph is called server-side with an app registration's client credentials (application permission
 * User.Read.All, admin-consented) - the secret never reaches the browser:
 *
 *   GET https://graph.microsoft.com/v1.0/users?$filter=mail eq '<email>' or userPrincipalName eq '<email>'
 *       &$select=id,displayName,jobTitle,department,businessPhones,mobilePhone
 *
 * Env: GRAPH_TENANT_ID (defaults to Emami's tenant, the one in azure-idp-metadata.xml), GRAPH_CLIENT_ID,
 * GRAPH_CLIENT_SECRET. Without the client id/secret the route answers configured:false and the page hides the card.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./sessionAuth');

const TENANT_ID = process.env.GRAPH_TENANT_ID || '0b5a98ee-ffb0-4615-b6c7-17efc911d396';
const CLIENT_ID = process.env.GRAPH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET || '';
const SELECT = 'id,displayName,jobTitle,department,businessPhones,mobilePhone';
const PROFILE_TTL_MS = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;

const configured = () => Boolean(CLIENT_ID && CLIENT_SECRET);

let token = { value: '', expiresAt: 0 };
async function graphToken() {
    if (token.value && Date.now() < token.expiresAt - 60_000) return token.value;
    const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(`token request failed (${res.status} ${data.error || ''})`.trim());
    token = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    return token.value;
}

const cache = new Map(); // email -> { at, org|null }
async function lookup(email) {
    const hit = cache.get(email);
    if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.org;
    const filter = `mail eq '${email}' or userPrincipalName eq '${email}'`;
    const url = `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=${SELECT}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await graphToken()}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Graph ${res.status} ${data?.error?.code || ''}`.trim());
    const u = Array.isArray(data.value) ? data.value[0] : null;
    const org = u
        ? {
              id: u.id || null,
              displayName: u.displayName || null,
              jobTitle: u.jobTitle || null,
              department: u.department || null,
              businessPhones: Array.isArray(u.businessPhones) ? u.businessPhones.filter(Boolean) : [],
              mobilePhone: u.mobilePhone || null,
          }
        : null;
    cache.set(email, { at: Date.now(), org });
    return org;
}

const router = express.Router();

router.get('/me/org-profile', async (req, res) => {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    let email = '';
    try {
        email = match && JWT_SECRET ? String(jwt.verify(match[1].trim(), JWT_SECRET)?.email || '').trim().toLowerCase() : '';
    } catch {
        email = '';
    }
    if (!email) return res.status(401).json({ success: false, error: 'Sign in to Emami Apps first.' });
    if (!configured()) return res.json({ success: true, configured: false, found: false, org: null });
    if (!EMAIL_RE.test(email)) return res.json({ success: true, configured: true, found: false, org: null });
    try {
        const org = await lookup(email);
        res.json({ success: true, configured: true, found: Boolean(org), org });
    } catch (err) {
        console.error('[org-profile] Microsoft Graph lookup failed for', email, ':', err.message);
        res.status(502).json({ success: false, configured: true, error: 'Could not read your details from Microsoft right now.' });
    }
});

module.exports = router;
