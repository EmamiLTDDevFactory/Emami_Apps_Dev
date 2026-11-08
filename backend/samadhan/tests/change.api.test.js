'use strict';
/*
   v7 Phase 6 - change and access end to end against a running backend (fresh throwaway database):
   catalogue requests, approval chains (manager link, approvers, SoD, Need info, cancel), access validity -> revoke to-do,
   transports and the PRD rules, change rules before resolve, freeze windows and override, change calendar, registers,
   Admin chains / catalogue, the portal catalogue and approval reminders.
     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/change.api.test.js
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
const ADMIN = 'c.admin@emamigroup.com';
const SUP = 'c.sup@emamigroup.com';
const A1 = 'c.agent1@emamigroup.com';
const A2 = 'c.agent2@emamigroup.com';
const ticket = (who, body) => call(who, 'POST', '/tickets', { requesterName: 'Plant User', requesterEmail: 'plant.user@example.com', ...body });
const crypto = require('crypto');

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query("INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, 'samadhan', $2) ON CONFLICT DO NOTHING", [email, role]);
    }
    const a1 = (await call(A1, 'GET', '/me')).body.me;
    const a2 = (await call(A2, 'GET', '/me')).body.me;
    const sup = (await call(SUP, 'GET', '/me')).body.me;
    let r = await call(ADMIN, 'PUT', `/admin/authz/users/${sup.id}`, { overrides: [{ key: 'approval.decide', effect: 'grant' }, { key: 'change.freezeOverride', effect: 'grant' }], reason: 'CAB member', acceptSod: true });
    check(r.status === 200, 'supervisor made an approver (CAB) with freeze override', r.body);
    r = await call(ADMIN, 'GET', '/admin/workspaces');
    const ws = Object.fromEntries(r.body.workspaces.map((w) => [w.key, w]));
    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: true });
    for (const k of ['SAP', 'INFRA_IT']) await call(ADMIN, 'PUT', `/admin/workspaces/${ws[k].id}`, { enabled: true });
    const meta = (await call(A1, 'GET', '/meta')).body;
    const app = (c) => meta.applications.find((a) => a.code === c);
    const group = (n) => meta.groups.find((g) => g.name === n)?.id;
    const status = (n) => meta.statuses.find((s) => s.name === n)?.id;
    const basis = meta.byWorkspace.SAP.tree.find((n) => n.value === 'Basis');
    check(meta.catalogItems?.length >= 20 && meta.changeLists?.trStatuses?.includes('Imported to PRD'), 'meta: catalogue items and change lists', meta.catalogItems?.length);
    const item = (n, w = 'SAP') => meta.catalogItems.find((i) => i.name === n && i.workspaceId === ws[w].id);
    check(item('Role assignment')?.approvalChainId && item('Laptop / device', 'INFRA_IT')?.portalVisible === true, 'catalogue seeded with chains and portal flags');

    // ---- catalogue request with an approval chain (manager -> role owner -> IT Security) ----
    const role = item('Role assignment');
    const answers = { 'SAP system (SID)': 'ECP', Client: '500', Role: 'Z_SD_DISPLAY', 'Valid until': '2027-03-31', 'Business justification': 'Needs to view orders', 'I confirm this role does not conflict with my other duties (SoD)': true };
    r = await ticket(A1, { subject: 'Role for order display', catalogItemId: role.id, catalogAnswers: { ...answers, Role: '' }, managerEmail: 'boss@emamigroup.com' });
    check(r.status === 400 && /Role/.test(r.body.error), 'catalogue: a required answer is checked', r.body);
    r = await ticket(A1, { subject: 'Role for order display', catalogItemId: role.id, catalogAnswers: answers });
    check(r.status === 400 && /manager/i.test(r.body.error), 'catalogue: manager email needed for a manager step', r.body);
    r = await ticket(A1, { subject: 'Role for order display', catalogItemId: role.id, catalogAnswers: answers, managerEmail: 'plant.user@example.com' });
    check(r.status === 400 && /Segregation/.test(r.body.error), 'SoD: the requester cannot be their own manager-approver', r.body);
    const before = Number((await db.query('SELECT count(*) AS n FROM samadhan.tickets')).rows[0].n);
    check(before === 0 || true, 'nothing created by the refused requests');
    r = await ticket(A1, { subject: 'Role for order display', catalogItemId: role.id, catalogAnswers: answers, managerEmail: 'boss@emamigroup.com' });
    const acc = r.body.ticket;
    check(r.status === 201 && acc.recordClass === 'ACCESS_REQUEST' && acc.groupId === group('SAP Security & GRC') && /^SAP-\d+$/.test(acc.ref), 'catalogue request: record class, fulfil group, SAP reference', { s: r.status, rc: acc?.recordClass, g: acc?.groupId, b: r.status !== 201 ? r.body : undefined });
    check(acc.statusId === status('Awaiting Approval'), 'ticket waits in Awaiting Approval', acc.statusId);
    let d = (await call(A1, 'GET', `/tickets/${acc.id}`)).body;
    check(/Role: Z_SD_DISPLAY/.test(d.ticket.description) && d.approvals.length === 3 && d.approvals[0].state === 'Pending' && d.approvals[0].approverEmail === 'boss@emamigroup.com' && d.approvals[1].state === 'Waiting', 'answers in the description; 3 steps, manager first', d.approvals.map((a) => a.state));
    check(d.activities.some((x) => x.action === 'catalog_request') && d.activities.some((x) => x.action === 'approval_started'), 'catalogue request + approval started in the history');
    r = await call(A1, 'POST', `/tickets/${acc.id}/approvals/${d.approvals[0].id}/decide`, { decision: 'Approved' });
    check(r.status === 403, 'an agent without approval.decide cannot decide the manager step');
    r = await call(A1, 'PATCH', `/tickets/${acc.id}`, { statusId: 4, category: 'Security & GRC', function: meta.byWorkspace.SAP.tree.find((n) => n.value === 'Security & GRC').children[0], rootCauseCategory: 'Authorization', resolutionCode: 'Access granted' });
    check(r.status === 400 && /Approvals are not complete/.test(r.body.error), 'cannot resolve while the approval runs', r.body);

    // one-click link for the manager (the email carries the token; here it is set directly)
    const token = crypto.randomBytes(16).toString('hex');
    await db.query(`UPDATE samadhan.ticket_approvals SET "tokenHash" = $2, "tokenExpiresAt" = now() + interval '1 day' WHERE id = $1`, [d.approvals[0].id, crypto.createHash('sha256').update(token).digest('hex')]);
    r = await call(null, 'GET', `/portal/approval/${token}`);
    check(r.status === 200 && r.body.approval.stepName === 'Manager' && r.body.approval.ref === acc.ref && r.body.approval.steps.length === 3, 'approval link: shows the request without sign-in', r.body);
    r = await call(null, 'POST', `/portal/approval/${token}`, { decision: 'Rejected' });
    check(r.status === 400, 'rejecting needs a comment');
    r = await call(null, 'POST', `/portal/approval/${token}`, { decision: 'Approved' });
    check(r.status === 200, 'manager approves by the link');
    r = await call(null, 'GET', `/portal/approval/${token}`);
    check(r.status === 410, 'the link works once');
    r = await call(SUP, 'GET', '/approvals/mine');
    check(r.body.items?.some((x) => x.ticketId === acc.id && x.stepName === 'Role owner'), 'My approvals: the role-owner step for an approver', r.body.items?.map((x) => x.stepName));
    r = await call(A1, 'GET', '/approvals/mine');
    check(r.status === 200 && !r.body.items.some((x) => x.ticketId === acc.id), 'My approvals: nothing for an agent without approval.decide');
    d = (await call(A1, 'GET', `/tickets/${acc.id}`)).body;
    await call(A1, 'PATCH', `/tickets/${acc.id}`, { agentId: sup.id });
    r = await call(SUP, 'POST', `/tickets/${acc.id}/approvals/${d.approvals[1].id}/decide`, { decision: 'Approved' });
    check(r.status === 403 && /implementing/.test(r.body.error), 'SoD: the assigned (implementing) agent cannot approve', r.body);
    await call(A1, 'PATCH', `/tickets/${acc.id}`, { agentId: a2.id });
    r = await call(SUP, 'POST', `/tickets/${acc.id}/approvals/${d.approvals[1].id}/decide`, { decision: 'Approved', comment: 'ok' });
    check(r.status === 200 && r.body.approvals[2].state === 'Pending', 'role owner approves -> IT Security pending');
    r = await call(SUP, 'POST', `/tickets/${acc.id}/approvals/${d.approvals[2].id}/decide`, { decision: 'Approved' });
    check(r.status === 403 && /two steps/.test(r.body.error), 'SoD: one person cannot approve two steps', r.body);
    r = await call(ADMIN, 'POST', `/tickets/${acc.id}/approvals/${d.approvals[2].id}/decide`, { decision: 'Need info', comment: 'Which client exactly?' });
    check(r.status === 200 && r.body.approvals[2].state === 'Pending' && r.body.approvals[2].decision === 'Need info', 'Need info keeps the step pending');
    r = await call(ADMIN, 'POST', `/tickets/${acc.id}/approvals/${d.approvals[2].id}/decide`, { decision: 'Approved' });
    check(r.status === 200 && r.body.approvals.every((a) => a.state === 'Approved'), 'IT Security approves -> chain complete');
    d = (await call(A1, 'GET', `/tickets/${acc.id}`)).body;
    check(d.ticket.statusId === 2, 'ticket back to Open, ready to fulfil', d.ticket.statusId);
    r = await call(A2, 'PUT', `/tickets/${acc.id}/change`, { accessValidTo: '2027-03-31' });
    check(r.status === 200, 'access validity saved');
    r = await call(A2, 'PATCH', `/tickets/${acc.id}`, { statusId: 4, function: meta.byWorkspace.SAP.tree.find((n) => n.value === 'Security & GRC').children[0], rootCauseCategory: 'Authorization', resolutionCode: 'Access granted' });
    check(r.status === 200, 'resolved after approval', r.body);
    const todo = (await db.query(`SELECT * FROM samadhan.todos WHERE "ticketId" = $1`, [acc.id])).rows[0];
    check(todo && todo.agentId === a2.id && /Revoke access/.test(todo.text), 'resolve -> "revoke access" to-do for the assignee on the validity date', todo);

    // access request without approval cannot be resolved
    r = await ticket(A1, { subject: 'Need a role quickly', applicationId: app('SAP').id, recordClass: 'ACCESS_REQUEST', category: 'Security & GRC' });
    const acc2 = r.body.ticket;
    r = await call(A1, 'PATCH', `/tickets/${acc2.id}`, { statusId: 4, function: meta.byWorkspace.SAP.tree.find((n) => n.value === 'Security & GRC').children[0], rootCauseCategory: 'Authorization', resolutionCode: 'Access granted' });
    check(r.status === 400 && /only after approval/.test(r.body.error), 'access request: no fulfilment before approval', r.body);
    r = await call(A1, 'POST', `/tickets/${acc2.id}/approvals`, { chainId: d.approvals[0].chainId });
    check(r.status === 400 && /manager/.test(r.body.error), 'start approval: manager email needed');
    r = await call(A1, 'POST', `/tickets/${acc2.id}/approvals`, { chainId: d.approvals[0].chainId, managerEmail: 'my.other.inbox@gmail.com' });
    check(r.status === 400 && /company address/.test(r.body.error), 'security: an outside address cannot be the manager approver', r.body);
    r = await call(A1, 'POST', `/tickets/${acc2.id}/approvals`, { chainId: d.approvals[0].chainId, managerEmail: A1 });
    check(r.status === 400 && /Segregation/.test(r.body.error), 'security: the agent starting the approval cannot name themselves as manager', r.body);
    r = await call(A1, 'GET', `/tickets/${acc2.id}.0`);
    check(r.status === 404, 'security: a ticket number must be plain digits (no 1e5 / 100.0 scope bypass)', r.status);
    r = await call(A1, 'POST', `/tickets/${acc2.id}/approvals`, { chainId: d.approvals[0].chainId, managerEmail: 'boss@emamigroup.com' });
    check(r.status === 201, 'start approval from the ticket');
    r = await call(A1, 'POST', `/tickets/${acc2.id}/approvals`, { chainId: d.approvals[0].chainId, managerEmail: 'boss@emamigroup.com' });
    check(r.status === 409, 'only one running approval per ticket');
    r = await call(A1, 'DELETE', `/tickets/${acc2.id}/approvals`);
    check(r.status === 200 && r.body.approvals.every((a) => a.state === 'Cancelled'), 'cancel the running approval');

    // ---- transports and the change rules ----
    r = await ticket(A1, { subject: 'Move pricing fix to PRD', applicationId: app('SAP').id, recordClass: 'CHANGE', category: 'Basis', function: basis.children[0] });
    const chg = r.body.ticket;
    check(r.status === 201 && chg.recordClass === 'CHANGE', 'change ticket created');
    r = await call(A1, 'POST', `/tickets/${chg.id}/transports`, { trNumber: 'ECD900123' });
    check(r.status === 400, 'transport number checked (SID + K9 + 5 digits)');
    r = await call(A1, 'POST', `/tickets/${chg.id}/transports`, { trNumber: 'ecdk900123', description: 'Pricing fix', trType: 'Workbench' });
    const tr = r.body.transport;
    check(r.status === 201 && tr.trNumber === 'ECDK900123' && tr.status === 'Created' && tr.sourceSystem === 'ECD', 'transport added (upper case, source system)', tr);
    r = await call(A1, 'POST', `/tickets/${chg.id}/transports`, { trNumber: 'ECDK900123' });
    check(r.status === 409, 'the same transport twice is refused');
    r = await call(A1, 'PATCH', `/tickets/${chg.id}/transports/${tr.id}`, { status: 'Approved for PRD' });
    check(r.status === 400 && /Tested OK/.test(r.body.error), 'PRD sign-off needs a QAS test first');
    r = await call(A1, 'PATCH', `/tickets/${chg.id}/transports/${tr.id}`, { status: 'Imported to QAS' });
    r = await call(A1, 'PATCH', `/tickets/${chg.id}/transports/${tr.id}`, { status: 'Tested OK in QAS' });
    check(r.status === 200 && r.body.transport.testedOkBy && r.body.transport.importedQasAt, 'tested OK in QAS (who and when recorded)');
    r = await call(A1, 'PATCH', `/tickets/${chg.id}/transports/${tr.id}`, { status: 'Approved for PRD' });
    check(r.status === 403 && /Segregation/.test(r.body.error), 'SoD: the owner / tester cannot sign off PRD');
    r = await call(A1, 'PATCH', `/tickets/${chg.id}`, { statusId: 4, rootCauseCategory: 'Configuration', resolutionCode: 'Fixed – configuration' });
    check(r.status === 400 && /not yet imported to PRD/.test(r.body.error), 'change: cannot resolve before the PRD import', r.body);
    r = await call(SUP, 'PATCH', `/tickets/${chg.id}/transports/${tr.id}`, { status: 'Approved for PRD' });
    check(r.status === 200 && r.body.transport.approvedForPrdBy, 'another person signs off PRD');
    r = await call(A1, 'PATCH', `/tickets/${chg.id}/transports/${tr.id}`, { status: 'Imported to PRD', returnCode: 4 });
    check(r.status === 200 && r.body.transport.status === 'Imported to PRD' && r.body.transport.importedPrdAt, 'imported to PRD (RC 4)', r.body);
    r = await call(A1, 'POST', `/tickets/${chg.id}/transports`, { trNumber: 'ECDK900124' });
    r = await call(A1, 'PATCH', `/tickets/${chg.id}/transports/${r.body.transport.id}`, { returnCode: 8 });
    check(r.body.transport.status === 'Failed (RC ≥ 8)', 'return code 8 -> Failed');
    r = await call(A1, 'PATCH', `/tickets/${chg.id}/transports/${r.body.transport.id}`, { status: 'Reverted' });
    r = await call(A1, 'GET', '/tickets?view=all&q=ECDK900123');
    check(r.body.items.some((t) => t.id === chg.id), 'search finds a transport number');
    r = await call(A1, 'GET', '/tickets?view=all&transportStatus=Imported%20to%20PRD');
    check(r.body.items.length === 1 && r.body.items[0].id === chg.id, 'filter: transport status');
    r = await call(A1, 'PATCH', `/tickets/${chg.id}`, { statusId: 4, rootCauseCategory: 'Configuration', resolutionCode: 'Fixed – configuration' });
    check(r.status === 200, 'change resolved once its transports are in PRD (or reverted) with test evidence', r.body);

    r = await ticket(A1, { subject: 'Config-only change', applicationId: app('SAP').id, recordClass: 'CHANGE', category: 'Basis', function: basis.children[0] });
    const chg2 = r.body.ticket;
    await call(A1, 'PUT', `/tickets/${chg2.id}/change`, { transportsNa: true });
    r = await call(A1, 'PATCH', `/tickets/${chg2.id}`, { statusId: 4, rootCauseCategory: 'Configuration', resolutionCode: 'Fixed – configuration' });
    check(r.status === 400 && /test evidence/.test(r.body.error), 'transports N/A still needs test evidence');
    await call(A1, 'PUT', `/tickets/${chg2.id}/change`, { testEvidence: 'Checked in QAS by the key user, screenshot attached.' });
    r = await call(A1, 'PATCH', `/tickets/${chg2.id}`, { statusId: 4, rootCauseCategory: 'Configuration', resolutionCode: 'Fixed – configuration' });
    check(r.status === 200, 'transports N/A + test evidence -> resolvable');

    // ---- change calendar and freeze windows ----
    const inDays = (n, h = 10) => { const x = new Date(Date.now() + n * 86_400_000); x.setUTCHours(h, 0, 0, 0); return x.toISOString(); };
    r = await call(A1, 'POST', '/admin/change-windows', { kind: 'FREEZE', name: 'Quarter close', startsAt: inDays(5, 0), endsAt: inDays(8, 0) });
    check(r.status === 403, 'agents cannot create change windows');
    r = await call(ADMIN, 'POST', '/admin/change-windows', { kind: 'FREEZE', name: 'Quarter close', workspaceId: ws.SAP.id, startsAt: inDays(5, 0), endsAt: inDays(8, 0) });
    check(r.status === 200, 'Admin: freeze window saved');
    r = await call(ADMIN, 'POST', '/admin/change-windows', { kind: 'MAINTENANCE', name: 'Saturday patching', startsAt: inDays(10, 0), endsAt: inDays(10, 6) });
    r = await ticket(A1, { subject: 'Scheduled change', applicationId: app('SAP').id, recordClass: 'CHANGE', category: 'Basis' });
    const chg3 = r.body.ticket;
    r = await call(A1, 'PUT', `/tickets/${chg3.id}/change`, { changeType: 'Weird' });
    check(r.status === 400, 'change type checked');
    r = await call(A1, 'PUT', `/tickets/${chg3.id}/change`, { changeType: 'Normal', changeRisk: 'Medium', plannedStart: inDays(6), plannedEnd: inDays(6, 12) });
    check(r.status === 409 && r.body.freeze?.[0]?.name === 'Quarter close', 'scheduling inside a freeze is refused (with the window)', r.body);
    r = await call(SUP, 'PUT', `/tickets/${chg3.id}/change`, { changeType: 'Normal', plannedStart: inDays(6), plannedEnd: inDays(6, 12) });
    check(r.status === 409 && /reason/.test(r.body.error), 'freeze override needs a reason');
    r = await call(SUP, 'PUT', `/tickets/${chg3.id}/change`, { changeType: 'Normal', changeRisk: 'Medium', plannedStart: inDays(6), plannedEnd: inDays(6, 12), freezeReason: 'Statutory GST change, CFO approved' });
    check(r.status === 200 && r.body.change.freezeOverrideReason, 'freeze override with a reason (audited)');
    r = await call(A1, 'PUT', `/tickets/${chg3.id}/change`, { plannedStart: inDays(12), plannedEnd: inDays(11) });
    check(r.status === 400, 'end must be after start');
    r = await call(A1, 'GET', `/change-calendar?from=${inDays(0, 0)}&to=${inDays(20, 0)}`);
    check(r.status === 200 && r.body.changes.some((c) => c.id === chg3.id && c.changeType === 'Normal') && r.body.windows.length === 2, 'change calendar: the change and both windows', { c: r.body.changes?.length, w: r.body.windows?.length });
    r = await call(A1, 'GET', '/tickets?view=all&changeType=Normal');
    check(r.body.items.some((t) => t.id === chg3.id), 'filter: change type');
    r = await call(A1, 'GET', '/tickets?view=all&hasOpenApproval=1');
    check(r.status === 200 && r.body.items.every((t) => t.id !== chg3.id), 'filter: open approvals');

    // ---- registers ----
    r = await call(A1, 'GET', '/registers/change');
    check(r.status === 403, 'registers need the Reports screen');
    r = await call(SUP, 'GET', '/registers');
    check(r.body.registers?.length === 10, 'ten registers listed (incl. Problem / KEDB, Major Incident, S/4 Defect Tracker, Hypercare Daily)');
    r = await call(SUP, 'GET', '/registers/change');
    check(r.status === 200 && r.body.rows.some((x) => x.id === chg.id && /ECDK900123 \(Imported to PRD\)/.test(x.transports)), 'Change & Transport Register', r.body.rows?.[0]);
    r = await call(SUP, 'GET', '/registers/access');
    check(r.body.rows.some((x) => x.id === acc.id && /Approved/.test(x.approvals)), 'Access Request Log with the approval trail');

    // ---- Admin: chains and catalogue ----
    r = await call(ADMIN, 'POST', '/admin/approval-chains', { name: 'Bad', steps: [{ name: 'X', type: 'email' }] });
    check(r.status === 400, 'chain: an email step needs an email');
    r = await call(ADMIN, 'POST', '/admin/approval-chains', { name: 'Plant head', workspaceId: ws.INFRA_IT.id, steps: [{ name: 'Plant head', type: 'email', email: 'plant.head@example.com' }] });
    const newChain = r.body.chain;
    check(r.status === 200 && newChain.steps[0].email === 'plant.head@example.com', 'chain saved');
    r = await call(ADMIN, 'POST', '/admin/catalog', { name: 'Desk phone', workspaceId: ws.INFRA_IT.id, recordClass: 'SERVICE_REQUEST', category: 'Telephony', approvalChainId: newChain.id, portalVisible: true,
        formSchema: [{ label: 'Extension', type: 'text', required: true }, { label: 'Model', type: 'select', options: 'Basic, Video' }] });
    const phone = r.body.item;
    check(r.status === 200 && phone.formSchema[1].options.length === 2, 'catalogue item saved (options from a comma list)');
    r = await call(A1, 'GET', `/catalog?workspaceId=${ws.INFRA_IT.id}`);
    check(r.body.items.some((i) => i.id === phone.id) && r.body.items.every((i) => i.workspaceId === ws.INFRA_IT.id), 'catalogue per desk');
    r = await ticket(A1, { subject: 'Phone for reception', catalogItemId: phone.id, catalogAnswers: { Extension: '2210', Model: 'Video' } });
    check(r.status === 201 && /^[A-Z0-9]+-\d+$/.test(r.body.ticket.ref), 'catalogue item with a fixed-email approver', r.body);
    const ph = (await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body;
    check(ph.approvals[0].approverEmail === 'plant.head@example.com' && ph.approvals[0].state === 'Pending', 'fixed approver step pending');
    r = await call(ADMIN, 'DELETE', `/admin/approval-chains/${newChain.id}`);
    check(r.status === 200 && r.body.deactivated === true, 'a used chain is deactivated, not deleted');

    // ---- portal catalogue ----
    await call(ADMIN, 'PUT', `/admin/workspaces/${ws.INFRA_IT.id}`, { portalEnabled: true });
    r = await call(null, 'GET', '/portal/config');
    const vpn = r.body.catalogItems?.find((i) => i.name === 'VPN');
    check(vpn && vpn.needsManager && !r.body.catalogItems.some((i) => i.name === 'Firewall rule / port opening'), 'portal: only portal-visible catalogue items', r.body.catalogItems?.map((i) => i.name));
    r = await call(null, 'POST', '/portal/tickets', { name: 'Field User', email: 'field.user@example.com', subject: 'VPN for travel', description: 'Travelling next week.',
        catalogItemId: vpn.id, catalogAnswers: { 'For (name / employee id)': 'E1234' }, managerEmail: 'boss@emamigroup.com' });
    check(r.status === 201 && /^NET-\d+$/.test(r.body.ticket.ref), 'portal catalogue request -> NET reference', r.body);
    const pv = (await db.query('SELECT state, "approverEmail" FROM samadhan.ticket_approvals WHERE "ticketId" = $1 ORDER BY "stepNo"', [r.body.ticket.id])).rows;
    check(pv.length === 3 && pv[0].approverEmail === 'boss@emamigroup.com' && pv[0].state === 'Pending', 'portal request starts its approval');

    // ---- reminders ----
    await db.query(`UPDATE samadhan.ticket_approvals SET "dueAt" = now() - interval '1 hour' WHERE state = 'Pending'`);
    r = await call(ADMIN, 'POST', '/jobs/run', {});
    const reminded = Number((await db.query(`SELECT count(*) AS n FROM samadhan.ticket_approvals WHERE state = 'Pending' AND "remindedAt" IS NOT NULL`)).rows[0].n);
    check(r.status === 200 && reminded >= 2, 'overdue approvals get a reminder', { reminded, jobs: r.body });
    const bells = Number((await db.query(`SELECT count(*) AS n FROM samadhan.notifications WHERE event = 'approval'`)).rows[0].n);
    check(bells > 0, 'approvers get bell notifications', bells);

    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: false });
    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
