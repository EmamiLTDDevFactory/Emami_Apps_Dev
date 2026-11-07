'use strict';
/*
   v7 Phase 3 Admin API (master prompt §M "/admin/* CRUD for workspaces, applications, the priority matrix, mail
   classification rules"). Mounted at /admin after routes/admin.js (which already refuses non-Admins); each route also
   has its own permission rule (middleware/permission.js: admin.workspaces / admin.applications / admin.channels).
   Every change is written to the audit log and clears the catalog cache.
*/
const express = require('express');
const { pool } = require('../db/pool');
const { clearConfigCache, option } = require('../lib/config');
const { clearSlaCache } = require('../lib/sla');
const { clearSeverityCache } = require('../lib/severity');
const { aliasSuggestions, catalog, clearCatalogCache } = require('../lib/workspaces');
const { audit, fail, intOrNull, wrap } = require('../lib/util');

const router = express.Router();

const text = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const bool = (v) => v === true;
const MODES = ['SEVERITY_MATRIX', 'IMPACT_URGENCY', 'BOTH'];
const changed = () => { clearCatalogCache(); clearSlaCache(); clearSeverityCache(); };
async function ready() {
    const c = await catalog();
    if (!c.ready) throw fail(400, 'Workspaces are not set up on this database yet (migration 7.2-workspaces).');
    return c;
}
async function saveSetting(key, value) {
    await pool.query('INSERT INTO samadhan.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
    clearConfigCache();
}
const list = (v, max = 40) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => text(x, 80).toLowerCase()).filter(Boolean).slice(0, max);

// Everything the Admin screens need in one call.
router.get('/workspaces', wrap(async (req, res) => {
    const c = await ready();
    const used = (await pool.query('SELECT DISTINCT "applicationId" AS id FROM samadhan.tickets')).rows.map((r) => r.id);
    const counts = Object.fromEntries((await pool.query('SELECT "applicationId" AS id, count(*)::int AS n FROM samadhan.tickets WHERE "deletedAt" IS NULL GROUP BY 1')).rows.map((r) => [r.id, r.n]));
    res.json({
        success: true,
        enabled: (await option('workspaces.enabled')) === true,
        workspaces: c.workspaces,
        applications: c.applications.map((a) => ({ ...a, used: used.includes(a.id), tickets: counts[a.id] ?? 0 })),
        matrix: c.matrix,
    });
}));

// The multi-desk switch: off = Secondary Sales only and the UI as before.
router.put('/workspaces/flag', wrap(async (req, res) => {
    await ready();
    const enabled = bool(req.body?.enabled);
    await saveSetting('workspaces.enabled', enabled);
    changed();
    await audit(req.verifiedEmail, 'workspaces_flag', { enabled });
    res.json({ success: true, enabled });
}));

router.put('/workspaces/:id', wrap(async (req, res) => {
    const c = await ready();
    const id = Number(req.params.id);
    const before = c.wsById.get(id);
    if (!before) throw fail(404, 'Workspace not found.');
    const b = req.body ?? {};
    const name = text(b.name, 80) || before.name;
    const priorityMode = b.priorityMode === undefined ? before.priorityMode : b.priorityMode;
    if (!MODES.includes(priorityMode)) throw fail(400, 'Priority mode must be SEVERITY_MATRIX, IMPACT_URGENCY or BOTH.');
    // Secondary Sales is today's helpdesk: it cannot be switched off.
    const enabled = before.key === 'SEC_SALES' ? true : (b.enabled === undefined ? before.enabled : bool(b.enabled));
    const groupId = b.defaultGroupId === undefined ? before.defaultGroupId : intOrNull(b.defaultGroupId);
    const slaId = b.defaultSlaPolicyId === undefined ? before.defaultSlaPolicyId : intOrNull(b.defaultSlaPolicyId);
    if (Number.isNaN(groupId) || Number.isNaN(slaId)) throw fail(400, 'Invalid default group or SLA policy.');
    const { rows } = await pool.query(
        `UPDATE samadhan.workspaces SET name = $2, "shortCode" = $3, icon = $4, color = $5, description = $6, enabled = $7, "portalEnabled" = $8,
             position = $9, "priorityMode" = $10, "categoryLabel" = $11, "functionLabel" = $12, "defaultGroupId" = $13, "defaultSlaPolicyId" = $14, "updatedAt" = now()
         WHERE id = $1 RETURNING *`,
        [id, name, text(b.shortCode, 8) || before.shortCode, b.icon === undefined ? before.icon : text(b.icon, 40) || null, b.color === undefined ? before.color : text(b.color, 20) || null,
            b.description === undefined ? before.description : text(b.description, 500) || null, enabled,
            b.portalEnabled === undefined ? before.portalEnabled : bool(b.portalEnabled), Number.isInteger(b.position) ? b.position : before.position,
            priorityMode, text(b.categoryLabel, 40) || before.categoryLabel, text(b.functionLabel, 40) || before.functionLabel, groupId, slaId],
    );
    changed();
    await audit(req.verifiedEmail, 'workspace_saved', { key: before.key, before, after: rows[0] });
    res.json({ success: true, workspace: rows[0] });
}));

