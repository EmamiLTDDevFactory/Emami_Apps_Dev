'use strict';
/*
   v7 Phase 7 - major incidents, PIR, problems / KEDB end to end against a running backend (fresh throwaway database):
   auto-flag (Urgent + Production), declare / update / remind / stand down, PIR before resolve, problem candidates,
   problems from candidates or incidents, links, known errors, problem resolved -> incidents told, duplicate hints,
   service health and the Problem / Major Incident registers.
     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/problem.api.test.js
*/
const path = require('path');
const BACKEND = path.join(__dirname, '..', '..');
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env'), quiet: true });
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
const { Client } = require(path.join(BACKEND, 'node_modules/pg'));

const T = (name, fallback) => process.env[`SAMADHAN_TEST_${name}`] || fallback;
const API = T('API', 'http://localhost:4191/api/samadhan');
const PG = T('PG', 'postgres://postgres@localhost:55432/samadhan_test');
const SECRET = process.env.HUB_AUTH_JWT_SECRET;
if (T('ALLOW') !== '1' || !/@(localhost|127\.0\.0\.1)[:/]/.test(PG) || !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(API)) {
    console.error('Refusing to run: set SAMADHAN_TEST_ALLOW=1 and point SAMADHAN_TEST_PG / SAMADHAN_TEST_API at localhost only.');
    process.exit(2);
}
if (!SECRET) { console.error('HUB_AUTH_JWT_SECRET must be set - the same value the backend under test uses.'); process.exit(2); }

