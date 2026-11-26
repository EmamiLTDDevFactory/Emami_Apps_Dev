'use strict';
/*
   ITSM support model (migration 7.11-itsm; Admin > Support model):
     - partners: the client (Emami), ITSM support vendors (Allied Digital today) and hyperscalers (Azure today) - lists an
       Admin extends; "current" choices are settings, so a change of vendor or cloud is one pick, and the history stays;
     - the support vendor on each ticket: new tickets of the vendor's desks get the current vendor; a vendor change can
       move the open tickets across in one step (audited);
     - hierarchical escalation (ITIL): a matrix of levels (vendor service-desk lead -> delivery manager -> client IT
       manager -> head of IT ...). Once a ticket's resolution is overdue by a level's hours, that level is emailed and the
       ticket climbs; an agent can also escalate by hand with a reason. Every step is logged on the ticket;
     - vendor scorecard: volume, SLA, MTTR, backlog, escalations and CSAT per support vendor.
   Tolerates a database before migration 7.11 (missing table / column = feature off).
*/
const { pool } = require('../db/pool');
const { EMAIL_RE } = require('../constants');
const { fail, logActivity, setting } = require('./util');
const seed = require('./itsmSeed');

const missing = (e) => e.code === '42P01' || e.code === '42703';
const quiet = async (fn, fallback) => { try { return await fn(); } catch (e) { if (missing(e)) return fallback; throw e; } };
const HOUR = 3600_000;

// ---------- Partners ----------
async function listPartners({ activeOnly = false } = {}) {
    return quiet(async () => (await pool.query(
        `SELECT id, kind, name, "shortName", active, "contactName", "contactEmail", "contactPhone", "contractRef",
                to_char("contractStart", 'YYYY-MM-DD') AS "contractStart", to_char("contractEnd", 'YYYY-MM-DD') AS "contractEnd", "slaTargetPct"::float AS "slaTargetPct", notes, position
         FROM samadhan.support_partners ${activeOnly ? 'WHERE active' : ''} ORDER BY kind, position, name`)).rows, []);
}

const cleanText = (v, max) => {
    const s = String(v ?? '').trim().slice(0, max);
    return s || null;
};
const cleanDate = (v, label) => {
    if (v === undefined || v === null || v === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) throw fail(400, `${label}: a date (YYYY-MM-DD).`);
    return String(v);
};

/** Adds (no id) or changes a partner. Names are unique per kind (case-insensitive). */
async function savePartner(b = {}) {
    const kind = String(b.kind || '');
    if (!seed.PARTNER_KINDS.includes(kind)) throw fail(400, 'Kind: client, ITSM support vendor or hyperscaler.');
    const name = cleanText(b.name, 120);
    if (!name) throw fail(400, 'Enter a name.');
    const contactEmail = cleanText(b.contactEmail, 200)?.toLowerCase() ?? null;
    if (contactEmail && !EMAIL_RE.test(contactEmail)) throw fail(400, 'Contact email is not valid.');
    const row = {
        kind, name, shortName: cleanText(b.shortName, 40), active: b.active !== false,
        contactName: cleanText(b.contactName, 120), contactEmail, contactPhone: cleanText(b.contactPhone, 40),
        contractRef: cleanText(b.contractRef, 120), contractStart: cleanDate(b.contractStart, 'Contract start'), contractEnd: cleanDate(b.contractEnd, 'Contract end'),
        notes: cleanText(b.notes, 1000),
        slaTargetPct: b.slaTargetPct === undefined || b.slaTargetPct === null || b.slaTargetPct === '' ? null : Number(b.slaTargetPct),
    };
    if (row.slaTargetPct !== null && !(Number.isFinite(row.slaTargetPct) && row.slaTargetPct >= 0 && row.slaTargetPct <= 100)) throw fail(400, 'SLA target: a percentage 0 to 100.');
    if (row.contractStart && row.contractEnd && row.contractEnd < row.contractStart) throw fail(400, 'Contract end is before its start.');
    const clash = await pool.query('SELECT id FROM samadhan.support_partners WHERE kind = $1 AND lower(name) = lower($2) AND id <> $3', [kind, name, Number(b.id) || 0]);
    if (clash.rows.length) throw fail(400, `"${name}" is already in the list.`);
    const keys = Object.keys(row);
    if (b.id) {
        const r = await pool.query(`UPDATE samadhan.support_partners SET ${keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ')}, "updatedAt" = now() WHERE id = $1 RETURNING id`,
            [Number(b.id), ...keys.map((k) => row[k])]);
        if (!r.rows.length) throw fail(404, 'Not found.');
        return r.rows[0].id;
    }
    const pos = Number((await pool.query('SELECT COALESCE(max(position), 0) + 1 AS p FROM samadhan.support_partners WHERE kind = $1', [kind])).rows[0].p);
    const r = await pool.query(`INSERT INTO samadhan.support_partners (${keys.map((k) => `"${k}"`).join(', ')}, position) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}, $${keys.length + 1}) RETURNING id`,
        [...keys.map((k) => row[k]), pos]);
    return r.rows[0].id;
}

