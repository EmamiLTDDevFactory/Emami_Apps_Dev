'use strict';
const { LIST_COLUMNS, LIST_FROM } = require('../lib/queries');
const express = require('express');
const { pool } = require('../../db');
const { CALL_OUTCOMES, EMAIL_RE, PATCHABLE, PHONE_RE, PRIORITIES, SOURCES } = require('../constants');
const { loadTicket } = require('../lib/notify');
const { CREATE_FIELDS, LONG_TEXT_FIELDS, addAgentMessage, createTicket, updateTicket } = require('../lib/tickets');
const { LIVE, VIEWS, VIEW_IDS, ticketFilter } = require('../lib/ticketQuery');
const { assertResolvable, hideTickets, linkTickets, mergeTickets, presence, runScenario, setWatching } = require('../lib/ticketOps');
const { audit, fail, intOrNull, logActivity, stripTags, textToHtml, touchActivity, updateRow, wrap } = require('../lib/util');
const { isAdmin, requireSupervisor } = require('../middleware/auth');

const router = express.Router();

// ---------- Routes: tickets ----------

router.get('/tickets', wrap(async (req, res) => {
    const { where, params, order } = ticketFilter(req.query, req.agent.id);
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const [items, total] = await Promise.all([
        pool.query(`SELECT ${LIST_COLUMNS} ${LIST_FROM} ${where} ORDER BY ${order}, t.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params),
        pool.query(`SELECT count(*)::int AS n ${LIST_FROM} ${where}`, params),
    ]);
    res.json({ success: true, items: items.rows, total: total.rows[0].n, page, pageSize });
}));

/** Counts for every built-in view, plus the caller's own and shared saved views (keyed "saved:<id>"). */
router.get('/tickets/counts', wrap(async (req, res) => {
    const [builtIn, saved] = await Promise.all([
        pool.query(
            `SELECT ${VIEW_IDS.map((v) => `count(*) FILTER (WHERE ${VIEWS[v]('$1')})::int AS "${v}"`).join(', ')}, count(*) FILTER (WHERE ${LIVE})::int AS "all"
             FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId"`,
            [req.agent.id],
        ),
        pool.query('SELECT id, query FROM setu.saved_views WHERE "ownerAgentId" = $1 OR shared ORDER BY id LIMIT 30', [req.agent.id]),
    ]);
    const counts = { ...builtIn.rows[0] };
    await Promise.all(saved.rows.map(async (v) => {
        try {
            const f = ticketFilter(v.query ?? {}, req.agent.id);
            counts[`saved:${v.id}`] = (await pool.query(`SELECT count(*)::int AS n ${LIST_FROM} ${f.where}`, f.params)).rows[0].n;
        } catch {
            counts[`saved:${v.id}`] = null;
        }
    }));
    res.json({ success: true, counts });
}));

// Export: the list's filters, the columns the person picked. Supervisors and admins (it carries requester details).
const EXPORT_COLUMNS = {
    'Ticket ID': (t) => t.id, Subject: (t) => t.subject, Status: (t) => t.statusName, Priority: (t) => PRIORITIES[t.priority], Severity: (t) => t.severity,
    Source: (t) => t.source, Type: (t) => t.type, Group: (t) => t.groupName, Agent: (t) => t.agentName, Requester: (t) => t.requesterName,
    'Requester email': (t) => t.requesterEmail, 'Created time': (t) => t.createdAt, 'Resolution due': (t) => t.resolutionDueAt,
    'First response due': (t) => t.firstResponseDueAt, 'First responded at': (t) => t.firstRespondedAt, 'Resolved at': (t) => t.resolvedAt,
    'Closed at': (t) => t.closedAt, 'Last activity': (t) => t.lastActivityAt, Region: (t) => t.region, 'Distributor Code': (t) => t.distributorCode,
    'Distributor Name': (t) => t.distributorName, 'Sales Org': (t) => t.salesOrg, State: (t) => t.state, Depot: (t) => t.depot, 'ASM Name': (t) => t.asmName,
    'Depot Co-ordinator': (t) => t.depotCoordinator, 'MR UID': (t) => t.mrUid, Category: (t) => t.category, Function: (t) => t.function,
    'L2 Agent': (t) => t.l2Agent, 'HelpDesk Analysis': (t) => stripTags(t.helpdeskAnalysis), 'RCA/Solution': (t) => stripTags(t.rcaSolution), Tags: (t) => (t.tags ?? []).join('; '),
    'First response SLA': (t) => (t.firstResponseDueAt ? (t.frViolated || (t.firstRespondedAt ?? new Date()) > t.firstResponseDueAt ? 'SLA violated' : 'Within SLA') : ''),
    'Resolution SLA': (t) => (t.resolutionDueAt ? (t.resViolated || (t.resolvedAt ?? new Date()) > t.resolutionDueAt ? 'SLA violated' : 'Within SLA') : ''),
    CSAT: (t) => ({ 3: 'Extremely satisfied', 2: 'Neither satisfied nor dissatisfied', 1: 'Extremely dissatisfied' })[t.csatRating] ?? '',
};
const safeCell = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const istCell = (v) => (v instanceof Date ? v.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }) : v ?? '');

