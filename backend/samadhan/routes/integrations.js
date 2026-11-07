'use strict';
/*
   v7 Phase 9 routes (master prompt §Q): inbound integrations (no hub sign-in - their own API key / token and a rate
   limit; mounted before requireAccess) and Admin > Integrations (admin.integrations). Everything is off by default.
*/
const express = require('express');
const { ready } = require('../db/ready');
const integ = require('../lib/integrations');
const { audit, fail, wrap } = require('../lib/util');

// ---------- inbound (public) ----------
const publicRouter = express.Router();
const WINDOW_MS = 60_000;
const LIMIT = 120;
const hits = new Map();
function limit(req) {
    const ip = String(req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim() || 'unknown';
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= LIMIT) throw fail(429, 'Too many requests - slow down.');
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 10_000) hits.delete(hits.keys().next().value);
}
publicRouter.post('/integrations/calm/tickets', wrap(async (req, res) => {
    await ready;
    limit(req);
    const r = await integ.calmTicket(req);
    res.status(r.created ? 201 : 200).json({ success: true, ...r });
}));
publicRouter.post('/integrations/monitoring/:sourceId/alerts', wrap(async (req, res) => {
    await ready;
    limit(req);
    const r = await integ.monitoringAlert(req);
    res.status(r.created ? 201 : 200).json({ success: true, ...r });
}));

// ---------- Admin > Integrations ----------
const router = express.Router();
router.get('/admin/integrations', wrap(async (req, res) => {
    res.json({ success: true, ...(await integ.overview()), solmanTargets: integ.SOLMAN_TARGETS });
}));
router.put('/admin/integrations/:key', wrap(async (req, res) => {
    const r = await integ.saveIntegration(req.params.key, req.body ?? {});
    await audit(req.verifiedEmail, 'integration_saved', { key: r.key, enabled: r.enabled });
    res.json({ success: true, integration: r });
}));
router.post('/admin/integrations/:key/rotate', wrap(async (req, res) => {
    const secret = await integ.rotateKey(req.params.key);
    await audit(req.verifiedEmail, 'integration_key_rotated', { key: req.params.key });
    res.json({ success: true, secret });
}));
router.post('/admin/integrations/monitoring/sources', wrap(async (req, res) => {
    const r = await integ.saveSource(req.body ?? {});
    await audit(req.verifiedEmail, 'monitoring_source_saved', { id: r.id });
    res.json({ success: true, ...r });
}));
router.post('/admin/integrations/monitoring/sources/:sid/rotate', wrap(async (req, res) => {
    const token = await integ.rotateSource(req.params.sid);
    await audit(req.verifiedEmail, 'monitoring_token_rotated', { id: Number(req.params.sid) });
    res.json({ success: true, token });
}));
router.post('/admin/integrations/solman/import', wrap(async (req, res) => {
    const b = req.body ?? {};
    const r = await integ.solmanImport({ rows: b.rows, mapping: b.mapping, dryRun: b.dryRun !== false }, req.agent);
    if (!r.dryRun) await audit(req.verifiedEmail, 'solman_imported', { created: r.created, skipped: r.skipped, errors: r.errors.length });
    res.json({ success: true, ...r });
}));

module.exports = { publicRouter, router };
