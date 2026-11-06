'use strict';
const express = require('express');
const { pool } = require('../db/pool');
const { AGENT_EMAIL_TEMPLATES, AGENT_STATUSES, BELL_EVENTS, CALL_MODES, CALL_OUTCOMES, MAIL_ENABLED, PRIORITIES, SEVERITIES } = require('../constants');
const { bellConfig } = require('../lib/bell');
const { DEFAULTS, sources, uiOptions } = require('../lib/config');
const { VIEW_IDS, scopeSql } = require('../lib/ticketQuery');
const { deleteCanned, saveCanned } = require('../lib/canned');
const { fail, setting, wrap } = require('../lib/util');
const { whatsappReady } = require('../lib/whatsapp');

const router = express.Router();

// ---------- Routes: me & reference data ----------

router.get('/me', wrap(async (req, res) => {
    const [prefs, bell] = await Promise.all([pool.query('SELECT prefs FROM samadhan.agents WHERE id = $1', [req.agent.id]), bellConfig()]);
    res.json({
        success: true, me: req.agent, agentStatuses: AGENT_STATUSES, mailEnabled: MAIL_ENABLED, whatsappEnabled: whatsappReady(),
        prefs: prefs.rows[0]?.prefs ?? {}, bellEvents: bell.events, bellAudience: bell.audience,
        // v7: effective permission keys and data scope (middleware/permission.js); the frontend's can() reads these.
        permissions: [...req.permissions].sort(), scope: req.scope,
    });
}));

// Dashboard widgets an agent can show, hide and reorder (the default set and order is in Admin > General).
const WIDGETS = DEFAULTS['dashboard.widgets'];

/**
 * The agent's own settings; only the keys sent are changed. bellMuted: bell events to hide; emailMuted: agent email /
 * hub-inbox notifications to skip; listView / pageSize: the ticket list's start view and size; dashboardWidgets: which
 * dashboard widgets to show, in order (null = the Admin default); defaultVariants: { report: <variant id> | null }.
 */
router.put('/me/preferences', wrap(async (req, res) => {
    const b = req.body ?? {};
    const patch = {};
    const pickList = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((e) => allowed.includes(e)))] : []);
    if (b.bellMuted !== undefined) patch.bellMuted = pickList(b.bellMuted, BELL_EVENTS);
    if (b.emailMuted !== undefined) patch.emailMuted = pickList(b.emailMuted, AGENT_EMAIL_TEMPLATES);
    if (b.listView !== undefined) {
        if (b.listView !== null && b.listView !== '' && !VIEW_IDS.includes(b.listView)) throw fail(400, 'Unknown view.');
        patch.listView = b.listView ?? null;
    }
    if (b.pageSize !== undefined) {
        if (b.pageSize !== null && ![25, 50, 100].includes(Number(b.pageSize))) throw fail(400, 'Page size must be 25, 50 or 100.');
        patch.pageSize = b.pageSize === null ? null : Number(b.pageSize);
    }
    if (b.dashboardWidgets !== undefined) patch.dashboardWidgets = b.dashboardWidgets === null ? null : pickList(b.dashboardWidgets, WIDGETS);
    if (b.defaultVariants !== undefined) {
        const report = b.defaultVariants?.report == null ? null : Number(b.defaultVariants.report);
        if (report !== null) {
            const ok = await pool.query('SELECT 1 FROM samadhan.variants WHERE id = $1 AND kind = $2 AND ("ownerAgentId" = $3 OR shared)', [report, 'report', req.agent.id]);
            if (!ok.rows.length) throw fail(404, 'Variant not found.');
        }
        patch.defaultVariants = { report };
    }
    const { rows } = await pool.query('UPDATE samadhan.agents SET prefs = prefs || $2::jsonb WHERE id = $1 RETURNING prefs', [req.agent.id, JSON.stringify(patch)]);
    res.json({ success: true, prefs: rows[0].prefs });
}));

// ---------- In-app bell ----------

/** The agent's bell. Filters: unread=1, events=a,b (comma separated), before=<id> for the next page (30 at a time). */
router.get('/notifications', wrap(async (req, res) => {
    const where = ['n."agentId" = $1'];
    const params = [req.agent.id];
    // v7 data scope: bell entries about tickets outside the person's scope are not shown (nothing changes for scope 'all').
    const scoped = scopeSql(req.scope, req.agent.id);
    const inScope = scoped ? ` AND EXISTS (SELECT 1 FROM samadhan.tickets t WHERE t.id = n."ticketId" AND ${scoped})` : '';
    if (scoped) where.push(inScope.slice(5));
    if (req.query.unread === '1') where.push('n."readAt" IS NULL');
    const events = String(req.query.events || '').split(',').filter((e) => BELL_EVENTS.includes(e));
    if (events.length) { params.push(events); where.push(`n.event = ANY($${params.length}::text[])`); }
    if (Number(req.query.before) > 0) { params.push(Number(req.query.before)); where.push(`n.id < $${params.length}`); }
    const [items, unread, byEvent] = await Promise.all([
        pool.query(
            `SELECT n.id, n."ticketId", n.event, n.title, n.body, n."createdAt", n."readAt" FROM samadhan.notifications n
             WHERE ${where.join(' AND ')} ORDER BY n.id DESC LIMIT 31`,
            params,
        ),
        pool.query(`SELECT count(*)::int AS n FROM samadhan.notifications n WHERE n."agentId" = $1 AND n."readAt" IS NULL${inScope}`, [req.agent.id]),
        pool.query(`SELECT n.event, count(*)::int AS n FROM samadhan.notifications n WHERE n."agentId" = $1 AND n."readAt" IS NULL${inScope} GROUP BY n.event`, [req.agent.id]),
    ]);
    res.json({
        success: true, items: items.rows.slice(0, 30), more: items.rows.length > 30, unread: unread.rows[0].n,
        unreadByEvent: Object.fromEntries(byEvent.rows.map((r) => [r.event, r.n])),
    });
}));

