/**
 * Post-authentication gate for both login paths (Microsoft SAML in saml-sso.js, direct email in
 * hub-auth.js) and session re-verification. An email is authorized only if it exists in
 * emami_apps.authorized_users (Manage Access) AND is marked active. Microsoft still has to
 * actually authenticate the user first (saml-sso.js verifies the signed SAML response before this
 * is ever called) — this only governs the post-authentication allow-list.
 *
 * MANAGE_ACCESS_API_URL (unset by default): when this runs somewhere with no route to Postgres
 * (the hub-auth Lambda — see scripts/deploy-lambdas.js's VPC comment), set this to a
 * Postgres-reachable deployment of this same backend (e.g. https://audit-capa-api.emamiapps.in/api)
 * and the check is made there instead, over HTTPS, via server.js's own /access/authorized/:email
 * route. Left unset (the default, and what the Postgres-reachable deployment itself should use),
 * this queries Postgres directly as before.
 */
const { pool } = require('./db');

const MANAGE_ACCESS_API_URL = process.env.MANAGE_ACCESS_API_URL || '';

async function isAuthorized(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (MANAGE_ACCESS_API_URL) {
        try {
            const res = await fetch(`${MANAGE_ACCESS_API_URL}/access/authorized/${encodeURIComponent(normalized)}`);
            const data = await res.json().catch(() => ({}));
            return !!(res.ok && data?.success && data.authorized);
        } catch (err) {
            console.error('[authorizedUsers] Remote lookup failed:', err.message);
            return false;
        }
    }
    try {
        const { rows } = await pool.query(
            'SELECT is_active FROM emami_apps.authorized_users WHERE email = $1',
            [normalized]
        );
        return rows.length > 0 && rows[0].is_active === true;
    } catch (err) {
        console.error('[authorizedUsers] Lookup failed:', err.message);
        return false;
    }
}

module.exports = { isAuthorized };