// ---------- Settings (current client / vendor / hyperscaler, vendor desks) ----------
async function model() {
    const [clientId, vendorId, hyperscalerId, vendorDesks, autoEscalate] = await Promise.all(
        ['itsm.clientId', 'itsm.vendorId', 'itsm.hyperscalerId', 'itsm.vendorDesks', 'itsm.autoEscalate'].map((k) => setting(k).catch(() => null)));
    return {
        clientId: Number(clientId) || null, vendorId: Number(vendorId) || null, hyperscalerId: Number(hyperscalerId) || null,
        vendorDesks: Array.isArray(vendorDesks) ? vendorDesks : [], autoEscalate: autoEscalate !== false,
    };
}

async function saveModel(b = {}, actorAgentId = null) {
    const partners = await listPartners();
    const check = (key, kind) => {
        if (b[key] === undefined) return undefined;
        const id = b[key] === null || b[key] === '' ? null : Number(b[key]);
        if (id !== null && !partners.some((p) => p.id === id && p.kind === kind)) throw fail(400, 'Pick a value from the list.');
        return id;
    };
    const updates = [];
    for (const [key, kind] of [['clientId', 'CLIENT'], ['vendorId', 'ITSM_VENDOR'], ['hyperscalerId', 'HYPERSCALER']]) {
        const v = check(key, kind);
        if (v !== undefined) updates.push([`itsm.${key}`, v]);
    }
    if (b.vendorDesks !== undefined) {
        if (!Array.isArray(b.vendorDesks) || b.vendorDesks.some((k) => !/^[A-Z][A-Z0-9_]{1,19}$/.test(String(k)))) throw fail(400, 'Unknown service desk.');
        updates.push(['itsm.vendorDesks', [...new Set(b.vendorDesks.map(String))]]);
    }
    if (b.autoEscalate !== undefined) updates.push(['itsm.autoEscalate', b.autoEscalate === true]);
    const before = await model();
    for (const [key, value] of updates) {
        await pool.query('INSERT INTO samadhan.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
    }
    require('./config').clearConfigCache?.();
    // Vendor change: optionally move the open tickets of the vendor's desks to the new vendor (history stays as it was).
    let moved = 0;
    const after = await model();
    if (b.moveOpenTickets === true && after.vendorId && after.vendorId !== before.vendorId) moved = await moveOpenTickets(after.vendorId, after.vendorDesks, actorAgentId);
    return { ...after, moved };
}

/** Open tickets of the given desks go to vendorId; each gets an activity line. Returns how many moved. */
async function moveOpenTickets(vendorId, deskKeys, actorAgentId = null) {
    const { rows } = await pool.query(
        `UPDATE samadhan.tickets t SET "supportPartnerId" = $1, "updatedAt" = now()
         FROM samadhan.workspaces w, samadhan.ticket_statuses s
         WHERE w.id = t."workspaceId" AND s.id = t."statusId" AND w.key = ANY($2::text[]) AND NOT s."isResolved" AND NOT s."isClosed"
           AND t."deletedAt" IS NULL AND t."supportPartnerId" IS DISTINCT FROM $1
         RETURNING t.id`, [vendorId, deskKeys]);
    for (const r of rows) await logActivity(r.id, 'updated', { supportPartnerId: { to: vendorId, note: 'Support vendor changed' } }, actorAgentId);
    return rows.length;
}

/** The support vendor a new ticket gets: the one given (checked), else the current vendor when its desk is a vendor desk. */
async function vendorFor(workspaceId, givenId) {
    if (givenId) {
        const ok = await quiet(async () => (await pool.query(`SELECT id FROM samadhan.support_partners WHERE id = $1 AND kind = 'ITSM_VENDOR'`, [Number(givenId)])).rows[0]?.id, null);
        if (ok) return ok;
    }
    if (!workspaceId) return null;
    const m = await model();
    if (!m.vendorId || !m.vendorDesks.length) return null;
    const key = (await pool.query('SELECT key FROM samadhan.workspaces WHERE id = $1', [workspaceId]).catch(() => ({ rows: [] }))).rows[0]?.key;
    return key && m.vendorDesks.includes(key) ? m.vendorId : null;
}

/** After a ticket is created: its support vendor and legacy number (no-op before migration 7.11). */
async function afterCreate(ticketId, input = {}) {
    await quiet(async () => {
        const t = (await pool.query('SELECT "workspaceId" FROM samadhan.tickets WHERE id = $1', [ticketId])).rows[0];
        const vendor = await vendorFor(t?.workspaceId, input.supportPartnerId);
        const legacy = cleanText(input.legacyRef, 80);
        if (vendor || legacy) await pool.query('UPDATE samadhan.tickets SET "supportPartnerId" = COALESCE($2, "supportPartnerId"), "legacyRef" = COALESCE($3, "legacyRef") WHERE id = $1', [ticketId, vendor, legacy]);
    }, null);
}

/** Hosting choices beyond the built-in list: active hyperscalers whose name / short name is not already there. */
async function hostingExtra() {
    const { IT_LISTS } = require('./itSeed');
    const have = new Set(IT_LISTS.hosting.map((h) => h.toLowerCase()));
    const out = [];
    for (const p of await listPartners({ activeOnly: true })) {
        if (p.kind !== 'HYPERSCALER') continue;
        if (have.has(p.name.toLowerCase()) || (p.shortName && have.has(p.shortName.toLowerCase()))) continue;
        have.add(p.name.toLowerCase());
        out.push(p.name);
    }
    return out;
}

/** /meta: what the ticket screens need (active partners, current choices, escalation levels in use). */
async function meta() {
    const partners = await listPartners({ activeOnly: true });
    if (!partners.length) return null;
    const m = await model();
    const levels = await quiet(async () => (await pool.query('SELECT DISTINCT level FROM samadhan.escalation_contacts WHERE active ORDER BY level')).rows.map((r) => r.level), []);
    return {
        vendors: partners.filter((p) => p.kind === 'ITSM_VENDOR').map(({ id, name, shortName }) => ({ id, name, shortName })),
        hyperscalers: partners.filter((p) => p.kind === 'HYPERSCALER').map(({ id, name, shortName }) => ({ id, name, shortName })),
        clients: partners.filter((p) => p.kind === 'CLIENT').map(({ id, name, shortName }) => ({ id, name, shortName })),
        ...m, escalationLevels: levels, hostingExtra: await hostingExtra(),
    };
}

// ---------- Escalation matrix ----------
async function listContacts() {
    return quiet(async () => (await pool.query(
        `SELECT c.id, c.level, c.party, c."workspaceId", w.name AS "workspaceName", c.name, c.designation, c.email, c.phone,
                c."afterHours"::float AS "afterHours", c.priorities, c.active
         FROM samadhan.escalation_contacts c LEFT JOIN samadhan.workspaces w ON w.id = c."workspaceId" ORDER BY c.level, c.id`)).rows, []);
}

async function saveContact(b = {}) {
    const level = Number(b.level);
    if (!Number.isInteger(level) || level < 1 || level > 6) throw fail(400, 'Level: 1 to 6.');
    const party = b.party === 'CLIENT' ? 'CLIENT' : 'VENDOR';
    const name = cleanText(b.name, 120);
    if (!name) throw fail(400, 'Enter the person\'s name.');
    const email = cleanText(b.email, 200)?.toLowerCase() ?? '';
    if (!EMAIL_RE.test(email)) throw fail(400, 'Enter a valid email - escalations are emailed.');
    const afterHours = Number(b.afterHours ?? 0);
    if (!Number.isFinite(afterHours) || afterHours < 0 || afterHours > 2000) throw fail(400, 'Hours after the resolution due time: 0 to 2000.');
    const priorities = Array.isArray(b.priorities) ? [...new Set(b.priorities.map(Number))] : [];
    if (priorities.some((p) => ![1, 2, 3, 4].includes(p))) throw fail(400, 'Unknown priority.');
    const workspaceId = b.workspaceId ? Number(b.workspaceId) : null;
    if (workspaceId && !(await pool.query('SELECT 1 FROM samadhan.workspaces WHERE id = $1', [workspaceId])).rows.length) throw fail(400, 'Unknown service desk.');
    const vals = [level, party, workspaceId, name, cleanText(b.designation, 120), email, cleanText(b.phone, 40), afterHours, priorities, b.active !== false];
    if (b.id) {
        const r = await pool.query(`UPDATE samadhan.escalation_contacts SET level = $2, party = $3, "workspaceId" = $4, name = $5, designation = $6, email = $7, phone = $8,
                                    "afterHours" = $9, priorities = $10, active = $11, "updatedAt" = now() WHERE id = $1 RETURNING id`, [Number(b.id), ...vals]);
        if (!r.rows.length) throw fail(404, 'Not found.');
        return r.rows[0].id;
    }
    return (await pool.query(`INSERT INTO samadhan.escalation_contacts (level, party, "workspaceId", name, designation, email, phone, "afterHours", priorities, active)
                              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`, vals)).rows[0].id;
}

async function deleteContact(id) {
    const r = await pool.query('DELETE FROM samadhan.escalation_contacts WHERE id = $1 RETURNING id', [Number(id)]);
    if (!r.rows.length) throw fail(404, 'Not found.');
}

/**
 * Contacts that apply to a ticket (its desk or every desk; its priority or every priority), by level. Vendor-side
 * levels apply only to tickets a support vendor works (supportPartnerId set); client-side levels to every ticket.
 */
async function contactsFor(t) {
    const rows = await quiet(async () => (await pool.query(
        `SELECT * FROM samadhan.escalation_contacts WHERE active AND ("workspaceId" IS NULL OR "workspaceId" = $1)
           AND (cardinality(priorities) = 0 OR $2 = ANY(priorities)) AND (party = 'CLIENT' OR $3::boolean) ORDER BY level, id`,
        [t.workspaceId ?? null, t.priority, Boolean(t.supportPartnerId)])).rows, []);
    const byLevel = new Map();
    for (const r of rows) byLevel.set(r.level, [...(byLevel.get(r.level) || []), r]);
    return byLevel;
}

/** Escalates a ticket to `level`: emails that level's contacts, rings the team, logs it. */
async function escalateTo(t, level, people, { manual = false, reason = '', actorAgentId = null } = {}) {
    const { loadTicket, notifyAgents } = require('./notify');
    const { ring } = require('./bell');
    await pool.query(`UPDATE samadhan.tickets SET "escalationLevel" = $2, "escalationLevelAt" = now(), "escalatedAt" = COALESCE("escalatedAt", now()) WHERE id = $1`, [t.id, level]);
    const emails = [...new Set(people.map((p) => p.email))];
    const vendor = t.supportPartnerId ? (await pool.query('SELECT name FROM samadhan.support_partners WHERE id = $1', [t.supportPartnerId])).rows[0]?.name : null;
    const why = reason || (manual ? 'Escalated by an agent' : 'Resolution overdue');
    await pool.query('INSERT INTO samadhan.ticket_escalations ("ticketId", level, manual, reason, notified, "byAgentId") VALUES ($1, $2, $3, $4, $5, $6)',
        [t.id, level, manual, why.slice(0, 1000), emails, actorAgentId]);
    await logActivity(t.id, 'escalated', { level, manual, reason: why.slice(0, 300), notified: emails }, actorAgentId);
    const fresh = await loadTicket(t.id);
    const first = people[0] ?? {};
    await notifyAgents(fresh, 'agent.escalation_level', emails, {
        'escalation.level': String(level), 'escalation.name': people.length === 1 ? first.name : 'team',
        'escalation.designation': [...new Set(people.map((p) => p.designation).filter(Boolean))].join(', ') || `level ${level}`,
        'escalation.vendor': vendor ?? '—', 'escalation.reason': why,
    }).catch((e) => console.error('[samadhan] escalation mail:', e.message));
    await ring(fresh, 'escalated', { title: `Escalation level ${level}: ${fresh.displayRef ?? `#${t.id}`} ${fresh.subject}`, body: `${people.map((p) => p.name).join(', ')} - ${why}`, except: actorAgentId });
    return { level, notified: emails };
}

/** By hand: the next level that has contacts. */
async function escalateManually(ticketId, reason, agent) {
    const text = String(reason ?? '').trim();
    if (text.length < 5) throw fail(400, 'Say why you are escalating (at least a few words).');
    const t = (await pool.query(`SELECT t.*, s."isResolved", s."isClosed" FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE t.id = $1`, [ticketId])).rows[0];
    if (!t) throw fail(404, 'Ticket not found.');
    if (t.isResolved || t.isClosed) throw fail(400, 'This ticket is already resolved.');
    const byLevel = await contactsFor(t);
    const next = [...byLevel.keys()].filter((l) => l > (t.escalationLevel || 0)).sort((a, b) => a - b)[0];
    if (!next) throw fail(400, byLevel.size ? 'Already at the highest escalation level.' : 'No escalation matrix yet - an Admin sets it up in Admin > Support model.');
    return escalateTo(t, next, byLevel.get(next), { manual: true, reason: text, actorAgentId: agent?.id ?? null });
}

/** Scheduled: overdue tickets climb one level per run once the level's hours past the resolution due time are reached. */
async function runEscalations(now = new Date()) {
    const m = await model().catch(() => null);
    if (!m?.autoEscalate) return 0;
    const any = await quiet(async () => Number((await pool.query('SELECT count(*) AS n FROM samadhan.escalation_contacts WHERE active')).rows[0].n), 0);
    if (!any) return 0;
    const { rows } = await pool.query(
        `SELECT t.* FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE NOT s."isResolved" AND NOT s."isClosed" AND NOT s."pausesSla" AND NOT t.spam AND t."deletedAt" IS NULL
           AND t."resolutionDueAt" IS NOT NULL AND t."resolutionDueAt" < $1 ORDER BY t."resolutionDueAt" LIMIT 500`, [now]);
    let n = 0;
    for (const t of rows) {
        const hoursPast = (now - new Date(t.resolutionDueAt)) / HOUR;
        const byLevel = await contactsFor(t);
        const next = [...byLevel.keys()].filter((l) => l > (t.escalationLevel || 0)).sort((a, b) => a - b)[0];
        if (!next) continue;
        const due = byLevel.get(next).filter((c) => Number(c.afterHours) <= hoursPast);
        if (!due.length) continue;
        await escalateTo(t, next, due, { reason: `Resolution overdue by ${hoursPast < 1 ? `${Math.round(hoursPast * 60)} min` : `${Math.round(hoursPast * 10) / 10} h`}` });
        n++;
    }
    return n;
}

async function ticketEscalations(ticketId) {
    return quiet(async () => (await pool.query(
        `SELECT e.id, e.level, e.manual, e.reason, e.notified, e."createdAt", a.name AS "byName"
         FROM samadhan.ticket_escalations e LEFT JOIN samadhan.agents a ON a.id = e."byAgentId" WHERE e."ticketId" = $1 ORDER BY e.id`, [ticketId])).rows, []);
}

// ---------- Vendor scorecard ----------
/** Per support vendor, tickets logged in the last `days` days. scopeSql: the caller's scope (lib/ticketQuery scopeSql, '' = all). */
async function scorecard(days = 30, scopeSql = '') {
    const d = Math.min(Math.max(Number(days) || 30, 1), 730);
    const { rows } = await pool.query(
        `WITH x AS (
            SELECT t.*, s."isResolved" OR s."isClosed" AS done, cs.n AS "csatN", cs.happy AS "csatH",
                   EXISTS (SELECT 1 FROM samadhan.activities a WHERE a."ticketId" = t.id AND a.action = 'updated' AND a.details ? 'groupId') AS moved,
                   EXISTS (SELECT 1 FROM samadhan.activities a WHERE a."ticketId" = t.id AND a.action = 'requester_replied' AND t."resolvedAt" IS NOT NULL AND a."createdAt" > t."resolvedAt") AS reopened
            FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
            LEFT JOIN LATERAL (SELECT count(*) AS n, count(*) FILTER (WHERE c.rating = 3) AS happy FROM samadhan.csat_responses c WHERE c."ticketId" = t.id) cs ON true
            WHERE t."deletedAt" IS NULL AND NOT t.spam AND t."createdAt" >= now() - ($1::int * interval '1 day')${scopeSql ? ` AND ${scopeSql}` : ''})
         SELECT x."supportPartnerId" AS id, COALESCE(sp.name, 'In-house / not set') AS name, sp."contractEnd", sp."slaTargetPct"::float AS "slaTargetPct",
                count(*)::int AS total,
                count(*) FILTER (WHERE NOT x.done)::int AS open,
                count(*) FILTER (WHERE x."resolvedAt" IS NOT NULL)::int AS resolved,
                count(*) FILTER (WHERE NOT x.done AND x."resolutionDueAt" < now())::int AS "openBreached",
                count(*) FILTER (WHERE x."firstResponseDueAt" IS NOT NULL AND x."firstRespondedAt" IS NOT NULL)::int AS "frMeasured",
                count(*) FILTER (WHERE x."firstRespondedAt" IS NOT NULL AND x."firstResponseDueAt" IS NOT NULL AND x."firstRespondedAt" <= x."firstResponseDueAt")::int AS "frMet",
                count(*) FILTER (WHERE x."resolvedAt" IS NOT NULL AND x."resolutionDueAt" IS NOT NULL)::int AS "resMeasured",
                count(*) FILTER (WHERE x."resolvedAt" IS NOT NULL AND x."resolutionDueAt" IS NOT NULL AND x."resolvedAt" <= x."resolutionDueAt")::int AS "resMet",
                round(avg(extract(epoch FROM x."resolvedAt" - x."createdAt") / 3600) FILTER (WHERE x."resolvedAt" IS NOT NULL)::numeric, 1)::float AS "mttrHours",
                count(*) FILTER (WHERE x."escalationLevel" > 0)::int AS escalated,
                count(*) FILTER (WHERE x."isMajorIncident")::int AS major,
                -- First contact resolution: resolved without escalation, without moving to another group, and not reopened.
                count(*) FILTER (WHERE x."resolvedAt" IS NOT NULL AND x."escalatedAt" IS NULL AND COALESCE(x."escalationLevel", 0) = 0 AND NOT x.moved AND NOT x.reopened)::int AS fcr,
                COALESCE(sum(x."csatN"), 0)::int AS "csatCount",
                COALESCE(sum(x."csatH"), 0)::int AS "csatHappy"
         FROM x LEFT JOIN samadhan.support_partners sp ON sp.id = x."supportPartnerId"
         GROUP BY x."supportPartnerId", sp.name, sp."contractEnd", sp."slaTargetPct" ORDER BY total DESC`, [d]);
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
    return rows.map((r) => ({
        ...r, contractEnd: r.contractEnd ? new Date(r.contractEnd).toISOString().slice(0, 10) : null,
        frPct: pct(r.frMet, r.frMeasured), resPct: pct(r.resMet, r.resMeasured), csatPct: pct(r.csatHappy, r.csatCount), escalatedPct: pct(r.escalated, r.total),
        fcrPct: pct(r.fcr, r.resolved),
        // KPI against the contract: the resolution SLA % the vendor signed up to (payment / penalty review).
        targetMet: r.slaTargetPct === null || pct(r.resMet, r.resMeasured) === null ? null : pct(r.resMet, r.resMeasured) >= r.slaTargetPct,
    }));
}

module.exports = {
    afterCreate, deleteContact, escalateManually, hostingExtra, listContacts, listPartners, meta, model, moveOpenTickets, runEscalations,
    saveContact, saveModel, savePartner, scorecard, ticketEscalations, vendorFor,
};
