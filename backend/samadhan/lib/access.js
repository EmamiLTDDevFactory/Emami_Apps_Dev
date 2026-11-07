'use strict';
const { pool } = require('../db/pool');
const { APP_ID, APP_IDS } = require('../constants');

/*
   Manage Access grants for Samadhan (emami_apps.authorized_user_apps, app id 'samadhan'). The hub's Manage Access and
   Samadhan's Roles & access edit the same row.
*/

async function grantAppId() { return APP_ID; }
const clearGrantCache = () => {};

/** A person's grant ({ app_id, role }), or null. */
async function grantFor(email) {
    const { rows } = await pool.query(
        `SELECT app_id, role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = ANY($2::text[])
         ORDER BY (app_id = $3) DESC LIMIT 1`,
        [email, APP_IDS, APP_ID],
    );
    return rows[0] ?? null;
}

/** People whose effective Samadhan role is Admin. */
async function adminCount() {
    const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM (
             SELECT DISTINCT ON (email) email, role FROM emami_apps.authorized_user_apps
             WHERE app_id = ANY($1::text[]) ORDER BY email, (app_id = $2) DESC) g
         WHERE g.role = 'Admin'`,
        [APP_IDS, APP_ID],
    );
    return rows[0].n;
}

module.exports = { adminCount, clearGrantCache, grantAppId, grantFor };
