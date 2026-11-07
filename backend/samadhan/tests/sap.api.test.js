'use strict';
/*
   v7 Phase 4 - the SAP & Primary Sales desk end to end against a running backend (fresh throwaway database):
   routing by module, default group, record class from the type, Impact x Urgency + SAP SLA, required-before-resolve,
   SAP details validation, external references (Very High rule, ageing nudge), confidential tickets, reference masters,
   search and filters, desk-scoped automations.
     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/sap.api.test.js
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
const ADMIN = 's.admin@emamigroup.com';
const SUP = 's.sup@emamigroup.com';
const A1 = 's.agent1@emamigroup.com';
const A2 = 's.agent2@emamigroup.com';
const ticket = (who, body) => call(who, 'POST', '/tickets', { requesterName: 'Plant User', requesterEmail: 'plant.user@example.com', ...body });

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query("INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, 'samadhan', $2) ON CONFLICT DO NOTHING", [email, role]);
    }
    const a1 = (await call(A1, 'GET', '/me')).body.me;
    await call(A2, 'GET', '/me');
    // Turn on the desks (SAP) as an Admin would.
    let r = await call(ADMIN, 'GET', '/admin/workspaces');
    const ws = Object.fromEntries(r.body.workspaces.map((w) => [w.key, w]));
    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: true });
    await call(ADMIN, 'PUT', `/admin/workspaces/${ws.SAP.id}`, { enabled: true });
    const meta = (await call(A1, 'GET', '/meta')).body;
    const app = (c) => meta.applications.find((a) => a.code === c);
    check(meta.sapLists?.environment?.includes('Production') && meta.refMasterKinds.includes('TCODE'), 'meta: SAP lists and master kinds');
    const sapTree = meta.byWorkspace.SAP.tree;
    check(sapTree.some((n) => n.value === 'SD' && n.children.includes('Pricing & Conditions')) && !sapTree.some((n) => n.value === 'PM'), 'SAP Module -> Sub-process tree (inactive extras hidden)', sapTree.length);
    const sapFields = meta.byWorkspace.SAP.fields;
    check(sapFields.find((f) => f.key === 'distributorCode').visible === false && sapFields.find((f) => f.key === 'resolutionCode').visible !== false, 'SAP desk: distributor fields hidden, resolution code shown');
    check(meta.fields.every((f) => f.key !== 'resolutionCode' || f.visible === false), 'Secondary Sales: resolution code not shown (form unchanged)');
    check(sapFields.find((f) => f.key === 'type').recordClasses['Transport Movement'] === 'CHANGE', 'SAP types carry their record class');
    const sapStatuses = meta.statusWorkspaces.filter((s) => s.workspaceId === ws.SAP.id).map((s) => s.statusId);
    check(sapStatuses.includes(101) && !meta.statusWorkspaces.some((s) => s.workspaceId === ws.SEC_SALES.id), 'new statuses offered in the SAP desk only');
    check(meta.cannedResponses.some((c) => c.shortCode === 'sapinfo' && c.workspaceId === ws.SAP.id), 'SAP canned responses');

    // ---- create: routing by module, default group, SAP details, record class, SLA ----
    r = await ticket(A1, { subject: 'Price not picked in VA01', applicationId: app('SAP').id, category: 'SD', function: 'Pricing & Conditions', impact: 1, urgency: 1,
        sap: { environment: 'Production', tcode: 'va01', sapSystem: 'ecp', sapClient: '300', errorMessageClass: 'V1', errorMessageNo: '801' } });
    check(r.status === 201 || r.status === 200, 'create SAP ticket with SAP details', r.body?.error);
    let d = (await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body;
    const t1 = d.ticket;
    check(t1.groupName === 'SAP SD' && t1.workspaceKey === 'SAP' && t1.ref === `SAP-${t1.id}`, 'routed to SAP SD (module rule), not Customer Support', t1.groupName);
    check(d.sap && d.sap.tcode === 'VA01' && d.sap.sapSystem === 'ECP' && d.sap.environment === 'Production', 'SAP details stored (T-code / system upper case)', d.sap);
    check(t1.priority === 4 && Math.round((new Date(t1.resolutionDueAt) - new Date(t1.createdAt)) / 60000) === 240, 'Urgent via Impact x Urgency; SAP SLA 4 h (24x7)');
    r = await ticket(A1, { subject: 'Something in SAP', applicationId: app('SAP').id });
    let t2 = (await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body.ticket;
    check(t2.groupName === 'SAP Service Desk', 'no module -> the desk default group SAP Service Desk', t2.groupName);
    r = await ticket(A1, { subject: 'Move transport', applicationId: app('SAP').id, type: 'Transport Movement' });
    check((await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body.ticket.recordClass === 'CHANGE', 'type Transport Movement -> record class CHANGE');
    r = await ticket(A1, { subject: 'bad', applicationId: app('SAP').id, sap: { idocNumber: '123' } });
    check(r.status === 400 && /IDoc/.test(r.body.error), 'invalid IDoc refused before anything is saved');
    r = await ticket(A1, { subject: 'Sales', applicationId: app('MSFA').id });
    check((await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body.ticket.groupName === 'Customer Support', 'Secondary Sales still routed by its own rule');

    // ---- required before resolve (SAP incident) ----
    const resolved = meta.statuses.find((s) => s.isResolved && !s.isClosed).id;
    r = await call(A1, 'PATCH', `/tickets/${t2.id}`, { statusId: resolved });
    check(r.status === 400 && /Root cause/.test(r.body.error) && /Resolution code/.test(r.body.error) && /Environment/.test(r.body.error) && !/Distributor/.test(r.body.error),
        'resolve needs module, root cause, resolution code, environment - not distributor fields', r.body.error);
    await call(A1, 'PUT', `/tickets/${t2.id}/sap`, { environment: 'Quality / Test' });
    r = await call(A1, 'PATCH', `/tickets/${t2.id}`, { category: 'Basis', function: 'Performance', rootCauseCategory: 'Configuration', resolutionCode: 'Fixed – configuration' });
    check(r.status === 200, 'fill the SAP closure fields', r.body?.error);
    r = await call(A1, 'PATCH', `/tickets/${t2.id}`, { statusId: resolved });
    check(r.status === 200, 'then it resolves', r.body?.error);

    // ---- SAP details validation ----
    r = await call(A1, 'PUT', `/tickets/${t1.id}/sap`, { sapNotes: '2345678, abc' }); check(r.status === 400 && /digits/.test(r.body.error), 'SAP Note numbers digits only');
    r = await call(A1, 'PUT', `/tickets/${t1.id}/sap`, { tcode: 'va01;drop' }); check(r.status === 400, 'invalid T-code refused');
    r = await call(A1, 'PUT', `/tickets/${t1.id}/sap`, { sapNotes: '2345678 3000001', idocNumber: '0000 0000 1234 5678', usersAffected: 40 });
    check(r.status === 200 && r.body.sap.sapNotes.length === 2 && r.body.sap.idocNumber === '0000000012345678' && r.body.sap.tcode === 'VA01', 'SAP Notes / IDoc / users saved; other fields kept', r.body.sap);
    r = await call(A1, 'PUT', `/tickets/${t1.id}/sap`, { environment: 'Moon' }); check(r.status === 400, 'unknown environment refused');

    // ---- external references ----
    r = await call(A1, 'POST', `/tickets/${t1.id}/external-refs`, { system: 'Jira', ref: 'X-1' }); check(r.status === 400, 'unknown external system refused');
    r = await call(A1, 'POST', `/tickets/${t1.id}/external-refs`, { system: 'SAP for Me Case', ref: '000123/2026', priority: 'Very High', url: 'https://me.sap.com/case/1' });
    check(r.status === 201, 'Very High on a Production ticket: allowed', r.body?.error);
    const ref1 = r.body.ref;
    r = await call(A1, 'POST', `/tickets/${t2.id}/external-refs`, { system: 'SAP for Me Case', ref: '000124/2026', priority: 'Very High' });
    check(r.status === 400 && /justification/.test(r.body.error), 'Very High outside Production needs a justification');
    r = await call(A1, 'POST', `/tickets/${t2.id}/external-refs`, { system: 'SAP for Me Case', ref: '000124/2026', priority: 'Very High', justification: 'Month-end close blocked in QAS rehearsal' });
    check(r.status === 201, 'with a justification it is accepted');
    r = await call(A1, 'POST', `/tickets/${t2.id}/external-refs`, { system: 'SAP for Me Case', ref: 'x', url: 'http://insecure' }); check(r.status === 400, 'links must be https');
    r = await call(A1, 'PATCH', `/tickets/${t1.id}/external-refs/${ref1.id}`, { status: 'Customer Action' });
    check(r.status === 200 && r.body.ref.status === 'Customer Action', 'external reference updated');
    d = (await call(A1, 'GET', `/tickets/${t1.id}`)).body;
    check(d.externalRefs.length === 1 && d.externalRefs[0].ageDays === 0, 'ticket detail lists external references with age');
    r = await call(A1, 'GET', '/tickets?externalSystem=SAP%20for%20Me%20Case&view=all');
    check(r.body.items.length === 2, 'filter by external system', r.body.items.length);
    r = await call(A1, 'GET', '/tickets?q=000123&view=all'); check(r.body.items.some((x) => x.id === t1.id), 'search finds the SAP case number');
    r = await call(A1, 'GET', '/tickets?q=VA01&view=all'); check(r.body.items.some((x) => x.id === t1.id), 'search finds the T-code');
    r = await call(A1, 'GET', '/tickets?tcode=VA01&sapSystem=ECP&view=all'); check(r.body.items.length === 1 && r.body.items[0].id === t1.id, 'filter by T-code + system');
    r = await call(A1, 'GET', '/tickets?environment=Production&view=all'); check(r.body.items.every((x) => x.id !== t2.id), 'filter by environment');

    // Ageing nudge: no update for 2+ business days -> bell for the ticket's agent.
    await call(ADMIN, 'PUT', '/admin/settings', { 'bell.events': ['requester_reply', 'external_ref'] });
    await call(SUP, 'PATCH', `/tickets/${t1.id}`, { agentId: a1.id });
    await db.query(`UPDATE samadhan.ticket_external_refs SET "lastUpdateAt" = now() - interval '10 days' WHERE id = $1`, [ref1.id]);
    r = await call(null, 'POST', '/jobs/run', {}, { 'X-Internal-Secret': 'localtest' });
    check(r.status === 200 && r.body.result?.externalNudges >= 1, 'jobs: ageing nudge sent', r.body?.result?.externalNudges);
    r = await call(A1, 'GET', '/notifications');
    check((r.body.items || []).some((n) => n.event === 'external_ref' && n.title.includes(`SAP-${t1.id}`)), 'bell: "No update from SAP for Me Case ..." with the reference');
    r = await call(A1, 'DELETE', `/tickets/${t1.id}/external-refs/${ref1.id}`); check(r.status === 200, 'external reference removed');

    // ---- confidential (HR payroll) ----
    r = await ticket(A1, { subject: 'Salary not credited', applicationId: app('SAP').id, category: 'HR / HCM', function: 'Payroll (India)' });
    const conf = r.body.ticket;
    check(conf.confidential === true && conf.groupName === 'SAP HCM', 'payroll ticket is confidential by default; routed to SAP HCM');
    r = await call(A2, 'GET', `/tickets/${conf.id}`); check(r.status === 404, 'an Agent without "view confidential" gets 404');
    r = await call(A2, 'GET', '/tickets?view=all'); check(!r.body.items.some((x) => x.id === conf.id), 'and does not see it in lists');
    r = await call(SUP, 'GET', `/tickets/${conf.id}`); check(r.status === 200, 'a Supervisor can open it');
    r = await call(A1, 'PATCH', `/tickets/${t1.id}`, { confidential: true }); check(r.status === 403, 'an Agent cannot mark a ticket confidential');
    r = await call(SUP, 'PATCH', `/tickets/${t1.id}`, { confidential: true }); check(r.status === 200 && r.body.ticket.confidential === true, 'a Supervisor can');
    await call(SUP, 'PATCH', `/tickets/${t1.id}`, { confidential: false });

    // ---- reference masters ----
    r = await call(A1, 'POST', '/admin/ref-masters/import', { kind: 'TCODE', rows: [{ code: 'VA01' }] }); check(r.status === 403, 'agent cannot import masters');
    r = await call(ADMIN, 'POST', '/admin/ref-masters/import', { kind: 'NOPE', rows: [{ code: 'x' }] }); check(r.status === 400, 'unknown master kind');
    r = await call(ADMIN, 'POST', '/admin/ref-masters/import', { kind: 'TCODE', rows: [{ code: 'VA01', description: 'Create Sales Order' }, { code: 'VA02', description: 'Change Sales Order' }, { code: 'ME21N', description: 'Create Purchase Order' }] });
    check(r.status === 200 && r.body.saved === 3, 'import 3 T-codes');
    r = await call(ADMIN, 'POST', '/admin/ref-masters/import', { kind: 'SAP_CLIENT', rows: [{ code: '300', description: 'Production client', parentCode: 'ECP' }, { code: '100', description: 'QAS client', parentCode: 'EQP' }] });
    r = await call(A1, 'GET', '/ref-masters?kind=TCODE&q=sales');
    check(r.status === 200 && r.body.items.length === 2 && r.body.items.every((x) => x.code.startsWith('VA')), 'typeahead by description', r.body.items);
    r = await call(A1, 'GET', '/ref-masters?kind=SAP_CLIENT&parent=ECP'); check(r.body.items.length === 1 && r.body.items[0].code === '300', 'client list follows the system (SID -> client)');
    r = await call(ADMIN, 'GET', '/admin/ref-masters?kind=TCODE'); check(r.body.items.length === 3 && r.body.counts.TCODE === 3, 'admin list with counts');

    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
