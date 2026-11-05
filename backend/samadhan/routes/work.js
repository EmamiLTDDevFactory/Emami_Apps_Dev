'use strict';
const express = require('express');
const { pool } = require('../../db');
const { EMAIL_RE, PHONE_RE } = require('../constants');
const { LIST_COLUMNS, LIST_FROM } = require('../lib/queries');
const { LIVE, ticketFilter } = require('../lib/ticketQuery');
const { audit, fail, intOrNull, wrap } = require('../lib/util');
const { isAdmin, requireSupervisor } = require('../middleware/auth');

const router = express.Router();

// ---------- Routes: to-dos, saved views, search, contacts & companies, Solutions (knowledge base) ----------

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const isSupervisorRole = (req) => ['Supervisor', 'Admin'].includes(req.agent.role);

// ---- To-dos: private to each agent, optionally tied to a ticket ----
router.get('/todos', wrap(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT td.*, t.subject AS "ticketSubject" FROM setu.todos td LEFT JOIN setu.tickets t ON t.id = td."ticketId"
         WHERE td."agentId" = $1 AND (NOT td.done OR td."createdAt" > now() - interval '7 days')
         ORDER BY td.done, td."dueAt" NULLS LAST, td.id DESC LIMIT 100`,
        [req.agent.id],
    );
    res.json({ success: true, items: rows });
}));

router.post('/todos', wrap(async (req, res) => {
    const b = req.body ?? {};
    const body = text(b.text, 500);
    if (!body) throw fail(400, 'Write the to-do first.');
    const ticketId = intOrNull(b.ticketId);
    if (Number.isNaN(ticketId)) throw fail(400, 'Invalid ticket.');
    const dueAt = b.dueAt ? new Date(b.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw fail(400, 'Invalid due date.');
    const { rows } = await pool.query(
        'INSERT INTO setu.todos ("agentId", "ticketId", text, "dueAt") VALUES ($1, $2, $3, $4) RETURNING *',
        [req.agent.id, ticketId, body, dueAt],
    );
    res.status(201).json({ success: true, todo: rows[0] });
}));

router.patch('/todos/:id', wrap(async (req, res) => {
    const b = req.body ?? {};
    const sets = [];
    const params = [Number(req.params.id), req.agent.id];
    if (b.done !== undefined) { params.push(b.done === true); sets.push(`done = $${params.length}`); }
    if (b.text !== undefined) { const v = text(b.text, 500); if (!v) throw fail(400, 'A to-do cannot be empty.'); params.push(v); sets.push(`text = $${params.length}`); }
    if (b.dueAt !== undefined) { params.push(b.dueAt ? new Date(b.dueAt) : null); sets.push(`"dueAt" = $${params.length}`); }
    if (!sets.length) throw fail(400, 'Nothing to change.');
    const { rowCount } = await pool.query(`UPDATE setu.todos SET ${sets.join(', ')} WHERE id = $1 AND "agentId" = $2`, params);
    if (!rowCount) throw fail(404, 'To-do not found.');
    res.json({ success: true });
}));

router.delete('/todos/:id', wrap(async (req, res) => {
    await pool.query('DELETE FROM setu.todos WHERE id = $1 AND "agentId" = $2', [Number(req.params.id), req.agent.id]);
    res.json({ success: true });
}));

// ---- Saved views: a name plus the list filters; private, or shared with every agent (Supervisor / Admin) ----
const VIEW_KEYS = ['view', 'statusId', 'priority', 'severity', 'groupId', 'agentId', 'source', 'type', 'category', 'region', 'state', 'depot', 'salesOrg',
    'l2Agent', 'asmName', 'activity', 'tag', 'created', 'from', 'to', 'resDue', 'frDue', 'due', 'q', 'sort'];

router.get('/views', wrap(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT v.id, v.name, v.shared, v.query, v."ownerAgentId", a.name AS "ownerName" FROM setu.saved_views v JOIN setu.agents a ON a.id = v."ownerAgentId"
         WHERE v."ownerAgentId" = $1 OR v.shared ORDER BY v.shared, lower(v.name) LIMIT 30`,
        [req.agent.id],
    );
    res.json({ success: true, views: rows });
}));

