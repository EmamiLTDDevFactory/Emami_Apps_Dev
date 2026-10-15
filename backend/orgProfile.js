/**
 * The signed-in person's organisation details from Microsoft Entra ID (Graph), for the hub's My Profile page:
 *
 *   GET /me/org-profile   (Authorization: Bearer <Emami Apps session token>)
 *   -> { success, configured, found, org: { id, displayName, jobTitle, department, businessPhones, mobilePhone,
 *          managers: [{ level: 1|2, displayName, jobTitle, department, mail }] } }   (L1 = manager, L2 = manager's manager)
 *
 * The email comes only from the verified session token, never from the request, so a person can read only their own
 * record. Graph is called server-side with an app registration's client credentials (application permission
 * User.Read.All, admin-consented) - the secret never reaches the browser:
 *
 *   GET https://graph.microsoft.com/v1.0/users?$filter=mail eq '<email>' or userPrincipalName eq '<email>'
 *       &$select=id,displayName,jobTitle,department,businessPhones,mobilePhone
 *
 * Also a people search for pickers such as the Change Control Board's "Raised by" and "Module Lead" fields. It
 * searches only the Emami Apps user base — ACTIVE people in the Admin Center (emami_apps.authorized_users) — with
 * names, titles and departments filled in from Entra ID where the directory has them (most people in the Admin
 * Center have never signed in, so the hub itself has no name for them). Any signed-in Emami Apps user; max 10:
 *
 *   GET /me/directory-search?q=<name or email>  -> { success, configured, people: [{ name, email, jobTitle, department }] }
 *   (Graph: GET /users?$filter=mail in ('a','b',…)&$select=mail,userPrincipalName,displayName,jobTitle,department,
 *    7 emails per call, cached — the User.Read.All permission already granted.)
 *
 * Env: GRAPH_TENANT_ID (defaults to Emami's tenant, the one in azure-idp-metadata.xml), GRAPH_CLIENT_ID,
 * GRAPH_CLIENT_SECRET. Without the client id/secret the route answers configured:false and the page hides the card.
 */
const express = require('express');
const { pool } = require('./db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./sessionAuth');

const TENANT_ID = process.env.GRAPH_TENANT_ID || '0b5a98ee-ffb0-4615-b6c7-17efc911d396';
const CLIENT_ID = process.env.GRAPH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET || '';
const SELECT = 'id,displayName,jobTitle,department,businessPhones,mobilePhone';
const MANAGER_SELECT = 'id,displayName,jobTitle,department,mail';
const MANAGER_LEVELS = 2;
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

/** The person's manager (GET /users/{id}/manager); null when the directory has none (Graph answers 404). */
async function managerOf(id) {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(id)}/manager?$select=${MANAGER_SELECT}`, {
        headers: { Authorization: `Bearer ${await graphToken()}` },
    });
    if (res.status === 404) return null;
    const m = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Graph manager ${res.status} ${m?.error?.code || ''}`.trim());
    return m?.id ? { id: m.id, displayName: m.displayName || null, jobTitle: m.jobTitle || null, department: m.department || null, mail: m.mail || null } : null;
}

/** L1 = manager, L2 = manager's manager. A failed manager lookup leaves the chain short instead of failing the profile. */
async function managerChain(id) {
    const chain = [];
    let current = id;
    for (let level = 1; level <= MANAGER_LEVELS && current; level++) {
        let m = null;
        try {
            m = await managerOf(current);
        } catch (err) {
            console.error('[org-profile] manager lookup failed:', err.message);
        }
        if (!m) break;
        chain.push({ level, displayName: m.displayName, jobTitle: m.jobTitle, department: m.department, mail: m.mail });
        current = m.id;
    }
    return chain;
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
            managers: u.id ? await managerChain(u.id) : [],
          }
        : null;
    cache.set(email, { at: Date.now(), org });
    return org;
}

const BASE_TTL_MS = 5 * 60 * 1000;
let userBase = { at: 0, people: [], loading: null };

/** Active Admin Center users, each with the best name we have (Entra ID, else the hub, else the email). */
async function loadUserBase() {
    const { rows } = await pool.query(`
        SELECT lower(a.email) AS email, u.name
          FROM emami_apps.authorized_users a
          LEFT JOIN emami_apps.users u ON lower(u.email) = lower(a.email)
         WHERE a.is_active = true`);
    const ad = new Map();
    if (configured()) {
        const emails = rows.map((r) => r.email).filter((e) => EMAIL_RE.test(e));
        // 7 emails per call: "mail in (…) or userPrincipalName in (…)" counts each email twice against Graph's 15-term limit.
        for (let i = 0; i < emails.length; i += 7) {
            const chunk = emails.slice(i, i + 7).map((e) => `'${e.replace(/'/g, "''")}'`).join(',');
            const params = new URLSearchParams({ $filter: `mail in (${chunk}) or userPrincipalName in (${chunk})`, $select: 'mail,userPrincipalName,displayName,jobTitle,department' });
            try {
                const res = await fetch(`https://graph.microsoft.com/v1.0/users?${params}`, { headers: { Authorization: `Bearer ${await graphToken()}` } });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(`Graph ${res.status} ${data?.error?.code || ''}`.trim());
                for (const u of data.value || []) {
                    for (const key of [u.mail, u.userPrincipalName]) if (key) ad.set(String(key).toLowerCase(), u);
                }
            } catch (err) {
                console.error('[org-profile] User base enrichment failed:', err.message);
            }
        }
    }
    const fromEmail = (e) => e.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    return rows.map((r) => {
        const u = ad.get(r.email);
        return { name: u?.displayName || r.name || fromEmail(r.email), email: r.email, jobTitle: u?.jobTitle || null, department: u?.department || null };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

async function getUserBase() {
    if (Date.now() - userBase.at < BASE_TTL_MS) return userBase.people;
    if (!userBase.loading) {
        userBase.loading = loadUserBase()
            .then((people) => { userBase = { at: Date.now(), people, loading: null }; return people; })
            .catch((err) => { userBase.loading = null; throw err; });
    }
    return userBase.loading;
}

/** Matches every word of the query against the name or the email. */
async function searchDirectory(q) {
    const words = q.split(/\s+/).filter(Boolean);
    return (await getUserBase())
        .filter((p) => { const hay = `${p.name} ${p.email}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
        .slice(0, 10);
}

/** The verified email from an Emami Apps session token, or '' (magic-link tokens carry a `purpose` and are refused). */
function sessionEmail(req) {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    try {
        const payload = match && JWT_SECRET ? jwt.verify(match[1].trim(), JWT_SECRET, { algorithms: ['HS256'] }) : null;
        return payload && !payload.purpose ? String(payload.email || '').trim().toLowerCase() : '';
    } catch {
        return '';
    }
}

const router = express.Router();

router.get('/me/directory-search', async (req, res) => {
    if (!sessionEmail(req)) return res.status(401).json({ success: false, error: 'Sign in to Emami Apps first.' });
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
    if (q.length < 2) return res.json({ success: true, configured: true, people: [] });
    try {
        res.json({ success: true, configured: true, people: await searchDirectory(q) });
    } catch (err) {
        console.error('[org-profile] User search failed:', err.message);
        res.status(502).json({ success: false, configured: true, error: 'Could not search Emami Apps users right now.' });
    }
});

router.get('/me/org-profile', async (req, res) => {
    const email = sessionEmail(req);
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
