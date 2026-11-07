'use strict';
/*
   Loads the PulseDesk extract (Freshdesk replica of emamisupport.freshdesk.com) into Samadhan on the dev backend server.
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-pulsedesk      (the data file: ~/samadhan-demo/pulsedesk-data.json,
   made on a PC with extract-pulsedesk.js from the PulseDesk folder; it is not committed).

   Two parts:
   1. Configuration (kept - it is the real Freshdesk set-up): choice values missing from Samadhan's lists (categories ->
      functions, region, sales org, state, depot, ASM, depot co-ordinator, L2 agent, type). Only missing values are
      added; nothing is renamed or removed.
   2. Ticket history (DEMO - removed by "run.sh remove"): ~1,250 tickets over 30 days with conversations, time logs,
      calls, CSAT answers and parent / child links, plus the knowledge-base articles and companies. PulseDesk's
      requesters are fictional; here they also get @demo.samadhan.local addresses and +91 90000 numbers so nothing can
      email or dial a real person, and the agents are created as "<name> (demo)" outside every group (round robin never
      picks them). Every ticket is tagged demo + pulsedesk.

   Safe by design: one transaction (all or nothing), no automations, no emails, no hub notifications, the running
   backend is not restarted. SLA reminder / breach flags are set on the history so the scheduled checks stay quiet.
*/
const fs = require('fs');
const path = require('path');
const APP = process.env.SAMADHAN_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);

