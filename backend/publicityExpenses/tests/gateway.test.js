// Publicity Expenses: SAP through the Emami Azure gateway (one path segment after the service; the gateway signs in).
// Fake fetch, no network. Run: node --test backend/publicityExpenses/tests/
const test = require('node:test');
const assert = require('node:assert/strict');

const GW = 'https://gw.example.net/api/NGD';
function withEnv(vars, fn) {
    const keep = {};
    for (const k of Object.keys(vars)) { keep[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
    return Promise.resolve(fn()).finally(() => { for (const k of Object.keys(vars)) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; } });
}
const sapEnv = { PUBEXP_SAP_SUMMARY_BASE: `${GW}/ZC_ATLBTL_EXP_SUMMARY_CDS`, PUBEXP_SAP_DETAIL_BASE: `${GW}/ZC_ATLBTL_EXP_DETAIL_CDS`, PUBEXP_SAP_ODATA_ROOT: undefined, PUBEXP_SAP_MODE: undefined, SAP_USER: 'should-not-be-sent', SAP_PASSWORD: 'x', PUBEXP_SAP_USER: undefined };
const sap = require('../sap');

function fakeFetch(seen, routes) {
    return async (url, opts) => {
        seen.push({ url, auth: opts?.headers?.Authorization });
        for (const [re, body] of routes) if (re.test(url)) return new Response(JSON.stringify(body), { status: 200 });
        return new Response('<pre>Cannot GET</pre>', { status: 404 });
    };
}

test('gateway URL -> parameters entity with $expand=Set, filters in memory, no Authorization header', () => withEnv(sapEnv, async () => {
    assert.equal(sap.isGateway(), true);
    assert.equal(sap.systemLabel(), 'NGD via Azure gateway');
    const seen = [];
    const real = global.fetch;
    global.fetch = fakeFetch(seen, [[/ZC_ATLBTL_EXP_SUMMARY\(/, { d: { P_FiscalYear: '2026', Set: { results: [
        { __metadata: { uri: 'x' }, CompanyCode: '1000', ReportingKey: 'BR001', GLAccount: '0000507929', Site: 'HO', CYYTDAmount: '10.50' },
        { CompanyCode: '2000', ReportingKey: 'BR001', GLAccount: '0000507929', Site: 'HO', CYYTDAmount: '1' },
    ] } } }]]);
    try {
        const rows = await sap.fetchSummary('2026', 7, { CompanyCode: '1000' });
        assert.equal(seen[0].url, `${GW}/ZC_ATLBTL_EXP_SUMMARY_CDS/ZC_ATLBTL_EXP_SUMMARY(P_FiscalYear='2026',P_FiscalPeriod='007')?$expand=Set`);
        assert.equal(seen[0].auth, undefined, 'the gateway signs in itself');
        assert.deepEqual(rows, [{ CompanyCode: '1000', ReportingKey: 'BR001', GLAccount: '0000507929', Site: 'HO', CYYTDAmount: 10.5 }]);
    } finally { global.fetch = real; }
}));

test('gateway drill-down: SKUs read through each line\'s own entity; internal field never leaves the server', () => withEnv(sapEnv, async () => {
    const seen = [];
    const real = global.fetch;
    const entity = "ZC_ATLBTL_EXP_DETAILSet(P_FiscalYear='2026',P_FiscalPeriod='007',CompanyCode='1000',GLAccount='0000507929',CostCenter='EH193',ProfitCenter='EMHO01')";
    global.fetch = fakeFetch(seen, [
        [/ZC_ATLBTL_EXP_DETAILSet\(.*\$expand=to_NetSaleMaster$/, { d: { CostCenter: 'EH193', to_NetSaleMaster: { results: [{ __metadata: {}, Material: '400001', SKUSize: '100 ML' }] } } }],
        [/ZC_ATLBTL_EXP_DETAIL\(/, { d: { Set: { results: [
            { __metadata: { uri: `https://sapgw.internal:443/sap/opu/odata/sap/ZC_ATLBTL_EXP_DETAIL_CDS/${entity}` }, CompanyCode: '1000', ReportingKey: 'BR001', GLAccount: '0000507929', Site: 'HO', CostCenter: 'EH193', CYYTDAmount: '5', to_NetSaleMaster: { __deferred: { uri: 'y' } } },
            { __metadata: { uri: 'https://h/ZC_ATLBTL_EXP_DETAILSet(x)' }, CompanyCode: '1000', ReportingKey: 'BR002', GLAccount: '0000507929', Site: 'HO', CostCenter: 'EH194', CYYTDAmount: '7' },
        ] } } }],
    ]);
    try {
        const rows = await sap.fetchDetail('2026', 7, { ReportingKey: 'BR001' }, { expand: true });
        assert.equal(rows.length, 1);
        assert.equal(rows[0]._entity, entity);
        assert.deepEqual(rows[0].to_NetSaleMaster, [{ Material: '400001', SKUSize: '100 ML' }]);
        assert.equal(seen[1].url, `${GW}/ZC_ATLBTL_EXP_DETAIL_CDS/${entity}?$expand=to_NetSaleMaster`);
        assert.ok(seen.every((s) => !s.url.includes('sapgw.internal')), 'only the gateway is called');
        assert.equal('_entity' in sap.publicRow(rows[0]), false);
    } finally { global.fetch = real; }
}));

test('direct SAP URL keeps the /Set path, $filter, sap-client and Basic auth', () => withEnv({ ...sapEnv, PUBEXP_SAP_SUMMARY_BASE: 'https://sap.example:44300/sap/opu/odata/sap/ZC_ATLBTL_EXP_SUMMARY_CDS', PUBEXP_SAP_DETAIL_BASE: 'https://sap.example:44300/sap/opu/odata/sap/ZC_ATLBTL_EXP_DETAIL_CDS', PUBEXP_SAP_USER: 'SVC', PUBEXP_SAP_PASSWORD: 'pw' }, async () => {
    assert.equal(sap.isGateway(), false);
    const seen = [];
    const real = global.fetch;
    global.fetch = fakeFetch(seen, [[/\/Set\?/, { d: { results: [] } }]]);
    try {
        await sap.fetchSummary('2026', 7, { CompanyCode: '1000' });
        assert.match(seen[0].url, /ZC_ATLBTL_EXP_SUMMARY\(P_FiscalYear='2026',P_FiscalPeriod='007'\)\/Set\?\$format=json&\$filter=CompanyCode%20eq%20'1000'&sap-client=900$/);
        assert.equal(seen[0].auth, `Basic ${Buffer.from('SVC:pw').toString('base64')}`);
    } finally { global.fetch = real; }
}));

test('SAP refusals and gateway 404 pages come back as short messages', () => withEnv(sapEnv, async () => {
    const real = global.fetch;
    global.fetch = async () => new Response('<pre>Cannot GET /api/NGD/x</pre>', { status: 404, statusText: 'Not Found' });
    try {
        await assert.rejects(sap.fetchSummary('2026', 7, {}), /SAP error: Not Found/);
        global.fetch = async () => new Response(JSON.stringify({ error: { message: { value: 'No service found for namespace' } } }), { status: 403 });
        await assert.rejects(sap.fetchSummary('2026', 7, {}), /SAP refused the request \(403\): No service found/);
    } finally { global.fetch = real; }
}));
