const pool = require("../postgres");

const findUserByUserId = async (userId) => {
    const result = await pool.query(
        `
        SELECT
            id,
            user_id,
            password_hash,
            name,
            role,
            depot,
            is_active
        FROM audit_capa.users
        WHERE user_id = $1
          AND is_active = TRUE
        `,
        [userId]
    );

    return result.rows[0] || null;
};

module.exports = {
    findUserByUserId
};