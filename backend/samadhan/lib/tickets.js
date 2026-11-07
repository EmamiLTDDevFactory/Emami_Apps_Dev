'use strict';
const { pool } = require('../db/pool');
const { CUSTOMER_SOURCES, EDITABLE_FIELDS, PATCHABLE, STATUS, q } = require('../constants');
const { mentionedAgents, ring, watchersOf } = require('./bell');
const { severityPriority } = require('./config');
const { roundRobinAgent } = require('./assignment');
const { ruleApplies, ruleMatches, rulesFor } = require('./automation');
const { sendMail } = require('./mail');
const { emailRequester, loadTicket, notifyAgents, renderTemplate } = require('./notify');
const { severityFor, severityRuleFor } = require('./severity');
const { SEVERITY_FOR_PRIORITY, availableWorkspaceIds, catalog, classify, learnFrom, priorityFromMatrix, recordClassForType } = require('./workspaces');
const { computeDueDates, nextResponseDue, pausedMinutes } = require('./sla');
const { esc, fail, logActivity, setting, stripTags, ticketLink, touchActivity, updateRow } = require('./util');
const { htmlToWhatsAppText, sendWhatsApp } = require('./whatsapp');

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
                        `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "toEmails") VALUES ($1, 'REPLY', $2, $3, $4)`,
                        [ticketId, msg.html, stripTags(msg.html), [t.requesterEmail]],
                    );
                }
                break;
            }
            case 'markEscalated':
                await pool.query('UPDATE samadhan.tickets SET "escalatedAt" = now() WHERE id = $1', [ticketId]);
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
        const { rows } = await pool.query('SELECT * FROM samadhan.tickets WHERE id = $1', [ticketId]);
        if (rows.length && ruleApplies(r, rows[0]) && ruleMatches(r.conditions, { ticket: rows[0], changed })) await runActions(ticketId, r.actions, r.name);
    }
}

// ---------- Tickets: create / update / messages ----------

async function findOrCreateContact(r) {
    if (r.email) {
        const email = r.email.toLowerCase();
        const { rows } = await pool.query(
            `INSERT INTO samadhan.contacts (email, name, phone) VALUES ($1, $2, $3)
             ON CONFLICT (email) DO UPDATE SET phone = COALESCE(samadhan.contacts.phone, EXCLUDED.phone)
             RETURNING id, "companyId", email`,
            [email, r.name || email, r.phone || null],
        );
        return rows[0];
    }
    // No email (WhatsApp): the same number is the same person.
    const number = r.mobile || r.phone;
    if (number) {
        const found = await pool.query(
            'SELECT id, "companyId", email FROM samadhan.contacts WHERE (mobile = $1 OR phone = $1) AND "anonymizedAt" IS NULL ORDER BY id DESC LIMIT 1',
            [number],
        );
        if (found.rows.length) return found.rows[0];
    }
    const { rows } = await pool.query(
        'INSERT INTO samadhan.contacts (name, phone, mobile) VALUES ($1, $2, $3) RETURNING id, "companyId", email',
        [r.name, r.phone || null, r.mobile || null],
    );
    return rows[0];
}

const CREATE_FIELDS = ['type', 'category', 'function', 'region', 'salesOrg', 'state', 'depot', 'distributorCode', 'distributorName', 'asmName',
    'depotCoordinator', 'callSubject', 'callerName', 'callerContactNumber', 'mrUid', 'mobileNo', 'alternateMobileNo', 'l2Agent', 'helpdeskAnalysis',
    'rcaSolution', 'groupId', 'agentId', 'priority', 'tags', 'impact', 'urgency', 'recordClass'];
const LONG_TEXT_FIELDS = ['helpdeskAnalysis', 'rcaSolution'];
const V7_CREATE_FIELDS = ['impact', 'urgency', 'recordClass'];

/**
 * v7 Phase 3: the application of a new ticket - the one given (New ticket, portal picker, API), else classified from
 * the subject / text / sender (one mailbox, §J). null before migration 7.2-workspaces (one desk, nothing to set).
 */
