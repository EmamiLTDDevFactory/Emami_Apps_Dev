// Publicity Expenses: exclusion engine, budget upload, mapping overrides and the admin routes.
// No database, no SAP: in-memory store, mock data, stubbed access check. Run: node --test backend/publicityExpenses/tests/
process.env.HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || 'test-secret-publicity-expenses';
delete process.env.PUBEXP_SAP_ODATA_ROOT;
delete process.env.PUBEXP_SOURCE;
delete process.env.PUBEXP_BUDGET_SOURCE;
process.env.PUBEXP_STORE = 'memory';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db');
const mock = require('../mock');
const R = require('../rules');
const { validateUpload, applyUploadedBudget } = require('../budget');
const { resetMemoryStore } = require('../store');
const router = require('..');

const sum = (rows, k) => Math.round(rows.reduce((s, r) => s + (r[k] || 0), 0) * 100) / 100;
const near = (a, b, tol = 0.1) => Math.abs(a - b) < tol;

// ---------------------------------------------------------------- engine

test('rule patterns: exact list, range, wildcard; leading zeros ignored; picked values never read as a range', () => {
    const m = (values, pattern) => R.compile({ values, pattern });
    assert.ok(m(['508458'])('0000508458'));
    assert.ok(!m(['508458'])('0000508459'));
    assert.ok(m([], '508000-508099')('0000508042'));
    assert.ok(!m([], '508000-508099')('0000508100'));
    assert.ok(m([], 'EH19*')('eh193'));
    assert.ok(m([], '5080??')('0000508042'));
    assert.ok(!m([], '5080??')('0000508142'));
    assert.ok(m(['Misc - HO non Brand'])('MISC - HO NON BRAND'));
    assert.ok(m(['A-1'])('A-1') && !m(['A-1'])('A-0'), 'an exact value with a dash is not a range');
    assert.ok(m([], 'EH001, UN02*')('UN02005'));
    assert.throws(() => m([], ''), /at least one/);
    assert.throws(() => m([], 'EH$1'), /not allowed/);
});

test('validateRule: dimension, reason, effective period order, value list parsing', () => {
    assert.match(R.validateRule({ dimension: 'X', values: ['1'], reason: 'abc', fromFy: 2026 }).error, /Dimension/);
    assert.match(R.validateRule({ dimension: 'GL', values: ['1'], reason: '', fromFy: 2026 }).error, /reason/);
    assert.match(R.validateRule({ dimension: 'GL', values: ['1'], reason: 'test', fromFy: 2026, fromPeriod: 5, toFy: 2026, toPeriod: 4 }).error, /before/);
    const ok = R.validateRule({ dimension: 'cost_center', values: 'EH001; EH002', reason: 'Transfer', fromFy: 2026 });
    assert.deepEqual(ok.rule.values, ['EH001', 'EH002']);
    assert.equal(ok.rule.fromPeriod, 1);
    assert.equal(ok.rule.toFy, null);
});

test('effective period: a rule applies only to reports inside [from, to]', () => {
    const rule = { active: true, fromFy: 2026, fromPeriod: 4, toFy: 2026, toPeriod: 9 };
    assert.ok(!R.applies(rule, 2026, 3));
    assert.ok(R.applies(rule, 2026, 4) && R.applies(rule, 2026, 9));
    assert.ok(!R.applies(rule, 2026, 10));
    assert.ok(R.applies({ ...rule, toFy: null }, 2030, 1));
    assert.ok(!R.applies({ ...rule, active: false }, 2026, 5));
});

test('G/L and cost-centre exclusions: report + excluded = G/L, attributed per rule, no double counting', () => {
    const summary = mock.summary('2026', 7, {});
    const detail = mock.detail('2026', 7, {});
    const gl = summary[0].GLAccount;
    const cc = detail.find((d) => d.GLAccount !== gl).CostCenter;
    const rules = [
        { id: 1, dimension: 'GL', values: [gl], pattern: '', active: true, fromFy: 2026, fromPeriod: 1 },
        { id: 2, dimension: 'COST_CENTER', values: [cc], pattern: '', active: true, fromFy: 2026, fromPeriod: 1 },
    ];
    const active = R.activeRules(rules, 2026, 7);
    const out = R.applyToSummary(summary, active, detail);
    const before = sum(summary, 'CYYTDAmount'); const after = sum(out.rows, 'CYYTDAmount');
    assert.ok(near(before - after, out.excluded.cy), `${before} - ${after} != ${out.excluded.cy}`);
    assert.ok(near(out.excluded.byRule[1].cy + out.excluded.byRule[2].cy, out.excluded.cy));
    assert.ok(out.excluded.byRule[1].cy > 0 && out.excluded.byRule[2].cy > 0);
    assert.ok(!out.rows.some((r) => r.GLAccount === gl));
    assert.ok(summary.some((r) => r.GLAccount === gl), 'input rows are not modified');
    const d = R.applyToDetail(detail, active);
    assert.ok(!d.rows.some((r) => r.CostCenter === cc || r.GLAccount === gl));
    assert.ok(near(sum(d.rows, 'CYYTDAmount'), after), 'detail after exclusions = summary after exclusions');
});

