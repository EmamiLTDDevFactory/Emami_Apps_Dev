'use strict';
/*
   v7 Phase 7 (master prompt §P, §M, §N 5-7): major incidents, post-incident reviews (PIR), problems and the known-error
   database (KEDB), problem-candidate detection, duplicate hints on create, and the service-health counts.
     - Major incident: declared by someone with ticket.declareMajor, or flagged automatically when an Urgent ticket
       outside Secondary Sales is in Production (SAP / IT details). Leads and the team get a bell; an update is due
       every «30» minutes (setting 'major.updateMins'); a PIR is needed before it is resolved.
     - Problem: a PROBLEM ticket linked to its incidents (tickets."problemId"), with known-error fields; resolving it
       tells the agents of the linked open incidents.
     - Candidates: ≥ 3 incidents in 7 days with the same application + category + sub-category and no problem yet.
   Every reader tolerates a database before migration 7.7 (empty answers).
*/
const { pool } = require('../db/pool');
const { fail, logActivity, setting } = require('./util');

const missing = (e) => e.code === '42P01' || e.code === '42703';
const quiet = async (fn, fallback) => { try { return await fn(); } catch (e) { if (missing(e)) return fallback; throw e; } };
const PROBLEM_STATUSES = ['Under investigation', 'Known error', 'Fix in progress', 'Resolved'];
const CANDIDATE_MIN = 3;

async function bell(agentIds, ticketId, event, title, body = '') {
    const ids = [...new Set(agentIds.filter(Boolean))];
    if (!ids.length) return;
    await pool.query(
        `INSERT INTO samadhan.notifications ("agentId", "ticketId", event, title, body)
         SELECT a.id, $2, $3, $4, $5 FROM samadhan.agents a WHERE a.id = ANY($1::int[]) AND a.active AND NOT (COALESCE(a.prefs -> 'bellMuted', '[]'::jsonb) ? $3)`,
        [ids, ticketId, event, String(title).slice(0, 300), String(body).slice(0, 500)]);
}
async function teamOf(t) {
    const members = t.groupId ? (await pool.query('SELECT "agentId" FROM samadhan.group_members WHERE "groupId" = $1', [t.groupId])).rows.map((r) => r.agentId) : [];
    return [t.agentId, ...members];
}
const updateMins = async () => { const v = Number(await setting('major.updateMins').catch(() => null)); return Number.isInteger(v) && v >= 5 && v <= 240 ? v : 30; };

