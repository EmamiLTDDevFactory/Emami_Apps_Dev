'use strict';
const { pool } = require('../../db');
const { fail, intOrNull } = require('./util');

// ---------- Canned responses ----------
// Shared ones (ownerAgentId NULL) are kept by Admins in Admin > Canned responses; personal ones belong to one agent
// and nobody else - other agents and Admins included - sees them. Short codes are unique per owner.

function cleanCanned(b) {
    const title = String(b.title || '').trim().slice(0, 200);
    const body = String(b.body || '').trim().slice(0, 20000);
    if (!title || !body) throw fail(400, 'Title and text are needed.');
    const shortCode = String(b.shortCode || '').trim().replace(/^\//, '').toLowerCase() || null;
    if (shortCode && !/^[a-z0-9_-]{1,30}$/.test(shortCode)) throw fail(400, 'Short codes use letters, numbers, - and _ only.');
    const folder = String(b.folder || 'General').trim().slice(0, 100) || 'General';
    const id = intOrNull(b.id);
    if (Number.isNaN(id)) throw fail(400, 'Invalid id.');
    return { id, folder, title, shortCode, body };
}

/** Saves a shared (ownerAgentId null) or personal canned response. Only that owner's rows can be changed. */
async function saveCanned(b, ownerAgentId) {
    const c = cleanCanned(b);
    if (c.id) {
        const { rowCount } = await pool.query(
            `UPDATE setu.canned_responses SET folder = $3, title = $4, "shortCode" = $5, body = $6, "updatedAt" = now()
             WHERE id = $1 AND "ownerAgentId" IS NOT DISTINCT FROM $2`,
            [c.id, ownerAgentId, c.folder, c.title, c.shortCode, c.body],
        );
        if (!rowCount) throw fail(404, 'Canned response not found.');
    } else {
        await pool.query(
            'INSERT INTO setu.canned_responses (folder, title, "shortCode", body, "ownerAgentId") VALUES ($1, $2, $3, $4, $5)',
            [c.folder, c.title, c.shortCode, c.body, ownerAgentId],
        );
    }
}

async function deleteCanned(id, ownerAgentId) {
    const { rowCount } = await pool.query('DELETE FROM setu.canned_responses WHERE id = $1 AND "ownerAgentId" IS NOT DISTINCT FROM $2', [Number(id), ownerAgentId]);
    if (!rowCount) throw fail(404, 'Canned response not found.');
}

module.exports = { deleteCanned, saveCanned };
