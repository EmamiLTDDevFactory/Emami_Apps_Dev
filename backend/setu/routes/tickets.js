'use strict';
const { LIST_COLUMNS, LIST_FROM } = require('../lib/queries');
const express = require('express');
const { pool } = require('../../db');
const { EMAIL_RE, PATCHABLE, PRIORITIES, SOURCES } = require('../constants');
const { loadTicket } = require('../lib/notify');
const { CREATE_FIELDS, LONG_TEXT_FIELDS, addAgentMessage, createTicket, updateTicket } = require('../lib/tickets');
const { fail, intOrNull, textToHtml, wrap } = require('../lib/util');

const router = express.Router();

// ---------- Routes: tickets ----------



router.get('/tickets', wrap(async (req, res) => {
    const where = [];
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    const qy = req.query;
    switch (qy.view) {
        case 'mine': where.push(`t."agentId" = ${p(req.agent.id)}`, 'NOT s."isClosed"'); break;
        case 'unassigned': where.push('t."agentId" IS NULL', 'NOT s."isResolved"'); break;
        case 'open': where.push('NOT s."isResolved"'); break;
        case 'overdue': where.push('NOT s."isResolved"', '(t."resolutionDueAt" < now() OR (t."firstRespondedAt" IS NULL AND t."firstResponseDueAt" < now()))'); break;
        case 'resolved': where.push('s."isResolved"'); break;
        default: break;
    }
    const ints = (v) => String(v).split(',').map(Number).filter(Number.isInteger);
    if (qy.statusId) where.push(`t."statusId" = ANY(${p(ints(qy.statusId))})`);
    if (qy.priority) where.push(`t.priority = ANY(${p(ints(qy.priority))})`);
    if (qy.severity) where.push(`t.severity = ANY(${p(String(qy.severity).split(','))})`);
    if (qy.groupId) where.push(`t."groupId" = ${p(Number(qy.groupId))}`);
    if (qy.agentId) where.push(qy.agentId === 'none' ? 't."agentId" IS NULL' : `t."agentId" = ${p(Number(qy.agentId))}`);
    if (qy.source) where.push(`t.source = ${p(String(qy.source))}`);
    if (qy.type) where.push(`t.type = ${p(String(qy.type))}`);
    if (qy.category) where.push(`t.category = ${p(String(qy.category))}`);
    if (qy.tag) where.push(`t.tags @> ARRAY[${p(String(qy.tag).trim().slice(0, 100))}]::text[]`);
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
    if (qy.from && !isDate(qy.from)) throw fail(400, 'Dates must be YYYY-MM-DD.');
    if (qy.to && !isDate(qy.to)) throw fail(400, 'Dates must be YYYY-MM-DD.');
    if (qy.from) where.push(`t."createdAt" >= ${p(`${qy.from}T00:00:00+05:30`)}::timestamptz`);
    if (qy.to) where.push(`t."createdAt" <= ${p(`${qy.to}T23:59:59.999+05:30`)}::timestamptz`);
    if (qy.due && [15, 60, 240].includes(Number(qy.due))) {
        where.push('NOT s."isResolved"', `t."resolutionDueAt" BETWEEN now() AND now() + ${p(`${Number(qy.due)} minutes`)}::interval`);
    }
    if (qy.q) {
        const term = String(qy.q).trim().slice(0, 200);
        if (/^\d+$/.test(term)) where.push(`(t.id = ${p(Number(term))} OR t."distributorCode" = ${p(term)})`);
        else {
            const like = p(`%${term}%`);
            where.push(`(t.subject ILIKE ${like} OR c.name ILIKE ${like} OR c.email ILIKE ${like} OR t."distributorName" ILIKE ${like} OR t."distributorCode" ILIKE ${like})`);
        }
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const SORTS = { created: 't."createdAt" DESC', updated: 't."updatedAt" DESC', due: 't."resolutionDueAt" ASC NULLS LAST', priority: 't.priority DESC, t."createdAt" DESC' };
    const order = SORTS[qy.sort] || SORTS.created;
    const pageSize = Math.min(200, Math.max(10, Number(qy.pageSize) || 50));
    const page = Math.max(1, Number(qy.page) || 1);
    const [items, total] = await Promise.all([
        pool.query(`SELECT ${LIST_COLUMNS} ${LIST_FROM} ${whereSql} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params),
        pool.query(`SELECT count(*)::int AS n ${LIST_FROM} ${whereSql}`, params),
    ]);
    res.json({ success: true, items: items.rows, total: total.rows[0].n, page, pageSize });
}));

router.get('/tickets/counts', wrap(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT
            count(*) FILTER (WHERE t."agentId" = $1 AND NOT s."isClosed")::int AS mine,
            count(*) FILTER (WHERE t."agentId" IS NULL AND NOT s."isResolved")::int AS unassigned,
            count(*) FILTER (WHERE NOT s."isResolved")::int AS open,
            count(*) FILTER (WHERE NOT s."isResolved" AND (t."resolutionDueAt" < now() OR (t."firstRespondedAt" IS NULL AND t."firstResponseDueAt" < now())))::int AS overdue,
            count(*)::int AS "all"
         FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId"`,
        [req.agent.id],
    );
    res.json({ success: true, counts: rows[0] });
}));

function cleanFields(body) {
    const out = {};
    for (const k of CREATE_FIELDS) {
        if (body[k] === undefined) continue;
        if (['groupId', 'agentId', 'priority'].includes(k)) {
            const n = intOrNull(body[k]);
            if (Number.isNaN(n)) throw fail(400, `Invalid ${k}.`);
            out[k] = n;
        } else if (k === 'tags') {
            out.tags = Array.isArray(body.tags) ? body.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
        } else {
            const v = String(body[k] ?? '').trim();
            out[k] = v ? v.slice(0, LONG_TEXT_FIELDS.includes(k) ? 20000 : 2000) : null;
        }
    }
    if (out.priority !== undefined && out.priority !== null && !PRIORITIES[out.priority]) throw fail(400, 'Invalid priority.');
    return out;
}

/** Required fields must be filled before a ticket can be resolved or closed. Throws 400 listing what is missing. */
async function assertResolvable(statusId, ticket) {
    const next = (await pool.query('SELECT "isResolved" FROM setu.ticket_statuses WHERE id = $1', [statusId])).rows[0];
    if (!next) throw fail(400, 'Unknown status.');
    if (!next.isResolved) return;
    const required = (await pool.query('SELECT key, label FROM setu.field_definitions WHERE required')).rows;
    const missing = required.filter((f) => (f.key === 'category' ? !ticket.category || !ticket.function : !ticket[f.key])).map((f) => f.label);
    if (missing.length) throw fail(400, `Fill in all required fields before resolving: ${missing.join(', ')}.`);
}

router.post('/tickets', wrap(async (req, res) => {
    const b = req.body ?? {};
    const subject = String(b.subject || '').trim();
    const requesterName = String(b.requesterName || '').trim();
    const requesterEmail = String(b.requesterEmail || '').trim().toLowerCase();
    if (!subject || !requesterName) throw fail(400, 'Subject and requester name are needed.');
    if (requesterEmail && !EMAIL_RE.test(requesterEmail)) throw fail(400, 'Requester email is not valid.');
    const source = SOURCES.includes(b.source) ? b.source : 'Phone';
    const fields = cleanFields(b);
    const statusId = intOrNull(b.statusId);
    if (Number.isNaN(statusId)) throw fail(400, 'Invalid statusId.');
    if (statusId) await assertResolvable(statusId, fields);
    const t = await createTicket({
        subject,
        description: b.description ? textToHtml(String(b.description)) : '',
        requester: { email: requesterEmail || null, name: requesterName, phone: String(b.requesterPhone || '').trim() || null },
        source,
        fields,
        actorAgentId: req.agent.id,
    });
    const final = statusId && statusId !== t.statusId ? await updateTicket(t.id, { statusId }, req.agent.id) : t;
    res.status(201).json({ success: true, ticket: final });
}));

router.get('/tickets/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw fail(400, 'Invalid ticket number.');
    const t = await loadTicket(id);
    const [conversations, activities, timeLogs, others] = await Promise.all([
        pool.query(
            `SELECT cv.*, a.name AS "agentName" FROM setu.conversations cv LEFT JOIN setu.agents a ON a.id = cv."agentId"
             WHERE cv."ticketId" = $1 ORDER BY cv."createdAt", cv.id`,
            [id],
        ),
        pool.query(
            `SELECT ac.*, a.name AS "actorName" FROM setu.activities ac LEFT JOIN setu.agents a ON a.id = ac."actorAgentId"
             WHERE ac."ticketId" = $1 ORDER BY ac."createdAt" DESC, ac.id DESC LIMIT 200`,
            [id],
        ),
        pool.query(
            `SELECT tl.*, a.name AS "agentName" FROM setu.time_logs tl JOIN setu.agents a ON a.id = tl."agentId" WHERE tl."ticketId" = $1 ORDER BY tl."createdAt" DESC`,
            [id],
        ),
        pool.query(
            `SELECT t.id, t.subject, s.name AS "statusName", t."createdAt" FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId"
             WHERE t."requesterId" = $1 AND t.id <> $2 ORDER BY t."createdAt" DESC LIMIT 10`,
            [t.requesterId, id],
        ),
    ]);
    res.json({ success: true, ticket: t, conversations: conversations.rows, activities: activities.rows, timeLogs: timeLogs.rows, requesterTickets: others.rows });
}));

router.patch('/tickets/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    const patch = {};
    for (const k of PATCHABLE) {
        if (b[k] === undefined) continue;
        if (['statusId', 'priority', 'groupId', 'agentId'].includes(k)) {
            const n = intOrNull(b[k]);
            if (Number.isNaN(n) || ((k === 'statusId' || k === 'priority') && n === null)) throw fail(400, `Invalid ${k}.`);
            patch[k] = n;
        } else if (k === 'tags') {
            patch.tags = Array.isArray(b.tags) ? b.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
        } else {
            const v = String(b[k] ?? '').trim();
            if (k === 'subject' && !v) throw fail(400, 'Subject cannot be empty.');
            patch[k] = v ? v.slice(0, LONG_TEXT_FIELDS.includes(k) ? 20000 : 2000) : null;
        }
    }
    if (patch.priority !== undefined && !PRIORITIES[patch.priority]) throw fail(400, 'Invalid priority.');
    const current = await loadTicket(id);
    // Two people editing the same ticket: the page sends the version it loaded; if someone saved in between,
    // refuse instead of silently overwriting their change.
    if (b.expectedUpdatedAt && new Date(b.expectedUpdatedAt).getTime() !== new Date(current.updatedAt).getTime()) {
        throw fail(409, 'Someone else changed this ticket while you were editing. Reload it to see their change, then save again.');
    }
    if (patch.statusId !== undefined) await assertResolvable(patch.statusId, { ...current, ...patch });
    const t = await updateTicket(id, patch, req.agent.id);
    res.json({ success: true, ticket: t });
}));

