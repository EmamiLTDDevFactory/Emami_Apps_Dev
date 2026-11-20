const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.HUB_AUTH_JWT_SECRET = 'test-secret';
process.env.MM_PH_SAP_ODATA_BASE = 'https://gw.example/api/NGD/ZMDM_PH_SRV';
// the access check reads two tables: a grant for mm-mdm and an active user
require.cache[require.resolve('../db')] = {
    id: 'db', filename: 'db', loaded: true,
    exports: { pool: { query: async (sql) => (/authorized_user_apps/.test(sql) ? { rows: [{ role: 'user' }] } : { rows: [{ is_active: true }] }) } },
};
const express = require('express');
const jwt = require('jsonwebtoken');
const router = require('../mmMdmPh');
const { JWT_SECRET } = require('../sessionAuth');

const token = jwt.sign({ email: 'a.user@emami.test' }, JWT_SECRET, { algorithm: 'HS256' });
const calls = [];
let sap = () => ({ status: 200, body: { d: {} } });
const realFetch = global.fetch;

function mockSap() {
    global.fetch = async (url, opts = {}) => {
        const u = String(url);
        if (!u.startsWith('https://gw.example')) return realFetch(url, opts);
        calls.push({ url: u, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
        if ((opts.headers || {})['X-CSRF-Token'] === 'Fetch') {
            return new Response('{}', { status: 200, headers: { 'x-csrf-token': 'TOK123', 'set-cookie': 'sap-usercontext=sap-client=900; path=/' } });
        }
        const r = sap(u, opts);
        return new Response(JSON.stringify(r.body), { status: r.status });
    };
}

async function withServer(fn) {
    const app = express();
    app.use(express.json({ limit: '6mb' }));
    app.use('/me/mm-mdm-ph', router);
    const server = await new Promise((res) => { const s = http.createServer(app).listen(0, () => res(s)); });
    const call = async (method, path, body) => {
        const r = await realFetch(`http://127.0.0.1:${server.address().port}/me/mm-mdm-ph${path}`, {
            method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, body: await r.json() };
    };
    try { await fn(call); } finally { server.close(); global.fetch = realFetch; calls.length = 0; }
}

test('values: level 3 needs product and group, and is filtered in SAP', async () => {
    mockSap();
    sap = () => ({ status: 200, body: { d: { results: [{ __metadata: {}, Level: '3', Code: '002', Text: 'X', CrsProd: '100040044', PrdGrp: '32', SkuSize: '', Unit: '' }] } } });
    await withServer(async (call) => {
        assert.equal((await call('GET', '/crs/values?level=3&prod=100040044')).status, 400);
        assert.equal((await call('GET', '/crs/values?level=9')).status, 400);
        const ok = await call('GET', '/crs/values?level=3&prod=100040044&group=32');
        assert.equal(ok.status, 200);
        assert.deepEqual(ok.body[0], { level: 3, code: '002', text: 'X', crsProd: '100040044', prdGrp: '32', skuSize: '', unit: '' });
        const url = decodeURIComponent(calls.at(-1).url);
        assert.match(url, /CrsValueSet\?\$filter=Level eq '3' and CrsProd eq '100040044' and PrdGrp eq '32'/);
        assert.equal(calls.at(-1).headers['X-Emami-User'], 'a.user@emami.test');
    });
});

test('validate: fetches a CSRF token, sends it with the cookie and escapes quotes', async () => {
    mockSap();
    sap = () => ({ status: 200, body: { d: { __metadata: {}, Message: 'Valid', CrsProd: '', CrsProdDesc: "O'NEIL" } } });
    await withServer(async (call) => {
        const r = await call('POST', '/crs/validate', { mode: 'I', busVert: '01', crsProdDesc: "O'NEIL", prdGrpDesc: 'G', skuGrpDesc: 'S' });
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        const post = calls.find((c) => c.method === 'POST');
        assert.equal(post.headers['X-CSRF-Token'], 'TOK123');
        assert.equal(post.headers.Cookie, 'sap-usercontext=sap-client=900');
        assert.match(post.url, /CrsValidate\?Mode='I'&CrsProd=''&CrsProdDesc='O''NEIL'/);
    });
});

test('validate: every SAP message comes back, status 400', async () => {
    mockSap();
    sap = () => ({ status: 400, body: { error: { message: { value: 'first' }, innererror: { errordetails: [{ message: 'Business Vertical not maintained' }, { message: 'CRS product: code and description cannot both be blank' }] } } } });
    await withServer(async (call) => {
        const r = await call('POST', '/crs/validate', {});
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'Business Vertical not maintained\nCRS product: code and description cannot both be blank');
    });
});

test('initiate: the document must be base64 and is posted as FlData', async () => {
    mockSap();
    sap = () => ({ status: 200, body: { d: { __metadata: {}, TransactionId: '0000026700', Message: 'raised' } } });
    await withServer(async (call) => {
        assert.equal((await call('POST', '/crs/requests', { crsProdDesc: 'A', flData: 'not base64!!' })).status, 400);
        assert.equal((await call('POST', '/crs/requests', { crsProdDesc: 'A' })).status, 400);
        const r = await call('POST', '/crs/requests', { busVert: '01', crsProdDesc: 'A', prdGrpDesc: 'B', skuGrpDesc: 'C', flName: 'a.pdf', flType: 'application/pdf', flData: 'JVBERi0x' });
        assert.equal(r.status, 200);
        assert.equal(r.body.transactionId, '0000026700');
        const post = calls.find((c) => c.method === 'POST');
        assert.match(post.url, /\/CrsRequestSet$/);
        const sent = JSON.parse(post.body);
        assert.equal(sent.FlData, 'JVBERi0x');
        assert.equal(sent.BusVert, '01');
        assert.equal(post.headers['Content-Type'], 'application/json');
    });
});

test('approve and reject need a numeric work item id; fields with control characters are refused', async () => {
    mockSap();
    sap = () => ({ status: 200, body: { d: { __metadata: {}, Message: 'done' } } });
    await withServer(async (call) => {
        assert.equal((await call('POST', '/crs/approve', { wiId: "1' or '1" })).status, 400);
        assert.equal((await call('POST', '/crs/reject', {})).status, 400);
        assert.equal((await call('POST', '/crs/approve', { wiId: '1050085', comments: 'a\u0001b' })).status, 400);
        assert.equal((await call('POST', '/crs/approve', { wiId: '1050085', skuSize: '50', unit: 'ML' })).status, 200);
        assert.match(calls.filter((c) => c.method === 'POST').at(-1).url, /CrsApprove\?WiId='1050085'&SkuSize='50'&Unit='ML'/);
    });
});

test('hierarchy writes: validate, initiate, approve, cost centre, reject, send back', async () => {
    mockSap();
    sap = () => ({ status: 200, body: { d: { __metadata: {}, TransactionId: '0000000042', Message: 'ok', Banner: '01' } } });
    await withServer(async (call) => {
        const f = { banner: '01', bannerDesc: 'EMAMI', brand: '0001', brandDesc: 'B', product: '0001', productDesc: 'P', sku: '001', skuDesc: 'S', variant: '001', variantDesc: 'V', scheme: '01', schemeDesc: 'X' };
        assert.equal((await call('POST', '/ph/validate', { mode: 'I', ...f })).status, 200);
        assert.match(calls.filter((c) => c.method === 'POST').at(-1).url, /Validate\?Mode='I'&Banner='01'&BannerDesc='EMAMI'&Brand='0001'/);
        assert.equal((await call('POST', '/ph/requests', f)).body.transactionId, '0000000042');
        assert.match(calls.filter((c) => c.method === 'POST').at(-1).url, /\/RequestSet$/);
        assert.equal(JSON.parse(calls.filter((c) => c.method === 'POST').at(-1).body).SkuDesc, 'S');
        assert.equal((await call('POST', '/ph/approve', { wiId: '77', ...f })).status, 200);
        assert.match(calls.filter((c) => c.method === 'POST').at(-1).url, /Approve\?WiId='77'&Banner='01'/);
        assert.equal((await call('POST', '/ph/assign-cost-center', { wiId: '77' })).status, 400);
        assert.equal((await call('POST', '/ph/assign-cost-center', { wiId: '77', costCenter: 'BEH0000001' })).status, 200);
        assert.match(calls.filter((c) => c.method === 'POST').at(-1).url, /AssignCostCenter\?WiId='77'&CostCenter='BEH0000001'/);
        assert.equal((await call('POST', '/ph/reject', {})).status, 400);
        assert.equal((await call('POST', '/ph/reject', { wiId: '77' })).status, 200);
        assert.equal((await call('POST', '/ph/send-back', { wiId: '77' })).status, 200);
        assert.match(calls.filter((c) => c.method === 'POST').at(-1).url, /SendBackRequest\?WiId='77'/);
    });
});

test('a request without a session is refused before SAP is called', async () => {
    mockSap();
    await withServer(async () => {
        const app = express(); app.use('/m', router);
        const s = await new Promise((res) => { const x = http.createServer(app).listen(0, () => res(x)); });
        const r = await realFetch(`http://127.0.0.1:${s.address().port}/m/crs/verticals`);
        s.close();
        assert.equal(r.status, 401);
        assert.equal(calls.length, 0);
    });
});
