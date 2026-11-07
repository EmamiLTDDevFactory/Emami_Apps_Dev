'use strict';
/*
   v7 Phase 6 routes (master prompt §M): transports, change planning and approvals on a ticket; My approvals; the
   change calendar; the service catalogue; registers; Admin CRUD for approval chains, the catalogue and change windows.
   Permission rules live in middleware/permission.js; data scope on /tickets/<id>/... is checked there too.
   The one-click approval link (no sign-in) is in routes/public.js.
*/
const express = require('express');
const { pool } = require('../db/pool');
const { loadTicket } = require('../lib/notify');
const ch = require('../lib/change');
const seed = require('../lib/changeSeed');
const { audit, fail, logActivity, wrap } = require('../lib/util');

const router = express.Router();
const idOf = (req) => Number(req.params.id);

// ---------- transports ----------
router.get('/tickets/:id/transports', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    res.json({ success: true, transports: await ch.listTransports(idOf(req)) });
}));
router.post('/tickets/:id/transports', wrap(async (req, res) => {
    const id = idOf(req);
    await loadTicket(id);
    const tr = await ch.addTransport(id, req.body ?? {}, req.agent);
    await logActivity(id, 'transport_added', { tr: tr.trNumber }, req.agent.id);
    res.status(201).json({ success: true, transport: tr });
}));
router.patch('/tickets/:id/transports/:tid', wrap(async (req, res) => {
    const id = idOf(req);
    await loadTicket(id);
    const before = (await ch.listTransports(id)).find((t) => t.id === Number(req.params.tid));
    const tr = await ch.updateTransport(id, Number(req.params.tid), req.body ?? {}, req.agent, req.can);
    if (before && before.status !== tr.status) await logActivity(id, 'transport_status', { tr: tr.trNumber, from: before.status, to: tr.status }, req.agent.id);
    res.json({ success: true, transport: tr });
}));
router.delete('/tickets/:id/transports/:tid', wrap(async (req, res) => {
    const id = idOf(req);
    await loadTicket(id);
    const gone = await ch.deleteTransport(id, Number(req.params.tid));
    await logActivity(id, 'transport_removed', { tr: gone.trNumber }, req.agent.id);
    res.json({ success: true });
}));

// ---------- change planning ----------
router.get('/tickets/:id/change', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    res.json({ success: true, change: await ch.getChange(idOf(req)) });
}));
router.put('/tickets/:id/change', wrap(async (req, res) => {
    const t = await loadTicket(idOf(req));
    try {
        const r = await ch.saveChange(t, req.body ?? {}, req.agent, req.can);
        if (r.override) await audit(req.verifiedEmail, 'change_freeze_override', { ticketId: t.id, ...r.override });
        res.json({ success: true, change: r.change });
    } catch (e) {
        if (e.freeze) return res.status(409).json({ success: false, error: e.message, freeze: e.freeze });
        throw e;
    }
}));

// ---------- approvals ----------
router.get('/tickets/:id/approvals', wrap(async (req, res) => {
    const t = await loadTicket(idOf(req));
    res.json({ success: true, approvals: await ch.listApprovals(t.id), chains: await ch.listChains(t.workspaceId) });
}));
router.post('/tickets/:id/approvals', wrap(async (req, res) => {
    const t = await loadTicket(idOf(req));
    const approvals = await ch.startApproval(t, Number(req.body?.chainId), { managerEmail: req.body?.managerEmail }, req.agent);
    res.status(201).json({ success: true, approvals });
}));
router.post('/tickets/:id/approvals/:aid/decide', wrap(async (req, res) => {
    const id = idOf(req);
    await loadTicket(id);
    const approvals = await ch.decide(Number(req.params.aid), req.body ?? {}, { agent: req.agent, can: req.can, ticketId: id });
    res.json({ success: true, approvals });
}));
router.delete('/tickets/:id/approvals', wrap(async (req, res) => {
    res.json({ success: true, approvals: await ch.cancelApprovals(idOf(req), req.agent) });
}));
router.get('/approvals/mine', wrap(async (req, res) => {
    res.json({ success: true, items: await ch.approvalsMine(req) });
}));

