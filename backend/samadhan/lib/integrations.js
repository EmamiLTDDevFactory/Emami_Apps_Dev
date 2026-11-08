'use strict';
/*
   v7 Phase 9 (master prompt §Q): integrations - built, and all OFF by default.
     1. SAP Cloud ALM -> Samadhan: POST /integrations/calm/tickets with an API key (x-api-key or Bearer). Idempotent on
        the event-situation id; creates the ticket in the SAP desk (source "SAP Cloud ALM") and returns id / reference.
     2. Monitoring -> Samadhan: POST /integrations/monitoring/:sourceId/alerts with that source's token. De-duplicated by
        alert key: a repeat (or "resolved") adds a private note to the open ticket instead of a new ticket.
     3. Teams: an outbound incoming-webhook card for major incidents, new Urgent tickets and approvals needed.
     5. SolMan ITSM backlog: a one-off Excel import with a column mapper, dry-run and an error report.
   Keys and tokens are stored hashed (only a hint is shown); every inbound call is logged (Admin > Integrations).
*/
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { fail, logActivity, textToHtml, stripTags } = require('./util');

const missing = (e) => e.code === '42P01' || e.code === '42703';
const quiet = async (fn, fallback) => { try { return await fn(); } catch (e) { if (missing(e)) return fallback; throw e; } };
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
/** Constant-time check of a presented key against its stored SHA-256 (hex). */
const matches = (given, storedHash) => {
    if (!given || !storedHash) return false;
    const a = Buffer.from(hash(given), 'hex');
    const b = Buffer.from(String(storedHash), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// Failed key attempts (401) keep their own small budget in the log (newest 50), so a flood of bad keys cannot push
// the real calls out of it - see logCall.
const logAuthFailure = (integration, details) => logCall(integration, details);
const newSecret = (prefix) => `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
const hint = (s) => `${s.slice(0, 7)}…${s.slice(-4)}`;
const KEYS = ['calm', 'monitoring', 'teams', 'solman'];

async function getIntegration(key) {
    return quiet(async () => (await pool.query('SELECT * FROM samadhan.integrations WHERE key = $1', [key])).rows[0] ?? null, null);
}

async function logCall(integration, { source = null, ok, status, summary, externalId = null, ticketId = null }) {
    await quiet(async () => {
        await pool.query(`INSERT INTO samadhan.integration_calls (integration, source, ok, status, summary, "externalId", "ticketId") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [integration, source, ok, status, String(summary || '').slice(0, 500), externalId ? String(externalId).slice(0, 200) : null, ticketId]);
        // Keep the log small: the newest 500 calls per integration, of which refused keys (401) keep only their newest 50.
        await pool.query(`DELETE FROM samadhan.integration_calls WHERE integration = $1 AND status = 401 AND id NOT IN (SELECT id FROM samadhan.integration_calls WHERE integration = $1 AND status = 401 ORDER BY id DESC LIMIT 50)`, [integration]);
        await pool.query(`DELETE FROM samadhan.integration_calls WHERE integration = $1 AND id NOT IN (SELECT id FROM samadhan.integration_calls WHERE integration = $1 ORDER BY id DESC LIMIT 500)`, [integration]);
    }, null);
}

/** The API key from x-api-key or "Authorization: Bearer". */
const presented = (req) => String(req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || '').trim();

// ---------- 1. SAP Cloud ALM ----------
const PRIORITY_IN = { 'very high': 4, urgent: 4, critical: 4, high: 3, medium: 2, low: 1, 1: 4, 2: 3, 3: 2, 4: 1 };

