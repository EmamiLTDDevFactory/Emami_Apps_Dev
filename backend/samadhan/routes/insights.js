'use strict';
const express = require('express');
const { dashboardInsights, ticketInsights } = require('../lib/insights');
const { fail, wrap } = require('../lib/util');

const router = express.Router();

// Queue-level insights and action points (shared by everyone; regenerated at most every 30 minutes, or on demand
// by anyone with insights.refresh - Supervisor / Admin by default).
router.get('/insights/dashboard', wrap(async (req, res) => {
    // Queue-wide insights summarise every ticket, so people with a narrowed scope (cockpit) get none.
    if (require('../lib/ticketQuery').isNarrowed(req.scope)) return res.json({ success: true, insights: null, scoped: true });
    const refresh = req.query.refresh === '1' && req.can('insights.refresh');
    res.json({ success: true, insights: await dashboardInsights({ refresh }) });
}));

// One ticket: live checks and the saved analysis; ?generate=1 asks the AI for a fresh analysis.
router.get('/tickets/:id/insights', wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw fail(400, 'Invalid ticket number.');
    res.json({ success: true, ...(await ticketInsights(id, { generate: req.query.generate === '1' && req.can('insights.ai') })) });
}));

module.exports = router;
