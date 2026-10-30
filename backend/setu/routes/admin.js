'use strict';
const { clearCalendarCache } = require('../lib/businessHours');
const { clearSeverityCache } = require('../lib/severity');
const { clearSlaCache } = require('../lib/sla');
const express = require('express');
const { pool } = require('../../db');
const { APP_ID, BELL_EVENTS, BELL_SCOPES, CALL_MODES, EMAIL_RE, SEVERITIES } = require('../constants');
const { deleteCanned, saveCanned } = require('../lib/canned');
const { audit, fail, intOrNull, wrap } = require('../lib/util');
const { isAdmin } = require('../middleware/auth');

// ---------- Routes: admin ----------

const admin = express.Router();
admin.use((req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ success: false, error: 'Setu admins only.' })));

admin.get('/agents', wrap(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.*, COALESCE(array_agg(m."groupId") FILTER (WHERE m."groupId" IS NOT NULL), '{}') AS "groupIds",
                EXISTS (SELECT 1 FROM emami_apps.authorized_user_apps g WHERE g.email = a.email AND g.app_id = '${APP_ID}') AS "hasAccess"
         FROM setu.agents a LEFT JOIN setu.group_members m ON m."agentId" = a.id GROUP BY a.id ORDER BY a.active DESC, a.name`,
    );
    res.json({ success: true, agents: rows });
}));

/** Create or update an agent (by email). Access itself is granted in Manage Access; the role comes from that grant. */
admin.post('/agents', wrap(async (req, res) => {
    const b = req.body ?? {};
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim();
    if (!EMAIL_RE.test(email) || !name) throw fail(400, 'Name and a valid email are needed.');
    if (email === req.verifiedEmail && b.active === false) throw fail(400, 'You cannot deactivate yourself.');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `INSERT INTO setu.agents (email, name, active) VALUES ($1, $2, $3)
             ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active RETURNING id`,
            [email, name.slice(0, 200), b.active !== false],
        );
        if (Array.isArray(b.groupIds)) {
            await client.query('DELETE FROM setu.group_members WHERE "agentId" = $1', [rows[0].id]);
            for (const g of b.groupIds.map(Number).filter(Number.isInteger)) {
                await client.query('INSERT INTO setu.group_members ("agentId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [rows[0].id, g]);
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
    await audit(req.verifiedEmail, 'agent_saved', { email, active: b.active !== false, groupIds: b.groupIds });
    res.json({ success: true });
}));

admin.get('/groups', wrap(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT g.*, COALESCE(array_agg(m."agentId") FILTER (WHERE m."agentId" IS NOT NULL), '{}') AS "agentIds"
         FROM setu.groups g LEFT JOIN setu.group_members m ON m."groupId" = g.id GROUP BY g.id ORDER BY g.name`,
    );
    res.json({ success: true, groups: rows });
}));

