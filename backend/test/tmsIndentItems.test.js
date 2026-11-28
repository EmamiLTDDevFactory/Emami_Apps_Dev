// Multi-transporter indents (docs/PHASE1_TRIP_TRAIL_DOC.md): one indent number, one item per transporter, per-transporter mail,
// vendor submit / reject of their own items only. Style of tms.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.HUB_AUTH_JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';
delete process.env.TMS_SAP_ODATA_BASE;
delete process.env.TMS_MAIL_URL;
const engine = require('../tmsEngine');
const { createService, memoryStore } = require('../tms')._test;

const NOW = Date.parse('2026-11-19T10:00:00Z');
const H = 3600_000;
const iso = (t) => new Date(t).toISOString();

function world() {
    const db = engine.emptyDb();
    db.units = [{ id: 'UN13', code: 'UN13', name: 'Guwahati', division: 'East', city: 'Guwahati' }, { id: 'UN01', code: 'UN01', name: 'Kolkata', division: 'East', city: 'Kolkata' }];
    db.locs = [{ id: 'GAU', city: 'Guwahati', state: 'Assam', zone: 'NE', lat: 26.14, lon: 91.74, pincode: '781101' }, { id: 'CCU', city: 'Kolkata', state: 'West Bengal', zone: 'East', lat: 22.57, lon: 88.36, pincode: '700001' }];
    db.customers = [{ id: 'K1', name: 'Reliance Retail', rCode: 'R1', zone: 'East', contact: '', csl: '', segment: 'MT' }];
    const car = (id, name, extra = {}) => ({ id, name, code: id, type: 'Asset', shortName: name.split(' ')[0].toUpperCase(), paymentTerms: 'Net 30', weightage: 50, blocked: false, rating: 4, fleet: 10, lanes: [], rejectionPct: 0, fulfilledPct: 90, ...extra });
    db.carriers = [car('C001', 'Elite Roadways', { email: 'ops@elite.example' }), car('C002', 'Gati Freight'), car('C003', 'Blocked Co', { blocked: true }), car('C004', 'Fourth Carriers'), car('C005', 'Fifth Lines', { email: 'fifth@x.example' })];
    db.vehicleTypes = [{ code: 'CONT15MT', name: '15 MT container', maxWeightKg: 15000, maxVolumeM3: 60 }];
    const mk = (id, name, roles, extra = {}) => ({ id, name, email: `${id.toLowerCase()}@x.com`, designation: '', roles, units: ['UN13'], lastSignin: '', ...extra });
    const u = {
        admin: mk('U1', 'Admin', ['Admin'], { units: ['UN13', 'UN01'] }), depot: mk('U20', 'Depot', ['Depot User']), ho: mk('U21', 'HO', ['HO Logistics']), kol: mk('U7', 'Kol', ['Depot User'], { units: ['UN01'] }),
        v1: mk('U22', 'Vendor1', ['Carrier Vendor'], { carrierId: 'C001', units: [] }), v2: mk('U23', 'Vendor2', ['Carrier Vendor'], { carrierId: 'C002', units: [] }),
        v5: mk('U25', 'Vendor5', ['Carrier Vendor'], { carrierId: 'C005', units: [] }),
    };
    db.users = Object.values(u);
    return { db, u };
}
const run = (w, user, cmd, now = NOW, deps = {}) => engine.apply(w.db, cmd, user, deps, now);
const rejects = (p, status, re) => assert.rejects(p, (e) => e instanceof engine.EngineError && (status === undefined || e.status === status) && (!re || re.test(e.message)));
const laneCmd = () => ({ type: 'upsertLane', fromLocId: 'GAU', toLocId: 'CCU', distanceKm: 1030, transitH: 30, vendors: [{ carrierId: 'C001', priority: 1, rate: 41000 }, { carrierId: 'C002', priority: 2, rate: 43000 }] });
const alloc = (carrierId, over = {}) => ({ carrierId, cases: 100, vehicles: 1, qty: 12, requiredAt: iso(NOW + 24 * H), ...over });
const multiCmd = (over = {}) => ({ type: 'createIndent', unitId: 'UN13', laneId: 'LN-GAU-CCU', vehicleType: 'CONT15MT', material: 'Talc', deliveries: ['80001234'], allocations: [alloc('C001', { cases: 100, vehicles: 2, qty: 24 }), alloc('C002', { cases: 60, vehicles: 1, qty: 12 })], ...over });
const legacyCmd = (over = {}) => ({ type: 'createIndent', unitId: 'UN13', customerId: 'K1', laneId: 'LN-GAU-CCU', vehicleType: 'CONT15MT', requiredAt: iso(NOW + 24 * H), material: 'Talc', qty: 12, deliveries: ['80001234'], ...over });
const unit = (n, over = {}) => ({ driver: `Driver ${n}`, phone: '9876543210', vehicleNo: `AS01AB123${n}`, ...over });
async function raised(w, over = {}) { await run(w, w.u.ho, laneCmd()); return (await run(w, w.u.depot, multiCmd(over))).result; }
const item = (w, indentId, no) => w.db.indents.find((i) => i.id === indentId).items.find((x) => x.itemNo === no);