const DATA = process.argv[2] || path.join(__dirname, 'pulsedesk-data.json');
const DOMAIN = 'demo.samadhan.local';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const html = (text) => esc(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
const SOURCE = { 1: 'Email', 2: 'Portal', 3: 'Phone', 13: 'WhatsApp', 7: 'Chat' };
const SEVERITY = { Fatal: 'FATAL', Serious: 'SERIOUS', Normal: 'NORMAL' };
const AVAIL = { Available: 'AVAILABLE', Unavailable: 'UNAVAILABLE', Meeting: 'MEETING', Break: 'BREAK', Training: 'TRAINING', Lunch: 'LUNCH' };
const OUTCOME = { completed: 'Connected', missed: 'No answer', voicemail: 'No answer', abandoned: 'Call back later' };
const CSAT = { 103: 3, 100: 2, '-103': 1 };

async function main() {
  await resolveSchema();
  const { config, db } = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const client = await pool.connect();
  const added = { choices: 0 };
  try {
    const already = await client.query(`SELECT count(*)::int AS n FROM samadhan.tickets WHERE 'pulsedesk' = ANY(tags)`);
    if (already.rows[0].n) { console.log(`PulseDesk data is already loaded (${already.rows[0].n} tickets). Run "remove" first to reload.`); return; }
    await client.query('BEGIN');

    // ---- 1. Configuration: missing choice values only (kept) ----
    const fieldId = async (key) => (await client.query('SELECT id FROM samadhan.field_definitions WHERE key = $1', [key])).rows[0]?.id;
    const addChoice = async (fid, value, parentId = null) => {
      const found = await client.query(
        'SELECT id FROM samadhan.field_choices WHERE "fieldId" = $1 AND lower(value) = lower($2) AND "parentId" IS NOT DISTINCT FROM $3',
        [fid, value, parentId],
      );
      if (found.rows.length) return found.rows[0].id;
      const { rows } = await client.query(
        `INSERT INTO samadhan.field_choices ("fieldId", "parentId", value, position)
         VALUES ($1, $2, $3, (SELECT coalesce(max(position), 0) + 1 FROM samadhan.field_choices WHERE "fieldId" = $1)) RETURNING id`,
        [fid, parentId, value],
      );
      added.choices++;
      return rows[0].id;
    };
    const cat = await fieldId('category');
    for (const [category, fns] of Object.entries(config.CATEGORY_TREE)) {
      const id = await addChoice(cat, category);
      for (const fn of fns) await addChoice(cat, fn, id);
    }
    for (const [key, list] of Object.entries({
      region: config.REGIONS, salesOrg: config.SALES_ORGS, state: config.STATES, depot: config.DEPOTS, asmName: config.ASM_NAMES,
      depotCoordinator: config.DEPOT_COORDINATORS, l2Agent: config.L2_AGENTS, type: config.TICKET_TYPES,
    })) {
      const fid = await fieldId(key);
      if (fid) for (const v of list) await addChoice(fid, v);
    }

    // ---- 2. Demo history ----
    const manifest = { agentIds: [], contactIds: [], companyIds: [], articleIds: [] };
    const groups = Object.fromEntries((await client.query('SELECT id, name FROM samadhan.groups')).rows.map((g) => [g.name, g.id]));
    const groupId = { 'g-cs': groups['Customer Support'] ?? null, 'g-l2': groups['L2 Support'] ?? null };

    const agentId = {};
    for (const a of db.agents) {
      const { rows } = await client.query(
        `INSERT INTO samadhan.agents (email, name, role, availability) VALUES ($1, $2, 'Agent', $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [`${slug(a.name)}.pd@${DOMAIN}`, `${a.name} (demo)`, AVAIL[a.availability] ?? 'UNAVAILABLE'],
      );
      agentId[a.id] = rows[0].id;
      manifest.agentIds.push(rows[0].id);
    }

    const companyId = {};
    for (const c of db.companies) {
      const ins = await client.query(
        'INSERT INTO samadhan.companies (name, description, domains) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING RETURNING id',
        [c.name, [c.industry, c.accountTier].filter(Boolean).join(' · ') || null, []],
      );
      if (ins.rows.length) { companyId[c.id] = ins.rows[0].id; manifest.companyIds.push(ins.rows[0].id); } else {
        companyId[c.id] = (await client.query('SELECT id FROM samadhan.companies WHERE name = $1', [c.name])).rows[0].id;
      }
    }

    const contactId = {};
    const contactEmail = {};
    const contactPhone = {};
    for (const [i, c] of db.contacts.entries()) {
      const email = `${slug(c.name.split(' - ')[0])}.${i + 1}@${DOMAIN}`;
      const phone = `+91 90000 ${String(10000 + i).slice(-5)}`;
      const { rows } = await client.query(
        `INSERT INTO samadhan.contacts (name, email, mobile, phone, "companyId", "createdAt") VALUES ($1, $2, $3, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [c.name, email, phone, companyId[c.companyId] ?? null, c.createdAt],
      );
      contactId[c.id] = rows[0].id;
      contactEmail[c.id] = email;
      contactPhone[c.id] = phone;
      manifest.contactIds.push(rows[0].id);
    }

    // Tickets get fresh Samadhan numbers; PulseDesk numbers inside texts are rewritten to match.
    const statuses = new Set((await client.query('SELECT id FROM samadhan.ticket_statuses')).rows.map((r) => r.id));
    const ticketId = {};
    for (const t of db.tickets) ticketId[t.id] = (await client.query(`SELECT nextval('samadhan.ticket_id_seq')::int AS id`)).rows[0].id;
    const renumber = (s) => String(s ?? '').replace(/\b(7[7-9]\d{3})\b/g, (m) => (ticketId[Number(m)] ? String(ticketId[Number(m)]) : m));
    const now = Date.now();
    for (const t of db.tickets) {
      const sla = t.sla;
      const statusId = statuses.has(t.status) ? t.status : 2;
      const assigned = t.agentId ? agentId[t.agentId] : null;
      const lastAt = t.requesterRespondedAt && t.requesterRespondedAt > t.updatedAt ? t.requesterRespondedAt : t.updatedAt;
      const lastKind = t.requesterRespondedAt && t.requesterRespondedAt >= t.updatedAt ? 'requester_reply'
        : [4, 5].includes(t.status) || t.status !== 2 ? 'status' : t.agentRespondedAt ? 'agent_reply' : 'created';
      const frViolated = Boolean(sla.firstRespondedAt ? sla.firstRespondedAt > sla.frDueBy : new Date(sla.frDueBy).getTime() < now);
      const resViolated = Boolean(sla.resolvedAt ? sla.resolvedAt > sla.resolutionDueBy : ![4, 5].includes(t.status) && new Date(sla.resolutionDueBy).getTime() < now);
      const row = {
        id: ticketId[t.id], subject: renumber(t.subject).slice(0, 500), description: html(renumber(t.description)), requesterId: contactId[t.requesterId],
        companyId: companyId[t.companyId] ?? null, statusId, priority: t.priority, severity: SEVERITY[t.businessImpact] ?? 'NORMAL',
        source: SOURCE[t.source] ?? 'Email', type: t.type || null,
        // Unassigned history tickets get no group, so the SLA checks never notify the real Customer Support team about them.
        groupId: assigned ? groupId[t.groupId] ?? null : null, agentId: assigned,
        tags: [...new Set([...(t.tags ?? []), 'demo', 'pulsedesk'])], callSubject: t.callSubject || null, region: t.region || null,
        distributorCode: t.distributorCode || null, distributorName: t.distributorName || null, salesOrg: t.salesOrg || null, state: t.state || null,
        depot: t.depot || null, asmName: t.asmName || null, depotCoordinator: t.depotCoordinator || null, mrUid: t.mrUid || null,
        mobileNo: contactPhone[t.requesterId].replace(/\D/g, '').slice(-10), callerName: t.callerName || null,
        callerContactNumber: t.callerContact ? contactPhone[t.requesterId] : null, category: t.category || null, function: t.fn || null,
        l2Agent: t.l2Agent || null, helpdeskAnalysis: t.helpdeskAnalysis ? html(t.helpdeskAnalysis) : null, rcaSolution: t.rcaSolution || null,
        firstResponseDueAt: sla.frDueBy, resolutionDueAt: sla.resolutionDueBy, firstRespondedAt: sla.firstRespondedAt ?? null,
        resolvedAt: sla.resolvedAt ?? null, closedAt: sla.closedAt ?? null, statusChangedAt: t.statusUpdatedAt, slaPausedAt: sla.pausedAt ?? null,
        frReminded: true, resReminded: true, frViolated, resViolated, createdAt: t.createdAt, updatedAt: t.updatedAt,
        lastActivityAt: lastAt, lastActivityKind: lastKind, lastActivityBy: lastKind === 'requester_reply' ? db.contacts.find((c) => c.id === t.requesterId)?.name ?? null : null,
        lastActivityDetail: null,
      };
      const keys = Object.keys(row);
      await client.query(
        `INSERT INTO samadhan.tickets (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
        keys.map((k) => row[k]),
      );
      await client.query(
        `INSERT INTO samadhan.activities ("ticketId", action, details, "createdAt") VALUES ($1, 'created', $2, $3)`,
        [row.id, JSON.stringify({ source: row.source, severity: row.severity, imported: 'PulseDesk' }), t.createdAt],
      );
    }
    for (const t of db.tickets) {
      if (t.parentId && ticketId[t.parentId]) await client.query('UPDATE samadhan.tickets SET "parentId" = $2 WHERE id = $1', [ticketId[t.id], ticketId[t.parentId]]);
    }

    let conversations = 0;
    for (const c of db.conversations) {
      const tid = ticketId[c.ticketId];
      if (!tid || c.kind === 'system') continue;
      const kind = { incoming: 'INCOMING', reply: 'REPLY', note: 'NOTE', forward: 'FORWARD' }[c.kind];
      if (!kind) continue;
      const body = renumber(c.body);
      const requester = kind === 'INCOMING';
      await client.query(
        `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "fromEmail", "toEmails", "agentId", channel, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'email', $8)`,
        [tid, kind, html(body), body, requester ? contactEmail[c.authorId] ?? null : null, kind === 'REPLY' ? [contactEmail[db.tickets.find((x) => x.id === c.ticketId)?.requesterId]].filter(Boolean) : [],
          requester ? null : agentId[c.authorId] ?? null, c.createdAt],
      );
      conversations++;
    }

    let timeLogs = 0;
    for (const e of db.timeEntries) {
      if (!ticketId[e.ticketId] || !agentId[e.agentId]) continue;
      await client.query('INSERT INTO samadhan.time_logs ("ticketId", "agentId", minutes, note, "createdAt") VALUES ($1, $2, $3, $4, $5)',
        [ticketId[e.ticketId], agentId[e.agentId], e.minutes, e.note || null, e.date]);
      timeLogs++;
    }

    let calls = 0;
    for (const c of db.calls) {
      if (!c.ticketId || !ticketId[c.ticketId] || !c.agentId || !agentId[c.agentId]) continue;
      await client.query(
        `INSERT INTO samadhan.call_logs ("ticketId", "agentId", phone, direction, outcome, "durationSecs", notes, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ticketId[c.ticketId], agentId[c.agentId], contactPhone[c.contactId] ?? '+91 90000 00000', c.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
          OUTCOME[c.status] ?? 'Connected', Math.min(86400, c.durationSec || 0), [c.queue, c.disposition].filter(Boolean).join(' · ') || null, c.startedAt],
      );
      calls++;
    }

    let csat = 0;
    for (const t of db.tickets) {
      if (!t.csat) continue;
      const tid = ticketId[t.id];
      await client.query(`INSERT INTO samadhan.csat_requests ("ticketId", token, "sentAt", "answeredAt") VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [tid, `pulsedesk-${tid}-${Math.random().toString(36).slice(2, 12)}`, t.sla.closedAt ?? t.csat.at, t.csat.at]);
      await client.query('INSERT INTO samadhan.csat_responses ("ticketId", rating, comment, "agentId", "createdAt") VALUES ($1, $2, $3, $4, $5)',
        [tid, CSAT[t.csat.rating] ?? 2, t.csat.comment || null, t.agentId ? agentId[t.agentId] : null, t.csat.at]);
      csat++;
    }

    for (const a of db.articles) {
      const { rows } = await client.query(
        `INSERT INTO samadhan.articles (category, folder, title, body, status, tags, views, helpful, "notHelpful", "authorAgentId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) ON CONFLICT (title) DO NOTHING RETURNING id`,
        [a.category, a.folder, a.title, a.body, a.status === 'published' ? 'published' : 'draft', a.tags ?? [], a.views, a.helpful, a.notHelpful, agentId[a.authorId] ?? null, a.updatedAt],
      );
      if (rows.length) manifest.articleIds.push(rows[0].id);
    }

    await client.query(`INSERT INTO samadhan.settings (key, value) VALUES ('pulsedesk.manifest', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(manifest)]);
    await client.query('COMMIT');
    console.log(`Configuration: ${added.choices} missing choice values added (kept).`);
    console.log(`Demo history: ${db.tickets.length} tickets, ${conversations} conversations, ${timeLogs} time logs, ${calls} calls, ${csat} CSAT answers, `
      + `${manifest.contactIds.length} requesters, ${manifest.agentIds.length} demo agents, ${manifest.companyIds.length} companies, ${manifest.articleIds.length} articles.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => { console.error('ERROR (nothing was loaded):', e.message); process.exitCode = 1; })
  .finally(() => new Promise((r) => setTimeout(r, 500)).then(() => sharedPool.end()).then(() => process.exit()));
