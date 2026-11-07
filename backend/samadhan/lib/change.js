'use strict';
/*
   v7 Phase 6 (master prompt §I, §M, §P): change and access.
     - transports per ticket (SAP), with the status pipeline and the PRD sign-off rules;
     - change planning (type, risk, planned window, transports N/A, access validity) with FREEZE-window checks;
     - approval chains: steps started on a ticket, decided in Samadhan (My approvals) or by a one-click email link
       (single-use token, 7 days), segregation of duties (requester, approver and implementer are different people);
     - the service catalogue, the change calendar, and the change / access rules checked before a ticket is resolved.
   Every reader tolerates a database before migration 7.6 (empty answers).
*/
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { STATUS } = require('../constants');
const { fail, logActivity, setting } = require('./util');
const seed = require('./changeSeed');

const missingTable = (e) => e.code === '42P01' || e.code === '42703';
const quiet = async (fn, fallback) => { try { return await fn(); } catch (e) { if (missingTable(e)) return fallback; throw e; } };
const OPEN_STATES = ['Pending', 'Waiting'];
const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const day = 86_400_000;

// ---------- transports ----------
async function trRegex() {
    const custom = await setting('transport.regex').catch(() => null);
    try { return new RegExp(typeof custom === 'string' && custom ? custom : seed.TR_RE_DEFAULT); } catch { return new RegExp(seed.TR_RE_DEFAULT); }
}
const listTransports = (ticketId) => quiet(async () => (await pool.query('SELECT * FROM samadhan.ticket_transports WHERE "ticketId" = $1 ORDER BY id', [ticketId])).rows, []);

async function addTransport(ticketId, b = {}, agent) {
    const trNumber = String(b.trNumber || '').trim().toUpperCase();
    if (!(await trRegex()).test(trNumber)) throw fail(400, 'Transport number: SID + K9 + 5 digits, e.g. ECDK900123.');
    const trType = b.trType ? String(b.trType) : null;
    if (trType && !seed.TR_TYPES.includes(trType)) throw fail(400, `Transport type: one of ${seed.TR_TYPES.join(', ')}.`);
    const dup = await pool.query('SELECT 1 FROM samadhan.ticket_transports WHERE "ticketId" = $1 AND "trNumber" = $2', [ticketId, trNumber]);
    if (dup.rows.length) throw fail(409, `${trNumber} is already on this ticket.`);
    const targets = (Array.isArray(b.targetSystems) ? b.targetSystems : String(b.targetSystems || '').split(/[\s,;]+/)).map((x) => String(x).trim().toUpperCase()).filter(Boolean).slice(0, 10);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.ticket_transports ("ticketId", "trNumber", description, "trType", owner, "sourceSystem", status, "targetSystems", notes, "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6, 'Created', $7, $8, $9) RETURNING *`,
        [ticketId, trNumber, String(b.description || '').trim().slice(0, 500) || null, trType, String(b.owner || agent?.name || '').slice(0, 120) || null,
            trNumber.slice(0, 3), targets, String(b.notes || '').slice(0, 2000) || null, agent?.id ?? null]);
    return rows[0];
}

/** Status moves record who / when; PRD needs a QAS test, a sign-off by someone other than the owner, then the import. */
async function updateTransport(ticketId, id, b = {}, agent, can = () => false) {
    const cur = (await pool.query('SELECT * FROM samadhan.ticket_transports WHERE id = $1 AND "ticketId" = $2', [id, ticketId])).rows[0];
    if (!cur) throw fail(404, 'Transport not found.');
    const set = {};
    if (b.description !== undefined) set.description = String(b.description || '').slice(0, 500) || null;
    if (b.notes !== undefined) set.notes = String(b.notes || '').slice(0, 2000) || null;
    if (b.returnCode !== undefined && b.returnCode !== null && b.returnCode !== '') {
        const rc = Number(b.returnCode);
        if (!Number.isInteger(rc) || rc < 0 || rc > 99) throw fail(400, 'Return code: a whole number (0, 4, 8, 12 ...).');
        set.returnCode = rc;
        if (rc >= 8) set.status = 'Failed (RC ≥ 8)';
    }
    if (b.status !== undefined && !set.status) {
        const s = String(b.status);
        if (!seed.TR_STATUSES.includes(s)) throw fail(400, `Status: one of ${seed.TR_STATUSES.join(', ')}.`);
        const at = seed.TR_STATUSES.indexOf.bind(seed.TR_STATUSES);
        if (s === 'Tested OK in QAS') { set.testedOkBy = agent?.name ?? null; set.testedOkById = agent?.id ?? null; }
        if (s === 'Imported to QAS') set.importedQasAt = new Date();
        if (s === 'Approved for PRD') {
            if (!cur.testedOkBy) throw fail(400, 'Mark the transport "Tested OK in QAS" first - PRD needs test evidence.');
            if (!can('approval.override') && agent && (agent.id === cur.createdBy || agent.id === cur.testedOkById)) {
                throw fail(403, 'Segregation of duties: the PRD sign-off must come from someone other than the transport owner and the tester.');
            }
            set.approvedForPrdBy = agent?.name ?? null;
        }
        if (s === 'Imported to PRD') {
            if (!cur.approvedForPrdBy && !set.approvedForPrdBy) throw fail(400, 'The transport needs "Approved for PRD" before the PRD import.');
            set.importedPrdAt = new Date();
        }
        if (at(s) < 0) throw fail(400, 'Unknown status.');
        set.status = s;
    }
    const keys = Object.keys(set);
    if (!keys.length) return cur;
    const { rows } = await pool.query(
        `UPDATE samadhan.ticket_transports SET ${keys.map((k, i) => `"${k}" = $${i + 3}`).join(', ')}, "updatedAt" = now() WHERE id = $1 AND "ticketId" = $2 RETURNING *`,
        [id, ticketId, ...keys.map((k) => set[k])]);
    return rows[0];
}