async function classificationFor(input) {
    const c = await catalog();
    if (!c.ready) return null;
    if (input.applicationId !== undefined && input.applicationId !== null && input.applicationId !== '') {
        const app = c.byId.get(Number(input.applicationId));
        if (!app || !app.active) throw fail(400, 'Unknown or inactive application.');
        if (!(await availableWorkspaceIds()).has(app.workspaceId)) throw fail(400, `${app.name} belongs to a workspace that is switched off.`);
        return { applicationId: app.id, workspaceId: app.workspaceId, source: input.classificationSource ?? 'manual', confidence: null };
    }
    return classify({ subject: input.subject, body: input.description, fromEmail: input.requester?.email });
}

/** §O: SAP payroll / income tax / personnel administration (and Infra cyber security) are confidential by default. */
async function confidentialByDefault(workspaceId, category, fn) {
    if (!workspaceId || !category) return false;
    const ws = (await catalog()).wsById.get(workspaceId);
    const { CONFIDENTIAL_BY_DEFAULT } = require('./sapSeed');
    if (ws?.key === 'SAP') return CONFIDENTIAL_BY_DEFAULT.some(([c, f]) => c === category && f === fn);
    if (ws?.key === 'INFRA_IT') return category === 'Cyber Security';
    return false;
}

/** Priority from Impact x Urgency when the workspace uses it (BOTH: only when no severity rule matches). */
async function matrixPriorityFor(workspaceId, impact, urgency, category, fn) {
    if (!workspaceId || !impact || !urgency) return null;
    const ws = (await catalog()).wsById.get(workspaceId);
    if (!ws || ws.priorityMode === 'SEVERITY_MATRIX') return null;
    if (ws.priorityMode === 'BOTH' && (await severityRuleFor(category, fn, workspaceId))) return null;
    return priorityFromMatrix(workspaceId, impact, urgency);
}

/** " [MSFA-100123]" before the kept "[#100123]" token in outbound subjects (setting ref.prefixInSubject, default on). */
async function refTag(t) {
    if (!t.applicationCode) return '';
    return (await require('./config').option('ref.prefixInSubject')) === false ? '' : ` [${t.ref}]`;
}

