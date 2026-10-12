const pool = require("../postgres");

/**
 * Depot access as given by CQA on 2026-10-12: inserts or updates each depot
 * login by email as an active Depot user (with location and SAP ID), then
 * deactivates the dummy users created for testing. Nothing is deleted:
 * deactivated users keep their rows so old notifications and audits still
 * point at them, and they can be reactivated.
 *
 * The SAP ID is stored for reference only; the SAP audit flag still sends the
 * 4-character plant code it always has.
 *
 * Usage (run once per database, from the backend folder):
 *   node sql/seed-depots.js
 */
const DEPOT_USERS = [
    { email: "depotkolkata@emamigroup.com", depot: "Kolkata Depot", location: "Kolkata", sapId: "SUK_COM" },
    { email: "depotkolkataj@emamigroup.com", depot: "Kolkata Depot", location: "Kolkata", sapId: "SUK_COM" },
    { email: "depotahmedabad@emamigroup.com", depot: "Ahmedabad Depot", location: "Ahmedabad", sapId: "AHM_EU2" },
];

// Dummy logins from the original seed (plain user ids, not real emails).
const DUMMY_USER_EMAILS = ["samyak", "argha", "devraj", "delhi", "kolkata", "bangalore"];

async function seedDepots() {
    for (const user of DEPOT_USERS) {
        const result = await pool.query(
            `
            INSERT INTO audit_capa.users
            (
                email,
                name,
                role,
                depot,
                is_active,
                location,
                sap_id
            )
            VALUES ($1, $2, 'Depot', $2, TRUE, $3, $4)
            ON CONFLICT (email)
            DO UPDATE SET
                name = EXCLUDED.name,
                role = 'Depot',
                depot = EXCLUDED.depot,
                is_active = TRUE,
                location = EXCLUDED.location,
                sap_id = EXCLUDED.sap_id
            RETURNING id, (xmax = 0) AS inserted
            `,
            [user.email.toLowerCase(), user.depot, user.location, user.sapId]
        );

        const row = result.rows[0];
        console.log(`${row.inserted ? "Added" : "Updated"} depot user #${row.id}: ${user.depot} <${user.email}>`);
    }

    const deactivated = await pool.query(
        `
        UPDATE audit_capa.users
        SET is_active = FALSE
        WHERE email = ANY($1)
          AND is_active = TRUE
        RETURNING id, email, name
        `,
        [DUMMY_USER_EMAILS]
    );

    for (const row of deactivated.rows) {
        console.log(`Deactivated dummy user #${row.id}: ${row.name} (${row.email})`);
    }
}

seedDepots()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