router.post('/tickets/:id/messages', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    const kind = String(b.kind || '');
    if (!['REPLY', 'NOTE', 'FORWARD'].includes(kind)) throw fail(400, 'Unknown message type.');
    const text = String(b.text || '').trim();
    if (!text) throw fail(400, 'Write a message first.');
    const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    const to = list(b.to);
    const cc = list(b.cc);
    if ([...to, ...cc].some((x) => !EMAIL_RE.test(x))) throw fail(400, 'One of the email addresses is not valid.');
    if (kind === 'FORWARD' && !to.length) throw fail(400, 'Add at least one email address to forward to.');
    await addAgentMessage(id, { kind, html: textToHtml(text.slice(0, 50000)), to, cc }, req.agent);
    res.status(201).json({ success: true });
}));

router.post('/tickets/:id/time-logs', wrap(async (req, res) => {
    const minutes = Number(req.body?.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) throw fail(400, 'Enter minutes between 1 and 1440.');
    await pool.query('INSERT INTO setu.time_logs ("ticketId", "agentId", minutes, note) VALUES ($1, $2, $3, $4)', [Number(req.params.id), req.agent.id, minutes, String(req.body?.note || '').slice(0, 500) || null]);
    res.status(201).json({ success: true });
}));

module.exports = router;
