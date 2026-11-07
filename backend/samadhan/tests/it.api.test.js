'use strict';
/*
   v7 Phase 5 - the Digital Apps and Infra & IT desks end to end against a running backend (fresh throwaway database):
   category trees, routing by category, default triage groups, cyber security (Urgent + confidential), IT details
   (validation, create, update, filters, search), the Sales-app sub-categories, the portal application picker and
   the portal category list (no other desk leaks into Secondary Sales).
     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/it.api.test.js
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
const ADMIN = 'i.admin@emamigroup.com';
const SUP = 'i.sup@emamigroup.com';
const A1 = 'i.agent1@emamigroup.com';
const A2 = 'i.agent2@emamigroup.com';
const ticket = (who, body) => call(who, 'POST', '/tickets', { requesterName: 'Office User', requesterEmail: 'office.user@example.com', ...body });

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query("INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, 'samadhan', $2) ON CONFLICT DO NOTHING", [email, role]);
    }
    await call(A1, 'GET', '/me');
    await call(A2, 'GET', '/me');
    let r = await call(ADMIN, 'GET', '/admin/workspaces');
    const ws = Object.fromEntries(r.body.workspaces.map((w) => [w.key, w]));

    // ---- portal before the desks are on: Secondary Sales only, nothing from other desks ----
    r = await call(null, 'GET', '/portal/config');
    check(r.status === 200 && !r.body.applications && r.body.categories.includes('Sales App (any)'), 'portal (desks off): no application picker; the new Sales-app category is listed');
    check(!r.body.categories.some((c) => ['SD', 'MM', 'Network', 'Cyber Security', 'API / Backend'].includes(c)), 'portal categories: no SAP / Infra / Digital categories leak into Secondary Sales', r.body.categories);

    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: true });
    for (const k of ['INFRA_IT', 'DIGITAL_APPS']) await call(ADMIN, 'PUT', `/admin/workspaces/${ws[k].id}`, { enabled: true });
    const meta = (await call(A1, 'GET', '/meta')).body;
    const app = (c) => meta.applications.find((a) => a.code === c);
    const group = (n) => meta.groups.find((g) => g.name === n)?.id;

    // ---- meta: lists, trees, types ----
    check(meta.itLists?.layer?.includes('OData') && meta.itLists.platform.includes('PWA') && meta.itLists.browser.includes('Edge'), 'meta: IT lists (layer, platform, browser)');
    const infra = meta.byWorkspace.INFRA_IT;
    const dig = meta.byWorkspace.DIGITAL_APPS;
    check(infra.tree.some((n) => n.value === 'Network' && n.children.includes('VPN')) && infra.tree.some((n) => n.value === 'Cyber Security' && n.children.includes('Phishing')), 'Infra & IT: Category -> Sub-category tree', infra.tree.length);
    check(dig.tree.some((n) => n.value === 'OData Service' && n.children.includes('$batch')) && dig.tree.some((n) => n.value === 'DB – PostgreSQL' && n.children.includes('Migration')), 'Digital Apps: Category -> Sub-category tree', dig.tree.length);
    check(!infra.tree.some((n) => n.value === 'Sales App (any)') && !dig.tree.some((n) => n.value === 'Network'), 'each desk shows only its own tree');
    const infraType = infra.fields.find((f) => f.key === 'type');
    check(infraType.recordClasses?.['Access Request'] === 'ACCESS_REQUEST' && dig.fields.find((f) => f.key === 'type').recordClasses?.['Defect / Bug'] === 'DEFECT', 'types carry their record class (Infra Access Request, Digital Defect)');
    check(infra.fields.find((f) => f.key === 'distributorCode').visible === false, 'Infra desk: distributor fields hidden');
    check(meta.categoryTree.some((n) => n.value === 'Sales App (any)' && n.children.includes('Attendance / GPS') && n.children.includes('App Crash / Performance')), 'Secondary Sales: the two new Sales-app sub-categories');
    check(['Apps Support', 'Frontend', 'Backend / API', 'Data', 'IT Service Desk', 'Network & Security', 'M365', 'End-user Support'].every((g) => group(g)), 'Digital and Infra groups seeded');

    // ---- routing ----
    r = await ticket(A1, { subject: 'VPN drops at depot', applicationId: app('NET').id, category: 'Network', function: 'VPN', impact: 3, urgency: 2 });
    check(r.status === 201 && r.body.ticket.groupId === group('Network & Security') && /^NET-\d+$/.test(r.body.ticket.ref), 'Infra: Network -> Network & Security; NET- reference', { s: r.status, g: r.body.ticket?.groupId, ref: r.body.ticket?.ref, b: r.status !== 201 ? r.body : undefined });
    check(r.body.ticket?.priority === 2, 'Infra: Impact 3 x Urgency 2 -> Medium', r.body.ticket?.priority);
    r = await ticket(A1, { subject: 'Something odd', applicationId: app('GEN').id, category: 'Other' });
    check(r.status === 201 && r.body.ticket.groupId === group('IT Service Desk'), 'Infra: no matching category -> IT Service Desk (triage)', r.body.ticket?.groupId);
    r = await ticket(A1, { subject: 'Suspicious email with invoice link', applicationId: app('SEC').id, category: 'Cyber Security', function: 'Phishing' });
    const cyber = r.body.ticket;
    check(r.status === 201 && cyber.priority === 4 && cyber.confidential === true && cyber.groupId === group('Network & Security'), 'Cyber Security: Urgent + confidential + Network & Security', { p: cyber?.priority, c: cyber?.confidential, g: cyber?.groupId });
    r = await ticket(A1, { subject: 'Teams calls drop', applicationId: app('M365').id, category: 'Email & M365', function: 'Teams' });
    check(r.body.ticket?.groupId === group('M365'), 'Infra: Email & M365 -> M365');

    // ---- IT details ----
    const count = async () => Number((await db.query('SELECT count(*) AS n FROM samadhan.tickets')).rows[0].n);
    const before = await count();
    r = await ticket(A1, { subject: 'Bad layer', applicationId: app('HUB').id, category: 'API / Backend', it: { layer: 'Nope' } });
    check(r.status === 400 && /Layer/.test(JSON.stringify(r.body)) && (await count()) === before, 'IT details validated before the ticket is created', r.body);
    r = await ticket(A1, {
        subject: 'Orders API returns 503', applicationId: app('HUB').id, category: 'API / Backend', function: '5xx Error',
        it: { layer: 'API', environment: 'Production', httpStatus: '503', correlationId: 'corr-7f3a-991', apiEndpoint: '/api/orders', hosting: 'AWS', usersAffected: 40 },
    });
    const dt = r.body.ticket;
    check(r.status === 201 && dt.groupId === group('Backend / API') && /^HUB-\d+$/.test(dt.ref), 'Digital: API / Backend -> Backend / API; HUB- reference', { g: dt?.groupId, ref: dt?.ref });
    r = await call(A1, 'GET', `/tickets/${dt.id}`);
    check(r.body.it?.layer === 'API' && r.body.it.httpStatus === '503' && r.body.it.usersAffected === 40, 'ticket detail includes IT details', r.body.it);
    r = await call(A1, 'PUT', `/tickets/${dt.id}/it`, { httpStatus: '5000' });
    check(r.status === 400, 'HTTP status must be three digits');
    r = await call(A1, 'PUT', `/tickets/${dt.id}/it`, { url: 'ftp://x' });
    check(r.status === 400, 'URL must be http(s)');
    r = await call(A1, 'PUT', `/tickets/${dt.id}/it`, { browser: 'Edge', platform: 'Desktop browser', url: 'https://b2b.example.com/orders' });
    check(r.status === 200 && r.body.it.browser === 'Edge' && r.body.it.layer === 'API', 'PUT updates only the keys sent', r.body.it);
    r = await call(A1, 'GET', `/tickets/${dt.id}`);
    check((r.body.activities || []).some((a) => a.action === 'it_details_updated'), 'IT detail change in the activity log');
    r = await call(A1, 'GET', '/tickets?view=all&layer=API');
    check(r.body.items?.some((t) => t.id === dt.id) && r.body.items.every((t) => t.id === dt.id), 'filter: layer = API', r.body.items?.map((t) => t.id));
    r = await call(A1, 'GET', '/tickets?view=all&q=corr-7f3a');
    check(r.body.items?.some((t) => t.id === dt.id), 'search finds a correlation id');
    r = await call(A1, 'GET', `/tickets/${dt.id}/it`);
    check(r.status === 200 && r.body.it.hosting === 'AWS', 'GET /tickets/:id/it');

    // ---- portal application picker ----
    r = await call(null, 'GET', '/portal/config');
    check(r.body.applications?.length > 0 && r.body.applications.every((a) => a.workspaceId === ws.SEC_SALES.id), 'portal (desks on): only desks open to the portal (Secondary Sales)', r.body.applications?.map((a) => a.code));
    await call(ADMIN, 'PUT', `/admin/workspaces/${ws.INFRA_IT.id}`, { portalEnabled: true });
    r = await call(null, 'GET', '/portal/config');
    const net = r.body.applications?.find((a) => a.code === 'NET');
    check(net && r.body.categoriesByWorkspace?.[ws.INFRA_IT.id]?.includes('Network') && !r.body.categoriesByWorkspace[ws.INFRA_IT.id].includes('Sales App (any)'), 'portal: Infra open -> NET listed with its own categories');
    const portal = (b) => call(null, 'POST', '/portal/tickets', { name: 'Depot User', email: 'depot.user@example.com', subject: 'Printer not working', description: 'Printer shows offline.', ...b });
    r = await portal({ applicationId: net?.id, category: 'Network' });
    check(r.status === 201 && /^NET-\d+$/.test(r.body.ticket?.ref), 'portal ticket with an application gets its reference', r.body);
    r = await portal({ applicationId: net?.id, category: 'Sales App (any)' });
    check(r.status === 400, 'portal: a category from another desk is refused', r.body);
    r = await portal({ applicationId: app('HUB').id });
    check(r.status === 400, 'portal: an application of a desk closed to the portal is refused', r.body);
    r = await portal({ subject: 'No app picked' });
    check(r.status === 201, 'portal: no application still works (classification as before)', r.body);

    // ---- the Digital Apps agent profile points at the real desk ----
    const prof = (await db.query('SELECT "scopePreset" FROM samadhan.auth_profiles WHERE code = $1', ['DIGITAL_APPS_AGENT'])).rows[0];
    check(prof?.scopePreset?.workspaces?.[0] === 'DIGITAL_APPS', 'Digital Apps Agent profile scoped to DIGITAL_APPS', prof);

    await call(ADMIN, 'PUT', '/admin/workspaces/flag', { enabled: false });
    r = await call(null, 'GET', '/portal/config');
    check(!r.body.applications, 'portal: desks off again -> no picker');

    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
