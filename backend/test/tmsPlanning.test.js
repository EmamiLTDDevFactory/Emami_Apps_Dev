const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
const P = require('../tmsPlanning');

const FIXTURE = process.env.DP_FIXTURE || path.join(__dirname, 'fixtures', 'dp_data.json');
const hasFixture = fs.existsSync(FIXTURE);
const hasEngine = fs.existsSync(path.join(__dirname, '..', 'tmsDpEngine.js'));

const cfg = () => ({ sites: [{ code: 'DP01', name: 'Kolkata', zone: 'East', type: 'Depot', mwh: '' }, { code: 'UN13', name: 'Pachoria', zone: 'North', type: 'Unit', mwh: '' }, { code: 'DP07', name: 'Delhi old', type: 'Depot' }, { code: 'DP59', name: 'Delhi', zone: 'North', type: 'Depot' }], lanes: [['UN13', 'DP59', 3], ['UN13', 'DP01', 4]], split: [], fold: { DP07: 'DP59' }, matKeys: { 100: { div: 'CCD', key: 'K1', cp: 12, cw: 1, rate: 5 } }, ecomGroups: ['ZEPTO'], trendDays: 14 });

test('pure builder: folding, channels, pieces, MTD vs trend, open orders only MT/Ecom', () => {
    const D = P.buildDataset({
        cfg: cfg(), today: '2026-11-27',
        raw: {
            stock: [{ Matnr: '000100', Werks: 'DP07', Unr: '10', Git: '2', Qi: '0' }, { Matnr: '100', Werks: 'DP59', Unr: '5', Git: '0', Qi: '1' }],
            lots: [{ Matnr: '100', Werks: 'DP59', Charg: 'B1', Hsdat: '20261101', Unr: '15', LifePct: '80' }, { Matnr: '100', Werks: 'DP59', Charg: 'B2', Unr: '3', LifePct: '-1' }],
            openOrders: [{ Matnr: '100', Werks: 'DP01', Vtweg: '30', Kdgrp: 'X', OpenQty: '40' }, { Matnr: '100', Werks: 'DP01', Vtweg: '10', OpenQty: '99' }, { Matnr: '100', Werks: 'DP01', Vtweg: '30', Kdgrp: 'ZEPTO', OpenQty: '7' }],
            sales: [{ Datum: '20261105', Matnr: '100', Werks: 'DP01', Vtweg: '10', Qty: '100' }, { Datum: '20261120', Matnr: '100', Werks: 'DP01', Vtweg: '10', Qty: '60' }, { Datum: '20261127', Matnr: '100', Werks: 'DP01', Vtweg: '10', Qty: '999' }],
            transit: [{ Matnr: '100', Swerks: 'UN13', Werks: 'DP07', Qty: '50', Budat: '20261126', Tknum: 'T1', Transporter: 'ACME', Vehicle: 'WB1' }],
            sto: [{ Matnr: '100', Reswk: 'UN13', Werks: 'DP01', OpenQty: '24' }],
        },
        forecast: [{ material: '100', plant: 'DP07', channel: 'GT', m0: 100, m1: 50, additional: 10, w: [0, 0, 0, 0] }],
    });
    assert.equal(D.mats.length, 1); assert.equal(D.mats[0].key, 'K1');
    assert.deepEqual(D.stk, [[0, D.sites.findIndex((s) => s.code === 'DP59'), 10, 2, 0], [0, D.sites.findIndex((s) => s.code === 'DP59'), 5, 0, 1]].slice(0, 1).map(([a, b]) => [a, b, 15, 2, 1]));
    assert.equal(D.git[0][2], 2);
    assert.equal(D.lots[0][3], 0.8); assert.equal(D.lots[1][3], -1); assert.equal(D.lots[0][4], '2026-11-01');
    assert.deepEqual(D.oo.map((r) => [r[2], r[3]]).sort(), [['Ecom', 7], ['MT', 40]]);       // GT order dropped, ZEPTO group -> Ecom
    const s = D.sale.find((r) => r[2] === 'GT'); assert.equal(s[3], 160);                       // MTD: both days, not today
    const t = D.trend.find((r) => r[2] === 'GT'); assert.equal(t[3], 60);                       // trend: last 14 days only (from 13 Nov), today excluded
    assert.equal(D.ship[0][5], 3); assert.equal(D.ship[0][2], D.sites.findIndex((x) => x.code === 'DP59'));   // folded, lane days 3
    assert.equal(D.fc[0][3], 100); assert.equal(D.afc[0][3], 10);
    assert.ok(D.meta.warnings.some((w) => /Plants not in the depot config/.test(w)) === false);
});

