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

module.exports = {
    findUserByEmail
};