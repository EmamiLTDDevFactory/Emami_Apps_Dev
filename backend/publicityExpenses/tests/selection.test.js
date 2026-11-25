// Publicity Expenses: period sets, company sets and the drill-down basis (amount per selected period).
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
const S = require('../selection');
const { applyUploadedBudget, applyMockBudget } = require('../budget');
const { resetMemoryStore } = require('../store');
const router = require('..');

const sum = (rows, k) => Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100;
const near = (a, b, tol = 0.1) => Math.abs(a - b) < tol;

test('periods: lists, ranges, order and bad input', () => {
    assert.deepEqual(S.parsePeriods('8'), [8]);
    assert.deepEqual(S.parsePeriods('1-8'), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(S.parsePeriods('9, 4-6,4'), [4, 5, 6, 9]);
    assert.deepEqual(S.parsePeriods([3, '1']), [1, 3]);
    assert.throws(() => S.parsePeriods('0'), /1 to 12/);
    assert.throws(() => S.parsePeriods('6-4'), /1 to 12/);
    assert.throws(() => S.parsePeriods('13'), /1 to 12/);
});

test('reads: YTD = one read, a run = YTD(b) - YTD(a-1), a single period = its period amount', () => {
    assert.deepEqual(S.termsOf([8]), [{ period: 8, field: 'period', sign: 1 }]);
    assert.deepEqual(S.termsOf([1, 2, 3, 4, 5, 6, 7, 8]), [{ period: 8, field: 'ytd', sign: 1 }]);
    assert.deepEqual(S.termsOf([4, 5, 6]), [{ period: 6, field: 'ytd', sign: 1 }, { period: 3, field: 'ytd', sign: -1 }]);
    assert.deepEqual(S.termsOf([3, 5, 8]).map((t) => t.period), [3, 5, 8]);
    assert.deepEqual(S.termsOf([8], { ytdOnly: true }), [{ period: 8, field: 'ytd', sign: 1 }, { period: 7, field: 'ytd', sign: -1 }]);
    assert.equal(S.describe(S.termsOf([4, 5, 6])), 'YTD P06 - YTD P03');
});

test('uploaded and mock budget follow the selected periods', () => {
    const lines = [{ companyCode: '1000', reportingKey: 'BR001', headerGroup: 'ATL', site: '', annual: 1200, months: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 540], labels: {} }];
    const b = applyUploadedBudget([], { RB: { lines } }, [4, 5, 6], null).find((r) => r.IsBudget);
    assert.equal(b.RBYTDAmount, 150);
    assert.equal(b.RBAnnualAmount, 1200);
    assert.equal(applyUploadedBudget([], { RB: { lines } }, 3, null)[0].RBYTDAmount, 60, 'a single number still means YTD up to it');
    const rows = [{ ReportingKey: 'BR001', HeaderGroup: 'ATL', CYYTDAmount: 300, PYYTDAmount: 0 }];
    applyMockBudget(rows, '2026', [4, 5, 6]);
    assert.ok(near(rows[0].RBYTDAmount, rows[0].RBAnnualAmount * 3 / 12, 0.02));
});

// ---------------------------------------------------------------- routes

const token = (email) => jwt.sign({ email }, process.env.HUB_AUTH_JWT_SECRET);
const stub = async (sql, args) => (sql.includes('authorized_user_apps') ? { rows: args[0] === 'a@emamigroup.com' ? [{ role: 'Admin' }] : [] } : { rows: [{ is_active: true }] });

