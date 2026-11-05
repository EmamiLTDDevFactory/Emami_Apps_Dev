'use strict';
/*
   Samadhan v7 migrations: each step runs in ONE transaction and has a tested down script. Applied steps are recorded
   in samadhan.schema_migrations. Steps marked `explicit` never run on their own at start-up - an operator runs them:

     node backend/samadhan/db/migrate.js status
     node backend/samadhan/db/migrate.js up   <id> --yes
     node backend/samadhan/db/migrate.js down <id> --yes

   The command uses the backend's own PG* settings (backend/.env) and prints only the host and database name.
   Stop the backend before a schema rename (or restart it right after): a running copy keeps the schema it found at start.

   Steps:
     7.0-rename  ALTER SCHEMA setu RENAME TO samadhan (formerly Setu). Explicit. Down: rename back.
*/
// As a command, read backend/.env first (the shared pool reads PG* when it is loaded). Values already set win.
if (require.main === module) require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const shared = require('../../db');
const { CONFIGURED, LEGACY, activeSchema, setActiveSchema } = require('./pool');

const q = (client, text, params) => client.query(text, params);
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

async function ensureTable(client, schema) {
    await q(client, `CREATE TABLE IF NOT EXISTS ${ident(schema)}.schema_migrations (
        id text PRIMARY KEY, "appliedAt" timestamptz NOT NULL DEFAULT now(), note text)`);
}

async function schemas(client) {
    const { rows } = await q(client, 'SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[])', [[CONFIGURED, LEGACY]]);
    return new Set(rows.map((r) => r.nspname));
}

/** Text references to "setu." outside table data that a schema rename would not follow (functions, views, triggers, defaults). */
async function textReferences(client, name) {
    const like = `%${name}.%`;
    const { rows } = await q(client, `
        SELECT 'function ' || n.nspname || '.' || p.proname AS ref FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND p.prosrc ILIKE $1
        UNION ALL SELECT 'view ' || schemaname || '.' || viewname FROM pg_views WHERE definition ILIKE $1
          AND schemaname NOT IN ('pg_catalog', 'information_schema')
        UNION ALL SELECT 'trigger ' || t.tgname FROM pg_trigger t WHERE NOT t.tgisinternal AND pg_get_triggerdef(t.oid) ILIKE $1
        UNION ALL SELECT 'default ' || table_schema || '.' || table_name || '.' || column_name FROM information_schema.columns
          WHERE column_default ILIKE $1 AND column_default NOT ILIKE '%nextval(%'`, [like]);
    return rows.map((r) => r.ref);
}

const MIGRATIONS = [
    {
        id: '7.0-rename',
        explicit: true,
        describe: `ALTER SCHEMA ${LEGACY} RENAME TO ${CONFIGURED}`,
        async up(client) {
            const found = await schemas(client);
            if (found.has(CONFIGURED) && !found.has(LEGACY)) return 'already renamed';
            if (found.has(CONFIGURED) && found.has(LEGACY)) throw new Error(`Both "${LEGACY}" and "${CONFIGURED}" exist - stop and check by hand.`);
            if (!found.has(LEGACY)) throw new Error(`Schema "${LEGACY}" not found.`);
            const refs = await textReferences(client, LEGACY);
            if (refs.length) throw new Error(`Objects refer to "${LEGACY}." by name and would break: ${refs.join(', ')}`);
            // Privileges and default privileges belong to the schema object and follow the rename; the tickets.id
            // default is a regclass (nextval of the sequence) and follows it too.
            await q(client, `ALTER SCHEMA ${ident(LEGACY)} RENAME TO ${ident(CONFIGURED)}`);
            const paths = await q(client, `SELECT r.rolname, s.setconfig FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid = s.setrole
                                           WHERE array_to_string(s.setconfig, ',') ILIKE $1`, [`%search_path%${LEGACY}%`]);
            return paths.rows.length ? `renamed; NOTE: role search_path still names "${LEGACY}" for ${paths.rows.map((r) => r.rolname).join(', ')}` : 'renamed';
        },
        async down(client) {
            const found = await schemas(client);
            if (found.has(LEGACY) && !found.has(CONFIGURED)) return 'already on the legacy name';
            if (found.has(LEGACY)) throw new Error(`Schema "${LEGACY}" already exists - stop and check by hand.`);
            await q(client, `ALTER SCHEMA ${ident(CONFIGURED)} RENAME TO ${ident(LEGACY)}`);
            return 'renamed back';
        },
    },
];