async function calmTicket(req) {
    const integ = await getIntegration('calm');
    const key = presented(req);
    if (!integ?.enabled) throw fail(404, 'Not found.');
    if (!matches(key, integ.secretHash)) {
        await logAuthFailure('calm', { ok: false, status: 401, summary: 'Wrong or missing API key' });
        throw fail(401, 'Invalid API key.');
    }
    const b = req.body ?? {};
    const eventId = String(b.eventSituationId ?? b.situationId ?? b.id ?? '').trim();
    const title = String(b.title ?? b.subject ?? '').trim();
    if (!eventId || !title) {
        await logCall('calm', { ok: false, status: 400, summary: 'eventSituationId and title are required' });
        throw fail(400, 'eventSituationId and title are required.');
    }
    const prior = (await pool.query(`SELECT "ticketId" FROM samadhan.integration_events WHERE integration = 'calm' AND "externalId" = $1`, [eventId])).rows[0];
    const { loadTicket } = require('./notify');
    if (prior?.ticketId) {
        const t = await loadTicket(prior.ticketId).catch(() => null);
        if (t) {
            await logCall('calm', { ok: true, status: 200, summary: 'Repeat event - existing ticket returned', externalId: eventId, ticketId: t.id });
            return { created: false, ticketId: t.id, ref: t.displayRef.replace(/^#/, '') };
        }
    }
    const cfg = integ.config || {};
    const { catalog } = require('./workspaces');
    const c = await catalog();
    const app = c.byCode.get(String(cfg.applicationCode || 'SAP'));
    if (!app) throw fail(500, 'The Cloud ALM application mapping is not set (Admin > Integrations).');
    const { createTicket } = require('./tickets');
    const prio = PRIORITY_IN[String(b.priority ?? '').toLowerCase()] ?? undefined;
    const t = await createTicket({
        applicationId: app.id, allowAnyDesk: true, classificationSource: 'manual',
        subject: title.slice(0, 300),
        description: textToHtml([String(b.description ?? '').slice(0, 8000), b.serviceName ? `Service: ${b.serviceName}` : '', b.link ? `Cloud ALM: ${b.link}` : '', `Event situation: ${eventId}`].filter(Boolean).join('\n')),
        requester: { email: String(cfg.requesterEmail || 'sap.cloudalm@emamigroup.com'), name: 'SAP Cloud ALM' },
        source: 'SAP Cloud ALM',
        fields: { ...(prio ? { priority: prio } : {}), tags: ['cloud-alm'] },
        sap: { ...(b.system ? { sapSystem: String(b.system).slice(0, 10) } : {}), ...(b.environment ? { environment: b.environment } : {}), errorText: String(b.description ?? title).slice(0, 2000) },
    });
    await pool.query(`INSERT INTO samadhan.integration_events (integration, "externalId", "ticketId") VALUES ('calm', $1, $2) ON CONFLICT (integration, "externalId") DO UPDATE SET "ticketId" = EXCLUDED."ticketId"`, [eventId, t.id]);
    const full = await loadTicket(t.id);
    await logCall('calm', { ok: true, status: 201, summary: `Created ${full.displayRef}`, externalId: eventId, ticketId: t.id });
    return { created: true, ticketId: t.id, ref: full.displayRef.replace(/^#/, '') };
}

// ---------- 2. Monitoring webhook ----------
const SEVERITY_IN = { critical: 4, major: 4, high: 3, warning: 3, minor: 2, medium: 2, info: 1, low: 1 };

async function monitoringAlert(req) {
    const integ = await getIntegration('monitoring');
    if (!integ?.enabled) throw fail(404, 'Not found.');
    const src = (await pool.query('SELECT * FROM samadhan.integration_sources WHERE id = $1 AND enabled', [Number(req.params.sourceId)])).rows[0];
    const token = presented(req);
    if (!src || !matches(token, src.tokenHash)) {
        await logAuthFailure('monitoring', { source: src?.name ?? null, ok: false, status: 401, summary: 'Wrong or missing token' });
        throw fail(401, 'Invalid token.');
    }
    const b = req.body ?? {};
    const alertKey = String(b.alertKey ?? b.fingerprint ?? b.id ?? '').trim();
    const title = String(b.title ?? b.summary ?? b.alertname ?? '').trim();
    if (!alertKey || !title) {
        await logCall('monitoring', { source: src.name, ok: false, status: 400, summary: 'alertKey and title are required' });
        throw fail(400, 'alertKey and title are required.');
    }
    const resolved = /^(resolved|ok|cleared|closed)$/i.test(String(b.status ?? ''));
    const ext = `${src.id}:${alertKey}`;
    const prior = (await pool.query(
        `SELECT e."ticketId" FROM samadhan.integration_events e JOIN samadhan.tickets t ON t.id = e."ticketId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE e.integration = 'monitoring' AND e."externalId" = $1 AND NOT s."isResolved" AND t."deletedAt" IS NULL`, [ext])).rows[0];
    const { loadTicket } = require('./notify');
    if (prior) {
        const text = resolved ? `Monitoring: the alert cleared (${src.name}).` : `Monitoring: the alert fired again (${src.name}).`;
        const html = textToHtml(`${text}${b.description ? `\n${String(b.description).slice(0, 2000)}` : ''}`);
        await pool.query(`INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText") VALUES ($1, 'NOTE', $2, $3)`, [prior.ticketId, html, stripTags(html)]);
        await logActivity(prior.ticketId, 'monitoring_event', { source: src.name, status: resolved ? 'resolved' : 'firing' }, null);
        const t = await loadTicket(prior.ticketId);
        await logCall('monitoring', { source: src.name, ok: true, status: 200, summary: `${resolved ? 'Cleared' : 'Repeat'} on ${t.displayRef}`, externalId: alertKey, ticketId: t.id });
        return { created: false, ticketId: t.id, ref: t.displayRef.replace(/^#/, '') };
    }
    if (resolved) {
        await logCall('monitoring', { source: src.name, ok: true, status: 200, summary: 'Cleared alert without an open ticket - ignored', externalId: alertKey });
        return { created: false, ticketId: null, ref: null };
    }
    const { createTicket } = require('./tickets');
    const t = await createTicket({
        applicationId: src.applicationId, allowAnyDesk: true, classificationSource: 'manual',
        subject: `[Alert] ${title}`.slice(0, 300),
        description: textToHtml([String(b.description ?? '').slice(0, 8000), b.host ? `Host: ${b.host}` : '', `Source: ${src.name}`, `Alert key: ${alertKey}`].filter(Boolean).join('\n')),
        requester: { email: src.requesterEmail || 'monitoring@emamigroup.com', name: `${src.name} (monitoring)` },
        source: 'Monitoring alert',
        fields: { priority: SEVERITY_IN[String(b.severity ?? '').toLowerCase()] ?? src.defaultPriority ?? 2, tags: ['monitoring'] },
        ...(b.host ? { it: { serverName: String(b.host).slice(0, 200), environment: 'Production' } } : {}),
    });
    await pool.query(`INSERT INTO samadhan.integration_events (integration, "externalId", "ticketId") VALUES ('monitoring', $1, $2) ON CONFLICT (integration, "externalId") DO UPDATE SET "ticketId" = EXCLUDED."ticketId"`, [ext, t.id]);
    const full = await loadTicket(t.id);
    await logCall('monitoring', { source: src.name, ok: true, status: 201, summary: `Created ${full.displayRef}`, externalId: alertKey, ticketId: t.id });
    return { created: true, ticketId: t.id, ref: full.displayRef.replace(/^#/, '') };
}

// ---------- 3. Teams outbound ----------
/** Posts a simple card to the Teams incoming webhook (fire and forget; failures are logged, never thrown). */
async function teamsNotify(kind, ticket, text = '') {
    try {
        const integ = await getIntegration('teams');
        if (!integ?.enabled || !integ.config?.url) return false;
        const events = Array.isArray(integ.config.events) && integ.config.events.length ? integ.config.events : ['major', 'urgent', 'approval'];
        if (!events.includes(kind)) return false;
        const { APP_URL } = require('../../ccbTeams');
        const { ticketLink } = require('./util');
        const title = { major: 'Major incident', urgent: 'New urgent ticket', approval: 'Approval needed' }[kind] ?? 'Samadhan';
        const card = {
            '@type': 'MessageCard', '@context': 'https://schema.org/extensions', themeColor: kind === 'major' ? 'C50F1F' : kind === 'urgent' ? 'F7630C' : '6264A7',
            summary: `${title}: ${ticket.displayRef ?? `#${ticket.id}`}`,
            sections: [{ activityTitle: `${title}: ${ticket.displayRef ?? `#${ticket.id}`}`, activitySubtitle: String(ticket.subject || '').slice(0, 200), text: String(text || '').slice(0, 1000) }],
            potentialAction: [{ '@type': 'OpenUri', name: 'Open in Samadhan', targets: [{ os: 'default', uri: `${APP_URL}${ticketLink(ticket.id)}` }] }],
        };
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 5000);
        const r = await fetch(integ.config.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card), signal: ctl.signal }).finally(() => clearTimeout(timer));
        await logCall('teams', { ok: r.ok, status: r.status, summary: `${title} ${ticket.displayRef ?? ticket.id}`, ticketId: ticket.id });
        return r.ok;
    } catch (e) {
        await logCall('teams', { ok: false, status: 0, summary: `Teams post failed: ${e.message}`, ticketId: ticket?.id ?? null });
        return false;
    }
}

// ---------- 5. SolMan import ----------
const SOLMAN_TARGETS = ['externalId', 'subject', 'description', 'priority', 'status', 'createdAt', 'requesterName', 'requesterEmail', 'category', 'function', 'applicationCode'];
const STATUS_IN = { new: 'Open', open: 'Open', 'in process': 'In Progress', 'in progress': 'In Progress', 'customer action': 'Pending', 'proposed solution': 'Resolved', confirmed: 'Closed', closed: 'Closed', resolved: 'Resolved', withdrawn: 'Closed' };

/** rows: arrays (header first); mapping: { target: header text }. dryRun checks everything and creates nothing. */
async function solmanImport({ rows, mapping, dryRun = true }, agent) {
    if (!Array.isArray(rows) || rows.length < 2) throw fail(400, 'Upload the SolMan export with a header row and at least one ticket.');
    if (rows.length > 20001) throw fail(400, 'At most 20,000 tickets per import.');
    const head = rows[0].map((h) => String(h ?? '').trim());
    const col = Object.fromEntries(SOLMAN_TARGETS.map((t) => [t, mapping?.[t] ? head.indexOf(String(mapping[t])) : -1]));
    if (col.subject < 0 || col.externalId < 0) throw fail(400, 'Map at least the SolMan ticket id and the subject.');
    const { catalog } = require('./workspaces');
    const c = await catalog();
    const defaultApp = c.byCode.get('SAP');
    const statuses = (await pool.query('SELECT id, name FROM samadhan.ticket_statuses')).rows;
    const statusId = (name) => statuses.find((s) => s.name.toLowerCase() === String(name).toLowerCase())?.id ?? null;
    const done = new Set((await quiet(async () => (await pool.query(`SELECT "externalId" FROM samadhan.integration_events WHERE integration = 'solman'`)).rows, [])).map((r) => r.externalId));
    const out = { total: rows.length - 1, ok: 0, skipped: 0, errors: [], created: [] };
    const { createTicket, updateTicket } = require('./tickets');
    const v = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '');
    for (const [i, r] of rows.slice(1).entries()) {
        const line = i + 2;
        const ext = v(r, 'externalId');
        const subject = v(r, 'subject');
        if (!ext || !subject) { out.errors.push({ line, error: 'Ticket id and subject are required.' }); continue; }
        if (done.has(ext)) { out.skipped++; continue; }
        const app = v(r, 'applicationCode') ? c.byCode.get(v(r, 'applicationCode')) : defaultApp;
        if (!app) { out.errors.push({ line, error: `Unknown application ${v(r, 'applicationCode')}.` }); continue; }
        const created = v(r, 'createdAt') ? new Date(v(r, 'createdAt')) : null;
        if (created && Number.isNaN(created.getTime())) { out.errors.push({ line, error: `Created date "${v(r, 'createdAt')}" is not a date.` }); continue; }
        const email = v(r, 'requesterEmail').toLowerCase();
        if (email && !/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email)) { out.errors.push({ line, error: `Requester email "${email}" is not valid.` }); continue; }
        const st = v(r, 'status') ? statusId(STATUS_IN[v(r, 'status').toLowerCase()] ?? v(r, 'status')) : null;
        out.ok++;
        done.add(ext);
        if (dryRun) continue;
        const t = await createTicket({
            applicationId: app.id, allowAnyDesk: true, classificationSource: 'manual', subject: subject.slice(0, 300),
            description: textToHtml(`${v(r, 'description')}\n\nImported from SolMan ITSM: ${ext}`.trim()),
            requester: { email: email || 'solman.import@emamigroup.com', name: v(r, 'requesterName') || 'SolMan import' },
            source: 'SolMan import', createdAt: created ?? undefined,
            fields: { priority: PRIORITY_IN[v(r, 'priority').toLowerCase()] ?? undefined, category: v(r, 'category') || undefined, function: v(r, 'function') || undefined, tags: ['solman'] },
        });
        if (st && st !== t.statusId) await updateTicket(t.id, { statusId: st }, agent?.id ?? null, { skipAutomations: true }).catch((e) => out.errors.push({ line, error: `Created #${t.id}, status not set: ${e.message}` }));
        await pool.query(`INSERT INTO samadhan.integration_events (integration, "externalId", "ticketId") VALUES ('solman', $1, $2) ON CONFLICT DO NOTHING`, [ext, t.id]);
        out.created.push(t.id);
    }
    out.errors = out.errors.slice(0, 500);
    if (!dryRun) await logCall('solman', { ok: !out.errors.length, status: 200, summary: `Imported ${out.created.length}, skipped ${out.skipped}, errors ${out.errors.length}` });
    return { ...out, dryRun, created: out.created.length };
}

// ---------- Admin ----------
async function overview() {
    const rows = await quiet(async () => (await pool.query('SELECT * FROM samadhan.integrations ORDER BY key')).rows, []);
    const sources = await quiet(async () => (await pool.query(
        `SELECT s.id, s.name, s."tokenHint", s."applicationId", ap.code AS "applicationCode", s."defaultPriority", s.enabled, s."requesterEmail", s."createdAt"
         FROM samadhan.integration_sources s LEFT JOIN samadhan.applications ap ON ap.id = s."applicationId" ORDER BY s.id`)).rows, []);
    const calls = await quiet(async () => (await pool.query('SELECT * FROM samadhan.integration_calls ORDER BY id DESC LIMIT 50')).rows, []);
    return {
        integrations: KEYS.map((k) => {
            const r = rows.find((x) => x.key === k) ?? { key: k, enabled: false, config: {} };
            const { secretHash, ...rest } = r;
            return { ...rest, hasSecret: Boolean(secretHash), config: k === 'teams' && r.config?.url ? { ...r.config, url: undefined, urlHint: `${String(r.config.url).slice(0, 40)}…` } : r.config ?? {} };
        }),
        sources, calls,
        endpoints: { calm: '/api/samadhan/integrations/calm/tickets', monitoring: '/api/samadhan/integrations/monitoring/<sourceId>/alerts' },
    };
}

async function saveIntegration(key, b = {}) {
    if (!KEYS.includes(key)) throw fail(404, 'Unknown integration.');
    const cur = (await getIntegration(key)) ?? { config: {} };
    const config = { ...(cur.config || {}) };
    if (key === 'calm') {
        if (b.applicationCode !== undefined) config.applicationCode = String(b.applicationCode || 'SAP').toUpperCase();
        if (b.requesterEmail !== undefined) config.requesterEmail = String(b.requesterEmail || '').trim().toLowerCase() || undefined;
    }
    if (key === 'teams') {
        if (b.url !== undefined) {
            const u = String(b.url || '').trim();
            if (u && !/^https:\/\/[a-z0-9.-]+\.(webhook\.office\.com|office\.com|logic\.azure\.com|azure-api\.net|powerplatform\.com)\//i.test(u)) throw fail(400, 'Use the https Teams incoming-webhook (or Power Automate) URL.');
            config.url = u || undefined;
        }
        if (Array.isArray(b.events)) config.events = b.events.filter((e) => ['major', 'urgent', 'approval'].includes(e));
    }
    const enabled = b.enabled === undefined ? cur.enabled === true : b.enabled === true;
    if (enabled && key === 'teams' && !config.url) throw fail(400, 'Add the webhook URL before switching Teams on.');
    const r = await pool.query(
        `INSERT INTO samadhan.integrations (key, enabled, config) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config, "updatedAt" = now() RETURNING key, enabled, config`,
        [key, enabled, JSON.stringify(config)]);
    return r.rows[0];
}

/** A new API key for Cloud ALM - shown once; only its hash and a hint are kept. */
async function rotateKey(key) {
    if (key !== 'calm') throw fail(400, 'Only Cloud ALM uses an API key; monitoring uses one token per source.');
    const secret = newSecret('calm');
    await pool.query(`INSERT INTO samadhan.integrations (key, enabled, config, "secretHash", "secretHint", "rotatedAt") VALUES ($1, false, '{}', $2, $3, now())
                      ON CONFLICT (key) DO UPDATE SET "secretHash" = EXCLUDED."secretHash", "secretHint" = EXCLUDED."secretHint", "rotatedAt" = now()`, [key, hash(secret), hint(secret)]);
    return secret;
}

async function saveSource(b = {}) {
    const name = String(b.name || '').trim().slice(0, 80);
    const appId = Number(b.applicationId);
    if (!name || !Number.isInteger(appId)) throw fail(400, 'A source needs a name and an application (e.g. Network & Connectivity).');
    const prio = Number(b.defaultPriority ?? 2);
    if (![1, 2, 3, 4].includes(prio)) throw fail(400, 'Default priority 1-4.');
    if (b.id) {
        const r = await pool.query(`UPDATE samadhan.integration_sources SET name = $2, "applicationId" = $3, "defaultPriority" = $4, enabled = $5, "requesterEmail" = $6 WHERE id = $1 RETURNING id`,
            [Number(b.id), name, appId, prio, b.enabled !== false, String(b.requesterEmail || '').trim() || null]);
        if (!r.rows.length) throw fail(404, 'Source not found.');
        return { id: r.rows[0].id, token: null };
    }
    const token = newSecret('mon');
    const r = await pool.query(`INSERT INTO samadhan.integration_sources (name, "applicationId", "defaultPriority", enabled, "requesterEmail", "tokenHash", "tokenHint") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [name, appId, prio, b.enabled !== false, String(b.requesterEmail || '').trim() || null, hash(token), hint(token)]);
    return { id: r.rows[0].id, token };
}

async function rotateSource(id) {
    const token = newSecret('mon');
    const r = await pool.query('UPDATE samadhan.integration_sources SET "tokenHash" = $2, "tokenHint" = $3 WHERE id = $1 RETURNING id', [Number(id), hash(token), hint(token)]);
    if (!r.rows.length) throw fail(404, 'Source not found.');
    return token;
}

module.exports = { KEYS, SOLMAN_TARGETS, calmTicket, monitoringAlert, overview, rotateKey, rotateSource, saveIntegration, saveSource, solmanImport, teamsNotify };
