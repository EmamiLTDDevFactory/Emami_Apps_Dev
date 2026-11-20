const test = require('node:test');
const assert = require('node:assert/strict');

process.env.HUB_AUTH_JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';
delete process.env.TMS_SAP_ODATA_BASE;
const engine = require('../tmsEngine');
const reports = require('../tmsReports');
const sap = require('../tmsSap');
const { createService, memoryStore } = require('../tms')._test;

const NOW = Date.parse('2026-11-19T10:00:00Z');
const H = 3600_000;
const iso = (t) => new Date(t).toISOString();

function world() {
    const db = engine.emptyDb();
    db.units = [{ id: 'UN13', code: 'UN13', name: 'Guwahati', division: 'East', city: 'Guwahati' }, { id: 'UN01', code: 'UN01', name: 'Kolkata', division: 'East', city: 'Kolkata' }];
    db.locs = [{ id: 'GAU', city: 'Guwahati', state: 'Assam', zone: 'NE', lat: 26.14, lon: 91.74, pincode: '781101' }, { id: 'CCU', city: 'Kolkata', state: 'West Bengal', zone: 'East', lat: 22.57, lon: 88.36, pincode: '700001' }, { id: 'DEL', city: 'Delhi', state: 'Delhi', zone: 'North', lat: 28.61, lon: 77.21, pincode: '110001' }];
    db.customers = [{ id: 'K1', name: 'Reliance Retail', rCode: 'R1', zone: 'East', contact: '', csl: '', segment: 'MT' }];
    db.carriers = [{ id: 'C001', name: 'Elite Roadways', code: '100200', type: 'Asset', shortName: 'ELITE', paymentTerms: 'Net 30', weightage: 50, blocked: false, rating: 4, fleet: 10, lanes: [], rejectionPct: 0, fulfilledPct: 90 },
        { id: 'C002', name: 'Gati Freight', code: '100207', type: 'Asset', shortName: 'GATI', paymentTerms: 'Net 30', weightage: 50, blocked: false, rating: 4, fleet: 10, lanes: [], rejectionPct: 0, fulfilledPct: 90 },
        { id: 'C003', name: 'Blocked Co', code: '100999', type: 'Broker', shortName: 'BLK', paymentTerms: 'Net 30', weightage: 0, blocked: true, rating: 1, fleet: 1, lanes: [], rejectionPct: 0, fulfilledPct: 50 }];
    const mk = (id, name, roles, units = ['UN13'], extra = {}) => ({ id, name, email: `${id.toLowerCase()}@emamigroup.com`, designation: '', roles, units, lastSignin: '', ...extra });
    const users = { admin: mk('U1', 'Admin', ['Admin'], ['UN13', 'UN01']), alloc: mk('U2', 'Alloc', ['Allocation Executive']), fin1: mk('U3', 'Fin1', ['Finance Executive']), fin2: mk('U4', 'Fin2', ['Finance Administrator']), ct: mk('U5', 'CT', ['Control Tower']), mkt: mk('U6', 'Mkt', ['Marketing']), kol: mk('U7', 'Kol', ['Allocation Executive'], ['UN01']), vendor: mk('U8', 'Vendor', ['Carrier Vendor'], ['UN13'], { carrierId: 'C001' }), vendor2: mk('U9', 'Vendor2', ['Carrier Vendor'], ['UN13'], { carrierId: 'C002' }) };
    db.users = Object.values(users);
    return { db, u: users };
}
const orderCmd = (over = {}) => ({ type: 'createOrder', unitId: 'UN13', customerId: 'K1', mode: 'FTL', basis: 'Vehicle', vehicleType: 'CONT15MT', vehicles: 1, material: 'Talc', qty: 12, packages: 100, stops: [{ type: 'P', locId: 'GAU', at: iso(NOW + 8 * H) }, { type: 'D', locId: 'CCU', at: iso(NOW + 40 * H) }], ...over });
const run = (w, user, cmd, deps = {}, now = NOW) => engine.apply(w.db, cmd, user, deps, now);
const rejects = (p, status, re) => assert.rejects(p, (e) => e instanceof engine.EngineError && (status === undefined || e.status === status) && (!re || re.test(e.message)));