test('materials outside the config Master are left out unless includeUnknown', () => {
    const raw = { stock: [{ Matnr: '555', Werks: 'DP01', Unr: '1' }] };
    const D = P.buildDataset({ cfg: cfg(), today: '2026-11-27', raw });
    assert.equal(D.stk.length, 0); assert.ok(D.meta.warnings.some((w) => /left out/.test(w)));
});

test('unknown material / plant produce warnings, not crashes (includeUnknown)', () => {
    const D = P.buildDataset({ cfg: { ...cfg(), includeUnknown: true }, today: '2026-11-27', raw: { stock: [{ Matnr: '555', Werks: 'ZZ99', Unr: '1' }], materials: [{ Matnr: '555', Maktx: 'NEW', Spart: '10', CasePack: '24', Brgew: '500', Gewei: 'G' }] } });
    assert.equal(D.mats[0].cp, 24); assert.equal(D.mats[0].cw, 12);
    assert.ok(D.meta.warnings.some((w) => /no planning key in the config/.test(w)));
    assert.ok(D.meta.warnings.some((w) => /ZZ99/.test(w)));
});

test('forecast cleaning', () => {
    assert.throws(() => P.cleanForecast([]), /no rows/);
    assert.throws(() => P.cleanForecast([{ material: '', plant: 'DP01' }]), /row 1/);
    assert.throws(() => P.cleanForecast([{ material: '1', plant: 'DP01', m0: -1 }]), /negative/);
    const r = P.cleanForecast([{ material: '000100.0', plant: 'dp01 Kolkata', channel: 'e-com', m0: '1,200', m1: 5 }]);
    assert.deepEqual([r[0].material, r[0].plant, r[0].channel, r[0].m0], ['100', 'DP01', 'Ecom', 1200]);
});

test('pull: chunks plants, bounded filters, one failed source does not stop the rest', async () => {
    const calls = [];
    const fetchSet = async (set, filter) => { calls.push([set, filter]); if (set === 'DpStoSet') throw new Error('boom'); return set === 'DpStockSet' ? [{ Matnr: '999', Werks: 'DP01', Unr: '1' }] : []; };
    const { raw, health } = await P.pull({ fetchSet, cfg: cfg(), today: '2026-11-27', chunkSize: 2 });
    assert.equal(health['Pending STO'].ok, false); assert.match(health['Pending STO'].error, /boom/);
    assert.equal(health.Stock.ok, true); assert.equal(raw.stock.length, 2);             // 4 plants / chunk 2 = 2 calls
    assert.ok(calls.filter((c) => c[0] === 'DpSaleSet').every((c) => /Datum ge datetime'2026-11-01T00:00:00'/.test(c[1])));
    assert.ok(calls.filter((c) => c[0] === 'DpOpenOrderSet').every((c) => /Vtweg eq '30'/.test(c[1])));
    assert.ok(!calls.some((c) => c[0] === 'DpMaterialSet'));  // not on the Master -> no master lookup
    const r2 = await P.pull({ fetchSet, cfg: { ...cfg(), includeUnknown: true }, today: '2026-11-27', chunkSize: 2 });
    assert.ok(calls.some((c) => c[0] === 'DpMaterialSet' && /Matnr eq '999'/.test(c[1])));  // includeUnknown: looked up
    await assert.rejects(P.pull({ fetchSet, cfg: P.emptyConfig(), today: '2026-11-27' }), /config is empty/);
});

