'use strict';
const crypto = require('crypto');
const express = require('express');
const { pool } = require('../db/pool');
const {
    LINK_MINUTES, limits, listAttachments, loadAttachment, readAttachment, removeAttachments, saveAttachment, signLink, verifyLink,
} = require('../lib/attachments');
const { storageInfo } = require('../lib/storage');
const { clientIp, fail, wrap } = require('../lib/util');

/*
   Attachments API (v7 Phase 2, master prompt §L).
     signed-in (after requireAccess + permission gate; every path is under /tickets/:id so the data-scope check applies):
       GET    /tickets/:id/attachments                      list                      ticket.view
       POST   /tickets/:id/attachments                      upload one file (raw)     attachment.upload
       POST   /tickets/:id/attachments/:aid/link            5-minute download link    attachment.download
       DELETE /tickets/:id/attachments/:aid                 delete                    attachment.delete, or own upload
     public (before requireAccess):
       GET    /files/:token                                 the file, if the signed link is valid and not expired
       POST   /portal/tickets/:id/attachments?token=...     requester upload right after raising a ticket in the portal
   The file comes as the raw request body with its name in the X-File-Name header (URL-encoded); the stored type comes
   from our own check (lib/fileCheck.js), never from the browser.
*/

const raw = (mb) => express.raw({ type: () => true, limit: `${mb + 1}mb` });
const fileName = (req) => { try { return decodeURIComponent(String(req.get('x-file-name') || '')); } catch { return String(req.get('x-file-name') || ''); } };
const ticketExists = async (id) => (await pool.query('SELECT id, "requesterId", "createdAt", "deletedAt" FROM samadhan.tickets WHERE id = $1', [id])).rows[0];

const router = express.Router();

router.get('/tickets/:id/attachments', wrap(async (req, res) => {
    const id = Number(req.params.id);
    res.json({ success: true, items: await listAttachments(id), storage: storageInfo(), limits: await limits() });
}));

router.post('/tickets/:id/attachments', raw(25), wrap(async (req, res) => {
    const id = Number(req.params.id);
    const t = await ticketExists(id);
    if (!t) throw fail(404, 'Ticket not found.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail(400, 'Send the file as the request body.');
    const conversationId = Number(req.query.conversationId) || null;
    if (conversationId) {
        const ok = (await pool.query('SELECT 1 FROM samadhan.conversations WHERE id = $1 AND "ticketId" = $2', [conversationId, id])).rows.length;
        if (!ok) throw fail(400, 'That message is not on this ticket.');
    }
    const row = await saveAttachment(id, { name: fileName(req), buffer: req.body, channel: 'agent', agentId: req.agent.id, conversationId, actor: req.verifiedEmail });
    res.status(201).json({ success: true, attachment: row });
}));

router.post('/tickets/:id/attachments/:aid/link', wrap(async (req, res) => {
    const row = await loadAttachment(Number(req.params.aid));
    if (!row || row.ticketId !== Number(req.params.id)) throw fail(404, 'File not found.');
    const token = signLink(row.id);
    res.json({ success: true, url: `files/${token}`, expiresInMinutes: LINK_MINUTES });
}));

router.delete('/tickets/:id/attachments/:aid', wrap(async (req, res) => {
    const row = await loadAttachment(Number(req.params.aid));
    if (!row || row.ticketId !== Number(req.params.id)) throw fail(404, 'File not found.');
    const own = row.uploadedByAgentId === req.agent.id;
    if (!own && !req.can('attachment.delete')) throw fail(403, 'You can delete only files you uploaded yourself.');
    await removeAttachments([row], { actor: req.verifiedEmail, agentId: req.agent.id });
    res.json({ success: true });
}));

// ---------- public ----------
const publicRouter = express.Router();

/** The file behind a signed 5-minute link. Served with a safe type and headers; ?inline=1 only for previewable types. */
publicRouter.get('/files/:token', wrap(async (req, res) => {
    const id = verifyLink(req.params.token);
    if (!id) throw fail(410, 'This download link has expired. Open the file again from the ticket.');
    const row = await loadAttachment(id);
    if (!row) throw fail(404, 'File not found.');
    const buf = await readAttachment(row);
    const inline = req.query.inline === '1' && /^(image\/(png|jpeg|gif|webp|bmp)|application\/pdf)$/.test(row.contentType);
    res.set({
        'Content-Type': row.contentType,
        'Content-Length': String(buf.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${row.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; plugin-types application/pdf; sandbox",
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
    });
    res.send(buf);
}));

// Portal: the create response carries an upload token valid for 30 minutes for that one ticket.
const portalKey = () => crypto.createHash('sha256').update(`samadhan-portal-upload:${process.env.HUB_AUTH_JWT_SECRET || ''}`).digest();
function portalUploadToken(ticketId) {
    const exp = Math.floor(Date.now() / 1000) + 30 * 60;
    const sig = crypto.createHmac('sha256', portalKey()).update(`${ticketId}.${exp}`).digest('base64url');
    return `${exp}.${sig}`;
}
function portalTokenValid(ticketId, token) {
    const m = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(token || ''));
    if (!m || Number(m[1]) < Date.now() / 1000 || !process.env.HUB_AUTH_JWT_SECRET) return false;
    const want = Buffer.from(crypto.createHmac('sha256', portalKey()).update(`${ticketId}.${m[1]}`).digest('base64url'));
    const got = Buffer.from(m[2]);
    return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// 20 portal uploads per address per 10 minutes (the per-ticket file cap below is the real backstop).
const uploadHits = new Map();
function uploadLimit(req) {
    const ip = clientIp(req);
    const now = Date.now();
    const list = (uploadHits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
    if (list.length >= 20) throw fail(429, 'Too many uploads from your network. Please try again in a few minutes.');
    list.push(now);
    uploadHits.set(ip, list);
    if (uploadHits.size > 20_000) uploadHits.delete(uploadHits.keys().next().value);
}

publicRouter.post('/portal/tickets/:id/attachments', raw(10), wrap(async (req, res) => {
    uploadLimit(req);
    const id = Number(req.params.id);
    if (!portalTokenValid(id, req.query.token)) throw fail(403, 'This upload is no longer possible. Reply to the ticket email to send more files.');
    const t = await ticketExists(id);
    if (!t || t.deletedAt) throw fail(404, 'Ticket not found.');
    const lim = (await limits()).portal;
    const already = (await pool.query(`SELECT count(*)::int AS n FROM samadhan.ticket_attachments WHERE "ticketId" = $1 AND channel = 'portal'`, [id])).rows[0].n;
    if (already >= lim.filesPerAction) throw fail(413, `At most ${lim.filesPerAction} files can be added from the portal.`);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail(400, 'Send the file as the request body.');
    const row = await saveAttachment(id, { name: fileName(req), buffer: req.body, channel: 'portal' });
    res.status(201).json({ success: true, attachment: { id: row.id, fileName: row.fileName, size: Number(row.size) } });
}));

module.exports = { portalUploadToken, publicRouter, router };