router.put('/workspaces/:id/matrix', wrap(async (req, res) => {
    const c = await ready();
    const id = Number(req.params.id);
    if (!c.wsById.get(id)) throw fail(404, 'Workspace not found.');
    const cells = Array.isArray(req.body?.cells) ? req.body.cells : [];
    const ok = (n) => Number.isInteger(n) && n >= 1 && n <= 4;
    if (cells.length !== 16 || cells.some((x) => !ok(x.impact) || !ok(x.urgency) || !ok(x.priority))) throw fail(400, 'Send all 16 cells (impact, urgency and priority 1-4).');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM samadhan.priority_matrix WHERE "workspaceId" = $1', [id]);
        for (const x of cells) await client.query('INSERT INTO samadhan.priority_matrix ("workspaceId", impact, urgency, priority) VALUES ($1, $2, $3, $4)', [id, x.impact, x.urgency, x.priority]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
    changed();
    await audit(req.verifiedEmail, 'priority_matrix_saved', { workspaceId: id, cells });
    res.json({ success: true });
}));

/** Create (POST) or change (PUT) an application. The code is fixed once a ticket uses it. */
async function saveApplication(req, res, id) {
    const c = await ready();
    const b = req.body ?? {};
    const before = id ? c.byId.get(id) : null;
    if (id && !before) throw fail(404, 'Application not found.');
    const code = text(b.code ?? before?.code, 8).toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(code)) throw fail(400, 'Code: 2-8 capital letters or digits.');
    if (before && code !== before.code) {
        const used = await pool.query('SELECT 1 FROM samadhan.tickets WHERE "applicationId" = $1 LIMIT 1', [id]);
        if (used.rows.length) throw fail(400, `The code ${before.code} is already used on tickets and cannot change.`);
    }
    const workspaceId = b.workspaceId === undefined ? before?.workspaceId : intOrNull(b.workspaceId);
    if (!c.wsById.get(workspaceId)) throw fail(400, 'Choose a workspace.');
    if (before && workspaceId !== before.workspaceId && (await pool.query('SELECT 1 FROM samadhan.tickets WHERE "applicationId" = $1 LIMIT 1', [id])).rows.length) {
        throw fail(400, 'This application has tickets - create a new application in the other workspace instead of moving it.');
    }
    const name = text(b.name ?? before?.name, 120);
    if (!name) throw fail(400, 'Give the application a name.');
    const pick = (k, fn) => (b[k] === undefined ? before?.[k] ?? null : fn(b[k]));
    const intRef = (v) => { const n = intOrNull(v); if (Number.isNaN(n)) throw fail(400, 'Invalid reference.'); return n; };
    const values = [code, name, workspaceId, pick('description', (v) => text(v, 500) || null), pick('icon', (v) => text(v, 40) || null),
        b.aliases === undefined ? before?.aliases ?? [] : list(b.aliases), pick('criticality', (v) => text(v, 20) || null), pick('businessOwner', (v) => text(v, 120) || null),
        pick('itOwnerAgentId', intRef), pick('supportGroupId', intRef), pick('defaultSlaPolicyId', intRef),
        b.portalVisible === undefined ? before?.portalVisible ?? true : bool(b.portalVisible), b.active === undefined ? before?.active ?? true : bool(b.active),
        Number.isInteger(b.position) ? b.position : before?.position ?? 100];
    let row;
    try {
        row = before
            ? (await pool.query(`UPDATE samadhan.applications SET code = $2, name = $3, "workspaceId" = $4, description = $5, icon = $6, aliases = $7, criticality = $8,
                  "businessOwner" = $9, "itOwnerAgentId" = $10, "supportGroupId" = $11, "defaultSlaPolicyId" = $12, "portalVisible" = $13, active = $14, position = $15,
                  "updatedAt" = now() WHERE id = $1 RETURNING *`, [id, ...values])).rows[0]
            : (await pool.query(`INSERT INTO samadhan.applications (code, name, "workspaceId", description, icon, aliases, criticality, "businessOwner", "itOwnerAgentId",
                  "supportGroupId", "defaultSlaPolicyId", "portalVisible", active, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`, values)).rows[0];
    } catch (e) {
        if (e.code === '23505') throw fail(400, `The code ${code} is already taken.`);
        if (e.code === '23503') throw fail(400, 'The owner, group or SLA policy does not exist.');
        throw e;
    }
    changed();
    await audit(req.verifiedEmail, before ? 'application_saved' : 'application_created', { code, before: before ?? null, after: row });
    res.json({ success: true, application: row });
}
router.post('/applications', wrap((req, res) => saveApplication(req, res, null)));
router.put('/applications/:id', wrap((req, res) => saveApplication(req, res, Number(req.params.id))));