// ---------- calendar, catalogue, lists ----------
router.get('/change-calendar', wrap(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * 86_400_000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(from.getTime() + 42 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to - from > 400 * 86_400_000) throw fail(400, 'Pick a range of up to 400 days.');
    res.json({ success: true, ...(await ch.calendar(req, from, to)) });
}));
router.get('/catalog', wrap(async (req, res) => {
    const ws = req.query.workspaceId ? Number(req.query.workspaceId) : null;
    res.json({ success: true, items: await ch.listCatalog({ workspaceId: Number.isInteger(ws) ? ws : null }) });
}));

// ---------- registers (§N 8): flat lists for Excel ----------
const REGISTERS = {
    change: {
        title: 'Change & Transport Register',
        sql: `SELECT t.id, ap.code AS "applicationCode", t.subject, t.category, t."function", st.name AS status, d."changeType", d."changeRisk", d."plannedStart", d."plannedEnd",
                     d."transportsNa", ag.name AS agent, t."createdAt", t."resolvedAt",
                     (SELECT string_agg(x."trNumber" || ' (' || x.status || ')', ', ' ORDER BY x.id) FROM samadhan.ticket_transports x WHERE x."ticketId" = t.id) AS transports,
                     (SELECT string_agg(a."stepName" || ': ' || a.state, ', ' ORDER BY a.round, a."stepNo") FROM samadhan.ticket_approvals a WHERE a."ticketId" = t.id) AS approvals`,
        where: `t."recordClass" = 'CHANGE'`,
        join: 'LEFT JOIN samadhan.ticket_change_details d ON d."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['subject', 'Subject'], ['category', 'Category'], ['function', 'Sub-category'], ['status', 'Status'], ['changeType', 'Change type'],
            ['changeRisk', 'Risk'], ['plannedStart', 'Planned start'], ['plannedEnd', 'Planned end'], ['transports', 'Transports'], ['transportsNa', 'Transports N/A'],
            ['approvals', 'Approvals'], ['agent', 'Agent'], ['createdAt', 'Created'], ['resolvedAt', 'Resolved']],
    },
    access: {
        title: 'Access Request Log',
        sql: `SELECT t.id, ap.code AS "applicationCode", t.subject, co.name AS requester, co.email AS "requesterEmail", st.name AS status, d."accessValidTo", ag.name AS agent,
                     t."createdAt", t."resolvedAt",
                     (SELECT string_agg(a."stepName" || ': ' || a.state || COALESCE(' by ' || a."decidedBy", ''), ', ' ORDER BY a.round, a."stepNo") FROM samadhan.ticket_approvals a WHERE a."ticketId" = t.id) AS approvals`,
        where: `t."recordClass" = 'ACCESS_REQUEST'`,
        join: 'LEFT JOIN samadhan.ticket_change_details d ON d."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['subject', 'Subject'], ['requester', 'Requester'], ['requesterEmail', 'Requester email'], ['status', 'Status'], ['approvals', 'Approvals'],
            ['accessValidTo', 'Valid until'], ['agent', 'Agent'], ['createdAt', 'Created'], ['resolvedAt', 'Resolved']],
    },
    sap: {
        title: 'SAP Incident Register',
        sql: `SELECT t.id, ap.code AS "applicationCode", t.subject, t.category, t."function", st.name AS status, t.priority, sd."sapSystem", sd."sapClient", sd.environment, sd.tcode,
                     sd."errorMessageClass", sd."errorMessageNo", t."rootCauseCategory", t."resolutionCode", ag.name AS agent, t."createdAt", t."resolvedAt",
                     (SELECT string_agg(x.system || ' ' || x.ref, ', ') FROM samadhan.ticket_external_refs x WHERE x."ticketId" = t.id) AS "externalRefs"`,
        where: `w.key = 'SAP' AND COALESCE(t."recordClass", 'INCIDENT') = 'INCIDENT'`,
        join: 'LEFT JOIN samadhan.ticket_sap_details sd ON sd."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['subject', 'Subject'], ['category', 'Module'], ['function', 'Sub-process'], ['status', 'Status'], ['priority', 'Priority'],
            ['sapSystem', 'System'], ['sapClient', 'Client'], ['environment', 'Environment'], ['tcode', 'T-code'], ['errorMessageClass', 'Msg class'], ['errorMessageNo', 'Msg no.'],
            ['externalRefs', 'External refs'], ['rootCauseCategory', 'Root cause'], ['resolutionCode', 'Resolution code'], ['agent', 'Agent'], ['createdAt', 'Created'], ['resolvedAt', 'Resolved']],
    },
    infra: {
        title: 'Infra & IT Register',
        sql: `SELECT t.id, ap.code AS "applicationCode", t.subject, t.category, t."function", st.name AS status, t.priority, i."serverName", i."assetTag", i."siteLocation", i.environment,
                     t."resolutionCode", ag.name AS agent, t."createdAt", t."resolvedAt"`,
        where: `w.key = 'INFRA_IT'`,
        join: 'LEFT JOIN samadhan.ticket_it_details i ON i."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['subject', 'Subject'], ['category', 'Category'], ['function', 'Sub-category'], ['status', 'Status'], ['priority', 'Priority'],
            ['serverName', 'Server'], ['assetTag', 'Asset tag'], ['siteLocation', 'Site'], ['environment', 'Environment'], ['resolutionCode', 'Resolution code'], ['agent', 'Agent'],
            ['createdAt', 'Created'], ['resolvedAt', 'Resolved']],
    },
    digital: {
        title: 'Digital Apps Register',
        sql: `SELECT t.id, ap.code AS "applicationCode", ap.name AS application, t.subject, t.category, t."function", st.name AS status, t.priority, i.layer, i.environment, i."httpStatus",
                     i."correlationId", t."resolutionCode", ag.name AS agent, t."createdAt", t."resolvedAt"`,
        where: `w.key = 'DIGITAL_APPS'`,
        join: 'LEFT JOIN samadhan.ticket_it_details i ON i."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['application', 'Application'], ['subject', 'Subject'], ['category', 'Category'], ['function', 'Sub-category'], ['status', 'Status'],
            ['priority', 'Priority'], ['layer', 'Layer'], ['environment', 'Environment'], ['httpStatus', 'HTTP'], ['correlationId', 'Correlation id'], ['resolutionCode', 'Resolution code'],
            ['agent', 'Agent'], ['createdAt', 'Created'], ['resolvedAt', 'Resolved']],
    },
    problem: {
        title: 'Problem / KEDB Register',
        sql: `SELECT t.id, ap.code AS "applicationCode", ap.name AS application, t.subject, t.category, t."function", st.name AS status, pd.status AS "problemStatus",
                     pd."knownError", pd.symptom, pd.workaround, pd."rootCause", pd."permanentFix", ag.name AS agent, t."createdAt", t."resolvedAt",
                     (SELECT count(*)::int FROM samadhan.tickets i WHERE i."problemId" = t.id) AS incidents`,
        where: `t."recordClass" = 'PROBLEM'`,
        join: 'LEFT JOIN samadhan.problem_details pd ON pd."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['application', 'Application'], ['subject', 'Subject'], ['problemStatus', 'Problem status'], ['knownError', 'Known error'],
            ['incidents', 'Incidents'], ['symptom', 'Symptom'], ['workaround', 'Workaround'], ['rootCause', 'Root cause'], ['permanentFix', 'Permanent fix'],
            ['status', 'Ticket status'], ['agent', 'Agent'], ['createdAt', 'Created'], ['resolvedAt', 'Resolved']],
    },
    major: {
        title: 'Major Incident Register',
        sql: `SELECT t.id, ap.code AS "applicationCode", t.subject, st.name AS status, t."majorDeclaredAt", t."resolvedAt", pir.summary, pir."rootCause", pir."rootCauseCategory",
                     pir."reviewedBy", pir."reviewedAt", ag.name AS agent,
                     round(EXTRACT(EPOCH FROM (COALESCE(t."resolvedAt", now()) - t."majorDeclaredAt")) / 60)::int AS "minutesOpen"`,
        where: 't."majorDeclaredAt" IS NOT NULL',
        join: 'LEFT JOIN samadhan.post_incident_reviews pir ON pir."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['subject', 'Subject'], ['status', 'Status'], ['majorDeclaredAt', 'Declared'], ['resolvedAt', 'Resolved'], ['minutesOpen', 'Minutes'],
            ['summary', 'PIR summary'], ['rootCauseCategory', 'Root cause category'], ['rootCause', 'Root cause'], ['reviewedBy', 'Reviewed by'], ['reviewedAt', 'Reviewed'], ['agent', 'Agent']],
    },
    defects: {
        title: 'S/4 Defect Tracker',
        sql: `SELECT t.id, ap.code AS "applicationCode", t.subject, t.type, pd."processArea", t.category, t."function", pd."testCycle", pd."defectSeverity", pd."testCaseId",
                     pd."retestStatus", pd."retestBy", pd."retestAt", st.name AS status, ag.name AS agent, t."createdAt", t."resolvedAt", t."resolutionDueAt"`,
        where: `w.key = 'S4_PROGRAM' AND t."recordClass" = 'DEFECT'`,
        join: 'LEFT JOIN samadhan.ticket_program_details pd ON pd."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['subject', 'Subject'], ['type', 'Type'], ['category', 'Process area'], ['function', 'Sub-process'], ['testCycle', 'Test cycle'],
            ['defectSeverity', 'Severity'], ['testCaseId', 'Test case'], ['status', 'Status'], ['retestStatus', 'Retest'], ['retestBy', 'Retest by'], ['agent', 'Agent'],
            ['createdAt', 'Found'], ['resolutionDueAt', 'Due'], ['resolvedAt', 'Fixed']],
    },
    hypercare: {
        title: 'Hypercare Daily',
        sql: `SELECT t.id, ap.code AS "applicationCode", t.subject, t.type, t.category, t.priority, st.name AS status, pd."activatePhase", pd."testCycle", ag.name AS agent,
                     t."createdAt", t."resolvedAt"`,
        where: `w.key = 'S4_PROGRAM' AND (pd."activatePhase" = 'Hypercare' OR pd."testCycle" = 'Hypercare' OR t.type = 'Hypercare Incident')`,
        join: 'LEFT JOIN samadhan.ticket_program_details pd ON pd."ticketId" = t.id',
        columns: [['ref', 'Reference'], ['subject', 'Subject'], ['type', 'Type'], ['category', 'Process area'], ['priority', 'Priority'], ['status', 'Status'],
            ['agent', 'Agent'], ['createdAt', 'Raised'], ['resolvedAt', 'Resolved']],
    },
    sales: {
        title: 'Sales Apps Register',
        sql: `SELECT t.id, ap.code AS "applicationCode", ap.name AS application, ap.vendor, t.subject, t.category, t."function", st.name AS status, t.priority, t."distributorCode",
                     t."distributorName", t.region, ag.name AS agent, t."createdAt", t."resolvedAt"`,
        where: `w.key = 'SEC_SALES'`,
        join: '',
        columns: [['ref', 'Reference'], ['application', 'Application'], ['vendor', 'Vendor'], ['subject', 'Subject'], ['category', 'Category'], ['function', 'Function'],
            ['status', 'Status'], ['priority', 'Priority'], ['distributorCode', 'DB code'], ['distributorName', 'Distributor'], ['region', 'Region'], ['agent', 'Agent'],
            ['createdAt', 'Created'], ['resolvedAt', 'Resolved']],
    },
};
router.get('/registers', wrap(async (req, res) => {
    res.json({ success: true, registers: Object.entries(REGISTERS).map(([key, r]) => ({ key, title: r.title })) });
}));
router.get('/registers/:kind', wrap(async (req, res) => {
    const r = REGISTERS[req.params.kind];
    if (!r) throw fail(404, 'Unknown register.');
    const { scopeSql } = require('../lib/ticketQuery');
    const s = scopeSql(req.scope, req.agent.id);
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 90 * 86_400_000);
    const to = req.query.to ? new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999+05:30`) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw fail(400, 'Invalid dates.');
    const params = [from, to];
    const app = req.query.applicationId ? Number(req.query.applicationId) : null;
    if (app) params.push(app);
    try {
        const { rows } = await pool.query(
            `${r.sql}
             FROM samadhan.tickets t JOIN samadhan.ticket_statuses st ON st.id = t."statusId" LEFT JOIN samadhan.contacts co ON co.id = t."requesterId"
             LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId" LEFT JOIN samadhan.workspaces w ON w.id = t."workspaceId" LEFT JOIN samadhan.agents ag ON ag.id = t."agentId"
             ${r.join}
             WHERE ${r.where} AND t."deletedAt" IS NULL AND NOT t.spam AND t."createdAt" BETWEEN $1 AND $2 ${app ? 'AND t."applicationId" = $3' : ''} ${s ? `AND ${s}` : ''}
             ORDER BY t."createdAt" DESC LIMIT 5000`, params);
        res.json({ success: true, title: r.title, columns: r.columns, rows: rows.map((x) => ({ ...x, ref: x.applicationCode ? `${x.applicationCode}-${x.id}` : String(x.id) })) });
    } catch (e) {
        if (e.code === '42P01' || e.code === '42703') return res.json({ success: true, title: r.title, columns: r.columns, rows: [] });
        throw e;
    }
}));

// ---------- Admin: approval chains, catalogue, change windows ----------
const STEP_TYPES = ['manager', 'email', 'agent', 'approver'];
function cleanSteps(steps) {
    if (!Array.isArray(steps) || !steps.length || steps.length > 8) throw fail(400, 'A chain needs 1 to 8 steps.');
    return steps.map((s, i) => {
        const type = STEP_TYPES.includes(s?.type) ? s.type : null;
        if (!type) throw fail(400, `Step ${i + 1}: type is one of ${STEP_TYPES.join(', ')}.`);
        const name = String(s.name || '').trim().slice(0, 120);
        if (!name) throw fail(400, `Step ${i + 1} needs a name.`);
        const email = String(s.email || '').trim().toLowerCase();
        if ((type === 'email' || type === 'agent') && !/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email)) throw fail(400, `Step ${i + 1}: an approver email is needed.`);
        return { name, type, ...(email && (type === 'email' || type === 'agent') ? { email } : {}) };
    });
}
router.get('/admin/approval-chains', wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT c.*, (SELECT count(*)::int FROM samadhan.ticket_approvals a WHERE a."chainId" = c.id) AS used FROM samadhan.approval_chains c ORDER BY c."workspaceId" NULLS FIRST, c.name`);
    res.json({ success: true, chains: rows });
}));
router.post('/admin/approval-chains', wrap(async (req, res) => {
    const b = req.body ?? {};
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name) throw fail(400, 'Name the chain.');
    const steps = cleanSteps(b.steps);
    const ws = b.workspaceId ? Number(b.workspaceId) : null;
    const values = [name, ws, JSON.stringify(steps), JSON.stringify(b.appliesTo && typeof b.appliesTo === 'object' ? b.appliesTo : {}), b.active !== false];
    const row = b.id
        ? (await pool.query('UPDATE samadhan.approval_chains SET name = $2, "workspaceId" = $3, steps = $4, "appliesTo" = $5, active = $6 WHERE id = $1 RETURNING *', [Number(b.id), ...values])).rows[0]
        : (await pool.query('INSERT INTO samadhan.approval_chains (name, "workspaceId", steps, "appliesTo", active) VALUES ($1, $2, $3, $4, $5) RETURNING *', values)).rows[0];
    if (!row) throw fail(404, 'Not found.');
    await audit(req.verifiedEmail, 'approval_chain_saved', { id: row.id, name });
    res.json({ success: true, chain: row });
}));
router.delete('/admin/approval-chains/:cid', wrap(async (req, res) => {
    const used = await pool.query('SELECT 1 FROM samadhan.ticket_approvals WHERE "chainId" = $1 LIMIT 1', [Number(req.params.cid)]);
    if (used.rows.length) {
        await pool.query('UPDATE samadhan.approval_chains SET active = false WHERE id = $1', [Number(req.params.cid)]);
        return res.json({ success: true, deactivated: true });
    }
    await pool.query('UPDATE samadhan.service_catalog_items SET "approvalChainId" = NULL WHERE "approvalChainId" = $1', [Number(req.params.cid)]);
    await pool.query('DELETE FROM samadhan.approval_chains WHERE id = $1', [Number(req.params.cid)]);
    await audit(req.verifiedEmail, 'approval_chain_deleted', { id: Number(req.params.cid) });
    res.json({ success: true });
}));

