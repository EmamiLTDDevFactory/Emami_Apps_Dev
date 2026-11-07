'use strict';
/*
   v7 Phase 3 - workspaces, applications, APPCODE-id references, classification, Impact x Urgency, SLA by application,
   Admin API - end to end against a running backend. Same safety rules as api.test.js (localhost only,
   SAMADHAN_TEST_ALLOW=1, fresh throwaway database):

     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/workspaces.api.test.js
*/
const path = require('path');
const BACKEND = path.join(__dirname, '..', '..');
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env'), quiet: true });
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
const { Client } = require(path.join(BACKEND, 'node_modules/pg'));

const T = (name, fallback) => process.env[`SAMADHAN_TEST_${name}`] || fallback;
const API = T('API', 'http://localhost:4191/api/samadhan');
const PG = T('PG', 'postgres://postgres@localhost:55432/samadhan_test');
const APP = T('APP_ID', 'samadhan');
const SECRET = process.env.HUB_AUTH_JWT_SECRET;
if (T('ALLOW') !== '1' || !/@(localhost|127\.0\.0\.1)[:/]/.test(PG) || !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(API)) {
    console.error('Refusing to run: set SAMADHAN_TEST_ALLOW=1 and point SAMADHAN_TEST_PG / SAMADHAN_TEST_API at localhost only.');
    process.exit(2);
}
if (!SECRET) { console.error('HUB_AUTH_JWT_SECRET must be set - the same value the backend under test uses.'); process.exit(2); }

