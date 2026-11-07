'use strict';
const express = require('express');
const { pool } = require('../db/pool');
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

/**
 * Top-level categories a requester can pick for one desk (default Secondary Sales). v7: other desks' own lists (SAP
 * modules, Infra categories ...) never leak into the Secondary Sales list; a desk without its own list shows the shared one.
 */
async function categories(workspaceId = null) {
    const { catalog } = require('../lib/workspaces');
    const c = await catalog();
    if (!c.ready) {
        const { rows } = await pool.query(
            `SELECT c.value FROM samadhan.field_choices c JOIN samadhan.field_definitions d ON d.id = c."fieldId"
             WHERE d.key = 'category' AND c."parentId" IS NULL AND c.active ORDER BY c.position, c.id`,
        );
        return rows.map((r) => r.value);
    }
    const ws = workspaceId ? c.wsById.get(workspaceId) : c.wsByKey.get('SEC_SALES');
    const { rows } = await pool.query(
        `SELECT c.value, c."workspaceId" FROM samadhan.field_choices c JOIN samadhan.field_definitions d ON d.id = c."fieldId"
         WHERE d.key = 'category' AND c."parentId" IS NULL AND c.active ORDER BY c.position, c.id`,
    );
    const own = rows.filter((r) => ws && r.workspaceId === ws.id);
    if (ws && ws.key !== 'SEC_SALES' && own.length) return own.map((r) => r.value);
    return rows.filter((r) => r.workspaceId == null || (ws && r.workspaceId === ws.id)).map((r) => r.value);
}

/**
 * v7 Phase 5 (§N portal application picker): the applications a requester may pick - active, portal-visible, in a desk
 * that is available and open to the portal. Empty while service desks are off (the portal looks as before).
 */
async function portalApplications() {
    const { availableWorkspaceIds, catalog, workspacesEnabled } = require('../lib/workspaces');
    const c = await catalog();
    if (!c.ready || !(await workspacesEnabled())) return [];
    const available = await availableWorkspaceIds();
    return c.applications
        .filter((a) => a.active && a.portalVisible !== false && available.has(a.workspaceId) && c.wsById.get(a.workspaceId)?.portalEnabled)
        .map((a) => ({ id: a.id, code: a.code, name: a.name, vendor: a.vendor ?? null, workspaceId: a.workspaceId, workspaceKey: c.wsById.get(a.workspaceId)?.key ?? '', workspaceName: c.wsById.get(a.workspaceId)?.name ?? '' }));
}

router.get('/portal/config', wrap(async (req, res) => {
    await ready;
    if (!(await portalEnabled())) return res.json({ success: true, enabled: false });
    const { option } = require('../lib/config');
    res.json({
        success: true, enabled: true, categories: await categories(),
        // v7 Phase 5: application picker + each desk's categories (only when service desks are on and open to the portal).
        ...(await (async () => {
            const applications = await portalApplications();
            if (!applications.length) return {};
            const desks = [...new Set(applications.map((a) => a.workspaceId))];
            return { applications, categoriesByWorkspace: Object.fromEntries(await Promise.all(desks.map(async (w) => [w, await categories(w)]))) };
        })()),
        helpdeskName: await option('general.helpdeskName'), intro: await option('portal.intro'), supportEmail: await option('general.supportEmail'),
        // v7: requesters may add files after submitting (portal limits).
        files: require('../lib/storage').storageInfo().enabled ? { limits: (await require('../lib/attachments').limits()).portal } : null,
    });
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
    // v7 Phase 5: the application the requester picked (only from the portal's list); its desk decides the categories.
    let app = null;
    if (b.applicationId !== undefined && b.applicationId !== null && b.applicationId !== '') {
        app = (await portalApplications()).find((a) => a.id === Number(b.applicationId));
        if (!app) throw fail(400, 'Pick an application from the list.');
    }
    if (category && !(await categories(app?.workspaceId ?? null)).includes(category)) throw fail(400, 'Pick a category from the list.');

    const [perEmail, total] = await Promise.all([
        pool.query(
            `SELECT count(*)::int AS n FROM samadhan.tickets t JOIN samadhan.contacts c ON c.id = t."requesterId"
             WHERE c.email = $1 AND t.source = 'Portal' AND t."createdAt" >= now() - interval '1 day'`,
            [email],
        ),
        pool.query(`SELECT count(*)::int AS n FROM samadhan.tickets WHERE source = 'Portal' AND "createdAt" >= now() - interval '1 hour'`),
    ]);
    if (perEmail.rows[0].n >= 10) throw fail(429, 'You have raised 10 tickets today. Please reply on an existing ticket, or email the helpdesk.');
    if (total.rows[0].n >= 300) throw fail(429, 'The portal is very busy. Please try again shortly, or email the helpdesk.');

    // The distributor master fills in the distributor details, as on the agent screen.
    const fields = { category: category || undefined, distributorCode: distributorCode || undefined, mobileNo: phone || undefined };
    if (distributorCode) {
        const d = (await pool.query('SELECT * FROM samadhan.distributors WHERE upper(code) = upper($1) LIMIT 1', [distributorCode])).rows[0];
        if (d) Object.assign(fields, { distributorCode: d.code, distributorName: d.name, region: d.region ?? undefined, state: d.state ?? undefined, depot: d.depot ?? undefined, asmName: d.asmName ?? undefined, depotCoordinator: d.depotCoordinator ?? undefined });
    }
    const t = await createTicket({
        subject,
        description: textToHtml(description),
        requester: { email, name, phone: phone || null },
        source: 'Portal',
        fields,
        notifyRequester: true,
        ...(app ? { applicationId: app.id } : {}),
    });
    // v7: when attachments are on, a 30-minute token lets the requester add files to this one ticket (routes/attachments.js).
    const { portalUploadToken } = require('./attachments');
    const { storageInfo } = require('../lib/storage');
    const { limits } = require('../lib/attachments');
    const files = storageInfo().enabled ? { uploadToken: portalUploadToken(t.id), limits: (await limits()).portal } : null;
    res.status(201).json({ success: true, ticket: { id: t.id, ref: t.ref ?? String(t.id) }, ...(files ? { files } : {}) });
}));