admin.post('/groups', wrap(async (req, res) => {
    const b = req.body ?? {};
    const name = String(b.name || '').trim();
    if (!name) throw fail(400, 'Group name is needed.');
    const assignment = b.assignment === 'ROUND_ROBIN' ? 'ROUND_ROBIN' : 'MANUAL';
    const id = intOrNull(b.id);
    let groupId = id;
    if (id) await pool.query('UPDATE setu.groups SET name = $2, description = $3, assignment = $4 WHERE id = $1', [id, name, b.description || null, assignment]);
    else groupId = (await pool.query('INSERT INTO setu.groups (name, description, assignment) VALUES ($1, $2, $3) RETURNING id', [name, b.description || null, assignment])).rows[0].id;
    if (Array.isArray(b.agentIds)) {
        await pool.query('DELETE FROM setu.group_members WHERE "groupId" = $1', [groupId]);
        for (const a of b.agentIds.map(Number).filter(Number.isInteger)) {
            await pool.query('INSERT INTO setu.group_members ("agentId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [a, groupId]);
        }
    }
    await audit(req.verifiedEmail, 'group_saved', { id: groupId, name, assignment });
    res.json({ success: true, id: groupId });
}));

admin.get('/settings', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT key, value FROM setu.settings');
    res.json({ success: true, settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}));

admin.put('/settings', wrap(async (req, res) => {
    const b = req.body ?? {};
    const updates = [];
    if (b['escalation.groupId'] !== undefined) updates.push(['escalation.groupId', Number(b['escalation.groupId']) || 0]);
    if (b['escalation.notifyEmails'] !== undefined) {
        const emails = (Array.isArray(b['escalation.notifyEmails']) ? b['escalation.notifyEmails'] : String(b['escalation.notifyEmails']).split(/[,;\s]+/))
            .map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (emails.some((x) => !EMAIL_RE.test(x))) throw fail(400, 'One of the escalation emails is not valid.');
        updates.push(['escalation.notifyEmails', emails]);
    }
    if (b['sla.reminderMinutes'] !== undefined) {
        const n = Number(b['sla.reminderMinutes']);
        if (!Number.isInteger(n) || n < 5 || n > 24 * 60) throw fail(400, 'Reminder lead time must be 5 to 1440 minutes.');
        updates.push(['sla.reminderMinutes', n]);
    }
    if (b['bell.events'] !== undefined) {
        if (!Array.isArray(b['bell.events']) || b['bell.events'].some((e) => !BELL_EVENTS.includes(e))) throw fail(400, 'Unknown bell event.');
        updates.push(['bell.events', [...new Set(b['bell.events'])]]);
    }
    if (b['bell.scope'] !== undefined) {
        if (!BELL_SCOPES.includes(b['bell.scope'])) throw fail(400, 'Unknown bell audience.');
        updates.push(['bell.scope', b['bell.scope']]);
    }
    if (b['portal.enabled'] !== undefined) updates.push(['portal.enabled', b['portal.enabled'] === true]);
    if (b['call.mode'] !== undefined) {
        if (!CALL_MODES.includes(b['call.mode'])) throw fail(400, 'Unknown calling option.');
        updates.push(['call.mode', b['call.mode']]);
    }
    if (b['whatsapp.threadDays'] !== undefined) {
        const n = Number(b['whatsapp.threadDays']);
        if (!Number.isInteger(n) || n < 1 || n > 60) throw fail(400, 'WhatsApp threading must be 1 to 60 days.');
        updates.push(['whatsapp.threadDays', n]);
    }
    for (const [key, value] of updates) {
        await pool.query('INSERT INTO setu.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
    }
    await audit(req.verifiedEmail, 'settings_saved', Object.fromEntries(updates));
    res.json({ success: true });
}));

admin.get('/templates', wrap(async (req, res) => {
    res.json({ success: true, templates: (await pool.query('SELECT * FROM setu.email_templates ORDER BY audience DESC, key')).rows });
}));

admin.put('/templates/:key', wrap(async (req, res) => {
    const b = req.body ?? {};
    const { rowCount } = await pool.query(
        'UPDATE setu.email_templates SET subject = $2, body = $3, enabled = $4 WHERE key = $1',
        [req.params.key, String(b.subject || '').slice(0, 500), String(b.body || '').slice(0, 20000), b.enabled !== false],
    );
    if (!rowCount) throw fail(404, 'Template not found.');
    await audit(req.verifiedEmail, 'template_saved', { key: req.params.key });
    res.json({ success: true });
}));

// Shared canned responses only: agents' personal ones are private (routes/me.js), Admins included.
admin.post('/canned', wrap(async (req, res) => {
    await saveCanned(req.body ?? {}, null);
    res.json({ success: true });
}));

admin.delete('/canned/:id', wrap(async (req, res) => {
    await deleteCanned(req.params.id, null);
    res.json({ success: true });
}));

admin.get('/distributors', wrap(async (req, res) => {
    const term = String(req.query.q || '').trim();
    const params = term ? [`%${term}%`] : [];
    const where = term ? 'WHERE code ILIKE $1 OR name ILIKE $1 OR depot ILIKE $1' : '';
    const [items, total] = await Promise.all([
        pool.query(`SELECT * FROM setu.distributors ${where} ORDER BY code LIMIT 100`, params),
        pool.query('SELECT count(*)::int AS n, max("updatedAt") AS "lastUpdated" FROM setu.distributors'),
    ]);
    res.json({ success: true, items: items.rows, total: total.rows[0].n, lastUpdated: total.rows[0].lastUpdated });
}));

// Column headers accepted in the distributor list upload (common spellings of each column).
const DISTRIBUTOR_HEADERS = {
    'db code': 'code', db_code: 'code', 'distributor code': 'code', dbcode: 'code',
    distributor_name: 'name', 'distributor name': 'name', 'db name': 'name',
    region_name: 'region', region: 'region',
    state_name: 'state', state: 'state',
    depot_code: 'depot', depot: 'depot',
    asm_name: 'asmName', 'asm name': 'asmName',
    'depot co-ordinator': 'depotCoordinator', 'depot coordinator': 'depotCoordinator',
    db_category: 'category', 'db category': 'category', category: 'category',
    status: 'status',
};

/** Body: { rows: string[][] } - the sheet as rows of cells (the page reads the .xlsx / .csv). */
admin.post('/distributors/import', wrap(async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || rows.length > 50000) throw fail(400, 'Upload the DB list as .xlsx or .csv with a header row (up to 50,000 rows).');
    const cells = rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : []));
    const headerIdx = cells.findIndex((r) => r.some((c) => DISTRIBUTOR_HEADERS[c.toLowerCase()] === 'code'));
    if (headerIdx < 0) throw fail(400, 'No DB Code column found.');
    const cols = cells[headerIdx].map((c) => DISTRIBUTOR_HEADERS[c.toLowerCase()]);
    const mapped = cells.slice(headerIdx + 1).map((r) => {
        const o = {};
        cols.forEach((k, i) => { if (k && r[i]) o[k] = r[i].slice(0, 200); });
        return o;
    }).filter((r) => r.code && r.name);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const r of mapped) {
            await client.query(
                `INSERT INTO setu.distributors (code, name, region, state, depot, "asmName", "depotCoordinator", category, active, "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
                 ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, region = EXCLUDED.region, state = EXCLUDED.state, depot = EXCLUDED.depot,
                   "asmName" = EXCLUDED."asmName", "depotCoordinator" = EXCLUDED."depotCoordinator", category = EXCLUDED.category,
                   active = EXCLUDED.active, "updatedAt" = now()`,
                [r.code, r.name, r.region ?? null, r.state ?? null, r.depot ?? null, r.asmName ?? null, r.depotCoordinator ?? null, r.category ?? null,
                    r.status ? !/inactive|blocked|closed/i.test(r.status) : true],
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
    await audit(req.verifiedEmail, 'distributors_imported', { rows: mapped.length });
    res.json({ success: true, imported: mapped.length });
}));