const FORM_TYPES = ['text', 'textarea', 'date', 'select', 'checkbox'];
router.get('/admin/catalog', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM samadhan.service_catalog_items ORDER BY "workspaceId", position, name');
    res.json({ success: true, items: rows });
}));
router.post('/admin/catalog', wrap(async (req, res) => {
    const b = req.body ?? {};
    const name = String(b.name || '').trim().slice(0, 160);
    const ws = Number(b.workspaceId);
    if (!name || !Number.isInteger(ws)) throw fail(400, 'An item needs a name and a service desk.');
    const { RECORD_CLASSES } = require('../lib/workspaceSeed');
    const rc = RECORD_CLASSES.includes(b.recordClass) ? b.recordClass : 'SERVICE_REQUEST';
    const form = (Array.isArray(b.formSchema) ? b.formSchema : []).slice(0, 20).map((f) => ({
        label: String(f?.label || '').trim().slice(0, 120), type: FORM_TYPES.includes(f?.type) ? f.type : 'text', required: f?.required === true,
        ...(f?.type === 'select' ? { options: (Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map((o) => String(o).trim()).filter(Boolean).slice(0, 30) } : {}),
    })).filter((f) => f.label);
    const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
    const values = [name, ws, num(b.applicationId), String(b.description || '').slice(0, 1000) || null, String(b.icon || '').slice(0, 40) || null, rc,
        String(b.category || '').slice(0, 200) || null, String(b.function || '').slice(0, 200) || null, JSON.stringify(form), num(b.approvalChainId), num(b.fulfilGroupId),
        b.portalVisible === true, b.active !== false, Number.isInteger(b.position) ? b.position : 100];
    const cols = '"name", "workspaceId", "applicationId", description, icon, "recordClass", category, "function", "formSchema", "approvalChainId", "fulfilGroupId", "portalVisible", active, position';
    const row = b.id
        ? (await pool.query(`UPDATE samadhan.service_catalog_items SET (${cols}) = ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) WHERE id = $1 RETURNING *`, [Number(b.id), ...values])).rows[0]
        : (await pool.query(`INSERT INTO samadhan.service_catalog_items (${cols}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`, values)).rows[0];
    if (!row) throw fail(404, 'Not found.');
    await audit(req.verifiedEmail, 'catalog_item_saved', { id: row.id, name });
    res.json({ success: true, item: row });
}));
router.delete('/admin/catalog/:iid', wrap(async (req, res) => {
    await pool.query('UPDATE samadhan.service_catalog_items SET active = false WHERE id = $1', [Number(req.params.iid)]);
    await audit(req.verifiedEmail, 'catalog_item_deactivated', { id: Number(req.params.iid) });
    res.json({ success: true });
}));

router.get('/admin/change-windows', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM samadhan.change_windows ORDER BY "startsAt" DESC LIMIT 500');
    res.json({ success: true, windows: rows });
}));
router.post('/admin/change-windows', wrap(async (req, res) => {
    const b = req.body ?? {};
    const name = String(b.name || '').trim().slice(0, 160);
    const kind = seed.WINDOW_KINDS.includes(b.kind) ? b.kind : null;
    const s = new Date(b.startsAt);
    const e = new Date(b.endsAt);
    if (!name || !kind) throw fail(400, 'A window needs a name and a kind (FREEZE or MAINTENANCE).');
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) throw fail(400, 'The window must end after it starts.');
    const systems = (Array.isArray(b.systems) ? b.systems : String(b.systems || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
    const values = [kind, name, b.workspaceId ? Number(b.workspaceId) : null, s, e, systems, String(b.note || '').slice(0, 1000) || null];
    const row = b.id
        ? (await pool.query('UPDATE samadhan.change_windows SET kind = $2, name = $3, "workspaceId" = $4, "startsAt" = $5, "endsAt" = $6, systems = $7, note = $8 WHERE id = $1 RETURNING *', [Number(b.id), ...values])).rows[0]
        : (await pool.query('INSERT INTO samadhan.change_windows (kind, name, "workspaceId", "startsAt", "endsAt", systems, note) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', values)).rows[0];
    if (!row) throw fail(404, 'Not found.');
    await audit(req.verifiedEmail, 'change_window_saved', { id: row.id, name, kind });
    res.json({ success: true, window: row });
}));
router.delete('/admin/change-windows/:wid', wrap(async (req, res) => {
    await pool.query('DELETE FROM samadhan.change_windows WHERE id = $1', [Number(req.params.wid)]);
    await audit(req.verifiedEmail, 'change_window_deleted', { id: Number(req.params.wid) });
    res.json({ success: true });
}));

module.exports = router;