async function toAssigned(w, vehicle = 'AS01AB1234') {
    const { result } = await run(w, w.u.alloc, orderCmd());
    await run(w, w.u.alloc, { type: 'allocate', orderId: result.orderId, carrierId: 'C001', price: 30000 });
    const sin = w.db.shipments[0].sin;
    await run(w, w.u.ct, { type: 'assign', sin, vehicleNo: vehicle, driver: 'Ramesh', phone: '9876543210' });
    return { orderId: result.orderId, sin };
}

test('permissions: a Marketing user cannot post orders; Allocation Executive can', async () => {
    const w = world();
    await rejects(run(w, w.u.mkt, orderCmd()), 403, /permission/);
    const r = await run(w, w.u.alloc, orderCmd());
    assert.match(r.result.orderId, /^ORD/);
});

test('unit scope: a Kolkata-only user cannot touch a Guwahati order or post into UN13', async () => {
    const w = world();
    await rejects(run(w, w.u.kol, orderCmd({ unitId: 'UN13' })), 403, /unit/);
    const { result } = await run(w, w.u.alloc, orderCmd());
    await rejects(run(w, w.u.kol, { type: 'orderAction', id: result.orderId, action: 'cancel' }), 403);
    assert.equal(engine.scopedDb(w.db, w.u.kol).orders.length, 0);
    assert.equal(engine.scopedDb(w.db, w.u.alloc).orders.length, 1);
});

test('order validation: bad stops, same pickup/delivery, unknown customer, silly quantities', async () => {
    const w = world();
    await rejects(run(w, w.u.alloc, orderCmd({ stops: [{ type: 'P', locId: 'GAU', at: iso(NOW) }] })), 400, /pickup and one delivery/);
    await rejects(run(w, w.u.alloc, orderCmd({ stops: [{ type: 'P', locId: 'GAU', at: iso(NOW) }, { type: 'D', locId: 'GAU', at: iso(NOW) }] })), 400, /differ/);
    await rejects(run(w, w.u.alloc, orderCmd({ customerId: 'nope' })), 400, /customer/i);
    await rejects(run(w, w.u.alloc, orderCmd({ qty: -5 })), 400, /Quantity/);
    await rejects(run(w, w.u.alloc, orderCmd({ vehicles: 1000 })), 400, /Vehicles/);
    await rejects(run(w, w.u.alloc, orderCmd({ stops: [{ type: 'P', locId: 'XXX', at: iso(NOW) }, { type: 'D', locId: 'CCU', at: iso(NOW) }] })), 400, /location/i);
});

test('lifecycle: allocate -> assign -> advance to Completed, order becomes Fulfilled', async () => {
    const w = world();
    const { sin, orderId } = await toAssigned(w);
    for (let i = 0; i < 5; i++) await run(w, w.u.ct, { type: 'advance', sin });
    assert.equal(w.db.shipments[0].status, 'Completed');
    assert.equal(w.db.orders.find((o) => o.id === orderId).status, 'Fulfilled');
    await rejects(run(w, w.u.ct, { type: 'advance', sin }), 409);
});

test('assign validates the vehicle number and mobile, and refuses a vehicle already on a live shipment', async () => {
    const w = world();
    await toAssigned(w, 'AS01AB1234');
    const { result } = await run(w, w.u.alloc, orderCmd());
    await run(w, w.u.alloc, { type: 'allocate', orderId: result.orderId, carrierId: 'C002' });
    const sin2 = w.db.shipments[0].sin;
    await rejects(run(w, w.u.ct, { type: 'assign', sin: sin2, vehicleNo: 'bad', driver: 'x', phone: '9876543210' }), 400, /registration/);
    await rejects(run(w, w.u.ct, { type: 'assign', sin: sin2, vehicleNo: 'AS02AB1111', driver: 'x', phone: '12345' }), 400, /mobile/);
    await rejects(run(w, w.u.ct, { type: 'assign', sin: sin2, vehicleNo: 'AS01AB1234', driver: 'x', phone: '9876543210' }), 409, /already/);
});

test('blocked carrier cannot be allocated', async () => {
    const w = world();
    const { result } = await run(w, w.u.alloc, orderCmd());
    await rejects(run(w, w.u.alloc, { type: 'allocate', orderId: result.orderId, carrierId: 'C003' }), 409, /blocked/);
});

