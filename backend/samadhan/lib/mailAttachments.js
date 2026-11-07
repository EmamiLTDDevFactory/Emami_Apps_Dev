'use strict';
const { pool } = require('../db/pool');
const { MAILBOX } = require('../constants');
const { limits, saveAttachment } = require('./attachments');
const { storage } = require('./storage');
const { graph } = require('./mail');
const { esc, logActivity } = require('./util');

/*
   Inbound email attachments (v7 Phase 2, master prompt §L "Lifecycle"): the files of a mail that became a ticket or a
   reply are saved and linked to that conversation, inline (cid:) images included. A file over the email limits, or of a
   type that is not allowed, is NOT stored: a private note lists the skipped files and asks the requester to share them
   through the portal. Runs only when attachments are switched on (lib/storage.js).
*/

const MB = 1024 * 1024;

async function ingestMailAttachments(m, ticketId) {
    if (!m.hasAttachments || !storage()) return { saved: 0, skipped: 0 };
    const conv = (await pool.query('SELECT id FROM samadhan.conversations WHERE "messageId" = $1', [m.internetMessageId])).rows[0];
    const lim = (await limits()).email;
    const list = await graph(`/users/${encodeURIComponent(MAILBOX)}/messages/${m.id}/attachments?$top=50`);
    const skipped = [];
    let saved = 0;
    let total = 0;
    for (const a of list?.value ?? []) {
        const name = String(a.name || 'attachment');
        // Attached Outlook items / calendar items have no file bytes here.
        if (a['@odata.type'] !== '#microsoft.graph.fileAttachment' || !a.contentBytes) { skipped.push(`${name} (attached email or item - forward it as a .msg / .eml file)`); continue; }
        const buffer = Buffer.from(a.contentBytes, 'base64');
        if (buffer.length > lim.perFileMb * MB) { skipped.push(`${name} (${(buffer.length / MB).toFixed(1)} MB - over ${lim.perFileMb} MB)`); continue; }
        if (total + buffer.length > lim.perTicketMb * MB) { skipped.push(`${name} (the mail's files are over ${lim.perTicketMb} MB in total)`); continue; }
        try {
            const row = await saveAttachment(ticketId, { name, buffer, channel: 'email', conversationId: conv?.id ?? null });
            if (a.isInline && a.contentId) await pool.query('UPDATE samadhan.ticket_attachments SET "inlineCid" = $2 WHERE id = $1', [row.id, String(a.contentId).slice(0, 300)]);
            total += buffer.length;
            saved += 1;
        } catch (err) {
            if (err.status && err.status < 500) skipped.push(`${name} (${err.message})`);
            else { console.error('[samadhan] mail attachment:', err.message); skipped.push(`${name} (could not be stored)`); }
        }
    }
    if (skipped.length) {
        const text = `Some files in this email were not stored:\n${skipped.map((s) => `- ${s}`).join('\n')}\nAsk the requester to share them through the portal (allowed: images, PDF, text / CSV / log, Office files, .msg / .eml, XML / JSON, ZIP).`;
        await pool.query(
            `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", channel) VALUES ($1, 'NOTE', $2, $3, 'email')`,
            [ticketId, `<p>${esc(text).replace(/\n/g, '<br>')}</p>`, text],
        );
        await logActivity(ticketId, 'attachments_skipped', { files: skipped.length });
    }
    return { saved, skipped: skipped.length };
}

module.exports = { ingestMailAttachments };
