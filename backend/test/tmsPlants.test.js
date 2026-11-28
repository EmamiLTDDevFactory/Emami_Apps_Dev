// Plants: SAP PlantSet merged with the server-side coordinate table (tmsPlants.js). Fake pool + fake SAP, no database, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

process.env.NODE_ENV = 'test';
delete process.env.TMS_SAP_ODATA_BASE;
const P = require('../tmsPlants');
const sap = require('../tmsSap');

const sapRow = (code, name, city, pincode, region = 'WBL', extra = {}) => ({ code, name, name2: '', street: '', pincode, city, region, country: 'IN', addressNo: '1', calendar: 'KB', timeZone: 'INDIA', cityCode: '', ...extra });
const geo = (code, lat, lon, extra = {}) => ({ code, lat, lon, source: 'pincode', confidence: 'high', name: `${code} geo`, city: 'GEOCITY', state: 'West Bengal', pincode: '700001', type: 'Depot', note: '', ...extra });

// ---- fake pool: the four statements tmsPlants.js issues
function fakePool(rows = []) {
    const t = new Map(rows.map((r) => [r.code, { ...r }]));
    const calls = [];
    return {
        t, calls,
        query: async (sql, params = []) => {
            calls.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
            if (/^\s*CREATE TABLE/i.test(sql)) return { rows: [] };
            if (/^\s*SELECT werks, lat/i.test(sql)) return { rows: [...t.values()].sort((a, b) => a.code.localeCompare(b.code)).map((r) => ({ ...r, werks: r.code })) };
            if (/^\s*SELECT werks FROM/i.test(sql)) return { rows: t.has(params[0]) ? [{ werks: params[0] }] : [] };
            if (/^\s*INSERT INTO/i.test(sql)) {
                const seed = params.length === 12;
                const [code] = params; const cur = t.get(code);
                if (seed) {
                    if (cur && cur.source === 'manual') return { rowCount: 0, rows: [] };
                    t.set(code, { code, lat: params[1], lon: params[2], source: params[3], confidence: params[4], name: params[5], city: params[6], state: params[7], pincode: params[8], type: params[9], note: params[10], updated_by: params[11] });
                } else {
                    t.set(code, { ...(cur || { name: params[4], city: params[5], state: params[6], pincode: params[7], type: '' }), code, lat: params[1], lon: params[2], source: 'manual', confidence: params[3], note: 'Set by an administrator', updated_by: params[8] });
                }
                return { rowCount: 1, rows: [] };
            }
            throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
        },
    };
}
const admin = async () => ({ email: 'admin@emamigroup.com', roles: ['Admin'] });
const staff = async () => ({ email: 'alloc@emamigroup.com', roles: ['Allocation Executive'] });
const mk = (pool, { rows = [], configured = true, getUser = admin } = {}) => P.create({ pool, sapConfigured: () => configured, sapPlants: async (caller, q) => ({ simulated: false, rows: q && q.codes ? rows.filter((r) => q.codes.includes(r.code)) : rows }), getUser });

// ---------------------------------------------------------------- pure merge
test('merge: SAP is the master list, geo supplies coordinates; plants without coordinates are listed in newInSap', () => {
    const r = P.mergePlants([sapRow('DP15', 'EMAMI LIMITED', 'Howrah', '711302'), sapRow('ZZ01', 'New Plant', 'Pune', '411001', 'MH')], [geo('DP15', 22.6, 88.3, { source: 'sanjoy-dp' })]);
    assert.equal(r.simulated, false);
    assert.deepEqual(r.newInSap, ['ZZ01']);
    const dp = r.plants.find((p) => p.code === 'DP15'), zz = r.plants.find((p) => p.code === 'ZZ01');
    assert.deepEqual([dp.name, dp.city, dp.pincode, dp.lat, dp.lon, dp.source, dp.fromSap, dp.hasCoordinates], ['EMAMI LIMITED', 'Howrah', '711302', 22.6, 88.3, 'sanjoy-dp', true, true]);
    assert.equal(dp.state, 'West Bengal'); // state NAME from the geo table
    assert.deepEqual([zz.lat, zz.lon, zz.hasCoordinates, zz.fromSap, zz.state], [null, null, false, true, 'MH']); // no geo: SAP region code is the best state value
});