test('patchShipment only changes whitelisted fields; consent needs sim.manage; ePOD must be uploaded before verified', async () => {
    const w = world();
    const { sin } = await toAssigned(w);
    await rejects(run(w, w.u.ct, { type: 'patchShipment', sin, patch: { freight: 1 } }), 403, /cannot be changed/);
    await rejects(run(w, w.u.ct, { type: 'patchShipment', sin, patch: { status: 'Completed' } }), 403);
    await rejects(run(w, w.u.alloc, { type: 'patchShipment', sin, patch: { consent: 'Granted' } }), 403, /SIM/);
    await run(w, w.u.ct, { type: 'patchShipment', sin, patch: { consent: 'Granted' } });
    assert.equal(w.db.shipments[0].tracking, 'Active');
    await rejects(run(w, w.u.ct, { type: 'patchShipment', sin, patch: { ePod: 'Uploaded' } }), 409, /delivered/);
    for (let i = 0; i < 5; i++) await run(w, w.u.ct, { type: 'advance', sin });
    await rejects(run(w, w.u.ct, { type: 'patchShipment', sin, patch: { ePod: 'Verified' } }), 409, /Upload/);
    await run(w, w.u.ct, { type: 'patchShipment', sin, patch: { ePod: 'Uploaded' } });
    await run(w, w.u.ct, { type: 'patchShipment', sin, patch: { ePod: 'Verified' } });
    assert.equal(w.db.shipments[0].ePod, 'Verified');
});

test('commands cannot smuggle prototype keys or unknown types', async () => {
    const w = world();
    await rejects(run(w, w.u.admin, { type: 'constructor' }), 400);
    await rejects(run(w, w.u.admin, { type: '__proto__' }), 400);
    await rejects(run(w, w.u.admin, { type: 'nope' }), 400);
    await rejects(run(w, w.u.admin, null), 400);
});

// ------------------------------------------------------------------ bidding
async function bidOrder(w) {
    const { result } = await run(w, w.u.alloc, orderCmd({ mode: 'BID', bid: { startPrice: 30000, expiresAt: iso(NOW + 4 * H), diffType: 'Percentage', diffValue: 1, paymentTerms: 'Net 30', vendors: ['C001', 'C002', 'C003'] } }));
    return result.orderId;
}
test('bid order: blocked vendors are dropped from the invitation; expiry must be in the future', async () => {
    const w = world();
    const id = await bidOrder(w);
    assert.deepEqual(w.db.orders.find((o) => o.id === id).bid.vendors, ['C001', 'C002']);
    await rejects(run(w, w.u.alloc, orderCmd({ mode: 'BID', bid: { startPrice: 1, expiresAt: iso(NOW - H), diffValue: 1, vendors: ['C001'] } })), 400, /future/);
});

test('bidding: step rule, vendor identity, closed auction, uninvited vendor', async () => {
    const w = world();
    const id = await bidOrder(w);
    await run(w, w.u.vendor, { type: 'placeBid', orderId: id, price: 29000 });
    await rejects(run(w, w.u.vendor2, { type: 'placeBid', orderId: id, price: 28900 }), 400, /below/);
    await run(w, w.u.vendor2, { type: 'placeBid', orderId: id, price: 28000 });
    // a vendor cannot bid as another carrier even if the request says so
    await run(w, w.u.vendor, { type: 'placeBid', orderId: id, price: 27000, carrierId: 'C002' });
    const bids = w.db.orders.find((o) => o.id === id).bid.bids;
    assert.deepEqual(bids.map((b) => b.carrierId), ['C001', 'C002', 'C001']);
    await rejects(run(w, w.u.vendor, { type: 'placeBid', orderId: id, price: 20000 }, {}, NOW + 5 * H), 409, /closed/);
    const w2 = world(); w2.db.carriers.push({ ...w2.db.carriers[0], id: 'C009' }); w2.u.vendor.carrierId = 'C009'; const id2 = await bidOrder(w2);
    await rejects(run(w2, w2.u.vendor, { type: 'placeBid', orderId: id2, price: 100 }), 403, /not invited/);
});

test('vendors see only their own bids and the lowest price; never customer, PO or other vendors', async () => {
    const w = world();
    const id = await bidOrder(w);
    await run(w, w.u.vendor, { type: 'placeBid', orderId: id, price: 29000 });
    await run(w, w.u.vendor2, { type: 'placeBid', orderId: id, price: 28000 });
    const v = engine.scopedDb(w.db, w.u.vendor);
    const o = v.orders[0];
    assert.equal(o.bid.bids.length, 1);
    assert.equal(o.bid.lowest, 28000);
    assert.equal(o.customerId, '');
    assert.deepEqual(o.bid.vendors, []);
    assert.equal(v.shipments.length, 0);
    assert.equal(v.invoices.length, 0);
    await rejects(run(w, w.u.vendor, { type: 'createOrder', ...orderCmd() }), 403, /only place bids/);
});

