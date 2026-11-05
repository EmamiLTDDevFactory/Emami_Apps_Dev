'use strict';
const { pool } = require('../db/pool');
const { APP_ID, APP_IDS, LEGACY_APP_ID } = require('../constants');

/*
   Manage Access grants for Samadhan (emami_apps.authorized_user_apps). Formerly Setu: grants made before v7 carry the
   app id 'setu'. Both ids are accepted; when a person has both, the 'samadhan' row wins. New grants are written under
   the id in use: 'samadhan' once any grant carries it (after the hub switch, RENAME-FOLLOWUPS.md), otherwise 'setu' -
   so the hub's Manage Access and Samadhan's Roles & access always edit the same row.
*/

let inUse = { at: 0, id: null };
async function grantAppId() {
    if (inUse.id && Date.now() - inUse.at < 60_000) return inUse.id;
    const { rows } = await pool.query('SELECT 1 FROM emami_apps.authorized_user_apps WHERE app_id = $1 LIMIT 1', [APP_ID]);
    inUse = { at: Date.now(), id: rows.length ? APP_ID : LEGACY_APP_ID };
    return inUse.id;
}
const clearGrantCache = () => { inUse = { at: 0, id: null }; };

/** A person's grant ({ app_id, role }) on either id, or null. */
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
