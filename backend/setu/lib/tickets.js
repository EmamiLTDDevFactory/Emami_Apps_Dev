'use strict';
const { pool } = require('../../db');
const { EDITABLE_FIELDS, PATCHABLE, SEVERITY_PRIORITY, STATUS, q } = require('../constants');
const { roundRobinAgent } = require('./assignment');
const { ruleMatches, rulesFor } = require('./automation');
const { sendMail } = require('./mail');
const { emailRequester, loadTicket, notifyAgents, renderTemplate } = require('./notify');
const { severityFor } = require('./severity');
const { computeDueDates, nextResponseDue, pausedMinutes } = require('./sla');
const { logActivity, setting, stripTags, updateRow } = require('./util');

async function runActions(ticketId, actions, ruleName) {
    for (const a of actions) {
        switch (a.type) {
            case 'setStatus':
                await updateTicket(ticketId, { statusId: a.value }, null, { skipAutomations: true });
                break;
            case 'setPriority':
                await updateTicket(ticketId, { priority: a.value }, null, { skipAutomations: true });
                break;
            case 'setGroup': {
                const groupId = a.setting ? await setting(a.setting) : a.value ?? null;
                if (groupId) await updateTicket(ticketId, { groupId: Number(groupId) }, null, { skipAutomations: true });
                else await logActivity(ticketId, 'automation', { rule: ruleName, skipped: `no group configured in ${a.setting}` });
                break;
            }
            case 'setField':
                if (EDITABLE_FIELDS.includes(a.field)) await updateTicket(ticketId, { [a.field]: a.value }, null, { skipAutomations: true });
                break;
            case 'sendReplyTemplate': {
                const t = await loadTicket(ticketId);
                const msg = await renderTemplate(a.template, t);
                if (msg && t.requesterEmail) {
                    await sendMail({ to: [t.requesterEmail], subject: msg.subject, html: msg.html });
                    await pool.query(
                        `INSERT INTO setu.conversations ("ticketId", kind, "bodyHtml", "bodyText", "toEmails") VALUES ($1, 'REPLY', $2, $3, $4)`,
                        [ticketId, msg.html, stripTags(msg.html), [t.requesterEmail]],
                    );
                }
                break;
            }
            case 'markEscalated':
                await pool.query('UPDATE setu.tickets SET "escalatedAt" = now() WHERE id = $1', [ticketId]);
                break;
            case 'notifyAgents': {
                const t = await loadTicket(ticketId);
                const to = a.to === 'setting' ? (a.setting ? (await setting(a.setting)) ?? [] : []) : a.to;
                await notifyAgents(t, a.template, to);
                break;
            }
            default:
                break;
        }
    }
    await logActivity(ticketId, 'automation', { rule: ruleName });
}

async function runRules(trigger, ticketId, changed = []) {
    for (const r of await rulesFor(trigger)) {
        const { rows } = await pool.query('SELECT * FROM setu.tickets WHERE id = $1', [ticketId]);
        if (rows.length && ruleMatches(r.conditions, { ticket: rows[0], changed })) await runActions(ticketId, r.actions, r.name);
    }
}

// ---------- Tickets: create / update / messages ----------

async function findOrCreateContact(r) {
    if (r.email) {
        const email = r.email.toLowerCase();
        const { rows } = await pool.query(
            `INSERT INTO setu.contacts (email, name, phone) VALUES ($1, $2, $3)
             ON CONFLICT (email) DO UPDATE SET phone = COALESCE(setu.contacts.phone, EXCLUDED.phone)
             RETURNING id, "companyId", email`,
            [email, r.name || email, r.phone || null],
        );
        return rows[0];
    }
    const { rows } = await pool.query('INSERT INTO setu.contacts (name, phone) VALUES ($1, $2) RETURNING id, "companyId", email', [r.name, r.phone || null]);
    return rows[0];
}

const CREATE_FIELDS = ['type', 'category', 'function', 'region', 'salesOrg', 'state', 'depot', 'distributorCode', 'distributorName', 'asmName',
    'depotCoordinator', 'callSubject', 'callerName', 'callerContactNumber', 'mrUid', 'mobileNo', 'alternateMobileNo', 'l2Agent', 'helpdeskAnalysis',
    'rcaSolution', 'groupId', 'agentId', 'priority', 'tags'];
const LONG_TEXT_FIELDS = ['helpdeskAnalysis', 'rcaSolution'];