async function deleteTransport(ticketId, id) {
    const { rows } = await pool.query('DELETE FROM samadhan.ticket_transports WHERE id = $1 AND "ticketId" = $2 RETURNING "trNumber"', [id, ticketId]);
    if (!rows.length) throw fail(404, 'Transport not found.');
    return rows[0];
}

// ---------- change planning ----------
const getChange = (ticketId) => quiet(async () => (await pool.query('SELECT * FROM samadhan.ticket_change_details WHERE "ticketId" = $1', [ticketId])).rows[0] ?? null, null);

/** FREEZE windows overlapping [start, end] for a desk (desk-less windows apply everywhere). */
async function freezeConflicts(workspaceId, start, end) {
    if (!start) return [];
    return quiet(async () => (await pool.query(
        `SELECT id, name, "startsAt", "endsAt" FROM samadhan.change_windows
         WHERE kind = 'FREEZE' AND ("workspaceId" IS NULL OR "workspaceId" = $1) AND "startsAt" < $3 AND "endsAt" > $2 ORDER BY "startsAt"`,
        [workspaceId ?? null, start, end ?? new Date(new Date(start).getTime() + 3_600_000)])).rows, []);
}

function parseDate(v, label) {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw fail(400, `${label}: not a valid date / time.`);
    return d;
}

