'use strict';
/*
   Configuration management / CMDB (migration 7.12-cmdb). ITIL activities covered:
     - identification: every CI has a unique code (asset tag / CI id), a class and an owner;
     - control: changes go through here and are written to ci_history (who, what, from -> to);
     - status accounting: lifecycle Planned -> In stock -> In use -> In repair -> Retired -> Disposed;
     - verification and audit: "Verified" stamps the date and person; CIs not verified for 180 days are listed;
     - relationships: depends on / runs on / connected to ... so the impact of a failure is visible;
     - incidents per CI: tickets link the CIs they affect; 3+ tickets on one CI in 30 days flags a likely problem.
   Tolerates a database before migration 7.12 (missing table = feature off).
*/
const { pool } = require('../db/pool');
const { EMAIL_RE } = require('../constants');
const { fail } = require('./util');
const seed = require('./cmdbSeed');

const missing = (e) => e.code === '42P01' || e.code === '42703';
const quiet = async (fn, fallback) => { try { return await fn(); } catch (e) { if (missing(e)) return fallback; throw e; } };
const text = (v, max) => { const s = String(v ?? '').trim().slice(0, max); return s || null; };
const date = (v, label) => {
    if (v === undefined || v === null || v === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) throw fail(400, `${label}: a date (YYYY-MM-DD).`);
    return String(v);
};
const pick = (list, v, label) => {
    if (v === undefined || v === null || v === '') return undefined;
    const hit = list.find((x) => x.toLowerCase() === String(v).trim().toLowerCase());
    if (!hit) throw fail(400, `${label}: one of ${list.join(', ')}.`);
    return hit;
};
const VERIFY_DAYS = 180;

const SELECT = `SELECT c.id, c.code, c.name, c."ciClass", c.status, c.criticality, c.environment, c."siteLocation", c.department, c."assignedName", c."assignedEmail",
    c."ownerGroupId", g.name AS "ownerGroupName", c."supportPartnerId", sp.name AS "supportPartnerName", c."hostingPartnerId", hp.name AS "hostingPartnerName",
    c."applicationId", ap.code AS "applicationCode", c.manufacturer, c.model, c."serialNo", c."ipAddress", c.version,
    to_char(c."purchaseDate", 'YYYY-MM-DD') AS "purchaseDate", to_char(c."warrantyEnd", 'YYYY-MM-DD') AS "warrantyEnd", c.notes,
    c."lastVerifiedAt", c."lastVerifiedBy", c."createdAt", c."updatedAt"
  FROM samadhan.config_items c
  LEFT JOIN samadhan.groups g ON g.id = c."ownerGroupId"
  LEFT JOIN samadhan.support_partners sp ON sp.id = c."supportPartnerId"
  LEFT JOIN samadhan.support_partners hp ON hp.id = c."hostingPartnerId"
  LEFT JOIN samadhan.applications ap ON ap.id = c."applicationId"`;

