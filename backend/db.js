const { Pool } = require('pg');

/** The one hub-wide role that can never be reassigned through the app — see
 * runMigrations' access_level seed below and server.js's access-level route, which both hard-code
 * this address as the permanent Super Admin. */
const PERMANENT_SUPER_ADMIN_EMAIL = 'indranil.banerjee@emamigroup.com';

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

    // Hub-wide role — separate from authorized_user_apps.role above, which is per-app (User/Admin
    // on one specific app). access_level instead controls the Manage Access screen itself: who can
    // see it (Super Admin/Admin) and who can grant it (see server.js's PATCH
    // /access/users/:email/access-level for the actual permission matrix — Super Admin can grant
    // Admin or Viewer, Admin can only grant Viewer). New users default to Viewer, the least
    // privileged level, rather than inheriting whatever the adding admin has.
    try {
        await pool.query(`
            ALTER TABLE emami_apps.authorized_users
                ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'Viewer'
        `);
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'authorized_users_access_level_check' AND conrelid = 'emami_apps.authorized_users'::regclass
                ) THEN
                    ALTER TABLE emami_apps.authorized_users
                        ADD CONSTRAINT authorized_users_access_level_check
                        CHECK (access_level IN ('Super Admin', 'Admin', 'Viewer'));
                END IF;
            END $$;
        `);
        // Permanently seeded/re-asserted on every cold start — this is what makes the Super Admin
        // role un-removable through the app itself: even if a row for this email doesn't exist yet
        // (first run) or someone edited it directly in the DB, it's forced back to Super Admin here.
        await pool.query(
            `INSERT INTO emami_apps.authorized_users (email, is_active, access_level)
             VALUES ($1, true, 'Super Admin')
             ON CONFLICT (email) DO UPDATE SET access_level = 'Super Admin', is_active = true`,
            [PERMANENT_SUPER_ADMIN_EMAIL]
        );
        console.log('[postgres] Access-level schema up to date (access_level, permanent Super Admin seeded).');
    } catch (err) {
        console.error('[postgres] Access-level migration failed:', err.message);
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

    // emami_apps.users already existed (provisioned ahead of this feature) but was designed
    // around a per-device identity (device_id NOT NULL + the only unique column) — that fits a
    // mobile app tracking phones, not this hub's email-based Microsoft SSO / direct email login,
    // which never has a device id. Relax device_id and key identity on email instead.
    // user_profile_stats/user_most_used_app/user_time_spent are views computed from
    // emami_apps.events (see userProfile.js) — nothing to migrate on those, they're read-only.
    try {
        await pool.query(`ALTER TABLE emami_apps.users ALTER COLUMN device_id DROP NOT NULL`);
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'users_email_key' AND conrelid = 'emami_apps.users'::regclass
                ) THEN
                    ALTER TABLE emami_apps.users ADD CONSTRAINT users_email_key UNIQUE (email);
                END IF;
            END $$;
        `);
        console.log('[postgres] User profile schema up to date (users.email unique, device_id optional).');
    } catch (err) {
        console.error('[postgres] User profile migration failed:', err.message);
    }
}

module.exports = { pool, testConnection, runMigrations, PERMANENT_SUPER_ADMIN_EMAIL };
