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
}

module.exports = pool;
module.exports.runMigrations = runMigrations;