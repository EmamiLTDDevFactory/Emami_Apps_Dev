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
}

module.exports = { pool, testConnection, runMigrations };
