const pool = require("../postgres");

/**
 * CQA auditors offered in the Auditor dropdown (Create / Edit Audit), as given by
 * CQA on 2026-10-12. Inserts or updates each person by email as an active CQA
 * user with is_auditor = TRUE. Only these rows are touched; nothing is deleted.
 *
 * Names are stored without titles (Dr./Mr.) to match the Emami Apps hub, which
 * rewrites the name whenever it (re)grants access.
 *
 * Usage (run once per database, from the backend folder):
 *   node sql/seed-auditors.js
 */
const AUDITORS = [
    { name: "Rahul Singh", email: "rahul.singh@emamigroup.com", employeeCode: "90002611", location: "KOLKATA" },
    { name: "Pankaj Kumar", email: "pankaj.kumar@emamigroup.com", employeeCode: "90008436", location: "KOLKATA" },
    { name: "Sandip Karmakar", email: "sandip.karmakar@emamigroup.com", employeeCode: "90007512", location: "KOLKATA" },
    { name: "Argha Bose", email: "argha.bose@emamigroup.com", employeeCode: "90007020", location: "KOLKATA" },
    { name: "Kaushal Joshi", email: "kaushal.joshi@emamigroup.com", employeeCode: null, location: "KOLKATA" },
    // Added 2026-10-14.
    { name: "Girish Chand Sharma", email: "girish.sharma1@emamigroup.com", employeeCode: null, location: "KOLKATA" },
];

async function seedAuditors() {
    for (const auditor of AUDITORS) {
        const result = await pool.query(
            `
            INSERT INTO audit_capa.users
            (
                email,
                name,
                role,
                depot,
                is_active,
                is_auditor,
                employee_code,
                location
            )
            VALUES ($1, $2, 'CQA', NULL, TRUE, TRUE, $3, $4)
            ON CONFLICT (email)
            DO UPDATE SET
                name = EXCLUDED.name,
                role = 'CQA',
                depot = NULL,
                is_active = TRUE,
                is_auditor = TRUE,
                employee_code = EXCLUDED.employee_code,
                location = EXCLUDED.location
            RETURNING id, (xmax = 0) AS inserted
            `,
            [auditor.email.toLowerCase(), auditor.name, auditor.employeeCode, auditor.location]
        );

        const row = result.rows[0];
        console.log(`${row.inserted ? "Added" : "Updated"} auditor #${row.id}: ${auditor.name} <${auditor.email}>`);
    }
}

seedAuditors()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
