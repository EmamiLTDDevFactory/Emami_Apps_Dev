'use strict';
const { pool } = require('../../db');
const { addRequesterReply, createTicket } = require('./tickets');
const { setting, textToHtml } = require('./util');

/*
   WhatsApp message -> ticket. A message joins the sender's open WhatsApp ticket that was updated within
   whatsapp.threadDays (default 7); otherwise it starts a new ticket (source WhatsApp, requester = the number).
   The same message never lands twice (WhatsApp message id stored as the conversation's messageId).
*/

const subjectFrom = (text, name) => {
    const line = String(text).split('\n').map((x) => x.trim()).find(Boolean) ?? '';
    return line && !line.startsWith('[') ? line.slice(0, 120) : `WhatsApp message from ${name}`;
};

async function processWhatsApp(m) {
    const seen = await pool.query('SELECT 1 FROM setu.conversations WHERE "messageId" = $1', [m.id]);
    if (seen.rows.length) return 'seen';
    const days = Number(await setting('whatsapp.threadDays')) || 7;
    const open = await pool.query(
        `SELECT t.id FROM setu.tickets t
         JOIN setu.contacts c ON c.id = t."requesterId"
         JOIN setu.ticket_statuses s ON s.id = t."statusId"
         WHERE (c.mobile = $1 OR c.phone = $1) AND t.source = 'WhatsApp' AND NOT s."isClosed"
           AND t."updatedAt" >= now() - make_interval(days => $2)
         ORDER BY t."updatedAt" DESC LIMIT 1`,
        [m.from, days],
    );
    const html = textToHtml(m.text || '(empty message)');
    if (open.rows.length) {
        await addRequesterReply(open.rows[0].id, { html, fromPhone: m.from, channel: 'whatsapp', messageId: m.id, receivedAt: m.at });
        return 'threaded';
    }
    // Flood guard, as for email: more than 20 new tickets an hour from one number are dropped (and logged).
    const recent = await pool.query(
        `SELECT count(*)::int AS n FROM setu.tickets t JOIN setu.contacts c ON c.id = t."requesterId"
         WHERE (c.mobile = $1 OR c.phone = $1) AND t.source = 'WhatsApp' AND t."createdAt" >= now() - interval '1 hour'`,
        [m.from],
    );
    if (recent.rows[0].n >= 20) {
        console.warn('[setu] whatsapp: more than 20 new tickets in an hour from one number - message dropped');
        return 'dropped';
    }
    await createTicket({
        subject: subjectFrom(m.text, m.name),
        description: html,
        requester: { name: m.name, mobile: m.from },
        source: 'WhatsApp',
        createdAt: m.at,
        messageId: m.id,
        channel: 'whatsapp',
        fromPhone: m.from,
    });
    return 'created';
}

module.exports = { processWhatsApp, subjectFrom };
