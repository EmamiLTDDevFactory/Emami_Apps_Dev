'use strict';
/*
   v7 Phase 7 routes (master prompt §M): major incident, PIR, problem / KEDB on a ticket; problem candidates;
   duplicate hint on create; service-health counts. Permission rules in middleware/permission.js.
*/
const express = require('express');
const { loadTicket } = require('../lib/notify');
const pr = require('../lib/problem');
const { pool } = require('../db/pool');
const { ticketVisible } = require('../lib/ticketQuery');
const { fail, wrap } = require('../lib/util');

const router = express.Router();
const idOf = (req) => Number(req.params.id);
/** Ticket numbers taken from a request body must be in the caller's scope, like the one in the path. */
async function inScope(req, ids) {
    for (const id of ids) if (!Number.isInteger(id) || !(await ticketVisible(pool, req, id))) throw fail(404, `Ticket ${Number.isInteger(id) ? `#${id} ` : ''}not found.`);
}

// ---------- major incident ----------
router.post('/tickets/:id/major', wrap(async (req, res) => {
    const t = await pr.declareMajor(idOf(req), req.body ?? {}, req.agent);
    res.json({ success: true, ticket: t });
}));
router.delete('/tickets/:id/major', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    await pr.standDown(idOf(req), req.body ?? {}, req.agent);
    res.json({ success: true });
}));
router.post('/tickets/:id/major/update', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    await pr.majorUpdate(idOf(req), req.body?.text, req.agent);
    res.json({ success: true });
}));

// ---------- PIR ----------
router.get('/tickets/:id/pir', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    res.json({ success: true, pir: await pr.getPir(idOf(req)) });
}));
router.put('/tickets/:id/pir', wrap(async (req, res) => {
    await loadTicket(idOf(req));
    res.json({ success: true, pir: await pr.savePir(idOf(req), req.body ?? {}, req.agent) });
}));

// ---------- problem / KEDB ----------
router.get('/tickets/:id/problem', wrap(async (req, res) => {
    const t = await loadTicket(idOf(req));
    res.json({ success: true, problem: await pr.problemOf(t), knownError: t.recordClass === 'PROBLEM' ? await pr.getKnownError(t.id) : null,
        incidents: t.recordClass === 'PROBLEM' ? await pr.linkedIncidents(t.id) : [] });
}));
/** body: { problemId } links this incident to a problem (null unlinks); { create: true, subject? } makes a new problem from it. */
router.post('/tickets/:id/problem', wrap(async (req, res) => {
    const t = await loadTicket(idOf(req));
    const b = req.body ?? {};
    if (b.create) {
        const extra = Array.isArray(b.incidentIds) ? b.incidentIds.map(Number) : [];
        await inScope(req, extra);
        const p = await pr.createProblem([t.id, ...extra], b, req.agent);
        return res.status(201).json({ success: true, problem: p });
    }
    const pid = b.problemId === null || b.problemId === '' ? null : Number(b.problemId);
    if (pid !== null && !Number.isInteger(pid)) throw fail(400, 'Invalid problem number.');
    if (pid !== null) await inScope(req, [pid]);
    await pr.linkToProblem([t.id], pid, req.agent);
    res.json({ success: true });
}));
router.put('/tickets/:id/known-error', wrap(async (req, res) => {
    const t = await loadTicket(idOf(req));
    if (t.recordClass !== 'PROBLEM') throw fail(400, 'Known-error details belong on a problem record.');
    res.json({ success: true, knownError: await pr.saveKnownError(t.id, req.body ?? {}, req.agent) });
}));

// ---------- candidates, duplicates, health ----------
router.get('/problem-candidates', wrap(async (req, res) => {
    res.json({ success: true, items: await pr.listCandidates(req) });
}));
router.post('/problem-candidates/:cid/create', wrap(async (req, res) => {
    res.status(201).json({ success: true, problem: await pr.candidateToProblem(Number(req.params.cid), req.agent, req) });
}));
router.post('/problem-candidates/:cid/dismiss', wrap(async (req, res) => {
    await pr.dismissCandidate(Number(req.params.cid), req.agent);
    res.json({ success: true });
}));
router.get('/duplicates', wrap(async (req, res) => {
    res.json({ success: true, items: await pr.duplicates(req, req.query) });
}));
router.get('/service-health', wrap(async (req, res) => {
    res.json({ success: true, ...(await pr.health(req)) });
}));

module.exports = router;
