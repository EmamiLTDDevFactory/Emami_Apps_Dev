'use strict';
/*
   v7 Phase 8 (master prompt §I ticket_program_details, §N, §P): S/4HANA Programme details per ticket, the defect rules
   (severity sets the priority; a retest result is recorded with who / when; "Failed" sends the ticket back to Retest;
   a defect needs its test cycle and a Passed retest before it is resolved), and the programme numbers: defect
   burn-down, KPIs (density per process area, leakage, retest pass %), hypercare today.
   Every reader tolerates a database before migration 7.8 (empty answers).
*/
const { pool } = require('../db/pool');
const { fail, logActivity } = require('./util');
const seed = require('./programSeed');

const missing = (e) => e.code === '42P01' || e.code === '42703';
const quiet = async (fn, fallback) => { try { return await fn(); } catch (e) { if (missing(e)) return fallback; throw e; } };
const TEXT = ['activatePhase', 'releaseWave', 'testCycle', 'testCaseId', 'testScenario', 'processArea', 'defectSeverity', 'migrationObject', 'mockCycle', 'cutoverStepId',
    'simplificationItem', 'atcFinding', 'ricefwId', 'fitGapId', 'retestStatus'];
const LISTED = { activatePhase: 'activatePhase', testCycle: 'testCycle', defectSeverity: 'defectSeverity', retestStatus: 'retestStatus', mockCycle: 'mockCycle' };
const LABEL = { activatePhase: 'Activate phase', testCycle: 'Test cycle', defectSeverity: 'Defect severity', retestStatus: 'Retest result', mockCycle: 'Mock cycle' };

function cleanProgram(b = {}) {
    const out = {};
    for (const k of TEXT) if (b[k] !== undefined) out[k] = String(b[k] ?? '').trim().slice(0, 300) || null;
    for (const [k, list] of Object.entries(LISTED)) {
        if (out[k] && !seed.LISTS[list].includes(out[k])) throw fail(400, `${LABEL[k]}: one of ${seed.LISTS[list].join(', ')}.`);
    }
    for (const k of ['plannedStart', 'plannedEnd']) {
        if (b[k] === undefined) continue;
        if (b[k] === null || b[k] === '') { out[k] = null; continue; }
        const d = new Date(b[k]);
        if (Number.isNaN(d.getTime())) throw fail(400, `${k === 'plannedStart' ? 'Planned start' : 'Planned end'}: not a valid date.`);
        out[k] = d;
    }
    return out;
}

const getProgram = (ticketId) => quiet(async () => (await pool.query('SELECT * FROM samadhan.ticket_program_details WHERE "ticketId" = $1', [ticketId])).rows[0] ?? null, null);