async function createTicket(input) {
    const contact = await findOrCreateContact(input.requester);
    const f = Object.fromEntries(Object.entries(input.fields ?? {}).filter(([k, v]) => CREATE_FIELDS.includes(k) && v !== undefined && v !== '' && v !== null));
    const cls = await classificationFor(input);
    if (!cls) for (const k of V7_CREATE_FIELDS) delete f[k]; // columns not there before migration 7.2
    let severity = await severityFor(f.category ?? null, f.function ?? null, cls?.workspaceId ?? null);
    let matrixPriority = null;
    if (cls && f.priority === undefined) {
        matrixPriority = await matrixPriorityFor(cls.workspaceId, f.impact, f.urgency, f.category, f.function);
        if (matrixPriority) severity = SEVERITY_FOR_PRIORITY[matrixPriority];
        // §O: every Infra & IT cyber-security ticket starts Urgent (and confidential, below).
        if ((await catalog()).wsById.get(cls.workspaceId)?.key === 'INFRA_IT' && f.category === 'Cyber Security') {
            matrixPriority = 4;
            severity = SEVERITY_FOR_PRIORITY[4];
        }
    }
    const v7 = cls ? {
        applicationId: cls.applicationId, workspaceId: cls.workspaceId, classificationSource: cls.source, classificationConfidence: cls.confidence,
        recordClass: f.recordClass ?? await recordClassForType(f.type),
        ...((await confidentialByDefault(cls.workspaceId, f.category, f.function)) ? { confidential: true } : {}),
    } : {};
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
        ...v7,
        priority: f.priority ?? matrixPriority ?? await severityPriority(severity),
        lastActivityBy: String(input.actorName ?? input.requester.name ?? '').slice(0, 200) || null,
        lastActivityDetail: input.source ?? 'Email',
    };
    const keys = Object.keys(data);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.tickets (${keys.map(q).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        keys.map((k) => data[k]),
    );
    const id = rows[0].id;
    if (input.messageId) {
        await pool.query(
            `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "fromEmail", "fromPhone", channel, "messageId", "createdAt")
             VALUES ($1, 'INCOMING', $2, $3, $4, $5, $6, $7, $8)`,
            [id, data.description, stripTags(data.description), contact.email, input.fromPhone ?? null, input.channel ?? 'email', input.messageId, createdAt],
        );
    }
    await logActivity(id, 'created', { source: data.source, severity }, input.actorAgentId ?? null);
    await runRules('ON_CREATE', id);

    // Round-robin after routing, then SLA (routing may set the group). v7: no rule matched -> the desk's default group.
    let routed = (await pool.query('SELECT * FROM samadhan.tickets WHERE id = $1', [id])).rows[0];
    if (!routed.groupId && routed.workspaceId) {
        const desk = (await catalog()).wsById.get(routed.workspaceId);
        if (desk?.defaultGroupId) {
            await pool.query('UPDATE samadhan.tickets SET "groupId" = $2 WHERE id = $1', [id, desk.defaultGroupId]);
            routed = { ...routed, groupId: desk.defaultGroupId };
        }
    }
    // v7 Phase 4: SAP details and an external case given with the ticket (New ticket / portal / API).
    if (input.sap && typeof input.sap === 'object') await require('./sap').saveSap(id, input.sap);
    if (input.externalRef && input.externalRef.ref) await require('./sap').addRef(id, input.externalRef, input.actorAgentId ?? null);
    // v7 Phase 5: IT details given with the ticket (Digital Apps / Infra & IT).
    if (input.it && typeof input.it === 'object') await require('./it').saveIt(id, input.it);
    if (routed.groupId && !routed.agentId) {
        const agentId = await roundRobinAgent(routed.groupId);
        if (agentId) {
            await pool.query('UPDATE samadhan.tickets SET "agentId" = $2 WHERE id = $1', [id, agentId]);
            routed = { ...routed, agentId };
        }
    }
    await updateRow('tickets', id, await computeDueDates(routed));
    // Routing and round robin above count as part of creating the ticket, not as a later "assigned" activity.
    await touchActivity(id, 'created', data.lastActivityBy, data.lastActivityDetail, createdAt);

    const t = await loadTicket(id);
    // Acknowledgement: always for email; for other channels when asked (portal, an agent logging it on someone's behalf).
    if (t.source === 'Email' || input.notifyRequester) await emailRequester(t, 'requester.ticket_received');
    if (t.groupId) await notifyAgents(t, 'agent.assigned_group', 'group');
    if (t.agentId && t.agentId !== input.actorAgentId) await notifyAgents(t, 'agent.assigned_agent', 'assignee');
    if (!input.actorAgentId && CUSTOMER_SOURCES.includes(t.source)) {
        await ring(t, 'new_ticket', { title: `New ${t.source} ticket #${t.id}: ${t.subject}`, body: t.requesterName });
    }
    if (t.agentId && t.agentId !== input.actorAgentId) {
        await ring(t, 'assigned', { title: `Assigned to you: #${t.id} ${t.subject}`, body: t.requesterName, only: [t.agentId] });
    }
    return t;
}

