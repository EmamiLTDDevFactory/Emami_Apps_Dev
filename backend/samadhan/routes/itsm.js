'use strict';
/*
   ITSM support model routes (migration 7.11-itsm): Admin > Support model (client / vendor / hyperscaler lists, current
   choices, escalation matrix), the ticket's support vendor and escalations, the vendor scorecard, and Admin > Ticket
   migration (template lists, dry run, import). Permissions in middleware/permission.js.
*/
const express = require('express');
const { pool } = require('../db/pool');
const itsm = require('../lib/itsm');
const imp = require('../lib/ticketImport');
const { ESCALATION_SUGGESTIONS, PARTNER_KIND_LABEL } = require('../lib/itsmSeed');
const { audit, fail, logActivity, wrap } = require('../lib/util');

const router = express.Router();
const ticketId = (req) => Number(req.params.id);

// ---------- Admin > Support model ----------
router.get('/admin/support-model', wrap(async (req, res) => {
    const [partners, model, contacts, desks] = await Promise.all([
        itsm.listPartners(), itsm.model(), itsm.listContacts(),
        pool.query('SELECT id, key, name FROM samadhan.workspaces ORDER BY position, id').then((r) => r.rows).catch(() => []),
    ]);
    const open = await pool.query(
        `SELECT t."supportPartnerId" AS id, count(*)::int AS n FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE NOT s."isResolved" AND NOT s."isClosed" AND t."deletedAt" IS NULL AND NOT t.spam GROUP BY 1`).then((r) => r.rows).catch(() => []);
    res.json({ success: true, partners, model, contacts, desks, kinds: PARTNER_KIND_LABEL, suggestions: ESCALATION_SUGGESTIONS, openByVendor: open });
}));

router.put('/admin/support-model', wrap(async (req, res) => {
    const r = await itsm.saveModel(req.body ?? {}, req.agent.id);
    await audit(req.verifiedEmail, 'support_model_saved', { ...r });
    res.json({ success: true, model: r, moved: r.moved });
}));

router.post('/admin/support-partners', wrap(async (req, res) => {
    const id = await itsm.savePartner(req.body ?? {});
    await audit(req.verifiedEmail, 'support_partner_saved', { id, kind: req.body?.kind, name: req.body?.name, active: req.body?.active !== false });
    res.json({ success: true, id });
}));

router.post('/admin/escalation-contacts', wrap(async (req, res) => {
    const id = await itsm.saveContact(req.body ?? {});
    await audit(req.verifiedEmail, 'escalation_contact_saved', { id, level: req.body?.level, email: req.body?.email });
    res.json({ success: true, id });
}));

router.delete('/admin/escalation-contacts/:cid', wrap(async (req, res) => {
    await itsm.deleteContact(req.params.cid);
    await audit(req.verifiedEmail, 'escalation_contact_deleted', { id: Number(req.params.cid) });
    res.json({ success: true });
}));

// ---------- Ticket: support vendor and escalations ----------
router.get('/tickets/:id/escalations', wrap(async (req, res) => {
    res.json({ success: true, items: await itsm.ticketEscalations(ticketId(req)) });
}));

router.post('/tickets/:id/escalate', wrap(async (req, res) => {
    const r = await itsm.escalateManually(ticketId(req), req.body?.reason, req.agent);
    res.json({ success: true, ...r });
}));

router.put('/tickets/:id/support-vendor', wrap(async (req, res) => {
    const id = ticketId(req);
    const raw = req.body?.supportPartnerId;
    const vendorId = raw === null || raw === '' || raw === undefined ? null : Number(raw);
    if (vendorId !== null) {
        const ok = (await pool.query(`SELECT 1 FROM samadhan.support_partners WHERE id = $1 AND kind = 'ITSM_VENDOR'`, [vendorId])).rows.length;
        if (!ok) throw fail(400, 'Pick a support vendor from the list.');
    }
    const before = (await pool.query('SELECT "supportPartnerId" FROM samadhan.tickets WHERE id = $1 AND "deletedAt" IS NULL', [id])).rows[0];
    if (!before) throw fail(404, 'Ticket not found.');
    if (before.supportPartnerId !== vendorId) {
        await pool.query('UPDATE samadhan.tickets SET "supportPartnerId" = $2, "updatedAt" = now() WHERE id = $1', [id, vendorId]);
        await logActivity(id, 'updated', { supportPartnerId: { from: before.supportPartnerId, to: vendorId } }, req.agent.id);
    }
    res.json({ success: true, supportPartnerId: vendorId });
}));

// ---------- Analytics: vendor scorecard ----------
router.get('/analytics/vendors', wrap(async (req, res) => {
    const { scopeSql } = require('../lib/ticketQuery');
    res.json({ success: true, days: Number(req.query.days) || 30, items: await itsm.scorecard(req.query.days, scopeSql(req.scope, req.agent.id)) });
}));

// ---------- Admin > Ticket migration ----------
router.get('/admin/migration/:kind/template', wrap(async (req, res) => {
    if (!imp.KINDS.includes(req.params.kind)) throw fail(404, 'Unknown template.');
    res.json({ success: true, template: await imp.templateInfo(req.params.kind) });
}));

router.post('/admin/migration/:kind/import', wrap(async (req, res) => {
    if (!imp.KINDS.includes(req.params.kind)) throw fail(404, 'Unknown template.');
    const b = req.body ?? {};
    const r = await imp.importTickets({ kind: req.params.kind, rows: b.rows, dryRun: b.dryRun !== false, slaFrom: b.slaFrom === 'logged' ? 'logged' : 'import' }, req.agent);
    if (!r.dryRun) await audit(req.verifiedEmail, 'tickets_migrated', { template: req.params.kind, created: r.created.length, skipped: r.skipped, errors: r.errors.length });
    res.json({ success: true, ...r });
}));

module.exports = router;