async function applied(client, schema) {
    await ensureTable(client, schema);
    const { rows } = await q(client, `SELECT id FROM ${ident(schema)}.schema_migrations`);
    return new Set(rows.map((r) => r.id));
}

/** Runs one step in a transaction. dir = 'up' | 'down'. */
async function run(id, dir) {
    const m = MIGRATIONS.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown migration ${id}`);
    const client = await shared.pool.connect();
    try {
        await q(client, 'BEGIN');
        await q(client, "SET LOCAL lock_timeout = '5s'");
        const note = await m[dir](client);
        const schema = (await schemas(client)).has(CONFIGURED) ? CONFIGURED : LEGACY;
        await ensureTable(client, schema);
        if (dir === 'up') {
            await q(client, `INSERT INTO ${ident(schema)}.schema_migrations (id, note) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note, "appliedAt" = now()`, [id, note]);
        } else {
            await q(client, `DELETE FROM ${ident(schema)}.schema_migrations WHERE id = $1`, [id]);
        }
        await q(client, 'COMMIT');
        if (id === '7.0-rename') setActiveSchema(schema);
        return note;
    } catch (err) {
        await q(client, 'ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Start-up part (db/schema.js): records 7.0-rename as applied when this database is already on the configured name
 * (new database, or renamed earlier). Non-explicit steps would be applied here, in order.
 */
async function startup() {
    const schema = activeSchema();
    const client = await shared.pool.connect();
    try {
        const done = await applied(client, schema);
        if (schema === CONFIGURED && !done.has('7.0-rename')) {
            await q(client, `INSERT INTO ${ident(schema)}.schema_migrations (id, note) VALUES ('7.0-rename', 'schema created under the new name') ON CONFLICT DO NOTHING`);
        }
        for (const m of MIGRATIONS) {
            if (!m.explicit && !done.has(m.id)) await run(m.id, 'up');
        }
    } finally {
        client.release();
    }
}

async function status() {
    const client = await shared.pool.connect();
    try {
        const found = await schemas(client);
        const schema = found.has(CONFIGURED) ? CONFIGURED : found.has(LEGACY) ? LEGACY : null;
        const done = schema ? await applied(client, schema) : new Set();
        return { schema, steps: MIGRATIONS.map((m) => ({ id: m.id, explicit: Boolean(m.explicit), applied: done.has(m.id), describe: m.describe })) };
    } finally {
        client.release();
    }
}

module.exports = { MIGRATIONS, run, startup, status };

if (require.main === module) {
    (async () => {
        const [cmd, id] = process.argv.slice(2);
        const yes = process.argv.includes('--yes');
        console.log(`Database: ${process.env.PGHOST || '(default host)'} / ${process.env.PGDATABASE || '(default db)'}`);
        if (cmd === 'status') console.log(JSON.stringify(await status(), null, 2));
        else if ((cmd === 'up' || cmd === 'down') && id) {
            if (!yes) { console.log(`Would run ${cmd} ${id}. Add --yes to run it.`); process.exit(0); }
            console.log(`${cmd} ${id}: ${await run(id, cmd)}`);
        } else {
            console.log('usage: node migrate.js status | up <id> --yes | down <id> --yes');
            process.exitCode = 2;
        }
        await shared.pool.end();
    })().catch(async (err) => { console.error('FAILED:', err.message); await shared.pool.end().catch(() => {}); process.exit(1); });
}
