'use strict';
const { notify } = require('../../notifications');
const { pool } = require('../../db');
const { APP_URL } = require('../../ccbTeams');
const { APP_ID } = require('../constants');
const { sendMail } = require('./mail');
const { esc, fmtIst, logActivity, stripTags, ticketLink } = require('./util');

// ---------- Templates & notifications ----------

/** A ticket with the joined names templates and the UI need. */
async function loadTicket(id) {
    const { rows } = await pool.query(
        `SELECT t.*, c.name AS "requesterName", c.email AS "requesterEmail", c.phone AS "requesterPhone", c.mobile AS "requesterMobile",
                g.name AS "groupName", a.name AS "agentName", a.email AS "agentEmail", a.active AS "agentActive",
                s.name AS "statusName", s."pausesSla", s."isResolved", s."isClosed"
         FROM setu.tickets t
         JOIN setu.contacts c ON c.id = t."requesterId"
         JOIN setu.ticket_statuses s ON s.id = t."statusId"
         LEFT JOIN setu.groups g ON g.id = t."groupId"
         LEFT JOIN setu.agents a ON a.id = t."agentId"
         WHERE t.id = $1`,
        [id],
    );
    if (!rows.length) {
        const err = new Error('Ticket not found');
        err.status = 404;
        throw err;
    }
    return rows[0];
}

function placeholders(t, extra = {}) {
    return {
        'ticket.id': String(t.id),
        'ticket.subject': t.subject,
        'ticket.description': stripTags(t.description),
        'ticket.url': `${APP_URL}${ticketLink(t.id)}`,
        'ticket.status': t.statusName ?? '',
        'ticket.group.name': t.groupName ?? '',
        'ticket.agent.name': t.agentName ?? '',
        'ticket.requester.name': t.requesterName ?? '',
        'ticket.requester.email': t.requesterEmail ?? '',
        'ticket.first_response_due': fmtIst(t.firstResponseDueAt),
        'ticket.resolution_due': fmtIst(t.resolutionDueAt),
        'ticket.distributor.code': t.distributorCode ?? '',
        'ticket.distributor.name': t.distributorName ?? '',
        helpdesk_name: extra.helpdesk_name ?? 'Emami Secondary Helpdesk',
        ...extra,
    };
}

/** Fills {{placeholders}}; values are HTML-escaped in the body, plain in the subject. */
function render(text, values, html) {
    return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
        const v = values[k] ?? '';
        return html ? esc(v).replace(/\n/g, '<br>') : v;
    });
}

/** Plain-text {{placeholder}} fill for a ticket (scenario replies, canned text). */
const fillPlaceholders = (text, t, extra = {}) => render(String(text), placeholders(t, extra), false);

async function renderTemplate(key, t, extra = {}) {
    const { rows } = await pool.query('SELECT subject, body, enabled FROM setu.email_templates WHERE key = $1', [key]);
    if (!rows.length || !rows[0].enabled) return null;
    const values = placeholders(t, { helpdesk_name: await require('./config').option('general.helpdeskName'), ...extra });
    return { subject: render(rows[0].subject, values, false), html: render(rows[0].body, values, true) };
}

async function emailRequester(t, template, extra = {}) {
    if (!t.requesterEmail) return;
    const msg = await renderTemplate(template, t, extra);
    if (!msg) return;
    await sendMail({ to: [t.requesterEmail], subject: msg.subject, html: msg.html });
    await logActivity(t.id, 'email_sent', { template, to: t.requesterEmail });
}

/** Agent notifications go to the Emami Apps inbox (hub bell + Outlook) - see notifications.js. */
async function notifyAgents(t, template, to, extra = {}) {
    let recipients = [];
    if (to === 'assignee') recipients = t.agentActive && t.agentEmail ? [t.agentEmail] : [];
    else if (to === 'group' && t.groupId) {
        const { rows } = await pool.query(
            'SELECT a.email FROM setu.group_members m JOIN setu.agents a ON a.id = m."agentId" WHERE m."groupId" = $1 AND a.active',
            [t.groupId],
        );
        recipients = rows.map((r) => r.email);
    } else if (Array.isArray(to)) recipients = to;
    // Agents who switched this notification off for themselves (My notifications) are left out.
    if (recipients.length) {
        const muted = await pool.query(
            `SELECT lower(email) AS email FROM setu.agents WHERE lower(email) = ANY($1::text[]) AND COALESCE(prefs -> 'emailMuted', '[]'::jsonb) ? $2`,
            [recipients.map((r) => String(r).toLowerCase()), template],
        );
        const skip = new Set(muted.rows.map((r) => r.email));
        recipients = recipients.filter((r) => !skip.has(String(r).toLowerCase()));
    }
    if (!recipients.length) return;
    const msg = await renderTemplate(template, t, extra);
    if (!msg) return;
    const body = stripTags(msg.html.replace(/<br\s*\/?>/gi, '\n')).slice(0, 1500);
    await Promise.all([...new Set(recipients)].map((email) =>
        notify({ email, appId: APP_ID, kind: template.replace(/^agent\./, ''), title: msg.subject, body, link: ticketLink(t.id), refKey: `setu:${t.id}:${template}` })));
}

module.exports = { emailRequester, fillPlaceholders, loadTicket, notifyAgents, renderTemplate };
