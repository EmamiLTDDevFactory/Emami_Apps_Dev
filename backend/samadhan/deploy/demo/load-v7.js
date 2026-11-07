'use strict';
/*
   v7 demo data (Phase 2) on the dev backend server: recent activity for the dashboards, reports and insights, plus
   examples for the Authorization cockpit, data scope, saved views and report variants.
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7      (remove with:  bash ~/samadhan-demo/run.sh remove)

   Safe by design (same rules as load-demo.js):
   - Writes only to Samadhan's own schema. Manage Access and every other app are untouched; the demo people exist only
     inside Samadhan (@demo.samadhan.local - an address that can never receive mail).
   - The access of real people is NOT changed: cockpit examples are given to demo agents only.
   - Tickets are tagged `demo` and `demo-v7`; groups, field choices, severity rules and report variants it adds are
     recorded in samadhan.settings 'demo.v7.manifest' so remove-demo.js deletes exactly those.
   - No notifications and no mail (hub inbox and email notifier switched off inside this process, requester mail off).
   - Deterministic: the same data every run (a fixed random seed); refuses to run twice.

   What it adds:
   - 4 groups (SAP Functional, SAP Basis & Security, Infrastructure, Digital Apps) with categories + functions for them,
     a Supervisor and 5 specialist agents (one is the "Auditor" example).
   - ~90 tickets over the last 14 days (some today), worked like real ones: replies, notes, requester follow-ups,
     escalations, resolved / closed with RCA, CSAT ratings, time logs, watchers, linked tickets, overdue ones - so the
     dashboards, analytics, daily report, AI insights and action points have current numbers to show.
   - Cockpit: profile assignments (permanent, expiring soon, already expired), data scopes (groups / own), grant and
     deny overrides with end dates, an SoD warning accepted with a reason, permission usage (some unused > 90 days),
     and the matching change log.
   - Shared saved views and report variants; personal to-dos for the demo agents.
*/
const APP = process.env.SAMADHAN_APP_DIR || process.env.SETU_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
require(`${APP}/notifications`).notify = async () => null;
const { createTicket, updateTicket, addAgentMessage, addRequesterReply } = require(`${APP}/samadhan/lib/tickets`);
const { logActivity, textToHtml } = require(`${APP}/samadhan/lib/util`);
const { saveUserAccess } = require(`${APP}/samadhan/lib/authz`);

const DOMAIN = 'demo.samadhan.local';
const ACTOR = `admin.demo@${DOMAIN}`;
const TAGS = ['demo', 'demo-v7'];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Fixed-seed random numbers: the same demo every time.
let seed = 20261107;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);

