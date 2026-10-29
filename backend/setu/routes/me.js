'use strict';
const express = require('express');
const { pool } = require('../../db');
const { AGENT_STATUSES, BELL_EVENTS, CALL_MODES, CALL_OUTCOMES, MAIL_ENABLED, PRIORITIES, SEVERITIES, SOURCES } = require('../constants');
const { bellConfig } = require('../lib/bell');
const { deleteCanned, saveCanned } = require('../lib/canned');
const { fail, setting, wrap } = require('../lib/util');
const { whatsappReady } = require('../lib/whatsapp');

const router = express.Router();

// ---------- Routes: me & reference data ----------

router.get('/me', wrap(async (req, res) => {
    const [prefs, bell] = await Promise.all([pool.query('SELECT prefs FROM setu.agents WHERE id = $1', [req.agent.id]), bellConfig()]);
    res.json({
        success: true, me: req.agent, agentStatuses: AGENT_STATUSES, mailEnabled: MAIL_ENABLED, whatsappEnabled: whatsappReady(),
        prefs: prefs.rows[0]?.prefs ?? {}, bellEvents: bell.events,
    });
}));

/** Bell events this agent muted for themselves (from the ones the Admin switched on). */
router.put('/me/preferences', wrap(async (req, res) => {
    const muted = Array.isArray(req.body?.bellMuted) ? [...new Set(req.body.bellMuted.filter((e) => BELL_EVENTS.includes(e)))] : [];
    await pool.query(`UPDATE setu.agents SET prefs = jsonb_set(prefs, '{bellMuted}', $2::jsonb) WHERE id = $1`, [req.agent.id, JSON.stringify(muted)]);
    res.json({ success: true, prefs: { bellMuted: muted } });
}));

// ---------- In-app bell ----------

router.get('/notifications', wrap(async (req, res) => {
    const [items, unread] = await Promise.all([
        pool.query(
            `SELECT n.id, n."ticketId", n.event, n.title, n.body, n."createdAt", n."readAt" FROM setu.notifications n
             WHERE n."agentId" = $1 ORDER BY n."createdAt" DESC, n.id DESC LIMIT 30`,
            [req.agent.id],
        ),
        pool.query('SELECT count(*)::int AS n FROM setu.notifications WHERE "agentId" = $1 AND "readAt" IS NULL', [req.agent.id]),
    ]);
    res.json({ success: true, items: items.rows, unread: unread.rows[0].n });
}));

/** Body: { ids: number[] } or { all: true }. Only the caller's own notifications. */
router.post('/notifications/read', wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 200) : [];
    if (req.body?.all === true) await pool.query('UPDATE setu.notifications SET "readAt" = now() WHERE "agentId" = $1 AND "readAt" IS NULL', [req.agent.id]);
    else if (ids.length) await pool.query('UPDATE setu.notifications SET "readAt" = now() WHERE "agentId" = $1 AND id = ANY($2::int[]) AND "readAt" IS NULL', [req.agent.id, ids]);
    res.json({ success: true });
}));

// ---------- Personal canned responses (private to the agent) ----------

router.post('/me/canned', wrap(async (req, res) => {
    await saveCanned(req.body ?? {}, req.agent.id);
    res.json({ success: true });
}));

router.delete('/me/canned/:id', wrap(async (req, res) => {
    await deleteCanned(req.params.id, req.agent.id);
    res.json({ success: true });
}));

/** Existing requesters, for logging a ticket on someone's behalf. */
router.get('/contacts/search', wrap(async (req, res) => {
    const term = String(req.query.q || '').trim().slice(0, 100);
    if (term.length < 2) return res.json({ success: true, items: [] });
    const { rows } = await pool.query(
        `SELECT id, name, email, phone, mobile FROM setu.contacts
         WHERE "anonymizedAt" IS NULL AND (email ILIKE $1 OR name ILIKE $1 OR mobile ILIKE $1 OR phone ILIKE $1)
         ORDER BY (email ILIKE $2) DESC, name LIMIT 8`,
        [`%${term.replace(/[%_\\]/g, '\\$&')}%`, `${term.replace(/[%_\\]/g, '\\$&')}%`],
    );
    res.json({ success: true, items: rows });
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
    const [statuses, groups, agents, canned, { fields, tree }, callMode, portalEnabled] = await Promise.all([
        pool.query('SELECT * FROM setu.ticket_statuses ORDER BY position, id'),
        pool.query('SELECT id, name, assignment FROM setu.groups ORDER BY name'),
        pool.query('SELECT id, name, email, role, active, availability FROM setu.agents ORDER BY name'),
        // Shared responses plus the caller's own personal ones - never another agent's.
        pool.query(
            `SELECT id, folder, title, "shortCode", body, "ownerAgentId" FROM setu.canned_responses
             WHERE "ownerAgentId" IS NULL OR "ownerAgentId" = $1 ORDER BY ("ownerAgentId" IS NULL), folder, title`,
            [req.agent.id],
        ),
        loadFields(),
        setting('call.mode'),
        setting('portal.enabled'),
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
        callMode: CALL_MODES.includes(callMode) ? callMode : 'tel',
        callOutcomes: CALL_OUTCOMES,
        portalEnabled: portalEnabled !== false,
    });
}));

router.get('/distributors/lookup', wrap(async (req, res) => {
    const code = String(req.query.code || '').trim();
    if (!code) return res.json({ success: true, distributor: null });
    const { rows } = await pool.query('SELECT * FROM setu.distributors WHERE upper(code) = upper($1) LIMIT 1', [code]);
    res.json({ success: true, distributor: rows[0] ?? null });
}));

module.exports = router;
