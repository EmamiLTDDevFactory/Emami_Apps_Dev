const pool = require("../postgres");

/**
 * Audit & CAPA no longer has its own login — access is granted by inserting a row here for a real
 * Emami Apps hub email, with the role/depot that person should have inside Audit & CAPA (see
 * controllers/authController.js and postgres.js's runMigrations for the email-keyed, password-free
 * schema this now targets). There is no admin screen for this yet, so this script is how an admin
 * grants (or re-grants) access today.
 *
 * Usage:
 *   node sql/seed-users.js <email> <name> <role> [depot]
 *
 * Examples:
 *   node sql/seed-users.js samyak.srivastava@emamigroup.com "Samyak Srivastava" CQA
 *   node sql/seed-users.js delhi.depot@emamigroup.com "Delhi Depot" Depot "Delhi Depot"
 */
async function seedUser(email, name, role, depot) {
    if (!email || !name || !role) {
        console.error("Usage: node sql/seed-users.js <email> <name> <role> [depot]");
        process.exit(1);
    }

    await pool.query(
        `
        INSERT INTO audit_capa.users
        (
            email,
            name,
            role,
            depot
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email)
        DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            depot = EXCLUDED.depot,
            is_active = TRUE
        `,
        [email.trim().toLowerCase(), name, role, depot || null]
    );

    console.log(`Granted Audit & CAPA access: ${email} (${role}${depot ? `, ${depot}` : ""})`);
}

const [, , email, name, role, depot] = process.argv;

seedUser(email, name, role, depot)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