let fails = 0;
const check = (cond, label, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 260) : ''}`); if (!cond) fails++; };
async function call(email, method, url, body, headers = {}) {
    const r = await fetch(API + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(email ? { Authorization: `Bearer ${jwt.sign({ email }, SECRET, { expiresIn: '1h' })}` } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
}
const ADMIN = 'p.admin@emamigroup.com';
const SUP = 'p.sup@emamigroup.com';
const A1 = 'p.agent1@emamigroup.com';
const A2 = 'p.agent2@emamigroup.com';
const ticket = (who, body) => call(who, 'POST', '/tickets', { requesterName: 'Office User', requesterEmail: 'office.user@example.com', ...body });

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query("INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, 'samadhan', $2) ON CONFLICT DO NOTHING", [email, role]);
    }
    const a1 = (await call(A1, 'GET', '/me')).body.me;
    await call(A2, 'GET', '/me');
    const sup = (await call(SUP, 'GET', '/me')).body.me;
    let r = await call(ADMIN, 'GET', '/admin/workspaces');
    const ws = Object.fromEntries(r.body.workspaces.map((w) => [w.key, w]));
    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: true });
    for (const k of ['SAP', 'INFRA_IT']) await call(ADMIN, 'PUT', `/admin/workspaces/${ws[k].id}`, { enabled: true });
    const meta = (await call(A1, 'GET', '/meta')).body;
    const app = (c) => meta.applications.find((a) => a.code === c);
    const sapSub = (m) => meta.byWorkspace.SAP.tree.find((n) => n.value === m).children[0];
    check(meta.problemStatuses?.includes('Known error'), 'meta: problem statuses');
    const jobs = () => call(ADMIN, 'POST', '/jobs/run', {});

    // ---- automatic major incident: Urgent + Production outside Secondary Sales ----
    r = await ticket(A1, { subject: 'Billing down in production', applicationId: app('SAP').id, priority: 4, category: 'SD', function: sapSub('SD'), sap: { environment: 'Production', tcode: 'VF01' } });
    const mi = r.body.ticket;
    check(r.status === 201 && mi.isMajorIncident === true && mi.majorNextUpdateAt, 'Urgent + Production -> major incident (next update due)', { s: r.status, m: mi?.isMajorIncident, b: r.status !== 201 ? r.body : undefined });
    let d = (await call(A1, 'GET', `/tickets/${mi.id}`)).body;
    check(d.activities.some((a) => a.action === 'major_declared' && a.details?.auto === true), 'history: flagged automatically');
    const supBell = Number((await db.query(`SELECT count(*) AS n FROM samadhan.notifications WHERE "agentId" = $1 AND "ticketId" = $2 AND title LIKE 'MAJOR INCIDENT%'`, [sup.id, mi.id])).rows[0].n);
    check(supBell === 1, 'leads (ticket.declareMajor) get a bell', supBell);
    r = await ticket(A1, { subject: 'Urgent but in quality', applicationId: app('SAP').id, priority: 4, sap: { environment: 'Quality / Test' } });
    check(r.body.ticket.isMajorIncident === false, 'Urgent outside Production is not flagged');
    r = await ticket(A1, { subject: 'Sales app urgent', priority: 4 });
    check(r.status === 201 && !r.body.ticket.isMajorIncident, 'Secondary Sales tickets are never auto-flagged');
    const resolveSap = (who, id) => call(who, 'PATCH', `/tickets/${id}`, { statusId: 4, rootCauseCategory: 'Configuration', resolutionCode: 'Fixed – configuration' });
    r = await resolveSap(A1, mi.id);
    check(r.status === 400 && /post-incident review/.test(r.body.error), 'major incident: PIR needed before resolving', r.body);
    r = await call(A1, 'PUT', `/tickets/${mi.id}/pir`, { summary: 'x' });
    check(r.status === 403, 'PIR needs ticket.pir.edit');
    r = await call(SUP, 'PUT', `/tickets/${mi.id}/pir`, { rootCauseCategory: 'Weather' });
    check(r.status === 400, 'PIR root cause category from the list');
    r = await call(SUP, 'PUT', `/tickets/${mi.id}/pir`, {
        summary: 'Billing stopped for 40 minutes.', rootCause: 'Pricing condition deleted by a transport.', rootCauseCategory: 'Configuration',
        timeline: '10:05 alerts\n10:20 bridge opened\n10:45 restored', correctiveActions: [{ text: 'Restore condition', owner: 'SD team' }], preventiveActions: 'Transport review for pricing',
    });
    check(r.status === 200 && r.body.pir.timeline.length === 3 && r.body.pir.correctiveActions[0].owner === 'SD team', 'PIR saved (timeline lines, actions)', r.body.pir);
    r = await call(SUP, 'PUT', `/tickets/${mi.id}/pir`, { reviewed: true });
    check(r.body.pir.reviewedBy && r.body.pir.reviewedAt, 'PIR marked reviewed');
    r = await resolveSap(A1, mi.id);
    check(r.status === 200, 'resolved once the PIR is in', r.body);

    // ---- declared by a lead, updates, reminders, stand down ----
    r = await ticket(A1, { subject: 'Network slow at plant', applicationId: app('NET').id, category: 'Network', function: 'LAN' });
    const net = r.body.ticket;
    check(!net.isMajorIncident, 'normal incident');
    r = await call(A1, 'POST', `/tickets/${net.id}/major`, {});
    check(r.status === 403, 'declaring needs ticket.declareMajor');
    r = await call(SUP, 'POST', `/tickets/${net.id}/major`, { bridgeUrl: 'teams.example.com/x' });
    check(r.status === 400, 'bridge link must be https');
    r = await call(SUP, 'POST', `/tickets/${net.id}/major`, { bridgeUrl: 'https://teams.example.com/l/meetup/1', note: 'Three plants affected' });
    check(r.status === 200 && r.body.ticket.isMajorIncident && r.body.ticket.majorBridgeUrl.startsWith('https://'), 'declared by a lead with a bridge link');
    r = await call(SUP, 'POST', `/tickets/${net.id}/major`, {});
    check(r.status === 409, 'already a major incident');
    r = await call(A1, 'POST', `/tickets/${net.id}/major/update`, { text: 'hi' });
    check(r.status === 400, 'an update needs some content');
    const before = (await db.query('SELECT "majorNextUpdateAt" FROM samadhan.tickets WHERE id = $1', [net.id])).rows[0].majorNextUpdateAt;
    r = await call(A1, 'POST', `/tickets/${net.id}/major/update`, { text: 'Core switch replaced at plant 2, monitoring.' });
    const after = (await db.query('SELECT "majorNextUpdateAt" FROM samadhan.tickets WHERE id = $1', [net.id])).rows[0].majorNextUpdateAt;
    d = (await call(A1, 'GET', `/tickets/${net.id}`)).body;
    check(r.status === 200 && d.conversations.some((c) => c.kind === 'NOTE' && /Major incident update/.test(c.bodyText)) && new Date(after) >= new Date(before), 'update posted as a note; next-update clock restarted');
    r = await call(A1, 'GET', '/tickets?view=all&majorIncident=1');
    check(r.body.items.some((t) => t.id === net.id) && r.body.items.every((t) => t.isMajorIncident !== false), 'filter: major incidents');
    await db.query(`UPDATE samadhan.tickets SET "majorNextUpdateAt" = now() - interval '1 minute' WHERE id = $1`, [net.id]);
    r = await jobs();
    check(r.body.result?.majorReminders >= 1, 'overdue update -> reminder', r.body.result);
    r = await call(SUP, 'DELETE', `/tickets/${net.id}/major`, { note: 'Contained' });
    check(r.status === 200, 'stand down');
    r = await call(A1, 'PATCH', `/tickets/${net.id}`, { priority: 4 });
    d = (await call(A1, 'GET', `/tickets/${net.id}`)).body;
    check(d.ticket.isMajorIncident === false, 'a stood-down incident is not re-flagged automatically');

    // ---- problem candidates -> problem, KEDB ----
    const vpn = [];
    for (const i of [1, 2, 3]) vpn.push((await ticket(i === 2 ? A2 : A1, { subject: `VPN drops ${i}`, applicationId: app('NET').id, category: 'Network', function: 'VPN' })).body.ticket);
    r = await jobs();
    check(r.body.result?.problemCandidates >= 1, 'detection: 3 incidents in 7 days -> candidate', r.body.result);
    r = await call(A1, 'GET', '/problem-candidates');
    const cand = r.body.items.find((c) => c.category === 'Network' && c.function === 'VPN');
    check(cand && cand.count === 3 && cand.applicationCode === 'NET', 'candidate listed with its incidents', r.body.items);
    r = await call(A1, 'POST', `/problem-candidates/${cand.id}/create`);
    const prob = r.body.problem;
    check(r.status === 201 && prob.recordClass === 'PROBLEM' && /^NET-\d+$/.test(prob.ref), 'problem created from the candidate', r.body);
    d = (await call(A1, 'GET', `/tickets/${prob.id}`)).body;
    check(d.incidents.length === 3 && d.knownError?.status === 'Under investigation', 'problem shows its incidents and KEDB status');
    d = (await call(A1, 'GET', `/tickets/${vpn[0].id}`)).body;
    check(d.problem?.id === prob.id && d.activities.some((a) => a.action === 'linked_to_problem'), 'incident shows its problem');
    r = await call(A1, 'GET', '/problem-candidates');
    check(!r.body.items.some((c) => c.id === cand.id), 'candidate gone once it became a problem');
    r = await call(A1, 'PUT', `/tickets/${vpn[0].id}/known-error`, { knownError: true });
    check(r.status === 400, 'known-error fields only on problems');
    r = await call(A1, 'PUT', `/tickets/${prob.id}/known-error`, { knownError: true });
    check(r.status === 400 && /workaround/.test(r.body.error), 'a known error needs a workaround');
    r = await call(A1, 'PUT', `/tickets/${prob.id}/known-error`, { knownError: true, status: 'Known error', symptom: 'VPN drops every 10 min', workaround: 'Use the backup gateway', rootCause: 'MTU mismatch on the firewall' });
    check(r.status === 200 && r.body.knownError.knownError === true, 'known error recorded (KEDB)');
    r = await call(A1, 'PUT', `/tickets/${prob.id}/known-error`, { status: 'Done' });
    check(r.status === 400, 'problem status from the list');
    r = await ticket(A1, { subject: 'VPN drops again', applicationId: app('NET').id, category: 'Network', function: 'VPN' });
    const v4 = r.body.ticket;
    r = await call(A1, 'POST', `/tickets/${v4.id}/problem`, { problemId: vpn[1].id });
    check(r.status === 400 && /not a problem/.test(r.body.error), 'only problem records can be linked to');
    r = await call(A1, 'POST', `/tickets/${v4.id}/problem`, { problemId: prob.id });
    check(r.status === 200, 'link an incident to the problem');
    r = await call(A1, 'GET', `/tickets?view=all&problemId=${prob.id}`);
    check(r.body.items.length === 4, 'filter: incidents of a problem', r.body.items.length);
    r = await call(A1, 'POST', `/tickets/${v4.id}/problem`, { problemId: null });
    check(r.status === 200 && (await call(A1, 'GET', `/tickets/${v4.id}`)).body.problem === null, 'unlink');
    r = await call(A1, 'POST', `/tickets/${v4.id}/problem`, { create: true, subject: 'Problem: VPN gateway' });
    check(r.status === 201 && r.body.problem.recordClass === 'PROBLEM', 'make a problem straight from an incident');

    // resolving the problem tells the agents of its open incidents
    const a2id = (await db.query('SELECT id FROM samadhan.agents WHERE email = $1', [A2])).rows[0].id;
    await call(A1, 'PATCH', `/tickets/${vpn[1].id}`, { agentId: a2id });
    r = await call(A1, 'PATCH', `/tickets/${prob.id}`, { statusId: 4, resolutionCode: 'Fixed – configuration' });
    check(r.status === 200, 'problem resolved', r.body);
    const told = Number((await db.query(`SELECT count(*) AS n FROM samadhan.notifications WHERE "ticketId" = $1 AND "agentId" = $2 AND title LIKE 'Problem resolved%'`, [prob.id, a2id])).rows[0].n);
    check(told >= 1, 'agents of the linked open incidents are told', { told, a2id, a1: a1.id });

    // dismiss
    for (const i of [1, 2, 3]) await ticket(A1, { subject: `Printer jam ${i}`, applicationId: app('EUC').id, category: 'End-user IT', function: 'Printer / Scanner' });
    await jobs();
    const c2 = (await call(A1, 'GET', '/problem-candidates')).body.items.find((c) => c.function === 'Printer / Scanner');
    r = await call(A1, 'POST', `/problem-candidates/${c2.id}/dismiss`);
    await jobs();
    r = await call(A1, 'GET', '/problem-candidates');
    check(!r.body.items.some((c) => c.id === c2.id), 'a dismissed candidate stays dismissed');

    // ---- duplicates, health, registers ----
    r = await call(A1, 'GET', `/duplicates?applicationId=${app('NET').id}&subject=VPN%20drops`);
    check(r.status === 200 && r.body.items.length >= 2 && r.body.items.every((x) => /^NET-/.test(x.ref)), 'duplicate hint: open NET tickets about VPN drops in 24 h', r.body.items?.length);
    r = await call(A1, 'GET', `/duplicates?applicationId=${app('SAP').id}&tcode=VF01`);
    check(r.body.items.length === 0, 'resolved tickets are not offered as duplicates');
    r = await call(A1, 'GET', '/service-health');
    check(r.status === 200 && r.body.problems >= 1 && r.body.knownErrors >= 1 && typeof r.body.major === 'number' && Array.isArray(r.body.majorList), 'service health counts', r.body);
    r = await call(SUP, 'GET', '/registers/problem');
    check(r.status === 200 && r.body.rows.some((x) => x.id === prob.id && x.knownError === true && x.incidents === 3), 'Problem / KEDB Register', r.body.rows?.[0]);
    r = await call(SUP, 'GET', '/registers/major');
    check(r.body.rows.some((x) => x.id === mi.id && x.summary) && r.body.rows.some((x) => x.id === net.id), 'Major Incident Register with the PIR');

    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: false });
    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