router.post('/views', wrap(async (req, res) => {
    const b = req.body ?? {};
    const name = text(b.name, 80);
    if (!name) throw fail(400, 'Give the view a name.');
    const shared = b.shared === true;
    if (shared && !isSupervisorRole(req)) throw fail(403, 'Only supervisors and admins can share a view with everyone.');
    const query = Object.fromEntries(VIEW_KEYS.filter((k) => b.query?.[k] !== undefined && b.query[k] !== '').map((k) => [k, text(b.query[k], 2000)]));
    ticketFilter(query, req.agent.id); // refuses unknown views / bad dates before saving
    const mine = await pool.query('SELECT count(*)::int AS n FROM setu.saved_views WHERE "ownerAgentId" = $1', [req.agent.id]);
    if (mine.rows[0].n >= 25) throw fail(400, 'You have 25 saved views - delete one first.');
    const { rows } = await pool.query(
        'INSERT INTO setu.saved_views ("ownerAgentId", name, shared, query) VALUES ($1, $2, $3, $4) RETURNING id',
        [req.agent.id, name, shared, JSON.stringify(query)],
    );
    res.status(201).json({ success: true, id: rows[0].id });
}));

router.delete('/views/:id', wrap(async (req, res) => {
    const { rowCount } = await pool.query(
        'DELETE FROM setu.saved_views WHERE id = $1 AND ("ownerAgentId" = $2 OR $3)',
        [Number(req.params.id), req.agent.id, isAdmin(req)],
    );
    if (!rowCount) throw fail(404, 'View not found, or it is not yours to delete.');
    res.json({ success: true });
}));

// ---- Variants: named screen layouts (the daily report: date range, columns, filters), private or shared ----
const VARIANT_KINDS = ['report'];

router.get('/variants', wrap(async (req, res) => {
    const kind = String(req.query.kind || '');
    if (!VARIANT_KINDS.includes(kind)) throw fail(400, 'Unknown variant kind.');
    const { rows } = await pool.query(
        `SELECT v.id, v.kind, v.name, v.shared, v.config, v."ownerAgentId", a.name AS "ownerName", v."updatedAt"
         FROM setu.variants v JOIN setu.agents a ON a.id = v."ownerAgentId"
         WHERE v.kind = $1 AND (v."ownerAgentId" = $2 OR v.shared) ORDER BY v.shared, lower(v.name)`,
        [kind, req.agent.id],
    );
    res.json({ success: true, variants: rows });
}));

router.post('/variants', wrap(async (req, res) => {
    const b = req.body ?? {};
    if (!VARIANT_KINDS.includes(b.kind)) throw fail(400, 'Unknown variant kind.');
    const name = text(b.name, 80);
    if (!name) throw fail(400, 'Give the variant a name.');
    const shared = b.shared === true;
    if (shared && !isSupervisorRole(req)) throw fail(403, 'Only supervisors and admins can share a variant with everyone.');
    const config = b.config && typeof b.config === 'object' ? b.config : {};
    const json = JSON.stringify(config);
    if (json.length > 50_000) throw fail(400, 'That variant is too large.');
    const id = intOrNull(b.id);
    if (id) {
        const { rows } = await pool.query(
            `UPDATE setu.variants SET name = $3, shared = $4, config = $5, "updatedAt" = now() WHERE id = $1 AND ("ownerAgentId" = $2 OR $6) RETURNING id`,
            [id, req.agent.id, name, shared, json, isAdmin(req)],
        );
        if (!rows.length) throw fail(404, 'Variant not found, or it is not yours to change.');
        return res.json({ success: true, id });
    }
    const mine = await pool.query('SELECT count(*)::int AS n FROM setu.variants WHERE "ownerAgentId" = $1 AND kind = $2', [req.agent.id, b.kind]);
    if (mine.rows[0].n >= 30) throw fail(400, 'You have 30 variants here - delete one first.');
    const { rows } = await pool.query(
        'INSERT INTO setu.variants (kind, "ownerAgentId", name, shared, config) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [b.kind, req.agent.id, name, shared, json],
    );
    res.status(201).json({ success: true, id: rows[0].id });
}));