/** List with filters: q (code, name, user, serial, IP), ciClass, status, site, flag (unverified | warranty | repeat). */
async function list(f = {}) {
    const where = ['TRUE'];
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    if (f.q) {
        const like = p(`%${String(f.q).trim().slice(0, 100)}%`);
        where.push(`(c.code ILIKE ${like} OR c.name ILIKE ${like} OR c."assignedName" ILIKE ${like} OR c."assignedEmail" ILIKE ${like} OR c."serialNo" ILIKE ${like} OR c."ipAddress" ILIKE ${like} OR c.model ILIKE ${like})`);
    }
    if (f.ciClass) where.push(`c."ciClass" = ${p(String(f.ciClass))}`);
    if (f.status) where.push(`c.status = ${p(String(f.status))}`);
    if (f.site) where.push(`c."siteLocation" ILIKE ${p(`%${String(f.site).slice(0, 100)}%`)}`);
    if (f.flag === 'unverified') where.push(`c.status NOT IN ('Disposed', 'Retired') AND (c."lastVerifiedAt" IS NULL OR c."lastVerifiedAt" < now() - interval '${VERIFY_DAYS} days')`);
    if (f.flag === 'warranty') where.push(`c."warrantyEnd" IS NOT NULL AND c."warrantyEnd" < (now() + interval '60 days')::date AND c.status NOT IN ('Disposed', 'Retired')`);
    if (f.flag === 'repeat') where.push(`(SELECT count(*) FROM samadhan.ticket_cis tc JOIN samadhan.tickets t ON t.id = tc."ticketId" WHERE tc."ciId" = c.id AND t."createdAt" > now() - interval '30 days') >= 3`);
    const limit = Math.min(Math.max(Number(f.limit) || 200, 1), 2000);
    return quiet(async () => {
        const rows = (await pool.query(`${SELECT.replace('FROM samadhan.config_items c', `, (SELECT count(*)::int FROM samadhan.ticket_cis tc JOIN samadhan.tickets t ON t.id = tc."ticketId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE tc."ciId" = c.id AND NOT s."isResolved") AS "openTickets",
            (SELECT count(*)::int FROM samadhan.ticket_cis tc JOIN samadhan.tickets t ON t.id = tc."ticketId" WHERE tc."ciId" = c.id AND t."createdAt" > now() - interval '30 days') AS "tickets30d"
          FROM samadhan.config_items c`)} WHERE ${where.join(' AND ')} ORDER BY c."ciClass", c.code LIMIT ${limit}`, params)).rows;
        const summary = (await pool.query(`SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'In use')::int AS "inUse",
                count(*) FILTER (WHERE status = 'In repair')::int AS "inRepair",
                count(*) FILTER (WHERE status NOT IN ('Disposed', 'Retired') AND ("lastVerifiedAt" IS NULL OR "lastVerifiedAt" < now() - interval '${VERIFY_DAYS} days'))::int AS unverified,
                count(*) FILTER (WHERE "warrantyEnd" IS NOT NULL AND "warrantyEnd" < (now() + interval '60 days')::date AND status NOT IN ('Disposed', 'Retired'))::int AS "warrantyEnding"
             FROM samadhan.config_items`)).rows[0];
        summary.repeat = Number((await pool.query(`SELECT count(*) AS n FROM (SELECT tc."ciId" FROM samadhan.ticket_cis tc JOIN samadhan.tickets t ON t.id = tc."ticketId"
             WHERE t."createdAt" > now() - interval '30 days' GROUP BY 1 HAVING count(*) >= 3) x`)).rows[0].n);
        return { items: rows, summary, ready: true };
    }, { items: [], summary: null, ready: false });
}

async function get(id) {
    const ci = (await pool.query(`${SELECT} WHERE c.id = $1`, [Number(id)])).rows[0];
    if (!ci) throw fail(404, 'Configuration item not found.');
    const [relations, history, tickets] = await Promise.all([
        pool.query(`SELECT r.id, r.kind, r."fromId", r."toId", 'out' AS dir, c.id AS "ciId", c.code, c.name, c."ciClass", c.status FROM samadhan.ci_relations r JOIN samadhan.config_items c ON c.id = r."toId" WHERE r."fromId" = $1
                    UNION ALL
                    SELECT r.id, r.kind, r."fromId", r."toId", 'in' AS dir, c.id, c.code, c.name, c."ciClass", c.status FROM samadhan.ci_relations r JOIN samadhan.config_items c ON c.id = r."fromId" WHERE r."toId" = $1 ORDER BY 2, 7`, [ci.id]),
        pool.query(`SELECT h.id, h.action, h.details, h."createdAt", a.name AS "byName" FROM samadhan.ci_history h LEFT JOIN samadhan.agents a ON a.id = h."byAgentId" WHERE h."ciId" = $1 ORDER BY h.id DESC LIMIT 100`, [ci.id]),
        pool.query(`SELECT t.id, t.subject, t."createdAt", t."recordClass", s.name AS "statusName", s."isResolved", ap.code AS "applicationCode"
                    FROM samadhan.ticket_cis tc JOIN samadhan.tickets t ON t.id = tc."ticketId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
                    LEFT JOIN samadhan.applications ap ON ap.id = t."applicationId" WHERE tc."ciId" = $1 AND t."deletedAt" IS NULL ORDER BY t.id DESC LIMIT 50`, [ci.id]),
    ]);
    return { ci, relations: relations.rows, history: history.rows, tickets: tickets.rows };
}

const FIELDS = ['code', 'name', 'ciClass', 'status', 'criticality', 'environment', 'siteLocation', 'department', 'assignedName', 'assignedEmail', 'ownerGroupId',
    'supportPartnerId', 'hostingPartnerId', 'applicationId', 'manufacturer', 'model', 'serialNo', 'ipAddress', 'version', 'purchaseDate', 'warrantyEnd', 'notes'];

/** Cleans a CI body (only the keys sent). Throws 400 with a readable message. */
async function clean(b, isNew) {
    const out = {};
    const t = (k, max) => { if (b[k] !== undefined) out[k] = text(b[k], max); };
    t('code', 80); t('name', 300); t('environment', 60); t('siteLocation', 120); t('department', 120); t('assignedName', 120);
    t('manufacturer', 80); t('model', 120); t('serialNo', 120); t('ipAddress', 120); t('version', 60); t('notes', 2000);
    if (isNew && (!out.code || !out.name)) throw fail(400, 'A configuration item needs a code (asset tag / CI id) and a name.');
    if (out.code === null || out.name === null) throw fail(400, 'Code and name cannot be empty.');
    if (out.code && !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(out.code)) throw fail(400, 'Code: letters, digits, dot, dash, slash and underscore only (e.g. IND-KOL-L-0042).');
    for (const [k, list, label] of [['ciClass', seed.CI_CLASSES, 'Class'], ['status', seed.CI_STATUSES, 'Status'], ['criticality', seed.CI_CRITICALITY, 'Criticality']]) {
        const v = pick(list, b[k], label);
        if (v !== undefined) out[k] = v;
    }
    if (b.assignedEmail !== undefined) {
        const e = text(b.assignedEmail, 200)?.toLowerCase() ?? null;
        if (e && !EMAIL_RE.test(e)) throw fail(400, 'User email is not valid.');
        out.assignedEmail = e;
    }
    for (const [k, label] of [['purchaseDate', 'Purchase date'], ['warrantyEnd', 'Warranty end']]) if (b[k] !== undefined) out[k] = date(b[k], label);
    const ref = async (k, sql, label) => {
        if (b[k] === undefined) return;
        const v = b[k] === null || b[k] === '' ? null : Number(b[k]);
        if (v !== null && !(await pool.query(sql, [v])).rows.length) throw fail(400, `${label}: pick one from the list.`);
        out[k] = v;
    };
    await ref('ownerGroupId', 'SELECT 1 FROM samadhan.groups WHERE id = $1', 'Owner group');
    await ref('supportPartnerId', `SELECT 1 FROM samadhan.support_partners WHERE id = $1 AND kind = 'ITSM_VENDOR'`, 'Support vendor');
    await ref('hostingPartnerId', `SELECT 1 FROM samadhan.support_partners WHERE id = $1 AND kind = 'HYPERSCALER'`, 'Hosting');
    await ref('applicationId', 'SELECT 1 FROM samadhan.applications WHERE id = $1', 'Application');
    return out;
}

const history = (ciId, action, details, agentId) => pool.query('INSERT INTO samadhan.ci_history ("ciId", action, details, "byAgentId") VALUES ($1, $2, $3, $4)', [ciId, action, JSON.stringify(details), agentId ?? null]);

/** Adds (no id) or changes a CI; every changed field goes into the history (from -> to). */
async function save(b = {}, agent = null) {
    const id = b.id ? Number(b.id) : null;
    const data = await clean(b, !id);
    const keys = Object.keys(data).filter((k) => FIELDS.includes(k));
    if (data.code) {
        const clash = await pool.query('SELECT id FROM samadhan.config_items WHERE lower(code) = lower($1) AND id <> $2', [data.code, id ?? 0]);
        if (clash.rows.length) throw fail(400, `${data.code} is already in the CMDB.`);
    }
    if (!id) {
        const r = await pool.query(`INSERT INTO samadhan.config_items (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, keys.map((k) => data[k]));
        await history(r.rows[0].id, 'created', { code: data.code, status: data.status ?? 'In use' }, agent?.id);
        return r.rows[0].id;
    }
    const before = (await pool.query('SELECT * FROM samadhan.config_items WHERE id = $1', [id])).rows[0];
    if (!before) throw fail(404, 'Configuration item not found.');
    const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null);
    const changed = keys.filter((k) => JSON.stringify(norm(before[k])) !== JSON.stringify(norm(data[k])));
    if (!changed.length) return id;
    await pool.query(`UPDATE samadhan.config_items SET ${changed.map((k, i) => `"${k}" = $${i + 2}`).join(', ')}, "updatedAt" = now() WHERE id = $1`, [id, ...changed.map((k) => data[k])]);
    await history(id, changed.includes('status') ? 'status_changed' : 'updated', Object.fromEntries(changed.map((k) => [k, { from: norm(before[k]), to: data[k] }])), agent?.id);
    return id;
}

/** Verification and audit: the CI was checked physically / against discovery today. */
async function verify(id, agent) {
    const r = await pool.query('UPDATE samadhan.config_items SET "lastVerifiedAt" = now(), "lastVerifiedBy" = $2 WHERE id = $1 RETURNING id', [Number(id), agent?.name ?? null]);
    if (!r.rows.length) throw fail(404, 'Configuration item not found.');
    await history(Number(id), 'verified', {}, agent?.id);
}

async function relate(id, { toId, kind }, agent) {
    const k = pick(seed.CI_RELATIONS, kind, 'Relationship');
    if (!k) throw fail(400, 'Pick the relationship.');
    const to = Number(toId);
    if (!to || to === Number(id)) throw fail(400, 'Pick another configuration item.');
    const ok = (await pool.query('SELECT count(*)::int AS n FROM samadhan.config_items WHERE id = ANY($1::int[])', [[Number(id), to]])).rows[0].n === 2;
    if (!ok) throw fail(404, 'Configuration item not found.');
    await pool.query('INSERT INTO samadhan.ci_relations ("fromId", "toId", kind) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [Number(id), to, k]);
    await history(Number(id), 'related', { kind: k, toId: to }, agent?.id);
}

async function unrelate(id, relId, agent) {
    const r = await pool.query('DELETE FROM samadhan.ci_relations WHERE id = $1 AND ($2 IN ("fromId", "toId")) RETURNING kind, "toId"', [Number(relId), Number(id)]);
    if (!r.rows.length) throw fail(404, 'Relationship not found.');
    await history(Number(id), 'unrelated', r.rows[0], agent?.id);
}

/** CIs on a ticket, plus suggestions from its IT details (asset tag, server) and application. */
async function forTicket(ticketId) {
    return quiet(async () => {
        const linked = (await pool.query(`SELECT c.id, c.code, c.name, c."ciClass", c.status, c.criticality, c."assignedName", c."siteLocation"
            FROM samadhan.ticket_cis tc JOIN samadhan.config_items c ON c.id = tc."ciId" WHERE tc."ticketId" = $1 ORDER BY c.code`, [ticketId])).rows;
        const it = (await pool.query('SELECT "assetTag", "serverName" FROM samadhan.ticket_it_details WHERE "ticketId" = $1', [ticketId]).catch(() => ({ rows: [] }))).rows[0] || {};
        const t = (await pool.query('SELECT "applicationId" FROM samadhan.tickets WHERE id = $1', [ticketId])).rows[0] || {};
        const sugg = (await pool.query(`SELECT c.id, c.code, c.name, c."ciClass", c.status FROM samadhan.config_items c
            WHERE (lower(c.code) = lower($1) OR lower(c.code) = lower($2) OR lower(c.name) = lower($2) OR (c."applicationId" = $3 AND c."ciClass" = 'Application / Service'))
              AND NOT EXISTS (SELECT 1 FROM samadhan.ticket_cis tc WHERE tc."ticketId" = $4 AND tc."ciId" = c.id) LIMIT 5`,
        [it.assetTag || '', it.serverName || '', t.applicationId ?? 0, ticketId])).rows;
        return { linked, suggestions: sugg, ready: true };
    }, { linked: [], suggestions: [], ready: false });
}

async function link(ticketId, ciId, agent) {
    const ci = (await pool.query('SELECT id, code FROM samadhan.config_items WHERE id = $1', [Number(ciId)])).rows[0];
    if (!ci) throw fail(404, 'Configuration item not found.');
    const r = await pool.query('INSERT INTO samadhan.ticket_cis ("ticketId", "ciId", "addedBy") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING "ciId"', [ticketId, ci.id, agent?.id ?? null]);
    if (r.rows.length) {
        await require('./util').logActivity(ticketId, 'ci_linked', { ci: ci.code }, agent?.id ?? null);
        await history(ci.id, 'ticket_linked', { ticketId }, agent?.id);
    }
}

async function unlink(ticketId, ciId, agent) {
    const r = await pool.query('DELETE FROM samadhan.ticket_cis WHERE "ticketId" = $1 AND "ciId" = $2 RETURNING "ciId"', [ticketId, Number(ciId)]);
    if (r.rows.length) await require('./util').logActivity(ticketId, 'ci_unlinked', { ciId: Number(ciId) }, agent?.id ?? null);
}

/** Typeahead for linking / relating. */
async function search(q) {
    const term = String(q ?? '').trim().slice(0, 100);
    if (term.length < 2) return [];
    return quiet(async () => (await pool.query(`SELECT id, code, name, "ciClass", status FROM samadhan.config_items
        WHERE code ILIKE $1 OR name ILIKE $1 OR "assignedName" ILIKE $1 OR "serialNo" ILIKE $1 ORDER BY (code ILIKE $2) DESC, code LIMIT 15`,
    [`%${term.replace(/[%_\\]/g, '\\$&')}%`, `${term.replace(/[%_\\]/g, '\\$&')}%`])).rows, []);
}

const IMPORT_COLS = ['code', 'name', 'ciClass', 'status', 'criticality', 'siteLocation', 'department', 'assignedName', 'assignedEmail', 'manufacturer', 'model', 'serialNo', 'ipAddress', 'version', 'purchaseDate', 'warrantyEnd', 'environment', 'notes'];
/** Excel import (asset register / discovery export): rows = objects keyed by IMPORT_COLS. New codes are added, known codes updated. */
async function importRows(rows, dryRun, agent) {
    if (!Array.isArray(rows) || !rows.length) throw fail(400, 'No rows to import.');
    if (rows.length > 5000) throw fail(400, 'At most 5,000 rows per upload - split the file.');
    const out = { total: rows.length, added: 0, updated: 0, errors: [] };
    for (const [i, raw] of rows.entries()) {
        const r = Object.fromEntries(IMPORT_COLS.map((k) => [k, raw?.[k] === undefined ? undefined : String(raw[k] ?? '').trim()]).filter(([, v]) => v !== undefined && v !== ''));
        try {
            if (!r.code || !r.name) throw fail(400, 'Code and name are required.');
            const data = await clean(r, true);
            const existing = (await pool.query('SELECT id FROM samadhan.config_items WHERE lower(code) = lower($1)', [data.code])).rows[0];
            if (!dryRun) await save(existing ? { ...data, id: existing.id } : data, agent);
            if (existing) out.updated++; else out.added++;
        } catch (e) {
            out.errors.push({ line: i + 2, code: r.code ?? null, error: e.message });
        }
    }
    out.errors = out.errors.slice(0, 500);
    return { ...out, dryRun };
}

module.exports = { IMPORT_COLS, forTicket, get, importRows, link, list, relate, save, search, unlink, unrelate, verify, VERIFY_DAYS };