test('award: needs bid.award, creates shipments at the winning price, closes the auction once', async () => {
    const w = world();
    const id = await bidOrder(w);
    await run(w, w.u.vendor, { type: 'placeBid', orderId: id, price: 29000 });
    await rejects(run(w, w.u.fin1, { type: 'awardBid', orderId: id, carrierId: 'C001' }), 403);
    await rejects(run(w, w.u.alloc, { type: 'awardBid', orderId: id, carrierId: 'C002' }), 409, /not bid/);
    const r = await run(w, w.u.alloc, { type: 'awardBid', orderId: id, carrierId: 'C001' });
    assert.equal(r.result.price, 29000);
    assert.equal(w.db.shipments[0].freight, 29000);
    assert.equal(w.db.orders.find((o) => o.id === id).status, 'Active');
    await rejects(run(w, w.u.alloc, { type: 'awardBid', orderId: id, carrierId: 'C001' }), 409, /not open/);
});

test('sweep closes an auction: no bids -> Expired, with bids -> stays awardable and notifies once', () => {
    const w = world();
    const mkBid = (bids) => ({ id: `ORD${Math.random()}`, status: 'Open', mode: 'BID', unitId: 'UN13', stops: [], bid: { startPrice: 1, expiresAt: iso(NOW - H), diffType: 'Percentage', diffValue: 1, vendors: ['C001'], bids, status: 'Open' }, remarks: [] });
    const a = mkBid([]), b = mkBid([{ carrierId: 'C001', price: 5, at: iso(NOW) }]);
    w.db.orders.push(a, b);
    assert.equal(engine.sweep(w.db, NOW).closedAuctions, 2);
    assert.equal(a.bid.status, 'Expired');
    assert.equal(b.bid.status, 'Open');
    assert.equal(engine.sweep(w.db, NOW).closedAuctions, 0);
});

// ------------------------------------------------------------------ accounting + SAP
function invoiceWorld() {
    const w = world();
    w.db.shipments.push({ sin: 'SIN1', orderId: 'O', unitId: 'UN13', status: 'Completed', carrierId: 'C001', freight: 30000, log: [] });
    w.db.invoices.push({ id: 'INV-1', sin: 'SIN1', carrierId: 'C001', unitId: 'UN13', status: 'Pending (Logistics)', amount: 30000, miro: '5105', date: iso(NOW), vehicleNo: 'X', history: [] });
    return w;
}
test('invoice pipeline: each step needs its own permission and the right previous status', async () => {
    const w = invoiceWorld();
    const fakeSap = { postFreightInvoice: async () => ({ docNo: '1900000001' }) };
    await rejects(run(w, w.u.fin2, { type: 'setInvoice', id: 'INV-1', to: 'Pending (Finance)' }), 403);
    await rejects(run(w, w.u.fin1, { type: 'setInvoice', id: 'INV-1', to: 'Approved' }), 403);
    await rejects(run(w, w.u.fin1, { type: 'setInvoice', id: 'INV-1', to: 'Paid' }), 403);
    await run(w, w.u.fin1, { type: 'setInvoice', id: 'INV-1', to: 'Pending (Finance)' });
    await rejects(run(w, w.u.fin2, { type: 'setInvoice', id: 'INV-1', to: 'Billed' }), 409, /Post to SAP/);
    await rejects(run(w, w.u.fin2, { type: 'postInvoiceSap', id: 'INV-1' }, { sap: fakeSap }), 409, /approved/);
    await run(w, w.u.fin2, { type: 'setInvoice', id: 'INV-1', to: 'Approved' });
    await rejects(run(w, w.u.fin1, { type: 'postInvoiceSap', id: 'INV-1' }, { sap: fakeSap }), 403);
    const r = await run(w, w.u.fin2, { type: 'postInvoiceSap', id: 'INV-1' }, { sap: fakeSap });
    assert.equal(r.result.sapDoc, '1900000001');
    assert.equal(w.db.invoices[0].status, 'Billed');
});