/** Saves programme details; a new severity sets the ticket priority, a retest result is stamped and Failed reopens as Retest. */
async function saveProgram(ticketId, body, agent = null) {
    const data = cleanProgram(body);
    const before = (await getProgram(ticketId)) ?? {};
    if (data.retestStatus && data.retestStatus !== before.retestStatus) { data.retestBy = agent?.name ?? null; data.retestAt = new Date(); }
    const keys = Object.keys(data);
    if (!keys.length) return before.ticketId ? before : null;
    const cols = keys.map((k) => `"${k}"`);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.ticket_program_details ("ticketId", ${cols.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT ("ticketId") DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, "updatedAt" = now() RETURNING *`,
        [ticketId, ...keys.map((k) => data[k])]);
    const after = rows[0];
    const { updateTicket } = require('./tickets');
    if (data.defectSeverity && data.defectSeverity !== before.defectSeverity) {
        const p = seed.SEVERITY_PRIORITY[data.defectSeverity];
        const cur = (await pool.query('SELECT priority FROM samadhan.tickets WHERE id = $1', [ticketId])).rows[0];
        if (p && cur && cur.priority !== p) await updateTicket(ticketId, { priority: p }, agent?.id ?? null, { skipAutomations: true });
    }
    if (data.retestStatus && data.retestStatus !== before.retestStatus) {
        await logActivity(ticketId, 'retest', { result: data.retestStatus }, agent?.id ?? null);
        if (data.retestStatus === 'Failed') {
            const retest = (await pool.query(`SELECT id FROM samadhan.ticket_statuses WHERE name = 'Retest'`)).rows[0]?.id;
            const t = (await pool.query('SELECT "statusId" FROM samadhan.tickets WHERE id = $1', [ticketId])).rows[0];
            if (retest && t && t.statusId !== retest) await updateTicket(ticketId, { statusId: retest }, agent?.id ?? null, { skipAutomations: true });
        }
    }
    return after;
}

/** §P: a defect needs its test cycle and a Passed retest before it is resolved. */
async function assertDefect(ticket) {
    if (!ticket.id || ticket.recordClass !== 'DEFECT' || ticket.workspaceKey !== 'S4_PROGRAM') return;
    const p = await getProgram(ticket.id);
    const missingFields = [];
    if (!p?.testCycle) missingFields.push('Test cycle');
    if (p?.retestStatus !== 'Passed') missingFields.push('Retest result "Passed"');
    if (missingFields.length) throw fail(400, `A defect needs these before it is resolved: ${missingFields.join(', ')}.`);
}

// ---------- programme numbers ----------
function scopeAnd(req) {
    const { scopeSql } = require('./ticketQuery');
    const s = scopeSql(req.scope, req.agent.id);
    return s ? `AND ${s}` : '';
}
const DEFECTS = `FROM samadhan.tickets t JOIN samadhan.workspaces w ON w.id = t."workspaceId" LEFT JOIN samadhan.ticket_program_details pd ON pd."ticketId" = t.id
                 WHERE w.key = 'S4_PROGRAM' AND t."recordClass" = 'DEFECT' AND t."deletedAt" IS NULL AND NOT t.spam`;

/** Open defects per day by severity for the last N days, plus found / fixed per day (burn-down). */
async function burndown(req, days = 30, testCycle = null) {
    const n = Math.min(120, Math.max(7, Number(days) || 30));
    const params = [n];
    const cyc = testCycle ? `AND pd."testCycle" = $${params.push(testCycle)}` : '';
    return quiet(async () => (await pool.query(
        `WITH d AS (SELECT generate_series(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - ($1::int - 1) * interval '1 day', date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata'), interval '1 day') AS day),
              x AS (SELECT t."createdAt" AT TIME ZONE 'Asia/Kolkata' AS c, t."resolvedAt" AT TIME ZONE 'Asia/Kolkata' AS r, COALESCE(pd."defectSeverity", 'S3 Medium') AS sev ${DEFECTS} ${cyc} ${scopeAnd(req)})
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                count(x.*) FILTER (WHERE x.c < d.day + interval '1 day' AND (x.r IS NULL OR x.r >= d.day + interval '1 day')) AS open,
                count(x.*) FILTER (WHERE x.c < d.day + interval '1 day' AND (x.r IS NULL OR x.r >= d.day + interval '1 day') AND x.sev IN ('S1 Critical', 'S2 High')) AS "openS1S2",
                count(x.*) FILTER (WHERE x.c >= d.day AND x.c < d.day + interval '1 day') AS found,
                count(x.*) FILTER (WHERE x.r >= d.day AND x.r < d.day + interval '1 day') AS fixed
         FROM d LEFT JOIN x ON true GROUP BY d.day ORDER BY d.day`, params)).rows.map((r) => ({ day: r.day, open: Number(r.open), openS1S2: Number(r.openS1S2), found: Number(r.found), fixed: Number(r.fixed) })), []);
}

async function kpis(req) {
    const and = scopeAnd(req);
    return quiet(async () => {
        const [sev, area, cycle, retest, totals] = await Promise.all([
            pool.query(`SELECT COALESCE(pd."defectSeverity", 'Unrated') AS k, count(*)::int AS n ${DEFECTS} AND t."resolvedAt" IS NULL ${and} GROUP BY 1 ORDER BY 1`),
            pool.query(`SELECT COALESCE(pd."processArea", t.category, 'Unassigned') AS k, count(*)::int AS n, count(*) FILTER (WHERE t."resolvedAt" IS NULL)::int AS open ${DEFECTS} ${and} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
            pool.query(`SELECT COALESCE(pd."testCycle", 'Unknown') AS k, count(*)::int AS n ${DEFECTS} ${and} GROUP BY 1 ORDER BY 2 DESC`),
            pool.query(`SELECT count(*) FILTER (WHERE pd."retestStatus" = 'Passed')::int AS passed, count(*) FILTER (WHERE pd."retestStatus" IN ('Passed', 'Failed'))::int AS tested ${DEFECTS} ${and}`),
            pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE t."resolvedAt" IS NULL)::int AS open,
                               count(*) FILTER (WHERE t."resolvedAt" IS NULL AND t."resolutionDueAt" < now())::int AS overdue,
                               count(*) FILTER (WHERE pd."testCycle" = ANY($1::text[]))::int AS late ${DEFECTS} ${and}`, [seed.LATE_CYCLES]),
        ]);
        const t = totals.rows[0];
        const r = retest.rows[0];
        return {
            total: t.total, open: t.open, overdue: t.overdue,
            leakagePct: t.total ? Math.round((t.late / t.total) * 1000) / 10 : null,
            retestPassPct: r.tested ? Math.round((r.passed / r.tested) * 1000) / 10 : null,
            bySeverity: sev.rows, byArea: area.rows, byCycle: cycle.rows,
        };
    }, { total: 0, open: 0, overdue: 0, leakagePct: null, retestPassPct: null, bySeverity: [], byArea: [], byCycle: [] });
}

/** Hypercare today: programme tickets raised today in the Hypercare phase / cycle, or of type Hypercare Incident. */
async function hypercareToday(req) {
    return quiet(async () => (await pool.query(
        `SELECT t.id, t.subject, t.priority, t."createdAt", s.name AS "statusName", s."isResolved", ap.code AS "applicationCode", pd."processArea", ag.name AS "agentName"
         FROM samadhan.tickets t JOIN samadhan.workspaces w ON w.id = t."workspaceId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         LEFT JOIN samadhan.ticket_program_details pd ON pd."ticketId" = t.id LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId" LEFT JOIN samadhan.agents ag ON ag.id = t."agentId"
         WHERE w.key = 'S4_PROGRAM' AND t."deletedAt" IS NULL AND (pd."activatePhase" = 'Hypercare' OR pd."testCycle" = 'Hypercare' OR t.type = 'Hypercare Incident')
           AND (t."createdAt" AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date ${scopeAnd(req)}
         ORDER BY t.priority DESC, t."createdAt" DESC LIMIT 200`)).rows.map((r) => ({ ...r, ref: r.applicationCode ? `${r.applicationCode}-${r.id}` : String(r.id) })), []);
}

module.exports = { assertDefect, burndown, cleanProgram, getProgram, hypercareToday, kpis, saveProgram };