test('merge: a geo row no longer in SAP stays on the map with fromSap false; list is sorted; duplicates collapse', () => {
    const r = P.mergePlants([sapRow('UN01', 'U', 'K', '700001'), sapRow('UN01', 'dup', 'K', '700001'), sapRow('3P00', 'R&D', 'K', '700002')], [geo('OLD1', 20, 80), geo('UN01', 22.5, 88.3)]);
    assert.deepEqual(r.plants.map((p) => p.code), ['3P00', 'OLD1', 'UN01']);
    assert.equal(r.plants.find((p) => p.code === 'OLD1').fromSap, false);
    assert.equal(r.plants.find((p) => p.code === 'UN01').name, 'U');
    assert.deepEqual(r.newInSap, ['3P00']);
});

test('merge: SAP not configured returns the geo rows only, simulated true, newInSap empty', () => {
    const r = P.mergePlants(null, [geo('DP15', 22.6, 88.3), geo('UN01', 22.5, 88.3)]);
    assert.equal(r.simulated, true);
    assert.deepEqual(r.newInSap, []);
    assert.deepEqual(r.plants.map((p) => [p.code, p.fromSap, p.hasCoordinates]), [['DP15', false, true], ['UN01', false, true]]);
});

test('cleanGeo: India bounding box, code format, defaults', () => {
    assert.ok(P.cleanGeo({ code: 'dp15', lat: 22.6, lon: 88.3 }).row);
    assert.equal(P.cleanGeo({ code: 'dp15', lat: 22.6, lon: 88.3 }).row.code, 'DP15');
    for (const [lat, lon] of [[5.9, 80], [37.1, 80], [20, 67.9], [20, 98.1], ['x', 80], [null, null], ['', '']]) assert.match(P.cleanGeo({ code: 'DP15', lat, lon }).error, /outside India/, `${lat},${lon}`);
    assert.match(P.cleanGeo({ code: 'bad code!', lat: 20, lon: 80 }).error, /Invalid plant code/);
    assert.deepEqual([P.cleanGeo({ code: 'A1', lat: 6, lon: 68 }).row.source, P.cleanGeo({ code: 'A1', lat: 37, lon: 98, source: 'pincode', confidence: 'medium' }).row.confidence], ['manual', 'medium']);
});

// ---------------------------------------------------------------- storage + permissions
test('GET plants: reads SAP + geo through the fake pool; works for any TMS user', async () => {
    const pool = fakePool([geo('DP15', 22.6, 88.3)]);
    const m = mk(pool, { rows: [sapRow('DP15', 'EMAMI LIMITED', 'Howrah', '711302'), sapRow('NEW1', 'New', 'Pune', '411001', 'MH')], getUser: staff });
    const r = await m.api.list({ email: 'x' });
    assert.equal(r.plants.length, 2); assert.deepEqual(r.newInSap, ['NEW1']); assert.equal(r.simulated, false);
});

test('GET plants with SAP not configured: geo rows only, simulated true', async () => {
    const m = mk(fakePool([geo('DP15', 22.6, 88.3)]), { configured: false });
    const r = await m.api.list({});
    assert.equal(r.simulated, true); assert.equal(r.plants.length, 1); assert.deepEqual(r.newInSap, []);
});

test('seed-geo: admin only; loads valid rows, reports invalid ones, never overwrites a manual coordinate', async () => {
    const pool = fakePool([geo('DP15', 20, 80, { source: 'manual', confidence: 'high' })]);
    const body = { plants: [{ code: 'DP15', lat: 22.6, lon: 88.3, source: 'pincode', confidence: 'high', name: 'Howrah' }, { code: 'UN01', lat: 22.5, lon: 88.3, source: 'sanjoy-dp', confidence: 'high' }, { code: 'BAD1', lat: 50, lon: 88 }, { code: '', lat: 20, lon: 80 }] };
    await assert.rejects(mk(pool, { getUser: staff }).api.seedGeo({}, body), (e) => e.status === 403);
    const r = await mk(pool).api.seedGeo({}, body);
    assert.deepEqual([r.seeded, r.skipped, r.invalidCount], [1, 1, 2]);
    assert.equal(pool.t.get('DP15').lat, 20); // manual one untouched
    assert.equal(pool.t.get('UN01').source, 'sanjoy-dp');
    assert.equal(pool.t.get('UN01').updated_by, 'admin@emamigroup.com');
    await assert.rejects(mk(pool).api.seedGeo({}, {}), (e) => e.status === 400);
    const again = await mk(pool).api.seedGeo({}, body.plants.slice(1, 2)); // a bare array is accepted too, and re-seeding is idempotent
    assert.deepEqual([again.seeded, again.skipped], [1, 0]);
});