test('SAP posting is idempotent: a second post returns the same document and does not call SAP again', async () => {
    const w = invoiceWorld(); w.db.invoices[0].status = 'Approved';
    let calls = 0; const deps = { sap: { postFreightInvoice: async (x) => { calls++; assert.equal(x.extRef, 'TMS-INV-1'); assert.equal(x.vendor, '100200'); return { docNo: '19X' }; } } };
    await run(w, w.u.fin2, { type: 'postInvoiceSap', id: 'INV-1' }, deps);
    const again = await run(w, w.u.fin2, { type: 'postInvoiceSap', id: 'INV-1' }, deps);
    assert.equal(calls, 1);
    assert.equal(again.result.already, true);
});

test('a failing SAP post leaves the invoice Approved (nothing half-done)', async () => {
    const w = invoiceWorld(); w.db.invoices[0].status = 'Approved';
    await assert.rejects(run(w, w.u.fin2, { type: 'postInvoiceSap', id: 'INV-1' }, { sap: { postFreightInvoice: async () => { throw new sap.SapError('SAP is not reachable', 502); } } }), /not reachable/);
    assert.equal(w.db.invoices[0].status, 'Approved');
    assert.equal(w.db.invoices[0].sapDoc, undefined);
});

test('payment sync marks cleared SAP documents Paid', async () => {
    const w = invoiceWorld(); Object.assign(w.db.invoices[0], { status: 'Billed', sapDoc: '19A' });
    const r = await run(w, w.u.fin2, { type: 'syncPayments' }, { sap: { paymentStatus: async () => ({ '19A': { cleared: true, clearingDoc: '15000001' } }) } });
    assert.equal(r.result.paid, 1);
    assert.equal(w.db.invoices[0].status, 'Paid');
});

test('bulk invoice: all-or-nothing when one row is in the wrong state', async () => {
    const w = invoiceWorld();
    w.db.invoices.push({ ...w.db.invoices[0], id: 'INV-2', status: 'Approved', history: [] });
    await rejects(run(w, w.u.fin1, { type: 'bulkInvoice', ids: ['INV-1', 'INV-2'], to: 'Pending (Finance)' }), 409, /INV-2/);
    assert.equal(w.db.invoices[0].status, 'Pending (Logistics)');
});

test('master sync from SAP upserts carriers by vendor code and carries the blocked flag', async () => {
    const w = world();
    await run(w, w.u.admin, { type: 'syncMasters' }, { sap: { vendors: async () => [{ code: '100200', name: 'Elite Roadways Pvt Ltd', paymentTerms: 'Net 45', blocked: true }, { code: '777', name: 'New Carrier', paymentTerms: '', blocked: false }], customers: async () => [{ code: 'R1', name: 'Reliance Retail Ltd', zone: 'East' }] } });
    assert.equal(w.db.carriers.find((c) => c.code === '100200').blocked, true);
    assert.equal(w.db.carriers.find((c) => c.code === '777').name, 'New Carrier');
    assert.equal(w.db.customers[0].name, 'Reliance Retail Ltd');
    await rejects(run(w, w.u.alloc, { type: 'syncMasters' }, {}), 403);
});

// ------------------------------------------------------------------ SAP client (mapping, simulated mode, errors)
test('SAP client: simulated mode is deterministic and flagged; mapping builds the OData body', async () => {
    const a = await sap.postFreightInvoice({ extRef: 'TMS-INV-1' }), b = await sap.postFreightInvoice({ extRef: 'TMS-INV-1' }), c = await sap.postFreightInvoice({ extRef: 'TMS-INV-2' });
    assert.equal(a.simulated, true);
    assert.equal(a.docNo, b.docNo);
    assert.notEqual(a.docNo, c.docNo);
    const body = sap.map.invoiceBody({ extRef: 'E', vendor: '100200', amount: 30000, invoiceDate: '2026-11-19T10:00:00Z', unit: 'UN13', sin: 'S', miro: 'M' });
    assert.deepEqual(body, { ExtRef: 'E', Lifnr: '100200', Amount: '30000.00', Waers: 'INR', InvDate: '/Date(1795046400000)/', Werks: 'UN13', Sin: 'S', Miro: 'M' });
    assert.deepEqual(sap.map.vendor({ Lifnr: '1', Name1: 'A', Zterm: 'Z030', Sperr: 'X' }), { code: '1', name: 'A', paymentTerms: 'Net 30', blocked: true });
    assert.equal(sap.mapError({ error: { message: { value: 'Invoice already posted' } } }, 400).status, 409);
    assert.equal(sap.mapError({}, 500).status, 502);
    assert.equal(sap._test.enc("O'Neil"), "'O''Neil'");
});

