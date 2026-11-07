'use strict';
/*
   v7 Phase 2 - Authorization cockpit + permission middleware + data scope, end to end against a running backend.
   Same safety rules and environment as api.test.js (localhost only, SAMADHAN_TEST_ALLOW=1, fresh throwaway database):

     SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/authz.api.test.js
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
const S = T('SCHEMA', 'samadhan');
const SECRET = process.env.HUB_AUTH_JWT_SECRET;
if (T('ALLOW') !== '1' || !/@(localhost|127\.0\.0\.1)[:/]/.test(PG) || !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(API) || !/^[a-z_]+$/.test(S)) {
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
const ADMIN = 'z.admin@emamigroup.com';
const SUP = 'z.sup@emamigroup.com';
const A1 = 'z.agent1@emamigroup.com';
const A2 = 'z.agent2@emamigroup.com';

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query('INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [email, APP, role]);
    }

    // ---- /me carries the effective permissions and scope; baseline = the old roles ----
    const meA1 = (await call(A1, 'GET', '/me')).body;
    const meSup = (await call(SUP, 'GET', '/me')).body;
    const meAdmin = (await call(ADMIN, 'GET', '/me')).body;
    const a2 = (await call(A2, 'GET', '/me')).body.me;
    const a1 = meA1.me;
    check(Array.isArray(meA1.permissions) && meA1.permissions.includes('ticket.view') && !meA1.permissions.includes('ticket.export'), 'agent /me: ticket.view, no ticket.export');
    check(meSup.permissions.includes('ticket.export') && meSup.permissions.includes('screen.reports') && !meSup.permissions.some((k) => k.startsWith('admin.')), 'supervisor /me: export + reports, no admin.*');
    check(meAdmin.permissions.includes('admin.authorization') && meA1.scope.visibility === 'all', 'admin /me: admin.authorization; default scope all');

    // ---- Cockpit is Admin only ----
    let r = await call(A1, 'GET', '/admin/authz/overview'); check(r.status === 403, 'agent -> cockpit 403');
    r = await call(SUP, 'GET', '/admin/authz/overview'); check(r.status === 403, 'supervisor -> cockpit 403');
    r = await call(ADMIN, 'GET', '/admin/authz/overview'); check(r.status === 200 && r.body.usersByRole.Agent >= 2, 'admin -> overview', r.body.usersByRole);
    r = await call(ADMIN, 'GET', '/admin/authz/catalogue'); check(r.status === 200 && r.body.catalogue.Admin.includes('admin.authorization'), 'catalogue');
    r = await call(ADMIN, 'GET', '/admin/authz/profiles');
    check(r.status === 200 && r.body.system.length === 3 && r.body.profiles.length === 8, '3 system + 8 seeded custom profiles', { s: r.body.system.length, c: r.body.profiles.length });
    const auditor = r.body.profiles.find((p) => p.code === 'AUDITOR');
    const approver = r.body.profiles.find((p) => p.code === 'APPROVER_CAB');

    // ---- Profiles: reason, no admin.*, copy ----
    r = await call(ADMIN, 'POST', '/admin/authz/profiles', { name: 'Exporter', keys: ['ticket.export'] }); check(r.status === 400, 'profile without reason -> 400');
    r = await call(ADMIN, 'POST', '/admin/authz/profiles', { name: 'Bad', keys: ['admin.general'], reason: 't' }); check(r.status === 400, 'profile with admin.* -> 400');
    r = await call(ADMIN, 'POST', '/admin/authz/profiles', { name: 'Bad2', keys: ['nope.key'], reason: 't' }); check(r.status === 400, 'profile with unknown key -> 400');
    r = await call(ADMIN, 'POST', '/admin/authz/profiles', { name: 'Exporter', keys: ['ticket.export'], reason: 'month-end exports' });
    check(r.status === 201 && r.body.profile.code === 'EXPORTER', 'custom profile created');
    const exporter = r.body.profile;
    r = await call(ADMIN, 'POST', '/admin/authz/profiles', { name: 'Agent copy', copyOf: 'AGENT', reason: 'copy test' });
    check(r.status === 201 && r.body.profile.keys.includes('ticket.reply'), 'copy of the AGENT system profile');
    r = await call(SUP, 'POST', '/admin/authz/profiles', { name: 'x', keys: [], reason: 'x' }); check(r.status === 403, 'supervisor cannot create profiles');

    // ---- Assign a profile -> new right takes effect at once ----
    r = await call(A1, 'GET', '/tickets/export'); check(r.status === 403, 'agent export before -> 403');
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a1.id}`, { profiles: [{ profileId: exporter.id }] }); check(r.status === 400, 'assignment without reason -> 400');
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a1.id}`, { profiles: [{ profileId: exporter.id }], reason: 'audit support' });
    check(r.status === 200 && r.body.access.added.includes('ticket.export'), 'profile assigned; preview shows the added key', r.body.access && r.body.access.added);
    r = await call(A1, 'GET', '/tickets/export'); check(r.status === 200, 'agent export after the profile -> 200', r.status);
    r = await call(A1, 'GET', '/me'); check(r.body.permissions.includes('ticket.export'), '/me reflects the profile');

    // ---- Overrides: deny wins; admin.* cannot be granted ----
    const t1 = (await call(A1, 'POST', '/tickets', { subject: 'Authz ticket one', requesterName: 'Req One', requesterEmail: 'req1@example.com' })).body.ticket;
    const t2 = (await call(A2, 'POST', '/tickets', { subject: 'Authz ticket two', requesterName: 'Req Two', requesterEmail: 'req2@example.com' })).body.ticket;
    check(t1 && t2, 'two tickets created');
    await call(ADMIN, 'PATCH', `/tickets/${t1.id}`, { agentId: a1.id, groupId: null });
    await call(ADMIN, 'PATCH', `/tickets/${t2.id}`, { agentId: a2.id, groupId: null });
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a1.id}`, { overrides: [{ key: 'admin.general', effect: 'grant' }], reason: 'x' }); check(r.status === 400, 'grant admin.* override -> 400');
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a1.id}`, { overrides: [{ key: 'ticket.reply', effect: 'deny' }], reason: 'on probation' }); check(r.status === 200, 'deny override saved');
    r = await call(A1, 'POST', `/tickets/${t1.id}/messages`, { kind: 'REPLY', text: 'hello' }); check(r.status === 403, 'denied reply -> 403', r.status);
    r = await call(A1, 'POST', `/tickets/${t1.id}/messages`, { kind: 'NOTE', text: 'internal note' }); check(r.status === 201, 'note still allowed', r.status);
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a1.id}`, { overrides: [], reason: 'probation over' }); check(r.status === 200, 'override removed');
    r = await call(A1, 'POST', `/tickets/${t1.id}/messages`, { kind: 'REPLY', text: 'hello again' }); check(r.status === 201, 'reply allowed again', r.status);

    // ---- SoD: ticket.create + approval.decide needs confirmation ----
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { profiles: [{ profileId: approver.id }], reason: 'CAB member' });
    check(r.status === 409 && Array.isArray(r.body.sod) && r.body.sod.some((w) => w.id === 'create-approve'), 'SoD warning -> 409 until confirmed', r.body);
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { profiles: [{ profileId: approver.id }], reason: 'CAB member', acceptSod: true });
    check(r.status === 200 && r.body.access.sod.length >= 1, 'SoD accepted with a reason');
    r = await call(ADMIN, 'GET', '/admin/authz/overview'); check(r.body.sodWarnings.some((w) => w.email === A2), 'overview lists the open SoD warning');
    await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { profiles: [], reason: 'cleanup' });

    // ---- Data scope: own ----
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { visibility: 'bogus' }, reason: 'x' }); check(r.status === 400, 'invalid visibility -> 400');
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { visibility: 'own' }, reason: 'contractor' }); check(r.status === 200, 'scope own saved');
    r = await call(A2, 'GET', '/me'); check(r.body.scope.visibility === 'own', '/me shows scope own');
    r = await call(A2, 'GET', '/tickets?view=all'); check(r.status === 200 && r.body.items.every((t) => t.agentId === a2.id) && r.body.items.some((t) => t.id === t2.id), 'list: only own tickets', r.body.items.map((t) => t.id));
    r = await call(A2, 'GET', '/tickets/counts'); check(r.body.all === r.body.items?.length || r.body.all === 1, 'counts: all = own only', r.body.all);
    r = await call(A2, 'GET', `/tickets/${t1.id}`); check(r.status === 404, "someone else's ticket -> 404", r.status);
    r = await call(A2, 'POST', `/tickets/${t1.id}/messages`, { kind: 'NOTE', text: 'x' }); check(r.status === 404, 'note on out-of-scope ticket -> 404');
    r = await call(A2, 'POST', '/tickets/bulk', { ids: [t1.id, t2.id], action: 'watch' }); check(r.status === 404, 'bulk including an out-of-scope ticket -> 404');
    r = await call(A2, 'GET', `/search?q=Authz`); check(r.body.tickets.every((t) => t.id !== t1.id), 'search hides out-of-scope tickets');
    r = await call(A2, 'GET', '/board'); check(r.body.items.every((t) => t.id !== t1.id), 'board hides out-of-scope tickets');
    r = await call(A2, 'GET', '/dashboard'); check(r.status === 200, 'dashboard works with a narrowed scope');
    r = await call(A2, 'GET', '/insights/dashboard'); check(r.status === 200 && r.body.scoped === true && r.body.insights === null, 'queue-wide insights hidden for a narrowed scope');
    // Watching a ticket brings it into an "own" scope.
    await db.query(`INSERT INTO ${S}.ticket_watchers ("ticketId", "agentId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [t1.id, a2.id]);
    r = await call(A2, 'GET', `/tickets/${t1.id}`); check(r.status === 200, 'watched ticket is visible in scope own', r.status);
    await db.query(`DELETE FROM ${S}.ticket_watchers WHERE "ticketId" = $1 AND "agentId" = $2`, [t1.id, a2.id]);

    // ---- Data scope: groups ----
    const g = (await db.query(`INSERT INTO ${S}.groups (name) VALUES ('Authz test group') RETURNING id`)).rows[0];
    await db.query(`INSERT INTO ${S}.group_members ("groupId", "agentId") VALUES ($1, $2)`, [g.id, a2.id]);
    await call(ADMIN, 'PATCH', `/tickets/${t1.id}`, { groupId: g.id });
    r = await call(A2, 'GET', `/tickets/${t1.id}`); check(r.status === 404, 'scope own: group ticket still hidden');
    await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { visibility: 'groups' }, reason: 'joined the group' });
    r = await call(A2, 'GET', `/tickets/${t1.id}`); check(r.status === 200, "scope groups: my group's ticket visible", r.status);
    await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { visibility: 'all' }, reason: 'back to normal' });

    // ---- Restrict profile: Auditor caps a Supervisor to read-only ----
    const sup = meSup.me;
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${sup.id}`, { profiles: [{ profileId: auditor.id }], reason: 'internal audit' }); check(r.status === 200, 'auditor assigned to the supervisor');
    r = await call(SUP, 'POST', '/tickets', { subject: 'x', requesterName: 'x', requesterEmail: 'x@example.com' }); check(r.status === 403, 'auditor cannot create tickets');
    r = await call(SUP, 'PATCH', `/tickets/${t2.id}`, { subject: 'changed' }); check(r.status === 403, 'auditor cannot edit');
    r = await call(SUP, 'GET', '/tickets'); check(r.status === 200, 'auditor can list');
    r = await call(SUP, 'GET', '/analytics'); check(r.status === 200, 'auditor can open analytics');

    // ---- Temporary access ends ----
    const past = new Date(Date.now() - 3600e3).toISOString();
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${sup.id}`, { profiles: [{ profileId: auditor.id, validTo: past }], reason: 'audit finished' });
    check(r.status === 200 && !r.body.access.removed.includes('ticket.create'), 'expired profile no longer restricts');
    r = await call(SUP, 'POST', '/tickets', { subject: 'after audit', requesterName: 'x', requesterEmail: 'x2@example.com' }); check(r.status === 201, 'supervisor can create again', r.status);
    r = await call(ADMIN, 'GET', '/admin/authz/review'); check(r.status === 200 && r.body.users.some((u) => u.email === SUP && u.expired === 1), 'access review shows the expired grant');
    r = await call(ADMIN, 'POST', '/admin/authz/review/revoke-expired'); check(r.status === 200 && r.body.people >= 1, 'revoke expired', r.body);
    const left = (await db.query(`SELECT count(*)::int AS n FROM ${S}.auth_user_profiles WHERE "validTo" <= now()`)).rows[0].n;
    check(left === 0, 'no expired grants left');

    // ---- Change log + audit log ----
    r = await call(ADMIN, 'GET', '/admin/authz/log'); check(r.status === 200 && r.body.entries.length >= 8 && r.body.entries.every((e) => e.actorEmail), 'change log entries with actor', r.body.entries.length);
    check(r.body.entries.some((e) => /SoD accepted/.test(e.reason || '')), 'SoD acceptance is in the change log');
    r = await call(ADMIN, 'GET', '/admin/authz/log?q=probation'); check(r.body.entries.length >= 1, 'change log search');
    const aud = (await db.query(`SELECT count(*)::int AS n FROM ${S}.audit_events WHERE action LIKE 'authz_%'`)).rows[0].n;
    check(aud >= 8, 'cockpit changes also in the audit log', aud);

    // ---- An unmapped route is refused, never open ----
    r = await call(ADMIN, 'GET', '/no-such-route'); check(r.status === 403, 'unmapped route -> 403 (fail closed)', r.status);

    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
