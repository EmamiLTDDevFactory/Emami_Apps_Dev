'use strict';
/*
   Loads setu-mock-data.json (Emami's real Setu configuration + 30 anonymised sample tickets) into Setu.

     node load-mock.js load <path/to/setu-mock-data.json>
     node load-mock.js remove            sample tickets (tag "mock") and their sample contacts only
     node load-mock.js restore-config    put back the configuration saved just before the last load

   Safe by design:
   - Writes only to Setu's own `setu` schema, directly (no Setu business logic runs, so no notifications, emails or
     automations). Manage Access and every other app are untouched.
   - One transaction: either everything loads or nothing changes.
   - Before replacing configuration (statuses, field choices, severity matrix, groups, SLA, business hours, canned
     replies) the current values are saved in setu.settings 'mock.configBackup' for restore-config.
   - Sample people use @example.com addresses and 90000... numbers; tickets are tagged "mock".
*/
const fs = require('fs');

const APP = process.env.SETU_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool } = require(`${APP}/db`);

const MIN = 60_000;
// Export field name -> Setu field-definition key / ticket column
const KEY = {
  cf_call_subject: 'callSubject', cf_region: 'region', cf_distributor_code: 'distributorCode', cf_distributor_name: 'distributorName',
  cf_sales_org669095: 'salesOrg', cf_state: 'state', cf_depot: 'depot', cf_asm_name: 'asmName', cf_depot_coordinator: 'depotCoordinator',
  cf_mr_uid: 'mrUid', cf_mobile_no: 'mobileNo', cf_alternate_mobile_no: 'alternateMobileNo', cf_caller_name: 'callerName',
  cf_caller_contact_number: 'callerContactNumber', ticket_type: 'type', cf_category: 'category', cf_internal_agent: 'l2Agent',
  cf_helpdesk_analysis: 'helpdeskAnalysis', cf_rcasolution_provides: 'rcaSolution',
};
const SOURCE = { 1: 'Email', 2: 'Portal', 3: 'Phone', 7: 'Chat', 9: 'Portal', 10: 'Email', 13: 'WhatsApp' };
const DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const SEVERITIES = ['FATAL', 'SERIOUS', 'NORMAL'];
const hhmm = (t) => {
  const m = String(t).match(/(\d+):(\d+)(?::\d+)?\s*(am|pm)/i);
  if (!m) return String(t).slice(0, 5);
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};
/** SLA time from the export: ISO 8601 duration ("PT6H6M", "P1DT2H") or a number of seconds -> whole minutes. */
function toMinutes(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.max(1, Math.round(v / 60));
  const m = String(v).match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m || !m.slice(1).some(Boolean)) throw new Error(`Unreadable SLA time "${v}"`);
  const [d, h, mi, sec] = m.slice(1).map((x) => Number(x || 0));
  return Math.max(1, Math.round(d * 1440 + h * 60 + mi + sec / 60));
}
const at = (minutesAgo) => (minutesAgo === null || minutesAgo === undefined ? null : new Date(Date.now() - minutesAgo * MIN));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (s) => String(s ?? '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

async function snapshot(c) {
  const q = async (sql) => (await c.query(sql)).rows;
  return {
    savedAt: new Date().toISOString(),
    statuses: await q('SELECT * FROM setu.ticket_statuses'),
    fieldDefinitions: await q('SELECT * FROM setu.field_definitions'),
    fieldChoices: await q('SELECT * FROM setu.field_choices ORDER BY id'),
    severityRules: await q('SELECT category, "function", severity FROM setu.severity_rules'),
    groups: await q('SELECT name, assignment FROM setu.groups'),
    slaTargets: await q('SELECT p.name AS policy, t.priority, t."firstResponseMins", t."nextResponseMins", t."resolutionMins", t."businessHours", t.escalate FROM setu.sla_targets t JOIN setu.sla_policies p ON p.id = t."policyId"'),
    businessHours: await q('SELECT name, days FROM setu.business_hours'),
    canned: await q('SELECT folder, title, "shortCode", body FROM setu.canned_responses'),
  };
}

async function load(file) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const existing = await c.query(`SELECT count(*)::int AS n FROM setu.tickets WHERE 'mock' = ANY(tags)`);
    if (existing.rows[0].n > 0) throw new Error(`Sample data is already loaded (${existing.rows[0].n} tickets tagged "mock"). Run "remove" first.`);

    // Save the configuration being replaced (kept from the first load, so restore-config returns to the original)
    const prior = await c.query(`SELECT 1 FROM setu.settings WHERE key = 'mock.configBackup'`);
    if (!prior.rows.length) {
      await c.query(`INSERT INTO setu.settings (key, value) VALUES ('mock.configBackup', $1)`, [JSON.stringify(await snapshot(c))]);
    }

    // Statuses
    const status = m.fields.find((f) => f.fdName === 'status');
    for (const [i, s] of (status ? status.choices : []).entries()) {
      await c.query(
        `INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "pausesSla" = EXCLUDED."pausesSla", "isResolved" = EXCLUDED."isResolved",
           "isClosed" = EXCLUDED."isClosed", position = EXCLUDED.position`,
        [s.id, String(s.label).slice(0, 200), s.pausesSla ?? s.id !== 2, [4, 5].includes(s.id), s.id === 5, i],
      );
    }

    // Field definitions and their choices
    let fields = 0;
    let choices = 0;
    for (const [pos, f] of m.fields.entries()) {
      const key = KEY[f.fdName];
      if (!key) continue;
      const type = f.tree ? 'nested' : f.choices ? 'dropdown' : /paragraph/.test(f.type) ? 'paragraph' : 'text';
      const def = await c.query(
        `INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, type = EXCLUDED.type, required = EXCLUDED.required, position = EXCLUDED.position
         RETURNING id`,
        [key, String(f.label).slice(0, 100), type, Boolean(f.required), pos],
      );
      const fieldId = def.rows[0].id;
      fields++;
      if (!f.tree && !f.choices) continue;
      await c.query('DELETE FROM setu.field_choices WHERE "fieldId" = $1', [fieldId]);
      if (f.tree) {
        let p = 0;
        for (const [parent, kids] of Object.entries(f.tree)) {
          const row = await c.query('INSERT INTO setu.field_choices ("fieldId", value, position) VALUES ($1, $2, $3) RETURNING id', [fieldId, parent, p++]);
          choices++;
          for (const [i, kid] of (kids || []).entries()) {
            await c.query('INSERT INTO setu.field_choices ("fieldId", "parentId", value, position) VALUES ($1, $2, $3, $4)', [fieldId, row.rows[0].id, kid, i]);
            choices++;
          }
        }
      } else {
        for (const [i, v] of f.choices.entries()) {
          await c.query('INSERT INTO setu.field_choices ("fieldId", value, position) VALUES ($1, $2, $3)', [fieldId, String(typeof v === 'object' ? v.label : v), i]);
          choices++;
        }
      }
    }

    // Severity matrix
    let rules = 0;
    for (const s of m.severityMatrix) {
      const sev = String(s.severity || '').toUpperCase();
      if (!SEVERITIES.includes(sev) || !s.category) continue;
      await c.query(
        `INSERT INTO setu.severity_rules (category, "function", severity) VALUES ($1, $2, $3)
         ON CONFLICT (category, "function") DO UPDATE SET severity = EXCLUDED.severity`,
        [s.category, s.function || '*', sev],
      );
      rules++;
    }

    // Groups, SLA policies and targets
    const groupIds = {};
    for (const g of m.groups) {
      const r = await c.query(
        `INSERT INTO setu.groups (name, assignment) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET assignment = EXCLUDED.assignment RETURNING id`,
        [g.name, g.assignment === 'ROUND_ROBIN' ? 'ROUND_ROBIN' : 'MANUAL'],
      );
      groupIds[g.name] = r.rows[0].id;
    }
    for (const [pos, p] of m.slaPolicies.entries()) {
      const r = await c.query(
        `INSERT INTO setu.sla_policies (name, "isDefault", position) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET "isDefault" = EXCLUDED."isDefault", position = EXCLUDED.position RETURNING id`,
        [p.name, Boolean(p.isDefault), pos],
      );
      const policyId = r.rows[0].id;
      for (const [k, t] of Object.entries(p.targets)) {
        const priority = Number(String(k).replace('priority_', ''));
        if (!(priority >= 1 && priority <= 4)) continue;
        await c.query(
          `INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours", escalate)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT ("policyId", priority) DO UPDATE SET "firstResponseMins" = EXCLUDED."firstResponseMins", "nextResponseMins" = EXCLUDED."nextResponseMins",
             "resolutionMins" = EXCLUDED."resolutionMins", "businessHours" = EXCLUDED."businessHours", escalate = EXCLUDED.escalate`,
          [policyId, priority, toMinutes(t.firstResponseSecs), toMinutes(t.nextResponseSecs), toMinutes(t.resolutionSecs), Boolean(t.businessHours), t.escalation !== false],
        );
      }
      for (const g of p.groups) {
        if (groupIds[g]) await c.query('INSERT INTO setu.sla_policy_groups ("policyId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [policyId, groupIds[g]]);
      }
    }

    // Business hours and holidays
    const days = Object.entries(m.businessHours.hours || {}).filter(([d]) => d in DAYS).map(([d, v]) => ({ day: DAYS[d], start: hhmm(v.start_time), end: hhmm(v.end_time) }));
    if (days.length) {
      await c.query(
        `INSERT INTO setu.business_hours (name, timezone, days) VALUES ('Default', 'Asia/Kolkata', $1)
         ON CONFLICT (name) DO UPDATE SET days = EXCLUDED.days`, [JSON.stringify(days)],
      );
    }
    const bh = (await c.query(`SELECT id FROM setu.business_hours WHERE name = 'Default'`)).rows[0];
    for (const h of m.businessHours.holidays || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(h.date))) continue;
      await c.query(`INSERT INTO setu.holidays ("businessHoursId", date, name) VALUES ($1, $2, $3) ON CONFLICT ("businessHoursId", date) DO UPDATE SET name = EXCLUDED.name`, [bh.id, h.date, h.name]);
    }

    // Canned replies (update by folder + title; a short code already in use is left off)
    for (const cr of m.cannedResponses) {
      const body = html(cr.body);
      const found = await c.query('SELECT id FROM setu.canned_responses WHERE folder = $1 AND title = $2', [cr.folder || 'General', cr.title]);
      if (found.rows.length) {
        await c.query('UPDATE setu.canned_responses SET body = $2, "updatedAt" = now() WHERE id = $1', [found.rows[0].id, body]);
        continue;
      }
      const code = cr.shortCode ? String(cr.shortCode).replace(/^\//, '').toLowerCase().slice(0, 30) : null;
      const taken = code ? (await c.query('SELECT 1 FROM setu.canned_responses WHERE "shortCode" = $1', [code])).rows.length > 0 : false;
      await c.query('INSERT INTO setu.canned_responses (folder, title, "shortCode", body) VALUES ($1, $2, $3, $4)', [cr.folder || 'General', cr.title, taken ? null : code, body]);
    }

    // Sample tickets (tag "mock")
    const sev = new Map((await c.query('SELECT category, "function", severity FROM setu.severity_rules')).rows.map((r) => [`${r.category}\u0000${r.function}`, r.severity]));
    const severityOf = (cat, fn) => (cat ? sev.get(`${cat}\u0000${fn ?? ''}`) ?? sev.get(`${cat}\u0000*`) ?? 'NORMAL' : 'NORMAL');
    const validStatus = new Set((await c.query('SELECT id FROM setu.ticket_statuses')).rows.map((r) => r.id));
    let tickets = 0;
    for (const s of m.sampleTickets) {
      const contact = await c.query(
        `INSERT INTO setu.contacts (name, email, mobile) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [s.requester.name, String(s.requester.email).toLowerCase(), s.requester.mobile],
      );
      const createdAt = at(s.createdMinutesAgo);
      const due = (mins) => (mins === null || mins === undefined ? null : new Date(Date.now() + mins * MIN));
      const t = await c.query(
        `INSERT INTO setu.tickets (subject, description, "requesterId", "statusId", priority, severity, source, type, "groupId", tags,
            category, "function", region, "salesOrg", state, depot, "asmName", "depotCoordinator", "l2Agent", "distributorCode", "distributorName",
            "mobileNo", "helpdeskAnalysis", "rcaSolution", "createdAt", "updatedAt", "statusChangedAt", "firstResponseDueAt", "resolutionDueAt",
            "firstRespondedAt", "resolvedAt", "closedAt", "frViolated", "resViolated")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
         RETURNING id`,
        [String(s.subject).slice(0, 500), html(s.description), contact.rows[0].id, validStatus.has(s.statusId) ? s.statusId : 2,
          s.priority >= 1 && s.priority <= 4 ? s.priority : 1, severityOf(s.category, s.function), SOURCE[s.source] || 'Email', s.type,
          s.groupName ? groupIds[s.groupName] ?? null : null, ['mock'], s.category, s.function, s.region, s.salesOrg, s.state, s.depot,
          s.asmName, s.depotCoordinator, s.l2Agent, s.distributorCode, s.distributorName, s.requester.mobile, s.helpdeskAnalysis, s.rcaSolution,
          createdAt, at(s.updatedMinutesAgo) || createdAt, at(s.updatedMinutesAgo) || createdAt, due(s.firstResponseDueInMinutes), due(s.resolutionDueInMinutes),
          at(s.firstRespondedMinutesAgo), at(s.resolvedMinutesAgo), at(s.closedMinutesAgo), Boolean(s.frViolated), Boolean(s.resViolated)],
      );
      const id = t.rows[0].id;
      await c.query(
        `INSERT INTO setu.conversations ("ticketId", kind, "bodyHtml", "bodyText", "fromEmail", "messageId", "createdAt") VALUES ($1, 'INCOMING', $2, $3, $4, $5, $6)`,
        [id, html(s.description), s.description, String(s.requester.email).toLowerCase(), `mock-${s.sample}-in`, createdAt],
      );
      await c.query(`INSERT INTO setu.activities ("ticketId", action, details, "createdAt") VALUES ($1, 'created', $2, $3)`, [id, JSON.stringify({ source: SOURCE[s.source] || 'Email', sample: true }), createdAt]);
      if (s.firstRespondedMinutesAgo !== null && s.firstRespondedMinutesAgo !== undefined) {
        const text = 'Thank you for reaching out. We are looking into this and will update you shortly.';
        await c.query(
          `INSERT INTO setu.conversations ("ticketId", kind, "bodyHtml", "bodyText", "toEmails", "messageId", "createdAt") VALUES ($1, 'REPLY', $2, $3, $4, $5, $6)`,
          [id, html(text), text, [String(s.requester.email).toLowerCase()], `mock-${s.sample}-reply`, at(s.firstRespondedMinutesAgo)],
        );
      }
      tickets++;
    }
    await c.query(`DELETE FROM setu.ai_insights WHERE key = 'dashboard'`);
    await c.query('COMMIT');
    console.log(`Loaded: ${tickets} sample tickets (tag "mock"), ${fields} fields with ${choices} choices, ${rules} severity rules, ${m.groups.length} groups, ${m.slaPolicies.length} SLA policies, ${m.cannedResponses.length} canned replies.`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function remove() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const t = await c.query(`DELETE FROM setu.tickets WHERE 'mock' = ANY(tags) RETURNING id`); // conversations, activities cascade
    const k = await c.query(`DELETE FROM setu.contacts x WHERE x.email LIKE '%@example.com' AND NOT EXISTS (SELECT 1 FROM setu.tickets y WHERE y."requesterId" = x.id)`);
    await c.query(`DELETE FROM setu.ai_insights WHERE key = 'dashboard' OR key = ANY($1)`, [t.rows.map((r) => `ticket:${r.id}`)]);
    await c.query('COMMIT');
    console.log(`Removed ${t.rowCount} sample tickets and ${k.rowCount} sample contacts. Configuration kept (use restore-config to undo it).`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function restoreConfig() {
  const c = await pool.connect();
  try {
    const row = (await c.query(`SELECT value FROM setu.settings WHERE key = 'mock.configBackup'`)).rows[0];
    if (!row) throw new Error('No saved configuration found (nothing was replaced, or it was already restored).');
    const b = row.value;
    await c.query('BEGIN');
    for (const s of b.statuses) {
      await c.query(
        `INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "pausesSla" = EXCLUDED."pausesSla", "isResolved" = EXCLUDED."isResolved", "isClosed" = EXCLUDED."isClosed", position = EXCLUDED.position`,
        [s.id, s.name, s.pausesSla, s.isResolved, s.isClosed, s.position],
      );
    }
    // Statuses the load added are removed unless a ticket still uses them
    await c.query(`DELETE FROM setu.ticket_statuses s WHERE s.id <> ALL($1::int[]) AND NOT EXISTS (SELECT 1 FROM setu.tickets t WHERE t."statusId" = s.id)`, [b.statuses.map((s) => s.id)]);
    for (const d of b.fieldDefinitions) {
      await c.query('UPDATE setu.field_definitions SET label = $2, type = $3, required = $4, position = $5 WHERE key = $1', [d.key, d.label, d.type, d.required, d.position]);
    }
    await c.query('DELETE FROM setu.field_choices');
    const idMap = new Map();
    for (const ch of b.fieldChoices.filter((x) => x.parentId === null)) {
      const r = await c.query('INSERT INTO setu.field_choices ("fieldId", value, position, active) VALUES ($1,$2,$3,$4) RETURNING id', [ch.fieldId, ch.value, ch.position, ch.active]);
      idMap.set(ch.id, r.rows[0].id);
    }
    for (const ch of b.fieldChoices.filter((x) => x.parentId !== null)) {
      await c.query('INSERT INTO setu.field_choices ("fieldId", "parentId", value, position, active) VALUES ($1,$2,$3,$4,$5)', [ch.fieldId, idMap.get(ch.parentId) ?? null, ch.value, ch.position, ch.active]);
    }
    await c.query('DELETE FROM setu.severity_rules');
    for (const r of b.severityRules) await c.query('INSERT INTO setu.severity_rules (category, "function", severity) VALUES ($1,$2,$3)', [r.category, r.function, r.severity]);
    for (const g of b.groups) await c.query('UPDATE setu.groups SET assignment = $2 WHERE name = $1', [g.name, g.assignment]);
    for (const t of b.slaTargets) {
      await c.query(
        `UPDATE setu.sla_targets t SET "firstResponseMins" = $3, "nextResponseMins" = $4, "resolutionMins" = $5, "businessHours" = $6, escalate = $7
         FROM setu.sla_policies p WHERE p.id = t."policyId" AND p.name = $1 AND t.priority = $2`,
        [t.policy, t.priority, t.firstResponseMins, t.nextResponseMins, t.resolutionMins, t.businessHours, t.escalate],
      );
    }
    for (const h of b.businessHours) await c.query('UPDATE setu.business_hours SET days = $2 WHERE name = $1', [h.name, JSON.stringify(h.days)]);
    await c.query('DELETE FROM setu.canned_responses');
    for (const cr of b.canned) await c.query('INSERT INTO setu.canned_responses (folder, title, "shortCode", body) VALUES ($1,$2,$3,$4)', [cr.folder, cr.title, cr.shortCode, cr.body]);
    await c.query(`DELETE FROM setu.settings WHERE key = 'mock.configBackup'`);
    await c.query('COMMIT');
    console.log(`Configuration restored to how it was on ${b.savedAt}.`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const [cmd, file] = process.argv.slice(2);
const run = cmd === 'load' ? load(file || `${__dirname}/setu-mock-data.json`) : cmd === 'remove' ? remove() : cmd === 'restore-config' ? restoreConfig() : Promise.reject(new Error('usage: node load-mock.js load <file> | remove | restore-config'));
run
  .catch((e) => { console.error('ERROR (nothing was changed):', e.message); process.exitCode = 1; })
  .finally(() => pool.end().then(() => process.exit()));
