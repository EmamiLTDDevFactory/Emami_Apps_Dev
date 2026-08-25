const { pool } = require('./db');

/**
 * TEMPORARY TEST BYPASS — REMOVE BEFORE SHIPPING.
 *
 * While true, every email is treated as authorized, skipping the emami_apps.authorized_users
 * lookup entirely — lets the app be exercised end-to-end before Manage Access has real rows
 * seeded. This does NOT weaken the SAML login itself: Microsoft still has to actually
 * authenticate the user and saml-sso.js still verifies the signed response before this function
 * is even called — only the post-authentication Manage Access gate is skipped here, for both the
 * SAML and direct-email paths (and session/verify, since it re-checks the same way). Flip back
 * to false (or delete this block) to restore real gating everywhere.
 */
const BYPASS_DB_CHECK_FOR_TESTING = true;

/**
 * The Manage Access table (emami_apps.authorized_users) is the single source of truth for who
 * can log in — not a hardcoded email domain. Used by every login path (Microsoft SAML, direct
 * email, and session re-verification) so revoking/deactivating someone in Manage Access takes
 * effect everywhere immediately, not just for new logins.
 */
async function isAuthorized(email) {
    if (BYPASS_DB_CHECK_FOR_TESTING) {
        console.warn(`[authorizedUsers] BYPASS_DB_CHECK_FOR_TESTING is on — allowing "${email}" without a Manage Access lookup.`);
        return true;
    }
    const { rows } = await pool.query(
        'SELECT is_active FROM emami_apps.authorized_users WHERE email = $1',
        [email]
    );
    return rows.length > 0 && rows[0].is_active === true;
}

module.exports = { isAuthorized };