test('SAP client live mode: CSRF fetch, then POST with token, URL has sap-client and emamiuser', async () => {
    process.env.TMS_SAP_ODATA_BASE = 'https://gw.example/api/EDS/ZTMS_SRV'; process.env.TMS_SAP_CLIENT = '900';
    const calls = []; const real = global.fetch;
    global.fetch = async (u, init = {}) => {
        calls.push({ u: String(u), method: init.method || 'GET', h: init.headers || {}, body: init.body });
        if (!init.method) return new Response('{}', { status: 200, headers: { 'x-csrf-token': 'TOK' } });
        return new Response(JSON.stringify({ d: { BelnrFi: '1900000042', Gjahr: '2026', Bukrs: '1000' } }), { status: 201 });
    };
    try {
        const r = await sap.postFreightInvoice({ extRef: 'E1', vendor: '100200', amount: 5, invoiceDate: '2026-11-19', unit: 'UN13', sin: 'S', miro: '' }, { email: 'a@emamigroup.com' });
        assert.equal(r.docNo, '1900000042');
        const post = calls.find((c) => c.method === 'POST');
        assert.match(post.u, /FreightInvoiceSet\?sap-client=900&emamiuser=a%40emamigroup\.com/);
        assert.equal(post.h['x-csrf-token'], 'TOK');
        assert.equal(post.h['X-Emami-User'], 'a@emamigroup.com');
    } finally { global.fetch = real; delete process.env.TMS_SAP_ODATA_BASE; delete process.env.TMS_SAP_CLIENT; }
});

// ------------------------------------------------------------------ tracking
async function inTransit(w) {
    const { sin } = await toAssigned(w);
    await run(w, w.u.ct, { type: 'patchShipment', sin, patch: { consent: 'Granted' } });
    await run(w, w.u.ct, { type: 'advance', sin }); // Towards Pickup
    return sin;
}
test('ingest: geofence entry/exit moves Towards Pickup -> At Pickup -> In Transit -> At Delivery', async () => {
    const w = world(); const sin = await inTransit(w);
    const s = () => w.db.shipments[0];
    engine.ingestPing(w.db, { sin, lat: 26.14, lon: 91.74, speed: 0, ts: iso(NOW) }, NOW);
    assert.equal(s().status, 'At Pickup');
    engine.ingestPing(w.db, { sin, lat: 26.14, lon: 91.74, speed: 0, ts: iso(NOW + 60000) }, NOW);
    assert.equal(s().status, 'At Pickup');
    engine.ingestPing(w.db, { sin, lat: 25.0, lon: 90.5, speed: 55, ts: iso(NOW + 3 * H) }, NOW);
    assert.equal(s().status, 'In Transit');
    assert.ok(s().progress > 0.2 && s().progress < 0.8);
    engine.ingestPing(w.db, { sin, lat: 22.57, lon: 88.36, speed: 10, ts: iso(NOW + 12 * H) }, NOW);
    assert.equal(s().status, 'At Delivery');
    assert.equal(s().progress, 1);
    assert.ok(s().log.some((l) => /Geofence entry - arrived at delivery/.test(l.text)));
});

test('ingest: speed and corridor anomalies raise a flag once; stale pings are ignored; bad coordinates rejected', async () => {
    const w = world(); const sin = await inTransit(w);
    const s = w.db.shipments[0]; s.status = 'In Transit'; s.pos = undefined;
    engine.ingestPing(w.db, { sin, lat: 25, lon: 90.5, speed: 120, ts: iso(NOW) }, NOW);
    assert.equal(s.anomaly, 'Speed');
    const n = w.db.notifications.length;
    engine.ingestPing(w.db, { sin, lat: 25, lon: 90.4, speed: 130, ts: iso(NOW + 60000) }, NOW);
    assert.equal(w.db.notifications.length, n);
    engine.ingestPing(w.db, { sin, lat: 25.1, lon: 90.6, speed: 40, ts: iso(NOW + 120000) }, NOW);
    assert.equal(s.anomaly, undefined);
    engine.ingestPing(w.db, { sin, lat: 12.0, lon: 90.5, speed: 40, ts: iso(NOW + 180000) }, NOW);
    assert.equal(s.anomaly, 'Distance');
    assert.equal(engine.ingestPing(w.db, { sin, lat: 25, lon: 90, ts: iso(NOW - H) }, NOW).stale, true);
    assert.throws(() => engine.ingestPing(w.db, { sin, lat: 999, lon: 0 }, NOW), /coordinates/);
    assert.equal(engine.ingestPing(w.db, { sin: 'NOPE', lat: 1, lon: 1 }, NOW).matched, false);
});