async function saveChange(ticket, b = {}, agent, can = () => false) {
    const cur = (await getChange(ticket.id)) ?? {};
    const set = {};
    if (b.changeType !== undefined) {
        if (b.changeType && !seed.CHANGE_TYPES.includes(b.changeType)) throw fail(400, `Change type: one of ${seed.CHANGE_TYPES.join(', ')}.`);
        set.changeType = b.changeType || null;
    }
    if (b.changeRisk !== undefined) {
        if (b.changeRisk && !seed.CHANGE_RISKS.includes(b.changeRisk)) throw fail(400, `Risk: one of ${seed.CHANGE_RISKS.join(', ')}.`);
        set.changeRisk = b.changeRisk || null;
    }
    for (const [k, label] of [['plannedStart', 'Planned start'], ['plannedEnd', 'Planned end']]) {
        const d = parseDate(b[k], label);
        if (d !== undefined) set[k] = d;
    }
    const av = parseDate(b.accessValidTo, 'Access valid until');
    if (av !== undefined) set.accessValidTo = av;
    if (b.transportsNa !== undefined) set.transportsNa = b.transportsNa === true;
    if (b.testEvidence !== undefined) set.testEvidence = String(b.testEvidence || '').trim().slice(0, 4000) || null;
    if (b.implementationPlan !== undefined) set.implementationPlan = String(b.implementationPlan || '').trim().slice(0, 8000) || null;
    if (b.backoutPlan !== undefined) set.backoutPlan = String(b.backoutPlan || '').trim().slice(0, 8000) || null;
    const start = set.plannedStart !== undefined ? set.plannedStart : cur.plannedStart;
    const end = set.plannedEnd !== undefined ? set.plannedEnd : cur.plannedEnd;
    if (start && end && new Date(end) <= new Date(start)) throw fail(400, 'The planned end must be after the planned start.');
    let override = null;
    if (set.plannedStart !== undefined || set.plannedEnd !== undefined) {
        if (!can('change.schedule')) throw fail(403, "Scheduling a change needs the 'change.schedule' permission.");
        const hits = await freezeConflicts(ticket.workspaceId, start, end);
        if (hits.length) {
            const reason = String(b.freezeReason || '').trim();
            if (!can('change.freezeOverride') || reason.length < 5) {
                const err = fail(409, `The planned window falls in a change freeze: ${hits.map((h) => h.name).join(', ')}. ${can('change.freezeOverride') ? 'Give a reason to schedule it anyway.' : "Pick another window, or ask someone with 'change.freezeOverride'."}`);
                err.freeze = hits;
                throw err;
            }
            override = { windows: hits.map((h) => h.name), reason };
            set.freezeOverrideReason = reason;
        }
    }
    const keys = Object.keys(set);
    if (!keys.length) return { change: cur.ticketId ? cur : null, override: null, changed: [] };
    const cols = keys.map((k) => `"${k}"`);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.ticket_change_details ("ticketId", ${cols.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT ("ticketId") DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, "updatedAt" = now() RETURNING *`,
        [ticket.id, ...keys.map((k) => set[k])]);
    const changed = keys.filter((k) => String(cur[k] ?? '') !== String(rows[0][k] ?? ''));
    if (changed.length) await logActivity(ticket.id, 'change_planned', { fields: changed, ...(override ? { freezeOverride: override } : {}) }, agent?.id ?? null);
    return { change: rows[0], override, changed };
}

// ---------- approvals ----------
const listChains = (workspaceId) => quiet(async () => (await pool.query(
    `SELECT * FROM samadhan.approval_chains WHERE active AND ($1::int IS NULL OR "workspaceId" IS NULL OR "workspaceId" = $1) ORDER BY "workspaceId" NULLS LAST, name`,
    [workspaceId ?? null])).rows, []);

const listApprovals = (ticketId) => quiet(async () => (await pool.query(
    `SELECT a.id, a."ticketId", a."chainId", c.name AS "chainName", a."stepNo", a."stepName", a."approverType", a."approverAgentId", ag.name AS "approverAgentName",
            a."approverEmail", a.state, a.decision, a.comment, a."decidedAt", a."decidedBy", a."dueAt", a."createdAt", a.round
     FROM samadhan.ticket_approvals a LEFT JOIN samadhan.approval_chains c ON c.id = a."chainId" LEFT JOIN samadhan.agents ag ON ag.id = a."approverAgentId"
     WHERE a."ticketId" = $1 ORDER BY a.round, a."stepNo"`, [ticketId])).rows, []);

/** Active agents holding a permission (approvers for "approver" steps). */
async function agentsWith(key) {
    const { loadAccess } = require('../middleware/permission');
    const agents = (await pool.query('SELECT id, role, email, name FROM samadhan.agents WHERE active')).rows;
    const out = [];
    for (const a of agents) if ((await loadAccess(a)).permissions.has(key)) out.push(a);
    return out;
}

async function bellTo(agentIds, ticket, title, body = '') {
    const ids = [...new Set(agentIds.filter(Boolean))];
    if (!ids.length) return;
    await pool.query(
        `INSERT INTO samadhan.notifications ("agentId", "ticketId", event, title, body)
         SELECT a.id, $2, 'approval', $3, $4 FROM samadhan.agents a WHERE a.id = ANY($1::int[]) AND a.active AND NOT (COALESCE(a.prefs -> 'bellMuted', '[]'::jsonb) ? 'approval')`,
        [ids, ticket.id, String(title).slice(0, 300), String(body).slice(0, 500)]);
}

/** Tells the approver of a step: a bell for agents, and an email with one-click links (single-use token) for a named person. */
async function notifyStep(step, ticket, reminder = false) {
    const ref = ticket.displayRef ?? `#${ticket.id}`;
    const title = `${reminder ? 'Reminder: approval' : 'Approval'} needed (${step.stepName}): ${ref}`;
    let agentIds = [];
    if (step.approverAgentId) agentIds = [step.approverAgentId];
    else if (step.approverType === 'approver') agentIds = (await agentsWith('approval.decide')).filter((a) => !ticket.requesterEmail || a.email.toLowerCase() !== String(ticket.requesterEmail).toLowerCase()).map((a) => a.id);
    await bellTo(agentIds, ticket, title, ticket.subject);
    if (step.approverEmail) {
        const token = crypto.randomBytes(24).toString('base64url');
        await pool.query(`UPDATE samadhan.ticket_approvals SET "tokenHash" = $2, "tokenExpiresAt" = now() + interval '7 days' WHERE id = $1`, [step.id, hash(token)]);
        const { APP_URL } = require('../../ccbTeams');
        const { sendMail } = require('./mail');
        const { esc } = require('./util');
        const link = `${APP_URL}/apps/samadhan/portal/?approval=${encodeURIComponent(token)}`;
        await sendMail({
            to: [step.approverEmail],
            subject: `${reminder ? 'Reminder: ' : ''}Approval needed - ${ref} ${ticket.subject}`.slice(0, 250),
            html: `<p>Hello,</p><p>Your approval is needed as <b>${esc(step.stepName)}</b> for <b>${esc(ref)}</b>: ${esc(ticket.subject)}.</p>`
                + `<p><a href="${link}">Open the request to approve or reject it</a> (the link works once and expires in 7 days).</p><p>Emami Service Desk</p>`,
        }).catch((e) => console.error('[samadhan] approval mail:', e.message));
    }
}

async function statusIdByName(name) {
    return quiet(async () => (await pool.query('SELECT id FROM samadhan.ticket_statuses WHERE name = $1', [name])).rows[0]?.id ?? null, null);
}

async function setTicketStatus(ticketId, statusId, agentId) {
    if (!statusId) return;
    const { updateTicket } = require('./tickets');
    await updateTicket(ticketId, { statusId }, agentId ?? null, { skipAutomations: true }).catch((e) => console.error('[samadhan] approval status:', e.message));
}

/** Starts a chain on a ticket: step 1 Pending (due in 2 days), the others Waiting; the ticket waits in "Awaiting Approval". */
async function startApproval(ticket, chainId, { managerEmail } = {}, agent = null) {
    const chain = (await pool.query('SELECT * FROM samadhan.approval_chains WHERE id = $1 AND active', [chainId])).rows[0];
    if (!chain) throw fail(400, 'Unknown or inactive approval chain.');
    if (chain.workspaceId && ticket.workspaceId && chain.workspaceId !== ticket.workspaceId) throw fail(400, `${chain.name} belongs to another service desk.`);
    const open = await pool.query(`SELECT 1 FROM samadhan.ticket_approvals WHERE "ticketId" = $1 AND state = ANY($2::text[])`, [ticket.id, OPEN_STATES]);
    if (open.rows.length) throw fail(409, 'An approval is already running on this ticket - finish or cancel it first.');
    const steps = Array.isArray(chain.steps) ? chain.steps : [];
    if (!steps.length) throw fail(400, 'This approval chain has no steps.');
    const mgr = String(managerEmail || '').trim().toLowerCase();
    if (steps.some((s) => s.type === 'manager')) {
        if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(mgr)) throw fail(400, "Enter the requester's manager's email - the first approval goes there.");
        if (ticket.requesterEmail && mgr === String(ticket.requesterEmail).toLowerCase()) throw fail(400, 'Segregation of duties: the requester cannot approve their own request.');
    }
    const round = Number((await pool.query('SELECT COALESCE(max(round), 0) AS r FROM samadhan.ticket_approvals WHERE "ticketId" = $1', [ticket.id])).rows[0].r) + 1;
    const rows = [];
    for (const [i, s] of steps.entries()) {
        let email = null;
        let agentId = null;
        if (s.type === 'manager') email = mgr;
        if (s.type === 'email' || s.type === 'agent') email = String(s.email || '').toLowerCase() || null;
        if (email) agentId = (await pool.query('SELECT id FROM samadhan.agents WHERE lower(email) = $1 AND active', [email])).rows[0]?.id ?? null;
        const r = await pool.query(
            `INSERT INTO samadhan.ticket_approvals ("ticketId", "chainId", round, "stepNo", "stepName", "approverType", "approverAgentId", "approverEmail", state, "dueAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [ticket.id, chain.id, round, i + 1, String(s.name || `Step ${i + 1}`).slice(0, 120), s.type || 'approver', agentId, email, i === 0 ? 'Pending' : 'Waiting', i === 0 ? new Date(Date.now() + 2 * day) : null]);
        rows.push(r.rows[0]);
    }
    await logActivity(ticket.id, 'approval_started', { chain: chain.name, steps: steps.length }, agent?.id ?? null);
    const waiting = await statusIdByName('Awaiting Approval');
    if (waiting && waiting !== ticket.statusId) await setTicketStatus(ticket.id, waiting, agent?.id);
    await notifyStep(rows[0], ticket);
    return listApprovals(ticket.id);
}

/**
 * A decision on the pending step. `actor` = { agent, can } from a signed-in agent, or { token } from the email link.
 * SoD: the requester and the implementer (assigned agent) cannot approve, and nobody approves two steps of one round.
 */
async function decide(approvalId, { decision, comment }, actor) {
    if (!seed.DECISIONS.includes(decision)) throw fail(400, `Decision: one of ${seed.DECISIONS.join(', ')}.`);
    const note = String(comment || '').trim().slice(0, 2000);
    if (decision !== 'Approved' && note.length < 3) throw fail(400, 'Say why (a short comment) when you reject or ask for more information.');
    const step = (await pool.query('SELECT * FROM samadhan.ticket_approvals WHERE id = $1', [approvalId])).rows[0];
    if (!step || (actor.ticketId && step.ticketId !== actor.ticketId)) throw fail(404, 'Approval not found.');
    if (step.state !== 'Pending') throw fail(409, `This step is ${step.state.toLowerCase()} - nothing to decide.`);
    const { loadTicket } = require('./notify');
    const ticket = await loadTicket(step.ticketId);
    let who;
    if (actor.token) {
        if (!step.tokenHash || step.tokenHash !== hash(actor.token) || !step.tokenExpiresAt || new Date(step.tokenExpiresAt) < new Date()) throw fail(410, 'This approval link has expired or was already used.');
        who = { email: step.approverEmail, name: step.approverEmail, agentId: step.approverAgentId };
    } else {
        const a = actor.agent;
        const named = (step.approverAgentId && step.approverAgentId === a.id) || (step.approverEmail && step.approverEmail === String(a.email).toLowerCase());
        const allowed = actor.can('approval.override') || named || (step.approverType === 'approver' && actor.can('approval.decide'));
        if (!allowed) throw fail(403, step.approverEmail ? `This step is for ${step.approverEmail}.` : "Deciding approvals needs the 'approval.decide' permission.");
        who = { email: String(a.email).toLowerCase(), name: a.name, agentId: a.id, override: !named && actor.can('approval.override') && !(step.approverType === 'approver' && actor.can('approval.decide')) };
    }
    if (decision === 'Approved') {
        if (ticket.requesterEmail && who.email === String(ticket.requesterEmail).toLowerCase()) throw fail(403, 'Segregation of duties: the requester cannot approve their own request.');
        if (who.agentId && ticket.agentId === who.agentId) throw fail(403, 'Segregation of duties: the agent implementing the request cannot approve it. Reassign it first, or ask another approver.');
        const twice = await pool.query(`SELECT 1 FROM samadhan.ticket_approvals WHERE "ticketId" = $1 AND round = $2 AND state = 'Approved' AND lower("decidedBy") = $3`,
            [step.ticketId, step.round, who.email]);
        if (twice.rows.length) throw fail(403, 'Segregation of duties: one person cannot approve two steps of the same approval.');
    }
    const state = decision === 'Need info' ? 'Pending' : decision;
    await pool.query(
        `UPDATE samadhan.ticket_approvals SET state = $2, decision = $3, comment = $4, "decidedAt" = now(), "decidedBy" = $5, "tokenHash" = NULL, "tokenExpiresAt" = NULL WHERE id = $1`,
        [step.id, state, decision, note || null, who.email]);
    await logActivity(ticket.id, 'approval_decided', { step: step.stepName, decision, by: who.name, ...(note ? { comment: note } : {}), ...(who.override ? { override: true } : {}) }, who.agentId ?? null);
    const ref = ticket.displayRef ?? `#${ticket.id}`;
    if (decision === 'Need info') {
        await bellTo([ticket.agentId], ticket, `Approver needs information (${step.stepName}): ${ref}`, note);
        return listApprovals(ticket.id);
    }
    if (decision === 'Rejected') {
        await pool.query(`UPDATE samadhan.ticket_approvals SET state = 'Cancelled' WHERE "ticketId" = $1 AND round = $2 AND state = 'Waiting'`, [ticket.id, step.round]);
        await bellTo([ticket.agentId], ticket, `Approval rejected (${step.stepName}): ${ref}`, note);
        if (ticket.statusId === (await statusIdByName('Awaiting Approval'))) await setTicketStatus(ticket.id, STATUS.OPEN, who.agentId);
        return listApprovals(ticket.id);
    }
    const next = (await pool.query(`SELECT * FROM samadhan.ticket_approvals WHERE "ticketId" = $1 AND round = $2 AND state = 'Waiting' ORDER BY "stepNo" LIMIT 1`, [ticket.id, step.round])).rows[0];
    if (next) {
        const r = await pool.query(`UPDATE samadhan.ticket_approvals SET state = 'Pending', "dueAt" = now() + interval '2 days' WHERE id = $1 RETURNING *`, [next.id]);
        await notifyStep(r.rows[0], ticket);
    } else {
        await logActivity(ticket.id, 'approval_completed', { round: step.round }, who.agentId ?? null);
        await bellTo([ticket.agentId], ticket, `Approved - ready to fulfil: ${ref}`, ticket.subject);
        if (ticket.statusId === (await statusIdByName('Awaiting Approval'))) await setTicketStatus(ticket.id, STATUS.OPEN, who.agentId);
    }
    return listApprovals(ticket.id);
}

async function cancelApprovals(ticketId, agent) {
    const r = await pool.query(`UPDATE samadhan.ticket_approvals SET state = 'Cancelled' WHERE "ticketId" = $1 AND state = ANY($2::text[]) RETURNING id`, [ticketId, OPEN_STATES]);
    if (!r.rows.length) throw fail(409, 'No approval is running on this ticket.');
    await logActivity(ticketId, 'approval_cancelled', {}, agent?.id ?? null);
    return listApprovals(ticketId);
}

/** The pending steps the agent may decide (named for them, or "approver" steps when they hold approval.decide). */
async function approvalsMine(req) {
    const { scopeSql } = require('./ticketQuery');
    const s = scopeSql(req.scope, req.agent.id);
    const canDecide = req.can('approval.decide');
    return quiet(async () => (await pool.query(
        `SELECT a.id, a."ticketId", a."stepNo", a."stepName", a."approverType", a."approverEmail", a."dueAt", a."createdAt", a.comment, a.decision,
                c.name AS "chainName", t.subject, t.priority, t."applicationId", ap.code AS "applicationCode", t."workspaceId", co.name AS "requesterName", co.email AS "requesterEmail"
         FROM samadhan.ticket_approvals a JOIN samadhan.tickets t ON t.id = a."ticketId" LEFT JOIN samadhan.approval_chains c ON c.id = a."chainId"
         LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId" LEFT JOIN samadhan.contacts co ON co.id = t."requesterId"
         WHERE a.state = 'Pending' AND t."deletedAt" IS NULL
           AND (a."approverAgentId" = $1 OR a."approverEmail" = lower($2) OR ($3 AND a."approverType" = 'approver'))
           AND lower(COALESCE(co.email, '')) <> lower($2) AND COALESCE(t."agentId", 0) <> $1
           ${s ? `AND ${s}` : ''}
         ORDER BY a."dueAt" NULLS LAST, a.id`, [req.agent.id, req.agent.email, canDecide])).rows
        .map((r) => ({ ...r, ref: r.applicationCode ? `${r.applicationCode}-${r.ticketId}` : String(r.ticketId) })), []);
}

/** The public one-click page: what is being approved (no conversation text). */
async function approvalByToken(token) {
    const step = (await pool.query(
        `SELECT a.*, c.name AS "chainName" FROM samadhan.ticket_approvals a LEFT JOIN samadhan.approval_chains c ON c.id = a."chainId" WHERE a."tokenHash" = $1`, [hash(token)])).rows[0];
    if (!step || !step.tokenExpiresAt || new Date(step.tokenExpiresAt) < new Date() || step.state !== 'Pending') throw fail(410, 'This approval link has expired or was already used.');
    const { loadTicket } = require('./notify');
    const t = await loadTicket(step.ticketId);
    const { stripTags } = require('./util');
    return {
        id: step.id, stepName: step.stepName, chainName: step.chainName, ref: t.displayRef ?? String(t.id), subject: t.subject,
        requesterName: t.requesterName, summary: stripTags(t.description || '').slice(0, 1500), createdAt: t.createdAt,
        steps: (await listApprovals(t.id)).filter((x) => x.round === step.round).map((x) => ({ stepNo: x.stepNo, stepName: x.stepName, state: x.state })),
    };
}

/** Job: a reminder (bell / email) once a day for steps past their due time. */
async function approvalReminders() {
    const rows = await quiet(async () => (await pool.query(
        `SELECT a.* FROM samadhan.ticket_approvals a JOIN samadhan.tickets t ON t.id = a."ticketId"
         WHERE a.state = 'Pending' AND a."dueAt" < now() AND t."deletedAt" IS NULL AND (a."remindedAt" IS NULL OR a."remindedAt" < now() - interval '1 day')`)).rows, []);
    const { loadTicket } = require('./notify');
    for (const r of rows) {
        await notifyStep(r, await loadTicket(r.ticketId), true);
        await pool.query('UPDATE samadhan.ticket_approvals SET "remindedAt" = now() WHERE id = $1', [r.id]);
    }
    return rows.length;
}

// ---------- rules before resolving (§P) ----------
async function assertChangeRules(ticket) {
    if (!ticket.id) return;
    const approvals = await listApprovals(ticket.id);
    if (approvals.some((a) => OPEN_STATES.includes(a.state))) throw fail(400, 'Approvals are not complete yet - wait for the approvers, or cancel the approval.');
    const rc = ticket.recordClass ?? 'INCIDENT';
    const desk = ticket.workspaceKey;
    if (!desk || desk === 'SEC_SALES') return;
    if (rc === 'ACCESS_REQUEST') {
        const last = Math.max(0, ...approvals.map((a) => a.round));
        const round = approvals.filter((a) => a.round === last);
        if (!round.length) throw fail(400, 'Access requests are fulfilled only after approval - start the approval first.');
    }
    if (rc === 'CHANGE' && (desk === 'SAP' || desk === 'S4_PROGRAM')) {
        const ch = await getChange(ticket.id);
        if (!ch?.transportsNa) {
            const trs = await listTransports(ticket.id);
            if (!trs.length) throw fail(400, 'Add the transports of this change, or mark transports "Not applicable".');
            const notDone = trs.filter((t) => !['Imported to PRD', 'Reverted'].includes(t.status));
            if (notDone.length) throw fail(400, `Transports not yet imported to PRD: ${notDone.map((t) => t.trNumber).join(', ')}.`);
            if (!trs.some((t) => t.testedOkBy) && !ch?.testEvidence) throw fail(400, 'Add the test evidence (a transport tested OK in QAS, or the test evidence note).');
        } else if (!ch?.testEvidence) {
            throw fail(400, 'Add the test evidence note before resolving the change.');
        }
    }
}

/** On resolve: an access request with a validity end date gets a "revoke access" to-do for the assignee. */
async function afterResolved(ticket) {
    if (!ticket.agentId) return;
    const ch = await getChange(ticket.id);
    if (!ch?.accessValidTo) return;
    const exists = await pool.query(`SELECT 1 FROM samadhan.todos WHERE "ticketId" = $1 AND text LIKE 'Revoke access%'`, [ticket.id]);
    if (exists.rows.length) return;
    await pool.query('INSERT INTO samadhan.todos ("agentId", "ticketId", text, "dueAt") VALUES ($1, $2, $3, $4)',
        [ticket.agentId, ticket.id, `Revoke access (valid until ${new Date(ch.accessValidTo).toISOString().slice(0, 10)}): ${String(ticket.subject).slice(0, 200)}`, ch.accessValidTo]);
}

// ---------- catalogue ----------
const listCatalog = ({ workspaceId = null, portal = false } = {}) => quiet(async () => (await pool.query(
    `SELECT i.*, c.name AS "approvalChainName", g.name AS "fulfilGroupName", COALESCE(c.steps @> '[{"type":"manager"}]'::jsonb, false) AS "needsManager" FROM samadhan.service_catalog_items i
     LEFT JOIN samadhan.approval_chains c ON c.id = i."approvalChainId" LEFT JOIN samadhan.groups g ON g.id = i."fulfilGroupId"
     WHERE i.active AND ($1::int IS NULL OR i."workspaceId" = $1) AND (NOT $2 OR i."portalVisible") ORDER BY i."workspaceId", i.position, i.name`,
    [workspaceId, portal])).rows, []);

/** Answers to the item's questions: required ones checked; returned as "Label: value" lines for the description. */
function catalogAnswers(item, answers = {}) {
    const form = Array.isArray(item.formSchema) ? item.formSchema : [];
    const lines = [];
    for (const f of form) {
        const raw = answers?.[f.label];
        const v = f.type === 'checkbox' ? (raw === true || raw === 'true' ? 'Yes' : '') : String(raw ?? '').trim().slice(0, 2000);
        if (f.required && !v) throw fail(400, `Fill in "${f.label}".`);
        if (v && f.type === 'select' && Array.isArray(f.options) && !f.options.includes(v)) throw fail(400, `"${f.label}": pick one of the options.`);
        if (v) lines.push(`${f.label}: ${v}`);
    }
    return lines;
}

/**
 * A catalogue request before the ticket exists: the item, its answers (as description lines), the application in the
 * item's desk, the fields it presets, and the manager email its approval needs. Throws 400 before anything is saved.
 */
async function prepareCatalogRequest({ catalogItemId, catalogAnswers: answers, managerEmail, applicationId, requesterEmail, portal = false }) {
    const item = (await listCatalog({ portal })).find((i) => i.id === Number(catalogItemId));
    if (!item) throw fail(400, 'Unknown catalogue item.');
    const lines = catalogAnswers(item, answers);
    const { availableWorkspaceIds, catalog } = require('./workspaces');
    const c = await catalog();
    if (!(await availableWorkspaceIds()).has(item.workspaceId)) throw fail(400, `${item.name} belongs to a service desk that is switched off.`);
    let appId = applicationId ? Number(applicationId) : item.applicationId ?? null;
    if (appId && c.byId.get(appId)?.workspaceId !== item.workspaceId) throw fail(400, `${item.name} belongs to another service desk than the application picked.`);
    if (!appId) {
        // No application on the item: the desk's application whose name starts like the item's category (Network -> NET), else the first one (General last).
        const word = String(item.category || '').toLowerCase().split(/[\s–(&,-]+/)[0];
        const desk = c.applications.filter((x) => x.active && x.workspaceId === item.workspaceId);
        const match = word ? desk.find((x) => x.name.toLowerCase().startsWith(word)) : null;
        appId = (match ?? desk.sort((x, y) => (x.code === 'GEN') - (y.code === 'GEN') || x.position - y.position)[0])?.id ?? null;
    }
    let chain = null;
    if (item.approvalChainId) {
        chain = (await pool.query('SELECT * FROM samadhan.approval_chains WHERE id = $1 AND active', [item.approvalChainId])).rows[0] ?? null;
        if (chain && (chain.steps || []).some((s) => s.type === 'manager')) {
            const mgr = String(managerEmail || '').trim().toLowerCase();
            if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(mgr)) throw fail(400, "Enter the manager's email - this request needs their approval.");
            if (requesterEmail && mgr === String(requesterEmail).toLowerCase()) throw fail(400, 'Segregation of duties: the requester cannot approve their own request.');
        }
    }
    const fields = { recordClass: item.recordClass, ...(item.defaultType ? { type: item.defaultType } : {}), ...(item.category ? { category: item.category } : {}),
        ...(item.function ? { function: item.function } : {}), ...(item.fulfilGroupId ? { groupId: item.fulfilGroupId } : {}) };
    return { item, lines, applicationId: appId, chain, fields };
}

/** After the ticket exists: note the item and start its approval (the ticket waits in "Awaiting Approval"). */
async function finishCatalogRequest(ticketId, prepared, managerEmail, agent = null) {
    await logActivity(ticketId, 'catalog_request', { item: prepared.item.name }, agent?.id ?? null);
    if (!prepared.chain) return;
    const { loadTicket } = require('./notify');
    await startApproval(await loadTicket(ticketId), prepared.chain.id, { managerEmail }, agent);
}

// ---------- calendar ----------
async function calendar(req, from, to) {
    const { scopeSql } = require('./ticketQuery');
    const s = scopeSql(req.scope, req.agent.id);
    const [changes, windows] = await Promise.all([
        quiet(async () => (await pool.query(
            `SELECT t.id, t.subject, t."workspaceId", t."applicationId", ap.code AS "applicationCode", d."changeType", d."changeRisk", d."plannedStart", d."plannedEnd",
                    st.name AS "statusName", st."isResolved", ag.name AS "agentName"
             FROM samadhan.ticket_change_details d JOIN samadhan.tickets t ON t.id = d."ticketId" JOIN samadhan.ticket_statuses st ON st.id = t."statusId"
             LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId" LEFT JOIN samadhan.agents ag ON ag.id = t."agentId"
             WHERE d."plannedStart" IS NOT NULL AND d."plannedStart" < $2 AND COALESCE(d."plannedEnd", d."plannedStart") >= $1 AND t."deletedAt" IS NULL ${s ? `AND ${s}` : ''}
             ORDER BY d."plannedStart"`, [from, to])).rows.map((r) => ({ ...r, ref: r.applicationCode ? `${r.applicationCode}-${r.id}` : String(r.id) })), []),
        quiet(async () => (await pool.query(
            `SELECT w.*, ws.name AS "workspaceName" FROM samadhan.change_windows w LEFT JOIN samadhan.workspaces ws ON ws.id = w."workspaceId"
             WHERE w."startsAt" < $2 AND w."endsAt" >= $1 ORDER BY w."startsAt"`, [from, to])).rows, []),
    ]);
    return { changes, windows };
}

module.exports = {
    OPEN_STATES, addTransport, afterResolved, agentsWith, approvalByToken, approvalReminders, approvalsMine, assertChangeRules, calendar, cancelApprovals, catalogAnswers,
    decide, deleteTransport, finishCatalogRequest, freezeConflicts, prepareCatalogRequest, getChange, listApprovals, listCatalog, listChains, listTransports, saveChange, startApproval, trRegex, updateTransport,
};
