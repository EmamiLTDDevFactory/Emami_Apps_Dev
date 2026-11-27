'use strict';
/*
   Configuration management (CMDB, migration 7.12-cmdb) and the ITSM overview (one screen that maps every ITIL practice
   to where it lives in Samadhan, with live numbers). Permissions in middleware/permission.js: viewing needs ticket.view,
   changing CIs cmdb.manage (Supervisor and up), linking a CI to a ticket ticket.edit.
*/
const express = require('express');
const { pool } = require('../db/pool');
const cmdb = require('../lib/cmdb');
const seed = require('../lib/cmdbSeed');
const { audit, fail, wrap } = require('../lib/util');

const router = express.Router();
const missing = (e) => e.code === '42P01' || e.code === '42703';
const quiet = async (fn, fallback) => { try { return await fn(); } catch (e) { if (missing(e)) return fallback; throw e; } };

router.get('/cmdb', wrap(async (req, res) => {
    const r = await cmdb.list(req.query);
    res.json({ success: true, ...r, lists: { classes: seed.CI_CLASSES, statuses: seed.CI_STATUSES, criticality: seed.CI_CRITICALITY, relations: seed.CI_RELATIONS }, importColumns: cmdb.IMPORT_COLS, verifyDays: cmdb.VERIFY_DAYS });
}));
router.get('/cmdb/search', wrap(async (req, res) => res.json({ success: true, items: await cmdb.search(req.query.q) })));
router.get('/cmdb/:cid', wrap(async (req, res) => res.json({ success: true, ...(await cmdb.get(req.params.cid)) })));
router.post('/cmdb', wrap(async (req, res) => {
    const id = await cmdb.save(req.body ?? {}, req.agent);
    await audit(req.verifiedEmail, 'ci_saved', { id, code: req.body?.code, status: req.body?.status });
    res.json({ success: true, id });
}));
router.post('/cmdb/import', wrap(async (req, res) => {
    const r = await cmdb.importRows(req.body?.rows, req.body?.dryRun !== false, req.agent);
    if (!r.dryRun) await audit(req.verifiedEmail, 'cis_imported', { added: r.added, updated: r.updated, errors: r.errors.length });
    res.json({ success: true, ...r });
}));
router.post('/cmdb/:cid/verify', wrap(async (req, res) => { await cmdb.verify(req.params.cid, req.agent); res.json({ success: true }); }));
router.post('/cmdb/:cid/relations', wrap(async (req, res) => { await cmdb.relate(req.params.cid, req.body ?? {}, req.agent); res.json({ success: true }); }));
router.delete('/cmdb/:cid/relations/:rid', wrap(async (req, res) => { await cmdb.unrelate(req.params.cid, req.params.rid, req.agent); res.json({ success: true }); }));

router.get('/tickets/:id/cis', wrap(async (req, res) => res.json({ success: true, ...(await cmdb.forTicket(Number(req.params.id))) })));
router.post('/tickets/:id/cis', wrap(async (req, res) => {
    if (!req.body?.ciId) throw fail(400, 'Pick a configuration item.');
    await cmdb.link(Number(req.params.id), req.body.ciId, req.agent);
    res.json({ success: true });
}));
router.delete('/tickets/:id/cis/:cid', wrap(async (req, res) => { await cmdb.unlink(Number(req.params.id), req.params.cid, req.agent); res.json({ success: true }); }));

/** ITSM overview: live numbers per ITIL practice, within the caller's data scope. */
router.get('/itsm/overview', wrap(async (req, res) => {
    const { scopeSql } = require('../lib/ticketQuery');
    const s = scopeSql(req.scope, req.agent.id);
    const scoped = s ? ` AND ${s}` : '';
    const one = (sql, params = []) => quiet(async () => (await pool.query(sql, params)).rows[0], null);
    const OPEN = `FROM samadhan.tickets t JOIN samadhan.ticket_statuses st ON st.id = t."statusId" WHERE t."deletedAt" IS NULL AND NOT t.spam AND NOT st."isResolved"${scoped}`;
    const [tickets, problems, changes, cis, kb, sla, supplier, events] = await Promise.all([
        one(`SELECT count(*) FILTER (WHERE COALESCE(t."recordClass", 'INCIDENT') IN ('INCIDENT', 'DEFECT'))::int AS incidents,
                count(*) FILTER (WHERE COALESCE(t."recordClass", 'INCIDENT') IN ('INCIDENT', 'DEFECT') AND t."resolutionDueAt" < now())::int AS "incidentsOverdue",
                count(*) FILTER (WHERE t."recordClass" IN ('SERVICE_REQUEST', 'ACCESS_REQUEST', 'QUERY'))::int AS requests,
                count(*) FILTER (WHERE t."isMajorIncident")::int AS major,
                count(*) FILTER (WHERE t."recordClass" = 'CHANGE')::int AS changes,
                count(*) FILTER (WHERE COALESCE(t."escalationLevel", 0) > 0)::int AS escalated ${OPEN}`),
        one(`SELECT count(*) FILTER (WHERE NOT st."isResolved")::int AS open, count(*) FILTER (WHERE pd."knownError")::int AS "knownErrors"
             FROM samadhan.tickets t JOIN samadhan.ticket_statuses st ON st.id = t."statusId" LEFT JOIN samadhan.problem_details pd ON pd."ticketId" = t.id
             WHERE t."recordClass" = 'PROBLEM' AND t."deletedAt" IS NULL${scoped}`),
        one(`SELECT count(*) FILTER (WHERE cd."plannedStart" BETWEEN now() AND now() + interval '7 days')::int AS "next7",
                (SELECT count(DISTINCT a."ticketId")::int FROM samadhan.ticket_approvals a WHERE a.state = 'Pending') AS "awaitingApproval"
             FROM samadhan.ticket_change_details cd JOIN samadhan.tickets t ON t.id = cd."ticketId" WHERE t."deletedAt" IS NULL${scoped}`),
        one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'In use')::int AS "inUse",
                count(*) FILTER (WHERE status NOT IN ('Disposed', 'Retired') AND ("lastVerifiedAt" IS NULL OR "lastVerifiedAt" < now() - interval '${cmdb.VERIFY_DAYS} days'))::int AS unverified
             FROM samadhan.config_items`),
        one(`SELECT count(*) FILTER (WHERE status = 'published')::int AS published, count(*) FILTER (WHERE status = 'draft')::int AS drafts FROM samadhan.articles`),
        one(`SELECT round(100.0 * count(*) FILTER (WHERE t."resolvedAt" <= t."resolutionDueAt") / NULLIF(count(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL), 0), 1)::float AS "resolutionPct",
                round(100.0 * count(*) FILTER (WHERE t."firstRespondedAt" <= t."firstResponseDueAt") / NULLIF(count(*) FILTER (WHERE t."firstResponseDueAt" IS NOT NULL AND t."firstRespondedAt" IS NOT NULL), 0), 1)::float AS "responsePct"
             FROM samadhan.tickets t WHERE t."resolvedAt" > now() - interval '30 days' AND t."deletedAt" IS NULL${scoped}`),
        one(`SELECT count(*) FILTER (WHERE kind = 'ITSM_VENDOR' AND active)::int AS vendors, (SELECT count(*)::int FROM samadhan.escalation_contacts WHERE active) AS "escalationContacts" FROM samadhan.support_partners`),
        one(`SELECT count(*) FILTER (WHERE enabled)::int AS enabled FROM samadhan.integrations WHERE key IN ('calm', 'monitoring')`),
    ]);
    res.json({ success: true, tickets, problems, changes, cis, kb, sla, supplier, events });
}));

module.exports = router;
