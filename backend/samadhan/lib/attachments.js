'use strict';
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { option } = require('./config');
const { checkFile } = require('./fileCheck');
const { objectKey, storage, storageInfo } = require('./storage');
const { fail, logActivity } = require('./util');

/*
   Ticket attachments (v7 Phase 2, master prompt §L). Files live in the storage adapter (lib/storage.js - an SFTP
   server, host-to-host, in production); Postgres keeps only the metadata row in ticket_attachments and the ticket's
   "attachmentCount". The unused v1 table samadhan.attachments is left untouched.

   Limits are Admin-editable (Admin > General, setting attachments.limits) inside hard ceilings that no setting can
   raise. Downloads go through short-lived signed links (5 minutes) issued only after the permission and scope checks.
*/

const MB = 1024 * 1024;
const CEILING_MB = { agent: 25, portal: 10, email: 25 };
const DEFAULT_LIMITS = {
    agent: { perFileMb: 10, filesPerAction: 10, perTicketMb: 100 },
    portal: { perFileMb: 5, filesPerAction: 5, perTicketMb: 25 },
    email: { perFileMb: 20, perTicketMb: 100 },
    outboundMb: 20,
};
const LINK_MINUTES = 5;

async function limits() {
    const set = (await option('attachments.limits')) || {};
    const out = JSON.parse(JSON.stringify(DEFAULT_LIMITS));
    for (const ch of ['agent', 'portal', 'email']) {
        for (const k of Object.keys(out[ch])) {
            const v = Number(set?.[ch]?.[k]);
            if (Number.isFinite(v) && v > 0) out[ch][k] = v;
        }
        out[ch].perFileMb = Math.min(out[ch].perFileMb, CEILING_MB[ch]);
    }
    if (Number(set.outboundMb) > 0) out.outboundMb = Math.min(Number(set.outboundMb), 25);
    return out;
}

const signingKey = () => {
    const s = process.env.HUB_AUTH_JWT_SECRET;
    if (!s) throw fail(503, 'Downloads are not available: the server has no signing secret.');
    return crypto.createHash('sha256').update(`samadhan-attachment-link:${s}`).digest();
};
function signLink(id, minutes = LINK_MINUTES) {
    const exp = Math.floor(Date.now() / 1000) + minutes * 60;
    const body = `${id}.${exp}`;
    const sig = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
    return `${body}.${sig}`;
}
function verifyLink(token) {
    const m = /^(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(token || ''));
    if (!m) return null;
    const want = crypto.createHmac('sha256', signingKey()).update(`${m[1]}.${m[2]}`).digest('base64url');
    const a = Buffer.from(want);
    const b = Buffer.from(m[3]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Number(m[2]) < Date.now() / 1000) return null;
    return Number(m[1]);
}

async function updateCount(ticketIds) {
    const ids = [...new Set([].concat(ticketIds).map(Number).filter(Number.isInteger))];
    if (!ids.length) return;
    await pool.query(
        `UPDATE samadhan.tickets t SET "attachmentCount" = (SELECT count(*)::int FROM samadhan.ticket_attachments a WHERE a."ticketId" = t.id AND a."deletedAt" IS NULL)
         WHERE t.id = ANY($1::int[])`, [ids]);
}

/**
 * Stores one file for a ticket. channel: agent | portal | email. Returns the metadata row.
 * Refuses (4xx) when attachments are off, the type is not allowed, or a limit would be exceeded.
 */
async function saveAttachment(ticketId, { name, buffer, channel = 'agent', agentId = null, conversationId = null, actor = null }) {
    const store = storage();
    if (!store) throw fail(503, storageInfo().reason);
    const lim = (await limits())[channel] ?? (await limits()).agent;
    if (buffer.length > lim.perFileMb * MB) throw fail(413, `${name} is larger than ${lim.perFileMb} MB.`);
    const check = checkFile(name, buffer);
    if (!check.ok) throw fail(415, check.error);
    const used = Number((await pool.query(`SELECT COALESCE(sum(size), 0)::bigint AS n FROM samadhan.ticket_attachments WHERE "ticketId" = $1 AND "deletedAt" IS NULL`, [ticketId])).rows[0].n);
    if (used + buffer.length > lim.perTicketMb * MB) throw fail(413, `This ticket already holds ${Math.round(used / MB)} MB of files; the limit is ${lim.perTicketMb} MB.`);
    const key = objectKey(ticketId);
    const { ref } = await store.put(key, buffer, { fileName: check.name, contentType: check.type, ticketId, actor });
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const { rows } = await pool.query(
        `INSERT INTO samadhan.ticket_attachments ("ticketId", "conversationId", "fileName", "contentType", size, sha256, "storageAdapter", "storageKey", "storageRef", channel, "uploadedByAgentId", "scanStatus")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'not_scanned')
         RETURNING id, "ticketId", "conversationId", "fileName", "contentType", size, channel, "uploadedByAgentId", "createdAt"`,
        [ticketId, conversationId, check.name, check.type, buffer.length, sha256, store.name, key, ref, channel, agentId]);
    await updateCount(ticketId);
    await logActivity(ticketId, 'attachment_added', { file: check.name, size: buffer.length, channel }, agentId);
    return { ...rows[0], preview: check.preview };
}