router.delete('/variants/:id', wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM setu.variants WHERE id = $1 AND ("ownerAgentId" = $2 OR $3)', [Number(req.params.id), req.agent.id, isAdmin(req)]);
    if (!rowCount) throw fail(404, 'Variant not found, or it is not yours to delete.');
    res.json({ success: true });
}));

// ---- Global search (header): tickets, contacts and knowledge-base articles ----
router.get('/search', wrap(async (req, res) => {
    const term = text(req.query.q, 100).replace(/^#/, '');
    if (term.length < 2 && !/^\d+$/.test(term)) return res.json({ success: true, tickets: [], contacts: [], articles: [] });
    const like = `%${term}%`;
    const f = ticketFilter({ q: term, sort: 'updated' }, req.agent.id);
    const [tickets, contacts, articles] = await Promise.all([
        pool.query(`SELECT ${LIST_COLUMNS} ${LIST_FROM} ${f.where} ORDER BY ${f.order} LIMIT 8`, f.params),
        pool.query(
            `SELECT id, name, email, mobile FROM setu.contacts WHERE "anonymizedAt" IS NULL AND (name ILIKE $1 OR email ILIKE $1 OR mobile ILIKE $1 OR phone ILIKE $1)
             ORDER BY name LIMIT 6`,
            [like],
        ),
        pool.query(
            `SELECT id, title, category, status FROM setu.articles WHERE (status = 'published' OR $2) AND (title ILIKE $1 OR array_to_string(tags, ' ') ILIKE $1)
             ORDER BY views DESC LIMIT 5`,
            [like, isSupervisorRole(req)],
        ),
    ]);
    res.json({ success: true, tickets: tickets.rows, contacts: contacts.rows, articles: articles.rows });
}));

// ---- Contacts & companies ----
router.get('/contacts', wrap(async (req, res) => {
    const term = text(req.query.q, 100);
    const page = Math.max(1, Number(req.query.page) || 1);
    const params = [];
    const where = ['c."anonymizedAt" IS NULL'];
    if (term) { params.push(`%${term}%`); where.push(`(c.name ILIKE $1 OR c.email ILIKE $1 OR c.mobile ILIKE $1 OR c.phone ILIKE $1)`); }
    if (req.query.companyId) { params.push(Number(req.query.companyId) || 0); where.push(`c."companyId" = $${params.length}`); }
    const w = `WHERE ${where.join(' AND ')}`;
    const [items, total] = await Promise.all([
        pool.query(
            `SELECT c.id, c.name, c.email, c.phone, c.mobile, c."companyId", co.name AS "companyName", c."createdAt",
                    count(t.id)::int AS tickets, count(t.id) FILTER (WHERE NOT s."isResolved")::int AS open, max(t."createdAt") AS "lastTicketAt"
             FROM setu.contacts c LEFT JOIN setu.companies co ON co.id = c."companyId"
             LEFT JOIN setu.tickets t ON t."requesterId" = c.id AND ${LIVE}
             LEFT JOIN setu.ticket_statuses s ON s.id = t."statusId"
             ${w} GROUP BY c.id, co.name ORDER BY max(t."createdAt") DESC NULLS LAST, c.name LIMIT 50 OFFSET ${(page - 1) * 50}`,
            params,
        ),
        pool.query(`SELECT count(*)::int AS n FROM setu.contacts c ${w}`, params),
    ]);
    res.json({ success: true, items: items.rows, total: total.rows[0].n, page });
}));

router.get('/contacts/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const contact = (await pool.query(
        `SELECT c.*, co.name AS "companyName" FROM setu.contacts c LEFT JOIN setu.companies co ON co.id = c."companyId" WHERE c.id = $1 AND c."anonymizedAt" IS NULL`,
        [id],
    )).rows[0];
    if (!contact) throw fail(404, 'Contact not found.');
    const [tickets, calls, stats] = await Promise.all([
        pool.query(`SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE t."requesterId" = $1 AND ${LIVE} ORDER BY t."createdAt" DESC LIMIT 50`, [id]),
        pool.query(
            `SELECT cl.*, a.name AS "agentName", t.subject AS "ticketSubject" FROM setu.call_logs cl JOIN setu.tickets t ON t.id = cl."ticketId"
             JOIN setu.agents a ON a.id = cl."agentId" WHERE t."requesterId" = $1 ORDER BY cl."createdAt" DESC LIMIT 20`,
            [id],
        ),
        pool.query(
            `SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT s."isResolved")::int AS open,
                    (SELECT round(avg(r.rating), 2) FROM setu.csat_responses r JOIN setu.tickets x ON x.id = r."ticketId" WHERE x."requesterId" = $1) AS "csatAvg"
             FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId" WHERE t."requesterId" = $1 AND ${LIVE}`,
            [id],
        ),
    ]);
    res.json({ success: true, contact, tickets: tickets.rows, calls: calls.rows, stats: stats.rows[0] });
}));

