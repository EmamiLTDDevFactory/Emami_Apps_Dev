'use strict';
const { pool } = require('../../db');
const { MAILBOX, MAIL_ENABLED } = require('../constants');
const { graph, noiseReason, senderUnverified, ticketNumberFromSubject } = require('./mail');
const { addRequesterReply, createTicket } = require('./tickets');

/*
   Microsoft 365 support mailbox -> tickets. New inbox messages since the last run (Graph delta query) become
   new tickets or replies on existing ones; noise (auto-replies, out-of-office, our own notifications coming back,
   floods, unverified senders replying on a ticket) is parked for review in Admin > Parked mail.
*/

async function park(m, reason) {
    await pool.query(
        `INSERT INTO setu.parked_mail ("messageId", "fromEmail", subject, reason, "receivedAt") VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [
            m.internetMessageId,
            (m.from?.emailAddress?.address ?? 'unknown@invalid').toLowerCase().slice(0, 320),
            String(m.subject ?? '').slice(0, 500),
            reason,
            m.receivedDateTime || new Date(),
        ],
    );
}

/** Turns one mailbox message into a new ticket, a reply on an existing ticket, or a parked mail. */
async function processMessage(m) {
    const seen = await pool.query(
        `SELECT 1 FROM setu.conversations WHERE "messageId" = $1 UNION ALL SELECT 1 FROM setu.parked_mail WHERE "messageId" = $1`,
        [m.internetMessageId],
    );
    if (seen.rows.length) return 'seen';
    const fromEmail = (m.from?.emailAddress?.address ?? 'unknown@invalid').toLowerCase();
    const reason = noiseReason(m);
    if (reason) { await park(m, reason); return 'parked'; }

    const html = (m.uniqueBody ?? m.body).content;
    const number = ticketNumberFromSubject(m.subject);
    const existing = number
        ? (await pool.query('SELECT t.id, c.email FROM setu.tickets t JOIN setu.contacts c ON c.id = t."requesterId" WHERE t.id = $1', [number])).rows[0]
        : null;
    // Only the requester, or someone already on the ticket's email thread, can add to it.
    let onThread = false;
    if (existing) {
        onThread = existing.email === fromEmail || (await pool.query(
            `SELECT 1 FROM setu.conversations WHERE "ticketId" = $1 AND ("fromEmail" = $2 OR $2 = ANY("toEmails") OR $2 = ANY("ccEmails")) LIMIT 1`,
            [existing.id, fromEmail],
        )).rows.length > 0;
    }
    // A reply whose sender failed SPF / DKIM / DMARC may be forged: park it for an agent to check instead of
    // adding it to (or reopening) someone's ticket.
    if (existing && onThread && senderUnverified(m)) { await park(m, 'sender_not_verified'); return 'parked'; }
    // Flood guard: more than 20 new tickets from one sender in an hour are parked for review.
    const recent = await pool.query(
        `SELECT count(*)::int AS n FROM setu.tickets t JOIN setu.contacts c ON c.id = t."requesterId"
         WHERE c.email = $1 AND t."createdAt" >= now() - interval '1 hour'`,
        [fromEmail],
    );
    if (!onThread && recent.rows[0].n >= 20) { await park(m, 'sender_flood'); return 'parked'; }

    let outcome;
    if (existing && onThread) {
        await addRequesterReply(existing.id, { html, fromEmail, messageId: m.internetMessageId, receivedAt: new Date(m.receivedDateTime) });
        outcome = 'threaded';
    } else {
        await createTicket({
            subject: m.subject || '(no subject)',
            description: m.body.content,
            requester: { email: fromEmail, name: m.from?.emailAddress?.name ?? fromEmail },
            source: 'Email',
            createdAt: new Date(m.receivedDateTime),
            messageId: m.internetMessageId,
        });
        outcome = 'created';
    }
    await graph(`/users/${encodeURIComponent(MAILBOX)}/messages/${m.id}`, { method: 'PATCH', body: JSON.stringify({ isRead: true }) }).catch(() => {});
    return outcome;
}

async function ingestMail() {
    if (!MAIL_ENABLED) return { skipped: 'mail disabled' };
    const state = await pool.query('SELECT "deltaLink" FROM setu.mail_state WHERE mailbox = $1', [MAILBOX]);
    let url = state.rows[0]?.deltaLink ?? `/users/${encodeURIComponent(MAILBOX)}/mailFolders/inbox/messages/delta?$select=id`;
    const ids = [];
    let deltaLink = null;
    for (let page = 0; page < 50; page++) {
        const r = await graph(url);
        r.value.filter((m) => !m['@removed']).forEach((m) => ids.push(m.id));
        if (r['@odata.nextLink']) { url = r['@odata.nextLink']; continue; }
        deltaLink = r['@odata.deltaLink'] ?? null;
        break;
    }
    const select = 'id,subject,internetMessageId,receivedDateTime,from,toRecipients,ccRecipients,body,uniqueBody,internetMessageHeaders,hasAttachments';
    const counts = { created: 0, threaded: 0, parked: 0, failed: 0 };
    for (const id of ids) {
        // One message must never stop the rest: a failure parks that message and intake carries on.
        let m = null;
        try {
            m = await graph(`/users/${encodeURIComponent(MAILBOX)}/messages/${id}?$select=${select}`);
            const outcome = await processMessage(m);
            if (counts[outcome] !== undefined) counts[outcome]++;
        } catch (err) {
            counts.failed++;
            console.error('[setu] mail intake - message skipped:', err.message);
            if (m?.internetMessageId) await park(m, 'intake_error').catch(() => {});
        }
    }
    if (deltaLink) {
        await pool.query(
            `INSERT INTO setu.mail_state (mailbox, "deltaLink", "updatedAt") VALUES ($1, $2, now())
             ON CONFLICT (mailbox) DO UPDATE SET "deltaLink" = EXCLUDED."deltaLink", "updatedAt" = now()`,
            [MAILBOX, deltaLink],
        );
    }
    return counts;
}

module.exports = { ingestMail, processMessage };
