'use strict';
/*
   v7 Phase 5 routes: IT details on a ticket (Digital Apps, Infra & IT). Permission rules live in middleware/permission.js;
   data scope on /tickets/<id>/... is checked there too (a ticket outside the scope answers 404).
*/
const express = require('express');
const { loadTicket } = require('../lib/notify');
const it = require('../lib/it');
const { logActivity, wrap } = require('../lib/util');

const router = express.Router();
const idOf = (req) => Number(req.params.id);

router.get('/tickets/:id/it', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    res.json({ success: true, it: await it.getIt(idOf(req)) });
}));

router.put('/tickets/:id/it', wrap(async (req, res) => {
    const id = idOf(req);
    await loadTicket(id);
    const before = await it.getIt(id);
    const after = await it.saveIt(id, req.body ?? {});
    const changed = Object.keys(it.cleanIt(req.body ?? {})).filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
    if (changed.length) await logActivity(id, 'it_details_updated', { fields: changed }, req.agent.id);
    await require('../lib/problem').autoMajor(id);
    res.json({ success: true, it: after });
}));

module.exports = router;