test('sweep: GPS gap > 60 min flags a tracking anomaly; e-way bill < 3h warns once; consent older than 30 days expires', async () => {
    const w = world(); const sin = await inTransit(w);
    const s = w.db.shipments[0]; s.status = 'In Transit'; s.pos = { lat: 25, lon: 90, at: iso(NOW - 2 * H), speed: 40, source: 'GPS' };
    s.ewayExpiry = iso(NOW + 2 * H);
    const r = engine.sweep(w.db, NOW);
    assert.equal(r.gaps, 1); assert.equal(r.eway, 1);
    assert.equal(s.anomaly, 'Tracking');
    assert.equal(engine.sweep(w.db, NOW).eway, 0);
    s.consentSince = iso(NOW - 31 * 86400_000);
    engine.sweep(w.db, NOW);
    assert.equal(s.consent, 'Expired');
    assert.equal(sin, s.sin);
});

test('telecom consent callback and ingest through the service', async () => {
    const w = world(); await inTransit(w);
    w.db.shipments[0].consent = 'Pending';
    const svc = createService(Object.assign(memoryStore(w.db)), () => ({}));
    assert.deepEqual(await svc.ingestConsent({ phone: '+91 98765 43210', state: 'Granted' }), { updated: 1 });
    await assert.rejects(svc.ingestConsent({ phone: '123', state: 'Granted' }), /required/);
    await assert.rejects(svc.ingestConsent({ phone: '9876543210', state: 'Maybe' }), /required/);
});

// ------------------------------------------------------------------ service / bootstrap / import / reports
test('service: unknown user is refused; first hub Admin is bootstrapped; commands are audited; sessions never leak other units', async () => {
    const w = world(); w.db.users = [];
    const store = memoryStore(w.db); const svc = createService(store, () => ({}));
    await assert.rejects(svc.me({ email: 'who@emamigroup.com', hubRole: 'User' }), /not set up as a TMS user/);
    const me = await svc.me({ email: 'boss@emamigroup.com', hubRole: 'Admin' });
    assert.deepEqual(me.user.roles, ['Admin']);
    await assert.rejects(svc.me({ email: 'late@emamigroup.com', hubRole: 'Admin' }), /not set up/);
    const out = await svc.run({ email: 'boss@emamigroup.com', hubRole: 'Admin' }, orderCmd());
    assert.match(out.result.orderId, /^ORD/);
    assert.equal(out.db.orders.length, 1);
    assert.equal(out.db.seq, 0);
    await assert.rejects(svc.run({ email: 'boss@emamigroup.com' }, { type: 'allocate', orderId: 'nope', carrierId: 'C001' }), /not found/);
    assert.ok(store.auditLog.some((a) => a.ok === true) && store.auditLog.some((a) => a.ok === false));
    const failedDoesNotPersist = store.db.orders.length;
    assert.equal(failedDoesNotPersist, 1);
});

test('service: a rejected command does not persist partial changes', async () => {
    const w = world(); const store = memoryStore(w.db); const svc = createService(store, () => ({}));
    const before = JSON.stringify(store.db);
    await assert.rejects(svc.run({ email: w.u.alloc.email }, orderCmd({ qty: -1 })));
    assert.equal(JSON.stringify(store.db), before);
});