test('raise: one indent number, one item per transporter (10, 20), totals derived, no customer needed', async () => {
    const w = world();
    const r = await raised(w);
    assert.match(r.indentId, /^IND\d+$/);
    assert.deepEqual(r.items, [{ itemNo: 10, carrierId: 'C001' }, { itemNo: 20, carrierId: 'C002' }]);
    const ind = w.db.indents[0];
    assert.equal(ind.customerId, '');
    assert.equal(ind.cases, 160); assert.equal(ind.vehicles, 3); assert.equal(ind.qty, 36);
    assert.equal(ind.status, 'Open'); assert.deepEqual(ind.offers, []);
    assert.deepEqual(ind.items.map((i) => [i.itemNo, i.status, i.vehicles, i.cases, i.qty]), [[10, 'Pending', 2, 100, 24], [20, 'Pending', 1, 60, 12]]);
    assert.equal(ind.items[0].rate, 41000); assert.equal(ind.items[1].rate, 43000);       // the lane's own rate for each transporter
    assert.ok(Date.parse(ind.items[0].expiresAt) > NOW);
    assert.ok(w.db.notifications.some((n) => /raised with 2 transporter line/.test(n.text)));
});

test('raise: a transporter that is not on the lane gets rate 0; totals typed by the user must match the lines', async () => {
    const w = world(); await run(w, w.u.ho, laneCmd());
    const r = await run(w, w.u.depot, multiCmd({ allocations: [alloc('C004')], cases: 100, vehicles: 1, qty: 12 }));
    assert.equal(item(w, r.result.indentId, 10).rate, 0);
    await rejects(run(w, w.u.depot, multiCmd({ cases: 999 })), 400, /No\. of cases \(999\) does not match .* \(160\)/);
    await rejects(run(w, w.u.depot, multiCmd({ vehicles: 9 })), 400, /No\. of vehicles \(9\) does not match .* \(3\)/);
    await rejects(run(w, w.u.depot, multiCmd({ qty: 5 })), 400, /Quantity \(5\) does not match .* \(36\)/);
    const ok = await run(w, w.u.depot, multiCmd({ cases: 160, vehicles: 3, qty: 36 }));
    assert.ok(ok.result.indentId);
});

