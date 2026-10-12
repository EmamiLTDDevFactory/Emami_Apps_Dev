const pool = require("../postgres");

const findUserByEmail = async (email) => {
    const result = await pool.query(
        `
        SELECT
            id,
            email,
            name,
            role,
            depot,
            is_active
        FROM audit_capa.users
        WHERE email = $1
          AND is_active = TRUE
        `,
        [email]
    );

    return result.rows[0] || null;
};

/**
 * Grants (or updates) this person's Audit & CAPA access — the same effect as manually running
 * sql/seed-users.js, now driven by the Emami Apps hub's own Manage Access screen instead (see
 * controllers/internalController.js). Reactivates a previously-revoked user too.
 */
const upsertUserFromHub = async (email, name, role, depot) => {
    const result = await pool.query(
        `
        INSERT INTO audit_capa.users
        (
            email,
            name,
            role,
            depot,
            is_active
        )
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (email)
        DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            depot = EXCLUDED.depot,
            is_active = TRUE
        RETURNING id, email, name, role, depot, is_active
        `,
        [email, name, role, depot || null]
    );

    return result.rows[0] || null;
};

/** Revokes Audit & CAPA access without deleting the row — mirrors the hub's own is_active
 * semantics, and keeps this person's audit history/attribution intact if access is later restored. */
const deactivateUserByEmail = async (email) => {
    await pool.query(
        `UPDATE audit_capa.users SET is_active = FALSE WHERE email = $1`,
        [email]
    );
};

/** Auditors offered on Create / Edit Audit: active CQA users flagged is_auditor
 * (see sql/seed-auditors.js). audits.auditor stores the name, which is also how
 * auditor notifications find the user (notificationModel.resolveAuditorRecipient). */
const getAuditors = async () => {
    const result = await pool.query(
        `
        SELECT id, email, name, employee_code, location
        FROM audit_capa.users
        WHERE role = 'CQA'
          AND is_active = TRUE
          AND is_auditor = TRUE
        ORDER BY name
        `
    );

    return result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        employeeCode: row.employee_code,
        location: row.location,
    }));
};

module.exports = {
    getAuditors,
    findUserByEmail,
    upsertUserFromHub,
    deactivateUserByEmail
};