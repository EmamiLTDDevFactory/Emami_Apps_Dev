const { Pool } = require('pg');

/** Hub-wide role(s) that can never be reassigned through the app — see runMigrations' access_level
 * seed below and server.js's access-level route, which both hard-code these addresses as permanent
 * Super Admins. */
const PERMANENT_SUPER_ADMIN_EMAILS = ['indranil.banerjee@emamigroup.com', 'sayontan.das@emamigroup.com'];

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
        // Only meaningful for Audit & CAPA's 'Depot' role (which depot that person belongs to) —
        // null for every other app/role. See server.js's syncAuditCapaAccess.
        await pool.query(`
            ALTER TABLE emami_apps.authorized_user_apps
                ADD COLUMN IF NOT EXISTS depot text
        `);
        console.log('[postgres] Manage Access schema up to date (is_active, role, depot).');
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
        // role un-removable through the app itself: even if a row for one of these emails doesn't
        // exist yet (first run) or someone edited it directly in the DB, it's forced back to Super
        // Admin here.
        for (const email of PERMANENT_SUPER_ADMIN_EMAILS) {
            await pool.query(
                `INSERT INTO emami_apps.authorized_users (email, is_active, access_level)
                 VALUES ($1, true, 'Super Admin')
                 ON CONFLICT (email) DO UPDATE SET access_level = 'Super Admin', is_active = true`,
                [email]
            );
        }
        console.log('[postgres] Access-level schema up to date (access_level, permanent Super Admins seeded).');
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
    // emami_apps.events (see userProfile.js) — read-only, but see the user_profile_stats
    // migration below, which does need to redefine one of its columns.
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

    // Profile photo for the Settings screen's "Upload Photo" button — stores a self-describing
    // data URI (e.g. "data:image/jpeg;base64,...") rather than a bare base64 blob + separate mime
    // column, since the frontend can then hand it straight to <Image source={{ uri }}> with no
    // extra bookkeeping. Client resizes to 512x512 and compresses before upload, so this stays
    // small (well within the request body limit — see server.js). Must run before the
    // user_profile_stats view migration below, which selects this column.
    try {
        await pool.query(`
            ALTER TABLE emami_apps.users
                ADD COLUMN IF NOT EXISTS photo_url text
        `);
        console.log('[postgres] Profile photo schema up to date (users.photo_url).');
    } catch (err) {
        console.error('[postgres] Profile photo migration failed:', err.message);
    }

    // user_profile_stats.favorites_added used to be count(FAVORITE_ADD) - count(FAVORITE_REMOVE) —
    // a net delta, not what the "Favorites Added" label on Settings actually says. It also went
    // negative for any user who removed one of FavoritesContext.tsx's two default favorites
    // ('expense', 'hr'), since those are seeded into client state without ever logging a
    // FAVORITE_ADD to pair against the eventual REMOVE. CREATE OR REPLACE VIEW is safe here since
    // this only changes one column's expression, not the column list/order/types.
    try {
        await pool.query(`
            CREATE OR REPLACE VIEW emami_apps.user_profile_stats AS
             SELECT u.user_id,
                u.device_id,
                u.name,
                u.email,
                u.mobile,
                u.role,
                u.status,
                u.last_login_at,
                count(*) FILTER (WHERE (e.event_type = 'SESSION_START'::text)) AS sessions_total,
                count(*) FILTER (WHERE (e.event_type = 'LOGIN'::text)) AS logins,
                COALESCE(ts.time_spent, '00:00:00'::interval) AS time_spent,
                count(*) FILTER (WHERE (e.event_type = 'APP_OPEN'::text)) AS apps_opened,
                count(*) FILTER (WHERE (e.event_type = 'DOWNLOAD'::text)) AS downloads,
                count(*) FILTER (WHERE (e.event_type = 'FAVORITE_ADD'::text)) AS favorites_added,
                count(*) FILTER (WHERE (e.event_type = 'NOTIFICATION_READ'::text)) AS notifications_read,
                mu.most_used_app,
                u.photo_url
               FROM (((emami_apps.users u
                 LEFT JOIN emami_apps.events e ON ((e.user_id = u.user_id)))
                 LEFT JOIN emami_apps.user_time_spent ts ON ((ts.user_id = u.user_id)))
                 LEFT JOIN emami_apps.user_most_used_app mu ON ((mu.user_id = u.user_id)))
              GROUP BY u.user_id, u.device_id, u.name, u.email, u.mobile, u.role, u.status, u.last_login_at, u.photo_url, ts.time_spent, mu.most_used_app
        `);
        console.log('[postgres] user_profile_stats view up to date (favorites_added is a count, not a net delta; photo_url appended).');
    } catch (err) {
        console.error('[postgres] user_profile_stats view migration failed:', err.message);
    }
}

module.exports = { pool, testConnection, runMigrations, PERMANENT_SUPER_ADMIN_EMAILS };