test('import: dry run reports referential problems; a clean import merges by key', () => {
    const w = world();
    const bad = engine.importData(w.db, { shipments: [{ sin: 'S1', orderId: 'GHOST', carrierId: 'C001', status: 'Weird' }], orders: [{ id: 'O1', unitId: 'UNX', customerId: 'K1', stops: [{ locId: 'GAU' }] }, { id: 'O1' }] });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /duplicate id O1/.test(e)));
    assert.ok(bad.errors.some((e) => /unknown unit UNX/.test(e)));
    assert.ok(bad.errors.some((e) => /unknown order GHOST/.test(e)));
    assert.ok(bad.errors.some((e) => /bad status/.test(e)));
    assert.equal(w.db.orders.length, 0);
    const good = { orders: [{ id: 'O9', unitId: 'UN13', customerId: 'K1', stops: [{ type: 'P', locId: 'GAU', at: iso(NOW) }, { type: 'D', locId: 'CCU', at: iso(NOW) }], remarks: [] }], shipments: [{ sin: 'S9', orderId: 'O9', carrierId: 'C001', status: 'Completed', unitId: 'UN13' }], invoices: [{ id: 'I9', sin: 'S9', status: 'Paid' }] };
    assert.equal(engine.importData(w.db, good, { dryRun: true }).dryRun, true);
    assert.equal(w.db.orders.length, 0);
    assert.equal(engine.importData(w.db, good).ok, true);
    assert.deepEqual([w.db.orders.length, w.db.shipments.length, w.db.invoices.length], [1, 1, 1]);
    assert.equal(engine.importData(w.db, good).ok, true);
    assert.equal(w.db.orders.length, 1);
    assert.equal(engine.importData(w.db, { orders: 'x' }).ok, false);
});

test('reports: 40+ in 8 categories; every one runs on an empty and on a populated database; unknown name is null', async () => {
    assert.ok(reports.count() >= 40, `only ${reports.count()}`);
    assert.equal(Object.keys(reports.catalog()).length, 8);
    const w = world(); await toAssigned(w); w.db.invoices.push({ id: 'I', sin: w.db.shipments[0].sin, carrierId: 'C001', unitId: 'UN13', status: 'Approved', amount: 1, miro: '', date: iso(NOW), history: [] });
    for (const names of Object.values(reports.catalog())) for (const n of names) {
        assert.ok(Array.isArray(reports.run(n, engine.emptyDb(), NOW)), `${n} on empty`);
        assert.ok(Array.isArray(reports.run(n, w.db, NOW)), `${n} on data`);
    }
    assert.equal(reports.run('constructor', w.db, NOW), null);
    assert.equal(reports.run('Shipment Summary', w.db, NOW).length, 1);
});

test('user admin: only user.manage; a vendor user needs a carrier; roles and units are validated', async () => {
    const w = world();
    const u = { name: 'New', email: 'new@emamigroup.com', roles: ['Allocation Executive'], units: ['UN13'] };
    await rejects(run(w, w.u.alloc, { type: 'saveUser', user: u }), 403);
    await rejects(run(w, w.u.admin, { type: 'saveUser', user: { ...u, roles: ['Root'] } }), 400, /one role/);
    await rejects(run(w, w.u.admin, { type: 'saveUser', user: { ...u, roles: ['Carrier Vendor'] } }), 400, /linked to a carrier/);
    await rejects(run(w, w.u.admin, { type: 'saveUser', user: { ...u, email: 'nope' } }), 400, /email/);
    await run(w, w.u.admin, { type: 'saveUser', user: u });
    assert.equal(w.db.users.find((x) => x.email === 'new@emamigroup.com').roles[0], 'Allocation Executive');
    assert.equal(engine.scopedDb(w.db, w.u.alloc).users.every((x) => x.email === ''), true);
});

test('carrier admin: block / weightage / lanes need their own permission; unknown fields refused', async () => {
    const w = world();
    const ca = { id: 'U20', name: 'CA', email: 'ca@x.com', roles: ['Carrier Administrator'], units: ['UN13'] };
    await rejects(run(w, w.u.alloc, { type: 'patchCarrier', id: 'C001', patch: { blocked: true } }), 403);
    await rejects(run(w, ca, { type: 'patchCarrier', id: 'C001', patch: { rating: 5 } }), 403, /cannot be changed/);
    await rejects(run(w, ca, { type: 'patchCarrier', id: 'C001', patch: { weightage: 500 } }), 400);
    await run(w, ca, { type: 'patchCarrier', id: 'C001', patch: { blocked: true, lanes: ['gau-ccu'] } });
    assert.equal(w.db.carriers[0].blocked, true);
    assert.deepEqual(w.db.carriers[0].lanes, ['GAU-CCU']);
});