test('raise: validation of the lines (carrier, blocked, duplicates, whole numbers, future time, limits)', async () => {
    const w = world(); await run(w, w.u.ho, laneCmd());
    const bad = (allocations, status, re) => rejects(run(w, w.u.depot, multiCmd({ allocations })), status, re);
    await bad([alloc('NOPE')], 400, /Transporter line 1: choose a transporter/);
    await bad([alloc('C003')], 409, /blocked/);
    await bad([alloc('C001'), alloc('C001')], 400, /only once/);
    await bad([alloc('C001', { vehicles: 0 })], 400, /No\. of vehicles/);
    await bad([alloc('C001', { vehicles: 1.5 })], 400, /whole number/);
    await bad([alloc('C001', { cases: -1 })], 400, /No\. of cases/);
    await bad([alloc('C001', { qty: 0 })], 400, /Quantity/);
    await bad([alloc('C001'), alloc('C002', { requiredAt: iso(NOW - H) })], 400, /Transporter line 2: .*future/);
    await bad(Array.from({ length: 21 }, (_, i) => alloc(`C0${i}`)), 400, /At most 20/);
    await rejects(run(w, w.u.depot, multiCmd({ customerId: 'nope' })), 400, /customer/i);       // an unknown customer is still refused when one is given
    await rejects(run(w, w.u.kol, multiCmd()), 403, /unit/);
    await rejects(run(w, w.u.ho, laneCmd()).then(() => run(w, { ...w.u.depot, roles: ['Marketing'] }, multiCmd())), 403);
});

test('mail: one per transporter, each with ONLY that transporter\'s own line; recipients; no-address and failed mail never fail the raise', async () => {
    const w = world(); await run(w, w.u.ho, laneCmd());
    const { result } = await run(w, w.u.depot, multiCmd({ allocations: [alloc('C001', { cases: 111, vehicles: 2, qty: 24 }), alloc('C002', { cases: 222, vehicles: 1, qty: 12 }), alloc('C004', { cases: 333, vehicles: 1, qty: 7 })], customerId: 'K1' }));
    const reqs = result.mailRequests;
    assert.equal(reqs.length, 2);                                               // C004 has no e-mail and no linked user -> no mail
    const byCar = Object.fromEntries(reqs.map((r) => [r.carrierId, r]));
    assert.equal(byCar.C001.to, 'ops@elite.example, u22@x.com');                // carrier e-mail + linked vendor user
    assert.equal(byCar.C002.to, 'u23@x.com');                                    // no carrier e-mail: the linked vendor user
    const all = (r) => `${r.subject}\n${r.text}`;
    assert.match(all(byCar.C001), new RegExp(`${result.indentId}-10`)); assert.match(byCar.C001.text, /No\. of cases: 111/); assert.match(byCar.C001.text, /No\. of vehicles: 2/);
    assert.match(all(byCar.C002), new RegExp(`${result.indentId}-20`)); assert.match(byCar.C002.text, /No\. of cases: 222/);
    for (const [mine, other] of [['C001', 'C002'], ['C002', 'C001']]) {
        const t = all(byCar[mine]);
        assert.doesNotMatch(t, /Gati|Elite|Fourth|Fifth/.source === '' ? /x/ : new RegExp(w.db.carriers.find((c) => c.id === other).name.split(' ')[0]));
        assert.doesNotMatch(t, /41000|43000/);                                   // no rates
        assert.doesNotMatch(t, /Reliance|K1/);                                   // no customer
    }
    assert.doesNotMatch(all(byCar.C001), /\b222\b|\b333\b/); assert.doesNotMatch(all(byCar.C002), /\b111\b|\b333\b/);
    assert.equal(item(w, result.indentId, 30).mail.sent, false); assert.match(item(w, result.indentId, 30).mail.error, /No e-mail/);
    assert.ok(w.db.notifications.some((n) => /no e-mail address for Fourth Carriers/.test(n.text)));
});

