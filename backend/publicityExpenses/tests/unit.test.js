// Publicity Expenses backend tests - no database, no SAP: the pool is stubbed and SAP answers come from a fake fetch.
// Run: node --test backend/publicityExpenses/tests/unit.test.js
process.env.HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || 'test-secret-publicity-expenses';
delete process.env.PUBEXP_SAP_ODATA_ROOT;
delete process.env.PUBEXP_SOURCE;

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db');
const sap = require('../sap');
const mock = require('../mock');
const { headerGroup, medium } = require('../config');
const { applyMockBudget } = require('../budget');
const router = require('..');

const sum = (rows, k) => Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;

test('filterOf quotes values, doubles single quotes and rejects bad field names', () => {
    assert.equal(sap.filterOf({ GLAccount: '0000508458', Site: 'HO' }), "GLAccount eq '0000508458' and Site eq 'HO'");
    assert.equal(sap.filterOf({ ReportingKey: "A'B" }), "ReportingKey eq 'A''B'");
    assert.equal(sap.filterOf({ Site: ['HO', 'UN'], CompanyCode: '' }), "(Site eq 'HO' or Site eq 'UN')");
    assert.throws(() => sap.filterOf({ 'Site eq 1 or 1': 'x' }), /Bad filter field/);
});

test('entity path pads the period to 3 digits', () => {
    assert.equal(sap.entityPath('ZC_ATLBTL_EXP_SUMMARY', '2026', 7), "ZC_ATLBTL_EXP_SUMMARY(P_FiscalYear='2026',P_FiscalPeriod='007')/Set");
});

test('clean drops metadata and deferred links and turns decimal strings into numbers', () => {
    const r = sap.clean({ __metadata: { uri: 'x' }, CYYTDAmount: '1234.50', Site: 'HO ', to_NetSaleMaster: { results: [{ __metadata: {}, Material: '1' }] }, to_ProductHierarchy: { __deferred: { uri: 'y' } } });
    assert.deepEqual(r, { CYYTDAmount: 1234.5, Site: 'HO', to_NetSaleMaster: [{ Material: '1' }] });
});

test('report headers map to the layout groups, aliases included; unknown headers stay visible', () => {
    assert.equal(headerGroup('Film Prod').id, 'FILM PROD');
    assert.equal(headerGroup('MODEL').cls, 'ATL');
    assert.equal(headerGroup('btl sales').cls, 'BTL');
    assert.equal(headerGroup('DSR AND OTHER EXP').mis, false);
    const u = headerGroup('NEW HEAD');
    assert.equal(u.cls, 'UNMAPPED');
    assert.equal(u.label, 'NEW HEAD');
});

test('media buckets: ATL by G/L number, others by G/L name keywords', () => {
    assert.equal(medium('0000507929', 'T.V.', headerGroup('ATL')), 'TV');
    assert.equal(medium('0000507930', 'x', headerGroup('ATL')), 'Digital');
    assert.equal(medium('0000508587', 'SELLING EXPENSES-WINDOW DISPLAY', headerGroup('BTL')), 'Visibility & in-store');
    assert.equal(medium('0000500904', 'FG Free Issue Bp', headerGroup('BTL')), 'Free issue & sampling');
    assert.equal(medium('0000599999', 'SOMETHING NEW', headerGroup('BTL')), 'Other BTL');
});

test('mock is deterministic and the drill-down adds up to the summary (whole report and one cell)', () => {
    const a = mock.summary('2026', 7, {});
    const b = mock.summary('2026', 7, {});
    assert.deepEqual(a.slice(0, 20), b.slice(0, 20));
    assert.ok(a.length > 500);
    const d = mock.detail('2026', 7, {});
    assert.equal(sum(d, 'CYYTDAmount'), sum(a, 'CYYTDAmount'));
    assert.equal(sum(d, 'PYYTDAmount'), sum(a, 'PYYTDAmount'));
    const cell = a.find((r) => r.ReportingKey.startsWith('BR'));
    const cd = mock.detail('2026', 7, { ReportingKey: cell.ReportingKey, GLAccount: cell.GLAccount, Site: cell.Site }, { expand: true });
    assert.ok(cd.length >= 1);
    assert.equal(sum(cd, 'CYYTDAmount'), cell.CYYTDAmount);
    assert.ok(Array.isArray(cd[0].to_NetSaleMaster));
});

test('YTD of period 12 equals the sum of the 12 period amounts', () => {
    const ytd = sum(mock.summary('2026', 12, {}), 'CYYTDAmount');
    let months = 0;
    for (let p = 1; p <= 12; p++) months += sum(mock.summary('2026', p, {}), 'CYPeriodAmount');
    assert.ok(Math.abs(ytd - months) < 1, `${ytd} vs ${months}`);
});

test('mock budget: straight-line YTD phasing, RB deviation = CY - RB YTD, zero when no spend', () => {
    const rows = [
        { ReportingKey: 'BR001', HeaderGroup: 'ATL', CYYTDAmount: 700, PYYTDAmount: 0 },
        { ReportingKey: 'BR002', HeaderGroup: 'BTL', CYYTDAmount: 0, PYYTDAmount: 0 },
    ];
    applyMockBudget(rows, '2026', 7);
    const [r, z] = rows;
    assert.ok(Math.abs(r.OBYTDAmount - (r.OBAnnualAmount * 7) / 12) < 0.02);
    assert.ok(Math.abs(r.RBYTDAmount - (r.RBAnnualAmount * 7) / 12) < 0.02);
    assert.ok(r.OBAnnualAmount >= 1200 * 0.95 - 0.01 && r.OBAnnualAmount <= 1200 * 1.25 + 0.01);
    assert.equal(r.CYvsRBYTDDeviation, Math.round((700 - r.RBYTDAmount) * 100) / 100);
    assert.equal(z.RBAnnualAmount, 0);
});

