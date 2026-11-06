'use strict';
const shared = require('../../db');

/*
   Samadhan's database access: the shared Emami Apps pool, with the schema name in ONE place.

   Every Samadhan query writes its tables as `samadhan.<table>`. The schema it really runs on is
   SAMADHAN_DB_SCHEMA (default `samadhan`). resolveSchema() runs once at start-up, before any request:
     - the configured schema exists                 -> use it;
     - it does not, but the legacy `setu` schema does -> use `setu` and log a warning (formerly Setu: the v7.0
       rename has not been run on this database yet - see db/migrate.js). This keeps a deploy safe in any order;
     - neither exists (new database)                -> create and use the configured schema.
   When the schema in use is not literally `samadhan`, each statement's `samadhan.` prefix is rewritten to it.
   Only the SQL text is touched, never the parameters.
*/

const CONFIGURED = String(process.env.SAMADHAN_DB_SCHEMA || 'samadhan').trim();
if (!/^[a-z_][a-z0-9_]*$/.test(CONFIGURED)) throw new Error(`SAMADHAN_DB_SCHEMA must be a plain lower-case identifier, got "${CONFIGURED}"`);
const LEGACY = 'setu';
const PREFIX = /(?<![\w."])samadhan\./g;

let active = CONFIGURED;
const activeSchema = () => active;
const legacyMode = () => active === LEGACY && CONFIGURED !== LEGACY;

const rewrite = (text) => (active === 'samadhan' || typeof text !== 'string' ? text : text.replace(PREFIX, `${active}.`));
function rewriteArg(arg) {
    if (typeof arg === 'string') return rewrite(arg);
    if (arg && typeof arg === 'object' && typeof arg.text === 'string') return { ...arg, text: rewrite(arg.text) };
    return arg;
}

const wrapClient = (client) => new Proxy(client, {
    get(target, prop) {
        if (prop === 'query') return (q, ...rest) => target.query(rewriteArg(q), ...rest);
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
    },
});

const pool = {
    query: (q, ...rest) => shared.pool.query(rewriteArg(q), ...rest),
    connect: async () => wrapClient(await shared.pool.connect()),
};

async function resolveSchema() {
    const { rows } = await shared.pool.query('SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[])', [[CONFIGURED, LEGACY]]);
    const found = new Set(rows.map((r) => r.nspname));
    if (found.has(CONFIGURED)) active = CONFIGURED;
    else if (found.has(LEGACY)) {
        active = LEGACY;
        console.warn(`[samadhan] schema "${CONFIGURED}" not found - using the legacy schema "${LEGACY}" (formerly Setu). Run the v7.0 rename: node backend/samadhan/db/migrate.js up 7.0-rename`);
    } else active = CONFIGURED;
    return active;
}

/** For the migration runner after a rename on the running process (tests). */
const setActiveSchema = (name) => { active = name; };

module.exports = { CONFIGURED, LEGACY, activeSchema, legacyMode, pool, resolveSchema, rewrite, setActiveSchema, sharedPool: shared.pool };