test('mail dispatch in the service: sent per transporter, outcome stored on the item, simulated when no provider, failure never fails the command', async () => {
    const w = world(); await run(w, w.u.ho, laneCmd());
    const sent = [];
    let mode = 'ok';
    const store = memoryStore(w.db);
    const svc = createService(store, () => ({ mail: { send: async (m) => { sent.push(m); if (mode === 'throw') throw new Error('smtp down'); return mode === 'sim' ? { sent: false, simulated: true } : { sent: true }; } }, consent: { request: async () => ({ requested: true }) } }));
    const real = Date.now() + 24 * H;
    const live = () => multiCmd({ allocations: [alloc('C001', { cases: 100, vehicles: 2, qty: 24, requiredAt: iso(real) }), alloc('C002', { cases: 60, vehicles: 1, qty: 12, requiredAt: iso(real) })] });
    const r1 = await svc.run({ email: w.u.depot.email }, live());
    assert.equal(sent.length, 2); assert.equal(r1.result.mails.length, 2); assert.ok(r1.result.mails.every((m) => m.sent === true));
    assert.equal(r1.result.mailRequests, undefined);                            // mail text is not echoed to the browser
    const ind = store.db.indents[0];
    assert.ok(ind.items.every((i) => i.mail && i.mail.sent === true && i.mail.at));
    sent.length = 0; mode = 'sim';
    const r2 = await svc.run({ email: w.u.depot.email }, live());
    assert.ok(r2.result.mails.every((m) => m.sent === false && m.simulated === true));
    mode = 'throw';
    const r3 = await svc.run({ email: w.u.depot.email }, live());           // the raise still succeeds
    assert.ok(r3.result.indentId); assert.ok(r3.result.mails.every((m) => m.sent === false && /smtp down/.test(m.error)));
    assert.match(store.db.indents[0].items[0].mail.error, /smtp down/);
});

test('vendor visibility: only own items, own totals; no customer, other transporters, split, rates or mail', async () => {
    const w = world();
    const r = await raised(w, { customerId: 'K1' });
    const view = engine.scopedDb(w.db, w.u.v1);
    assert.equal(view.indents.length, 1);
    const i = view.indents[0];
    assert.equal(i.id, r.indentId); assert.equal(i.items.length, 1); assert.equal(i.items[0].carrierId, 'C001');
    assert.equal(i.cases, 100); assert.equal(i.vehicles, 2); assert.equal(i.qty, 24);       // not 160 / 3 / 36
    assert.equal(i.customerId, ''); assert.equal(i.createdBy, ''); assert.deepEqual(i.remarks, []);
    assert.equal(i.items[0].mail, undefined);
    const text = JSON.stringify(view.indents);
    assert.doesNotMatch(text, /C002|43000|Reliance/);
    assert.equal(engine.scopedDb(w.db, w.u.v5).indents.length, 0);                         // a carrier with no item sees nothing
    assert.equal(engine.scopedDb(w.db, w.u.v2).indents[0].items[0].carrierId, 'C002');
});

test('vendor submit: only the vendor\'s own item; non-vendors and other carriers are refused with no probing', async () => {
    const w = world(); const r = await raised(w);
    const cmd = (over = {}) => ({ type: 'vendorSubmitItem', id: r.indentId, itemNo: 10, units: [unit(1), unit(2)], ...over });
    await rejects(run(w, w.u.v2, cmd()), 409, /not assigned to your transport company/);    // Gati tries Elite's item
    await rejects(run(w, w.u.v2, cmd({ itemNo: 99 })), 409, /not assigned to your transport company/); // same message for a missing item
    await rejects(run(w, w.u.v5, cmd()), 409, /not assigned to your transport company/);
    await rejects(run(w, w.u.depot, cmd()), 403, /Only carrier users/);
    await rejects(run(w, w.u.ho, cmd()), 403, /Only carrier users/);
    await rejects(run(w, w.u.v1, cmd({ id: 'IND1' })), 404, /Indent not found/);
    assert.equal(item(w, r.indentId, 10).status, 'Pending');                                  // nothing changed
});