/** Removes the agent's notifications that are already read (the bell keeps 30 days anyway). */
router.post('/notifications/clear', wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM samadhan.notifications WHERE "agentId" = $1 AND "readAt" IS NOT NULL', [req.agent.id]);
    res.json({ success: true, cleared: rowCount });
}));

/** Body: { ids: number[] } or { all: true }. Only the caller's own notifications. */
router.post('/notifications/read', wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 200) : [];
    if (req.body?.all === true) await pool.query('UPDATE samadhan.notifications SET "readAt" = now() WHERE "agentId" = $1 AND "readAt" IS NULL', [req.agent.id]);
    else if (ids.length) await pool.query('UPDATE samadhan.notifications SET "readAt" = now() WHERE "agentId" = $1 AND id = ANY($2::int[]) AND "readAt" IS NULL', [req.agent.id, ids]);
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
        `SELECT id, name, email, phone, mobile FROM samadhan.contacts
         WHERE "anonymizedAt" IS NULL AND (email ILIKE $1 OR name ILIKE $1 OR mobile ILIKE $1 OR phone ILIKE $1)
         ORDER BY (email ILIKE $2) DESC, name LIMIT 8`,
        [`%${term.replace(/[%_\\]/g, '\\$&')}%`, `${term.replace(/[%_\\]/g, '\\$&')}%`],
    );
    res.json({ success: true, items: rows });
}));

router.patch('/me/availability', wrap(async (req, res) => {
    const availability = String(req.body?.availability || '');
    if (!AGENT_STATUSES[availability]) throw fail(400, 'Unknown status.');
    await pool.query('UPDATE samadhan.agents SET availability = $2 WHERE id = $1', [req.agent.id, availability]);
    res.json({ success: true, availability });
}));

async function loadFields() {
    const defs = (await pool.query('SELECT * FROM samadhan.field_definitions ORDER BY position, id')).rows;
    const choices = (await pool.query('SELECT * FROM samadhan.field_choices WHERE active ORDER BY position, id')).rows;
    const fields = defs.map((d) => ({ ...d, choices: choices.filter((c) => c.fieldId === d.id && c.parentId === null).map((c) => c.value) }));
    const category = defs.find((d) => d.key === 'category');
    const tree = category
        ? choices.filter((c) => c.fieldId === category.id && c.parentId === null)
            .map((p) => ({ value: p.value, children: choices.filter((c) => c.parentId === p.id).map((c) => c.value) }))
        : [];
    return { fields, tree };
}

router.get('/meta', wrap(async (req, res) => {
    const [statuses, groups, agents, canned, { fields, tree }, callMode, portalEnabled, scenarios, sourceList, options] = await Promise.all([
        pool.query('SELECT * FROM samadhan.ticket_statuses ORDER BY position, id'),
        pool.query('SELECT id, name, assignment FROM samadhan.groups ORDER BY name'),
        pool.query('SELECT id, name, email, role, active, availability FROM samadhan.agents ORDER BY name'),
        // Shared responses plus the caller's own personal ones - never another agent's.
        pool.query(
            `SELECT id, folder, title, "shortCode", body, "ownerAgentId" FROM samadhan.canned_responses
             WHERE "ownerAgentId" IS NULL OR "ownerAgentId" = $1 ORDER BY ("ownerAgentId" IS NULL), folder, title`,
            [req.agent.id],
        ),
        loadFields(),
        setting('call.mode'),
        setting('portal.enabled'),
        pool.query('SELECT id, name, description FROM samadhan.scenarios ORDER BY position, name'),
        sources(),
        uiOptions(),
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
        sources: sourceList,
        options,
        bellEventList: BELL_EVENTS,
        agentEmailTemplates: AGENT_EMAIL_TEMPLATES,
        agentStatuses: AGENT_STATUSES,
        callMode: CALL_MODES.includes(callMode) ? callMode : 'tel',
        callOutcomes: CALL_OUTCOMES,
        portalEnabled: portalEnabled !== false,
        scenarios: scenarios.rows,
    });
}));

router.get('/distributors/lookup', wrap(async (req, res) => {
    const code = String(req.query.code || '').trim();
    if (!code) return res.json({ success: true, distributor: null });
    const { rows } = await pool.query('SELECT * FROM samadhan.distributors WHERE upper(code) = upper($1) LIMIT 1', [code]);
    res.json({ success: true, distributor: rows[0] ?? null });
}));

module.exports = router;