async function updateTicket(id, patch, actorAgentId, opts = {}) {
    const before = await loadTicket(id);
    const changed = Object.keys(patch).filter((k) => PATCHABLE.includes(k) && JSON.stringify(patch[k] ?? null) !== JSON.stringify(before[k] ?? null));
    if (!changed.length) return before;

    const data = {};
    for (const k of changed) data[k] = patch[k];
    const now = new Date();

    // v7 Phase 3: the workspace follows the application; a manual change is the final classification (and teaches the
    // keyword suggestions when it corrects an automatic one).
    if (changed.includes('applicationId')) {
        const app = (await catalog()).byId.get(patch.applicationId);
        if (!app) throw fail(400, 'Unknown application.');
        data.workspaceId = app.workspaceId;
        data.classificationSource = 'manual';
        data.classificationConfidence = null;
        if (['keyword', 'ai', 'default', 'sender_rule', 'subject_tag'].includes(before.classificationSource)) await learnFrom(app.id, before.subject).catch(() => {});
        if (data.workspaceId !== before.workspaceId) changed.push('workspaceId');
    }
    if (changed.includes('type') && !changed.includes('recordClass') && before.recordClass !== undefined) {
        const rc = await recordClassForType(patch.type);
        if (rc !== before.recordClass) { data.recordClass = rc; changed.push('recordClass'); }
    }
    const workspaceAfter = data.workspaceId ?? before.workspaceId ?? null;
    const categoryAfter = patch.category !== undefined ? patch.category : before.category;
    const functionAfter = patch.function !== undefined ? patch.function : before.function;

    // A category that is confidential by default makes the ticket confidential (only an explicit change turns it off).
    if ((changed.includes('category') || changed.includes('function')) && !changed.includes('confidential') && before.confidential === false
        && (await confidentialByDefault(workspaceAfter, categoryAfter, functionAfter))) {
        data.confidential = true; changed.push('confidential');
    }
    // Severity follows Category -> Function, and sets priority.
    if (changed.includes('category') || changed.includes('function')) {
        const sev = await severityFor(categoryAfter, functionAfter, workspaceAfter);
        data.severity = sev;
        if (!changed.includes('priority')) data.priority = await severityPriority(sev);
    }
    // Impact x Urgency (workspaces in that priority mode) decides the priority unless it was set by hand.
    if (!changed.includes('priority') && ['impact', 'urgency', 'category', 'function', 'applicationId'].some((k) => changed.includes(k))) {
        const impact = changed.includes('impact') ? patch.impact : before.impact;
        const urgency = changed.includes('urgency') ? patch.urgency : before.urgency;
        const p = await matrixPriorityFor(workspaceAfter, impact, urgency, categoryAfter, functionAfter);
        if (p) { data.priority = p; data.severity = SEVERITY_FOR_PRIORITY[p]; }
    }

    // Status: pause / resume the SLA clock, stamp resolved and closed times.
    let pausedMins = before.slaPausedMins;
    if (changed.includes('statusId')) {
        const next = (await pool.query('SELECT * FROM samadhan.ticket_statuses WHERE id = $1', [patch.statusId])).rows[0];
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
    if (changed.includes('statusId') || priority !== before.priority || groupId !== before.groupId || changed.includes('applicationId')) {
        Object.assign(data, await computeDueDates({ createdAt: before.createdAt, groupId, priority, slaPausedMins: pausedMins, firstRespondedAt: before.firstRespondedAt,
            workspaceId: workspaceAfter, applicationId: data.applicationId ?? before.applicationId }));
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
    if (changed.includes('statusId') || changed.includes('agentId')) {
        const actor = actorAgentId ? (await pool.query('SELECT name FROM samadhan.agents WHERE id = $1', [actorAgentId])).rows[0]?.name : 'Automation';
        if (changed.includes('statusId')) await touchActivity(id, 'status', actor, `${before.statusName} → ${t.statusName}`, now);
        else await touchActivity(id, 'assigned', actor, t.agentName ? `Assigned to ${t.agentName}` : 'Unassigned', now);
    }
    if (changed.includes('agentId') && t.agentId && t.agentId !== actorAgentId) {
        await ring(t, 'assigned', { title: `Assigned to you: #${t.id} ${t.subject}`, body: t.requesterName, only: [t.agentId] });
    }
    if (changed.includes('agentId') && t.agentId && t.agentId !== actorAgentId) await notifyAgents(t, 'agent.assigned_agent', 'assignee');
    if (changed.includes('statusId')) {
        const by = actorAgentId ? (await pool.query('SELECT name FROM samadhan.agents WHERE id = $1', [actorAgentId])).rows[0]?.name ?? 'An agent' : 'Automation';
        const title = `#${t.id} is now ${t.statusName}`;
        // The ticket's agent hears when someone else (or an automation) changes the status.
        if (t.agentId && t.agentId !== actorAgentId) await ring(t, 'status_changed', { title, body: `${by}: ${before.statusName} → ${t.statusName}`, only: [t.agentId] });
        if (t.statusId === STATUS.ESCALATION_L3) await ring(t, 'escalated', { title: `Escalated to L3: #${t.id} ${t.subject}`, body: by, except: actorAgentId });
        const watching = await watchersOf(id, [actorAgentId, t.agentId]);
        if (watching.length) await ring(t, 'watching', { title: `${title} (watching)`, body: `${by}: ${before.statusName} → ${t.statusName}`, only: watching });
    }
    if (changed.includes('groupId') && t.groupId) await notifyAgents(t, 'agent.assigned_group', 'group');
    if (changed.includes('statusId') && t.isClosed && !before.isClosed) await require('./ticketOps').maybeSendCsat(t);
    if (!opts.skipAutomations) await runRules('ON_UPDATE', id, changed);
    return t;
}

/**
 * v7: files picked for a reply / forward (already uploaded to this ticket). Up to the outbound limit they travel with
 * the email; above it the email lists them with a link that needs a Samadhan sign-in (§L). Returns { files, linksHtml }.
 */
async function outboundFiles(ticketId, ids) {
    const want = [...new Set((ids ?? []).map(Number).filter(Number.isInteger))].slice(0, 20);
    if (!want.length) return { rows: [], files: [], linksHtml: '' };
    const { limits, readAttachment } = require('./attachments');
    const rows = (await pool.query('SELECT * FROM samadhan.ticket_attachments WHERE id = ANY($1::int[]) AND "ticketId" = $2 AND "deletedAt" IS NULL', [want, ticketId])).rows;
    if (rows.length !== want.length) throw fail(400, 'One of the chosen files is not on this ticket.');
    const total = rows.reduce((n, r) => n + Number(r.size), 0);
    const maxMb = (await limits()).outboundMb;
    if (total <= maxMb * 1024 * 1024) {
        const files = [];
        for (const r of rows) files.push({ name: r.fileName, contentType: r.contentType, buffer: await readAttachment(r) });
        return { rows, files, linksHtml: '' };
    }
    const { APP_URL } = require('../../ccbTeams');
    const items = rows.map((r) => `<li>${esc(r.fileName)} (${(Number(r.size) / 1048576).toFixed(1)} MB)</li>`).join('');
    const linksHtml = `<p>The files are larger than ${maxMb} MB together, so they are not attached. Open them in Samadhan (sign-in needed): <a href="${APP_URL}${ticketLink(ticketId)}">ticket #${ticketId}</a></p><ul>${items}</ul>`;
    return { rows, files: [], linksHtml };
}

async function addAgentMessage(ticketId, m, agent) {
    const t = await loadTicket(ticketId);
    const now = new Date();
    let html = m.html;
    const out = m.kind === 'NOTE' ? { rows: [], files: [], linksHtml: '' } : await outboundFiles(ticketId, m.attachmentIds);
    if (out.linksHtml) html = `${html}${out.linksHtml}`;
    let to = (m.to ?? []).map((x) => x.toLowerCase());
    const cc = (m.cc ?? []).map((x) => x.toLowerCase());
    const withAgent = { ...t, agentName: agent.name };
    // A reply on a WhatsApp ticket goes back on WhatsApp (to the requester's number), not by email.
    const viaWhatsApp = m.kind === 'REPLY' && t.source === 'WhatsApp' && Boolean(t.requesterMobile || t.requesterPhone);
    let delivery = null;

    if (viaWhatsApp) {
        const signature = await renderTemplate('reply.signature', withAgent);
        html = `${m.html}${signature ? `<br>${signature.html}` : ''}`;
        to = [];
        delivery = await sendWhatsApp(t.requesterMobile || t.requesterPhone, stripTags(html.replace(/<br\s*\/?>|<\/p>/gi, '\n')));
        await logActivity(ticketId, delivery.sent ? 'whatsapp_sent' : 'whatsapp_failed', delivery.sent ? {} : { reason: delivery.reason }, agent.id);
    } else if (m.kind === 'REPLY') {
        to = t.requesterEmail ? [t.requesterEmail, ...to.filter((x) => x !== t.requesterEmail)] : to;
        const signature = await renderTemplate('reply.signature', withAgent);
        html = `${html}${signature ? `<br>${signature.html}` : ''}`;
        await sendMail({ to, cc, subject: `Re: ${t.subject}${await refTag(t)} [#${t.id}]`, html, attachments: out.files });
    } else if (m.kind === 'FORWARD') {
        const fwd = await renderTemplate('forward.signature', withAgent);
        html = `${html}${fwd ? `<br>${fwd.html}` : ''}<hr>${t.description}`;
        await sendMail({ to, cc, subject: `Fwd: ${t.subject}${await refTag(t)} [#${t.id}]`, html, attachments: out.files });
    }

    const conv = await pool.query(
        `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "agentId", "toEmails", "ccEmails", channel) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [ticketId, m.kind, html, stripTags(html), agent.id, to, cc, viaWhatsApp ? 'whatsapp' : 'email'],
    );
    // v7: files uploaded in the composer belong to this message (paperclip on the conversation).
    const linkIds = [...new Set([...out.rows.map((r) => r.id), ...((m.kind === 'NOTE' ? m.attachmentIds : []) ?? []).map(Number).filter(Number.isInteger)])];
    if (linkIds.length) {
        await pool.query('UPDATE samadhan.ticket_attachments SET "conversationId" = $1 WHERE id = ANY($2::int[]) AND "ticketId" = $3 AND "conversationId" IS NULL', [conv.rows[0].id, linkIds, ticketId]);
    }

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
        if (m.kind === 'NOTE') {
            const mentioned = (await mentionedAgents(stripTags(m.html))).filter((a) => a !== agent.id);
            if (mentioned.length) await ring(t, 'mention', { title: `${agent.name} mentioned you on #${t.id}`, body: stripTags(m.html).slice(0, 200), only: mentioned });
        }
        if (m.kind === 'NOTE' && t.agentId && t.agentId !== agent.id) {
            await notifyAgents(t, 'agent.note_added', 'assignee', { 'comment.body': stripTags(m.html) });
            await ring(t, 'note', { title: `${agent.name} added a note on #${t.id}`, body: stripTags(m.html).slice(0, 200), only: [t.agentId] });
        }
    }
    // After any "assign to first responder" above, so the list shows the reply itself as the last activity.
    const KIND = { REPLY: 'agent_reply', NOTE: 'note', FORWARD: 'forward' };
    await touchActivity(ticketId, KIND[m.kind], agent.name, viaWhatsApp ? 'WhatsApp' : m.kind === 'FORWARD' ? `To ${to.join(', ')}` : null, now);
    await logActivity(ticketId, 'message', { kind: m.kind, channel: viaWhatsApp ? 'whatsapp' : 'email' }, agent.id);
    return { delivery };
}

/** A requester's reply on an existing ticket (email, or WhatsApp with channel / fromPhone). Reopens resolved / waiting tickets. */
async function addRequesterReply(ticketId, m) {
    const exists = await pool.query('SELECT 1 FROM samadhan.conversations WHERE "messageId" = $1', [m.messageId]);
    if (exists.rows.length) return;
    await pool.query(
        `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "fromEmail", "fromPhone", channel, "messageId", "createdAt")
         VALUES ($1, 'INCOMING', $2, $3, $4, $5, $6, $7, $8)`,
        [ticketId, m.html, stripTags(m.html), m.fromEmail ?? null, m.fromPhone ?? null, m.channel ?? 'email', m.messageId, m.receivedAt],
    );
    const t = await loadTicket(ticketId);
    if (t.statusId !== STATUS.OPEN && !t.isClosed) await updateTicket(ticketId, { statusId: STATUS.OPEN }, null);
    await updateRow('tickets', ticketId, { nextResponseDueAt: await nextResponseDue(t.groupId, t.priority), updatedAt: new Date() });
    const after = await loadTicket(ticketId);
    await notifyAgents(after, 'agent.requester_replied', 'assignee', { 'comment.body': stripTags(m.html) });
    // Last, so the reply (not the reopening above) is what the list shows.
    await touchActivity(ticketId, 'requester_reply', after.requesterName, m.channel === 'whatsapp' ? 'WhatsApp' : null, new Date());
    await logActivity(ticketId, 'requester_replied', { channel: m.channel ?? 'email' });
    await ring(after, 'requester_reply', { title: `${after.requesterName} replied on #${after.id}`, body: stripTags(m.html).slice(0, 200) });
    // Agents watching the ticket hear about requester replies too (their own bell mute still applies).
    const watchers = await watchersOf(ticketId, [after.agentId]);
    if (watchers.length) await ring(after, 'watching', { title: `${after.requesterName} replied on #${after.id} (watching)`, body: stripTags(m.html).slice(0, 200), only: watchers });
}

module.exports = { CREATE_FIELDS, LONG_TEXT_FIELDS, addAgentMessage, addRequesterReply, createTicket, runActions, updateTicket };