test('vendor submit: exactly one row per vehicle, each validated like assign, no duplicate or already-live vehicle', async () => {
    const w = world(); const r = await raised(w);
    const sub = (units) => run(w, w.u.v1, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 10, units });
    await rejects(sub([unit(1)]), 400, /exactly 2 vehicles/);
    await rejects(sub([unit(1), unit(2), unit(3)]), 400, /exactly 2 vehicles/);
    await rejects(sub([]), 400, /exactly 2 vehicles/);
    await rejects(sub([unit(1), unit(2, { vehicleNo: 'BADNO' })]), 400, /Vehicle 2: Enter a valid vehicle registration/);
    await rejects(sub([unit(1, { phone: '12345' }), unit(2)]), 400, /Vehicle 1: Enter a valid 10-digit/);
    await rejects(sub([unit(1), unit(2, { driver: '  ' })]), 400, /Vehicle 2: Driver name is required/);
    await rejects(sub([unit(1), unit(1, { driver: 'Other' })]), 400, /entered twice/);
    await rejects(sub([unit(1), unit(2, { vehicleNo: 'as 01 ab 1231' })]), 400, /entered twice/);   // same number after normalising
    assert.equal(w.db.orders.length, 0); assert.equal(w.db.shipments.length, 0);               // a refused submit changes nothing
    // vehicle already on another live shipment
    await run(w, w.u.v2, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 20, units: [unit(1)] });
    await rejects(sub([unit(1), unit(2)]), 409, /already on another live shipment/);
});

test('vendor submit: one order + one assigned shipment per vehicle, item Submitted, statuses roll up', async () => {
    const w = world(); const r = await raised(w);
    const a = await run(w, w.u.v1, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 10, units: [unit(1), unit(2, { driver: 'Sita', phone: '98765 43211' })] });
    assert.equal(a.result.sins.length, 2); assert.equal(a.result.consentRequests.length, 2);
    const ships = w.db.shipments.filter((s) => a.result.sins.includes(s.sin));
    assert.equal(ships.length, 2);
    assert.ok(ships.every((s) => s.status === 'Assigned' && s.carrierId === 'C001' && s.indentId === r.indentId && s.indentItem === 10 && s.lr && s.customerId === ''));
    assert.deepEqual(ships.map((s) => s.vehicleNo).sort(), ['AS01AB1231', 'AS01AB1232']);
    assert.equal(ships.find((s) => s.vehicleNo === 'AS01AB1232').phone, '9876543211'); assert.equal(ships[0].freight, 41000);
    const o = w.db.orders.find((x) => x.id === a.result.orderId);
    assert.equal(o.vehicles, 2); assert.equal(o.qty, 24); assert.equal(o.packages, 100); assert.equal(o.customerId, ''); assert.equal(o.status, 'Active');
    const it = item(w, r.indentId, 10);
    assert.equal(it.status, 'Submitted'); assert.equal(it.sins.length, 2); assert.deepEqual(it.units.map((x) => x.vehicleNo), ['AS01AB1231', 'AS01AB1232']);
    const ind = w.db.indents[0];
    assert.equal(ind.status, 'Partly allocated'); assert.equal(ind.sin, it.sins[0]);       // item 20 still pending
    await rejects(run(w, w.u.v1, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 10, units: [unit(1), unit(2)] }), 409, /already submitted/);
    await run(w, w.u.v2, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 20, units: [unit(3)] });
    assert.equal(w.db.indents[0].status, 'Allocated');
    assert.equal(w.db.orders.length, 2); assert.equal(w.db.shipments.length, 3);
    // the tracking flow carries on as for any assigned shipment
    const adv = await run(w, w.u.ho, { type: 'advance', sin: it.sins[0] });
    assert.ok(adv.result !== undefined);
});