test('routes need the right permission', async () => {
    const rows = [];
    const pool = { query: async () => ({ rows }) };
    const mk = (perms, roles = []) => P.create({ pool, fetchSet: Object.assign(async () => [], { live: true }), getUser: async () => ({ email: 'a@b', roles, perms: new Set(perms) }) });
    await assert.rejects(mk([]).api.status({ email: 'a@b' }), /permission/);
    await assert.rejects(mk(['plan.view']).api.refresh({ email: 'a@b' }), /permission/);
    await assert.rejects(mk(['plan.run']).api.seed({ email: 'a@b' }, {}), /permission/);
    await assert.rejects(mk([], ['Admin']).api.seed({ email: 'a@b' }, {}), /not a Distribution Planning/);
});

test('ROUND TRIP: his dp_data.json -> SAP-shaped rows -> builder -> same dataset and the same plan', { skip: !hasFixture || !hasEngine }, () => {
    const E = require('../tmsDpEngine');
    const D0 = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const c = P.configFromDataset(D0);
    const M = D0.mats, S = D0.sites;
    const vt = { GT: '10', MT: '30', Ecom: '55' };
    const raw = {
        stock: D0.stk.map(([mi, si, u, g, q]) => ({ Matnr: M[mi].code, Werks: S[si].code, Unr: u, Git: g, Qi: q })),
        lots: D0.lots.map(([mi, si, q, lf, d], i) => ({ Matnr: M[mi].code, Werks: S[si].code, Charg: `B${i}`, Hsdat: d ? d.replace(/-/g, '') : '', Unr: q, LifePct: lf < 0 ? -1 : lf * 100 })),
        sto: D0.sto.map(([mi, a, b, q]) => ({ Matnr: M[mi].code, Reswk: S[a].code, Werks: S[b].code, OpenQty: q })),
        openOrders: D0.oo.map(([mi, si, ch, q]) => ({ Matnr: M[mi].code, Werks: S[si].code, Vtweg: vt[ch], Kdgrp: '', OpenQty: q })),
        transit: D0.ship.map(([mi, a, b, q, d, , sh, tr, v]) => ({ Matnr: M[mi].code, Swerks: S[a].code, Werks: S[b].code, Qty: q, Budat: d.replace(/-/g, ''), Tknum: sh, Transporter: tr, Vehicle: v })),
        sales: [],
    };
    const trend = new Map(D0.trend.map(([mi, si, ch, q]) => [`${mi}|${si}|${ch}`, q]));
    const seen = new Set();
    D0.sale.forEach(([mi, si, ch, q]) => { const k = `${mi}|${si}|${ch}`; const t = trend.get(k) || 0; seen.add(k); if (q - t !== 0) raw.sales.push({ Datum: '20261105', Matnr: M[mi].code, Werks: S[si].code, Vtweg: vt[ch], Qty: q - t }); if (t !== 0) raw.sales.push({ Datum: '20261120', Matnr: M[mi].code, Werks: S[si].code, Vtweg: vt[ch], Qty: t }); });
    D0.trend.forEach(([mi, si, ch, q]) => { if (!seen.has(`${mi}|${si}|${ch}`)) raw.sales.push({ Datum: '20261120', Matnr: M[mi].code, Werks: S[si].code, Vtweg: vt[ch], Qty: q }); });
    const af = new Map(D0.afc.map(([mi, si, ch, q]) => [`${mi}|${si}|${ch}`, q]));
    const forecast = D0.fc.map(([mi, si, ch, a, b]) => { const k = `${mi}|${si}|${ch}`; const x = af.get(k) || 0; af.delete(k); return { material: M[mi].code, plant: S[si].code, channel: ch, m0: a, m1: b, additional: x, w: [0, 0, 0, 0] }; });
    af.forEach((q, k) => { const [mi, si, ch] = k.split('|'); forecast.push({ material: M[mi].code, plant: S[si].code, channel: ch, m0: 0, m1: 0, additional: q, w: [0, 0, 0, 0] }); });
    D0.rpp.forEach(([mi, si, a, b, c2, d]) => forecast.push({ material: M[mi].code, plant: S[si].code, channel: 'GT', m0: 0, m1: 0, additional: 0, w: [a, b, c2, d] }));

    const D1 = P.buildDataset({ cfg: c, raw, forecast, today: D0.meta.today });
    const norm = (D, name, f) => D[name].map(f(D)).map((r) => JSON.stringify(r)).sort();
    const keyed = (nm, f) => [nm, f];
    const tables = [
        keyed('stk', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, ...r.slice(2)]),
        keyed('lots', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, ...r.slice(2)]),
        keyed('git', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, r[2]]),
        keyed('sto', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, D.sites[r[2]].code, r[3]]),
        keyed('oo', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, r[2], r[3]]),
        keyed('fc', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, r[2], r[3], r[4]]),
        keyed('afc', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, r[2], r[3]]),
        keyed('trend', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, r[2], r[3]]),
        keyed('ship', (D) => (r) => [D.mats[r[0]].code, D.sites[r[1]].code, D.sites[r[2]].code, r[3], r[4], r[6]]),
    ];
    for (const [nm, f] of tables) {
        const a = norm(D0, nm, f), b = norm(D1, nm, f);
        assert.equal(b.length, a.length, `${nm}: row count ${b.length} vs ${a.length}`);
        assert.deepEqual(b, a, `${nm} differs`);
    }
    // MTD: equal except where his trend exceeded his MTD (different sources in the console)
    const sm = (D) => new Map(D.sale.map((r) => [`${D.mats[r[0]].code}|${D.sites[r[1]].code}|${r[2]}`, r[3]]));
    const s0 = sm(D0), s1 = sm(D1); let bad = 0; s0.forEach((q, k) => { if (Math.abs((s1.get(k) || 0) - q) > 0.01) bad++; });
    assert.ok(bad < 0.02 * s0.size, `sale MTD differs on ${bad}/${s0.size}`);

    const planKey = (D, r) => `${r.leg}|${D.mats[r.mi].code}|${D.sites[r.from].code}|${D.sites[r.to].code}|${Math.round(r.pcs)}`;
    const p0 = E.plan(D0, {}), p1 = E.plan(D1, {});
    const m0 = new Map(), m1 = new Map();
    p0.lines.forEach((l) => m0.set(planKey(D0, l), (m0.get(planKey(D0, l)) || 0) + 1));
    p1.lines.forEach((l) => m1.set(planKey(D1, l), (m1.get(planKey(D1, l)) || 0) + 1));
    let diff = 0; new Set([...m0.keys(), ...m1.keys()]).forEach((k) => { if ((m0.get(k) || 0) !== (m1.get(k) || 0)) diff++; });
    if (process.env.DP_DEBUG) new Set([...m0.keys(), ...m1.keys()]).forEach((k) => { if ((m0.get(k) || 0) !== (m1.get(k) || 0)) console.log("DIFF", k, m0.get(k) || 0, m1.get(k) || 0); });
    console.log(`round trip: lines ${p0.lines.length}/${p1.lines.length}, trucks ${p0.trucks.length}/${p1.trucks.length}, differing keys ${diff}, sale-MTD mismatches ${bad}`);
    assert.equal(p1.trucks.length, p0.trucks.length);
    // identical data in, near-identical plan out: a few quantity shifts come from tie-breaks on row order inside the engine (console row order is not reproducible from SAP)
    assert.equal(p1.lines.length, p0.lines.length);
    assert.ok(diff <= Math.ceil(p0.lines.length * 0.005), `${diff} plan line keys differ (limit ${Math.ceil(p0.lines.length * 0.005)})`);
});
