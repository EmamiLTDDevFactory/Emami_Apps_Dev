'use strict';
const { pool } = require('../db/pool');

// ---------- Round robin ----------

/** Next active, Available member of a ROUND_ROBIN group after the last one assigned. */
async function roundRobinAgent(groupId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // lock the group row so two new tickets cannot pick the same agent
        const g = await client.query('SELECT assignment, "lastAssignedAgentId" FROM samadhan.groups WHERE id = $1 FOR UPDATE', [groupId]);
        if (!g.rows.length || g.rows[0].assignment !== 'ROUND_ROBIN') {
            await client.query('ROLLBACK');
            return null;
        }
        const members = await client.query(
            `SELECT m."agentId" FROM samadhan.group_members m JOIN samadhan.agents a ON a.id = m."agentId"
             WHERE m."groupId" = $1 AND a.active AND a.availability = 'AVAILABLE' ORDER BY m."agentId"`,
            [groupId],
        );
        const ids = members.rows.map((r) => r.agentId);
        if (!ids.length) {
            await client.query('ROLLBACK');
            return null;
        }
        const next = ids.find((id) => id > (g.rows[0].lastAssignedAgentId ?? 0)) ?? ids[0];
        await client.query('UPDATE samadhan.groups SET "lastAssignedAgentId" = $2 WHERE id = $1', [groupId, next]);
        await client.query('COMMIT');
        return next;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { roundRobinAgent };