let fails = 0;
const check = (cond, label, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 240) : ''}`); if (!cond) fails++; };
async function call(email, method, url, body) {
    const r = await fetch(API + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(email ? { Authorization: `Bearer ${jwt.sign({ email }, SECRET, { expiresIn: '1h' })}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
}
const ADMIN = 'w.admin@emamigroup.com';
const SUP = 'w.sup@emamigroup.com';
const A1 = 'w.agent1@emamigroup.com';
const A2 = 'w.agent2@emamigroup.com';
const ticket = (who, body) => call(who, 'POST', '/tickets', { requesterName: 'Ravi Test', requesterEmail: 'ravi.test@example.com', ...body });

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query('INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [email, APP, role]);
    }
    const a2 = (await call(A2, 'GET', '/me')).body.me;
    await call(A1, 'GET', '/me');

    // ---- meta: 5 workspaces (only Secondary Sales available), 29 applications incl. the user's mapping codes ----
    let meta = (await call(A1, 'GET', '/meta')).body;
    const app = (code) => meta.applications.find((a) => a.code === code);
    check(meta.workspaces.length === 5 && meta.workspaces.filter((w) => w.available).map((w) => w.key).join() === 'SEC_SALES', 'meta: 5 workspaces, only SEC_SALES available', meta.workspaces.map((w) => [w.key, w.available]));
    check(meta.applications.length === 31 && ['RMSFA', 'CDMS', 'SCB2B', 'SCB2C', 'SCSUP', 'MSFA', 'SS', 'SAP', 'NET'].every((c) => app(c)), 'meta: 31 applications incl. RMSFA, CDMS and the Salescode.AI apps');
    check(app('SCB2B').workspaceKey === 'SEC_SALES' && app('SCB2C').workspaceKey === 'SEC_SALES' && app('B2B').active === false && app('B2C').active === false && app('S4H').active === false,
        'B2B / B2C are Salescode.AI apps in Secondary Sales; in-house B2B / B2C and S4H inactive');
    check(app('MSFA').vendor === 'Arteria' && app('SUP').vendor === 'Arteria' && app('MR').vendor === 'Salescode.AI' && app('SCSUP').name === 'Supervisor App (Salescode.AI)',
        'vendors: Arteria today, Salescode.AI going forward', [app('MSFA').vendor, app('MR').vendor]);
    check(meta.workspaces.find((w) => w.key === 'SAP').name === 'SAP & Primary Sales', 'SAP desk covers primary sales');
    check(meta.byWorkspace && meta.byWorkspace.SEC_SALES && meta.byWorkspace.SAP && meta.recordClasses.includes('INCIDENT') && meta.priorityMatrix.length === 64, 'meta: byWorkspace, record classes, 4 x 16 matrix cells');
    check(meta.options['workspaces.enabled'] === false && Array.isArray(meta.fields) && Array.isArray(meta.categoryTree), 'meta: flag off; top-level fields / categoryTree kept');
    check(meta.byWorkspace.SAP.fields.find((f) => f.key === 'category') !== undefined, 'byWorkspace.SAP has the field list');

    // ---- create with an application: reference, workspace, manual classification ----
    let r = await ticket(A1, { subject: 'Beat sync failing', applicationId: app('MSFA').id });
    const t1 = r.body.ticket;
    check(r.status === 201 || r.status === 200, 'create with MSFA', r.status);
    r = await call(A1, 'GET', `/tickets/${t1.id}`);
    const d1 = r.body.ticket;
    check(d1.ref === `MSFA-${t1.id}` && d1.applicationCode === 'MSFA' && d1.workspaceKey === 'SEC_SALES' && d1.classificationSource === 'manual' && d1.recordClass === 'INCIDENT',
        'detail: ref MSFA-<id>, workspace, manual, INCIDENT', { ref: d1.ref, src: d1.classificationSource });
    r = await ticket(A1, { subject: 'x', applicationId: app('SAP').id });
    check(r.status === 400, 'SAP application while its workspace is off -> 400', r.body?.error);
    r = await ticket(A1, { subject: 'x', applicationId: 999999 });
    check(r.status === 400, 'unknown application -> 400');
    r = await ticket(A1, { subject: 'x', applicationId: app('SS').id, impact: 5 });
    check(r.status === 400, 'impact 5 -> 400');
    r = await ticket(A1, { subject: 'x', applicationId: app('SS').id, recordClass: 'NOPE' });
    check(r.status === 400, 'unknown record class -> 400');

    // ---- automatic classification (no application given) ----
    const classified = async (subject, extra = {}) => {
        const c = await ticket(A1, { subject, ...extra });
        const d = (await call(A1, 'GET', `/tickets/${c.body.ticket.id}`)).body.ticket;
        return d;
    };
    let d = await classified('[DMS] invoice stuck at distributor');
    check(d.applicationCode === 'DMS' && d.classificationSource === 'subject_tag' && d.classificationConfidence === 1, 'subject tag [DMS]', [d.applicationCode, d.classificationSource]);
    d = await classified('CDMS: purchase entry not saving');
    check(d.applicationCode === 'CDMS' && d.classificationSource === 'subject_tag', 'subject tag "CDMS:"', [d.applicationCode, d.classificationSource]);
    d = await classified('Re: [Rural mSFA App (Arteria)] order screen blank');
    check(d.applicationCode === 'RMSFA' && d.classificationSource === 'subject_tag', 'subject tag by exact application name, after Re:', [d.applicationCode, d.classificationSource]);
    d = await classified('The msfa app keeps logging me out');
    check(d.applicationCode === 'MSFA' && d.classificationSource === 'keyword' && d.classificationConfidence > 0.5, 'keyword (alias "msfa")', [d.applicationCode, d.classificationSource, d.classificationConfidence]);
    const kw = d;
    d = await classified('Something is wrong today');
    check(d.applicationCode === 'SS' && d.classificationSource === 'default' && d.ref === `SS-${d.id}`, 'fallback SS / default', [d.applicationCode, d.classificationSource]);
    const dflt = d;
    d = await classified('[SAP] user locked in production');
    check(d.applicationCode === 'SS' && d.classificationSource === 'default', 'SAP tag ignored while SAP is off (no desk that is switched off)', [d.applicationCode, d.classificationSource]);

    // ---- search by reference, filters, views ----
    r = await call(A1, 'GET', `/tickets?q=MSFA-${t1.id}`);
    check(r.body.items?.length === 1 && r.body.items[0].id === t1.id && r.body.items[0].applicationId === app('MSFA').id, 'list search by MSFA-<id>');
    r = await call(A1, 'GET', `/search?q=msfa-${t1.id}`);
    check(r.body.tickets?.some((x) => x.id === t1.id), 'global search by msfa-<id> (any case)');
    r = await call(A1, 'GET', `/tickets?applicationId=${app('DMS').id},${app('CDMS').id}&view=all`);
    check(r.body.items.length === 2 && r.body.items.every((x) => ['DMS', 'CDMS'].includes(meta.applications.find((a) => a.id === x.applicationId).code)), 'application filter (2 ids)', r.body.items.length);
    r = await call(A1, 'GET', '/tickets?view=needs_classification');
    const needIds = r.body.items.map((x) => x.id);
    check(needIds.includes(dflt.id) && !needIds.includes(t1.id) && !needIds.includes(kw.id), 'Needs classification: default yes, manual / confident keyword no', needIds);
    r = await call(A1, 'GET', '/tickets/counts');
    check(Number.isInteger(r.body.counts?.needs_classification) && r.body.counts.needs_classification >= 2, 'counts include needs_classification', r.body.counts?.needs_classification);
    r = await call(A1, 'GET', `/tickets?recordClass=INCIDENT&view=all`);
    check(r.status === 200 && r.body.items.length >= 7, 'recordClass filter');

    // ---- confirm / change classification ----
    r = await call(A1, 'POST', `/tickets/${dflt.id}/classify`, {});
    check(r.status === 200 && r.body.ticket.classificationSource === 'manual' && r.body.ticket.applicationCode === 'SS', 'confirm -> manual, same application');
    r = await call(A1, 'GET', '/tickets?view=needs_classification');
    check(!r.body.items.some((x) => x.id === dflt.id), 'confirmed ticket leaves Needs classification');
    for (let i = 0; i < 3; i++) {
        const x = await classified(`Warehouse barcode scanner pairing ${i}`);
        r = await call(A1, 'POST', `/tickets/${x.id}/classify`, { applicationId: app('DMS').id });
    }
    check(r.status === 200 && r.body.ticket.applicationCode === 'DMS' && r.body.ticket.classificationSource === 'manual', 'change -> DMS, manual');
    const learnt = (await db.query(`SELECT hits FROM samadhan.classification_learning l JOIN samadhan.applications a ON a.id = l."applicationId" WHERE a.code = 'DMS' AND keyword = 'barcode'`)).rows[0];
    check(learnt?.hits === 3, 'learning table counts the corrected words', learnt);
    r = await call(ADMIN, 'GET', '/admin/mail-classification');
    check(r.status === 200 && r.body.suggestions.some((s) => s.code === 'DMS' && s.keyword === 'barcode'), 'suggestion "barcode" for DMS (never applied automatically)');
    check((await db.query(`SELECT 'barcode' = ANY(aliases) AS has FROM samadhan.applications WHERE code = 'DMS'`)).rows[0].has === false, 'aliases unchanged until an Admin accepts');
    r = await call(ADMIN, 'POST', `/admin/applications/${app('DMS').id}/aliases`, { alias: 'barcode' });
    check(r.status === 200 && (await db.query(`SELECT 'barcode' = ANY(aliases) AS has FROM samadhan.applications WHERE code = 'DMS'`)).rows[0].has, 'Admin accepts the suggestion');

    // ---- properties: change application within the desk; validation ----
    r = await call(A1, 'PATCH', `/tickets/${t1.id}`, { applicationId: app('RMSFA').id });
    check(r.status === 200 && r.body.ticket.ref === `RMSFA-${t1.id}` && r.body.ticket.workspaceKey === 'SEC_SALES', 'agent changes MSFA -> RMSFA (same desk); ref follows');
    r = await call(A1, 'PATCH', `/tickets/${t1.id}`, { urgency: 9 });
    check(r.status === 400, 'urgency 9 -> 400');
    r = await call(A1, 'PATCH', `/tickets/${t1.id}`, { applicationId: null });
    check(r.status === 400, 'application cannot be emptied');

    // ---- bell uses the reference ----
    r = await call(ADMIN, 'PUT', '/admin/settings', { 'bell.events': ['requester_reply', 'assigned'] });
    check(r.status === 200, 'bell: assigned event on');
    await call(A1, 'PATCH', `/tickets/${t1.id}`, { agentId: a2.id });
    r = await call(A2, 'GET', '/notifications');
    const bell = (r.body.notifications || r.body.items || []).find((n) => n.ticketId === t1.id);
    check(bell && bell.title.includes(`RMSFA-${t1.id}`) && !bell.title.includes(`#${t1.id}`), 'bell title shows RMSFA-<id>', bell?.title);

    // ---- export: optional Reference / Application columns; default export unchanged ----
    r = await call(SUP, 'GET', `/tickets/export?view=all&columns=${encodeURIComponent('Ticket ID,Reference,Application,Workspace')}`);
    const row = r.body.rows?.find((x) => x[0] === t1.id);
    check(r.status === 200 && row && row[1] === `RMSFA-${t1.id}` && row[2] === 'Rural mSFA App (Arteria)' && row[3] === 'Secondary Sales', 'export Reference / Application / Workspace', row);
    r = await call(SUP, 'GET', '/tickets/export?view=all');
    check(!r.body.columns.includes('Reference') && !r.body.columns.includes('Application'), 'default export has no new columns');

    // ---- Admin API: permissions ----
    r = await call(A1, 'GET', '/admin/workspaces'); check(r.status === 403, 'agent -> /admin/workspaces 403');
    r = await call(SUP, 'PUT', '/admin/workspaces/flag', { enabled: true }); check(r.status === 403, 'supervisor cannot switch workspaces on');
    r = await call(ADMIN, 'GET', '/admin/workspaces');
    check(r.status === 200 && r.body.enabled === false && r.body.applications.find((a) => a.code === 'MERCH').used === false && r.body.applications.find((a) => a.code === 'MSFA').used === true, 'admin GET workspaces (used flags)');
    const ws = Object.fromEntries(r.body.workspaces.map((w) => [w.key, w]));
    r = await call(ADMIN, 'PUT', `/admin/workspaces/${ws.SEC_SALES.id}`, { enabled: false });
    check(r.status === 200 && r.body.workspace.enabled === true, 'Secondary Sales cannot be switched off');
    r = await call(ADMIN, 'PUT', `/admin/workspaces/${ws.SAP.id}`, { priorityMode: 'NOPE' }); check(r.status === 400, 'bad priority mode -> 400');

    // ---- applications: create, code rules ----
    r = await call(ADMIN, 'POST', '/admin/applications', { code: 'TESTAP', name: 'Test App', workspaceId: ws.SEC_SALES.id, aliases: 'test app, testapp' });
    check(r.status === 200 && r.body.application.aliases.join() === 'test app,testapp', 'create application TESTAP');
    r = await call(ADMIN, 'POST', '/admin/applications', { code: 'TESTAP', name: 'Again', workspaceId: ws.SEC_SALES.id }); check(r.status === 400, 'duplicate code -> 400');
    r = await call(ADMIN, 'POST', '/admin/applications', { code: 'bad code', name: 'x', workspaceId: ws.SEC_SALES.id }); check(r.status === 400, 'invalid code -> 400');
    r = await call(ADMIN, 'PUT', `/admin/applications/${app('RMSFA').id}`, { code: 'RURAL' }); check(r.status === 400, 'code of a used application cannot change');
    r = await call(ADMIN, 'PUT', `/admin/applications/${app('MERCH').id}`, { name: 'Merchandising App (Field)' });
    check(r.status === 200 && r.body.application.name === 'Merchandising App (Field)', 'rename application label');

    // ---- turn on SAP + Infra: classification, moves, Impact x Urgency, SLA by application ----
    r = await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: true }); check(r.status === 200 && r.body.enabled === true, 'flag on');
    await call(ADMIN, 'PUT', `/admin/workspaces/${ws.SAP.id}`, { enabled: true });
    await call(ADMIN, 'PUT', `/admin/workspaces/${ws.INFRA_IT.id}`, { enabled: true });
    meta = (await call(A1, 'GET', '/meta')).body;
    check(meta.options['workspaces.enabled'] === true && meta.workspaces.filter((w) => w.available).map((w) => w.key).sort().join() === 'INFRA_IT,SAP,SEC_SALES', 'meta: SAP and Infra available', meta.workspaces.filter((w) => w.available).map((w) => w.key));
    d = await classified('[SAP] user locked in production');
    check(d.applicationCode === 'SAP' && d.workspaceKey === 'SAP' && d.ref === `SAP-${d.id}`, 'SAP tag now routes to SAP', [d.applicationCode, d.workspaceKey]);
    d = await classified('Short dump in ST22 when posting', { description: 'Program ZSD_PRICE ended with a dump' });
    check(d.applicationCode === 'SAP' && d.classificationSource === 'keyword', 'SAP pattern (ST22 / short dump) -> SAP', [d.applicationCode, d.classificationSource]);
    d = await classified('VPN not connecting from home');
    check(d.applicationCode === 'NET' && d.workspaceKey === 'INFRA_IT', 'keyword "vpn" -> NET (Infra)', [d.applicationCode, d.workspaceKey]);
    r = await call(ADMIN, 'POST', '/admin/mail-rules', { kind: 'domain', pattern: '@vendor.example.com', applicationId: meta.applications.find((a) => a.code === 'EUC').id });
    check(r.status === 200 && r.body.rule.pattern === 'vendor.example.com', 'sender rule (domain) added');
    r = await call(ADMIN, 'POST', '/admin/mail-rules', { kind: 'domain', pattern: 'vendor.example.com', applicationId: meta.applications.find((a) => a.code === 'EUC').id });
    check(r.status === 400, 'duplicate sender rule -> 400');
    d = await classified('Please help', { requesterEmail: 'it.desk@vendor.example.com' });
    check(d.applicationCode === 'EUC' && d.classificationSource === 'sender_rule', 'sender rule -> EUC', [d.applicationCode, d.classificationSource]);
    d = await classified('[MSFA] beat missing', { requesterEmail: 'it.desk@vendor.example.com' });
    check(d.applicationCode === 'MSFA' && d.classificationSource === 'subject_tag', 'subject tag wins over sender rule');

    // Moving to another workspace needs ticket.moveWorkspace (Supervisor / Admin by default).
    r = await call(A1, 'PATCH', `/tickets/${t1.id}`, { applicationId: meta.applications.find((a) => a.code === 'SAP').id });
    check(r.status === 403, 'agent cannot move a ticket to the SAP desk', r.body?.error);
    r = await call(SUP, 'PATCH', `/tickets/${t1.id}`, { applicationId: meta.applications.find((a) => a.code === 'SAP').id });
    check(r.status === 200 && r.body.ticket.ref === `SAP-${t1.id}` && r.body.ticket.workspaceKey === 'SAP', 'supervisor moves it to SAP; ref SAP-<id>');
    const moved = (await db.query(`SELECT details FROM samadhan.audit_events WHERE action = 'ticket_workspace_moved' ORDER BY id DESC LIMIT 1`)).rows[0];
    check(moved && moved.details.ticketId === t1.id && moved.details.from === 'SEC_SALES' && moved.details.to === 'SAP', 'workspace move audited', moved?.details);
    r = await call(A1, 'POST', '/tickets/bulk', { ids: [dflt.id], action: 'update', patch: { applicationId: meta.applications.find((a) => a.code === 'NET').id } });
    check(r.status === 200 && r.body.failed.length === 1 && r.body.failed[0].error.includes('another workspace'), 'bulk "set application": agent cannot move desks', r.body.failed);
    r = await call(A1, 'POST', '/tickets/bulk', { ids: [dflt.id], action: 'update', patch: { applicationId: app('MERCH').id } });
    check(r.status === 200 && r.body.done.includes(dflt.id), 'bulk "set application" within the desk');

    // Impact x Urgency (SAP = IMPACT_URGENCY): 1x1 -> Urgent / FATAL; 4x4 -> Low; manual priority wins.
    const sapId = meta.applications.find((a) => a.code === 'SAP').id;
    r = await ticket(A1, { subject: 'Billing down for all plants', applicationId: sapId, impact: 1, urgency: 1 });
    let dd = (await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body.ticket;
    check(dd.priority === 4 && dd.severity === 'FATAL' && dd.impact === 1 && dd.urgency === 1, 'SAP 1x1 -> Urgent / FATAL', [dd.priority, dd.severity]);
    r = await call(A1, 'PATCH', `/tickets/${dd.id}`, { impact: 4, urgency: 4 });
    check(r.body.ticket.priority === 1 && r.body.ticket.severity === 'NORMAL', 'PATCH 4x4 -> Low', [r.body.ticket.priority]);
    r = await call(A1, 'PATCH', `/tickets/${dd.id}`, { impact: 2, urgency: 2, priority: 2 });
    check(r.body.ticket.priority === 2, 'manual priority wins over the matrix');
    r = await ticket(A1, { subject: 'Sales app slow', applicationId: app('MSFA').id, impact: 1, urgency: 1 });
    dd = (await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body.ticket;
    check(dd.priority === 1 && dd.severity === 'NORMAL', 'Secondary Sales keeps the severity matrix (impact / urgency stored, priority unchanged)', [dd.priority, dd.severity]);
    // Admin edits the SAP matrix: 1x1 -> High
    const cells = [];
    for (let i = 1; i <= 4; i++) for (let u = 1; u <= 4; u++) cells.push({ impact: i, urgency: u, priority: i === 1 && u === 1 ? 3 : 1 });
    r = await call(ADMIN, 'PUT', `/admin/workspaces/${ws.SAP.id}/matrix`, { cells: cells.slice(0, 5) }); check(r.status === 400, 'matrix needs 16 cells');
    r = await call(ADMIN, 'PUT', `/admin/workspaces/${ws.SAP.id}/matrix`, { cells }); check(r.status === 200, 'matrix saved');
    r = await ticket(A1, { subject: 'Matrix edited', applicationId: sapId, impact: 1, urgency: 1 });
    dd = (await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body.ticket;
    check(dd.priority === 3 && dd.severity === 'SERIOUS', 'edited matrix applies at once', [dd.priority]);

    // SLA by application: a policy for SAP (60 min resolution, 24x7) wins over the group / default policy.
    const pol = (await db.query(`INSERT INTO samadhan.sla_policies (name, "isDefault", position, "applicationId") VALUES ('SAP test policy', false, 99, $1) RETURNING id`, [sapId])).rows[0];
    const tgt = (await db.query(`INSERT INTO samadhan.sla_targets ("policyId", priority, "firstResponseMins", "resolutionMins", "businessHours", escalate) VALUES ($1, 3, 15, 60, false, true) RETURNING *`, [pol.id])).rows[0];
    await call(ADMIN, 'PUT', `/admin/sla/targets/${tgt.id}`, { firstResponseMins: 15, nextResponseMins: null, resolutionMins: 60, businessHours: false, escalate: true }); // clears the SLA cache
    r = await ticket(A1, { subject: 'SLA by application', applicationId: sapId, impact: 1, urgency: 1 });
    dd = (await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body.ticket;
    const mins = (new Date(dd.resolutionDueAt) - new Date(dd.createdAt)) / 60000;
    check(Math.round(mins) === 60, 'SAP ticket gets the SAP policy (60 min, 24x7)', mins);
    r = await ticket(A1, { subject: 'Sales SLA unchanged', applicationId: app('MSFA').id, priority: 3 });
    dd = (await call(A1, 'GET', `/tickets/${r.body.ticket.id}`)).body.ticket;
    check(Math.round((new Date(dd.resolutionDueAt) - new Date(dd.createdAt)) / 60000) !== 60, 'Secondary Sales ticket keeps its old policy');

    // ---- flag off again: other desks disappear for new work; existing tickets keep their reference ----
    r = await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: false });
    r = await ticket(A1, { subject: 'x', applicationId: sapId });
    check(r.status === 400, 'flag off: SAP application refused for new tickets');
    r = await call(A1, 'GET', `/tickets/${t1.id}`);
    check(r.body.ticket.ref === `SAP-${t1.id}`, 'existing SAP ticket keeps SAP-<id>');
    r = await call(A1, 'GET', '/admin/mail-classification'); check(r.status === 403, 'agent -> mail classification 403');
    r = await call(ADMIN, 'PUT', '/admin/mail-classification', { ai: false, threshold: 0.8, defaultCode: 'SAP' }); check(r.status === 400, 'default must be a Secondary Sales app');
    r = await call(ADMIN, 'PUT', '/admin/mail-classification', { ai: false, threshold: 0.85, defaultCode: 'SS', prefixInSubject: true });
    check(r.status === 200 && r.body.settings.threshold === 0.85, 'mail classification settings saved');

    // ---- data scope by workspace / application (cockpit, §K 9.3) ----
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { workspaces: ['SAP'] }, reason: 'SAP desk only' });
    check(r.status === 200, 'cockpit: A2 limited to the SAP workspace', r.body?.error);
    r = await call(A2, 'GET', '/tickets?view=all');
    check(r.body.items.length > 0 && r.body.items.every((x) => x.workspaceId === ws.SAP.id), 'scoped list shows SAP tickets only', r.body.items.map((x) => x.workspaceId));
    r = await call(A2, 'GET', `/tickets/${dflt.id}`); check(r.status === 404, 'a Secondary Sales ticket is 404 for the SAP-only agent');
    r = await call(A2, 'GET', `/tickets/${t1.id}`); check(r.status === 200, 'the SAP ticket is visible');
    r = await call(A2, 'GET', '/tickets/counts'); check(r.status === 200, 'counts work under a workspace scope');
    r = await call(A2, 'GET', '/insights/dashboard'); check(r.body.insights === null && r.body.scoped === true, 'queue-wide insights hidden for a narrowed scope');
    r = await call(A2, 'GET', '/me'); check(JSON.stringify(r.body.scope.workspaces) === '["SAP"]', '/me shows the workspace scope', r.body.scope);
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { workspaces: 'all', applications: ['DMS'] }, reason: 'DMS only' });
    r = await call(A2, 'GET', '/tickets?view=all');
    check(r.body.items.length > 0 && r.body.items.every((x) => x.applicationId === app('DMS').id), 'application scope: DMS tickets only', r.body.items.length);
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { workspaces: ['bad key'] }, reason: 'x' }); check(r.status === 400, 'invalid workspace key -> 400');
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { workspaces: 'all', applications: 'all' }, reason: 'back to all' });
    r = await call(A2, 'GET', `/tickets/${dflt.id}`); check(r.status === 200, 'scope back to all');

    // ---- analytics / dashboard / daily report by application ----
    r = await call(SUP, 'GET', '/analytics?days=7');
    check(r.status === 200 && r.body.byApplication.some((x) => x.code === 'DMS' && x.value >= 4 && 'resolutionSlaPct' in x && 'csatPositivePct' in x), 'analytics: byApplication with KPIs', r.body.byApplication?.map((x) => [x.code, x.value]));
    check(r.body.byWorkspace.some((w) => w.key === 'SAP' && w.value >= 1), 'analytics: byWorkspace');
    r = await call(SUP, 'GET', `/analytics?days=7&applicationId=${app('DMS').id}`);
    check(r.body.totals.created >= 4 && r.body.byApplication.length === 1 && r.body.byApplication[0].code === 'DMS', 'analytics: application filter');
    r = await call(A1, 'GET', '/dashboard/breakdown?days=7');
    check(r.status === 200 && r.body.application.some((x) => x.name === 'DMS (Salescode.AI)'), 'dashboard breakdown: by application');
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
    r = await call(SUP, 'GET', `/reports/daily?from=${today}&to=${today}`);
    check(r.status === 200 && r.body.columns.length === 36 && r.body.rows.every((x) => x.length === 36), 'daily report default: 36 columns, unchanged');
    r = await call(SUP, 'GET', `/reports/daily?from=${today}&to=${today}&extra=Reference,Application,Bogus`);
    const rep = r.body.rows.find((x) => x[0] === t1.id);
    check(r.body.columns.length === 38 && r.body.columns[36] === 'Reference' && rep && rep[36] === `SAP-${t1.id}` && rep[37] === 'SAP ECC (current)', 'daily report: optional Reference / Application appended last', rep?.slice(36));

    // ---- portal status by reference; board by service desk; preferences ----
    r = await call(null, 'POST', '/portal/status', { id: `SAP-${t1.id}`, email: 'ravi.test@example.com' });
    check(r.status === 200 && r.body.ticket.id === t1.id && r.body.ticket.ref === `SAP-${t1.id}`, 'portal status accepts SAP-<id> and returns the reference', r.body);
    r = await call(null, 'POST', '/portal/status', { id: String(t1.id), email: 'ravi.test@example.com' });
    check(r.status === 200 && r.body.ticket.id === t1.id, 'portal status still accepts the number');
    r = await call(A1, 'GET', `/board?workspaceId=${ws.SAP.id}`);
    check(r.status === 200 && r.body.items.length > 0 && r.body.items.every((x) => x.workspaceId === ws.SAP.id), 'board filtered by service desk');
    r = await call(A1, 'PUT', '/me/preferences', { workspace: 'SAP', recentApps: [app('MSFA').id, 'x', -1] });
    check(r.status === 200 && r.body.prefs.workspace === 'SAP' && JSON.stringify(r.body.prefs.recentApps) === JSON.stringify([app('MSFA').id]), 'preferences: workspace + recent apps');
    r = await call(A1, 'PUT', '/me/preferences', { workspace: 'bad key' }); check(r.status === 400, 'preferences: invalid workspace -> 400');

    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
