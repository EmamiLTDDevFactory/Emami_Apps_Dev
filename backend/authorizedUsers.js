/**
 * Post-authentication gate for both login paths (Microsoft SAML in saml-sso.js, direct email in
 * hub-auth.js) and session re-verification. This used to check the emami_apps.authorized_users
 * Postgres table (Manage Access); as part of moving the login path off Postgres entirely (see
 * idpConfig.js), it's a no-op that allows everyone through instead — Microsoft still has to
 * actually authenticate the user first, and saml-sso.js still verifies the signed SAML response
 * before this is even called, so this only ever governed the post-authentication allow-list, not
 * authentication itself.
 *
 * Manage Access (server.js's /access/users routes) still reads/writes the real
 * authorized_users table in Postgres — it just no longer gates login. Point this function back
 * at that table (or a new file-based allow-list) if login needs to be locked down to specific
 * emails again.
 */
async function isAuthorized(email) {
    return true;
}

module.exports = { isAuthorized };