const GROUPS = [
  ['SAP Functional (demo)', 'SAP SD / MM / FI functional queries', 'ROUND_ROBIN'],
  ['SAP Basis & Security (demo)', 'SAP users, roles, locks and transports', 'MANUAL'],
  ['Infrastructure (demo)', 'Laptops, network, VPN, mail and printers', 'ROUND_ROBIN'],
  ['Digital Apps (demo)', 'Emami Apps hub, portals and mobile apps', 'ROUND_ROBIN'],
];
// [user, name, role, availability, groups]
const AGENTS = [
  // Only the demo groups: real tickets arriving in Customer Support / L2 Support are never round-robined to her.
  ['sunita.bose', 'Sunita Bose (demo Supervisor)', 'Supervisor', 'AVAILABLE', GROUPS.map((g) => g[0])],
  ['kunal.mehta', 'Kunal Mehta (demo SAP SD)', 'Agent', 'AVAILABLE', ['SAP Functional (demo)']],
  ['farah.khan', 'Farah Khan (demo SAP Basis)', 'Agent', 'MEETING', ['SAP Basis & Security (demo)']],
  ['deepak.rao', 'Deepak Rao (demo Infra)', 'Agent', 'AVAILABLE', ['Infrastructure (demo)']],
  ['nisha.paul', 'Nisha Paul (demo Digital)', 'Agent', 'LUNCH', ['Digital Apps (demo)']],
  ['vikram.joshi', 'Vikram Joshi (demo Auditor)', 'Agent', 'AVAILABLE', []],
];
// Category -> functions for the new groups (added to the Category dropdown; removed with the demo)
const CATS = {
  'SAP SD': ['Pricing condition missing', 'Billing document not released to accounting', 'Credit block on sales order', 'Delivery not created'],
  'SAP MM': ['GRN posting error', 'PO release pending', 'Material master extension'],
  'SAP FI': ['Vendor payment blocked', 'GL posting error', 'Period not open'],
  'SAP Basis & Security': ['User locked', 'Role change request', 'Transport to production', 'New SAP user'],
  'IT Infrastructure': ['Laptop / desktop issue', 'VPN not connecting', 'Outlook / mailbox', 'Network down at depot', 'Printer not working'],
  'Digital Apps': ['Hub login issue', 'Report not loading', 'App access request', 'Mobile app crash'],
};
const SEVERITY = [['IT Infrastructure', 'Network down at depot', 'FATAL'], ['SAP Basis & Security', 'Transport to production', 'SERIOUS'], ['SAP SD', 'Credit block on sales order', 'SERIOUS'], ['SAP FI', 'Vendor payment blocked', 'SERIOUS']];
// [group, category, function, subject, detail]
const WORK = [
  ['SAP Functional (demo)', 'SAP SD', 'Pricing condition missing', 'Price condition ZPR0 missing for new SKU in Kolkata plant', 'Order for 240 cases is stuck; condition record not found for the new SKU.'],
  ['SAP Functional (demo)', 'SAP SD', 'Billing document not released to accounting', 'Billing documents not released to accounting', 'Six invoices from yesterday are not in FI; error: account determination.'],
  ['SAP Functional (demo)', 'SAP SD', 'Credit block on sales order', 'Credit block on distributor order - urgent dispatch', 'Distributor has paid; credit block still active on the order.'],
  ['SAP Functional (demo)', 'SAP SD', 'Delivery not created', 'Delivery not created for STO to Guwahati depot', 'Stock transfer order saved but VL10B shows no item.'],
  ['SAP Functional (demo)', 'SAP MM', 'GRN posting error', 'GRN posting error M7 021 at Pantnagar', 'Deficit of stock in unrestricted use while posting GRN.'],
  ['SAP Functional (demo)', 'SAP MM', 'PO release pending', 'PO release strategy not triggered', 'Purchase orders above 5 lakh are not going to the approver.'],
  ['SAP Functional (demo)', 'SAP MM', 'Material master extension', 'Extend material master to new plant', 'Please extend 14 packaging materials to plant 1450.'],
  ['SAP Functional (demo)', 'SAP FI', 'Vendor payment blocked', 'Vendor payment blocked - payment block R', 'Transporter payment run skipped the vendor.'],
  ['SAP Functional (demo)', 'SAP FI', 'GL posting error', 'GL account not defined in chart of accounts', 'Posting for marketing expenses fails with error F5 507.'],
  ['SAP Functional (demo)', 'SAP FI', 'Period not open', 'Posting period not open for the new month', 'Depot accountant cannot post expenses for this month.'],
  ['SAP Basis & Security (demo)', 'SAP Basis & Security', 'User locked', 'SAP user locked after wrong password attempts', 'User ID locked; please unlock and reset the password.'],
  ['SAP Basis & Security (demo)', 'SAP Basis & Security', 'Role change request', 'Add billing role for new depot accountant', 'Approved by the finance head; role Z_SD_BILLING needed.'],
  ['SAP Basis & Security (demo)', 'SAP Basis & Security', 'Transport to production', 'Move transport for pricing report to production', 'Tested in quality; CAB approved for Thursday.'],
  ['SAP Basis & Security (demo)', 'SAP Basis & Security', 'New SAP user', 'Create SAP user for new plant store keeper', 'Joining on Monday; copy roles from the existing store keeper.'],
  ['Infrastructure (demo)', 'IT Infrastructure', 'Laptop / desktop issue', 'Laptop very slow after the update', 'Boot takes 10 minutes; disk shows 100% usage.'],
  ['Infrastructure (demo)', 'IT Infrastructure', 'VPN not connecting', 'VPN not connecting from home', 'Error 809 since this morning; working from home today.'],
  ['Infrastructure (demo)', 'IT Infrastructure', 'Outlook / mailbox', 'Mailbox full - cannot send mail', 'Mailbox at 49.9 GB; please increase or archive.'],
  ['Infrastructure (demo)', 'IT Infrastructure', 'Network down at depot', 'Network down at Siliguri depot', 'No internet since 9 am; billing has stopped at the depot.'],
  ['Infrastructure (demo)', 'IT Infrastructure', 'Printer not working', 'Invoice printer not printing at Patna depot', 'Printer shows offline; restarted twice.'],
  ['Digital Apps (demo)', 'Digital Apps', 'Hub login issue', 'Cannot sign in to Emami Apps hub', 'OTP not received on the registered mobile.'],
  ['Digital Apps (demo)', 'Digital Apps', 'Report not loading', 'Gate entry report keeps loading', 'Report for last month does not open; spinner forever.'],
  ['Digital Apps (demo)', 'Digital Apps', 'App access request', 'Access to Expense app for new joiner', 'Manager approved; needs Employee role.'],
  ['Digital Apps (demo)', 'Digital Apps', 'Mobile app crash', 'Market rate app crashes on photo upload', 'Crashes on Android 14 when attaching a photo.'],
  ['Customer Support', 'mSecSales Application - Sync Issue', 'Single Device Sync issue', 'Orders not syncing from tablet', 'Distributor salesman cannot sync orders since morning.'],
  ['Customer Support', 'mSecSales Application - Login Screen', 'Login / Password Related issue', 'Unable to login to mSecSales', 'Password reset link not working.'],
  ['Customer Support', 'SalesCode DMS', 'Scheme not applied', 'Festive scheme not applied on invoice', 'Scheme FEST-24 is active but the invoice shows no discount.'],
  ['Customer Support', 'SalesCode DMS', 'Stock mismatch', 'DMS stock does not match physical stock', 'Difference of 36 cases in Navratna oil 100 ml.'],
  ['Customer Support', 'mSecSales Application - Master', 'Outlet Master Related issue', 'New outlets not visible in beat', 'Outlets added yesterday are not in the beat plan.'],
];
const SOURCES = ['Email', 'Email', 'Phone', 'Portal', 'WhatsApp', 'Email', 'Phone'];
const PEOPLE = ['Arun Ghosh', 'Meera Nair', 'Sanjib Saha', 'Pallavi Joshi', 'Imran Ali', 'Debjani Roy', 'Rakesh Yadav', 'Tanvi Shah', 'Gopal Mishra', 'Ritu Agarwal'];
const REPLIES = ['Hi,\n\nWe are looking into this and will update you within the hour.', 'Dear Sir/Madam,\n\nThanks for reporting. Could you share a screenshot of the error?', 'Hi,\n\nWe have applied a fix. Please check and confirm.'];
const NOTES = ['Checked the logs: same error on two more users. Linked the related ticket.', 'Discussed with the functional consultant; change needs CAB approval.', 'Vendor confirmed a known issue; patch expected tomorrow.'];
const FOLLOW = ['Still the same error, please check urgently.', 'Thanks, it works now.', 'Any update? This is blocking billing.', 'Shared the screenshot by mail.'];
const RCA = { l2Agent: 'Arijit Sen', helpdeskAnalysis: 'Reproduced the issue, checked configuration and logs.', rcaSolution: 'Root cause fixed (configuration corrected); user confirmed.' };