test('reject: reason required; item Rejected; HO told (critical); a replacement line can be added; statuses roll up', async () => {
    const w = world(); const r = await raised(w);
    await rejects(run(w, w.u.v2, { type: 'vendorRejectItem', id: r.indentId, itemNo: 20, reason: '  ' }), 400, /reason is required/);
    await rejects(run(w, w.u.v1, { type: 'vendorRejectItem', id: r.indentId, itemNo: 20, reason: 'x' }), 409, /not assigned to your transport company/);
    await run(w, w.u.v2, { type: 'vendorRejectItem', id: r.indentId, itemNo: 20, reason: 'No vehicles free' });
    assert.equal(item(w, r.indentId, 20).status, 'Rejected'); assert.equal(item(w, r.indentId, 20).rejectReason, 'No vehicles free');
    assert.ok(w.db.notifications.some((n) => n.level === 'crit' && /rejected by Gati Freight: No vehicles free/.test(n.text)));
    let ind = w.db.indents[0];
    assert.equal(ind.status, 'Open'); assert.equal(ind.escalated, true); assert.equal(ind.cases, 100);   // totals follow the live lines
    await rejects(run(w, w.u.v2, { type: 'vendorRejectItem', id: r.indentId, itemNo: 20, reason: 'again' }), 409, /already rejected/);
    await rejects(run(w, w.u.v2, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 20, units: [unit(3)] }), 409, /already rejected/);
    // HO adds another transporter: next item number, same indent
    await rejects(run(w, w.u.depot, { type: 'addIndentItem', id: r.indentId, allocation: alloc('C005') }), 403);
    await rejects(run(w, w.u.ho, { type: 'addIndentItem', id: r.indentId, allocation: alloc('C005'), replaces: 10 }), 409, /Rejected or Expired line/);
    const add = await run(w, w.u.ho, { type: 'addIndentItem', id: r.indentId, allocation: alloc('C005', { cases: 60, vehicles: 1, qty: 12 }) });
    assert.equal(add.result.itemNo, 30); assert.equal(add.result.mailRequests.length, 1); assert.equal(add.result.mailRequests[0].to, 'fifth@x.example, u25@x.com');
    await rejects(run(w, w.u.ho, { type: 'addIndentItem', id: r.indentId, allocation: alloc('C005') }), 409, /already has an open line/);
    await rejects(run(w, w.u.ho, { type: 'addIndentItem', id: r.indentId, allocation: alloc('C003') }), 409, /blocked/);
    await run(w, w.u.v1, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 10, units: [unit(1), unit(2)] });
    ind = w.db.indents[0]; assert.equal(ind.status, 'Partly allocated');                    // one submitted, one pending
    await run(w, w.u.v5, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 30, units: [unit(4)] });
    ind = w.db.indents[0]; assert.equal(ind.status, 'Allocated'); assert.equal(ind.escalated, false); assert.equal(item(w, r.indentId, 20).replacedBy, 30);   // the rejected line stays on record, replaced
    assert.equal(ind.cases, 160); assert.equal(ind.vehicles, 3);
    // all lines rejected -> still Open (HO action needed), nothing submitted
    const r2 = await run(w, w.u.depot, multiCmd({ allocations: [alloc('C001'), alloc('C002')] }));
    await run(w, w.u.v1, { type: 'vendorRejectItem', id: r2.result.indentId, itemNo: 10, reason: 'busy' });
    await run(w, w.u.v2, { type: 'vendorRejectItem', id: r2.result.indentId, itemNo: 20, reason: 'busy' });
    const i2 = w.db.indents.find((i) => i.id === r2.result.indentId);
    assert.equal(i2.status, 'Open'); assert.equal(i2.escalated, true); assert.equal(i2.cases, 0);
});

