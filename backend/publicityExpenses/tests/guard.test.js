// Publicity Expenses protection: security headers, compression, rate limits, SAP concurrency cap, error text, ReDoS-safe
// wildcards. No database, no SAP: in-memory store, mock data (or a stubbed gateway), stubbed access check.
// Run: node --test backend/publicityExpenses/tests/
process.env.HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || 'test-secret-publicity-expenses';
delete process.env.PUBEXP_SAP_ODATA_ROOT;
delete process.env.PUBEXP_SAP_SUMMARY_BASE;
delete process.env.PUBEXP_SAP_DETAIL_BASE;
delete process.env.PUBEXP_SOURCE;
process.env.PUBEXP_STORE = 'memory';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db');
const G = require('../guard');
const R = require('../rules');
const { resetMemoryStore } = require('../store');
const router = require('..');

const token = (email) => jwt.sign({ email }, process.env.HUB_AUTH_JWT_SECRET);
const stub = async (sql, args) => (sql.includes('authorized_user_apps') ? { rows: args[0] === 'a@emamigroup.com' ? [{ role: 'Admin' }] : [] } : { rows: [{ is_active: true }] });

/** Server with the router; get() returns status, headers and the raw (still compressed) body - no fetch decoding. */
async function withServer(fn) {
    resetMemoryStore();
    G.resetLimits();
    const realQuery = db.pool.query;
    db.pool.query = stub;
    const app = express();
    app.use(express.json({ limit: '6mb' }));
    app.use('/x', router);
    const server = await new Promise((resolve) => { const s = http.createServer(app).listen(0, () => resolve(s)); });
    const port = server.address().port;
    const req = (method, path, { body, headers = {}, auth = true } = {}) => new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const r = http.request({ host: '127.0.0.1', port, path: `/x${path}`, method, headers: { ...(auth ? { Authorization: `Bearer ${token('a@emamigroup.com')}` } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks);
                const enc = res.headers['content-encoding'];
                const text = enc === 'gzip' ? zlib.gunzipSync(raw).toString() : enc === 'br' ? zlib.brotliDecompressSync(raw).toString() : raw.toString();
                resolve({ status: res.statusCode, headers: res.headers, raw, body: text ? JSON.parse(text) : null });
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
    try { await fn(req); } finally { server.close(); db.pool.query = realQuery; G.resetLimits(); }
}

test('security headers on every answer (also 401 and 404), no X-Powered-By', () => withServer(async (req) => {
    for (const [path, auth, status] of [['/me', false, 401], ['/me', true, 200], ['/nope', true, 404]]) {
        const r = await req('GET', path, { auth });
        assert.equal(r.status, status, path);
        assert.equal(r.headers['x-content-type-options'], 'nosniff');
        assert.equal(r.headers['x-frame-options'], 'DENY');
        assert.equal(r.headers['content-security-policy'], "default-src 'none'; frame-ancestors 'none'");
        assert.equal(r.headers['referrer-policy'], 'no-referrer');
        assert.equal(r.headers['cache-control'], 'no-store');
        assert.equal(r.headers['x-powered-by'], undefined);
    }
}));

test('JSON goes out compressed (brotli or gzip, as accepted), plain when not accepted; technical fields stay on the server', () => withServer(async (req) => {
    const path = '/summary?fy=2026&periods=7&companies=1000';
    const plain = await req('GET', path);
    const gz = await req('GET', path, { headers: { 'Accept-Encoding': 'gzip, deflate' } });
    const br = await req('GET', path, { headers: { 'Accept-Encoding': 'gzip, deflate, br' } });
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.equal(br.headers['content-encoding'], 'br');
    assert.match(String(gz.headers.vary), /Accept-Encoding/i);
    assert.deepEqual(gz.body.rows, plain.body.rows);
    assert.deepEqual(br.body.rows, plain.body.rows);
    assert.ok(br.raw.length * 5 < plain.raw.length, `brotli ${br.raw.length} vs plain ${plain.raw.length}`);
    // Summary rows carry only what the report uses.
    assert.ok(plain.body.rows.every((r) => !('_entity' in r) && !('P_FiscalYear' in r)));
    assert.ok(plain.body.rows.every((r) => 'CYYTDAmount' in r && 'HeaderGroup' in r && 'ReportingKey' in r));
}));

test('rate limits: per user drill-downs and changes -> 429 with Retry-After; other users are not affected', () => withServer(async (req) => {
    process.env.PUBEXP_RATE_DETAIL_PER_MIN = '3';
    process.env.PUBEXP_RATE_REFRESH_PER_5MIN = '2';
    try {
        const body = { fy: '2026', periods: '7', companies: ['1000'], keys: ['BR001'] };
        for (let i = 0; i < 3; i++) assert.equal((await req('POST', '/detail', { body })).status, 200);
        const over = await req('POST', '/detail', { body });
        assert.equal(over.status, 429);
        assert.ok(Number(over.headers['retry-after']) >= 1);
        assert.match(over.body.error, /Too many drill-downs/);
        assert.equal((await req('GET', '/summary?fy=2026&periods=7&companies=1000')).status, 200, 'other routes still answer');
        // Reads that skip the cache (Refresh) have their own, lower ceiling.
        for (let i = 0; i < 2; i++) assert.equal((await req('GET', '/summary?fy=2026&periods=7&refresh=1')).status, 200);
        assert.equal((await req('GET', '/summary?fy=2026&periods=7&refresh=1')).status, 429);
        // Before the session check: a request without a session is still refused with 401, not counted against the user.
        assert.equal((await req('GET', '/me', { auth: false })).status, 401);
    } finally {
        delete process.env.PUBEXP_RATE_DETAIL_PER_MIN;
        delete process.env.PUBEXP_RATE_REFRESH_PER_5MIN;
    }
}));

test('SAP reads: at most N at once for the whole app, a full queue answers 503 (busy)', async () => {
    process.env.PUBEXP_SAP_MAX_PARALLEL = '2';
    process.env.PUBEXP_SAP_MAX_QUEUE = '3';
    try {
        let now = 0; let peak = 0;
        const work = () => G.sapSlot(async () => { now++; peak = Math.max(peak, now); await new Promise((r) => setTimeout(r, 20)); now--; return 'ok'; });
        const five = await Promise.all(Array.from({ length: 5 }, work));
        assert.deepEqual(five, ['ok', 'ok', 'ok', 'ok', 'ok']);
        assert.equal(peak, 2, 'never more than 2 SAP reads at the same time');
        const six = await Promise.allSettled(Array.from({ length: 6 }, work));
        assert.equal(six.filter((x) => x.status === 'rejected').length, 1, '2 running + 3 waiting; the 6th is refused');
        assert.equal(six.find((x) => x.status === 'rejected').reason.status, 503);
        assert.deepEqual(G.sapStats(), { active: 0, waiting: 0, max: 2 });
    } finally {
        delete process.env.PUBEXP_SAP_MAX_PARALLEL;
        delete process.env.PUBEXP_SAP_MAX_QUEUE;
    }
});

test("SAP's own error text stays in the server log; the browser gets a plain message", async () => {
    const GW = 'https://gw.example.net/api/NWP';
    process.env.PUBEXP_SAP_SUMMARY_BASE = `${GW}/ZC_ATLBTL_EXP_SUMMARY_CDS`;
    process.env.PUBEXP_SAP_DETAIL_BASE = `${GW}/ZC_ATLBTL_EXP_DETAIL_CDS`;
    const real = global.fetch;
    global.fetch = async (url, o) => (String(url).startsWith('http://127.0.0.1') ? real(url, o)
        : new Response(JSON.stringify({ error: { message: { value: 'ZCL_ATLBTL_EXPENSE_AMDP=>GET line 204 internal table dump' } } }), { status: 500 }));
    const logged = []; const realErr = console.error;
    console.error = (...a) => logged.push(a.join(' '));
    try {
        await withServer(async (req) => {
            const r = await req('GET', '/summary?fy=2033&periods=1');
            assert.equal(r.status, 502);
            assert.doesNotMatch(r.body.error, /AMDP|line 204|dump/);
            assert.match(r.body.error, /SAP returned an error/);
        });
        assert.ok(logged.some((l) => l.includes('line 204')), 'the full text is in the server log');
    } finally {
        global.fetch = real; console.error = realErr;
        delete process.env.PUBEXP_SAP_SUMMARY_BASE; delete process.env.PUBEXP_SAP_DETAIL_BASE;
    }
});

test('exclusion wildcards: same matches as before, and a hostile pattern cannot hang the server (ReDoS)', () => {
    const m = (pattern, v) => R.compile({ values: [], pattern })(v);
    assert.ok(m('EH*', 'EH193') && m('eh*', 'EH193') && !m('EH*', 'UN193'));
    assert.ok(m('50792?', '507926') && !m('50792?', '5079261') && m('0050792?', '507926'), 'G/L digits compare without leading zeros');
    assert.ok(m('*193', 'EH193') && m('E*1*3', 'EH193') && !m('E*1*4', 'EH193') && m('*', 'ANY'));
    assert.ok(m('A.B*', 'A.B1') && !m('A.B*', 'AXB1'), 'a dot is a dot, not "any character"');
    const hostile = `${'*A'.repeat(19)}*B`;
    const t0 = Date.now();
    assert.equal(m(hostile, 'A'.repeat(40)), false);
    assert.ok(Date.now() - t0 < 50, `took ${Date.now() - t0} ms`);
});