router.get('/tickets/export', wrap(async (req, res) => {
    requireSupervisor(req);
    const { where, params, order } = ticketFilter(req.query, req.agent.id);
    const wanted = String(req.query.columns || '').split(',').map((c) => c.trim()).filter((c) => EXPORT_COLUMNS[c]);
    const columns = wanted.length ? wanted : Object.keys(EXPORT_COLUMNS);
    const { rows } = await pool.query(
        `SELECT t.*, c.name AS "requesterName", c.email AS "requesterEmail", a.name AS "agentName", g.name AS "groupName", s.name AS "statusName",
                (SELECT rating FROM setu.csat_responses r WHERE r."ticketId" = t.id ORDER BY r.id DESC LIMIT 1) AS "csatRating"
         ${LIST_FROM} ${where} ORDER BY ${order}, t.id DESC LIMIT 5001`,
        params,
    );
    if (rows.length > 5000) throw fail(400, 'More than 5,000 tickets match. Narrow the filters (for example a date range) and export again.');
    const out = rows.map((t) => columns.map((c) => safeCell(istCell(EXPORT_COLUMNS[c](t)))));
    await audit(req.verifiedEmail, 'tickets_exported', { rows: out.length, view: req.query.view ?? '', columns: columns.length });
    res.json({ success: true, columns, rows: out });
}));
router.get('/tickets/export/columns', wrap(async (req, res) => res.json({ success: true, columns: Object.keys(EXPORT_COLUMNS) })));

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

router.post('/tickets', wrap(async (req, res) => {
    const b = req.body ?? {};
    const subject = String(b.subject || '').trim();
    const requesterName = String(b.requesterName || '').trim();
    const requesterEmail = String(b.requesterEmail || '').trim().toLowerCase();
    if (!subject || !requesterName) throw fail(400, 'Subject and requester name are needed.');
    // A ticket logged on someone's behalf needs their email: replies, the acknowledgement and the portal use it.
    if (!requesterEmail) throw fail(400, 'Requester email is needed.');
    if (!EMAIL_RE.test(requesterEmail)) throw fail(400, 'Requester email is not valid.');
    const source = SOURCES.includes(b.source) ? b.source : 'Phone';
    const fields = cleanFields(b);
    const statusId = intOrNull(b.statusId);
    if (Number.isNaN(statusId)) throw fail(400, 'Invalid statusId.');
    // Child ticket: one level only (a child cannot have children), and never under a trashed / merged ticket.
    const parentId = intOrNull(b.parentId);
    if (Number.isNaN(parentId)) throw fail(400, 'Invalid parent ticket.');
    if (parentId) {
        const parent = await loadTicket(parentId);
        if (parent.parentId) throw fail(400, `#${parentId} is itself a child ticket - add the child to #${parent.parentId} instead.`);
        if (parent.deletedAt || parent.mergedIntoId) throw fail(400, `#${parentId} is in the trash or merged.`);
    }
    if (statusId) await assertResolvable(statusId, fields);
    const t = await createTicket({
        subject,
        description: b.description ? textToHtml(String(b.description)) : '',
        requester: { email: requesterEmail || null, name: requesterName, phone: String(b.requesterPhone || '').trim() || null },
        source,
        fields,
        actorAgentId: req.agent.id,
        actorName: req.agent.name,
        notifyRequester: b.notifyRequester === true,
    });
    if (parentId) {
        await updateRow('tickets', t.id, { parentId });
        await logActivity(t.id, 'child_of', { ticket: parentId }, req.agent.id);
        await logActivity(parentId, 'child_added', { ticket: t.id }, req.agent.id);
    }
    const final = statusId && statusId !== t.statusId ? await updateTicket(t.id, { statusId }, req.agent.id) : await loadTicket(t.id);
    res.status(201).json({ success: true, ticket: final });
}));

