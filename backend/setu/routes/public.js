'use strict';
const express = require('express');
const { pool } = require('../../db');
const { EMAIL_RE, PHONE_RE, WHATSAPP } = require('../constants');
const { ready } = require('../db/ready');
const { createTicket } = require('../lib/tickets');
const { inboundMessages, metaJson, validSignature, whatsappReady } = require('../lib/whatsapp');
const { processWhatsApp } = require('../lib/whatsappIngest');
const { fail, setting, textToHtml, wrap } = require('../lib/util');

const router = express.Router();

// ---------- Routes without a hub sign-in: requester portal, WhatsApp webhook ----------
// They sit before requireAccess (index.js). Each has its own limits, because there is no signed-in person to key on.

// Portal limits per client address (from X-Forwarded-For behind nginx / API Gateway). The address can be spoofed,
// so the per-email and whole-portal caps in the database are the real backstop.
const WINDOW_MS = 10 * 60_000;
const PORTAL_LIMITS = { submit: 5, status: 30 };
const hits = new Map();
function portalLimit(req, bucket) {
    const ip = String(req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim() || 'unknown';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= PORTAL_LIMITS[bucket]) throw fail(429, 'Too many requests from your network. Please try again in a few minutes.');
    list.push(now);
    hits.set(key, list);
    if (hits.size > 20_000) hits.delete(hits.keys().next().value);
}

const portalEnabled = async () => (await setting('portal.enabled')) !== false;

async function categories() {
    const { rows } = await pool.query(
        `SELECT c.value FROM setu.field_choices c JOIN setu.field_definitions d ON d.id = c."fieldId"
         WHERE d.key = 'category' AND c."parentId" IS NULL AND c.active ORDER BY c.position, c.id`,
    );
    return rows.map((r) => r.value);
}

router.get('/portal/config', wrap(async (req, res) => {
    await ready;
    if (!(await portalEnabled())) return res.json({ success: true, enabled: false });
    res.json({ success: true, enabled: true, categories: await categories() });
}));

router.post('/portal/tickets', wrap(async (req, res) => {
    await ready;
    portalLimit(req, 'submit');
    if (!(await portalEnabled())) throw fail(403, 'The support portal is closed. Please email the helpdesk instead.');
    const b = req.body ?? {};
    // Hidden field people never see: bots that fill every box get a normal-looking answer and no ticket.
    if (b.website) return res.status(201).json({ success: true, ticket: { id: 0 } });
    const name = String(b.name || '').trim().slice(0, 200);
    const email = String(b.email || '').trim().toLowerCase();
    const phone = String(b.phone || '').trim();
    const subject = String(b.subject || '').trim().slice(0, 300);
    const description = String(b.description || '').trim().slice(0, 10000);
    const distributorCode = String(b.distributorCode || '').trim().slice(0, 50);
    const category = String(b.category || '').trim();
    if (!name || !subject || !description) throw fail(400, 'Fill in your name, the subject and a description of the issue.');
    if (!EMAIL_RE.test(email) || email.length > 320) throw fail(400, 'Enter a valid email address - replies are sent there.');
    if (phone && !PHONE_RE.test(phone)) throw fail(400, 'Enter a valid phone number, or leave it empty.');
    if (category && !(await categories()).includes(category)) throw fail(400, 'Pick a category from the list.');

    const [perEmail, total] = await Promise.all([
        pool.query(
            `SELECT count(*)::int AS n FROM setu.tickets t JOIN setu.contacts c ON c.id = t."requesterId"
             WHERE c.email = $1 AND t.source = 'Portal' AND t."createdAt" >= now() - interval '1 day'`,
            [email],
        ),
        pool.query(`SELECT count(*)::int AS n FROM setu.tickets WHERE source = 'Portal' AND "createdAt" >= now() - interval '1 hour'`),
    ]);
    if (perEmail.rows[0].n >= 10) throw fail(429, 'You have raised 10 tickets today. Please reply on an existing ticket, or email the helpdesk.');
    if (total.rows[0].n >= 300) throw fail(429, 'The portal is very busy. Please try again shortly, or email the helpdesk.');

    // The distributor master fills in the distributor details, as on the agent screen.
    const fields = { category: category || undefined, distributorCode: distributorCode || undefined, mobileNo: phone || undefined };
    if (distributorCode) {
        const d = (await pool.query('SELECT * FROM setu.distributors WHERE upper(code) = upper($1) LIMIT 1', [distributorCode])).rows[0];
        if (d) Object.assign(fields, { distributorCode: d.code, distributorName: d.name, region: d.region ?? undefined, state: d.state ?? undefined, depot: d.depot ?? undefined, asmName: d.asmName ?? undefined, depotCoordinator: d.depotCoordinator ?? undefined });
    }
    const t = await createTicket({
        subject,
        description: textToHtml(description),
        requester: { email, name, phone: phone || null },
        source: 'Portal',
        fields,
        notifyRequester: true,
    });
    res.status(201).json({ success: true, ticket: { id: t.id } });
}));

/** Status of one ticket for the person who raised it: ticket number + their email must match. No conversation text. */
router.post('/portal/status', wrap(async (req, res) => {
    await ready;
    portalLimit(req, 'status');
    if (!(await portalEnabled())) throw fail(403, 'The support portal is closed.');
    const id = Number(req.body?.id);
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!Number.isInteger(id) || id < 1 || !EMAIL_RE.test(email)) throw fail(400, 'Enter your ticket number and the email you used.');
    const { rows } = await pool.query(
        `SELECT t.id, t.subject, t."createdAt", t."lastActivityAt", t."resolvedAt", s.name AS status, s."isResolved", s."isClosed"
         FROM setu.tickets t JOIN setu.contacts c ON c.id = t."requesterId" JOIN setu.ticket_statuses s ON s.id = t."statusId"
         WHERE t.id = $1 AND c.email = $2`,
        [id, email],
    );
    if (!rows.length) throw fail(404, 'No ticket found with that number and email.');
    res.json({ success: true, ticket: rows[0] });
}));

// WhatsApp Cloud API webhook. GET: Meta's one-time verification. POST: messages (signed with the app secret).
router.get('/whatsapp/webhook', (req, res) => {
    const ok = WHATSAPP.verifyToken && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === WHATSAPP.verifyToken;
    if (!ok) return res.sendStatus(403);
    res.type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
});

router.post('/whatsapp/webhook', async (req, res) => {
    if (!whatsappReady()) return res.sendStatus(404);
    if (!validSignature(req.rawBody ?? Buffer.from(metaJson(req.body ?? {})), req.get('x-hub-signature-256'))) return res.sendStatus(401);
    try {
        await ready;
        for (const m of inboundMessages(req.body)) {
            // One message never blocks the rest.
            await processWhatsApp(m).catch((err) => console.error('[setu] whatsapp message skipped:', err.message));
        }
    } catch (err) {
        console.error('[setu] whatsapp webhook:', err.message);
    }
    // Always 200 once the signature is good: Meta retries anything else, which would only repeat the same failure.
    res.sendStatus(200);
});

module.exports = router;
