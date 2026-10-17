'use strict';
const express = require('express');
const { dashboardInsights, ticketInsights } = require('../lib/insights');
const { fail, wrap } = require('../lib/util');

const router = express.Router();
const isSupervisor = (req) => req.agent.role === 'Supervisor' || req.agent.role === 'Admin';

// Queue-level insights and action points (shared by everyone; regenerated at most every 30 minutes, or on demand
// by a Supervisor / Admin).
router.get('/insights/dashboard', wrap(async (req, res) => {
    const refresh = req.query.refresh === '1' && isSupervisor(req);
    res.json({ success: true, insights: await dashboardInsights({ refresh }) });
}));

// One ticket: live checks and the saved analysis; ?generate=1 asks the AI for a fresh analysis.
router.get('/tickets/:id/insights', wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw fail(400, 'Invalid ticket number.');
    res.json({ success: true, ...(await ticketInsights(id, { generate: req.query.generate === '1' })) });
}));

module.exports = router;