admin.post('/contacts/anonymize', wrap(async (req, res) => {
    // By email, or by phone number for WhatsApp requesters who have no email.
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    if (!email && !phone) throw fail(400, 'Give an email address or a phone number.');
    const { rows } = await pool.query(
        `UPDATE setu.contacts SET name = 'Removed contact', email = NULL, phone = NULL, mobile = NULL, "anonymizedAt" = now()
         WHERE ${email ? 'email = $1' : '(mobile = $1 OR phone = $1)'} RETURNING id`,
        [email || phone],
    );
    if (!rows.length) throw fail(404, email ? 'No contact with that email address.' : 'No contact with that phone number.');
    // The address also appears on email conversations, activity entries and parked mail: remove it there too.
    await pool.query(
        `UPDATE setu.conversations SET "fromEmail" = CASE WHEN "fromEmail" = $1 THEN NULL ELSE "fromEmail" END,
                "toEmails" = array_remove("toEmails", $1), "ccEmails" = array_remove("ccEmails", $1)
         WHERE "fromEmail" = $1 OR $1 = ANY("toEmails") OR $1 = ANY("ccEmails")`,
        [email],
    );
    await pool.query(`UPDATE setu.activities SET details = details - 'to' WHERE details->>'to' = $1`, [email]);
    // Their own words and phone numbers on their tickets go too (agents' replies and notes stay as the record of work).
    const REMOVED_TEXT = "[Removed at the requester's request]";
    await pool.query(
        `UPDATE setu.tickets SET description = $2, "callerName" = NULL, "callerContactNumber" = NULL, "mobileNo" = NULL,
                "alternateMobileNo" = NULL, "updatedAt" = now()
         WHERE "requesterId" = ANY($1::int[])`,
        [rows.map((r) => r.id), `<p>${REMOVED_TEXT}</p>`],
    );
    await pool.query(
        `UPDATE setu.conversations SET "bodyHtml" = $2, "bodyText" = $3
         WHERE kind = 'INCOMING' AND "ticketId" IN (SELECT id FROM setu.tickets WHERE "requesterId" = ANY($1::int[]))`,
        [rows.map((r) => r.id), `<p>${REMOVED_TEXT}</p>`, REMOVED_TEXT],
    );
    const ids = rows.map((r) => r.id);
    await pool.query(
        `UPDATE setu.conversations SET "fromPhone" = NULL WHERE "fromPhone" IS NOT NULL AND "ticketId" IN (SELECT id FROM setu.tickets WHERE "requesterId" = ANY($1::int[]))`,
        [ids],
    );
    await pool.query(`UPDATE setu.call_logs SET phone = 'removed' WHERE "ticketId" IN (SELECT id FROM setu.tickets WHERE "requesterId" = ANY($1::int[]))`, [ids]);
    // Bell entries quote the requester's name and words.
    await pool.query('DELETE FROM setu.notifications WHERE "ticketId" IN (SELECT id FROM setu.tickets WHERE "requesterId" = ANY($1::int[]))', [ids]);
    await pool.query(
        `UPDATE setu.tickets SET "lastActivityBy" = 'Removed contact'
         WHERE "requesterId" = ANY($1::int[]) AND ("lastActivityKind" = 'requester_reply' OR ("lastActivityKind" = 'created' AND source IN ('Email', 'Portal', 'WhatsApp')))`,
        [ids],
    );
    if (email) await pool.query(`UPDATE setu.parked_mail SET "fromEmail" = 'removed' WHERE "fromEmail" = $1`, [email]);
    await audit(req.verifiedEmail, 'contact_anonymized', { contactIds: rows.map((r) => r.id) });
    res.json({ success: true });
}));