router.patch('/contacts/:id', wrap(async (req, res) => {
    const b = req.body ?? {};
    const sets = [];
    const params = [Number(req.params.id)];
    const add = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`); };
    if (b.name !== undefined) { const v = text(b.name, 200); if (!v) throw fail(400, 'Name cannot be empty.'); add('name', v); }
    for (const k of ['phone', 'mobile']) {
        if (b[k] === undefined) continue;
        const v = text(b[k], 30);
        if (v && !PHONE_RE.test(v)) throw fail(400, `Enter a valid ${k} number.`);
        add(k, v || null);
    }
    if (b.email !== undefined) {
        const v = text(b.email, 200).toLowerCase();
        if (v && !EMAIL_RE.test(v)) throw fail(400, 'Email is not valid.');
        add('email', v || null);
    }
    if (b.companyId !== undefined) { const n = intOrNull(b.companyId); if (Number.isNaN(n)) throw fail(400, 'Invalid company.'); add('"companyId"', n); }
    if (!sets.length) throw fail(400, 'Nothing to change.');
    try {
        const { rowCount } = await pool.query(`UPDATE setu.contacts SET ${sets.join(', ')} WHERE id = $1 AND "anonymizedAt" IS NULL`, params);
        if (!rowCount) throw fail(404, 'Contact not found.');
    } catch (e) {
        if (e.code === '23505') throw fail(409, 'Another contact already has that email.');
        throw e;
    }
    // Keep a ticket's company in step with its requester's for open tickets.
    if (b.companyId !== undefined) {
        await pool.query(
            `UPDATE setu.tickets t SET "companyId" = $2 FROM setu.ticket_statuses s WHERE s.id = t."statusId" AND t."requesterId" = $1 AND NOT s."isResolved"`,
            [params[0], intOrNull(b.companyId)],
        );
    }
    await audit(req.verifiedEmail, 'contact_updated', { id: params[0], fields: Object.keys(b) });
    res.json({ success: true });
}));

router.get('/companies', wrap(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT co.id, co.name, co.description, co.domains,
                (SELECT count(*)::int FROM setu.contacts c WHERE c."companyId" = co.id AND c."anonymizedAt" IS NULL) AS contacts,
                (SELECT count(*)::int FROM setu.tickets t JOIN setu.ticket_statuses s ON s.id = t."statusId" WHERE t."companyId" = co.id AND NOT s."isResolved" AND ${LIVE}) AS open,
                (SELECT count(*)::int FROM setu.tickets t WHERE t."companyId" = co.id AND ${LIVE}) AS tickets
         FROM setu.companies co ORDER BY co.name`,
    );
    res.json({ success: true, items: rows });
}));

router.post('/companies', wrap(async (req, res) => {
    requireSupervisor(req);
    const b = req.body ?? {};
    const name = text(b.name, 200);
    if (!name) throw fail(400, 'Company name is needed.');
    const domains = (Array.isArray(b.domains) ? b.domains : String(b.domains || '').split(/[,;\s]+/))
        .map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 20);
    const id = intOrNull(b.id);
    try {
        if (id) {
            const { rowCount } = await pool.query('UPDATE setu.companies SET name = $2, description = $3, domains = $4 WHERE id = $1', [id, name, text(b.description, 2000) || null, domains]);
            if (!rowCount) throw fail(404, 'Company not found.');
        } else {
            await pool.query('INSERT INTO setu.companies (name, description, domains) VALUES ($1, $2, $3)', [name, text(b.description, 2000) || null, domains]);
        }
    } catch (e) {
        if (e.code === '23505') throw fail(409, 'A company with that name already exists.');
        throw e;
    }
    await audit(req.verifiedEmail, 'company_saved', { id, name });
    res.json({ success: true });
}));