// ---------------------------------------------------------------- budget

test('budget upload: units, monthly phasing, mismatch / duplicate / header errors, unknown keys warn', () => {
    const known = new Map([['BR001', { key: 'BR001', companyCode: '1000' }]]);
    const months = Array(12).fill(10);
    const v = validateUpload({ fy: 2026, kind: 'RB', unit: 'lakh', rows: [
        { row: 2, key: 'BR001', header: 'ATL', annual: 120, months },
        { row: 3, key: 'BR001', header: 'Film Prod', annual: 24 },
        { row: 4, key: 'BR001', header: 'ATL', annual: 5 },
        { row: 5, key: 'BR001', header: 'BTL', annual: 100, months },
        { row: 6, key: 'BR001', header: 'NEW HEAD', annual: 1 },
        { row: 7, key: 'ZZ999', header: 'BTL', annual: 1 },
        { row: 8, key: 'BR001', header: 'CREATIVE', annual: 0 },
    ] }, known, null);
    assert.deepEqual(v.errors.map((e) => e.row), [4, 5, 6]);
    assert.match(v.errors[0].message, /Duplicate of row 2/);
    assert.match(v.errors[1].message, /add up to 120/);
    assert.equal(v.lines.length, 3);
    assert.equal(v.lines[0].annual, 120e5);
    assert.equal(v.lines[0].companyCode, '1000');
    assert.equal(v.lines[1].months[0], 2e5, 'no months = straight-line');
    assert.equal(v.skipped, 1);
    assert.ok(v.warnings.some((w) => /ZZ999/.test(w.message)));
    assert.equal(v.phasing, 'mixed');
});

test('uploaded budget becomes budget-only rows; YTD from the monthly phasing; SAP row budget cleared', () => {
    const rows = [{ CompanyCode: '1000', ReportingKey: 'BR001', HeaderGroup: 'ATL', ItemCategory: 'CAT', SerialNo: '001', CYYTDAmount: 50, PYYTDAmount: 0, OBAnnualAmount: 9, RBAnnualAmount: 9, OBYTDAmount: 9, RBYTDAmount: 9 }];
    const lines = [{ companyCode: '', reportingKey: 'BR001', headerGroup: 'ATL', site: '', annual: 1200, months: [100, 100, 100, 100, 100, 100, 300, 100, 0, 0, 100, 0], labels: {} }];
    const out = applyUploadedBudget(rows, { RB: { lines }, OB: { lines: [{ ...lines[0], annual: 600, months: Array(12).fill(50) }] } }, 7, null);
    assert.equal(out.length, 2);
    assert.equal(out[0].RBAnnualAmount, 0);
    const b = out[1];
    assert.ok(b.IsBudget && b.GLAccount === '' && b.CYYTDAmount === 0);
    assert.equal(b.RBAnnualAmount, 1200); assert.equal(b.RBYTDAmount, 900); assert.equal(b.OBYTDAmount, 350);
    assert.equal(b.CompanyCode, '1000'); assert.equal(b.ItemCategory, 'CAT'); assert.equal(b.SpendClass, 'ATL');
});

// ---------------------------------------------------------------- routes

const ROLES = { 'user@emamigroup.com': 'User', 'admin@emamigroup.com': 'Admin' };
const stubAccess = async (sql, args) => (sql.includes('authorized_user_apps') ? { rows: ROLES[args[0]] ? [{ role: ROLES[args[0]] }] : [] } : { rows: [{ is_active: true }] });
const token = (email) => jwt.sign({ email }, process.env.HUB_AUTH_JWT_SECRET);