router.get('/tickets/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw fail(400, 'Invalid ticket number.');
    const t = await loadTicket(id);
    const related = `SELECT t.id, t.subject, s.name AS "statusName", s."isResolved", t."createdAt" FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId"`;
    const [conversations, activities, timeLogs, others, calls, watchers, links, children, parent, csat, todos] = await Promise.all([
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
        pool.query(`${related} WHERE t."requesterId" = $1 AND t.id <> $2 AND ${LIVE} ORDER BY t."createdAt" DESC LIMIT 10`, [t.requesterId, id]),
        pool.query(
            `SELECT cl.*, a.name AS "agentName" FROM setu.call_logs cl JOIN setu.agents a ON a.id = cl."agentId" WHERE cl."ticketId" = $1 ORDER BY cl."createdAt"`,
            [id],
        ),
        pool.query('SELECT a.id, a.name FROM setu.ticket_watchers w JOIN setu.agents a ON a.id = w."agentId" WHERE w."ticketId" = $1 ORDER BY a.name', [id]),
        pool.query(`${related} JOIN setu.ticket_links l ON l."linkedId" = t.id WHERE l."ticketId" = $1 ORDER BY t.id`, [id]),
        pool.query(`${related} WHERE t."parentId" = $1 AND t."deletedAt" IS NULL ORDER BY t.id`, [id]),
        t.parentId ? pool.query(`${related} WHERE t.id = $1`, [t.parentId]) : { rows: [] },
        pool.query('SELECT rating, comment, "createdAt" FROM setu.csat_responses WHERE "ticketId" = $1 ORDER BY id DESC LIMIT 1', [id]),
        pool.query('SELECT * FROM setu.todos WHERE "ticketId" = $1 AND "agentId" = $2 ORDER BY done, "dueAt" NULLS LAST, id', [id, req.agent.id]),
    ]);
    res.json({
        success: true, ticket: t, conversations: conversations.rows, activities: activities.rows, timeLogs: timeLogs.rows,
        requesterTickets: others.rows, calls: calls.rows,
        watchers: watchers.rows, watching: watchers.rows.some((w) => w.id === req.agent.id),
        links: links.rows, children: children.rows, parent: parent.rows[0] ?? null,
        csat: csat.rows[0] ?? null, todos: todos.rows,
    });
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

/**
 * Bulk actions on up to 100 selected tickets: update (status / priority / group / agent / add tag), close, watch,
 * unwatch, spam, unspam, trash, restore, purge (Admin; trashed only), merge (into patch.primaryId or the oldest).
 * Each ticket is checked like a single update; the ones that could not be changed come back with the reason.
 */
router.post('/tickets/bulk', wrap(async (req, res) => {
    const b = req.body ?? {};
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger))];
    if (!ids.length) throw fail(400, 'Select at least one ticket.');
    if (ids.length > 100) throw fail(400, 'Select at most 100 tickets at a time.');
    const action = String(b.action || '');
    const failed = [];
    let done = [];
    if (['spam', 'unspam', 'trash', 'restore', 'purge'].includes(action)) {
        if (action === 'purge' && !isAdmin(req)) throw fail(403, 'Only admins can delete tickets for good.');
        done = await hideTickets(ids, action, req.agent.id);
        if (action === 'purge') await audit(req.verifiedEmail, 'tickets_purged', { ids: done });
    } else if (action === 'watch' || action === 'unwatch') {
        for (const id of ids) {
            try { await setWatching(id, req.agent.id, action === 'watch'); done.push(id); } catch (e) { failed.push({ id, error: e.message }); }
        }
    } else if (action === 'merge') {
        if (ids.length < 2) throw fail(400, 'Select two or more tickets to merge.');
        const primaryId = ids.includes(Number(b.patch?.primaryId)) ? Number(b.patch.primaryId) : Math.min(...ids);
        done = await mergeTickets(primaryId, ids.filter((i) => i !== primaryId), req.agent);
    } else if (action === 'update' || action === 'close') {
        const patch = {};
        const p = b.patch ?? {};
        if (action === 'close') {
            const closed = (await pool.query('SELECT id FROM setu.ticket_statuses WHERE "isClosed" ORDER BY position LIMIT 1')).rows[0];
            patch.statusId = closed.id;
        }
        for (const k of ['statusId', 'priority', 'groupId', 'agentId']) {
            if (p[k] === undefined) continue;
            const n = p[k] === 'me' ? req.agent.id : intOrNull(p[k]);
            if (Number.isNaN(n) || ((k === 'statusId' || k === 'priority') && n === null)) throw fail(400, `Invalid ${k}.`);
            patch[k] = n;
        }
        if (patch.priority !== undefined && !PRIORITIES[patch.priority]) throw fail(400, 'Invalid priority.');
        const addTag = String(p.addTag || '').trim().slice(0, 100);
        if (!Object.keys(patch).length && !addTag) throw fail(400, 'Choose what to change.');
        for (const id of ids) {
            try {
                const current = await loadTicket(id);
                const one = { ...patch };
                if (addTag && !(current.tags ?? []).includes(addTag)) one.tags = [...(current.tags ?? []), addTag].slice(0, 20);
                if (one.statusId !== undefined) await assertResolvable(one.statusId, { ...current, ...one });
                await updateTicket(id, one, req.agent.id);
                done.push(id);
            } catch (e) {
                failed.push({ id, error: e.status && e.status < 500 ? e.message : 'Could not update.' });
            }
        }
    } else {
        throw fail(400, 'Unknown bulk action.');
    }
    res.json({ success: true, done, failed });
}));