// ---- Solutions (knowledge base). Everyone reads published articles; supervisors and admins write. ----
router.get('/articles', wrap(async (req, res) => {
    const term = text(req.query.q, 100);
    const params = [isSupervisorRole(req)];
    const where = [`(a.status = 'published' OR $1)`];
    if (term) { params.push(`%${term}%`); where.push(`(a.title ILIKE $${params.length} OR a.body ILIKE $${params.length} OR array_to_string(a.tags, ' ') ILIKE $${params.length})`); }
    if (req.query.category) { params.push(text(req.query.category, 100)); where.push(`a.category = $${params.length}`); }
    const { rows } = await pool.query(
        `SELECT a.id, a.category, a.folder, a.title, left(a.body, 240) AS excerpt, a.status, a.tags, a.views, a.helpful, a."notHelpful", a."updatedAt", ag.name AS "authorName"
         FROM setu.articles a LEFT JOIN setu.agents ag ON ag.id = a."authorAgentId" WHERE ${where.join(' AND ')}
         ORDER BY a.category, a.folder, a.title LIMIT 300`,
        params,
    );
    res.json({ success: true, items: rows });
}));

router.get('/articles/:id', wrap(async (req, res) => {
    const { rows } = await pool.query(
        `UPDATE setu.articles a SET views = views + 1 WHERE a.id = $1 AND (a.status = 'published' OR $2)
         RETURNING a.*, (SELECT name FROM setu.agents WHERE id = a."authorAgentId") AS "authorName"`,
        [Number(req.params.id), isSupervisorRole(req)],
    );
    if (!rows.length) throw fail(404, 'Article not found.');
    res.json({ success: true, article: rows[0] });
}));

router.post('/articles', wrap(async (req, res) => {
    requireSupervisor(req);
    const b = req.body ?? {};
    const title = text(b.title, 300);
    const body = String(b.body ?? '').trim().slice(0, 50000);
    if (!title || !body) throw fail(400, 'An article needs a title and some text.');
    const status = b.status === 'published' ? 'published' : 'draft';
    const tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(','))
        .map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 15);
    const vals = [text(b.category, 100) || 'General', text(b.folder, 100) || 'General', title, body, status, tags, req.agent.id];
    const id = intOrNull(b.id);
    try {
        if (id) {
            const { rowCount } = await pool.query(
                `UPDATE setu.articles SET category = $1, folder = $2, title = $3, body = $4, status = $5, tags = $6, "authorAgentId" = $7, "updatedAt" = now() WHERE id = $8`,
                [...vals, id],
            );
            if (!rowCount) throw fail(404, 'Article not found.');
        } else {
            await pool.query('INSERT INTO setu.articles (category, folder, title, body, status, tags, "authorAgentId") VALUES ($1, $2, $3, $4, $5, $6, $7)', vals);
        }
    } catch (e) {
        if (e.code === '23505') throw fail(409, 'An article with that title already exists.');
        throw e;
    }
    await audit(req.verifiedEmail, 'article_saved', { id, title, status });
    res.json({ success: true });
}));

router.delete('/articles/:id', wrap(async (req, res) => {
    requireSupervisor(req);
    await pool.query('DELETE FROM setu.articles WHERE id = $1', [Number(req.params.id)]);
    await audit(req.verifiedEmail, 'article_deleted', { id: Number(req.params.id) });
    res.json({ success: true });
}));

router.post('/articles/:id/feedback', wrap(async (req, res) => {
    const col = req.body?.helpful === true ? 'helpful' : '"notHelpful"';
    await pool.query(`UPDATE setu.articles SET ${col} = ${col} + 1 WHERE id = $1 AND status = 'published'`, [Number(req.params.id)]);
    res.json({ success: true });
}));

module.exports = router;
