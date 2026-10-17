'use strict';
/*
   Setu API test suite - end-to-end checks against a running backend and its Postgres.

   ONLY for a throwaway local database: it creates tickets, contacts, groups and grants. It refuses to run unless
   SETU_TEST_ALLOW=1 and the database host is localhost. Run it on a fresh database (the counts assume no tickets).
   See tests/README.md for the full setup.

     SETU_TEST_ALLOW=1 SETU_TEST_API=http://localhost:4100/api/setu      SETU_TEST_PG=postgres://postgres@localhost:55432/devhub2 node backend/setu/tests/api.test.js
*/
const path = require('path');
const BACKEND = path.join(__dirname, '..', '..');
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env'), quiet: true });
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
const { Client } = require(path.join(BACKEND, 'node_modules/pg'));

const API = process.env.SETU_TEST_API || 'http://localhost:4100/api/setu';
const PG = process.env.SETU_TEST_PG || 'postgres://postgres@localhost:55432/devhub2';
const SECRET = process.env.HUB_AUTH_JWT_SECRET;
if (process.env.SETU_TEST_ALLOW !== '1' || !/@(localhost|127\.0\.0\.1)[:/]/.test(PG) || !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(API)) {
  console.error('Refusing to run: set SETU_TEST_ALLOW=1 and point SETU_TEST_PG / SETU_TEST_API at localhost only.');
  process.exit(2);
}
if (!SECRET) { console.error('HUB_AUTH_JWT_SECRET must be set (backend/.env) - the same value the backend under test uses.'); process.exit(2); }
const tok = (email) => jwt.sign({ email }, SECRET, { expiresIn: '1h' });
let fails = 0;
const check = (cond, label, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 200) : ''}`); if (!cond) fails++; };
async function call(email, method, url, body) {
  const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', ...(email ? { Authorization: `Bearer ${tok(email)}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function rawCall(token, method, url, body) {
  const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
}
(async () => {
  const db = new Client({ connectionString: PG });
  await db.connect();
  for (const [email, role] of [['admin@emamigroup.com', 'Admin'], ['agent1@emamigroup.com', 'Agent'], ['agent2@emamigroup.com', 'Agent'], ['sup@emamigroup.com', 'Supervisor']]) {
    await db.query(`INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, 'setu', $2) ON CONFLICT DO NOTHING`, [email, role]);
  }
  let r = await call(null, 'GET', '/me'); check(r.status === 401, 'no token -> 401');
  r = await call('stranger@emamigroup.com', 'GET', '/me'); check(r.status === 403, 'no grant -> 403');
  r = await call('admin@emamigroup.com', 'GET', '/me'); check(r.status === 200 && r.body.me.role === 'Admin', 'admin /me', r.body.me);
  const a1 = (await call('agent1@emamigroup.com', 'GET', '/me')).body.me;
  const a2 = (await call('agent2@emamigroup.com', 'GET', '/me')).body.me;
  await call('sup@emamigroup.com', 'GET', '/me');
  r = await call('admin@emamigroup.com', 'GET', '/meta'); check(r.status === 200 && r.body.statuses.length === 11 && r.body.fields.length === 19, 'meta: 11 statuses, 19 fields', { groups: r.body.groups.length, tree: r.body.categoryTree.length });
  const cs = r.body.groups.find((g) => g.name === 'Customer Support');
  r = await call('admin@emamigroup.com', 'POST', '/admin/groups', { id: cs.id, name: cs.name, assignment: 'ROUND_ROBIN', agentIds: [a1.id, a2.id] }); check(r.status === 200, 'admin saves group members');
  r = await call('agent1@emamigroup.com', 'POST', '/admin/groups', { name: 'x' }); check(r.status === 403, 'agent blocked from admin');
  const fields = (await call('admin@emamigroup.com', 'GET', '/admin/fields')).body.fields;
  const cat = fields.find((f) => f.key === 'category');
  r = await call('admin@emamigroup.com', 'POST', `/admin/fields/${cat.id}/choices`, { values: 'mSecSales Application - Login Screen\nOrders' }); check(r.body.added === 2, 'add categories');
  const cats = (await call('admin@emamigroup.com', 'GET', '/admin/fields')).body.fields.find((f) => f.key === 'category').choices;
  const login = cats.find((c) => c.value === 'mSecSales Application - Login Screen');
  r = await call('admin@emamigroup.com', 'POST', `/admin/fields/${cat.id}/choices`, { parentId: login.id, values: 'Login / Password Related issue' }); check(r.body.added === 1, 'add function under category');
  r = await call('admin@emamigroup.com', 'GET', '/meta'); check(r.body.categoryTree.some((c) => c.value === login.value && c.children.length === 1), 'category tree in meta');
  r = await call('admin@emamigroup.com', 'POST', '/admin/severity-rules', { category: 'Orders', function: '*', severity: 'SERIOUS' }); check(r.status === 200, 'add serious rule');
  r = await call('agent1@emamigroup.com', 'POST', '/tickets', { subject: 'Cannot log in to mSecSales', requesterName: 'Ravi Kumar', requesterEmail: 'ravi@example.com', source: 'Phone', description: 'Login fails\nsince morning', category: 'mSecSales Application - Login Screen', function: 'Login / Password Related issue', distributorCode: 'D100' });
  const t1 = r.body.ticket;
  check(r.status === 201 && t1.id >= 100000, 'ticket created, numbered from 100000', t1 && t1.id);
  check(t1.severity === 'FATAL' && t1.priority === 4, 'severity matrix: FATAL -> Urgent', { s: t1.severity, p: t1.priority });
  check(t1.groupName === 'Customer Support' && !!t1.agentId, 'routed to Customer Support + round robin assigned', { g: t1.groupName, a: t1.agentName });
  check(!!t1.firstResponseDueAt && !!t1.resolutionDueAt, 'SLA due dates set');
  const frMins = (new Date(t1.firstResponseDueAt) - new Date(t1.createdAt)) / 60000;
  check(Math.round(frMins) === 15, 'Urgent first response = 15 min (calendar hours)', frMins);
  r = await call('agent1@emamigroup.com', 'POST', '/tickets', { subject: 'Order not syncing', requesterName: 'Anita', requesterEmail: 'anita@example.com', category: 'Orders', function: 'Anything' });
  const t2 = r.body.ticket;
  check(t2.severity === 'SERIOUS' && t2.priority === 3, 'wildcard rule: SERIOUS -> High', { s: t2.severity, p: t2.priority });
  check(t2.agentId && t2.agentId !== t1.agentId, 'round robin picked the other agent', { t1: t1.agentId, t2: t2.agentId });
  r = await call('agent1@emamigroup.com', 'GET', '/tickets?view=open'); check(r.body.total === 2, 'list open = 2');
  r = await call('agent1@emamigroup.com', 'GET', '/tickets?q=anita'); check(r.body.total === 1, 'search by requester');
  r = await call('agent1@emamigroup.com', 'GET', `/tickets?q=${t1.id}`); check(r.body.total === 1, 'search by ticket number');
  r = await call('agent1@emamigroup.com', 'GET', '/tickets/counts'); check(r.status === 200, 'counts', r.body.counts);
  r = await call('agent2@emamigroup.com', 'POST', `/tickets/${t1.id}/messages`, { kind: 'REPLY', text: 'We are looking into it.' }); check(r.status === 201, 'reply');
  r = await call('agent2@emamigroup.com', 'POST', `/tickets/${t1.id}/messages`, { kind: 'NOTE', text: 'Checked SAP user' }); check(r.status === 201, 'note');
  r = await call('agent2@emamigroup.com', 'POST', `/tickets/${t1.id}/messages`, { kind: 'FORWARD', text: 'fyi' }); check(r.status === 400, 'forward needs address');
  r = await call('agent1@emamigroup.com', 'GET', `/tickets/${t1.id}`);
  check(!!r.body.ticket.firstRespondedAt && r.body.conversations.length === 2, 'first response stamped, 2 conversations', { conv: r.body.conversations.length, acts: r.body.activities.length });
  check(r.body.conversations[0].bodyHtml.includes('#TICKET No - ' + t1.id), 'reply carries signature template');
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t1.id}`, { statusId: 3 }); check(r.status === 200 && !!r.body.ticket.slaPausedAt, 'Pending pauses SLA');
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t1.id}`, { statusId: 2 }); check(r.status === 200 && !r.body.ticket.slaPausedAt, 'Open resumes SLA', { paused: r.body.ticket.slaPausedMins });
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t1.id}`, { statusId: 4 }); check(r.status === 400 && /required/.test(r.body.error), 'resolve blocked without required fields', r.body.error);
  const fill = { region: 'EAST', distributorName: 'ABC Traders', salesOrg: 'EM01 - CCD', state: 'WB', depot: 'Kolkata', asmName: 'X', depotCoordinator: 'Y', type: 'mSFA', l2Agent: 'Z', rcaSolution: 'Password reset' };
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t1.id}`, { ...fill, statusId: 4 }); check(r.status === 200 && !!r.body.ticket.resolvedAt, 'resolve with fields filled', r.body.error);
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t2.id}`, { category: 'Something else', function: null }); check(r.body.ticket.severity === 'NORMAL' && r.body.ticket.priority === 1, 'category change -> severity/priority recomputed');
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t2.id}`, { statusId: 8 }); check(r.status === 200, 'escalate to L3 (ON_UPDATE automation)');
  // Iteration 1 additions
  r = await call('agent1@emamigroup.com', 'POST', '/tickets', { subject: 'With L2 fields', requesterName: 'Kiran', l2Agent: 'L2 Team A', helpdeskAnalysis: 'Analysed', rcaSolution: 'Fixed config' });
  check(r.status === 201 && r.body.ticket.l2Agent === 'L2 Team A' && r.body.ticket.rcaSolution === 'Fixed config', 'create keeps l2Agent / analysis / RCA', r.body.ticket && { l2: r.body.ticket.l2Agent });
  r = await call('agent1@emamigroup.com', 'POST', '/tickets', { subject: 'Born resolved', requesterName: 'Kiran', statusId: 4 });
  check(r.status === 400 && /required/.test(r.body.error), 'create as Resolved without required fields -> 400', r.body.error);
  r = await call('agent1@emamigroup.com', 'POST', '/tickets', { subject: 'Bad status', requesterName: 'Kiran', statusId: 999 });
  check(r.status === 400, 'create with unknown status -> 400');
  r = await call('agent1@emamigroup.com', 'POST', '/tickets', { subject: 'x', requesterName: 'K', requesterEmail: 'not-an-email' });
  check(r.status === 400, 'invalid requester email -> 400');
  r = await call('agent1@emamigroup.com', 'GET', '/tickets/999999'); check(r.status === 404, 'unknown ticket -> 404');
  r = await call('agent1@emamigroup.com', 'GET', '/tickets/abc'); check(r.status === 400, 'non-numeric ticket -> 400');
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t2.id}`, { priority: 9 }); check(r.status === 400, 'invalid priority -> 400');
  r = await call('agent1@emamigroup.com', 'GET', '/tickets?q=%27%3B%20drop%20table'); check(r.status === 200, 'search with SQL-ish text is safe');
  r = await call('agent1@emamigroup.com', 'GET', '/tickets?due=60&sort=due&page=1&pageSize=10'); check(r.status === 200, 'due filter + sort');
  r = await call('agent1@emamigroup.com', 'GET', '/tickets?statusId=abc'); check(r.status === 200, 'garbage status filter ignored');
  r = await call('admin@emamigroup.com', 'POST', '/admin/agents', { email: 'admin@emamigroup.com', name: 'Me', active: false }); check(r.status === 400, 'admin cannot deactivate self');
  r = await call('admin@emamigroup.com', 'POST', '/admin/agents', { email: 'agent2@emamigroup.com', name: 'Rahul Das', active: false, groupIds: [] });
  r = await call('agent2@emamigroup.com', 'GET', '/me'); check(r.status === 403, 'deactivated agent blocked');
  await call('admin@emamigroup.com', 'POST', '/admin/agents', { email: 'agent2@emamigroup.com', name: 'Rahul Das', active: true, groupIds: [cs.id] });
  r = await call('admin@emamigroup.com', 'PUT', '/admin/business-hours', { days: [{ day: 1, start: '20:00', end: '09:00' }] }); check(r.status === 400, 'bad business hours rejected');
  r = await call('agent1@emamigroup.com', 'POST', `/tickets/${t1.id}/time-logs`, { minutes: 30, note: 'call' }); check(r.status === 201, 'time log');
  r = await call('agent1@emamigroup.com', 'POST', `/tickets/${t1.id}/messages`, { kind: 'FORWARD', text: 'fyi', to: 'l3@emamigroup.com, ops@emamigroup.com' }); check(r.status === 201, 'forward with comma list');
  r = await call('agent1@emamigroup.com', 'POST', `/tickets/${t1.id}/messages`, { kind: 'NOTE', text: '<script>alert(1)</script>' });
  r = await call('agent1@emamigroup.com', 'GET', `/tickets/${t1.id}`);
  check(!r.body.conversations.some((c) => c.bodyHtml.includes('<script>')), 'agent text is HTML-escaped');
  check(r.body.timeLogs.length === 1, 'time logs returned');
  r = await call('agent1@emamigroup.com', 'GET', '/board'); check(r.status === 200 && r.body.items.length === 3, 'board');
  r = await call('agent1@emamigroup.com', 'GET', '/dashboard'); check(r.status === 200 && r.body.trends.receivedToday === 3, 'dashboard', r.body.counts);
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  r = await call('agent1@emamigroup.com', 'GET', `/reports/daily?from=${today}&to=${today}`); check(r.status === 403, 'agent blocked from report');
  r = await call('sup@emamigroup.com', 'GET', `/reports/daily?from=${today}&to=${today}`); check(r.status === 200 && r.body.rows.length === 3 && r.body.columns.length === 36 && r.body.rows[0].length === 36, 'supervisor report: 36 columns');
  r = await call('agent2@emamigroup.com', 'PATCH', '/me/availability', { availability: 'LUNCH' }); check(r.status === 200, 'availability');
  r = await call('admin@emamigroup.com', 'POST', '/admin/distributors/import', { rows: [['Report'], ['DB Code', 'Distributor Name', 'Region', 'Depot', 'ASM Name', 'Status'], ['D100', 'ABC Traders', 'EAST', 'KOL', 'Asm A', 'Active'], ['D200', 'XYZ', 'WEST', 'MUM', 'Asm B', 'Inactive']] }); check(r.body.imported === 2, 'distributor import');
  r = await call('agent1@emamigroup.com', 'GET', '/distributors/lookup?code=d100'); check(r.body.distributor && r.body.distributor.name === 'ABC Traders', 'distributor lookup');
  r = await call('admin@emamigroup.com', 'POST', '/admin/canned', { title: 'Password reset', shortCode: '/pwd', body: 'Your password has been reset.' }); check(r.status === 200, 'canned create');
  r = await call('admin@emamigroup.com', 'POST', '/admin/canned', { title: 'Dup', shortCode: 'pwd', body: 'x' }); check(r.status === 409, 'duplicate short code -> 409');
  r = await call('admin@emamigroup.com', 'PUT', '/admin/settings', { 'escalation.groupId': cs.id, 'escalation.notifyEmails': 'l3@emamigroup.com', 'sla.reminderMinutes': 45 }); check(r.status === 200, 'settings');
  r = await call('admin@emamigroup.com', 'POST', '/admin/holidays', { date: '2026-10-20', name: 'Durga Puja' }); check(r.status === 200, 'holiday');
  const autos = (await call('admin@emamigroup.com', 'GET', '/admin/automations')).body.rules; check(autos.length === 6, 'automations seeded');
  r = await call('admin@emamigroup.com', 'GET', '/admin/sla'); check(r.body.policies.length === 2 && r.body.policies[0].targets.length === 4, 'sla policies');
  r = await call('admin@emamigroup.com', 'GET', '/admin/agents'); check(r.body.agents.length === 4, 'agents list');
  r = await fetch(API + '/jobs/run', { method: 'POST', headers: { 'x-internal-secret': 'localtest' } }); const jb = await r.json(); check(r.status === 200, 'jobs/run via internal secret', jb.result);
  r = await call('admin@emamigroup.com', 'GET', '/admin/audit'); check(r.body.events.length >= 5, 'audit trail', r.body.events.length);
  const notes = await db.query(`SELECT count(*)::int n FROM emami_apps.notifications WHERE app_id = 'setu'`); check(notes.rows[0].n > 0, 'agent notifications written to hub inbox', notes.rows[0].n);

  // ---------- Insights and action points ----------
  const aiMode = process.env.SETU_TEST_AI === '1';
  const expectSource = aiMode ? 'ai' : 'rules';
  r = await call('agent1@emamigroup.com', 'GET', '/insights/dashboard');
  const di = r.body.insights;
  check(r.status === 200 && di.source === expectSource && di.headline && Array.isArray(di.actionPoints) && (aiMode ? di.actionPoints.length > 0 : true), `dashboard insights (${expectSource})`, di && { source: di.source, n: di.actionPoints.length, note: di.aiNote });
  check(Array.isArray(di.checks) && di.stats && di.stats.totals.open >= 1, 'dashboard insights carry live checks and stats');
  r = await call('agent1@emamigroup.com', 'GET', '/insights/dashboard'); check(r.body.insights.cached === true, 'dashboard insights served from cache on the next view');
  r = await call('agent1@emamigroup.com', 'GET', '/insights/dashboard?refresh=1'); check(r.body.insights.cached === true, 'agents cannot force a refresh (cached copy returned)');
  r = await call('sup@emamigroup.com', 'GET', '/insights/dashboard?refresh=1'); check(r.body.insights.cached === false, 'supervisor refresh regenerates');
  r = await call('agent1@emamigroup.com', 'GET', `/tickets/${t2.id}/insights`);
  check(r.status === 200 && Array.isArray(r.body.checks) && r.body.analysis === null, 'opening a ticket: live checks, no analysis until asked');
  r = await call('agent1@emamigroup.com', 'GET', `/tickets/${t2.id}/insights?generate=1`);
  const ta = r.body.analysis;
  check(r.status === 200 && ta && ta.source === expectSource && ta.summary && ta.suggestedReply && Array.isArray(ta.actionPoints), `ticket analysis (${expectSource})`, ta && { source: ta.source, note: ta.aiNote });
  const tree = (await call('agent1@emamigroup.com', 'GET', '/meta')).body.categoryTree;
  const validCat = !ta.suggestedCategory || tree.some((c) => c.value === ta.suggestedCategory && (!ta.suggestedFunction || c.children.includes(ta.suggestedFunction)));
  check(validCat, 'suggested category / function always come from the configured list', { c: ta.suggestedCategory, f: ta.suggestedFunction });
  if (aiMode) {
    r = await call('agent1@emamigroup.com', 'GET', `/tickets/${t2.id}/insights`);
    check(r.body.analysis && r.body.analysis.source === 'ai', 'saved AI analysis shown on the next view without a new call');
    await call('agent1@emamigroup.com', 'POST', `/tickets/${t2.id}/messages`, { kind: 'NOTE', text: 'New information' });
    r = await call('agent1@emamigroup.com', 'GET', `/tickets/${t2.id}/insights`);
    check(r.body.analysis === null && r.body.stale === true, 'analysis marked out of date once the ticket changes');
  }
  r = await call(null, 'GET', `/tickets/${t2.id}/insights`); check(r.status === 401, 'insights need a session');

  // ---------- Security and robustness ----------
  r = await rawCall(jwt.sign({ email: 'admin@emamigroup.com', purpose: 'magic-link' }, SECRET, { expiresIn: '10m' }), 'GET', '/me');
  check(r.status === 401, 'purpose-bound token (e.g. magic sign-in link) rejected as a session');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  r = await rawCall(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ email: 'admin@emamigroup.com' })}.`, 'GET', '/me');
  check(r.status === 401, 'unsigned (alg none) token rejected');
  r = await rawCall(jwt.sign({ email: 'admin@emamigroup.com' }, 'not-the-secret'), 'GET', '/me'); check(r.status === 401, 'token signed with another secret rejected');
  r = await rawCall(jwt.sign({ email: 'admin@emamigroup.com' }, SECRET, { expiresIn: -10 }), 'GET', '/me'); check(r.status === 401, 'expired token rejected');
  r = await rawCall(tok('admin@emamigroup.com'), 'POST', '/jobs/run'); check(r.status === 200, 'admin can run scheduled checks');
  r = await fetch(API + '/jobs/run', { method: 'POST', headers: { 'x-internal-secret': 'wrong' } }); check(r.status === 403, 'wrong scheduler secret rejected');
  // Two people editing one ticket
  const fresh = (await call('agent1@emamigroup.com', 'GET', `/tickets/${t2.id}`)).body.ticket;
  r = await call('agent2@emamigroup.com', 'PATCH', `/tickets/${t2.id}`, { tags: ['first-edit'], expectedUpdatedAt: fresh.updatedAt }); check(r.status === 200, 'save with current version');
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t2.id}`, { tags: ['stale-edit'], expectedUpdatedAt: fresh.updatedAt });
  check(r.status === 409 && /Someone else changed/.test(r.body.error), 'stale save refused (409), no silent overwrite');
  // Spreadsheet formula injection in the report
  r = await call('agent1@emamigroup.com', 'POST', '/tickets', { subject: '=HYPERLINK("http://evil.example","Click")', requesterName: '+cmd|calc', requesterEmail: 'attacker@example.com' });
  r = await call('sup@emamigroup.com', 'GET', `/reports/daily?from=${today}&to=${today}`);
  const evil = r.body.rows.find((row) => String(row[1]).includes('HYPERLINK'));
  check(evil && evil[1].startsWith("'=") && evil[33].startsWith("'+"), 'formula-looking cells neutralised in report');
  // Input validation
  r = await call('agent1@emamigroup.com', 'GET', '/tickets?from=2026-13-99x'); check(r.status === 400, 'bad date filter -> 400');
  r = await call('agent1@emamigroup.com', 'GET', `/tickets?q=${'x'.repeat(5000)}`); check(r.status === 200, 'very long search is truncated, not an error');
  r = await call('agent1@emamigroup.com', 'PATCH', `/tickets/${t2.id}`, { agentId: 999999 }); check(r.status === 400, 'assign to unknown agent -> 400');
  // Removing a contact scrubs the address from conversations and activity too
  r = await call('admin@emamigroup.com', 'POST', '/admin/contacts/anonymize', { email: 'ravi@example.com' }); check(r.status === 200, 'anonymize contact');
  const leftovers = await db.query(`SELECT (SELECT count(*) FROM setu.conversations WHERE "fromEmail" = $1 OR $1 = ANY("toEmails") OR $1 = ANY("ccEmails"))::int
      + (SELECT count(*) FROM setu.activities WHERE details->>'to' = $1)::int + (SELECT count(*) FROM setu.contacts WHERE email = $1)::int AS n`, ['ravi@example.com']);
  check(leftovers.rows[0].n === 0, 'no trace of the removed address remains', leftovers.rows[0].n);
  const scrubbed = (await call('admin@emamigroup.com', 'GET', `/tickets/${t1.id}`)).body.ticket;
  check(/Removed at the requester/.test(scrubbed.description) && !scrubbed.mobileNo && !scrubbed.callerName, 'their ticket text and phone numbers are removed too');
  // Rate limiting: heavy bucket allows 10 per minute per person
  let limited = null;
  for (let i = 0; i < 12 && !limited; i++) {
    const x = await rawCall(tok('sup@emamigroup.com'), 'GET', `/reports/daily?from=${today}&to=${today}`);
    if (x.status === 429) limited = x;
  }
  check(limited && Number(limited.headers.get('retry-after')) > 0, 'rate limit returns 429 with Retry-After');
  r = await call('agent1@emamigroup.com', 'GET', '/me'); check(r.status === 200, 'rate limit is per person (others unaffected)');
  await db.end();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