// Accept a suggested keyword as an alias (suggestions are never applied automatically, §J).
router.post('/applications/:id/aliases', wrap(async (req, res) => {
    const c = await ready();
    const app = c.byId.get(Number(req.params.id));
    if (!app) throw fail(404, 'Application not found.');
    const alias = text(req.body?.alias, 80).toLowerCase();
    if (!alias) throw fail(400, 'Give the keyword.');
    await pool.query('UPDATE samadhan.applications SET aliases = array_append(aliases, $2), "updatedAt" = now() WHERE id = $1 AND NOT ($2 = ANY(aliases))', [app.id, alias]);
    changed();
    await audit(req.verifiedEmail, 'application_alias_added', { code: app.code, alias });
    res.json({ success: true });
}));

// ---------- Mail classification (§J): settings, sender rules, learning suggestions ----------
router.get('/mail-classification', wrap(async (req, res) => {
    await ready();
    const rules = (await pool.query(
        `SELECT r.*, a.code, a.name AS "applicationName" FROM samadhan.mail_sender_rules r JOIN samadhan.applications a ON a.id = r."applicationId" ORDER BY r.kind, r.pattern`)).rows;
    res.json({
        success: true,
        settings: { ai: false, threshold: 0.8, defaultCode: 'SS', ...((await option('mail.classification')) || {}) },
        prefixInSubject: (await option('ref.prefixInSubject')) !== false,
        rules,
        suggestions: await aliasSuggestions(),
        aiAvailable: require('../lib/ai').aiEnabled(),
    });
}));

router.put('/mail-classification', wrap(async (req, res) => {
    const c = await ready();
    const b = req.body ?? {};
    const threshold = Number(b.threshold ?? 0.8);
    if (!(threshold >= 0.5 && threshold <= 1)) throw fail(400, 'The AI threshold must be between 0.5 and 1.');
    const defaultCode = text(b.defaultCode || 'SS', 8).toUpperCase();
    const app = c.byCode.get(defaultCode);
    if (!app || !app.active || app.workspaceKey !== 'SEC_SALES') throw fail(400, 'The default application must be an active Secondary Sales application.');
    const value = { ai: bool(b.ai), threshold, defaultCode };
    await saveSetting('mail.classification', value);
    if (b.prefixInSubject !== undefined) await saveSetting('ref.prefixInSubject', bool(b.prefixInSubject));
    await audit(req.verifiedEmail, 'mail_classification_saved', { ...value, prefixInSubject: b.prefixInSubject });
    res.json({ success: true, settings: value });
}));

router.post('/mail-rules', wrap(async (req, res) => {
    const c = await ready();
    const b = req.body ?? {};
    const kind = b.kind === 'email' ? 'email' : b.kind === 'domain' ? 'domain' : null;
    const pattern = text(b.pattern, 200).toLowerCase().replace(/^@/, '');
    if (!kind) throw fail(400, 'Kind is "email" or "domain".');
    if (kind === 'email' ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pattern) : !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(pattern)) throw fail(400, kind === 'email' ? 'Give a valid email address.' : 'Give a domain such as emamigroup.com.');
    const app = c.byId.get(intOrNull(b.applicationId));
    if (!app || !app.active) throw fail(400, 'Choose an active application.');
    try {
        const { rows } = await pool.query(
            'INSERT INTO samadhan.mail_sender_rules (kind, pattern, "applicationId", note, "createdBy") VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [kind, pattern, app.id, text(b.note, 200) || null, req.verifiedEmail]);
        await audit(req.verifiedEmail, 'mail_rule_added', { kind, pattern, application: app.code });
        res.json({ success: true, rule: rows[0] });
    } catch (e) {
        if (e.code === '23505') throw fail(400, 'There is already a rule for that sender.');
        throw e;
    }
}));

router.delete('/mail-rules/:id', wrap(async (req, res) => {
    await ready();
    const { rows } = await pool.query('DELETE FROM samadhan.mail_sender_rules WHERE id = $1 RETURNING kind, pattern', [Number(req.params.id)]);
    if (!rows.length) throw fail(404, 'Rule not found.');
    await audit(req.verifiedEmail, 'mail_rule_deleted', rows[0]);
    res.json({ success: true });
}));

module.exports = router;
