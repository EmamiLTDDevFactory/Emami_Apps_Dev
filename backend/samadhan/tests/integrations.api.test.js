'use strict';
/*
   v7 Phase 9 - integrations end to end against a running backend (fresh throwaway database): all off by default;
   Cloud ALM (API key, idempotent, reference returned), monitoring (per-source token, de-duplication, clear, rotation),
   Teams (URL rules, posts logged), SolMan import (mapping, dry run, error report, re-import), call log, Assist, desk analytics.
     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/integrations.api.test.js
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
const ADMIN = 'n.admin@emamigroup.com';
const SUP = 'n.sup@emamigroup.com';
const A1 = 'n.agent1@emamigroup.com';
const A2 = 'n.agent2@emamigroup.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function raw(method, url, body, headers = {}) {
    const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
}

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query("INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, 'samadhan', $2) ON CONFLICT DO NOTHING", [email, role]);
    }
    await call(A1, 'GET', '/me');
    let r = await call(ADMIN, 'GET', '/admin/integrations');
    check(r.status === 200 && r.body.integrations.length === 4 && r.body.integrations.every((i) => i.enabled === false), 'four integrations, all off by default', r.body.integrations?.map((i) => [i.key, i.enabled]));
    check(r.body.integrations.find((i) => i.key === 'calm').config.applicationCode === 'SAP' && r.body.endpoints.calm.endsWith('/integrations/calm/tickets'), 'Cloud ALM maps to the SAP application; endpoint shown');
    r = await call(A1, 'GET', '/admin/integrations');
    check(r.status === 403, 'agents cannot open Admin > Integrations');
    const meta = (await call(A1, 'GET', '/meta')).body;
    check(['SAP Cloud ALM', 'Monitoring alert', 'Teams', 'Walk-in', 'SolMan import'].every((s) => meta.sources.includes(s)), 'new ticket sources listed', meta.sources);

    // ---- SAP Cloud ALM ----
    r = await raw('POST', '/integrations/calm/tickets', { eventSituationId: 'E1', title: 'x' });
    check(r.status === 404, 'Cloud ALM endpoint is off by default (404)');
    r = await call(ADMIN, 'POST', '/admin/integrations/calm/rotate');
    const key = r.body.secret;
    check(r.status === 200 && /^calm_/.test(key), 'API key generated (shown once)');
    r = await call(ADMIN, 'GET', '/admin/integrations');
    check(!JSON.stringify(r.body).includes(key) && r.body.integrations.find((i) => i.key === 'calm').secretHint?.startsWith('calm_'), 'only a hint of the key is kept / shown');
    await call(ADMIN, 'PUT', '/admin/integrations/calm', { enabled: true });
    r = await raw('POST', '/integrations/calm/tickets', { eventSituationId: 'E1', title: 'x' });
    check(r.status === 401, 'no key -> 401');
    r = await raw('POST', '/integrations/calm/tickets', { eventSituationId: 'E1', title: 'x' }, { 'x-api-key': 'calm_wrong' });
    check(r.status === 401, 'wrong key -> 401');
    r = await raw('POST', '/integrations/calm/tickets', { title: 'No id' }, { 'x-api-key': key });
    check(r.status === 400, 'event-situation id required');
    const ev = { eventSituationId: 'CALM-SIT-7781', title: 'Job SAP_COLLECTOR failed on ECP', description: 'Job cancelled with RC 8', priority: 'Very High', system: 'ecp', environment: 'Production', serviceName: 'ECP Production' };
    r = await raw('POST', '/integrations/calm/tickets', ev, { Authorization: `Bearer ${key}` });
    const c1 = r.body;
    check(r.status === 201 && c1.created === true && /^SAP-\d+$/.test(c1.ref), 'Cloud ALM event -> SAP ticket, reference returned synchronously', r.body);
    r = await raw('POST', '/integrations/calm/tickets', ev, { 'x-api-key': key });
    check(r.status === 200 && r.body.created === false && r.body.ticketId === c1.ticketId, 'idempotent on the event-situation id', r.body);
    let d = (await call(ADMIN, 'GET', `/tickets/${c1.ticketId}`)).body;
    check(d.ticket.source === 'SAP Cloud ALM' && d.ticket.priority === 4 && d.sap?.sapSystem === 'ECP' && d.ticket.isMajorIncident === true, 'source, priority from "Very High", SAP details; Urgent + Production -> major incident', { src: d.ticket.source, p: d.ticket.priority, sys: d.sap?.sapSystem, mi: d.ticket.isMajorIncident });

    // ---- monitoring ----
    const net = meta.applications.find((a) => a.code === 'NET');
    r = await call(ADMIN, 'POST', '/admin/integrations/monitoring/sources', { name: 'Zabbix', applicationId: net.id, defaultPriority: 2 });
    const src = r.body;
    check(r.status === 200 && /^mon_/.test(src.token), 'monitoring source with its own token');
    r = await raw('POST', `/integrations/monitoring/${src.id}/alerts`, { alertKey: 'a', title: 'b' }, { 'x-api-key': src.token });
    check(r.status === 404, 'monitoring endpoint off by default');
    await call(ADMIN, 'PUT', '/admin/integrations/monitoring', { enabled: true });
    r = await raw('POST', `/integrations/monitoring/${src.id}/alerts`, { alertKey: 'a', title: 'b' }, { 'x-api-key': 'mon_wrong' });
    check(r.status === 401, 'wrong token -> 401');
    r = await raw('POST', `/integrations/monitoring/999/alerts`, { alertKey: 'a', title: 'b' }, { 'x-api-key': src.token });
    check(r.status === 401, 'token of another source -> 401');
    const alert = { alertKey: 'core-sw-01:down', title: 'Core switch unreachable', severity: 'critical', host: 'core-sw-01', description: 'ICMP loss 100%' };
    r = await raw('POST', `/integrations/monitoring/${src.id}/alerts`, alert, { 'x-api-key': src.token });
    const m1 = r.body;
    check(r.status === 201 && /^NET-\d+$/.test(m1.ref), 'alert -> NET ticket', r.body);
    d = (await call(ADMIN, 'GET', `/tickets/${m1.ticketId}`)).body;
    check(d.ticket.priority === 4 && d.ticket.source === 'Monitoring alert' && d.it?.serverName === 'core-sw-01', 'critical -> Urgent; host in IT details');
    r = await raw('POST', `/integrations/monitoring/${src.id}/alerts`, alert, { 'x-api-key': src.token });
    check(r.status === 200 && r.body.ticketId === m1.ticketId && r.body.created === false, 'repeat alert -> same ticket');
    r = await raw('POST', `/integrations/monitoring/${src.id}/alerts`, { ...alert, status: 'resolved' }, { 'x-api-key': src.token });
    d = (await call(ADMIN, 'GET', `/tickets/${m1.ticketId}`)).body;
    check(d.conversations.filter((c) => c.kind === 'NOTE' && /Monitoring:/.test(c.bodyText)).length === 2, 'repeat and clear added as notes');
    r = await call(ADMIN, 'POST', `/admin/integrations/monitoring/sources/${src.id}/rotate`);
    const tok2 = r.body.token;
    r = await raw('POST', `/integrations/monitoring/${src.id}/alerts`, { ...alert, alertKey: 'new' }, { 'x-api-key': src.token });
    check(r.status === 401, 'old token stops working after rotation');
    r = await raw('POST', `/integrations/monitoring/${src.id}/alerts`, { ...alert, alertKey: 'disk-90', title: 'Disk 90%', severity: 'warning' }, { 'x-api-key': tok2 });
    check(r.status === 201, 'new token works');

    // ---- Teams ----
    r = await call(ADMIN, 'PUT', '/admin/integrations/teams', { enabled: true });
    check(r.status === 400, 'Teams needs a webhook URL');
    r = await call(ADMIN, 'PUT', '/admin/integrations/teams', { url: 'https://evil.example.com/hook', enabled: true });
    check(r.status === 400, 'only Teams / Power Automate webhook hosts');
    r = await call(ADMIN, 'PUT', '/admin/integrations/teams', { url: 'https://emamitest.webhook.office.com/webhookb2/test', enabled: true, events: ['major', 'urgent'] });
    check(r.status === 200 && r.body.integration.enabled, 'Teams switched on');
    r = await call(ADMIN, 'GET', '/admin/integrations');
    check(!JSON.stringify(r.body.integrations).includes('webhookb2/test') && r.body.integrations.find((i) => i.key === 'teams').config.urlHint, 'the webhook URL is not echoed in full');
    await raw('POST', '/integrations/calm/tickets', { ...ev, eventSituationId: 'CALM-SIT-7782', title: 'IDoc backlog on ECP' }, { 'x-api-key': key });
    let teams = 0;
    for (let i = 0; i < 16 && !teams; i++) { await sleep(500); teams = Number((await db.query(`SELECT count(*) AS n FROM samadhan.integration_calls WHERE integration = 'teams'`)).rows[0].n); }
    check(teams >= 1, 'an Urgent / major ticket posts to Teams (logged, even when the post fails)', teams);

    // ---- SolMan import ----
    const rows = [
        ['Ticket', 'Title', 'Text', 'Prio', 'State', 'Created on', 'Reporter mail'],
        ['8000001', 'Billing block not removed', 'Order 123', 'High', 'Confirmed', '2026-10-01', 'user1@example.com'],
        ['8000002', '', 'no title', 'Low', 'New', '2026-10-02', ''],
        ['8000003', 'Pricing wrong', 'x', 'Medium', 'In Process', 'not a date', ''],
        ['8000004', 'Vendor block', 'y', 'Low', 'New', '2026-10-05', 'bad-mail'],
    ];
    const mapping = { externalId: 'Ticket', subject: 'Title', description: 'Text', priority: 'Prio', status: 'State', createdAt: 'Created on', requesterEmail: 'Reporter mail' };
    r = await call(ADMIN, 'POST', '/admin/integrations/solman/import', { rows, mapping: { subject: 'Title' } });
    check(r.status === 400, 'mapping needs the ticket id and the subject');
    const before = Number((await db.query('SELECT count(*) AS n FROM samadhan.tickets')).rows[0].n);
    r = await call(ADMIN, 'POST', '/admin/integrations/solman/import', { rows, mapping, dryRun: true });
    const after = Number((await db.query('SELECT count(*) AS n FROM samadhan.tickets')).rows[0].n);
    check(r.status === 200 && r.body.dryRun && r.body.ok === 1 && r.body.errors.length === 3 && after === before, 'dry run: 1 ok, 3 errors with line numbers, nothing created', r.body);
    check(r.body.errors.some((e) => e.line === 3) && r.body.errors.some((e) => /not a date/.test(e.error)) && r.body.errors.some((e) => /email/.test(e.error)), 'error report names the line and the problem');
    r = await call(ADMIN, 'POST', '/admin/integrations/solman/import', { rows, mapping, dryRun: false });
    check(r.status === 200 && r.body.created === 1, 'import creates the valid ticket', r.body);
    const imp = (await db.query(`SELECT t.id, t.source, t."createdAt", s.name FROM samadhan.integration_events e JOIN samadhan.tickets t ON t.id = e."ticketId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE e.integration = 'solman'`)).rows[0];
    check(imp && imp.source === 'SolMan import' && new Date(imp.createdAt).toISOString().startsWith('2026-10-01') && imp.name === 'Closed', 'imported with its source, original date and mapped status', imp);
    r = await call(ADMIN, 'POST', '/admin/integrations/solman/import', { rows, mapping, dryRun: false });
    check(r.body.created === 0 && r.body.skipped === 1, 'importing again skips what is already in');

    // ---- call log, Assist, analytics ----
    r = await call(ADMIN, 'GET', '/admin/integrations');
    check(r.body.calls.length >= 8 && r.body.calls.some((c) => c.integration === 'calm' && c.status === 401) && r.body.calls.some((c) => c.integration === 'monitoring' && c.ok), 'the last calls are logged (OK and refused)');
    await call(ADMIN, 'PATCH', `/tickets/${m1.ticketId}`, { confidential: true });
    r = await call(ADMIN, 'GET', `/tickets/${m1.ticketId}/insights?generate=1`);
    check(r.status === 200 && /Confidential/.test(JSON.stringify(r.body)), 'Assist: no AI on a confidential ticket', r.body?.insights?.aiNote ?? r.body?.aiNote);
    r = await call(A1, 'GET', '/analytics/desks');
    check(r.status === 403, 'desk analytics: Supervisors and up');
    r = await call(SUP, 'GET', '/analytics/desks?days=30');
    check(r.status === 200 && Array.isArray(r.body.sap.modules) && r.body.sap.externalAgeing.length === 4 && typeof r.body.infra.p1Open === 'number', 'desk analytics: SAP modules, external-case ageing, Infra P1', r.body.infra);

    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
