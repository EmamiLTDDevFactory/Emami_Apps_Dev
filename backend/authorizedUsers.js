const { pool } = require('./db');

/**
 * The Manage Access table (emami_apps.authorized_users) is the single source of truth for who
 * can log in — not a hardcoded email domain. Used by every login path (Microsoft SAML, direct
 * email, and session re-verification) so revoking/deactivating someone in Manage Access takes
 * effect everywhere immediately, not just for new logins.
 */
async function isAuthorized(email) {
    const { rows } = await pool.query(
        'SELECT is_active FROM emami_apps.authorized_users WHERE email = $1',
        [email]
    );
    return rows.length > 0 && rows[0].is_active === true;
}

module.exports = { isAuthorized };