admin.get('/sla', wrap(async (req, res) => {
    const [policies, targets, links] = await Promise.all([
        pool.query('SELECT * FROM setu.sla_policies ORDER BY position, id'),
        pool.query('SELECT * FROM setu.sla_targets ORDER BY "policyId", priority DESC'),
        pool.query('SELECT * FROM setu.sla_policy_groups'),
    ]);
    res.json({
        success: true,
        policies: policies.rows.map((p) => ({
            ...p,
            targets: targets.rows.filter((t) => t.policyId === p.id),
            groupIds: links.rows.filter((l) => l.policyId === p.id).map((l) => l.groupId),
        })),
    });
}));

admin.put('/sla/targets/:id', wrap(async (req, res) => {
    const b = req.body ?? {};
    const n = (v, nullable) => {
        if (nullable && (v === null || v === '')) return null;
        const x = Number(v);
        if (!Number.isInteger(x) || x <= 0) throw fail(400, 'SLA times must be whole minutes above zero.');
        return x;
    };
    await pool.query(
        `UPDATE setu.sla_targets SET "firstResponseMins" = $2, "nextResponseMins" = $3, "resolutionMins" = $4, "businessHours" = $5, escalate = $6 WHERE id = $1`,
        [Number(req.params.id), n(b.firstResponseMins), n(b.nextResponseMins, true), n(b.resolutionMins), b.businessHours !== false, b.escalate !== false],
    );
    clearSlaCache();
    await audit(req.verifiedEmail, 'sla_target_saved', { id: Number(req.params.id) });
    res.json({ success: true });
}));