async function main() {
  await resolveSchema();
  const already = await pool.query(`SELECT count(*)::int AS n FROM samadhan.tickets WHERE 'demo-v7' = ANY(tags)`);
  if (already.rows[0].n > 0) { console.log(`v7 demo data is already loaded (${already.rows[0].n} tickets). Run "remove" first to reload.`); return; }
  const manifest = { groupIds: [], choiceIds: [], severityRuleIds: [], variantIds: [] };

  // ---- groups, agents, membership
  for (const [name, description, assignment] of GROUPS) {
    const { rows } = await pool.query(
      `INSERT INTO samadhan.groups (name, description, assignment) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING RETURNING id`, [name, description, assignment]);
    if (rows.length) manifest.groupIds.push(rows[0].id);
  }
  const groups = Object.fromEntries((await pool.query('SELECT id, name FROM samadhan.groups')).rows.map((g) => [g.name, g.id]));
  for (const [user, name, role, availability, inGroups] of AGENTS) {
    const { rows } = await pool.query(
      `INSERT INTO samadhan.agents (email, name, role, availability) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role RETURNING id`, [`${user}@${DOMAIN}`, name, role, availability]);
    for (const g of inGroups) if (groups[g]) await pool.query('INSERT INTO samadhan.group_members ("agentId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [rows[0].id, groups[g]]);
  }
  // Older demo agents (load-demo.js) take Customer Support work; created here if that demo is not loaded.
  for (const [user, name] of [['priya.sharma', 'Priya Sharma (demo)'], ['rahul.das', 'Rahul Das (demo)'], ['megha.roy', 'Megha Roy (demo)'], ['arijit.sen', 'Arijit Sen (demo L2)']]) {
    const { rows } = await pool.query(`INSERT INTO samadhan.agents (email, name, role) VALUES ($1, $2, 'Agent') ON CONFLICT (email) DO UPDATE SET name = samadhan.agents.name RETURNING id`, [`${user}@${DOMAIN}`, name]);
    const g = user === 'arijit.sen' ? 'L2 Support' : 'Customer Support';
    if (groups[g]) await pool.query('INSERT INTO samadhan.group_members ("agentId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [rows[0].id, groups[g]]);
  }
  const agents = Object.fromEntries((await pool.query(`SELECT id, name, email, role FROM samadhan.agents WHERE email LIKE $1`, [`%@${DOMAIN}`])).rows.map((a) => [a.email.split('@')[0], a]));
  const workersFor = {
    'SAP Functional (demo)': ['kunal.mehta'], 'SAP Basis & Security (demo)': ['farah.khan'], 'Infrastructure (demo)': ['deepak.rao'],
    'Digital Apps (demo)': ['nisha.paul'], 'Customer Support': ['priya.sharma', 'rahul.das', 'megha.roy'],
  };

  // ---- dropdown values: categories / functions for the new groups, severity rules
  const catField = (await pool.query(`SELECT id FROM samadhan.field_definitions WHERE key = 'category'`)).rows[0].id;
  const addChoice = async (value, parentId = null) => {
    const found = await pool.query('SELECT id FROM samadhan.field_choices WHERE "fieldId" = $1 AND value = $2 AND "parentId" IS NOT DISTINCT FROM $3', [catField, value, parentId]);
    if (found.rows.length) return found.rows[0].id;
    const { rows } = await pool.query('INSERT INTO samadhan.field_choices ("fieldId", "parentId", value, position) VALUES ($1, $2, $3, 200) RETURNING id', [catField, parentId, value]);
    manifest.choiceIds.push(rows[0].id);
    return rows[0].id;
  };
  for (const [cat, fns] of Object.entries(CATS)) { const id = await addChoice(cat); for (const f of fns) await addChoice(f, id); }
  for (const [category, fn, severity] of SEVERITY) {
    const { rows } = await pool.query(`INSERT INTO samadhan.severity_rules (category, "function", severity) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`, [category, fn, severity]);
    if (rows.length) manifest.severityRuleIds.push(rows[0].id);
  }
  await saveManifest(manifest);

  // Real dropdown values on this server, so the sample tickets use the same choices people pick from.
  const choices = async (key) => (await pool.query(
    `SELECT c.value FROM samadhan.field_choices c JOIN samadhan.field_definitions d ON d.id = c."fieldId" WHERE d.key = $1 AND c.active AND c."parentId" IS NULL ORDER BY c.position, c.id`, [key])).rows.map((r) => r.value);
  const lists = Object.fromEntries(await Promise.all(['type', 'region', 'state', 'depot', 'asmName', 'depotCoordinator', 'salesOrg'].map(async (k) => [k, await choices(k)])));
  const statuses = (await pool.query('SELECT id, name, "isResolved", "isClosed", "pausesSla" FROM samadhan.ticket_statuses ORDER BY position, id')).rows;
  const st = (re) => statuses.find((s) => re.test(s.name));
  const OPEN = st(/^open$/i) ?? statuses.find((s) => !s.isResolved && !s.pausesSla);
  const RESOLVED = statuses.find((s) => s.isResolved && !s.isClosed) ?? statuses.find((s) => s.isResolved);
  const CLOSED = statuses.find((s) => s.isClosed) ?? RESOLVED;
  const WAITING = statuses.filter((s) => !s.isResolved && s.pausesSla);
  const ESCALATED = st(/escalat/i);
  const WIP = statuses.filter((s) => !s.isResolved && /wip|progress/i.test(s.name));

  // ---- tickets over the last 14 days
  const made = [];
  for (let i = 0; i < 90; i++) {
    const [group, category, fn, subject, detail] = WORK[i % WORK.length];
    const daysAgo = i < 12 ? between(0.05, 0.9) : i < 30 ? between(1, 3) : between(3, 14);
    const createdAt = new Date(Date.now() - daysAgo * DAY);
    const worker = agents[pick(workersFor[group])];
    const person = pick(PEOPLE);
    const sales = group === 'Customer Support';
    const fields = {
      category, function: fn, groupId: groups[group], tags: TAGS,
      type: lists.type.length ? pick(lists.type) : undefined,
      region: sales && lists.region.length ? pick(lists.region) : undefined,
      state: lists.state.length ? pick(lists.state) : undefined,
      depot: lists.depot.length ? pick(lists.depot) : undefined,
      asmName: sales && lists.asmName.length ? pick(lists.asmName) : undefined,
      depotCoordinator: sales && lists.depotCoordinator.length ? pick(lists.depotCoordinator) : undefined,
      salesOrg: lists.salesOrg.length ? pick(lists.salesOrg) : undefined,
      callSubject: subject.slice(0, 40),
    };
    const t = await createTicket({
      subject, description: textToHtml(`${detail}\n\nReported by ${person}.`),
      requester: { email: `${person.toLowerCase().replace(/[^a-z]+/g, '.')}@${DOMAIN}`, name: `${person} (demo)` },
      source: SOURCES[i % SOURCES.length], createdAt, fields, actorAgentId: worker.id,
    });
    await updateTicket(t.id, { agentId: worker.id }, worker.id);
    made.push({ id: t.id, group, worker, createdAt, daysAgo, i });
    process.stdout.write('.');
  }
  console.log('');

  // ---- work them: replies, notes, follow-ups, escalations, resolution
  const resolvedIds = [];
  for (const m of made) {
    const r = rnd();
    if (r < 0.85) await addAgentMessage(m.id, { kind: 'REPLY', html: textToHtml(pick(REPLIES)) }, m.worker);
    if (m.i % 5 === 1) await addAgentMessage(m.id, { kind: 'NOTE', html: textToHtml(pick(NOTES)) }, m.worker);
    // Fresh tickets stay open; older ones are mostly resolved, some waiting, escalated or overdue.
    const plan = m.daysAgo < 1 ? (rnd() < 0.25 ? 'resolve' : 'open') : rnd();
    if (plan === 'open') continue;
    if (plan === 'resolve' || plan < 0.55) {
      await updateTicket(m.id, { ...RCA, statusId: RESOLVED.id }, m.worker.id);
      if (m.daysAgo > 3 && rnd() < 0.6) await updateTicket(m.id, { statusId: CLOSED.id }, m.worker.id);
      resolvedIds.push(m);
    } else if (plan < 0.7 && WAITING.length) {
      await updateTicket(m.id, { statusId: pick(WAITING).id }, m.worker.id);
      await addRequesterReply(m.id, { html: textToHtml(pick(FOLLOW)), fromEmail: (await requesterEmail(m.id)), messageId: `demo-v7-${m.id}@${DOMAIN}`, receivedAt: new Date(m.createdAt.getTime() + between(2, 20) * HOUR) });
    } else if (plan < 0.8 && ESCALATED) {
      await updateTicket(m.id, { statusId: ESCALATED.id, priority: 3 }, m.worker.id);
    } else if (plan < 0.9 && WIP.length) {
      await updateTicket(m.id, { statusId: pick(WIP).id }, m.worker.id);
    } else {
      await updateTicket(m.id, { priority: 4 }, m.worker.id); // urgent and left open: shows up as overdue / at risk
    }
  }

  // Realistic times: first response, resolution and conversation times follow the (past) creation time.
  await pool.query(
    `UPDATE samadhan.tickets t SET
        "firstRespondedAt" = CASE WHEN t."firstRespondedAt" IS NULL THEN NULL ELSE LEAST(now(), t."createdAt" + (20 + (t.id % 7) * 25) * interval '1 minute') END,
        "resolvedAt" = CASE WHEN t."resolvedAt" IS NULL THEN NULL ELSE LEAST(now(), t."createdAt" + (2 + (t.id % 11) * 4) * interval '1 hour') END,
        "closedAt" = CASE WHEN t."closedAt" IS NULL THEN NULL ELSE LEAST(now(), t."createdAt" + (30 + (t.id % 9) * 6) * interval '1 hour') END,
        "statusChangedAt" = LEAST(now(), t."createdAt" + (2 + (t.id % 11) * 4) * interval '1 hour'),
        "updatedAt" = LEAST(now(), t."createdAt" + (2 + (t.id % 11) * 4) * interval '1 hour')
     WHERE 'demo-v7' = ANY(t.tags)`);
  for (const table of ['conversations', 'activities']) {
    await pool.query(
      `UPDATE samadhan.${table} x SET "createdAt" = LEAST(now(), t."createdAt" + sub.n * (35 + (t.id % 5) * 10) * interval '1 minute')
       FROM (SELECT y.id, row_number() OVER (PARTITION BY y."ticketId" ORDER BY y.id) - 1 AS n FROM samadhan.${table} y
             JOIN samadhan.tickets tt ON tt.id = y."ticketId" WHERE 'demo-v7' = ANY(tt.tags)) sub, samadhan.tickets t
       WHERE sub.id = x.id AND t.id = x."ticketId"`);
  }

  // ---- CSAT, time logs, watchers, links
  for (const m of resolvedIds) {
    if (rnd() < 0.7) {
      const rating = rnd() < 0.7 ? 3 : rnd() < 0.6 ? 2 : 1;
      const at = new Date(Math.min(Date.now(), m.createdAt.getTime() + between(6, 30) * HOUR));
      await pool.query(`INSERT INTO samadhan.csat_requests ("ticketId", token, "sentAt", "answeredAt") VALUES ($1, $2, $3, $4) ON CONFLICT ("ticketId") DO UPDATE SET "sentAt" = EXCLUDED."sentAt", "answeredAt" = EXCLUDED."answeredAt"`, [m.id, `demo-v7-${m.id}-${Math.floor(rnd() * 1e9)}`, at, at]);
      await pool.query('INSERT INTO samadhan.csat_responses ("ticketId", rating, comment, "agentId", "createdAt") VALUES ($1, $2, $3, $4, $5)',
        [m.id, rating, [null, 'Took too long.', 'OK, resolved.', 'Quick and helpful, thanks!'][rating], m.worker.id, at]);
    }
  }
  for (const m of made) {
    if (rnd() < 0.75) await pool.query('INSERT INTO samadhan.time_logs ("ticketId", "agentId", minutes, note, "createdAt") VALUES ($1, $2, $3, $4, $5)',
      [m.id, m.worker.id, 10 + Math.floor(rnd() * 110), pick(['Analysis', 'Call with user', 'Configuration change', 'Testing the fix']), new Date(Math.min(Date.now(), m.createdAt.getTime() + 3 * HOUR))]);
  }
  const sunita = agents['sunita.bose'];
  const watched = (await pool.query(
    `SELECT t.id FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE 'demo-v7' = ANY(t.tags) AND NOT s."isResolved" AND t.priority >= 3`)).rows;
  for (const w of watched) await pool.query('INSERT INTO samadhan.ticket_watchers ("ticketId", "agentId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [w.id, sunita.id]);
  // Deepak's scope is "only mine": he also watches two Digital Apps tickets, so the scope shows "assigned or watched".
  for (const m of made.filter((x) => x.group === 'Digital Apps (demo)').slice(0, 2)) {
    await pool.query('INSERT INTO samadhan.ticket_watchers ("ticketId", "agentId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [m.id, agents['deepak.rao'].id]);
  }
  // Linked tickets: the same problem reported more than once (stored both ways).
  const bySubject = {};
  for (const m of made) (bySubject[WORK[m.i % WORK.length][3]] ??= []).push(m.id);
  let links = 0;
  for (const ids of Object.values(bySubject).filter((x) => x.length > 1).slice(0, 10)) {
    for (let k = 1; k < ids.length && k < 2; k++) {
      await pool.query('INSERT INTO samadhan.ticket_links ("ticketId", "linkedId") VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING', [ids[0], ids[k]]);
      await logActivity(ids[0], 'linked', { ticket: ids[k] }, sunita.id);
      await logActivity(ids[k], 'linked', { ticket: ids[0] }, sunita.id);
      links++;
    }
  }

  // ---- Authorization cockpit (demo agents only; through the cockpit's own save, so checks and the change log are real)
  const prof = Object.fromEntries((await pool.query('SELECT id, code FROM samadhan.auth_profiles')).rows.map((p) => [p.code, p.id]));
  const inDays = (d) => new Date(Date.now() + d * DAY).toISOString();
  const access = [
    ['kunal.mehta', { profiles: [{ profileId: prof.SAP_FUNCTIONAL_AGENT }], scope: { visibility: 'groups' }, reason: 'Joined the SAP functional team (demo).' }],
    ['farah.khan', { profiles: [{ profileId: prof.SAP_BASIS_SECURITY_AGENT, validTo: inDays(5) }], scope: { visibility: 'groups' },
      overrides: [{ key: 'ticket.export', effect: 'grant', expiresAt: inDays(3) }], reason: 'Covering SAP Basis during the upgrade window (demo).' }],
    ['deepak.rao', { profiles: [{ profileId: prof.INFRA_AGENT }], scope: { visibility: 'own' }, reason: 'Infra desk; sees only his own and watched tickets (demo).' }],
    ['nisha.paul', { profiles: [{ profileId: prof.DIGITAL_APPS_AGENT, validFrom: inDays(-30), validTo: inDays(-1) }], reason: 'Temporary cover for Digital Apps last month (demo).' }],
    ['sunita.bose', { profiles: [{ profileId: prof.WORKSPACE_LEAD }, { profileId: prof.APPROVER_CAB }], acceptSod: true,
      reason: 'Team lead and CAB member (demo); SoD reviewed by the IT head.' }],
    ['vikram.joshi', { profiles: [{ profileId: prof.AUDITOR, validTo: inDays(30) }], reason: 'Internal audit, Q3 (demo): read-only access.' }],
    ['priya.sharma', { profiles: [{ profileId: prof.SALES_APPS_AGENT }], overrides: [{ key: 'ticket.trash', effect: 'deny' }], reason: 'Sales apps desk; no deleting tickets (demo).' }],
    ['rahul.das', { profiles: [{ profileId: prof.SALES_APPS_AGENT }], scope: { visibility: 'groups' }, reason: 'Sales apps desk (demo).' }],
    ['megha.roy', { overrides: [{ key: 'insights.refresh', effect: 'grant', expiresAt: inDays(7) }], reason: 'Runs the weekly insights review (demo).' }],
    ['arijit.sen', { profiles: [{ profileId: prof.SAP_FUNCTIONAL_AGENT }, { profileId: prof.SALES_APPS_AGENT }], reason: 'L2 for both sales apps and SAP SD (demo).' }],
  ];
  let accessDone = 0;
  for (const [user, body] of access) {
    if (!agents[user] || (body.profiles || []).some((p) => !p.profileId)) continue;
    const r = await saveUserAccess(agents[user].id, body, ACTOR);
    if (r?.error) console.log(`  cockpit example for ${user} skipped: ${r.error}`); else accessDone++;
  }
  // Spread the change log over the last two weeks, oldest first.
  await pool.query(
    `UPDATE samadhan.auth_change_log l SET "createdAt" = now() - (sub.n * 31 + 7) * interval '1 hour'
     FROM (SELECT id, row_number() OVER (ORDER BY id DESC) AS n FROM samadhan.auth_change_log WHERE "actorEmail" = $1) sub WHERE sub.id = l.id`, [ACTOR]);
  // Permission usage: recent for active work, older than 90 days for a few rights (Access review "unused").
  const usage = [['kunal.mehta', ['ticket.reply', 'ticket.edit', 'ticket.note'], 1], ['farah.khan', ['ticket.reply', 'transport.manage'], 2],
    ['deepak.rao', ['ticket.reply'], 0], ['sunita.bose', ['approval.decide', 'ticket.assign'], 4], ['sunita.bose', ['ticket.merge', 'ticket.bulk'], 120],
    ['vikram.joshi', ['ticket.view'], 1], ['priya.sharma', ['ticket.export'], 140], ['rahul.das', ['ticket.reply', 'canned.personal'], 0], ['arijit.sen', ['ticket.child'], 100]];
  for (const [user, keys, daysAgo] of usage) {
    for (const key of keys) {
      await pool.query(`INSERT INTO samadhan.auth_permission_usage ("agentId", key, "lastUsedAt") VALUES ($1, $2, now() - $3 * interval '1 day')
                        ON CONFLICT ("agentId", key) DO UPDATE SET "lastUsedAt" = EXCLUDED."lastUsedAt"`, [agents[user].id, key, daysAgo]);
    }
  }

  // ---- shared saved views and report variants (owned by the demo Supervisor), personal to-dos
  const views = [
    ['SAP queue - open (demo)', { view: 'open', groupId: `${groups['SAP Functional (demo)']},${groups['SAP Basis & Security (demo)']}` }],
    ['Urgent and high, all groups (demo)', { view: 'urgent_high', sort: 'priority' }],
    ['Overdue today (demo)', { view: 'overdue' }],
    ['Infra - depot network (demo)', { category: 'IT Infrastructure', q: 'network' }],
    ['WhatsApp and portal tickets (demo)', { source: 'WhatsApp,Portal' }],
  ];
  for (const [name, query] of views) await pool.query('INSERT INTO samadhan.saved_views ("ownerAgentId", name, shared, query) VALUES ($1, $2, true, $3)', [sunita.id, name, JSON.stringify(query)]);
  const COLS = ['Ticket ID', 'Subject', 'Status', 'Priority', 'Agent', 'Created time', 'Due by Time', 'Closed time', 'Resolution status', 'First response status', 'Category', 'Function', 'L2 Agent'];
  const variants = [
    ['Last 7 days - SLA view (demo)', { range: 'last7', columns: COLS, filters: {} }],
    ['This month - SAP only (demo)', { range: 'thisMonth', columns: COLS, filters: { Category: { values: ['SAP SD', 'SAP MM', 'SAP FI', 'SAP Basis & Security'] } } }],
    ['Yesterday - depot report (demo)', { range: 'yesterday', columns: ['Ticket ID', 'Subject', 'Status', 'Region', 'STATE', 'DEPOT', 'ASM NAME', 'Category', 'Function'], filters: {} }],
  ];
  for (const [name, config] of variants) {
    const { rows } = await pool.query(`INSERT INTO samadhan.variants (kind, "ownerAgentId", name, shared, config) VALUES ('report', $1, $2, true, $3) RETURNING id`, [sunita.id, name, JSON.stringify(config)]);
    manifest.variantIds.push(rows[0].id);
  }
  for (const [user, text, dueDays] of [['sunita.bose', 'Review SoD warnings in the cockpit', 2], ['sunita.bose', 'Check overdue SAP tickets before the 5 pm call', 0], ['kunal.mehta', 'Follow up with the pricing consultant', 1], ['deepak.rao', 'Order a spare router for Siliguri depot', 3]]) {
    await pool.query('INSERT INTO samadhan.todos ("agentId", text, "dueAt") VALUES ($1, $2, now() + $3 * interval \'1 day\')', [agents[user].id, text, dueDays]);
  }
  await saveManifest(manifest);

  // Fresh dashboard numbers and action points on the next view.
  await pool.query(`DELETE FROM samadhan.ai_insights WHERE key = 'dashboard'`);
  const sum = (await pool.query(
    `SELECT count(*)::int n, count(*) FILTER (WHERE s."isResolved")::int resolved, count(*) FILTER (WHERE t."createdAt" > now() - interval '1 day')::int today
     FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE 'demo-v7' = ANY(t.tags)`)).rows[0];
  console.log(`v7 demo data loaded: ${sum.n} tickets over 14 days (${sum.resolved} resolved, ${sum.today} in the last 24 h), ${GROUPS.length} groups, ${AGENTS.length} agents, `
    + `${manifest.choiceIds.length} category / function choices, ${manifest.severityRuleIds.length} severity rules, ${links} ticket links, `
    + `${accessDone} cockpit examples, ${views.length} shared views, ${variants.length} report variants.`);
}

async function requesterEmail(ticketId) {
  return (await pool.query('SELECT c.email FROM samadhan.tickets t JOIN samadhan.contacts c ON c.id = t."requesterId" WHERE t.id = $1', [ticketId])).rows[0]?.email;
}
async function saveManifest(m) {
  await pool.query(`INSERT INTO samadhan.settings (key, value) VALUES ('demo.v7.manifest', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(m)]);
}

main()
  .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
  .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