router.post('/tickets/:id/merge', wrap(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number);
    const merged = await mergeTickets(Number(req.params.id), ids, req.agent);
    res.json({ success: true, merged });
}));

router.post('/tickets/:id/links', wrap(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : String(req.body?.ids || '').split(/[\s,#]+/)).map(Number).filter(Number.isInteger);
    const linked = await linkTickets(Number(req.params.id), ids, req.agent.id, req.body?.unlink === true);
    res.json({ success: true, linked });
}));

router.post('/tickets/:id/watch', wrap(async (req, res) => {
    await setWatching(Number(req.params.id), req.agent.id, req.body?.watch !== false);
    res.json({ success: true });
}));

router.post('/tickets/:id/scenarios/:sid', wrap(async (req, res) => {
    const name = await runScenario(Number(req.params.id), Number(req.params.sid), req.agent);
    res.json({ success: true, name });
}));

/** Collision detection: the page reports viewing / replying every ~20 s and hears who else has the ticket open. */
router.post('/tickets/:id/presence', wrap(async (req, res) => {
    const mode = ['viewing', 'replying', 'leave'].includes(req.body?.mode) ? req.body.mode : 'viewing';
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw fail(400, 'Invalid ticket number.');
    res.json({ success: true, others: await presence(id, req.agent.id, mode) });
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
    // "Send and set status": the status is checked before anything is sent, so a refused close sends nothing.
    const statusAfter = intOrNull(b.statusAfter);
    if (Number.isNaN(statusAfter)) throw fail(400, 'Invalid status.');
    if (statusAfter) await assertResolvable(statusAfter, await loadTicket(id));
    const { delivery } = await addAgentMessage(id, { kind, html: textToHtml(text.slice(0, 50000)), to, cc }, req.agent);
    if (statusAfter) await updateTicket(id, { statusId: statusAfter }, req.agent.id);
    res.status(201).json({ success: true, delivery });
}));

router.post('/tickets/:id/time-logs', wrap(async (req, res) => {
    const minutes = Number(req.body?.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) throw fail(400, 'Enter minutes between 1 and 1440.');
    await pool.query('INSERT INTO setu.time_logs ("ticketId", "agentId", minutes, note) VALUES ($1, $2, $3, $4)', [Number(req.params.id), req.agent.id, minutes, String(req.body?.note || '').slice(0, 500) || null]);
    res.status(201).json({ success: true });
}));

/** A phone call with the requester (made from the ticket, or received): number, outcome, length and notes. */
router.post('/tickets/:id/calls', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    const phone = String(b.phone || '').trim();
    if (!PHONE_RE.test(phone)) throw fail(400, 'Enter a valid phone number.');
    if (!CALL_OUTCOMES.includes(b.outcome)) throw fail(400, 'Pick how the call went.');
    const mins = Number(b.durationMins ?? 0);
    if (!Number.isFinite(mins) || mins < 0 || mins > 600) throw fail(400, 'Call length must be 0 to 600 minutes.');
    const direction = b.direction === 'INBOUND' ? 'INBOUND' : 'OUTBOUND';
    const notes = String(b.notes || '').trim().slice(0, 5000) || null;
    await loadTicket(id);
    await pool.query(
        'INSERT INTO setu.call_logs ("ticketId", "agentId", phone, direction, outcome, "durationSecs", notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, req.agent.id, phone, direction, b.outcome, Math.round(mins * 60), notes],
    );
    const now = new Date();
    await updateRow('tickets', id, { updatedAt: now });
    await logActivity(id, 'call_logged', { direction, outcome: b.outcome, minutes: mins }, req.agent.id);
    await touchActivity(id, 'call', req.agent.name, `${direction === 'INBOUND' ? 'Call from' : 'Call to'} ${phone} - ${b.outcome}`, now);
    res.status(201).json({ success: true });
}));

module.exports = router;