admin.put('/sla/policies/:id/groups', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const groupIds = (Array.isArray(req.body?.groupIds) ? req.body.groupIds : []).map(Number).filter(Number.isInteger);
    await pool.query('DELETE FROM setu.sla_policy_groups WHERE "policyId" = $1', [id]);
    for (const g of groupIds) await pool.query('INSERT INTO setu.sla_policy_groups ("policyId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, g]);
    clearSlaCache();
    res.json({ success: true });
}));

admin.get('/severity-rules', wrap(async (req, res) => {
    res.json({ success: true, rules: (await pool.query('SELECT * FROM setu.severity_rules ORDER BY severity, category, "function"')).rows });
}));

admin.post('/severity-rules', wrap(async (req, res) => {
    const category = String(req.body?.category || '').trim();
    const fn = String(req.body?.function || '*').trim() || '*';
    const severity = String(req.body?.severity || '');
    if (!category || !SEVERITIES.includes(severity)) throw fail(400, 'Category and severity are needed.');
    await pool.query(
        `INSERT INTO setu.severity_rules (category, "function", severity) VALUES ($1, $2, $3)
         ON CONFLICT (category, "function") DO UPDATE SET severity = EXCLUDED.severity`,
        [category, fn, severity],
    );
    clearSeverityCache();
    await audit(req.verifiedEmail, 'severity_rule_saved', { category, function: fn, severity });
    res.json({ success: true });
}));

admin.delete('/severity-rules/:id', wrap(async (req, res) => {
    await pool.query('DELETE FROM setu.severity_rules WHERE id = $1', [Number(req.params.id)]);
    clearSeverityCache();
    res.json({ success: true });
}));

admin.get('/fields', wrap(async (req, res) => {
    const [defs, choices] = await Promise.all([
        pool.query('SELECT * FROM setu.field_definitions ORDER BY position, id'),
        pool.query('SELECT * FROM setu.field_choices ORDER BY position, id'),
    ]);
    res.json({ success: true, fields: defs.rows.map((d) => ({ ...d, choices: choices.rows.filter((c) => c.fieldId === d.id) })) });
}));

admin.patch('/fields/:id', wrap(async (req, res) => {
    const b = req.body ?? {};
    await pool.query('UPDATE setu.field_definitions SET label = COALESCE($2, label), required = COALESCE($3, required) WHERE id = $1',
        [Number(req.params.id), b.label ? String(b.label).slice(0, 100) : null, typeof b.required === 'boolean' ? b.required : null]);
    res.json({ success: true });
}));

/** Add choices (one per line); parentId adds Functions under a Category. */
admin.post('/fields/:id/choices', wrap(async (req, res) => {
    const fieldId = Number(req.params.id);
    const parentId = intOrNull(req.body?.parentId);
    const values = String(req.body?.values || '').split('\n').map((v) => v.trim()).filter(Boolean).slice(0, 500);
    if (!values.length) throw fail(400, 'Enter at least one value.');
    const existing = (await pool.query('SELECT value FROM setu.field_choices WHERE "fieldId" = $1 AND "parentId" IS NOT DISTINCT FROM $2', [fieldId, parentId])).rows.map((r) => r.value);
    const base = existing.length;
    let added = 0;
    for (const v of values) {
        if (existing.includes(v)) continue;
        await pool.query('INSERT INTO setu.field_choices ("fieldId", "parentId", value, position) VALUES ($1, $2, $3, $4)', [fieldId, parentId, v.slice(0, 300), base + added]);
        existing.push(v);
        added++;
    }
    res.json({ success: true, added });
}));

