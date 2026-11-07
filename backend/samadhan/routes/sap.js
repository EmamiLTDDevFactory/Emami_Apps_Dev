'use strict';
/*
   v7 Phase 4 routes (master prompt §M): SAP details and external references on a ticket, reference-master typeahead,
   and the Admin reference masters (Excel import). Permission rules live in middleware/permission.js; data scope on
   /tickets/<id>/... is checked there too (a ticket outside the scope answers 404).
*/
const express = require('express');
const { pool } = require('../db/pool');
const { loadTicket } = require('../lib/notify');
const sap = require('../lib/sap');
const { audit, fail, logActivity, wrap } = require('../lib/util');

const router = express.Router();
const idOf = (req) => Number(req.params.id);

router.get('/tickets/:id/sap', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    res.json({ success: true, sap: await sap.getSap(idOf(req)) });
}));

router.put('/tickets/:id/sap', wrap(async (req, res) => {
    const id = idOf(req);
    await loadTicket(id);
    const before = await sap.getSap(id);
    const after = await sap.saveSap(id, req.body ?? {});
    const changed = Object.keys(sap.cleanSap(req.body ?? {})).filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
    if (changed.length) await logActivity(id, 'sap_details_updated', { fields: changed }, req.agent.id);
    res.json({ success: true, sap: after });
}));

router.get('/tickets/:id/external-refs', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    res.json({ success: true, refs: await sap.listRefs(idOf(req)) });
}));

router.post('/tickets/:id/external-refs', wrap(async (req, res) => {
    const id = idOf(req);
    await loadTicket(id);
    const ref = await sap.addRef(id, req.body ?? {}, req.agent.id);
    await logActivity(id, 'external_ref_added', { system: ref.system, ref: ref.ref }, req.agent.id);
    res.status(201).json({ success: true, ref });
}));

router.patch('/tickets/:id/external-refs/:rid', wrap(async (req, res) => {
    const id = idOf(req);
    const ref = await sap.updateRef(id, Number(req.params.rid), req.body ?? {});
    await logActivity(id, 'external_ref_updated', { system: ref.system, ref: ref.ref, status: ref.status }, req.agent.id);
    res.json({ success: true, ref });
}));

router.delete('/tickets/:id/external-refs/:rid', wrap(async (req, res) => {
    const id = idOf(req);
    await sap.deleteRef(id, Number(req.params.rid));
    await logActivity(id, 'external_ref_removed', { id: Number(req.params.rid) }, req.agent.id);
    res.json({ success: true });
}));

// Typeahead for agents (systems, clients, T-codes, Fiori apps, servers ...).
router.get('/ref-masters', wrap(async (req, res) => {
    res.json({ success: true, items: await sap.searchMasters(String(req.query.kind || ''), req.query.q, req.query.parent) });
}));

// ---------- Admin: reference masters ----------
router.get('/admin/ref-masters', wrap(async (req, res) => {
    const kind = String(req.query.kind || '');
    if (!sap.KINDS.includes(kind)) throw fail(400, 'Unknown master.');
    const q = String(req.query.q || '').slice(0, 60);
    const { rows } = await pool.query(
        `SELECT * FROM samadhan.ref_masters WHERE kind = $1 AND ($2 = '' OR code ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%') ORDER BY code LIMIT 2000`, [kind, q]);
    const counts = Object.fromEntries((await pool.query('SELECT kind, count(*)::int AS n FROM samadhan.ref_masters GROUP BY 1')).rows.map((r) => [r.kind, r.n]));
    res.json({ success: true, kinds: sap.KINDS, counts, items: rows });
}));

router.post('/admin/ref-masters', wrap(async (req, res) => {
    const b = req.body ?? {};
    const n = await sap.importMasters(String(b.kind || ''), [b]);
    await audit(req.verifiedEmail, 'ref_master_saved', { kind: b.kind, code: b.code });
    res.json({ success: true, saved: n });
}));

router.post('/admin/ref-masters/import', wrap(async (req, res) => {
    const b = req.body ?? {};
    const n = await sap.importMasters(String(b.kind || ''), b.rows);
    await audit(req.verifiedEmail, 'ref_masters_imported', { kind: b.kind, rows: n });
    res.json({ success: true, saved: n });
}));

router.delete('/admin/ref-masters/:mid', wrap(async (req, res) => {
    const { rows } = await pool.query('DELETE FROM samadhan.ref_masters WHERE id = $1 RETURNING kind, code', [Number(req.params.mid)]);
    if (!rows.length) throw fail(404, 'Not found.');
    await audit(req.verifiedEmail, 'ref_master_deleted', rows[0]);
    res.json({ success: true });
}));

module.exports = router;
