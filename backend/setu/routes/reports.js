'use strict';
const express = require('express');
const { pool } = require('../../db');
const { PRIORITIES, SEVERITIES } = require('../constants');
const { businessMinutesBetween, loadCalendar } = require('../lib/businessHours');
const { audit, fail, istDayStart, stripTags, wrap } = require('../lib/util');
const { requireSupervisor } = require('../middleware/auth');
const { LIST_COLUMNS, LIST_FROM } = require('../lib/queries');

const router = express.Router();

// ---------- Routes: board, dashboard, reports ----------

router.get('/board', wrap(async (req, res) => {
    const where = ['NOT s."isClosed"'];
    const params = [];
    if (req.query.mine === '1') { params.push(req.agent.id); where.push(`t."agentId" = $${params.length}`); }
    if (req.query.groupId) { params.push(Number(req.query.groupId)); where.push(`t."groupId" = $${params.length}`); }
    const { rows } = await pool.query(
        `SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE ${where.join(' AND ')} ORDER BY t.priority DESC, t."createdAt" DESC LIMIT 600`,
        params,
    );
    res.json({ success: true, items: rows });
}));

router.get('/dashboard', wrap(async (req, res) => {
    const today = istDayStart(0);
    const yesterday = istDayStart(-1);
    const [counts, byStatus, bySeverity, received, resolvedToday, frToday, resolvedWithDue, byAgent] = await Promise.all([
        pool.query(
            `SELECT count(*) FILTER (WHERE NOT s."isResolved")::int AS open,
                    count(*) FILTER (WHERE NOT s."isResolved" AND t."agentId" IS NULL)::int AS unassigned,
                    count(*) FILTER (WHERE NOT s."isResolved" AND (t."resolutionDueAt" < now() OR (t."firstRespondedAt" IS NULL AND t."firstResponseDueAt" < now())))::int AS overdue,
                    count(*) FILTER (WHERE NOT s."isResolved" AND t."resolutionDueAt" BETWEEN now() AND now() + interval '4 hours')::int AS "dueSoon",
                    count(*) FILTER (WHERE s."pausesSla" AND NOT s."isResolved")::int AS "onHold",
                    count(*) FILTER (WHERE t."agentId" = $1 AND NOT s."isClosed")::int AS mine
             FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId"`,
            [req.agent.id],
        ),
        pool.query(
            `SELECT s.id, s.name, count(t.id)::int AS n FROM setu.ticket_statuses s
             LEFT JOIN setu.tickets t ON t."statusId" = s.id WHERE NOT s."isClosed" GROUP BY s.id ORDER BY s.position`,
        ),
        pool.query(
            `SELECT t.severity, count(*)::int AS n FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId"
             WHERE NOT s."isResolved" GROUP BY t.severity`,
        ),
        pool.query('SELECT "createdAt" FROM setu.tickets WHERE "createdAt" >= $1', [yesterday]),
        pool.query('SELECT count(*)::int AS n FROM setu.tickets WHERE "resolvedAt" >= $1', [today]),
        pool.query('SELECT "createdAt", "firstRespondedAt" FROM setu.tickets WHERE "firstRespondedAt" >= $1', [today]),
        pool.query('SELECT "resolvedAt", "resolutionDueAt" FROM setu.tickets WHERE "resolvedAt" >= $1 AND "resolutionDueAt" IS NOT NULL', [today]),
        pool.query(
            `SELECT a.id, a.name, a.availability, count(t.id)::int AS open
             FROM setu.agents a
             LEFT JOIN setu.tickets t ON t."agentId" = a.id AND t."statusId" IN (SELECT id FROM setu.ticket_statuses WHERE NOT "isResolved")
             WHERE a.active GROUP BY a.id ORDER BY open DESC, a.name LIMIT 20`,
        ),
    ]);
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, today: 0, yesterday: 0 }));
    for (const r of received.rows) {
        const isToday = r.createdAt >= today;
        const h = Math.floor((r.createdAt.getTime() - (isToday ? today : yesterday).getTime()) / 3_600_000);
        if (h >= 0 && h < 24) hours[h][isToday ? 'today' : 'yesterday']++;
    }
    const cal = await loadCalendar();
    const frMins = frToday.rows.map((t) => businessMinutesBetween(t.createdAt, t.firstRespondedAt, cal));
    const within = resolvedWithDue.rows.filter((t) => t.resolvedAt <= t.resolutionDueAt).length;
    res.json({
        success: true,
        counts: counts.rows[0],
        byStatus: byStatus.rows,
        bySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, bySeverity.rows.find((r) => r.severity === s)?.n ?? 0])),
        byAgent: byAgent.rows,
        trends: {
            hours,
            hourNow: Math.floor((Date.now() - today.getTime()) / 3_600_000),
            receivedToday: received.rows.filter((r) => r.createdAt >= today).length,
            receivedYesterday: received.rows.filter((r) => r.createdAt < today).length,
            resolvedToday: resolvedToday.rows[0].n,
            avgFirstResponseMins: frMins.length ? Math.round(frMins.reduce((a, b) => a + b, 0) / frMins.length) : null,
            resolutionWithinSlaPct: resolvedWithDue.rows.length ? Math.round((within * 100) / resolvedWithDue.rows.length) : null,
        },
    });
}));