test('SAP client follows __next paging and sends sap-client 900 and Basic auth', async () => {
    process.env.PUBEXP_SAP_ODATA_ROOT = 'https://sap.example/sap/opu/odata/sap';
    process.env.PUBEXP_SAP_USER = 'SVC';
    process.env.PUBEXP_SAP_PASSWORD = 'pw';
    const seen = [];
    const realFetch = global.fetch;
    global.fetch = async (url, opts) => {
        seen.push({ url, auth: opts.headers.Authorization });
        const page2 = url.includes('skiptoken');
        return new Response(JSON.stringify({ d: { results: [{ CYYTDAmount: page2 ? '2' : '1', Site: 'HO' }], ...(page2 ? {} : { __next: `${url}&$skiptoken=1` }) } }), { status: 200 });
    };
    try {
        const rows = await sap.fetchSummary('2026', 7, { CompanyCode: '1000' });
        assert.deepEqual(rows.map((r) => r.CYYTDAmount), [1, 2]);
        assert.match(seen[0].url, /ZC_ATLBTL_EXP_SUMMARY_CDS\/ZC_ATLBTL_EXP_SUMMARY\(P_FiscalYear='2026',P_FiscalPeriod='007'\)\/Set\?\$format=json/);
        assert.match(seen[0].url, /sap-client=900/);
        assert.match(seen[0].url, /%24filter=|\$filter=CompanyCode%20eq%20'1000'/);
        assert.equal(seen[0].auth, `Basic ${Buffer.from('SVC:pw').toString('base64')}`);
    } finally {
        global.fetch = realFetch;
        delete process.env.PUBEXP_SAP_ODATA_ROOT; delete process.env.PUBEXP_SAP_USER; delete process.env.PUBEXP_SAP_PASSWORD;
    }
});

test('SAP errors come back as a short message, never the raw page', async () => {
    process.env.PUBEXP_SAP_ODATA_ROOT = 'https://sap.example/sap/opu/odata/sap';
    const realFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ error: { message: { value: 'Resource not found for segment' } } }), { status: 404 });
    try {
        await assert.rejects(sap.fetchSummary('2026', 7, {}), /SAP error: Resource not found/);
        global.fetch = async () => { throw new TypeError('fetch failed'); };
        await assert.rejects(sap.fetchSummary('2026', 7, {}), /SAP is not reachable/);
    } finally {
        global.fetch = realFetch;
        delete process.env.PUBEXP_SAP_ODATA_ROOT;
    }
});

// ---------------------------------------------------------------- routes (stubbed access check, mock source)

function serve() {
    const app = express();
    app.use('/x', router);
    return new Promise((resolve) => { const s = http.createServer(app).listen(0, () => resolve(s)); });
}
const token = (email) => jwt.sign({ email }, process.env.HUB_AUTH_JWT_SECRET);

test('routes: 401 without a session, 403 without a grant, data with a grant, 400 on bad input', async () => {
    const realQuery = db.pool.query;
    db.pool.query = async (sql, args) => (sql.includes('authorized_user_apps') ? { rows: args[0] === 'ok@emamigroup.com' ? [{ role: 'Viewer' }] : [] } : { rows: [{ is_active: true }] });
    const server = await serve();
    const base = `http://127.0.0.1:${server.address().port}/x`;
    const get = (path, email) => fetch(base + path, { headers: email ? { Authorization: `Bearer ${token(email)}` } : {} });
    try {
        assert.equal((await get('/summary?fy=2026&period=7')).status, 401);
        assert.equal((await get('/summary?fy=2026&period=7', 'no@emamigroup.com')).status, 403);
        const ok = await get('/summary?fy=2026&period=7', 'ok@emamigroup.com');
        assert.equal(ok.status, 200);
        const body = await ok.json();
        assert.equal(body.meta.source, 'mock');
        assert.equal(body.meta.budget, 'mock');
        assert.ok(body.rows[0].HeaderGroup && body.rows[0].SpendClass && body.rows[0].Medium);
        assert.ok(body.rows.some((r) => r.RBYTDAmount > 0));
        assert.equal((await get('/summary?fy=26&period=7', 'ok@emamigroup.com')).status, 400);
        assert.equal((await get('/summary?fy=2026&period=13', 'ok@emamigroup.com')).status, 400);
        assert.equal((await get("/detail?fy=2026&period=7&key=x'%20or%201", 'ok@emamigroup.com')).status, 400);
        const cell = body.rows.find((r) => r.ReportingKey.startsWith('BR'));
        const det = await (await get(`/detail?fy=2026&period=7&key=${cell.ReportingKey}&gl=${cell.GLAccount}&site=${cell.Site}`, 'ok@emamigroup.com')).json();
        assert.equal(sum(det.rows, 'CYYTDAmount'), cell.CYYTDAmount);
        const trend = await (await get('/trend?fy=2026&period=3', 'ok@emamigroup.com')).json();
        assert.equal(trend.months.length, 3);
        const bd = await (await get('/breakdown?fy=2026&period=7', 'ok@emamigroup.com')).json();
        assert.equal(bd.reconciliation.difference, 0);
        assert.ok(bd.unmapped.cy > 0);
    } finally {
        server.close();
        db.pool.query = realQuery;
    }
});
