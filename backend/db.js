const { Pool } = require('pg');

/*
   POSTGRES CONNECTION POOL — Development Environment DB (same instance used by
   embedded-apps/mouldhealthcheck/backend/db.js). Credentials come from
   environment variables (backend/.env, gitignored — see .env.example).
*/
const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
    console.error('[postgres] Unexpected error on idle client:', err.message);
});

async function testConnection() {
    try {
        const client = await pool.connect();
        try {
            const { rows } = await client.query('SELECT NOW() AS now, current_database() AS db');
            console.log(`[postgres] Connected to "${rows[0].db}" at ${rows[0].now}`);
            return true;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[postgres] Connection failed:', err.message);
        return false;
    }
}

/**
 * Idempotent schema bootstrap for Manage Access — safe to run on every cold start (IF NOT EXISTS
 * everywhere). Adds per-user active/inactive status and a per-app role on top of the original
 * plain grant/revoke membership model.
 */
async function runMigrations() {
    try {
        await pool.query(`
            ALTER TABLE emami_apps.authorized_users
                ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true
        `);
        await pool.query(`
            ALTER TABLE emami_apps.authorized_user_apps
                ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'User'
        `);
        console.log('[postgres] Manage Access schema up to date (is_active, role).');
    } catch (err) {
        console.error('[postgres] Migration failed:', err.message);
    }

    // Single-row (id=1) config for the "Configure SSO" screen (see backend/saml-sso.js) — an
    // admin-uploaded IdP Federation Metadata XML plus the fields parsed out of it for display,
    // instead of hardcoding the IdP's SSO URL/certificate/entity ID in code or env vars.
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS emami_apps.sso_config (
                id smallint PRIMARY KEY DEFAULT 1,
                idp_metadata_xml text NOT NULL,
                idp_entity_id text NOT NULL,
                sso_url text NOT NULL,
                certificate text NOT NULL,
                is_enabled boolean NOT NULL DEFAULT false,
                uploaded_by text,
                uploaded_at timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT sso_config_singleton CHECK (id = 1)
            )
        `);
        console.log('[postgres] SSO config schema up to date (emami_apps.sso_config).');
    } catch (err) {
        console.error('[postgres] SSO config migration failed:', err.message);
    }
}

module.exports = { pool, testConnection, runMigrations };