// Column order follows Daily_Report_template.xlsx exactly.
const REPORT_COLUMNS = [
    'Ticket ID', 'Subject', 'Status', 'Priority', 'Source', 'Type', 'Agent', 'Created time', 'Due by Time', 'Closed time',
    'Last update time', 'Initial response time', 'Resolution status', 'First response status', 'Call Subject', 'Region',
    'Distributor Code', 'Distributor Name', 'Sales Org', 'STATE', 'DEPOT', 'ASM NAME', 'DEPOT CO-ORDINATOR', 'MR UID',
    'Mobile No', 'Alternate Mobile No', 'Caller Name', 'Caller Contact Number', 'Category', 'Function', 'L2 Agent',
    'HelpDesk Analysis', 'RCA/Solution provides', 'Full name', 'Mobile phone', 'Contact ID',
];
// Text that starts with = + - @ (or a tab / CR) would run as a formula when the report is opened in Excel;
// requester emails and subjects are outside input, so such cells are prefixed with an apostrophe.
const safeCell = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const istCell = (d) => (d ? new Date(d).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }) : '');

router.get('/reports/daily', wrap(async (req, res) => {
    // The report includes requesters' phone numbers and emails: supervisors and admins only.
    requireSupervisor(req);
    const { from, to } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) throw fail(400, 'Give from and to as YYYY-MM-DD.');
    const { rows } = await pool.query(
        `SELECT t.*, s.name AS "statusName", a.name AS "agentName", a.active AS "agentActive", c.name AS "requesterName",
                c.mobile AS "requesterMobile", c.phone AS "requesterPhone", c.email AS "requesterEmail"
         FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId" JOIN setu.contacts c ON c.id = t."requesterId"
         LEFT JOIN setu.agents a ON a.id = t."agentId"
         WHERE t."createdAt" BETWEEN $1::timestamptz AND $2::timestamptz ORDER BY t.id`,
        [`${from}T00:00:00+05:30`, `${to}T23:59:59.999+05:30`],
    );
    const now = new Date();
    const out = rows.map((t) => {
        const resolution = t.resolutionDueAt ? (t.resViolated || (t.resolvedAt ?? now) > t.resolutionDueAt ? 'SLA Violated' : 'Within SLA') : '';
        const firstResp = t.firstResponseDueAt ? (t.frViolated || (t.firstRespondedAt ?? now) > t.firstResponseDueAt ? 'SLA Violated' : 'Within SLA') : '';
        return [
            t.id, t.subject, t.statusName, PRIORITIES[t.priority], t.source, t.type ?? '',
            t.agentName ? `${t.agentName}${t.agentActive ? '' : '(Deactivated)'}` : '',
            istCell(t.createdAt), istCell(t.resolutionDueAt), istCell(t.closedAt), istCell(t.updatedAt), istCell(t.firstRespondedAt),
            resolution, firstResp, t.callSubject ?? '', t.region ?? '', t.distributorCode ?? '', t.distributorName ?? '',
            t.salesOrg ?? '', t.state ?? '', t.depot ?? '', t.asmName ?? '', t.depotCoordinator ?? '', t.mrUid ?? '',
            t.mobileNo ?? '', t.alternateMobileNo ?? '', t.callerName ?? '', t.callerContactNumber ?? '',
            t.category ?? '', t.function ?? '', t.l2Agent ?? '', stripTags(t.helpdeskAnalysis), stripTags(t.rcaSolution),
            t.requesterName, t.requesterMobile ?? t.requesterPhone ?? '', t.requesterEmail ?? '',
        ].map(safeCell);
    });
    await audit(req.verifiedEmail, 'report_downloaded', { from, to, rows: out.length });
    res.json({ success: true, columns: REPORT_COLUMNS, rows: out });
}));

module.exports = router;