test('admin routes: users cannot change settings; rules, budget versions and mapping change the report', async () => {
    resetMemoryStore();
    const realQuery = db.pool.query;
    db.pool.query = stubAccess;
    const app = express();
    app.use(express.json({ limit: '6mb' }));
    app.use('/x', router);
    const server = await new Promise((resolve) => { const s = http.createServer(app).listen(0, () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/x`;
    const call = (method, path, email, body) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token(email)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
        .then(async (r) => ({ status: r.status, body: await r.json() }));
    const A = 'admin@emamigroup.com'; const U = 'user@emamigroup.com';
    const P = 'fy=2026&period=7';
    try {
        assert.equal((await call('GET', '/me', A)).body.admin, true);
        assert.equal((await call('GET', '/me', U)).body.admin, false);
        assert.equal((await call('GET', `/exclusions?${P}`, U)).status, 403);
        assert.equal((await call('POST', '/exclusions', U, { dimension: 'GL', values: ['1'], reason: 'x y z', fromFy: 2026 })).status, 403);

        // Exclusions picked from the CDS results
        const total0 = sum((await call('GET', `/summary?${P}`, U)).body.rows, 'CYYTDAmount');
        const gls = (await call('GET', `/exclusions/candidates?${P}&dimension=GL`, A)).body.values;
        assert.ok(gls.length > 10 && gls[0].name && gls[0].cy >= gls[1].cy);
        const ccs = (await call('GET', `/exclusions/candidates?${P}&dimension=COST_CENTER`, A)).body.values;
        assert.ok(ccs.length > 10 && ccs[0].name);
        for (const d of ['PROFIT_CENTER', 'CC_TYPE', 'COMPANY_CODE', 'PRODUCT_GROUP', 'MAPPING_RULE']) assert.ok((await call('GET', `/exclusions/candidates?${P}&dimension=${d}`, A)).body.values.length > 0, d);
        const pick = [gls[0].value, gls[1].value];
        const prev = (await call('POST', '/exclusions/preview', A, { fy: '2026', period: 7, rule: { dimension: 'GL', values: pick } })).body.impact;
        assert.ok(near(prev.cy, gls[0].cy + gls[1].cy));
        const created = (await call('POST', '/exclusions', A, { dimension: 'GL', values: pick, reason: 'Corporate film, not brand A&P', fromFy: 2026, fromPeriod: 1 })).body.rule;
        await call('POST', '/exclusions', A, { dimension: 'COST_CENTER', values: [ccs[0].value], reason: 'Shared service centre', fromFy: 2026, fromPeriod: 1 });
        const marked = (await call('GET', `/exclusions/candidates?${P}&dimension=GL`, A)).body.values;
        assert.deepEqual(marked.find((c) => c.value === pick[0]).ruleIds, [created.id]);

        const after = (await call('GET', `/summary?${P}`, U)).body;
        const total1 = sum(after.rows, 'CYYTDAmount');
        assert.equal(after.meta.exclusions.rules, 2);
        assert.ok(near(total0 - total1, after.meta.exclusions.cy));
        assert.ok(!after.rows.some((r) => pick.includes(r.GLAccount)));
        assert.ok(near(sum((await call('GET', `/summary?${P}&exclusions=off`, U)).body.rows, 'CYYTDAmount'), total0, 0.05));
        const bd = (await call('GET', `/breakdown?${P}`, U)).body;
        assert.ok(Math.abs(bd.reconciliation.glCheck) < 0.1, `G/L = report + excluded (${bd.reconciliation.glCheck})`);
        assert.ok(Math.abs(bd.reconciliation.difference) < 0.1);
        const trend = (await call('GET', `/trend?${P}`, U)).body;
        assert.ok(near(trend.months.reduce((s, m) => s + m.cy, 0), total1, 1), 'months add up to the YTD after exclusions');
        const cell = after.rows.find((r) => r.ReportingKey.startsWith('BR') && !r.IsBudget);
        const det = (await call('GET', `/detail?${P}&key=${cell.ReportingKey}&gl=${cell.GLAccount}&site=${cell.Site}`, U)).body;
        assert.ok(near(sum(det.rows, 'CYYTDAmount'), cell.CYYTDAmount), 'drill-down = report cell after exclusions');

        const list = (await call('GET', `/exclusions?${P}`, A)).body;
        assert.equal(list.rules.length, 2);
        assert.ok(list.rules.every((r) => r.inForce && r.impact.cy > 0));
        await call('PUT', `/exclusions/${created.id}`, A, { ...created, fromFy: 2026, fromPeriod: 8 });
        assert.equal((await call('GET', `/summary?${P}`, U)).body.meta.exclusions.rules, 1, 'rule effective from P08 is not in force for P07');
        const notInForce = (await call('GET', `/exclusions?${P}`, A)).body.rules.find((r) => r.id === created.id);
        assert.ok(!notInForce.inForce && notInForce.impact.cy > 0, 'impact shown for a rule not yet in force');
        assert.equal((await call('DELETE', `/exclusions/${created.id}`, A)).status, 200);
        const bulk = (await call('POST', '/exclusions/bulk', A, { dryRun: true, rows: [{ row: 2, dimension: 'GL', pattern: '508000-508099', reason: 'range test', fromFy: 2026 }, { row: 3, dimension: 'NOPE', values: ['1'], reason: 'bad', fromFy: 2026 }] })).body;
        assert.deepEqual(bulk.errors.map((e) => e.row), [3]);

        // Budget upload, versions, rollback
        const tpl = (await call('GET', `/budget/template?${P}&kind=RB`, A)).body;
        assert.ok(tpl.lines.length > 100 && tpl.lines[0].key && tpl.lines[0].header);
        const rows = tpl.lines.slice(0, 40).map((l, i) => ({ row: i + 2, key: l.key, header: l.header, annual: 12 }));
        const dry = (await call('POST', '/budget/upload', A, { fy: 2026, kind: 'RB', unit: 'lakh', rows, dryRun: true })).body;
        assert.equal(dry.errorCount, 0); assert.equal(dry.saved, null); assert.equal(dry.totals.total, 40 * 12e5);
        const v1 = (await call('POST', '/budget/upload', A, { fy: 2026, kind: 'RB', unit: 'lakh', rows, fileName: 'rb.xlsx', note: 'first' })).body.saved;
        assert.equal(v1.version, 1);
        const withBudget = (await call('GET', `/summary?${P}`, U)).body;
        assert.equal(withBudget.meta.budget, 'upload');
        assert.ok(near(sum(withBudget.rows, 'RBAnnualAmount'), 40 * 12e5, 1));
        assert.ok(near(sum(withBudget.rows, 'RBYTDAmount'), 40 * 7e5, 1), 'straight-line YTD for P07');
        assert.equal(sum(withBudget.rows, 'OBAnnualAmount'), 0, 'OB not uploaded -> 0, not mock');
        const v2 = (await call('POST', '/budget/upload', A, { fy: 2026, kind: 'RB', unit: 'crore', rows: rows.map((r) => ({ ...r, annual: 1 })) })).body.saved;
        assert.equal(v2.version, 2);
        assert.ok(near(sum((await call('GET', `/summary?${P}`, U)).body.rows, 'RBAnnualAmount'), 40e7, 1));
        await call('POST', `/budget/versions/${v1.id}/activate`, A);
        assert.ok(near(sum((await call('GET', `/summary?${P}`, U)).body.rows, 'RBAnnualAmount'), 40 * 12e5, 1), 'rollback to v1');
        const status = (await call('GET', '/budget?fy=2026', A)).body;
        assert.equal(status.versions.length, 2); assert.equal(status.active.RB.version, 1);
        await call('POST', '/budget/deactivate', A, { fy: 2026, kind: 'RB' });
        assert.equal((await call('GET', `/summary?${P}`, U)).body.meta.budget, 'mock');
        const bad = (await call('POST', '/budget/upload', A, { fy: 2026, kind: 'RB', unit: 'lakh', rows: [{ row: 2, key: 'BR001', header: 'NOPE', annual: 1 }] })).body;
        assert.equal(bad.errorCount, 1); assert.equal(bad.saved, null);

        // Mapping overrides
        const map = (await call('GET', `/settings/mapping?${P}`, A)).body;
        assert.ok(map.gls.length > 20 && map.headersSeen.length >= 6);
        const tvGl = map.gls.find((g) => g.bucket === 'TV').gl;
        assert.equal((await call('PUT', '/settings/mapping', A, { mapping: { groups: { CREATIVE: { cls: 'BTL', mis: true } }, glMedia: { [tvGl]: 'Digital' } } })).status, 200);
        const mapped = (await call('GET', `/summary?${P}`, U)).body.rows;
        assert.ok(mapped.filter((r) => r.HeaderGroup === 'CREATIVE').every((r) => r.SpendClass === 'BTL'));
        assert.ok(mapped.filter((r) => r.GLAccount.replace(/^0+/, '') === tvGl).every((r) => r.Medium === 'Digital'));
        assert.equal((await call('PUT', '/settings/mapping', A, { mapping: { groups: { CREATIVE: { cls: 'XYZ' } } } })).status, 400);

        const log = (await call('GET', '/audit', A)).body.entries;
        for (const a of ['exclusion.create', 'exclusion.update', 'exclusion.delete', 'budget.upload', 'budget.activate', 'budget.deactivate', 'mapping.save']) assert.ok(log.some((e) => e.action === a), a);
    } finally {
        server.close();
        db.pool.query = realQuery;
    }
});
