'use strict';
const express = require('express');
const { pool } = require('../../db');
const { AGENT_STATUSES, MAIL_ENABLED, PRIORITIES, SEVERITIES, SOURCES } = require('../constants');
const { fail, wrap } = require('../lib/util');

const router = express.Router();

// ---------- Routes: me & reference data ----------

router.get('/me', wrap(async (req, res) => {
    res.json({ success: true, me: req.agent, agentStatuses: AGENT_STATUSES, mailEnabled: MAIL_ENABLED });
}));

router.patch('/me/availability', wrap(async (req, res) => {
    const availability = String(req.body?.availability || '');
    if (!AGENT_STATUSES[availability]) throw fail(400, 'Unknown status.');
    await pool.query('UPDATE setu.agents SET availability = $2 WHERE id = $1', [req.agent.id, availability]);
    res.json({ success: true, availability });
}));

async function loadFields() {
    const defs = (await pool.query('SELECT * FROM setu.field_definitions ORDER BY position, id')).rows;
    const choices = (await pool.query('SELECT * FROM setu.field_choices WHERE active ORDER BY position, id')).rows;
    const fields = defs.map((d) => ({ ...d, choices: choices.filter((c) => c.fieldId === d.id && c.parentId === null).map((c) => c.value) }));
    const category = defs.find((d) => d.key === 'category');
    const tree = category
        ? choices.filter((c) => c.fieldId === category.id && c.parentId === null)
            .map((p) => ({ value: p.value, children: choices.filter((c) => c.parentId === p.id).map((c) => c.value) }))
        : [];
    return { fields, tree };
}

router.get('/meta', wrap(async (req, res) => {
    const [statuses, groups, agents, canned, { fields, tree }] = await Promise.all([
        pool.query('SELECT * FROM setu.ticket_statuses ORDER BY position, id'),
        pool.query('SELECT id, name, assignment FROM setu.groups ORDER BY name'),
        pool.query('SELECT id, name, email, role, active, availability FROM setu.agents ORDER BY name'),
        pool.query('SELECT id, folder, title, "shortCode", body FROM setu.canned_responses ORDER BY folder, title'),
        loadFields(),
    ]);
    res.json({
        success: true,
        statuses: statuses.rows,
        groups: groups.rows,
        agents: agents.rows,
        cannedResponses: canned.rows,
        fields,
        categoryTree: tree,
        priorities: PRIORITIES,
        severities: SEVERITIES,
        sources: SOURCES,
        agentStatuses: AGENT_STATUSES,
    });
}));

router.get('/distributors/lookup', wrap(async (req, res) => {
    const code = String(req.query.code || '').trim();
    if (!code) return res.json({ success: true, distributor: null });
    const { rows } = await pool.query('SELECT * FROM setu.distributors WHERE upper(code) = upper($1) LIMIT 1', [code]);
    res.json({ success: true, distributor: rows[0] ?? null });
}));

module.exports = router;
