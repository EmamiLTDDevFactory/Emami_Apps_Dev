'use strict';
/*
   v7 Phase 8 - the S/4HANA Programme desk end to end against a running backend (fresh throwaway database):
   types and process-area tree, defect severity -> priority and SLA, routing, retest (Failed -> Retest), defect resolve rule,
   programme filters, burn-down / KPIs / hypercare today, the S/4 Defect Tracker and Hypercare Daily registers.
     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/program.api.test.js
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
const ADMIN = 'g.admin@emamigroup.com';
const SUP = 'g.sup@emamigroup.com';
const A1 = 'g.agent1@emamigroup.com';
const A2 = 'g.agent2@emamigroup.com';
const ticket = (who, body) => call(who, 'POST', '/tickets', { requesterName: 'Key User', requesterEmail: 'key.user@example.com', ...body });

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query("INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, 'samadhan', $2) ON CONFLICT DO NOTHING", [email, role]);
    }
    await call(A1, 'GET', '/me');
    await call(SUP, 'GET', '/me');
    let r = await call(ADMIN, 'GET', '/admin/workspaces');
    const ws = Object.fromEntries(r.body.workspaces.map((w) => [w.key, w]));
    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: true });
    await call(ADMIN, 'PUT', `/admin/workspaces/${ws.S4_PROGRAM.id}`, { enabled: true });
    const meta = (await call(A1, 'GET', '/meta')).body;
    const app = meta.applications.find((a) => a.code === 'S4P');
    const group = (n) => meta.groups.find((g) => g.name === n)?.id;
    const status = (n) => meta.statuses.find((s) => s.name === n)?.id;
    const s4 = meta.byWorkspace.S4_PROGRAM;
    check(meta.programLists?.testCycle?.includes('Mock Cutover 2') && meta.programLists.defectSeverity.length === 4, 'meta: programme lists');
    check(s4.tree.some((n) => n.value === 'Data Migration' && n.children.includes('Material')) && s4.tree.some((n) => n.value === 'Cutover'), 'Process area -> Sub-process tree', s4.tree.length);
    const types = s4.fields.find((f) => f.key === 'type').recordClasses;
    check(types?.['Defect – UAT'] === 'DEFECT' && types['Cutover Task'] === 'TASK' && types['Risk'] === 'RISK' && types['Hypercare Incident'] === 'INCIDENT', 'types carry their record class');
    check(['PMO', 'Defect Triage', 'Data Migration', 'Cutover'].every((g) => group(g)), 'programme groups seeded');

    // ---- defects ----
    const count = async () => Number((await db.query('SELECT count(*) AS n FROM samadhan.tickets')).rows[0].n);
    const n0 = await count();
    r = await ticket(A1, { subject: 'Bad cycle', applicationId: app.id, type: 'Defect – UAT', program: { testCycle: 'UAT-9' } });
    check(r.status === 400 && /Test cycle/.test(r.body.error) && (await count()) === n0, 'programme fields validated before the ticket exists', r.body);
    r = await ticket(A1, { subject: 'Pricing wrong in UAT', applicationId: app.id, type: 'Defect – UAT', category: 'Order to Cash (SD)', function: 'Pricing',
        program: { testCycle: 'UAT', defectSeverity: 'S1 Critical', testCaseId: 'TC-SD-101', processArea: 'Order to Cash (SD)', activatePhase: 'Realize' } });
    const d1 = r.body.ticket;
    check(r.status === 201 && d1.recordClass === 'DEFECT' && /^S4P-\d+$/.test(d1.ref) && d1.groupId === group('Defect Triage'), 'defect: record class from the type, S4P reference, Defect Triage', { s: r.status, b: r.status !== 201 ? r.body : { rc: d1.recordClass, g: d1.groupId } });
    check(d1.priority === 4 && d1.resolutionDueAt, 'S1 Critical -> Urgent, with a resolution due date', d1.priority);
    r = await ticket(A1, { subject: 'Material load rejects', applicationId: app.id, type: 'Data Migration Issue', category: 'Data Migration', function: 'Material', program: { testCycle: 'Mock Cutover 1', defectSeverity: 'S3 Medium' } });
    const d2 = r.body.ticket;
    check(d2.groupId === group('Data Migration') && d2.priority === 2, 'Data Migration -> Data Migration group; S3 -> Medium', { g: d2.groupId, p: d2.priority });
    let d = (await call(A1, 'GET', `/tickets/${d1.id}`)).body;
    check(d.program?.testCaseId === 'TC-SD-101' && d.program.defectSeverity === 'S1 Critical', 'ticket detail includes programme details');

    // ---- retest and resolve rules ----
    r = await call(A1, 'PATCH', `/tickets/${d1.id}`, { statusId: 4 });
    check(r.status === 400 && /Retest result/.test(r.body.error), 'a defect cannot be resolved before a Passed retest', r.body);
    r = await call(A1, 'PUT', `/tickets/${d1.id}/program`, { retestStatus: 'Failed' });
    d = (await call(A1, 'GET', `/tickets/${d1.id}`)).body;
    check(r.status === 200 && r.body.program.retestBy && d.ticket.statusId === status('Retest'), 'retest Failed -> status Retest (who / when recorded)', d.ticket.statusId);
    r = await call(A1, 'PUT', `/tickets/${d1.id}/program`, { retestStatus: 'Maybe' });
    check(r.status === 400, 'retest result from the list');
    r = await call(A1, 'PUT', `/tickets/${d1.id}/program`, { retestStatus: 'Passed', defectSeverity: 'S2 High' });
    d = (await call(A1, 'GET', `/tickets/${d1.id}`)).body;
    check(d.ticket.priority === 3 && d.activities.some((a) => a.action === 'retest'), 'severity change resets the priority; retest in the history');
    r = await call(A1, 'PATCH', `/tickets/${d1.id}`, { statusId: 4 });
    check(r.status === 200, 'resolved after a Passed retest', r.body);
    r = await ticket(A1, { subject: 'Cutover step 14 late', applicationId: app.id, type: 'Cutover Task', category: 'Cutover', function: 'Data Loads', program: { cutoverStepId: 'CO-14', mockCycle: 'Mock 2' } });
    check(r.status === 201 && r.body.ticket.recordClass === 'TASK' && r.body.ticket.groupId === group('Cutover'), 'cutover task -> TASK, Cutover group');
    r = await call(A1, 'PATCH', `/tickets/${r.body.ticket.id}`, { statusId: 4 });
    check(r.status === 200, 'tasks are not held by the defect rule');

    // ---- hypercare, filters, overview, registers ----
    r = await ticket(A1, { subject: 'Invoice print missing logo', applicationId: app.id, type: 'Hypercare Incident', category: 'Order to Cash (SD)', program: { activatePhase: 'Hypercare' } });
    const hc = r.body.ticket;
    r = await call(A1, 'GET', '/tickets?view=all&testCycle=UAT');
    check(r.body.items.length === 1 && r.body.items[0].id === d1.id, 'filter: test cycle');
    r = await call(A1, 'GET', '/tickets?view=all&defectSeverity=S3%20Medium');
    check(r.body.items.some((t) => t.id === d2.id), 'filter: severity');
    r = await call(A1, 'GET', '/tickets?view=all&phase=Hypercare');
    check(r.body.items.some((t) => t.id === hc.id), 'filter: Activate phase');
    r = await call(A1, 'GET', '/program/overview?days=14');
    const o = r.body;
    check(r.status === 200 && o.burndown.length === 14 && o.burndown[13].found >= 2 && o.burndown[13].open >= 1, 'burn-down: 14 days, today found / open', o.burndown?.[13]);
    check(o.kpis.total === 2 && o.kpis.open === 1 && o.kpis.retestPassPct === 100 && o.kpis.leakagePct === 50, 'KPIs: totals, retest pass %, leakage % (UAT is late)', o.kpis);
    check(o.kpis.byArea.some((a) => a.k === 'Order to Cash (SD)') && o.kpis.bySeverity.some((s) => s.k === 'S3 Medium'), 'KPIs by process area and severity');
    check(o.hypercare.some((h) => h.id === hc.id), 'hypercare today lists the hypercare incident');
    r = await call(SUP, 'GET', '/registers/defects');
    check(r.status === 200 && r.body.rows.length === 2 && r.body.rows.some((x) => x.id === d1.id && x.retestStatus === 'Passed'), 'S/4 Defect Tracker register', r.body.rows?.length);
    r = await call(SUP, 'GET', '/registers/hypercare');
    check(r.body.rows.some((x) => x.id === hc.id), 'Hypercare Daily register');
    r = await call(ADMIN, 'GET', '/admin/sla');
    check(r.body.policies?.some((p) => p.name === 'S/4HANA Programme defects' && p.targets.length === 4), 'programme defect SLA policy (S1 1 / S2 2 / S3 5 / S4 10 business days)', r.body.policies?.map((p) => p.name));

    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: false });
    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
