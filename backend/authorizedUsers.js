/**
 * Post-authentication gate for both login paths (Microsoft SAML in saml-sso.js, direct email in
 * hub-auth.js) and session re-verification. Checks the emami_apps.authorized_users table (Manage
 * Access) — an email is authorized only if it exists there AND is marked active. Microsoft still
 * has to actually authenticate the user first (saml-sso.js verifies the signed SAML response
 * before this is ever called) — this only governs the post-authentication allow-list.
 */
const { pool } = require('./db');

async function isAuthorized(email) {
    try {
        const { rows } = await pool.query(
            'SELECT is_active FROM emami_apps.authorized_users WHERE email = $1',
            [String(email || '').trim().toLowerCase()]
        );
        return rows.length > 0 && rows[0].is_active === true;
    } catch (err) {
        console.error('[authorizedUsers] Lookup failed:', err.message);
        return false;
    }
}

module.exports = { isAuthorized };
