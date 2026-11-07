'use strict';
const shared = require('../../db');

/*
   Samadhan's database access: the shared Emami Apps pool, with the schema name in ONE place.

   Every Samadhan query writes its tables as `samadhan.<table>`. The schema it really runs on is
   SAMADHAN_DB_SCHEMA (default `samadhan`); a new database gets it created at start-up. When the configured name is not
   literally `samadhan`, each statement's `samadhan.` prefix is rewritten to it.
   Only the SQL text is touched, never the parameters.
*/

const CONFIGURED = String(process.env.SAMADHAN_DB_SCHEMA || 'samadhan').trim();
if (!/^[a-z_][a-z0-9_]*$/.test(CONFIGURED)) throw new Error(`SAMADHAN_DB_SCHEMA must be a plain lower-case identifier, got "${CONFIGURED}"`);
const PREFIX = /(?<![\w."])samadhan\./g;

let active = CONFIGURED;
const activeSchema = () => active;

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
    active = CONFIGURED;
    return active;
}

module.exports = { CONFIGURED, activeSchema, pool, resolveSchema, rewrite, sharedPool: shared.pool };