async function listAttachments(ticketId) {
    const { rows } = await pool.query(
        `SELECT a.id, a."ticketId", a."conversationId", a."fileName", a."contentType", a.size, a.channel, a."uploadedByAgentId", ag.name AS "uploadedByName", a."scanStatus", a."createdAt"
         FROM samadhan.ticket_attachments a LEFT JOIN samadhan.agents ag ON ag.id = a."uploadedByAgentId"
         WHERE a."ticketId" = $1 AND a."deletedAt" IS NULL ORDER BY a."createdAt"`, [ticketId]);
    const preview = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'application/pdf']);
    return rows.map((r) => ({ ...r, size: Number(r.size), preview: preview.has(r.contentType) }));
}

const loadAttachment = async (id) => (await pool.query('SELECT * FROM samadhan.ticket_attachments WHERE id = $1 AND "deletedAt" IS NULL', [id])).rows[0] ?? null;

/** Reads the file bytes (download). Files whose virus scan is not clean are never served (§L). */
async function readAttachment(row) {
    if (['infected', 'failed'].includes(row.scanStatus)) throw fail(403, 'This file was blocked by the virus check.');
    const store = storage();
    if (!store || store.name !== row.storageAdapter) throw fail(503, 'File storage is not available on this server.');
    return store.get(row.storageRef);
}

/** Removes files: from storage first, then marks the rows deleted (kept for the audit trail). */
async function removeAttachments(rows, { actor = null, agentId = null, reason = 'deleted' } = {}) {
    const store = storage();
    const ticketIds = new Set();
    for (const r of rows) {
        if (store && store.name === r.storageAdapter) {
            try { await store.del(r.storageRef, actor); } catch (err) { if (err.status !== 404) console.error('[samadhan] attachment delete:', err.message); }
        }
        await pool.query('UPDATE samadhan.ticket_attachments SET "deletedAt" = now(), "deletedReason" = $2 WHERE id = $1', [r.id, reason]);
        ticketIds.add(r.ticketId);
        if (reason === 'deleted') await logActivity(r.ticketId, 'attachment_deleted', { file: r.fileName }, agentId).catch(() => {});
    }
    await updateCount([...ticketIds]);
}

/** Purge (tickets deleted for good) - called BEFORE the ticket rows are deleted. */
async function purgeForTickets(ticketIds) {
    const { rows } = await pool.query('SELECT * FROM samadhan.ticket_attachments WHERE "ticketId" = ANY($1::int[]) AND "deletedAt" IS NULL', [ticketIds]);
    await removeAttachments(rows, { reason: 'ticket purged' });
}

/** Contact anonymisation: that contact's own uploads (portal / email) are deleted. */
async function purgeForContacts(contactIds) {
    const { rows } = await pool.query(
        `SELECT a.* FROM samadhan.ticket_attachments a JOIN samadhan.tickets t ON t.id = a."ticketId"
         WHERE t."requesterId" = ANY($1::int[]) AND a.channel IN ('portal', 'email') AND a."deletedAt" IS NULL`, [contactIds]);
    await removeAttachments(rows, { reason: 'contact anonymised' });
    return rows.length;
}

/** Merge: the secondary tickets' files move to the primary ticket. */
async function moveOnMerge(primaryId, secondaryIds, client = pool) {
    await client.query('UPDATE samadhan.ticket_attachments SET "ticketId" = $1 WHERE "ticketId" = ANY($2::int[]) AND "deletedAt" IS NULL', [primaryId, secondaryIds]);
    await updateCount([primaryId, ...secondaryIds]);
}

module.exports = {
    CEILING_MB, DEFAULT_LIMITS, LINK_MINUTES, limits, listAttachments, loadAttachment, moveOnMerge, purgeForContacts, purgeForTickets,
    readAttachment, removeAttachments, saveAttachment, signLink, updateCount, verifyLink,
};
