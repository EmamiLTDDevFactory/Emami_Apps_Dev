'use strict';
/*
   v7 Phase 8 routes (master prompt §M): programme details on a ticket; programme burn-down, KPIs and hypercare today.
   Permission rules in middleware/permission.js.
*/
const express = require('express');
const { loadTicket } = require('../lib/notify');
const pg = require('../lib/program');
const { logActivity, wrap } = require('../lib/util');

const router = express.Router();
const idOf = (req) => Number(req.params.id);

router.get('/tickets/:id/program', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    res.json({ success: true, program: await pg.getProgram(idOf(req)) });
}));
router.put('/tickets/:id/program', wrap(async (req, res) => {
    const id = idOf(req);
    await loadTicket(id);
    const before = await pg.getProgram(id);
    const after = await pg.saveProgram(id, req.body ?? {}, req.agent);
    const changed = Object.keys(pg.cleanProgram(req.body ?? {})).filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
    if (changed.length) await logActivity(id, 'program_details_updated', { fields: changed }, req.agent.id);
    res.json({ success: true, program: after });
}));
router.get('/program/overview', wrap(async (req, res) => {
    const [burn, k, hyper] = await Promise.all([pg.burndown(req, req.query.days, req.query.testCycle || null), pg.kpis(req), pg.hypercareToday(req)]);
    res.json({ success: true, burndown: burn, kpis: k, hypercare: hyper });
}));

module.exports = router;