async function withServer(fn) {
    resetMemoryStore();
    const realQuery = db.pool.query;
    db.pool.query = stub;
    const app = express();
    app.use(express.json({ limit: '6mb' }));
    app.use('/x', router);
    const server = await new Promise((resolve) => { const s = http.createServer(app).listen(0, () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/x`;
    const call = (method, path, body) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token('a@emamigroup.com')}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
        .then(async (r) => ({ status: r.status, body: await r.json() }));
    try { await fn(call); } finally { server.close(); db.pool.query = realQuery; }
}

test('selection routes: period sets add up, YTD equals the old period=n, companies filter and are listed', () => withServer(async (call) => {
    const total = async (q) => { const r = await call('GET', `/summary?fy=2026&${q}`); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
    // YTD P01-P07 through periods= equals the old period=7 (same SAP read).
    const ytd = await total('periods=1-7&companies=1000');
    const old = await total('period=7&company=1000');
    assert.equal(sum(ytd.rows, 'CYYTDAmount'), sum(old.rows, 'CYYTDAmount'));
    assert.deepEqual(ytd.meta.periods, [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(ytd.meta.period, 7);
    // Q2 (P04-P06) = P04 + P05 + P06 = YTD P06 - YTD P03, CY and PY.
    const q2 = await total('periods=4-6&companies=1000');
    const one = await Promise.all([4, 5, 6].map((n) => total(`periods=${n}&companies=1000`)));
    const y6 = await total('periods=1-6&companies=1000'); const y3 = await total('periods=1-3&companies=1000');
    for (const k of ['CYYTDAmount', 'PYYTDAmount']) {
        const parts = one.reduce((s, b) => s + sum(b.rows, k), 0);
        assert.ok(near(sum(q2.rows, k), parts, 1), `${k}: ${sum(q2.rows, k)} vs months ${parts}`);
        assert.ok(near(sum(q2.rows, k), sum(y6.rows, k) - sum(y3.rows, k), 1), `${k}: Q2 = YTD6 - YTD3`);
    }
    assert.ok(near(sum(q2.rows, 'CYPeriodAmount'), sum(one[2].rows, 'CYYTDAmount'), 1), 'period amount = the latest selected period');
    // Non-consecutive periods.
    const odd = await total('periods=3,5,8&companies=1000');
    const parts = await Promise.all([3, 5, 8].map((n) => total(`periods=${n}&companies=1000`)));
    assert.ok(near(sum(odd.rows, 'CYYTDAmount'), parts.reduce((s, b) => s + sum(b.rows, 'CYYTDAmount'), 0), 1));
    // Companies: each alone adds up to both together; the meta lists every company with data.
    const both = await total('periods=1-7&companies=1000,EM01');
    const em = await total('periods=1-7&companies=EM01');
    const all = await total('periods=1-7');
    assert.ok(em.rows.length > 0 && em.rows.every((r) => r.CompanyCode === 'EM01' || r.IsBudget));
    assert.ok(near(sum(both.rows, 'CYYTDAmount'), sum(ytd.rows, 'CYYTDAmount') + sum(em.rows, 'CYYTDAmount'), 1));
    assert.ok(near(sum(all.rows, 'CYYTDAmount'), sum(both.rows, 'CYYTDAmount'), 1));
    assert.deepEqual(ytd.meta.companiesInData, ['1000', 'EM01']);
    assert.deepEqual(both.meta.companies, ['1000', 'EM01']);
    // Bad input.
    assert.equal((await call('GET', '/summary?fy=2026&periods=0')).status, 400);
    assert.equal((await call('GET', '/summary?fy=2026&periods=1-8&companies=10;0')).status, 400);
    // Trend runs P01..latest selected and says which were picked.
    const tr = (await call('GET', '/trend?fy=2026&periods=3,5&companies=1000')).body;
    assert.equal(tr.months.length, 5);
    assert.deepEqual(tr.periods, [3, 5]);
}));

test('drill-down: a sub-total (several rows) with an amount per selected period that adds up to the report figure', () => withServer(async (call) => {
    const sel = { fy: '2026', periods: '4-6,8', companies: ['1000', 'EM01'] };
    const sumRes = (await call('GET', `/summary?fy=2026&periods=${sel.periods}&companies=1000,EM01`)).body;
    const brand = sumRes.rows.filter((r) => r.ReportingKey.startsWith('BR') && !r.IsBudget);
    const keys = [...new Set(brand.map((r) => r.ReportingKey))].slice(0, 6);
    const rows = sumRes.rows.filter((r) => keys.includes(r.ReportingKey) && !r.IsBudget);
    const d = await call('POST', '/detail', { ...sel, keys });
    assert.equal(d.status, 200, JSON.stringify(d.body));
    assert.deepEqual(d.body.periods, [4, 5, 6, 8]);
    assert.equal(d.body.reads.text, 'YTD P06 - YTD P03 + P08');
    assert.ok(near(sum(d.body.rows, 'CYYTDAmount'), sum(rows, 'CYYTDAmount')), 'lines add up to the report figure');
    assert.ok(near(sum(d.body.rows, 'PYYTDAmount'), sum(rows, 'PYYTDAmount')));
    for (const l of d.body.rows) {
        assert.equal(l.cy.length, 4);
        assert.ok(near(l.cy.reduce((a, b) => a + b, 0), l.CYYTDAmount, 0.05), `periods add up to the line total (${l.CostCenter})`);
        assert.ok(l.CostCenter && l.GLAccount && l.CompanyCode);
    }
    assert.ok(new Set(d.body.rows.map((l) => l.CompanyCode)).size >= 1);
    assert.ok(d.body.rows.every((l) => !('to_NetSaleMaster' in l)), 'no SKU reads for a sub-total');
    // One G/L x site of one row, a header group, HO only.
    const cell = rows.find((r) => r.Site === 'HO');
    const one = await call('POST', '/detail', { ...sel, keys: [cell.ReportingKey], gls: [cell.GLAccount], sites: ['HO'], groups: [cell.HeaderGroup] });
    const want = sumRes.rows.filter((r) => r.ReportingKey === cell.ReportingKey && r.GLAccount === cell.GLAccount && r.Site === 'HO' && !r.IsBudget);
    assert.ok(near(sum(one.body.rows, 'CYYTDAmount'), sum(want, 'CYYTDAmount')));
    assert.ok(one.body.rows.every((l) => l.Site === 'HO' && l.GLAccount === cell.GLAccount && l.HeaderGroup === cell.HeaderGroup));
    assert.ok(one.body.rows.some((l) => Array.isArray(l.to_NetSaleMaster)), 'SKUs for one report row');
    // Header groups filter on the server.
    const atl = await call('POST', '/detail', { ...sel, keys, groups: ['ATL'] });
    assert.ok(atl.body.rows.every((l) => l.HeaderGroup === 'ATL'));
    assert.ok(near(sum(atl.body.rows, 'CYYTDAmount'), sum(rows.filter((r) => r.HeaderGroup === 'ATL'), 'CYYTDAmount')));
    // An exclusion rule on a cost centre takes its lines out of the drill-down too.
    const cc = d.body.rows[0].CostCenter;
    await call('POST', '/exclusions', { dimension: 'COST_CENTER', values: [cc], reason: 'test exclusion', fromFy: 2026, fromPeriod: 1 });
    const ex = (await call('POST', '/detail', { ...sel, keys })).body;
    assert.ok(!ex.rows.some((l) => l.CostCenter === cc) && ex.excluded.some((l) => l.CostCenter === cc));
    const after = (await call('GET', `/summary?fy=2026&periods=${sel.periods}&companies=1000,EM01`)).body.rows.filter((r) => keys.includes(r.ReportingKey) && !r.IsBudget);
    assert.ok(near(sum(ex.rows, 'CYYTDAmount'), sum(after, 'CYYTDAmount')), 'drill-down = report after exclusions');
    // Bad keys / groups.
    assert.equal((await call('POST', '/detail', { ...sel, keys: ["x' or 1"] })).status, 400);
    assert.equal((await call('POST', '/detail', { ...sel, groups: ['<script>'] })).status, 400);
}));

test('through the Azure gateway: Q2 reads YTD P06 and YTD P03 once each; another company does not read SAP again', async () => {
    const GW = 'https://gw.example.net/api/NWP';
    const keep = { s: process.env.PUBEXP_SAP_SUMMARY_BASE, d: process.env.PUBEXP_SAP_DETAIL_BASE };
    process.env.PUBEXP_SAP_SUMMARY_BASE = `${GW}/ZC_ATLBTL_EXP_SUMMARY_CDS`;
    process.env.PUBEXP_SAP_DETAIL_BASE = `${GW}/ZC_ATLBTL_EXP_DETAIL_CDS`;
    const seen = [];
    const real = global.fetch;
    // YTD n = n x 10 (CY) for company 1000, n x 1 for EM01; the period alone = 10 / 1.
    global.fetch = async (url) => {
        seen.push(url);
        const n = Number(/P_FiscalPeriod='(\d{3})'/.exec(url)[1]);
        const row = (cc, f) => ({ CompanyCode: cc, ReportingKey: 'BR001', GLAccount: '0000507929', Site: 'HO', ReportHeader: 'ATL', CYYTDAmount: String(n * f), PYYTDAmount: String(n * f / 2), CYPeriodAmount: String(f), PYPeriodAmount: String(f / 2) });
        return new Response(JSON.stringify({ d: { Set: { results: [row('1000', 10), row('EM01', 1)] } } }), { status: 200 });
    };
    try {
        const { selectionSummary } = router._test;
        const q2 = await selectionSummary({ fy: '2031', periods: [4, 5, 6], period: 6, companies: ['1000'] });
        assert.equal(q2.length, 1);
        assert.equal(q2[0].CYYTDAmount, 30, 'YTD 6 (60) - YTD 3 (30)');
        assert.equal(q2[0].PYYTDAmount, 15);
        assert.equal(q2[0].CYPeriodAmount, 10, 'period amount of P06');
        assert.deepEqual(seen.map((u) => /P_FiscalPeriod='(\d{3})'/.exec(u)[1]).sort(), ['003', '006']);
        assert.ok(seen.every((u) => u.endsWith('?$expand=Set')));
        const em = await selectionSummary({ fy: '2031', periods: [4, 5, 6], period: 6, companies: ['EM01'] });
        assert.equal(em[0].CYYTDAmount, 3);
        assert.equal(seen.length, 2, 'same reads, other company: served from the cache');
        const one = await selectionSummary({ fy: '2031', periods: [8], period: 8, companies: [] });
        assert.equal(one.reduce((s, r) => s + r.CYYTDAmount, 0), 11, 'one period = its period amount, both companies');
        assert.equal(seen.length, 3);
    } finally {
        global.fetch = real;
        if (keep.s === undefined) delete process.env.PUBEXP_SAP_SUMMARY_BASE; else process.env.PUBEXP_SAP_SUMMARY_BASE = keep.s;
        if (keep.d === undefined) delete process.env.PUBEXP_SAP_DETAIL_BASE; else process.env.PUBEXP_SAP_DETAIL_BASE = keep.d;
    }
});