admin.patch('/choices/:id', wrap(async (req, res) => {
    const b = req.body ?? {};
    await pool.query('UPDATE setu.field_choices SET value = COALESCE($2, value), active = COALESCE($3, active) WHERE id = $1',
        [Number(req.params.id), b.value ? String(b.value).trim().slice(0, 300) : null, typeof b.active === 'boolean' ? b.active : null]);
    res.json({ success: true });
}));

admin.get('/business-hours', wrap(async (req, res) => {
    const bh = (await pool.query('SELECT * FROM setu.business_hours ORDER BY id LIMIT 1')).rows[0] ?? null;
    const holidays = bh ? (await pool.query(`SELECT id, to_char(date, 'YYYY-MM-DD') AS date, name FROM setu.holidays WHERE "businessHoursId" = $1 ORDER BY date`, [bh.id])).rows : [];
    res.json({ success: true, businessHours: bh, holidays });
}));

admin.put('/business-hours', wrap(async (req, res) => {
    const days = Array.isArray(req.body?.days) ? req.body.days : null;
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!days || days.some((d) => !Number.isInteger(d.day) || d.day < 0 || d.day > 6 || !hhmm.test(d.start) || !hhmm.test(d.end) || d.start >= d.end)) {
        throw fail(400, 'Each working day needs a start time before its end time.');
    }
    if (!days.length) throw fail(400, 'Keep at least one working day.');
    await pool.query('UPDATE setu.business_hours SET days = $1 WHERE id = (SELECT id FROM setu.business_hours ORDER BY id LIMIT 1)', [JSON.stringify(days)]);
    clearCalendarCache();
    await audit(req.verifiedEmail, 'business_hours_saved', { days });
    res.json({ success: true });
}));

admin.post('/holidays', wrap(async (req, res) => {
    const date = String(req.body?.date || '');
    const name = String(req.body?.name || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) throw fail(400, 'Date and name are needed.');
    await pool.query(
        `INSERT INTO setu.holidays ("businessHoursId", date, name) VALUES ((SELECT id FROM setu.business_hours ORDER BY id LIMIT 1), $1, $2)
         ON CONFLICT ("businessHoursId", date) DO UPDATE SET name = EXCLUDED.name`,
        [date, name.slice(0, 100)],
    );
    clearCalendarCache();
    res.json({ success: true });
}));

admin.delete('/holidays/:id', wrap(async (req, res) => {
    await pool.query('DELETE FROM setu.holidays WHERE id = $1', [Number(req.params.id)]);
    clearCalendarCache();
    res.json({ success: true });
}));

admin.get('/automations', wrap(async (req, res) => {
    res.json({ success: true, rules: (await pool.query('SELECT * FROM setu.automation_rules ORDER BY trigger, position, id')).rows });
}));

admin.patch('/automations/:id', wrap(async (req, res) => {
    if (typeof req.body?.active !== 'boolean') throw fail(400, 'Send active: true or false.');
    await pool.query('UPDATE setu.automation_rules SET active = $2 WHERE id = $1', [Number(req.params.id), req.body.active]);
    await audit(req.verifiedEmail, 'automation_toggled', { id: Number(req.params.id), active: req.body.active });
    res.json({ success: true });
}));

admin.get('/audit', wrap(async (req, res) => {
    res.json({ success: true, events: (await pool.query('SELECT * FROM setu.audit_events ORDER BY "createdAt" DESC LIMIT 200')).rows });
}));

admin.get('/parked-mail', wrap(async (req, res) => {
    res.json({ success: true, items: (await pool.query('SELECT * FROM setu.parked_mail ORDER BY "receivedAt" DESC LIMIT 200')).rows });
}));

module.exports = admin;
