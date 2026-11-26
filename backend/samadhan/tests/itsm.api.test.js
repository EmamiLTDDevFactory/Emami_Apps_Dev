'use strict';
/*
   ITSM support model (migration 7.11) end to end against a running backend (fresh throwaway database): partner lists
   and current choices, the support vendor on new tickets, hosting from hyperscalers, the escalation matrix (manual and
   automatic), the vendor scorecard, the ticket migration templates (dry run, import, re-import, search).
     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/itsm.api.test.js
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
const ADMIN = 'm.admin@emamigroup.com';
const SUP = 'm.sup@emamigroup.com';
const A1 = 'm.agent1@emamigroup.com';
const ticket = (who, body) => call(who, 'POST', '/tickets', { requesterName: 'Office User', requesterEmail: 'office.user@example.com', ...body });

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent']]) {
        await db.query("INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, 'samadhan', $2) ON CONFLICT DO NOTHING", [email, role]);
    }
    for (const who of [ADMIN, SUP, A1]) await call(who, 'GET', '/me');
    let r = await call(ADMIN, 'GET', '/admin/workspaces');
    const ws = Object.fromEntries(r.body.workspaces.map((w) => [w.key, w]));
    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: true });
    for (const k of ['INFRA_IT', 'DIGITAL_APPS', 'SAP']) await call(ADMIN, 'PUT', `/admin/workspaces/${ws[k].id}`, { enabled: true });

    // ---- support model: seeded lists and today's choices ----
    let meta = (await call(A1, 'GET', '/meta')).body;
    const app = (c) => meta.applications.find((a) => a.code === c);
    const it = meta.itsm;
    const allied = it?.vendors.find((v) => v.name === 'Allied Digital Services');
    check(!!allied && it.vendorId === allied.id, 'meta: Allied Digital is the current ITSM support vendor', it && { vendorId: it.vendorId });
    check(it.hyperscalers.some((h) => h.name === 'Microsoft Azure' && h.id === it.hyperscalerId) && it.hyperscalers.some((h) => h.name === 'Google Cloud (GCP)'), 'meta: Azure current; other hyperscalers listed');
    check(it.clients.some((c) => c.name === 'Emami Limited' && c.id === it.clientId), 'meta: Emami Limited is the client');
    check(it.vendorDesks.includes('INFRA_IT') && it.vendorDesks.includes('DIGITAL_APPS') && !it.vendorDesks.includes('SEC_SALES'), 'vendor supports Infra & IT and Digital Apps', it.vendorDesks);
    check(it.hostingExtra.includes('Google Cloud (GCP)') && !it.hostingExtra.includes('Microsoft Azure'), 'hosting list gains hyperscalers not already there', it.hostingExtra);
    check(meta.sources.includes('Migration import'), 'ticket source "Migration import"');
    check(meta.byWorkspace.INFRA_IT.tree.some((n) => n.value === 'Cloud – Google Cloud' && n.children.includes('Virtual Machine')), 'Infra & IT: Google Cloud category');
    check(meta.refMasterKinds.includes('ASSET') && meta.sapLists.resolutionCode.includes('Deskside / on-site visit'), 'asset master and first-call / deskside resolution codes');
    r = await call(A1, 'GET', '/admin/support-model');
    check(r.status === 403, 'agents cannot open Admin > Support model');
    r = await call(ADMIN, 'GET', '/admin/support-model');
    check(r.status === 200 && r.body.partners.length >= 30 && r.body.suggestions.length === 4, 'Admin > Support model loads', r.status);

    r = await call(ADMIN, 'POST', '/admin/support-partners', { kind: 'ITSM_VENDOR', name: 'Test Vendor Pvt Ltd', shortName: 'TestV', slaTargetPct: 95, contractEnd: '2027-03-31', contractStart: '2026-04-01' });
    check(r.status === 200 && r.body.id, 'add a vendor with contract and SLA target', r.body);
    const testVendor = r.body.id;
    r = await call(ADMIN, 'POST', '/admin/support-partners', { kind: 'ITSM_VENDOR', name: 'test vendor pvt ltd' });
    check(r.status === 400, 'duplicate vendor name refused (case-insensitive)');
    r = await call(ADMIN, 'POST', '/admin/support-partners', { kind: 'ITSM_VENDOR', name: 'Bad Dates', contractStart: '2027-01-01', contractEnd: '2026-01-01' });
    check(r.status === 400, 'contract end before start refused');
    r = await call(ADMIN, 'POST', '/admin/support-partners', { kind: 'HYPERSCALER', name: 'Test Sovereign Cloud' });
    check(r.status === 200, 'add a hyperscaler');

    // ---- support vendor on new tickets ----
    r = await ticket(A1, { subject: 'Laptop will not boot', applicationId: app('EUC').id, category: 'End-user IT', function: 'Laptop / Desktop', impact: 4, urgency: 3 });
    check(r.status === 201 && r.body.ticket.supportPartnerId === allied.id, 'Infra ticket gets the current vendor', { s: r.status, v: r.body.ticket?.supportPartnerId, b: r.status !== 201 ? r.body : undefined });
    const t1 = r.body.ticket;
    r = await ticket(A1, { subject: 'Billing doc not posting', applicationId: app('SAP').id, category: 'SD' });
    check(r.status === 201 && !r.body.ticket.supportPartnerId, 'SAP ticket (not a vendor desk) has no vendor', { s: r.status, v: r.body.ticket?.supportPartnerId, b: r.status !== 201 ? r.body : undefined });
    const sapT = r.body.ticket;
    r = await call(A1, 'PUT', `/tickets/${sapT.id}/support-vendor`, { supportPartnerId: testVendor });
    check(r.status === 200, 'agent sets the support vendor on a ticket');
    r = await call(A1, 'PUT', `/tickets/${sapT.id}/support-vendor`, { supportPartnerId: it.hyperscalerId });
    check(r.status === 400, 'a hyperscaler is not a support vendor');
    r = await call(A1, 'GET', `/tickets/${sapT.id}`);
    check(r.body.ticket.supportPartnerId === testVendor && r.body.activities.some((a) => a.action === 'updated' && a.details?.supportPartnerId), 'vendor change saved and logged');
    r = await call(A1, 'PUT', `/tickets/${t1.id}/it`, { hosting: 'Test Sovereign Cloud', assetTag: 'IND-KOL-L-0042' });
    check(r.status === 200 && r.body.it.hosting === 'Test Sovereign Cloud', 'IT details accept an Admin-added hyperscaler', r.body);
    r = await call(A1, 'PUT', `/tickets/${t1.id}/it`, { hosting: 'Nowhere Cloud' });
    check(r.status === 400, 'unknown hosting refused');

    // ---- escalation matrix ----
    r = await call(A1, 'POST', `/tickets/${t1.id}/escalate`, { reason: 'User blocked all morning' });
    check(r.status === 400 && /Support model/.test(r.body.error), 'no matrix yet -> clear message', r.body);
    r = await call(A1, 'POST', '/admin/escalation-contacts', { level: 1, name: 'X', email: 'x@emamigroup.com' });
    check(r.status === 403, 'agents cannot edit the matrix');
    r = await call(ADMIN, 'POST', '/admin/escalation-contacts', { level: 1, party: 'VENDOR', name: 'Desk Lead', designation: 'Service desk lead', email: 'desk.lead@demo.samadhan.local', afterHours: 0 });
    check(r.status === 200, 'level 1 contact saved');
    r = await call(ADMIN, 'POST', '/admin/escalation-contacts', { level: 2, party: 'VENDOR', name: 'Delivery Manager', email: 'sdm@demo.samadhan.local', afterHours: 4 });
    const l2 = r.body.id;
    r = await call(ADMIN, 'POST', '/admin/escalation-contacts', { level: 3, party: 'CLIENT', name: 'IT Manager', email: 'not-an-email' });
    check(r.status === 400, 'contact email is checked');
    r = await call(ADMIN, 'POST', '/admin/escalation-contacts', { level: 3, party: 'CLIENT', name: 'IT Manager', email: 'itm@demo.samadhan.local', afterHours: 8, priorities: [4] });
    check(r.status === 200, 'level 3 only for Urgent');
    r = await call(A1, 'POST', `/tickets/${t1.id}/escalate`, { reason: 'no' });
    check(r.status === 400, 'a reason is needed');
    r = await call(A1, 'POST', `/tickets/${t1.id}/escalate`, { reason: 'User blocked all morning, engineer not reachable' });
    check(r.status === 200 && r.body.level === 1 && r.body.notified.includes('desk.lead@demo.samadhan.local'), 'manual escalation -> level 1, lead informed', r.body);
    r = await call(A1, 'GET', `/tickets/${t1.id}`);
    check(r.body.ticket.escalationLevel === 1 && r.body.ticket.escalatedAt, 'ticket shows level 1');
    // Automatic: resolution 5 h overdue -> level 2 (after 4 h); level 3 is Urgent-only, so this ticket stops at 2.
    await db.query(`UPDATE samadhan.tickets SET "resolutionDueAt" = now() - interval '5 hours' WHERE id = $1`, [t1.id]);
    r = await call(ADMIN, 'POST', '/jobs/run', {});
    check(r.status === 200 && r.body.result.escalations >= 1, 'scheduled run escalates overdue tickets', r.body.result?.escalations);
    r = await call(A1, 'GET', `/tickets/${t1.id}/escalations`);
    check(r.body.items.length === 2 && r.body.items[1].level === 2 && !r.body.items[1].manual, 'history: manual L1, automatic L2', r.body.items?.map((e) => [e.level, e.manual]));
    await call(ADMIN, 'POST', '/jobs/run', {});
    r = await call(A1, 'GET', `/tickets/${t1.id}`);
    check(r.body.ticket.escalationLevel === 2, 'a non-Urgent ticket does not reach the Urgent-only level 3', r.body.ticket.escalationLevel);
    r = await call(A1, 'POST', `/tickets/${t1.id}/escalate`, { reason: 'Still blocked after the manager call' });
    check(r.status === 400 && /highest/.test(r.body.error), 'no higher level for this ticket', r.body);
    // Vendor-side levels are only for tickets a vendor works: the SAP ticket (vendor removed) skips L1 / L2.
    await call(A1, 'PUT', `/tickets/${sapT.id}/support-vendor`, { supportPartnerId: null });
    await db.query(`UPDATE samadhan.tickets SET "resolutionDueAt" = now() - interval '30 hours', priority = 4 WHERE id = $1`, [sapT.id]);
    await call(ADMIN, 'POST', '/jobs/run', {});
    r = await call(A1, 'GET', `/tickets/${sapT.id}/escalations`);
    check(r.body.items.length === 1 && r.body.items[0].level === 3, 'no vendor on the ticket -> only client levels (L3 for Urgent)', r.body.items?.map((e) => e.level));
    await call(A1, 'PUT', `/tickets/${sapT.id}/support-vendor`, { supportPartnerId: testVendor });
    r = await call(ADMIN, 'DELETE', `/admin/escalation-contacts/${l2}`);
    check(r.status === 200, 'remove a contact');
    meta = (await call(A1, 'GET', '/meta')).body;
    check(JSON.stringify(meta.itsm.escalationLevels) === '[1,3]', 'meta lists the levels in use', meta.itsm.escalationLevels);

    // ---- vendor scorecard ----
    r = await call(A1, 'GET', '/analytics/vendors?days=30');
    check(r.status === 403, 'agents do not see the scorecard (Analytics)');
    r = await call(SUP, 'GET', '/analytics/vendors?days=30');
    const row = r.body.items?.find((x) => x.id === allied.id);
    check(r.status === 200 && row && row.total >= 1 && row.escalated >= 1 && row.open >= 1 && 'fcrPct' in row, 'scorecard: Allied Digital row', row);
    check(r.body.items.some((x) => x.id === testVendor && x.slaTargetPct === 95), 'scorecard carries the contract SLA target');

    // ---- ticket migration ----
    r = await call(SUP, 'GET', '/admin/migration/itsm/template');
    check(r.status === 403, 'only Admins migrate tickets');
    r = await call(ADMIN, 'GET', '/admin/migration/itsm/template');
    const tpl = r.body.template;
    check(r.status === 200 && tpl.columns[0].key === 'legacyRef' && tpl.values.applications.some((a) => a.startsWith('EUC')) && !tpl.values.applications.some((a) => a.startsWith('MSFA')) && tpl.currentVendor === 'Allied Digital Services', 'ITSM template: columns, live lists, current vendor', { cols: tpl?.columns?.length, vendor: tpl?.currentVendor });
    const head = tpl.columns.map((c) => `${c.header}${c.required ? ' *' : ''}`);
    const rowOf = (o) => tpl.columns.map((c) => o[c.key] ?? '');
    const good = { legacyRef: 'AD-INC-900001', subject: 'Printer offline on 3rd floor', applicationCode: 'EUC', type: 'Incident', category: 'End-user IT', subCategory: 'Printer / Scanner', priority: 'P3', status: 'Work in progress', loggedOn: '20-11-2026 09:30', requesterName: 'Ravi Kumar', requesterEmail: 'ravi.kumar@example.com', site: 'Kolkata HO', assetTag: 'IND-KOL-P-0007', hosting: 'Azure', workNotes: 'Toner replaced, network card suspected.' };
    const rows = [head, rowOf(good),
        rowOf({ ...good, legacyRef: 'AD-INC-900002', applicationCode: 'NOPE' }),
        rowOf({ ...good, legacyRef: 'AD-INC-900003', loggedOn: '31-02-2026 10:00', priority: 'Super' }),
        rowOf({ ...good, legacyRef: 'AD-INC-900004', status: 'Closed' }),
        rowOf({ ...good, legacyRef: 'AD-INC-900005', subject: 'Second ticket', loggedOn: '2026-11-21T04:00:00.000Z', vendor: 'TestV', priority: 'Urgent', agentEmail: A1 }),
        tpl.columns.map(() => '')];
    r = await call(ADMIN, 'POST', '/admin/migration/itsm/import', { rows, dryRun: true });
    check(r.status === 200 && r.body.dryRun && r.body.ok === 2 && r.body.errors.length === 3 && r.body.total === 5, 'dry run: 2 ready, 3 with errors, blank row ignored', { ok: r.body.ok, total: r.body.total, e: r.body.errors });
    check(r.body.errors.some((e) => /Application code "NOPE"/.test(e.error)) && r.body.errors.some((e) => /not a date/.test(e.error) && /Priority/.test(e.error)) && r.body.errors.some((e) => /not an open status/.test(e.error)), 'errors say what to fix');
    const n = Number((await db.query(`SELECT count(*) AS n FROM samadhan.tickets WHERE "legacyRef" LIKE 'AD-INC-9%'`)).rows[0].n);
    check(n === 0, 'dry run saves nothing');
    r = await call(ADMIN, 'POST', '/admin/migration/itsm/import', { rows, dryRun: false });
    check(r.status === 200 && r.body.created.length === 2, 'import creates the good rows', r.body);
    const mig = (await db.query(`SELECT t.*, s.name AS status FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE "legacyRef" = 'AD-INC-900001'`)).rows[0];
    check(mig && mig.supportPartnerId === allied.id && mig.tags.includes('migrated') && mig.source === 'Migration import' && mig.firstRespondedAt && mig.resolutionDueAt > new Date(), 'migrated ticket: vendor, tag, source, responded, SLA from the import', mig && { v: mig.supportPartnerId, tags: mig.tags, src: mig.source, due: mig.resolutionDueAt });
    check(mig && new Date(mig.createdAt).toISOString() === '2026-11-20T04:00:00.000Z', 'logged date kept (IST)', mig?.createdAt);
    check(mig && mig.status !== 'Open', 'status mapped from "Work in progress"', mig?.status);
    const mig2 = (await db.query(`SELECT * FROM samadhan.tickets WHERE "legacyRef" = 'AD-INC-900005'`)).rows[0];
    check(mig2 && mig2.supportPartnerId === testVendor && mig2.priority === 4 && mig2.isMajorIncident !== true, 'row vendor + Urgent kept; no major-incident flag for migrated tickets', mig2 && { v: mig2.supportPartnerId, p: mig2.priority, major: mig2.isMajorIncident });
    const notes = mig ? (await db.query(`SELECT "bodyText" FROM samadhan.conversations WHERE "ticketId" = $1 AND kind = 'NOTE'`, [mig.id])).rows : [];
    check(notes.some((x) => /AD-INC-900001/.test(x.bodyText) && /Toner replaced/.test(x.bodyText)), 'old tool history as a private note');
    const itd = mig ? (await db.query(`SELECT * FROM samadhan.ticket_it_details WHERE "ticketId" = $1`, [mig.id])).rows[0] : null;
    check(itd?.assetTag === 'IND-KOL-P-0007' && itd.hosting === 'Azure' && itd.siteLocation === 'Kolkata HO', 'IT details from the row');
    r = await call(ADMIN, 'POST', '/admin/migration/itsm/import', { rows, dryRun: false });
    check(r.status === 200 && r.body.created.length === 0 && r.body.skipped === 2, 're-import skips tickets already moved', { c: r.body.created?.length, s: r.body.skipped });
    r = await call(A1, 'GET', '/tickets?view=all&q=AD-INC-900001');
    check(r.body.items?.some((t) => t.id === mig?.id), 'search finds the old number');
    r = await call(A1, 'GET', '/tickets?view=all&q=900005');
    check(r.body.items?.some((t) => t.id === mig2?.id), 'search finds the old number by its digits');
    r = await call(ADMIN, 'POST', '/admin/migration/itsm/import', { rows: [['Subject'], ['x']], dryRun: true });
    check(r.status === 400 && /Legacy ticket no/.test(r.body.error), 'missing columns named');

    r = await call(ADMIN, 'GET', '/admin/migration/sales/template');
    const st = r.body.template;
    check(r.status === 200 && st.columns.some((c) => c.key === 'distributorCode') && st.values.applications.some((a) => a.startsWith('MSFA')) && !st.values.applications.some((a) => a.startsWith('EUC')), 'Sales template: sales fields and sales apps only');
    const sHead = st.columns.map((c) => c.header);
    const sRow = (o) => st.columns.map((c) => o[c.key] ?? '');
    r = await call(ADMIN, 'POST', '/admin/migration/sales/import', { dryRun: false, slaFrom: 'logged', rows: [sHead,
        sRow({ legacyRef: 'SS-OLD-1001', subject: 'Scheme not applied in DMS', loggedOn: '01-11-2026 11:00', requesterName: 'Distributor Kolkata', mobileNo: '9876543210', distributorCode: '100200', source: 'Phone' }),
        sRow({ legacyRef: 'SS-OLD-1002', subject: 'MSFA sync stuck', applicationCode: 'MSFA', loggedOn: '02-11-2026', requesterName: 'MR One', requesterEmail: 'bad@' })] });
    check(r.status === 200 && r.body.created.length === 1 && r.body.errors.length === 1, 'Sales import: one created, bad email refused', r.body);
    const ss = (await db.query(`SELECT t.*, a.code FROM samadhan.tickets t JOIN samadhan.applications a ON a.id = t."applicationId" WHERE "legacyRef" = 'SS-OLD-1001'`)).rows[0];
    check(ss?.code === 'SS' && ss.distributorCode === '100200' && ss.source === 'Phone' && !ss.supportPartnerId && ss.resViolated === true, 'Sales row: default SS, fields kept, no vendor, SLA from the logged date (overdue, no mails)', ss && { code: ss.code, src: ss.source, v: ss.supportPartnerId, rv: ss.resViolated });

    // ---- vendor change moves open tickets ----
    r = await call(ADMIN, 'PUT', '/admin/support-model', { vendorId: testVendor, moveOpenTickets: true });
    check(r.status === 200 && r.body.moved >= 2, 'vendor change moves the open tickets of the vendor desks', r.body);
    r = await call(A1, 'GET', `/tickets/${t1.id}`);
    check(r.body.ticket.supportPartnerId === testVendor, 'open Infra ticket now with the new vendor');
    r = await ticket(A1, { subject: 'Mouse broken', applicationId: app('EUC').id, category: 'End-user IT' });
    check(r.body.ticket?.supportPartnerId === testVendor, 'new tickets go to the new vendor');
    r = await call(ADMIN, 'PUT', '/admin/support-model', { vendorId: it.hyperscalerId });
    check(r.status === 400, 'only a vendor can be the vendor');
    r = await call(ADMIN, 'PUT', '/admin/support-model', { vendorId: allied.id, vendorDesks: ['INFRA_IT', 'DIGITAL_APPS'], autoEscalate: true });
    check(r.status === 200 && r.body.moved === 0, 'back to Allied Digital without moving tickets');

    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: false });
    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