test('expiry: a pending line past its time becomes Expired, HO is told, the vendor can no longer submit', async () => {
    const w = world(); const r = await raised(w);
    const later = NOW + 5 * H;                                                               // default timeout is 4 h
    await rejects(run(w, w.u.v1, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 10, units: [unit(1), unit(2)] }, later), 409, /expired/);
    await run(w, w.u.v2, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 20, units: [unit(3)] }, NOW + H);   // answered in time
    const out = engine.sweep(w.db, later);
    assert.equal(out.indentsMoved, 1);
    assert.equal(item(w, r.indentId, 10).status, 'Expired'); assert.equal(item(w, r.indentId, 20).status, 'Submitted');
    assert.equal(w.db.indents[0].status, 'Partly allocated'); assert.equal(w.db.indents[0].escalated, true);
    assert.ok(w.db.notifications.some((n) => n.level === 'crit' && /expired with no answer from Elite Roadways/.test(n.text)));
    assert.equal(engine.sweep(w.db, later + H).indentsMoved, 0);                             // not counted twice
});

test('cancel: every pending line is cancelled, submitted lines cancel their order and shipments, the vendor then gets 409', async () => {
    const w = world(); const r = await raised(w);
    const a = await run(w, w.u.v1, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 10, units: [unit(1), unit(2)] });
    await rejects(run(w, w.u.kol, { type: 'cancelIndent', id: r.indentId }), 403);
    await run(w, w.u.depot, { type: 'cancelIndent', id: r.indentId, reason: 'Plan changed' });
    const ind = w.db.indents[0];
    assert.equal(ind.status, 'Cancelled'); assert.ok(ind.items.every((i) => i.status === 'Cancelled'));
    assert.equal(w.db.orders.find((o) => o.id === a.result.orderId).status, 'Cancelled');
    assert.ok(w.db.shipments.filter((s) => a.result.sins.includes(s.sin)).every((s) => s.status === 'Cancelled'));
    await rejects(run(w, w.u.v2, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 20, units: [unit(3)] }), 409, /cancelled/);
    await rejects(run(w, w.u.depot, { type: 'cancelIndent', id: r.indentId }), 409, /already cancelled/);
    await rejects(run(w, w.u.ho, { type: 'addIndentItem', id: r.indentId, allocation: alloc('C005') }), 409, /cancelled/);
});

test('legacy: single-transporter indents work as before (offer, accept, reject, sweep) and customer is optional', async () => {
    const w = world(); await run(w, w.u.ho, laneCmd());
    const { result } = await run(w, w.u.depot, legacyCmd());
    assert.equal(result.offeredTo, 'C001'); assert.equal(w.db.indents[0].items, undefined);
    await rejects(run(w, w.u.depot, legacyCmd({ customerId: 'nope' })), 400, /customer/i);
    const noCust = await run(w, w.u.depot, legacyCmd({ customerId: undefined }));
    assert.equal(w.db.indents.find((i) => i.id === noCust.result.indentId).customerId, '');
    await rejects(run(w, w.u.v2, { type: 'vendorRespond', id: result.indentId, response: 'accept' }), 409);
    const acc = await run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'accept' });
    assert.ok(acc.result.sin); assert.equal(w.db.indents.find((i) => i.id === result.indentId).status, 'Allocated');
    // the item commands do not apply to a legacy indent
    await rejects(run(w, w.u.v1, { type: 'vendorSubmitItem', id: result.indentId, itemNo: 10, units: [unit(1)] }), 409);
    await rejects(run(w, w.u.ho, { type: 'addIndentItem', id: result.indentId, allocation: alloc('C002') }), 409, /transporter lines/);
    // and the legacy commands do not apply to a multi-transporter indent
    const m = await run(w, w.u.depot, multiCmd());
    await rejects(run(w, w.u.v1, { type: 'vendorRespond', id: m.result.indentId, response: 'accept' }), 409, /transporter lines/);
    await rejects(run(w, w.u.ho, { type: 'offerIndent', id: m.result.indentId, carrierId: 'C002' }), 409, /transporter lines/);
    // legacy vendor view is unchanged
    const lv = engine.scopedDb(w.db, w.u.v1).indents.find((i) => i.id === result.indentId);
    assert.equal(lv.customerId, ''); assert.equal(lv.offers.length, 1);
    // legacy timeout still moves to the next vendor
    const l2 = await run(w, w.u.depot, legacyCmd());
    assert.equal(engine.sweep(w.db, NOW + 5 * H).indentsMoved >= 1, true);
    assert.equal(w.db.indents.find((i) => i.id === l2.result.indentId).offers.length, 2);
});