async function createTicket(input) {
    const contact = await findOrCreateContact(input.requester);
    const f = Object.fromEntries(Object.entries(input.fields ?? {}).filter(([k, v]) => CREATE_FIELDS.includes(k) && v !== undefined && v !== ''));
    const severity = await severityFor(f.category ?? null, f.function ?? null);
    const createdAt = input.createdAt ?? new Date();
    const data = {
        subject: String(input.subject).slice(0, 500),
        description: input.description ?? '',
        requesterId: contact.id,
        companyId: contact.companyId,
        source: input.source ?? 'Email',
        createdAt,
        updatedAt: createdAt,
        statusChangedAt: createdAt,
        severity,
        ...f,
        priority: f.priority ?? SEVERITY_PRIORITY[severity],
    };
    const keys = Object.keys(data);
    const { rows } = await pool.query(
        `INSERT INTO setu.tickets (${keys.map(q).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        keys.map((k) => data[k]),
    );
    const id = rows[0].id;
    if (input.messageId) {
        await pool.query(
            `INSERT INTO setu.conversations ("ticketId", kind, "bodyHtml", "bodyText", "fromEmail", "messageId", "createdAt") VALUES ($1, 'INCOMING', $2, $3, $4, $5, $6)`,
            [id, data.description, stripTags(data.description), contact.email, input.messageId, createdAt],
        );
    }
    await logActivity(id, 'created', { source: data.source, severity }, input.actorAgentId ?? null);
    await runRules('ON_CREATE', id);

    // Round-robin after routing, then SLA (routing may set the group)
    let routed = (await pool.query('SELECT * FROM setu.tickets WHERE id = $1', [id])).rows[0];
    if (routed.groupId && !routed.agentId) {
        const agentId = await roundRobinAgent(routed.groupId);
        if (agentId) {
            await pool.query('UPDATE setu.tickets SET "agentId" = $2 WHERE id = $1', [id, agentId]);
            routed = { ...routed, agentId };
        }
    }
    await updateRow('tickets', id, await computeDueDates(routed));

    const t = await loadTicket(id);
    if (t.source === 'Email') await emailRequester(t, 'requester.ticket_received');
    if (t.groupId) await notifyAgents(t, 'agent.assigned_group', 'group');
    if (t.agentId && t.agentId !== input.actorAgentId) await notifyAgents(t, 'agent.assigned_agent', 'assignee');
    return t;
}

async function updateTicket(id, patch, actorAgentId, opts = {}) {
    const before = await loadTicket(id);
    const changed = Object.keys(patch).filter((k) => PATCHABLE.includes(k) && JSON.stringify(patch[k] ?? null) !== JSON.stringify(before[k] ?? null));
    if (!changed.length) return before;

    const data = {};
    for (const k of changed) data[k] = patch[k];
    const now = new Date();

    // Severity follows Category -> Function, and sets priority.
    if (changed.includes('category') || changed.includes('function')) {
        const sev = await severityFor(patch.category !== undefined ? patch.category : before.category, patch.function !== undefined ? patch.function : before.function);
        data.severity = sev;
        if (!changed.includes('priority')) data.priority = SEVERITY_PRIORITY[sev];
    }

    // Status: pause / resume the SLA clock, stamp resolved and closed times.
    let pausedMins = before.slaPausedMins;
    if (changed.includes('statusId')) {
        const next = (await pool.query('SELECT * FROM setu.ticket_statuses WHERE id = $1', [patch.statusId])).rows[0];
        if (!next) throw Object.assign(new Error('Unknown status'), { status: 400 });
        data.statusChangedAt = now;
        if (!before.pausesSla && next.pausesSla) data.slaPausedAt = now;
        if (before.pausesSla && !next.pausesSla && before.slaPausedAt) {
            pausedMins += await pausedMinutes(before.slaPausedAt, before.groupId, before.priority, now);
            data.slaPausedMins = pausedMins;
            data.slaPausedAt = null;
        }
        if (next.isResolved && !before.resolvedAt) {
            data.resolvedAt = now;
            if (before.resolutionDueAt && now > before.resolutionDueAt) data.resViolated = true;
        }
        if (next.isClosed && !before.closedAt) data.closedAt = now;
        if (!next.isResolved && !next.isClosed) { data.resolvedAt = null; data.closedAt = null; }
    }

    const priority = data.priority ?? before.priority;
    const groupId = changed.includes('groupId') ? patch.groupId ?? null : before.groupId;
    if (changed.includes('statusId') || priority !== before.priority || groupId !== before.groupId) {
        Object.assign(data, await computeDueDates({ createdAt: before.createdAt, groupId, priority, slaPausedMins: pausedMins, firstRespondedAt: before.firstRespondedAt }));
        data.frReminded = false;
        data.resReminded = false;
    }

    // Moving an unassigned ticket into a round-robin group picks the next available agent.
    const agentAfter = changed.includes('agentId') ? patch.agentId ?? null : before.agentId;
    if (changed.includes('groupId') && groupId && !agentAfter) {
        const rr = await roundRobinAgent(groupId);
        if (rr) { data.agentId = rr; changed.push('agentId'); }
    }

    data.updatedAt = now;
    await updateRow('tickets', id, data);
    await logActivity(id, 'updated', Object.fromEntries(changed.map((k) => [k, { from: before[k] ?? null, to: data[k] ?? null }])), actorAgentId);

    const t = await loadTicket(id);
    if (changed.includes('agentId') && t.agentId && t.agentId !== actorAgentId) await notifyAgents(t, 'agent.assigned_agent', 'assignee');
    if (changed.includes('groupId') && t.groupId) await notifyAgents(t, 'agent.assigned_group', 'group');
    if (!opts.skipAutomations) await runRules('ON_UPDATE', id, changed);
    return t;
}

async function addAgentMessage(ticketId, m, agent) {
    const t = await loadTicket(ticketId);
    const now = new Date();
    let html = m.html;
    let to = (m.to ?? []).map((x) => x.toLowerCase());
    const cc = (m.cc ?? []).map((x) => x.toLowerCase());
    const withAgent = { ...t, agentName: agent.name };

    if (m.kind === 'REPLY') {
        to = t.requesterEmail ? [t.requesterEmail, ...to.filter((x) => x !== t.requesterEmail)] : to;
        const signature = await renderTemplate('reply.signature', withAgent);
        html = `${m.html}${signature ? `<br>${signature.html}` : ''}`;
        await sendMail({ to, cc, subject: `Re: ${t.subject} [#${t.id}]`, html });
    } else if (m.kind === 'FORWARD') {
        const fwd = await renderTemplate('forward.signature', withAgent);
        html = `${m.html}${fwd ? `<br>${fwd.html}` : ''}<hr>${t.description}`;
        await sendMail({ to, cc, subject: `Fwd: ${t.subject} [#${t.id}]`, html });
    }

    await pool.query(
        `INSERT INTO setu.conversations ("ticketId", kind, "bodyHtml", "bodyText", "agentId", "toEmails", "ccEmails") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ticketId, m.kind, html, stripTags(html), agent.id, to, cc],
    );

    if (m.kind === 'REPLY') {
        const data = { nextResponseDueAt: null, updatedAt: now };
        if (!t.firstRespondedAt) {
            data.firstRespondedAt = now;
            if (t.firstResponseDueAt && now > t.firstResponseDueAt) data.frViolated = true;
        }
        await updateRow('tickets', ticketId, data);
        // "Assign to first responder": an unassigned ticket goes to the agent who replies first.
        if (!t.agentId) await updateTicket(ticketId, { agentId: agent.id }, agent.id);
    } else {
        await updateRow('tickets', ticketId, { updatedAt: now });
        if (m.kind === 'NOTE' && t.agentId && t.agentId !== agent.id) {
            await notifyAgents(t, 'agent.note_added', 'assignee', { 'comment.body': stripTags(m.html) });
        }
    }
}

/** A requester's email reply on an existing ticket. Reopens resolved / waiting tickets. */
async function addRequesterReply(ticketId, m) {
    const exists = await pool.query('SELECT 1 FROM setu.conversations WHERE "messageId" = $1', [m.messageId]);
    if (exists.rows.length) return;
    await pool.query(
        `INSERT INTO setu.conversations ("ticketId", kind, "bodyHtml", "bodyText", "fromEmail", "messageId", "createdAt") VALUES ($1, 'INCOMING', $2, $3, $4, $5, $6)`,
        [ticketId, m.html, stripTags(m.html), m.fromEmail, m.messageId, m.receivedAt],
    );
    const t = await loadTicket(ticketId);
    if (t.statusId !== STATUS.OPEN && !t.isClosed) await updateTicket(ticketId, { statusId: STATUS.OPEN }, null);
    await updateRow('tickets', ticketId, { nextResponseDueAt: await nextResponseDue(t.groupId, t.priority), updatedAt: new Date() });
    await notifyAgents(await loadTicket(ticketId), 'agent.requester_replied', 'assignee', { 'comment.body': stripTags(m.html) });
}

module.exports = { CREATE_FIELDS, LONG_TEXT_FIELDS, addAgentMessage, addRequesterReply, createTicket, runActions, updateTicket };
