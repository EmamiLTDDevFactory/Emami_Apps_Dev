'use strict';
/*
   v7 Phase 2 - permission system, no database needed:
     1. every route registered on the signed-in routers has a rule in middleware/permission.js (no route is left open);
     2. OLD vs NEW access (master prompt §K 9.1): for every route and each base role, the seeded system profiles allow
        exactly what the pre-v7 role checks allowed (Agent / Supervisor / Admin), including the body-dependent cases;
     3. the effective() rules: Admin = everything, admin.* never via profile or override, deny wins, expiry, restrict.
     node --test backend/samadhan/tests/permissions.test.js
*/
// Loading the routers loads the shared backend modules, which open a lazy Postgres pool: point it at a closed local
// port so this test can never reach a real database (dotenv does not override variables that are already set).
process.env.PGHOST = '127.0.0.1';
process.env.PGPORT = '1';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { ALL_KEYS, SYSTEM_PROFILES, effective } = require('../lib/permissions');
const { RULES, ruleFor } = require('../middleware/permission');
const { SEED_PROFILES } = require('../lib/authSeed');

// Routers mounted after requireAccess in index.js, with their mount prefix.
const MOUNTS = [['', 'me'], ['', 'tickets'], ['', 'work'], ['', 'reports'], ['', 'insights'], ['', 'attachments'], ['/admin', 'admin'], ['/admin/authz', 'authz'], ['/admin', 'workspaces'], ['', 'sap'], ['', 'it'], ['', 'change'], ['', 'problem']];
function registered() {
    const out = [];
    for (const [prefix, file] of MOUNTS) {
        const mod = require(path.join(__dirname, '..', 'routes', `${file}.js`));
        const router = mod.stack ? mod : mod.router;
        for (const layer of router.stack) {
            if (!layer.route) continue;
            for (const m of Object.keys(layer.route.methods)) out.push([m.toUpperCase(), prefix + layer.route.path]);
        }
    }
    return out;
}

// The pre-v7 checks (DISCOVERY §6 / PLAN §7): the lowest role that could use each route. Everything not listed = Agent.
const RANK = { Agent: 1, Supervisor: 2, Admin: 3 };
const OLD_MIN = {
    'GET /tickets/export': 'Supervisor', 'GET /analytics': 'Supervisor', 'GET /reports/daily': 'Supervisor',
    'POST /companies': 'Supervisor', 'POST /articles': 'Supervisor', 'DELETE /articles/:id': 'Supervisor',
    // v7 Phase 6 routes that did not exist before: the registers are a reporting screen (Supervisor and up by default).
    'GET /registers': 'Supervisor', 'GET /registers/:kind': 'Supervisor',
    // v7 Phase 7: declaring / standing down a major incident and editing the PIR (Supervisor and up by default).
    'POST /tickets/:id/major': 'Supervisor', 'DELETE /tickets/:id/major': 'Supervisor', 'PUT /tickets/:id/pir': 'Supervisor',
};
const oldMin = (method, p) => (p.startsWith('/admin') ? 'Admin' : OLD_MIN[`${method} ${p}`] || 'Agent');
const allowedNew = (role, rule, req = { body: {}, query: {} }) => {
    const keys = effective(role);
    const needed = typeof rule.key === 'function' ? rule.key(req) : rule.key;
    return needed == null || [].concat(needed).every((k) => keys.has(k));
};
// A concrete path for a pattern (":id" -> 1) so ruleFor() is exercised the way requests hit it.
const concrete = (p) => p.replace(/:[a-z]+/gi, '1');

test('every signed-in route has a permission rule', () => {
    const missing = registered().filter(([m, p]) => !ruleFor(m, concrete(p)));
    assert.deepStrictEqual(missing, []);
});

test('no rule without a route (stale entries)', () => {
    const routes = new Set(registered().map(([m, p]) => `${m} ${p}`));
    const stale = RULES.filter(([m, p]) => !routes.has(`${m} ${p}`)).map(([m, p]) => `${m} ${p}`);
    assert.deepStrictEqual(stale, []);
});

test('rules resolve to the right entry (literal paths win over :id)', () => {
    assert.strictEqual(ruleFor('GET', '/tickets/counts').path, '/tickets/counts');
    assert.strictEqual(ruleFor('GET', '/tickets/export').path, '/tickets/export');
    assert.strictEqual(ruleFor('GET', '/tickets/123').path, '/tickets/:id');
    assert.strictEqual(ruleFor('GET', '/tickets/123/insights').path, '/tickets/:id/insights');
    assert.strictEqual(ruleFor('PUT', '/admin/statuses/order').path, '/admin/statuses/order');
});

test('OLD vs NEW: every route x every base role behaves as before v7', () => {
    const diffs = [];
    for (const [method, p] of registered()) {
        const rule = ruleFor(method, concrete(p));
        for (const role of ['Agent', 'Supervisor', 'Admin']) {
            const before = RANK[role] >= RANK[oldMin(method, p)];
            const now = allowedNew(role, rule);
            if (before !== now) diffs.push({ route: `${method} ${p}`, role, before, now });
        }
    }
    assert.deepStrictEqual(diffs, []);
});