// ---------- major incidents ----------
async function declareMajor(ticketId, { bridgeUrl, note } = {}, agent = null, auto = false) {
    const { loadTicket } = require('./notify');
    const t = await loadTicket(ticketId);
    if (t.isMajorIncident) {
        if (auto) return t;
        throw fail(409, 'This ticket is already a major incident.');
    }
    const url = String(bridgeUrl || '').trim().slice(0, 500) || null;
    if (url && !/^https?:\/\//i.test(url)) throw fail(400, 'Bridge link: start with https://');
    const mins = await updateMins();
    await pool.query(`UPDATE samadhan.tickets SET "isMajorIncident" = true, "majorDeclaredAt" = now(), "majorBridgeUrl" = $2, "majorNextUpdateAt" = now() + ($3 || ' minutes')::interval,
                      "majorRemindedAt" = NULL WHERE id = $1`, [ticketId, url, String(mins)]);
    await logActivity(ticketId, 'major_declared', { auto, ...(note ? { note: String(note).slice(0, 500) } : {}), ...(url ? { bridge: url } : {}) }, agent?.id ?? null);
    const { agentsWith } = require('./change');
    const leads = (await agentsWith('ticket.declareMajor')).map((a) => a.id);
    await bell([...leads, ...(await teamOf(t))], ticketId, 'escalated', `MAJOR INCIDENT ${t.displayRef ?? `#${t.id}`}: ${t.subject}`, auto ? 'Flagged automatically: Urgent in Production.' : String(note || ''));
    return loadTicket(ticketId);
}

async function standDown(ticketId, { note } = {}, agent = null) {
    const r = await pool.query(`UPDATE samadhan.tickets SET "isMajorIncident" = false, "majorNextUpdateAt" = NULL WHERE id = $1 AND "isMajorIncident" RETURNING id`, [ticketId]);
    if (!r.rows.length) throw fail(409, 'This ticket is not a major incident.');
    await logActivity(ticketId, 'major_stood_down', note ? { note: String(note).slice(0, 500) } : {}, agent?.id ?? null);
}

/** A stakeholder update: a private note on the ticket plus the next-update clock restarted. */
async function majorUpdate(ticketId, text, agent) {
    const body = String(text || '').trim();
    if (body.length < 5) throw fail(400, 'Write the update (what is known, what is being done, next step).');
    const t = (await pool.query('SELECT "isMajorIncident" FROM samadhan.tickets WHERE id = $1', [ticketId])).rows[0];
    if (!t?.isMajorIncident) throw fail(409, 'This ticket is not a major incident.');
    const { textToHtml, stripTags } = require('./util');
    const html = textToHtml(`Major incident update: ${body}`);
    await pool.query(`INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "agentId") VALUES ($1, 'NOTE', $2, $3, $4)`, [ticketId, html, stripTags(html), agent.id]);
    const mins = await updateMins();
    await pool.query(`UPDATE samadhan.tickets SET "majorNextUpdateAt" = now() + ($2 || ' minutes')::interval, "majorRemindedAt" = NULL WHERE id = $1`, [ticketId, String(mins)]);
    await logActivity(ticketId, 'major_update', { text: body.slice(0, 300) }, agent.id);
}

/** §P: Urgent + Production outside Secondary Sales flags a major incident (once; standing down is respected). */
async function autoMajor(ticketId) {
    return quiet(async () => {
        const r = (await pool.query(
            `SELECT t.id, t.priority, t."isMajorIncident", t."majorDeclaredAt", w.key AS desk,
                    COALESCE(sd.environment, itd.environment) AS env
             FROM samadhan.tickets t LEFT JOIN samadhan.workspaces w ON w.id = t."workspaceId"
             LEFT JOIN samadhan.ticket_sap_details sd ON sd."ticketId" = t.id LEFT JOIN samadhan.ticket_it_details itd ON itd."ticketId" = t.id
             WHERE t.id = $1`, [ticketId])).rows[0];
        if (!r || r.isMajorIncident || r.majorDeclaredAt || !r.desk || r.desk === 'SEC_SALES') return false;
        if (r.priority !== 4 || r.env !== 'Production') return false;
        if ((await setting('major.autoFlag').catch(() => null)) === false) return false;
        await declareMajor(ticketId, {}, null, true);
        return true;
    }, false);
}

/** Job: a bell when a major incident's next update is overdue (once per period). */
async function majorReminders() {
    const rows = await quiet(async () => (await pool.query(
        `SELECT t.* FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE t."isMajorIncident" AND NOT s."isResolved" AND t."deletedAt" IS NULL AND t."majorNextUpdateAt" < now()
           AND (t."majorRemindedAt" IS NULL OR t."majorRemindedAt" < t."majorNextUpdateAt")`)).rows, []);
    const { withRef } = require('./notify');
    for (const t of rows) {
        await withRef(t);
        await bell(await teamOf(t), t.id, 'escalated', `Update due on major incident ${t.displayRef}`, t.subject);
        await pool.query('UPDATE samadhan.tickets SET "majorRemindedAt" = now() WHERE id = $1', [t.id]);
    }
    return rows.length;
}

// ---------- PIR ----------
const getPir = (ticketId) => quiet(async () => (await pool.query('SELECT * FROM samadhan.post_incident_reviews WHERE "ticketId" = $1', [ticketId])).rows[0] ?? null, null);

async function savePir(ticketId, b = {}, agent) {
    const { LISTS } = require('./sapSeed');
    const t = (s, n = 8000) => String(s ?? '').trim().slice(0, n) || null;
    const list = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => (typeof x === 'string' ? { text: x.trim() } : { text: String(x.text || '').trim(), owner: x.owner ? String(x.owner).slice(0, 120) : undefined, due: x.due || undefined }))
        .filter((x) => x.text).slice(0, 30);
    const set = {};
    for (const k of ['summary', 'rootCause', 'contributingFactors', 'impactDescription']) if (b[k] !== undefined) set[k] = t(b[k]);
    if (b.rootCauseCategory !== undefined) {
        if (b.rootCauseCategory && !LISTS.rootCause.includes(b.rootCauseCategory)) throw fail(400, 'Root cause category: pick one from the list.');
        set.rootCauseCategory = b.rootCauseCategory || null;
    }
    if (b.timeline !== undefined) set.timeline = JSON.stringify(list(b.timeline));
    if (b.correctiveActions !== undefined) set.correctiveActions = JSON.stringify(list(b.correctiveActions));
    if (b.preventiveActions !== undefined) set.preventiveActions = JSON.stringify(list(b.preventiveActions));
    if (b.reviewed === true) { set.reviewedBy = agent?.name ?? null; set.reviewedAt = new Date(); }
    const keys = Object.keys(set);
    if (!keys.length) return getPir(ticketId);
    const cols = keys.map((k) => `"${k}"`);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.post_incident_reviews ("ticketId", ${cols.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT ("ticketId") DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, "updatedAt" = now() RETURNING *`,
        [ticketId, ...keys.map((k) => set[k])]);
    await logActivity(ticketId, b.reviewed === true ? 'pir_reviewed' : 'pir_updated', {}, agent?.id ?? null);
    return rows[0];
}

/** Before resolving: a major incident needs its PIR (summary + root cause). */
async function assertPir(ticket) {
    if (!ticket.id || !ticket.isMajorIncident) return;
    const pir = await getPir(ticket.id);
    if (!pir?.summary || !pir?.rootCause) throw fail(400, 'This is a major incident: fill in the post-incident review (summary and root cause) before resolving it.');
}

// ---------- problems and the KEDB ----------
const getKnownError = (ticketId) => quiet(async () => (await pool.query('SELECT * FROM samadhan.problem_details WHERE "ticketId" = $1', [ticketId])).rows[0] ?? null, null);

async function saveKnownError(ticketId, b = {}, agent) {
    const t = (s, n = 8000) => String(s ?? '').trim().slice(0, n) || null;
    const set = {};
    for (const k of ['symptom', 'workaround', 'rootCause', 'permanentFix']) if (b[k] !== undefined) set[k] = t(b[k]);
    if (b.status !== undefined) {
        if (!PROBLEM_STATUSES.includes(b.status)) throw fail(400, `Status: one of ${PROBLEM_STATUSES.join(', ')}.`);
        set.status = b.status;
    }
    if (b.knownError !== undefined) set.knownError = b.knownError === true;
    if (set.knownError && !(set.workaround ?? (await getKnownError(ticketId))?.workaround)) throw fail(400, 'A known error needs its workaround.');
    const keys = Object.keys(set);
    if (!keys.length) return getKnownError(ticketId);
    const cols = keys.map((k) => `"${k}"`);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.problem_details ("ticketId", ${cols.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT ("ticketId") DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, "updatedAt" = now() RETURNING *`,
        [ticketId, ...keys.map((k) => set[k])]);
    await logActivity(ticketId, 'known_error_updated', { fields: keys }, agent?.id ?? null);
    return rows[0];
}

const linkedIncidents = (problemId) => quiet(async () => (await pool.query(
    `SELECT t.id, t.subject, t."applicationId", ap.code AS "applicationCode", s.name AS "statusName", s."isResolved", t."createdAt", t."isMajorIncident"
     FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId"
     WHERE t."problemId" = $1 AND t."deletedAt" IS NULL ORDER BY t.id`, [problemId])).rows.map((r) => ({ ...r, ref: r.applicationCode ? `${r.applicationCode}-${r.id}` : String(r.id) })), []);

async function problemOf(ticket) {
    if (!ticket.problemId) return null;
    return quiet(async () => {
        const r = (await pool.query(
            `SELECT t.id, t.subject, ap.code AS "applicationCode", s.name AS "statusName", s."isResolved", pd."knownError", pd.workaround, pd.status AS "problemStatus"
             FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId"
             LEFT JOIN samadhan.problem_details pd ON pd."ticketId" = t.id WHERE t.id = $1`, [ticket.problemId])).rows[0];
        return r ? { ...r, ref: r.applicationCode ? `${r.applicationCode}-${r.id}` : String(r.id) } : null;
    }, null);
}

/** Links incidents to a problem (or unlinks with problemId null). Only PROBLEM tickets can be problems. */
async function linkToProblem(ticketIds, problemId, agent) {
    if (problemId) {
        const p = (await pool.query('SELECT id, "recordClass" FROM samadhan.tickets WHERE id = $1 AND "deletedAt" IS NULL', [problemId])).rows[0];
        if (!p) throw fail(404, `Problem #${problemId} not found.`);
        if (p.recordClass !== 'PROBLEM') throw fail(400, `#${problemId} is not a problem record.`);
        if (ticketIds.includes(problemId)) throw fail(400, 'A problem cannot be linked to itself.');
    }
    const r = await pool.query(`UPDATE samadhan.tickets SET "problemId" = $2 WHERE id = ANY($1::int[]) AND COALESCE("recordClass", 'INCIDENT') <> 'PROBLEM' RETURNING id`, [ticketIds, problemId]);
    for (const { id } of r.rows) await logActivity(id, problemId ? 'linked_to_problem' : 'unlinked_from_problem', problemId ? { problem: problemId } : {}, agent?.id ?? null);
    if (problemId && r.rows.length) await logActivity(problemId, 'incidents_linked', { tickets: r.rows.map((x) => x.id) }, agent?.id ?? null);
    return r.rows.map((x) => x.id);
}

/** Creates a PROBLEM ticket from one or more incidents (same application), and links them. */
async function createProblem(incidentIds, { subject, description } = {}, agent) {
    const ids = [...new Set(incidentIds.map(Number).filter(Number.isInteger))].slice(0, 200);
    if (!ids.length) throw fail(400, 'Pick at least one incident.');
    const first = (await pool.query(
        `SELECT t.*, c.email AS "requesterEmail", c.name AS "requesterName" FROM samadhan.tickets t JOIN samadhan.contacts c ON c.id = t."requesterId" WHERE t.id = $1`, [ids[0]])).rows[0];
    if (!first) throw fail(404, 'Incident not found.');
    const { createTicket } = require('./tickets');
    const { textToHtml } = require('./util');
    const t = await createTicket({
        applicationId: first.applicationId ?? undefined,
        subject: String(subject || `Problem: ${first.subject}`).slice(0, 300),
        description: textToHtml(String(description || `Recurring issue across ${ids.length} incident(s): ${ids.map((i) => `#${i}`).join(', ')}.`)),
        requester: { email: agent?.email || first.requesterEmail, name: agent?.name || first.requesterName },
        source: 'Internal',
        fields: { recordClass: 'PROBLEM', category: first.category ?? undefined, function: first.function ?? undefined, groupId: first.groupId ?? undefined },
        actorAgentId: agent?.id ?? null, actorName: agent?.name,
    });
    await pool.query(`INSERT INTO samadhan.problem_details ("ticketId", status) VALUES ($1, 'Under investigation') ON CONFLICT DO NOTHING`, [t.id]);
    await linkToProblem(ids, t.id, agent);
    return t;
}

/** When a problem is resolved: the agents of its linked open incidents hear about it (they can resolve theirs). */
async function afterProblemResolved(problem) {
    if (problem.recordClass !== 'PROBLEM') return;
    const open = (await linkedIncidents(problem.id)).filter((i) => !i.isResolved);
    if (!open.length) return;
    // The agents on those incidents; for an unassigned incident, its group's members.
    const agents = (await pool.query(
        `SELECT t."agentId" AS id FROM samadhan.tickets t WHERE t.id = ANY($1::int[]) AND t."agentId" IS NOT NULL
         UNION SELECT m."agentId" FROM samadhan.tickets t JOIN samadhan.group_members m ON m."groupId" = t."groupId" WHERE t.id = ANY($1::int[]) AND t."agentId" IS NULL`,
        [open.map((i) => i.id)])).rows.map((r) => r.id);
    await bell(agents, problem.id, 'status_changed', `Problem resolved: #${problem.id} - ${open.length} linked incident(s) still open`, problem.subject);
}

// ---------- candidates ----------
async function detectCandidates() {
    return quiet(async () => {
        const { rows } = await pool.query(
            `SELECT t."applicationId", t.category, t."function", array_agg(t.id ORDER BY t.id) AS ids
             FROM samadhan.tickets t
             WHERE t."createdAt" > now() - interval '7 days' AND t."deletedAt" IS NULL AND NOT t.spam AND t."problemId" IS NULL
               AND COALESCE(t."recordClass", 'INCIDENT') = 'INCIDENT' AND t.category IS NOT NULL AND t."applicationId" IS NOT NULL
             GROUP BY 1, 2, 3 HAVING count(*) >= $1`, [CANDIDATE_MIN]);
        let n = 0;
        for (const r of rows) {
            const key = `${r.applicationId}|${r.category}|${r.function ?? ''}`;
            const res = await pool.query(
                `INSERT INTO samadhan.problem_candidates (key, "applicationId", category, "function", "ticketIds") VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (key) DO UPDATE SET "ticketIds" = EXCLUDED."ticketIds", "updatedAt" = now()
                   WHERE samadhan.problem_candidates."dismissedAt" IS NULL AND samadhan.problem_candidates."problemTicketId" IS NULL
                 RETURNING (xmax = 0) AS inserted`, [key, r.applicationId, r.category, r.function, r.ids]);
            if (res.rows[0]?.inserted) n++;
        }
        return n;
    }, 0);
}

const listCandidates = () => quiet(async () => (await pool.query(
    `SELECT pc.*, ap.code AS "applicationCode", ap.name AS "applicationName", cardinality(pc."ticketIds") AS count
     FROM samadhan.problem_candidates pc LEFT JOIN samadhan.applications ap ON ap.id = pc."applicationId"
     WHERE pc."dismissedAt" IS NULL AND pc."problemTicketId" IS NULL ORDER BY cardinality(pc."ticketIds") DESC, pc."updatedAt" DESC LIMIT 50`)).rows, []);

async function candidateToProblem(id, agent) {
    const c = (await pool.query('SELECT * FROM samadhan.problem_candidates WHERE id = $1 AND "dismissedAt" IS NULL AND "problemTicketId" IS NULL', [id])).rows[0];
    if (!c) throw fail(404, 'Candidate not found (already turned into a problem or dismissed).');
    const t = await createProblem(c.ticketIds, { subject: `Problem: recurring ${c.category}${c.function ? ` / ${c.function}` : ''}` }, agent);
    await pool.query('UPDATE samadhan.problem_candidates SET "problemTicketId" = $2 WHERE id = $1', [id, t.id]);
    return t;
}

async function dismissCandidate(id, agent) {
    const r = await pool.query('UPDATE samadhan.problem_candidates SET "dismissedAt" = now(), "dismissedBy" = $2 WHERE id = $1 AND "dismissedAt" IS NULL RETURNING id', [id, agent?.name ?? null]);
    if (!r.rows.length) throw fail(404, 'Candidate not found.');
}

// ---------- duplicate hint on create (§P) ----------
async function duplicates(req, { applicationId, tcode, errorText, serverName, subject }) {
    const { scopeSql } = require('./ticketQuery');
    const s = scopeSql(req.scope, req.agent.id);
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    const ors = [];
    if (tcode) ors.push(`EXISTS (SELECT 1 FROM samadhan.ticket_sap_details d WHERE d."ticketId" = t.id AND d.tcode = ${p(String(tcode).toUpperCase())})`);
    if (errorText && String(errorText).trim().length >= 8) ors.push(`EXISTS (SELECT 1 FROM samadhan.ticket_sap_details d WHERE d."ticketId" = t.id AND d."errorText" ILIKE ${p(`%${String(errorText).trim().slice(0, 80)}%`)})`);
    if (serverName) ors.push(`EXISTS (SELECT 1 FROM samadhan.ticket_it_details i WHERE i."ticketId" = t.id AND lower(i."serverName") = lower(${p(String(serverName))}))`);
    if (subject && String(subject).trim().length >= 6) ors.push(`t.subject ILIKE ${p(`%${String(subject).trim().slice(0, 60)}%`)}`);
    if (!ors.length || !applicationId) return [];
    return quiet(async () => (await pool.query(
        `SELECT t.id, t.subject, t."createdAt", ap.code AS "applicationCode", s.name AS "statusName", ag.name AS "agentName"
         FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId"
         LEFT JOIN samadhan.agents ag ON ag.id = t."agentId"
         WHERE t."applicationId" = ${p(Number(applicationId))} AND NOT s."isResolved" AND t."deletedAt" IS NULL AND NOT t.spam
           AND t."createdAt" > now() - interval '24 hours' AND (${ors.join(' OR ')}) ${s ? `AND ${s}` : ''}
         ORDER BY t."createdAt" DESC LIMIT 5`, params)).rows.map((r) => ({ ...r, ref: r.applicationCode ? `${r.applicationCode}-${r.id}` : String(r.id) })), []);
}

// ---------- service health (dashboard) ----------
async function health(req) {
    const { scopeSql } = require('./ticketQuery');
    const s = scopeSql(req.scope, req.agent.id);
    const and = s ? `AND ${s}` : '';
    const open = `t."deletedAt" IS NULL AND NOT t.spam AND NOT s."isResolved"`;
    const from = 'FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"';
    const one = async (sql) => quiet(async () => Number((await pool.query(sql)).rows[0]?.n ?? 0), 0);
    const [major, problems, knownErrors, approvals, external, changesWeek, candidates, majorList] = await Promise.all([
        one(`SELECT count(*) AS n ${from} WHERE ${open} AND t."isMajorIncident" ${and}`),
        one(`SELECT count(*) AS n ${from} WHERE ${open} AND t."recordClass" = 'PROBLEM' ${and}`),
        one(`SELECT count(*) AS n ${from} JOIN samadhan.problem_details pd ON pd."ticketId" = t.id WHERE t."deletedAt" IS NULL AND pd."knownError" ${and}`),
        one(`SELECT count(DISTINCT a."ticketId") AS n FROM samadhan.ticket_approvals a JOIN samadhan.tickets t ON t.id = a."ticketId" WHERE a.state = 'Pending' AND t."deletedAt" IS NULL ${and}`),
        one(`SELECT count(*) AS n FROM samadhan.ticket_external_refs r JOIN samadhan.tickets t ON t.id = r."ticketId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
             WHERE ${open} AND COALESCE(r.status, '') NOT IN ('Closed', 'Confirmed') ${and}`),
        one(`SELECT count(*) AS n FROM samadhan.ticket_change_details d JOIN samadhan.tickets t ON t.id = d."ticketId"
             WHERE t."deletedAt" IS NULL AND d."plannedStart" BETWEEN now() AND now() + interval '7 days' ${and}`),
        one('SELECT count(*) AS n FROM samadhan.problem_candidates WHERE "dismissedAt" IS NULL AND "problemTicketId" IS NULL'),
        quiet(async () => (await pool.query(
            `SELECT t.id, t.subject, t."majorDeclaredAt", t."majorNextUpdateAt", t."majorBridgeUrl", ap.code AS "applicationCode" ${from}
             LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId" WHERE ${open} AND t."isMajorIncident" ${and} ORDER BY t."majorDeclaredAt" DESC LIMIT 5`)).rows
            .map((r) => ({ ...r, ref: r.applicationCode ? `${r.applicationCode}-${r.id}` : String(r.id) })), []),
    ]);
    return { major, problems, knownErrors, approvals, external, changesWeek, candidates, majorList };
}

module.exports = {
    PROBLEM_STATUSES, afterProblemResolved, assertPir, autoMajor, candidateToProblem, createProblem, declareMajor, detectCandidates, dismissCandidate, duplicates,
    getKnownError, getPir, health, linkToProblem, linkedIncidents, listCandidates, majorReminders, majorUpdate, problemOf, saveKnownError, savePir, standDown,
};
