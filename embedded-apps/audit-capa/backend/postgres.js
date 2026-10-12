const { Pool } = require("pg");
require("dotenv").config();

// console.log("PostgreSQL configuration:");
// console.log("Host:", process.env.PGHOST);
// console.log("Port:", process.env.PGPORT);
// console.log("Database:", process.env.PGDATABASE);
// console.log("User:", process.env.PGUSER);
// console.log("Password loaded:", typeof process.env.PGPASSWORD);
// console.log("Password exists:", !!process.env.PGPASSWORD);

const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
});

pool.on("connect", (client) => {
    client.query('SET search_path TO "audit-capa"')
        .catch((err) => {
            console.error("Unable to set PostgreSQL schema:", err);
        });
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL error:", err);
});

/**
 * Idempotent schema bootstrap for the Emami Apps hub SSO login change — safe to run on every
 * startup. audit_capa.users used to be keyed by a plain user_id (a shared username like "samyak"
 * or "delhi") checked against a password; since login now happens via the hub's own authenticated
 * session (see controllers/authController.js), the same column becomes the person's real email
 * instead, and the password check is dropped. The RENAME is skipped once "email" already exists,
 * so this is safe to run every time the server starts, not just once.
 */
async function runMigrations() {
    try {
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'audit_capa' AND table_name = 'users' AND column_name = 'user_id'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'audit_capa' AND table_name = 'users' AND column_name = 'email'
                ) THEN
                    ALTER TABLE audit_capa.users RENAME COLUMN user_id TO email;
                END IF;
            END $$;
        `);
        await pool.query(`
            ALTER TABLE audit_capa.users ALTER COLUMN password_hash DROP NOT NULL
        `);
        console.log("[postgres] audit_capa.users schema up to date (email-keyed, no password required).");
    } catch (err) {
        console.error("[postgres] Migration failed:", err.message);
    }

    // Due-date reminder notifications (utils/reminders.js) need to dedupe against an
    // already-created reminder for the same CAPA — these columns were being sent by the
    // frontend but silently dropped on insert, so the dedupe check could never match anything.
    // Kept in its own try/catch so a failure in the (unrelated, already-known) migration above
    // can never block this one from running.
    try {
        await pool.query(`
            ALTER TABLE audit_capa.notifications ADD COLUMN IF NOT EXISTS type character varying;
        `);
        await pool.query(`
            ALTER TABLE audit_capa.notifications ADD COLUMN IF NOT EXISTS capa_id bigint;
        `);
        console.log("[postgres] audit_capa.notifications schema up to date (type, capa_id).");
    } catch (err) {
        console.error("[postgres] Notifications migration failed:", err.message);
    }

    // Desktop audits now follow the Onsite flow (CQA fills checklist -> CAPA -> Depot).
    // Additive, nullable, no default: rows that already exist stay NULL and keep the old
    // Desktop self-assessment flow until they close; only newly created audits get TRUE.
    try {
        await pool.query(`
            ALTER TABLE audit_capa.audits ADD COLUMN IF NOT EXISTS unified_flow boolean;
        `);
        console.log("[postgres] audit_capa.audits schema up to date (unified_flow).");
    } catch (err) {
        console.error("[postgres] Audits unified_flow migration failed:", err.message);
    }

    // Multiple evidence files per CAPA. Additive and nullable: existing CAPAs stay
    // NULL and their single evidence_* file is shown as the first list item.
    try {
        await pool.query(`
            ALTER TABLE audit_capa.capas ADD COLUMN IF NOT EXISTS evidence_files jsonb;
        `);
        console.log("[postgres] audit_capa.capas schema up to date (evidence_files).");
    } catch (err) {
        console.error("[postgres] CAPAs evidence_files migration failed:", err.message);
    }

    // Additional CAPAs per finding ("Add CAPA", CQA): description, flag, and soft
    // cancellation. All additive + nullable; existing CAPAs are untouched.
    try {
        await pool.query(`
            ALTER TABLE audit_capa.capas
                ADD COLUMN IF NOT EXISTS capa_description text,
                ADD COLUMN IF NOT EXISTS is_additional boolean,
                ADD COLUMN IF NOT EXISTS cancelled_by character varying,
                ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
        `);
        console.log("[postgres] audit_capa.capas schema up to date (additional CAPA columns).");
    } catch (err) {
        console.error("[postgres] CAPAs additional-CAPA migration failed:", err.message);
    }

    // Depot "Add CAPA": extra Root Cause / Corrective Action entries inside one
    // CAPA, kept as a jsonb list (removed entries stay with removed: true).
    // Additive + nullable; existing CAPAs stay NULL (= no extra entries).
    try {
        await pool.query(`
            ALTER TABLE audit_capa.capas ADD COLUMN IF NOT EXISTS additional_actions jsonb;
        `);
        console.log("[postgres] audit_capa.capas schema up to date (additional_actions).");
    } catch (err) {
        console.error("[postgres] CAPAs additional_actions migration failed:", err.message);
    }

    // Auditor list for Create/Edit Audit: CQA users flagged is_auditor, with
    // employee code and location. Additive + nullable; existing users stay NULL
    // (= not offered as auditor) and keep their login unchanged.
    try {
        await pool.query(`
            ALTER TABLE audit_capa.users
                ADD COLUMN IF NOT EXISTS is_auditor boolean,
                ADD COLUMN IF NOT EXISTS employee_code character varying,
                ADD COLUMN IF NOT EXISTS location character varying;
        `);
        console.log("[postgres] audit_capa.users schema up to date (auditor columns).");
    } catch (err) {
        console.error("[postgres] users auditor-columns migration failed:", err.message);
    }

    // Audit deactivation (CQA): soft on/off switch with an audit trail. Additive and
    // nullable; NULL is_active means active, so every existing audit stays active.
    try {
        await pool.query(`
            ALTER TABLE audit_capa.audits
                ADD COLUMN IF NOT EXISTS is_active boolean,
                ADD COLUMN IF NOT EXISTS deactivation_reason text,
                ADD COLUMN IF NOT EXISTS deactivated_by character varying,
                ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
                ADD COLUMN IF NOT EXISTS reactivated_by character varying,
                ADD COLUMN IF NOT EXISTS reactivated_at timestamptz;
        `);
        console.log("[postgres] audit_capa.audits schema up to date (activation columns).");
    } catch (err) {
        console.error("[postgres] Audits activation migration failed:", err.message);
    }
}

module.exports = pool;
module.exports.runMigrations = runMigrations;