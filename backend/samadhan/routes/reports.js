'use strict';
const express = require('express');
const { pool } = require('../db/pool');
const { PRIORITIES, SEVERITIES } = require('../constants');
const { businessMinutesBetween, loadCalendar } = require('../lib/businessHours');
const { audit, fail, istDayStart, stripTags, wrap } = require('../lib/util');
const { LIST_COLUMNS, LIST_FROM } = require('../lib/queries');
const { liveFor } = require('../lib/ticketQuery');

const router = express.Router();

// ---------- Routes: board, dashboard, reports ----------

router.get('/board', wrap(async (req, res) => {
    const where = ['NOT s."isClosed"', liveFor(req)];
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
    const [counts, byStatus, bySeverity, received, resolvedToday, frToday, resolvedWithDue, byAgent, byGroup, recent, csat] = await Promise.all([
        pool.query(
            `SELECT count(*) FILTER (WHERE NOT s."isResolved")::int AS open,
                    count(*) FILTER (WHERE NOT s."isResolved" AND t."agentId" IS NULL)::int AS unassigned,
                    count(*) FILTER (WHERE NOT s."isResolved" AND (t."resolutionDueAt" < now() OR (t."firstRespondedAt" IS NULL AND t."firstResponseDueAt" < now())))::int AS overdue,
                    count(*) FILTER (WHERE NOT s."isResolved" AND t."resolutionDueAt" BETWEEN now() AND now() + interval '4 hours')::int AS "dueSoon",
                    count(*) FILTER (WHERE s."pausesSla" AND NOT s."isResolved")::int AS "onHold",
                    count(*) FILTER (WHERE t."agentId" = $1 AND NOT s."isClosed")::int AS mine,
                    count(*) FILTER (WHERE NOT s."isResolved" AND t."resolutionDueAt" >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
                                     AND t."resolutionDueAt" < date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' + interval '1 day')::int AS "dueToday"
             FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE ${liveFor(req)}`,
            [req.agent.id],
        ),
        pool.query(
            `SELECT s.id, s.name, count(t.id)::int AS n FROM samadhan.ticket_statuses s
             LEFT JOIN samadhan.tickets t ON t."statusId" = s.id AND ${liveFor(req)} WHERE NOT s."isClosed" GROUP BY s.id ORDER BY s.position`,
        ),
        pool.query(
            `SELECT t.severity, count(*)::int AS n FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
             WHERE NOT s."isResolved" AND ${liveFor(req)} GROUP BY t.severity`,
        ),
        pool.query(`SELECT "createdAt" FROM samadhan.tickets t WHERE "createdAt" >= $1 AND ${liveFor(req)}`, [yesterday]),
        pool.query(`SELECT count(*)::int AS n FROM samadhan.tickets t WHERE "resolvedAt" >= $1 AND ${liveFor(req)}`, [today]),
        pool.query(`SELECT "createdAt", "firstRespondedAt" FROM samadhan.tickets t WHERE "firstRespondedAt" >= $1 AND ${liveFor(req)}`, [today]),
        pool.query(`SELECT "resolvedAt", "resolutionDueAt" FROM samadhan.tickets t WHERE "resolvedAt" >= $1 AND "resolutionDueAt" IS NOT NULL AND ${liveFor(req)}`, [today]),
        pool.query(
            `SELECT a.id, a.name, a.availability, count(t.id)::int AS open
             FROM samadhan.agents a
             LEFT JOIN samadhan.tickets t ON t."agentId" = a.id AND t."statusId" IN (SELECT id FROM samadhan.ticket_statuses WHERE NOT "isResolved") AND ${liveFor(req)}
             WHERE a.active GROUP BY a.id ORDER BY open DESC, a.name LIMIT 20`,
        ),
        // Unresolved tickets per group and status (Freshdesk "Unresolved tickets by group").
        pool.query(
            `SELECT coalesce(g.name, 'No group') AS "group", t."groupId", s.id AS "statusId", count(*)::int AS n
             FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" LEFT JOIN samadhan.groups g ON g.id = t."groupId"
             WHERE NOT s."isResolved" AND ${liveFor(req)} GROUP BY 1, 2, 3`,
        ),
        pool.query(
            `SELECT ac.id, ac."ticketId", ac.action, ac.details, ac."createdAt", a.name AS "actorName", t.subject
             FROM samadhan.activities ac JOIN samadhan.tickets t ON t.id = ac."ticketId" LEFT JOIN samadhan.agents a ON a.id = ac."actorAgentId"
             WHERE ac."createdAt" > now() - interval '3 days' AND ac.action <> 'automation' ORDER BY ac."createdAt" DESC, ac.id DESC LIMIT 25`,
        ),
        pool.query(`SELECT rating, count(*)::int AS n FROM samadhan.csat_responses WHERE "createdAt" > now() - interval '30 days' GROUP BY rating`),
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
        byGroup: byGroup.rows,
        recent: recent.rows,
        csat: Object.fromEntries([1, 2, 3].map((r) => [r, csat.rows.find((x) => x.rating === r)?.n ?? 0])),
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

/**
 * Overview widgets for the dashboard: backlog trend (open at the end of each day, created, resolved), ageing of open
 * tickets by severity, SLA health, agent leaderboard (last 7 days), open tickets by region x status, open categories,
 * source mix, tickets at risk (due within 2 hours or overdue) and today's arrivals against the 7-day hourly average.
 */
router.get('/dashboard/overview', wrap(async (req, res) => {
    const days = [7, 14, 30, 60].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const IST_DAY = `date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')`;
    const OPEN = `JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE ${liveFor(req)} AND NOT s."isResolved"`;
    const [backlog, ageing, sla, csat, leaders, regionStatus, categories, sources, risk, hourly] = await Promise.all([
        pool.query(
            `SELECT to_char(d, 'YYYY-MM-DD') AS day,
                    (SELECT count(*)::int FROM samadhan.tickets t WHERE ${liveFor(req)} AND t."createdAt" < (d + interval '1 day') AT TIME ZONE 'Asia/Kolkata'
                        AND (t."resolvedAt" IS NULL OR t."resolvedAt" >= (d + interval '1 day') AT TIME ZONE 'Asia/Kolkata')) AS open,
                    (SELECT count(*)::int FROM samadhan.tickets t WHERE ${liveFor(req)} AND t."createdAt" >= d AT TIME ZONE 'Asia/Kolkata' AND t."createdAt" < (d + interval '1 day') AT TIME ZONE 'Asia/Kolkata') AS created,
                    (SELECT count(*)::int FROM samadhan.tickets t WHERE ${liveFor(req)} AND t."resolvedAt" >= d AT TIME ZONE 'Asia/Kolkata' AND t."resolvedAt" < (d + interval '1 day') AT TIME ZONE 'Asia/Kolkata') AS resolved
             FROM generate_series(${IST_DAY} - make_interval(days => $1 - 1), ${IST_DAY}, interval '1 day') AS d ORDER BY d`,
            [days],
        ),
        pool.query(
            `SELECT CASE WHEN now() - t."createdAt" < interval '4 hours' THEN '0-4h' WHEN now() - t."createdAt" < interval '1 day' THEN '4-24h'
                         WHEN now() - t."createdAt" < interval '3 days' THEN '1-3d' WHEN now() - t."createdAt" < interval '7 days' THEN '3-7d' ELSE '7d+' END AS bucket,
                    t.severity, count(*)::int AS n
             FROM samadhan.tickets t ${OPEN} GROUP BY 1, 2`,
        ),
        pool.query(
            `SELECT count(*) FILTER (WHERE t."firstRespondedAt" >= now() - make_interval(days => $1))::int AS responded,
                    count(*) FILTER (WHERE t."firstRespondedAt" >= now() - make_interval(days => $1) AND NOT t."frViolated" AND (t."firstResponseDueAt" IS NULL OR t."firstRespondedAt" <= t."firstResponseDueAt"))::int AS "respondedInSla",
                    count(*) FILTER (WHERE t."resolvedAt" >= now() - make_interval(days => $1))::int AS resolved,
                    count(*) FILTER (WHERE t."resolvedAt" >= now() - make_interval(days => $1) AND NOT t."resViolated" AND (t."resolutionDueAt" IS NULL OR t."resolvedAt" <= t."resolutionDueAt"))::int AS "resolvedInSla",
                    count(*) FILTER (WHERE NOT s."isResolved" AND (t."resolutionDueAt" < now() OR (t."firstRespondedAt" IS NULL AND t."firstResponseDueAt" < now())))::int AS overdue,
                    count(*) FILTER (WHERE NOT s."isResolved")::int AS open
             FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE ${liveFor(req)}`,
            [days],
        ),
        pool.query(`SELECT rating, count(*)::int AS n FROM samadhan.csat_responses WHERE "createdAt" >= now() - make_interval(days => $1) GROUP BY rating`, [days]),
        pool.query(
            `SELECT a.id, a.name, a.availability,
                    count(t.id) FILTER (WHERE t."resolvedAt" >= now() - interval '7 days')::int AS resolved,
                    count(t.id) FILTER (WHERE t."resolvedAt" IS NULL)::int AS open,
                    round(avg(extract(epoch FROM t."firstRespondedAt" - t."createdAt") / 60) FILTER (WHERE t."firstRespondedAt" >= now() - interval '7 days'))::int AS "avgFirstResponseMins",
                    (SELECT round(100.0 * count(*) FILTER (WHERE r.rating = 3) / NULLIF(count(*), 0)) FROM samadhan.csat_responses r WHERE r."agentId" = a.id AND r."createdAt" >= now() - interval '30 days')::int AS "csatPct"
             FROM samadhan.agents a LEFT JOIN samadhan.tickets t ON t."agentId" = a.id AND ${liveFor(req)}
             WHERE a.active GROUP BY a.id HAVING count(t.id) > 0 ORDER BY resolved DESC, open DESC LIMIT 10`,
        ),
        pool.query(`SELECT coalesce(nullif(t.region, ''), 'None') AS region, s.id AS "statusId", s.name AS status, count(*)::int AS n FROM samadhan.tickets t ${OPEN} GROUP BY 1, 2, 3`),
        pool.query(`SELECT coalesce(nullif(t.category, ''), 'Uncategorised') AS name, count(*)::int AS value FROM samadhan.tickets t ${OPEN} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
        pool.query(`SELECT t.source AS name, count(*)::int AS value FROM samadhan.tickets t WHERE ${liveFor(req)} AND t."createdAt" >= now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC`, [days]),
        pool.query(
            `SELECT t.id, t.subject, t.severity, t.priority, t."resolutionDueAt", t."firstResponseDueAt", t."firstRespondedAt", a.name AS "agentName", s.name AS "statusName"
             FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" LEFT JOIN samadhan.agents a ON a.id = t."agentId"
             WHERE ${liveFor(req)} AND NOT s."isResolved" AND NOT s."pausesSla"
               AND (t."resolutionDueAt" < now() + interval '2 hours' OR (t."firstRespondedAt" IS NULL AND t."firstResponseDueAt" < now() + interval '2 hours'))
             ORDER BY LEAST(t."resolutionDueAt", CASE WHEN t."firstRespondedAt" IS NULL THEN t."firstResponseDueAt" END) LIMIT 12`,
        ),
        pool.query(
            `SELECT extract(hour FROM t."createdAt" AT TIME ZONE 'Asia/Kolkata')::int AS hour,
                    count(*) FILTER (WHERE t."createdAt" >= ${IST_DAY} AT TIME ZONE 'Asia/Kolkata')::int AS today,
                    round(count(*) FILTER (WHERE t."createdAt" < ${IST_DAY} AT TIME ZONE 'Asia/Kolkata') / 7.0, 1)::float AS avg
             FROM samadhan.tickets t WHERE ${liveFor(req)} AND t."createdAt" >= (${IST_DAY} - interval '7 days') AT TIME ZONE 'Asia/Kolkata' GROUP BY 1 ORDER BY 1`,
        ),
    ]);
    const s = sla.rows[0];
    const pct = (n, d) => (d ? Math.round((n * 1000) / d) / 10 : null);
    const c = Object.fromEntries([1, 2, 3].map((r) => [r, csat.rows.find((x) => x.rating === r)?.n ?? 0]));
    const csatTotal = c[1] + c[2] + c[3];
    res.json({
        success: true, days,
        backlog: backlog.rows,
        ageing: ageing.rows,
        sla: {
            firstResponsePct: pct(s.respondedInSla, s.responded), resolutionPct: pct(s.resolvedInSla, s.resolved),
            csatPct: pct(c[3], csatTotal), csatResponses: csatTotal, open: s.open, overdue: s.overdue, onTrackPct: pct(s.open - s.overdue, s.open),
        },
        leaderboard: leaders.rows,
        regionStatus: regionStatus.rows,
        categories: categories.rows,
        sources: sources.rows,
        risk: risk.rows,
        hourly: Array.from({ length: 24 }, (_, h) => hourly.rows.find((r) => r.hour === h) ?? { hour: h, today: 0, avg: 0 }),
        hourNow: Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })),
    });
}));

/**
 * "Emami Secondary Helpdesk Dashboard": ticket counts by region, status, type and source, plus unresolved by category,
 * depot and state, and the open Fatal / Serious tickets. Every bar links to the matching ticket list in the app.
 */
router.get('/dashboard/breakdown', wrap(async (req, res) => {
    const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const params = [days];
    let extra = '';
    if (req.query.groupId) { params.push(Number(req.query.groupId) || 0); extra = ` AND t."groupId" = $${params.length}`; }
    const base = `FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE ${liveFor(req)} AND t."createdAt" >= now() - make_interval(days => $1)${extra}`;
    const by = (expr, onlyOpen = false, limit = 15) => pool.query(
        `SELECT coalesce(nullif(${expr}::text, ''), 'None') AS name, count(*)::int AS value ${base}${onlyOpen ? ' AND NOT s."isResolved"' : ''}
         GROUP BY 1 ORDER BY value DESC LIMIT ${limit}`,
        params,
    );
    const [totals, region, status, type, source, category, depot, state, critical] = await Promise.all([
        pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT s."isResolved")::int AS unresolved ${base}`, params),
        by('t.region'), by('s.name'), by('t.type'), by('t.source'),
        by('t.category', true, 12), by('t.depot', true, 12), by('t.state', false, 15),
        pool.query(
            `SELECT t.id, t.subject, t.severity, s.name AS "statusName", t."createdAt" ${base} AND NOT s."isResolved" AND t.severity IN ('FATAL', 'SERIOUS')
             ORDER BY t.severity, t."createdAt" LIMIT 25`,
            params,
        ),
    ]);
    const statusIds = (await pool.query('SELECT id, name FROM samadhan.ticket_statuses')).rows;
    res.json({
        success: true, days, totals: totals.rows[0],
        region: region.rows, status: status.rows.map((r) => ({ ...r, id: statusIds.find((s) => s.name === r.name)?.id ?? null })),
        type: type.rows, source: source.rows, category: category.rows, depot: depot.rows, state: state.rows, critical: critical.rows,
    });
}));

/**
 * Analytics (supervisors and admins): volume, response and resolution times in business minutes, SLA compliance,
 * agent performance, territory / category mix, arrival heat-map, CSAT and calls for the last 7, 30 or 90 days.
 */
router.get('/analytics', wrap(async (req, res) => {
    if (!req.can('screen.analytics')) throw fail(403, 'Supervisors and admins only.');
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const params = [days];
    let extra = '';
    if (req.query.groupId) { params.push(Number(req.query.groupId) || 0); extra = ` AND t."groupId" = $${params.length}`; }
    const { rows: T } = await pool.query(
        `SELECT t.id, t."createdAt", t."firstRespondedAt", t."resolvedAt", t."firstResponseDueAt", t."resolutionDueAt", t."frViolated", t."resViolated",
                t."agentId", t.priority, t.severity, t.source, t.type, t.category, t.region, t.state, t.depot, s.name AS "statusName", s."isResolved"
         FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE ${liveFor(req)} AND t."createdAt" >= now() - make_interval(days => $1)${extra}`,
        params,
    );
    const ids = T.map((t) => t.id);
    const [agents, csat, calls, time, reopened] = await Promise.all([
        pool.query('SELECT id, name, active FROM samadhan.agents'),
        pool.query(
            `SELECT r.rating, r.comment, r."createdAt", r."ticketId", r."agentId", a.name AS "agentName" FROM samadhan.csat_responses r
             LEFT JOIN samadhan.agents a ON a.id = r."agentId" WHERE r."ticketId" = ANY($1::int[]) ORDER BY r."createdAt" DESC`,
            [ids],
        ),
        pool.query(
            `SELECT direction, outcome, "durationSecs", "agentId" FROM samadhan.call_logs WHERE "createdAt" >= now() - make_interval(days => $1)`,
            [days],
        ),
        pool.query('SELECT "agentId", sum(minutes)::int AS minutes FROM samadhan.time_logs WHERE "ticketId" = ANY($1::int[]) GROUP BY 1', [ids]),
        // Reopened: a requester reply on a ticket that had been resolved (addRequesterReply sets it back to Open).
        pool.query(
            `SELECT count(DISTINCT ac."ticketId")::int AS n FROM samadhan.activities ac JOIN samadhan.tickets t ON t.id = ac."ticketId"
             WHERE ac."ticketId" = ANY($1::int[]) AND ac.action = 'requester_replied' AND t."resolvedAt" IS NOT NULL AND ac."createdAt" > t."resolvedAt"`,
            [ids],
        ),
    ]);
    const cal = await loadCalendar();
    const bm = (a, b) => (a && b ? businessMinutesBetween(a, b, cal) : null);
    const avg = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
    const pct = (n, d) => (d ? Math.round((n * 1000) / d) / 10 : null);
    const frMet = (t) => t.firstRespondedAt && !t.frViolated && (!t.firstResponseDueAt || t.firstRespondedAt <= t.firstResponseDueAt);
    const resMet = (t) => t.resolvedAt && !t.resViolated && (!t.resolutionDueAt || t.resolvedAt <= t.resolutionDueAt);
    const responded = T.filter((t) => t.firstRespondedAt);
    const resolved = T.filter((t) => t.resolvedAt);

    const dayKey = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
    const trend = {};
    for (let i = days - 1; i >= 0; i--) trend[dayKey(Date.now() - i * 86_400_000)] = { day: '', created: 0, resolved: 0 };
    for (const k of Object.keys(trend)) trend[k].day = k;
    for (const t of T) {
        if (trend[dayKey(t.createdAt)]) trend[dayKey(t.createdAt)].created++;
        if (t.resolvedAt && trend[dayKey(t.resolvedAt)]) trend[dayKey(t.resolvedAt)].resolved++;
    }
    const heat = Array.from({ length: 7 }, (_, d) => ({ dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d], hours: Array(24).fill(0) }));
    for (const t of T) {
        const ist = new Date(new Date(t.createdAt).getTime() + 330 * 60_000);
        heat[ist.getUTCDay()].hours[ist.getUTCHours()]++;
    }
    const count = (key, rows = T, limit = 15) => Object.entries(rows.reduce((m, t) => { const k = t[key] || 'None'; m[k] = (m[k] || 0) + 1; return m; }, {}))
        .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, limit);
    const timeBy = Object.fromEntries(time.rows.map((r) => [r.agentId, r.minutes]));
    const agentRows = agents.rows.map((a) => {
        const mine = T.filter((t) => t.agentId === a.id);
        const mineResolved = mine.filter((t) => t.resolvedAt);
        const cs = csat.rows.filter((r) => r.agentId === a.id);
        return {
            id: a.id, name: a.name, active: a.active, assigned: mine.length, resolved: mineResolved.length,
            open: mine.filter((t) => !t.isResolved).length,
            avgFirstResponseMins: avg(mine.map((t) => bm(t.createdAt, t.firstRespondedAt))),
            avgResolutionMins: avg(mineResolved.map((t) => bm(t.createdAt, t.resolvedAt))),
            firstResponseSlaPct: pct(mine.filter(frMet).length, mine.filter((t) => t.firstRespondedAt).length),
            resolutionSlaPct: pct(mineResolved.filter(resMet).length, mineResolved.length),
            csatPositivePct: pct(cs.filter((r) => r.rating === 3).length, cs.length), csatResponses: cs.length,
            minutesLogged: timeBy[a.id] ?? 0,
        };
    }).filter((a) => a.assigned > 0 || a.minutesLogged > 0).sort((a, b) => b.assigned - a.assigned);

    res.json({
        success: true, days,
        totals: {
            created: T.length, resolved: resolved.length, unresolved: T.filter((t) => !t.isResolved).length,
            avgFirstResponseMins: avg(responded.map((t) => bm(t.createdAt, t.firstRespondedAt))),
            avgResolutionMins: avg(resolved.map((t) => bm(t.createdAt, t.resolvedAt))),
            firstResponseSlaPct: pct(responded.filter(frMet).length, responded.length),
            resolutionSlaPct: pct(resolved.filter(resMet).length, resolved.length),
            reopenedPct: pct(reopened.rows[0].n, resolved.length),
            wrongTicketPct: pct(T.filter((t) => String(t.type).toLowerCase() === 'wrong ticket').length, T.length),
            perAgentPerDay: agentRows.length ? Math.round((T.length / agentRows.length / days) * 10) / 10 : null,
        },
        trend: Object.values(trend), heat, agents: agentRows,
        byCategory: count('category', T, 12), byRegion: count('region'), byState: count('state'), byDepot: count('depot'),
        byType: count('type'), bySource: count('source'), byStatus: count('statusName'), bySeverity: count('severity'),
        byPriority: Object.entries(PRIORITIES).map(([p, name]) => ({ name, value: T.filter((t) => t.priority === Number(p)).length })).reverse(),
        csat: {
            responses: csat.rows.length,
            positive: csat.rows.filter((r) => r.rating === 3).length, neutral: csat.rows.filter((r) => r.rating === 2).length, negative: csat.rows.filter((r) => r.rating === 1).length,
            comments: csat.rows.filter((r) => r.comment).slice(0, 10),
        },
        calls: {
            total: calls.rows.length, outbound: calls.rows.filter((c) => c.direction === 'OUTBOUND').length, inbound: calls.rows.filter((c) => c.direction === 'INBOUND').length,
            connected: calls.rows.filter((c) => c.outcome === 'Connected').length,
            avgMins: avg(calls.rows.filter((c) => c.durationSecs).map((c) => c.durationSecs / 60)),
            byOutcome: count('outcome', calls.rows),
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
    if (!req.can('screen.reports')) throw fail(403, 'Supervisors and admins only.');
    const { from, to } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) throw fail(400, 'Give from and to as YYYY-MM-DD.');
    const { rows } = await pool.query(
        `SELECT t.*, s.name AS "statusName", a.name AS "agentName", a.active AS "agentActive", c.name AS "requesterName",
                c.mobile AS "requesterMobile", c.phone AS "requesterPhone", c.email AS "requesterEmail"
         FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" JOIN samadhan.contacts c ON c.id = t."requesterId"
         LEFT JOIN samadhan.agents a ON a.id = t."agentId"
         WHERE t."createdAt" BETWEEN $1::timestamptz AND $2::timestamptz AND ${liveFor(req)} ORDER BY t.id`,
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