test('security: the vendor cannot create indents or add lines, and the helper is not a command', async () => {
    const w = world(); const r = await raised(w);
    await rejects(run(w, w.u.v1, multiCmd()), 403);
    await rejects(run(w, w.u.v1, { type: 'addIndentItem', id: r.indentId, allocation: alloc('C005') }), 403);
    await rejects(run(w, w.u.v1, { type: '_myPendingItem', id: r.indentId, itemNo: 20 }), undefined, /./);
    await rejects(run(w, w.u.ho, { type: '_myPendingItem', id: r.indentId, itemNo: 20 }), undefined, /./);
    assert.equal(typeof engine.handlers._myPendingItem, 'undefined');
});

test('carrier e-mail: optional, validated, needs carrier.add; lower-cased', async () => {
    const w = world();
    const ca = { id: 'U30', name: 'CA', email: 'ca@x.com', roles: ['Carrier Administrator'], units: ['UN13'] };
    await rejects(run(w, w.u.depot, { type: 'patchCarrier', id: 'C002', patch: { email: 'a@b.co' } }), 403);
    await rejects(run(w, ca, { type: 'patchCarrier', id: 'C002', patch: { email: 'not an email' } }), 400, /valid e-mail/);
    await run(w, ca, { type: 'patchCarrier', id: 'C002', patch: { email: ' Ops@Gati.Example ' } });
    assert.equal(w.db.carriers.find((c) => c.id === 'C002').email, 'ops@gati.example');
    await run(w, ca, { type: 'patchCarrier', id: 'C002', patch: { email: '' } });
    assert.equal(w.db.carriers.find((c) => c.id === 'C002').email, '');
    await rejects(run(w, ca, { type: 'addCarrier', name: 'New One', email: 'bad' }), 400, /valid e-mail/);
    await run(w, ca, { type: 'addCarrier', name: 'New One', email: 'N@One.Example' });
    assert.equal(w.db.carriers.find((c) => c.name === 'New One').email, 'n@one.example');
});

test('empty customer is tolerated end to end: import of an order without a customer passes, orders and shipments carry \'\'', async () => {
    const w = world();
    const dry = await engine.importData(w.db, { orders: [{ id: 'ORD1', unitId: 'UN13', customerId: '', stops: [{ type: 'P', locId: 'GAU', at: iso(NOW) }, { type: 'D', locId: 'CCU', at: iso(NOW) }] }] }, w.u.admin, true);
    assert.equal(dry.ok, true, JSON.stringify(dry.errors));
    const bad = await engine.importData(w.db, { orders: [{ id: 'ORD2', unitId: 'UN13', customerId: 'ghost', stops: [] }] }, w.u.admin, true);
    assert.equal(bad.ok, false); assert.match(bad.errors.join(' '), /unknown customer ghost/);
    const r = await raised(w);
    await run(w, w.u.v1, { type: 'vendorSubmitItem', id: r.indentId, itemNo: 10, units: [unit(1), unit(2)] });
    const reports = require('../tmsReports');
    const ctx = engine.scopedDb(w.db, w.u.admin, true);
    const names = Object.values(reports.catalog()).flat();
    assert.ok(names.length > 30);
    let produced = 0;
    for (const name of names) { const rows = reports.run(name, ctx, NOW); assert.ok(Array.isArray(rows), `${name} returned no rows array`); produced += rows.length; }   // none throws on an order / shipment with no customer
    assert.ok(produced > 0);
});