/** Status of one ticket for the person who raised it: ticket number + their email must match. No conversation text. */
router.post('/portal/status', wrap(async (req, res) => {
    await ready;
    portalLimit(req, 'status');
    if (!(await portalEnabled())) throw fail(403, 'The support portal is closed.');
    // v7 Phase 3: the readable reference (MSFA-100123) works as well as the number.
    const id = require('../lib/workspaces').parseTicketNumber(req.body?.id);
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!Number.isInteger(id) || id < 1 || id > 2147483647 || !EMAIL_RE.test(email)) throw fail(400, 'Enter your ticket number and the email you used.');
    const { rows } = await pool.query(
        `SELECT t.id, t.subject, t."createdAt", t."lastActivityAt", t."resolvedAt", s.name AS status, s."isResolved", s."isClosed", t."applicationId"
         FROM samadhan.tickets t JOIN samadhan.contacts c ON c.id = t."requesterId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE t.id = $1 AND c.email = $2`,
        [id, email],
    );
    if (!rows.length) throw fail(404, 'No ticket found with that number and email.');
    const { applicationId, ...ticket } = rows[0];
    res.json({ success: true, ticket: { ...ticket, ref: await require('../lib/workspaces').refFor({ id: ticket.id, applicationId }) } });
}));

// Knowledge base on the portal: published articles only, so requesters can help themselves before raising a ticket.
router.get('/portal/articles', wrap(async (req, res) => {
    await ready;
    portalLimit(req, 'status');
    if (!(await portalEnabled())) return res.json({ success: true, items: [] });
    const term = String(req.query.q || '').trim().slice(0, 100);
    const params = term ? [`%${term}%`] : [];
    const { rows } = await pool.query(
        `SELECT id, category, folder, title, body, tags FROM samadhan.articles WHERE status = 'published'
         ${term ? 'AND (title ILIKE $1 OR body ILIKE $1 OR array_to_string(tags, \' \') ILIKE $1)' : ''}
         ORDER BY ${term ? 'views DESC' : 'category, folder, title'} LIMIT ${term ? 8 : 60}`,
        params,
    );
    res.json({ success: true, items: rows });
}));

// CSAT survey link from the closing email: the token alone identifies the ticket (no sign-in, no other details shown).
async function csatRequest(token) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token))) throw fail(404, 'This survey link is not valid.');
    const { rows } = await pool.query(
        `SELECT r."ticketId", r."answeredAt", t.subject, t."agentId", a.name AS "agentName"
         FROM samadhan.csat_requests r JOIN samadhan.tickets t ON t.id = r."ticketId" LEFT JOIN samadhan.agents a ON a.id = t."agentId" WHERE r.token = $1`,
        [token],
    );
    if (!rows.length) throw fail(404, 'This survey link is not valid or has expired.');
    return rows[0];
}

router.get('/portal/csat/:token', wrap(async (req, res) => {
    await ready;
    portalLimit(req, 'status');
    const r = await csatRequest(req.params.token);
    const { option } = require('../lib/config');
    res.json({
        success: true,
        survey: { ticketId: r.ticketId, subject: r.subject, agentName: r.agentName, answered: Boolean(r.answeredAt), question: await option('csat.question'), labels: await option('csat.labels') },
    });
}));

router.post('/portal/csat/:token', wrap(async (req, res) => {
    await ready;
    portalLimit(req, 'status');
    const r = await csatRequest(req.params.token);
    if (r.answeredAt) throw fail(409, 'Thank you - we already have your rating for this ticket.');
    const rating = Number(req.body?.rating);
    if (![1, 2, 3].includes(rating)) throw fail(400, 'Pick a rating.');
    const comment = String(req.body?.comment || '').trim().slice(0, 1000) || null;
    const done = await pool.query('UPDATE samadhan.csat_requests SET "answeredAt" = now() WHERE token = $1 AND "answeredAt" IS NULL RETURNING "ticketId"', [req.params.token]);
    if (!done.rows.length) throw fail(409, 'Thank you - we already have your rating for this ticket.');
    await pool.query('INSERT INTO samadhan.csat_responses ("ticketId", rating, comment, "agentId") VALUES ($1, $2, $3, $4)', [r.ticketId, rating, comment, r.agentId]);
    await pool.query('INSERT INTO samadhan.activities ("ticketId", action, details) VALUES ($1, $2, $3)', [r.ticketId, 'csat_received', JSON.stringify({ rating })]);
    // The ticket's agent (or the configured audience) hears about the rating.
    const { ring } = require('../lib/bell');
    const { loadTicket } = require('../lib/notify');
    const t = await loadTicket(r.ticketId);
    const labels = await require('../lib/config').option('csat.labels');
    await ring(t, 'csat', { title: `#${t.id} rated: ${labels?.[rating] ?? rating}`, body: comment ?? t.subject });
    res.json({ success: true });
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
            await processWhatsApp(m).catch((err) => console.error('[samadhan] whatsapp message skipped:', err.message));
        }
    } catch (err) {
        console.error('[samadhan] whatsapp webhook:', err.message);
    }
    // Always 200 once the signature is good: Meta retries anything else, which would only repeat the same failure.
    res.sendStatus(200);
});

module.exports = router;