test('POST geo: admin only, India box validated, saves as manual / high; unknown plant 404 unless SAP knows it', async () => {
    const pool = fakePool([geo('DP15', 22.6, 88.3)]);
    const m = mk(pool, { rows: [sapRow('NEW1', 'New Plant', 'Pune', '411001', 'MH')] });
    await assert.rejects(mk(pool, { getUser: staff }).api.saveGeo({}, { code: 'DP15', lat: 22, lon: 88 }), (e) => e.status === 403);
    await assert.rejects(m.api.saveGeo({}, { code: 'DP15', lat: 51.5, lon: -0.1 }), (e) => e.status === 400 && /outside India/.test(e.message));
    const ok = await m.api.saveGeo({}, { code: 'dp15', lat: 22.61, lon: 88.31 });
    assert.deepEqual([ok.plant.code, ok.plant.lat, ok.plant.lon, ok.plant.source, ok.plant.confidence], ['DP15', 22.61, 88.31, 'manual', 'high']);
    assert.equal(pool.t.get('DP15').updated_by, 'admin@emamigroup.com');
    await assert.rejects(m.api.saveGeo({}, { code: 'NOPE', lat: 22, lon: 88 }), (e) => e.status === 404);
    const viaSap = await m.api.saveGeo({}, { code: 'NEW1', lat: 18.52, lon: 73.85 }); // not on the map yet but in SAP
    assert.equal(viaSap.plant.name, 'New Plant'); assert.equal(viaSap.plant.pincode, '411001');
    // a later seed does not clobber the corrected point
    await m.api.seedGeo({}, { plants: [{ code: 'NEW1', lat: 19, lon: 74, source: 'pincode', confidence: 'low' }] });
    assert.equal(pool.t.get('NEW1').lat, 18.52);
});

// ---------------------------------------------------------------- HTTP routes (exact response shapes)
async function withServer(m, fn) {
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.caller = { email: 'admin@emamigroup.com' }; next(); }); app.use('/plants', m.router);
    const srv = http.createServer(app); await new Promise((r) => srv.listen(0, r));
    const base = `http://127.0.0.1:${srv.address().port}/plants`;
    try { return await fn(async (path, method = 'GET', body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; }); } finally { srv.close(); }
}
test('routes: GET /, POST /seed-geo, POST /geo answer with the documented shapes and status codes', async () => {
    const pool = fakePool();
    const m = mk(pool, { rows: [sapRow('DP15', 'EMAMI LIMITED', 'Howrah', '711302')] });
    await withServer(m, async (call) => {
        let r = await call('/');
        assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.body).sort(), ['newInSap', 'plants', 'simulated']); assert.deepEqual(r.body.newInSap, ['DP15']);
        r = await call('/seed-geo', 'POST', { plants: [{ code: 'DP15', lat: 22.6, lon: 88.3, source: 'sanjoy-dp', confidence: 'high', state: 'West Bengal' }] });
        assert.deepEqual([r.status, r.body.seeded, r.body.skipped, r.body.invalidCount], [200, 1, 0, 0]);
        r = await call('/');
        assert.deepEqual(Object.keys(r.body.plants[0]).filter((k) => ['code', 'name', 'city', 'state', 'pincode', 'lat', 'lon', 'source', 'confidence', 'fromSap', 'hasCoordinates'].includes(k)).sort(), ['city', 'code', 'confidence', 'fromSap', 'hasCoordinates', 'lat', 'lon', 'name', 'pincode', 'source', 'state']);
        assert.deepEqual(r.body.newInSap, []);
        r = await call('/geo', 'POST', { code: 'DP15', lat: 1, lon: 1 });
        assert.equal(r.status, 400); assert.match(r.body.error, /outside India/);
        r = await call('/geo', 'POST', { code: 'DP15', lat: 22.7, lon: 88.4 });
        assert.deepEqual([r.status, r.body.plant.source, r.body.plant.lat], [200, 'manual', 22.7]);
    });
});

// ---------------------------------------------------------------- SAP client
test('SAP client: map.plant and simulated plants()', async () => {
    assert.deepEqual(sap.map.plant({ Werks: 'dp15', Name1: 'EMAMI LIMITED', Pstlz: '711302', Ort01: 'Howrah', Regio: 'WBL', Land1: 'IN', Adrnr: '0000022462', Fabkl: 'KB', TimeZone: 'INDIA' }),
        { code: 'DP15', name: 'EMAMI LIMITED', name2: '', street: '', pincode: '711302', city: 'Howrah', region: 'WBL', country: 'IN', addressNo: '0000022462', calendar: 'KB', timeZone: 'INDIA', cityCode: '' });
    assert.deepEqual(await sap.plants({}), { simulated: true, rows: [] });
});