test('OLD vs NEW: body-dependent actions', () => {
    const bulk = ruleFor('POST', '/tickets/bulk');
    const views = ruleFor('POST', '/views');
    const variants = ruleFor('POST', '/variants');
    const msg = ruleFor('POST', '/tickets/1/messages');
    const patch = ruleFor('PATCH', '/tickets/1');
    const cases = [
        // [rule, body, minimum role before v7]
        [bulk, { action: 'purge' }, 'Admin'], [bulk, { action: 'trash' }, 'Agent'], [bulk, { action: 'spam' }, 'Agent'],
        [bulk, { action: 'merge' }, 'Agent'], [bulk, { action: 'update' }, 'Agent'], [bulk, { action: 'watch' }, 'Agent'],
        [views, { shared: true }, 'Supervisor'], [views, { shared: false }, 'Agent'],
        [variants, { shared: true }, 'Supervisor'], [variants, {}, 'Agent'],
        [msg, { kind: 'REPLY' }, 'Agent'], [msg, { kind: 'NOTE' }, 'Agent'], [msg, { kind: 'FORWARD' }, 'Agent'],
        [patch, { agentId: 5 }, 'Agent'], [patch, { subject: 'x' }, 'Agent'],
    ];
    for (const [rule, body, min] of cases) {
        for (const role of ['Agent', 'Supervisor', 'Admin']) {
            assert.strictEqual(allowedNew(role, rule, { body, query: {} }), RANK[role] >= RANK[min], `${rule.method} ${rule.path} ${JSON.stringify(body)} as ${role}`);
        }
    }
});

test('OLD vs NEW: in-route checks use keys held by exactly the old roles', () => {
    // routes/*.js req.can(...) replacements of isSupervisor / isAdmin / requireSupervisor.
    const map = {
        'insights.refresh': 'Supervisor', 'ticket.purge': 'Admin', 'ticket.export': 'Supervisor', 'screen.analytics': 'Supervisor',
        'screen.reports': 'Supervisor', 'views.share': 'Supervisor', 'report.variants.share': 'Supervisor', 'article.edit': 'Supervisor',
        'article.publish': 'Supervisor', 'company.create': 'Supervisor', 'admin.general': 'Admin', 'insights.ai': 'Agent',
    };
    for (const [key, min] of Object.entries(map)) {
        for (const role of ['Agent', 'Supervisor', 'Admin']) {
            assert.strictEqual(effective(role).has(key), RANK[role] >= RANK[min], `${key} as ${role}`);
        }
    }
});

test('effective(): Admin has every key; admin.* only for Admin', () => {
    assert.strictEqual(effective('Admin').size, ALL_KEYS.length);
    for (const role of ['Agent', 'Supervisor']) assert.ok(![...effective(role)].some((k) => k.startsWith('admin.')), role);
    const p = [{ keys: ['admin.general', 'ticket.purge'], mode: 'add' }];
    const o = [{ key: 'admin.jobs', effect: 'grant' }];
    const keys = effective('Agent', { profiles: p, overrides: o });
    assert.ok(keys.has('ticket.purge') && !keys.has('admin.general') && !keys.has('admin.jobs'));
});

test('effective(): deny wins, expiry and validity windows respected', () => {
    const past = new Date(Date.now() - 3600e3).toISOString();
    const future = new Date(Date.now() + 3600e3).toISOString();
    assert.ok(!effective('Agent', { overrides: [{ key: 'ticket.reply', effect: 'deny' }] }).has('ticket.reply'));
    assert.ok(!effective('Agent', { overrides: [{ key: 'ticket.export', effect: 'grant' }, { key: 'ticket.export', effect: 'deny' }] }).has('ticket.export'));
    assert.ok(effective('Agent', { overrides: [{ key: 'ticket.reply', effect: 'deny', expiresAt: past }] }).has('ticket.reply'));
    assert.ok(effective('Agent', { overrides: [{ key: 'ticket.export', effect: 'grant', expiresAt: future }] }).has('ticket.export'));
    assert.ok(!effective('Agent', { profiles: [{ keys: ['ticket.export'], mode: 'add', validTo: past }] }).has('ticket.export'));
    assert.ok(!effective('Agent', { profiles: [{ keys: ['ticket.export'], mode: 'add', validFrom: future }] }).has('ticket.export'));
    assert.ok(!effective('Agent', { profiles: [{ keys: ['ticket.export'], mode: 'add', active: false }] }).has('ticket.export'));
});

test('effective(): restrict profile (Auditor) caps a Supervisor to read-only', () => {
    const auditor = SEED_PROFILES.find((p) => p.code === 'AUDITOR');
    const keys = effective('Supervisor', { profiles: [auditor] });
    for (const k of ['ticket.view', 'screen.reports', 'ticket.export']) assert.ok(keys.has(k), k);
    for (const k of ['ticket.create', 'ticket.edit', 'ticket.reply', 'article.edit']) assert.ok(!keys.has(k), k);
});

test('seeded profiles use known keys only and never admin.*', () => {
    const known = new Set(ALL_KEYS);
    assert.strictEqual(SEED_PROFILES.length, 8);
    for (const p of SEED_PROFILES) {
        for (const k of p.keys) { assert.ok(known.has(k), `${p.code}: ${k}`); assert.ok(!k.startsWith('admin.'), `${p.code}: ${k}`); }
    }
    assert.ok(SYSTEM_PROFILES.SUPERVISOR.keys.every((k) => !k.startsWith('admin.')));
});
