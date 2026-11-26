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
    assert.equal(Object.keys(reports.catalog()).length, 9);
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

// ------------------------------------------------------------------ Outward tracking, slice 1: lanes, indents, vendor offers
function outwardWorld() {
    const w = world();
    w.db.vehicleTypes = [{ code: 'CONT15MT', name: '15 MT container', maxWeightKg: 15000, maxVolumeM3: 60 }];
    const mk = (id, name, roles, extra = {}) => ({ id, name, email: `${id.toLowerCase()}@x.com`, designation: '', roles, units: ['UN13'], lastSignin: '', ...extra });
    w.u.depot = mk('U20', 'Depot', ['Depot User']);
    w.u.ho = mk('U21', 'HO', ['HO Logistics']);
    w.u.v1 = mk('U22', 'Vendor1', ['Carrier Vendor'], { carrierId: 'C001', units: [] });
    w.u.v2 = mk('U23', 'Vendor2', ['Carrier Vendor'], { carrierId: 'C002', units: [] });
    w.db.users.push(w.u.depot, w.u.ho, w.u.v1, w.u.v2);
    return w;
}
const laneCmd = () => ({ type: 'upsertLane', fromLocId: 'GAU', toLocId: 'CCU', distanceKm: 1030, transitH: 30, vendors: [{ carrierId: 'C001', priority: 1, rate: 41000 }, { carrierId: 'C002', priority: 2, rate: 43000 }, { carrierId: 'C003', priority: 3, rate: 40000 }] });
const indentCmd = (over = {}) => ({ type: 'createIndent', unitId: 'UN13', customerId: 'K1', laneId: 'LN-GAU-CCU', vehicleType: 'CONT15MT', requiredAt: iso(NOW + 24 * H), material: 'Talc', qty: 12, deliveries: ['80001234'], ...over });

test('outward: only HO maintains lanes; indents need a known lane and vehicle type', async () => {
    const w = outwardWorld();
    await rejects(run(w, w.u.depot, laneCmd()), 403);
    await run(w, w.u.ho, laneCmd());
    await rejects(run(w, w.u.depot, indentCmd({ laneId: 'nope' })), 400, /lane/i);
    await rejects(run(w, w.u.depot, indentCmd({ vehicleType: 'XX' })), 400, /vehicle type/i);
    await rejects(run(w, w.u.depot, indentCmd({ requiredAt: iso(NOW - H) })), 400, /future/);
    await rejects(run(w, w.u.fin1, indentCmd()), 403);
});

test('outward: vendor accepts -> order + shipment at the lane rate; other vendor cannot respond', async () => {
    const w = outwardWorld(); await run(w, w.u.ho, laneCmd());
    const { result } = await run(w, w.u.depot, indentCmd());
    assert.equal(result.offeredTo, 'C001');
    await rejects(run(w, w.u.v2, { type: 'vendorRespond', id: result.indentId, response: 'accept' }), 409);
    const r = await run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'accept' });
    const ship = w.db.shipments.find((s) => s.sin === r.result.sin);
    assert.equal(ship.carrierId, 'C001'); assert.equal(ship.freight, 41000); assert.equal(ship.status, 'Accepted');
    assert.equal(w.db.indents[0].status, 'Allocated');
    await rejects(run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'accept' }), 409);
});

test('outward: rejection needs a reason, moves to next vendor, skips blocked, then escalates to HO', async () => {
    const w = outwardWorld(); await run(w, w.u.ho, laneCmd());
    const { result } = await run(w, w.u.depot, indentCmd());
    await rejects(run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'reject' }), 400, /reason/);
    const r1 = await run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'reject', reason: 'No vehicle' });
    assert.equal(r1.result.next, 'C002');
    const r2 = await run(w, w.u.v2, { type: 'vendorRespond', id: result.indentId, response: 'reject', reason: 'Busy' });
    assert.equal(r2.result.next, null);                       // C003 is blocked
    assert.equal(w.db.indents[0].escalated, true);
    assert.equal(w.db.indents[0].status, 'Open');
});

test('outward: unanswered offer times out to the next vendor via the sweep', async () => {
    const w = outwardWorld(); await run(w, w.u.ho, laneCmd());
    await run(w, w.u.depot, indentCmd());
    assert.equal(engine.sweep(w.db, NOW + 3 * H).indentsMoved, 0);
    assert.equal(engine.sweep(w.db, NOW + 5 * H).indentsMoved, 1);
    const offers = w.db.indents[0].offers;
    assert.deepEqual(offers.map((o) => [o.carrierId, o.response]), [['C001', 'Timed out'], ['C002', 'Pending']]);
    await rejects(run(w, w.u.v1, { type: 'vendorRespond', id: w.db.indents[0].id, response: 'accept' }, {}, NOW + 6 * H), 409);
});

test('outward: vendor view shows only their own offers, without customer detail; vendors cannot send other commands', async () => {
    const w = outwardWorld(); await run(w, w.u.ho, laneCmd());
    await run(w, w.u.depot, indentCmd());
    const v1 = engine.scopedDb(w.db, w.u.v1), v2 = engine.scopedDb(w.db, w.u.v2);
    assert.equal(v1.indents.length, 1); assert.equal(v1.indents[0].customerId, ''); assert.equal(v1.indents[0].offers.length, 1);
    assert.equal(v2.indents.length, 0);
    await rejects(run(w, w.u.v1, indentCmd()), 403);
    await rejects(run(w, w.u.v1, { type: 'cancelIndent', id: w.db.indents[0].id }), 403);
});

test('outward: cancelling an allocated indent cancels its order and shipment', async () => {
    const w = outwardWorld(); await run(w, w.u.ho, laneCmd());
    const { result } = await run(w, w.u.depot, indentCmd());
    const r = await run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'accept' });
    await run(w, w.u.depot, { type: 'cancelIndent', id: result.indentId, reason: 'Customer changed plan' });
    assert.equal(w.db.shipments.find((s) => s.sin === r.result.sin).status, 'Cancelled');
    await rejects(run(w, w.u.depot, { type: 'cancelIndent', id: result.indentId }), 409);
});

// ------------------------------------------------------------------ Outward tracking, slices 2-6: trip lifecycle
const { checkFile } = require('../tmsTrips');
const PDF = Buffer.from('%PDF-1.4 test').toString('base64');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('xxxxxxxx')]).toString('base64');
const pdf = { name: 'pod.pdf', mime: 'application/pdf', dataBase64: PDF };
function depsOf(w, over = {}) {
    const files = new Map();
    return {
        files: { async put(f) { const id = `F${files.size + 1}`; files.set(id, f); return id; }, async get(id) { return files.get(id); } },
        ulip: { simulated: () => false, async validateVehicle(v) { return /0000$/.test(v) ? { ok: false, issues: ['insurance expired'] } : { ok: true, issues: [], details: { rc: '2030-01-01' } }; }, async track() { return []; } },
        sap: {
            async deliveries(nos) { return { simulated: false, rows: nos.filter((n) => n !== '999999').map((n) => ({ no: n, plant: 'UN13', shipTo: 'Shop', cartons: 100, weightKg: 6000, volumeM3: 25 })) }; },
            async shipment(no) { return { no, serviceAgent: '100200', deliveries: ['80001234', '80001235'], cost: { net: 40000, tax: 2000, currency: 'INR', status: 'C' } }; },
            async lanes() { return [{ fromLoc: 'GAU', toLoc: 'CCU', vendor: '100200', rate: 41000, distanceKm: 1030, transitH: 30, priority: 1, condRecord: '11' }, { fromLoc: 'GAU', toLoc: 'XXX', vendor: '100200', rate: 1, distanceKm: 1, transitH: 1, priority: 1, condRecord: '12' }]; },
        },
        ...over,
    };
}
async function assigned(w, d, veh = 'AS01AB1234') {
    await run(w, w.u.ho, laneCmd());
    const { result } = await run(w, w.u.depot, indentCmd(), d);
    const r = await run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'accept' }, d);
    await run(w, w.u.v1, { type: 'vendorAssign', sin: r.result.sin, vehicleNo: veh, driver: 'Ramesh', phone: '9876543210', driverConsent: true }, d);
    return r.result.sin;
}
async function loaded(w, d) {
    const sin = await assigned(w, d);
    await run(w, w.u.depot, { type: 'linkDeliveries', sin, deliveries: ['80001234', '80001235'] }, d);   // 12000 kg of 15000 = 80 %
    await run(w, w.u.depot, { type: 'linkShipment', sin, eccShipmentNo: '600012345' }, d);
    await run(w, w.u.depot, { type: 'loadingCheck', sin }, d);
    return sin;
}
const ship = (w, sin) => w.db.shipments.find((s) => s.sin === sin);

test('trip: full flow indent -> POD -> invoice inside tolerance, with mail request and recipient link', async () => {
    const w = outwardWorld(), d = depsOf(w);
    w.db.settings = { invoiceMailbox: 'freight@emami.test' };
    const sin = await loaded(w, d);
    assert.equal(ship(w, sin).loading.approval, 'NotNeeded');
    const dep = await run(w, w.u.v1, { type: 'vendorDepart', sin, lrNo: 'lr-100', sealNo: 'S1' }, d, NOW + 2 * H);
    assert.match(dep.result.trackToken, /^[0-9a-f]{32}$/);
    assert.equal(ship(w, sin).status, 'In Transit');
    await run(w, w.u.v1, { type: 'vendorCheckpoint', sin, locId: 'CCU', at: iso(NOW + 20 * H) }, d, NOW + 21 * H);
    const pub = w.db.trips ? null : engine.trips.publicTrack(w.db, dep.result.trackToken, NOW + 21 * H);
    assert.equal(pub.from, 'Guwahati'); assert.equal(pub.vehicle, 'AS01••1234'); assert.equal(pub.driver, undefined);
    await rejects(run(w, w.u.depot, { type: 'recordReceipt', sin, cartonsReceived: 250 }, d, NOW + 30 * H), 400, /remark/);
    await run(w, w.u.depot, { type: 'recordReceipt', sin, cartonsReceived: 198, damagedQty: 2, unloadingCharge: 500, remarks: 'Unloaded by labour' }, d, NOW + 30 * H);
    await rejects(run(w, w.u.v1, { type: 'vendorInvoice', sin, invoiceNo: 'A1', invoiceDate: iso(NOW), amount: 42000, lrNo: 'LR-100', file: pdf }, d, NOW + 31 * H), 409, /POD/);
    await rejects(run(w, w.u.v1, { type: 'vendorUploadPod', sin, file: { ...pdf, mime: 'image/png' } }, d, NOW + 31 * H), 400, /does not match/);
    await run(w, w.u.v1, { type: 'vendorUploadPod', sin, file: pdf }, d, NOW + 31 * H);
    assert.equal(ship(w, sin).status, 'Completed');
    await run(w, w.u.depot, { type: 'approveCharges', sin, approve: true }, d, NOW + 31 * H).catch((e) => assert.equal(e.status, 403)); // depot user is not the head
    w.u.head = { id: 'U30', name: 'Head', email: 'h@x.com', designation: '', roles: ['Depot Head'], units: ['UN13'], lastSignin: '' };
    await run(w, w.u.head, { type: 'approveCharges', sin, approve: true }, d, NOW + 31 * H);
    await rejects(run(w, w.u.v1, { type: 'vendorInvoice', sin, invoiceNo: 'A1', invoiceDate: iso(NOW), amount: 42500, lrNo: 'WRONG', file: pdf }, d, NOW + 32 * H), 409, /LR/);
    const inv = await run(w, w.u.v1, { type: 'vendorInvoice', sin, invoiceNo: 'A1', invoiceDate: iso(NOW), amount: 42500, lrNo: 'LR-100', file: pdf }, d, NOW + 32 * H);
    assert.equal(inv.result.within, true);                  // expected 40000 + 2000 tax + 500 approved charge = 42500
    assert.equal(inv.result.mailRequest.to, 'freight@emami.test');
    await rejects(run(w, w.u.v1, { type: 'vendorInvoice', sin, invoiceNo: 'A2', invoiceDate: iso(NOW), amount: 42500, lrNo: 'LR-100', file: pdf }, d, NOW + 32 * H), 409, /already exists/);
});

test('trip: vendor assignment rules (consent, ULIP, duplicate vehicle, ownership)', async () => {
    const w = outwardWorld(), d = depsOf(w);
    await run(w, w.u.ho, laneCmd());
    const { result } = await run(w, w.u.depot, indentCmd(), d);
    const r = await run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'accept' }, d);
    const base = { type: 'vendorAssign', sin: r.result.sin, vehicleNo: 'AS01AB1234', driver: 'R', phone: '9876543210' };
    await rejects(run(w, w.u.v1, { ...base, driverConsent: false }, d), 400, /consent/);
    await rejects(run(w, w.u.v1, { ...base, driverConsent: true, vehicleNo: 'AS01AB0000' }, d), 422, /insurance/);
    await rejects(run(w, w.u.v1, { ...base, driverConsent: true, phone: '12345' }, d), 400, /mobile/);
    await rejects(run(w, w.u.v2, { ...base, driverConsent: true }, d), 403);
    await run(w, w.u.v1, { ...base, driverConsent: true }, d);
    assert.equal(w.db.indents[0].status, 'Vehicle Assigned');
    assert.equal(ship(w, r.result.sin).driverConsent.version, 'v1');
    // a second trip cannot use the same vehicle while it is live
    const i2 = await run(w, w.u.depot, indentCmd(), d);
    const r2 = await run(w, w.u.v1, { type: 'vendorRespond', id: i2.result.indentId, response: 'accept' }, d);
    await rejects(run(w, w.u.v1, { ...base, sin: r2.result.sin, driverConsent: true }, d), 409, /already on another/);
});

test('trip: loading check - under-load needs reason and approval, over-load only HO, departure gated', async () => {
    const w = outwardWorld(), d = depsOf(w);
    const sin = await assigned(w, d);
    await rejects(run(w, w.u.depot, { type: 'loadingCheck', sin }, d), 409, /deliveries/);
    await run(w, w.u.depot, { type: 'linkDeliveries', sin, deliveries: ['80001234'] }, d);        // 6000 kg = 40 %
    await rejects(run(w, w.u.depot, { type: 'loadingCheck', sin }, d), 400, /minimum/);
    await run(w, w.u.depot, { type: 'loadingCheck', sin, reason: 'Urgent customer order' }, d);
    assert.equal(ship(w, sin).loading.approval, 'Pending');
    await rejects(run(w, w.u.v1, { type: 'vendorDepart', sin, lrNo: 'LR1' }, d), 409, /pending/);
    w.u.head = { id: 'U30', name: 'Head', email: 'h@x.com', designation: '', roles: ['Depot Head'], units: ['UN13'], lastSignin: '' };
    await rejects(run(w, w.u.depot, { type: 'approveLoading', sin, approve: true }, d), 403);
    await run(w, w.u.head, { type: 'approveLoading', sin, approve: true }, d);
    await run(w, w.u.v1, { type: 'vendorDepart', sin, lrNo: 'LR1' }, d);
    // over 100 %
    const w2 = outwardWorld(), d2 = depsOf(w2, { sap: { ...depsOf(w2).sap, async deliveries(nos) { return { simulated: false, rows: nos.map((n) => ({ no: n, plant: 'UN13', shipTo: 'S', cartons: 400, weightKg: 17000, volumeM3: 10 })) }; } } });
    const s2 = await assigned(w2, d2);
    await run(w2, w2.u.depot, { type: 'linkDeliveries', sin: s2, deliveries: ['80001234'] }, d2);
    await rejects(run(w2, w2.u.depot, { type: 'loadingCheck', sin: s2, reason: 'Fits fine' }, d2), 403, /HO/);
    await run(w2, w2.u.ho, { type: 'loadingCheck', sin: s2, reason: 'Approved overload by HO' }, d2);
    assert.equal(ship(w2, s2).loading.approval, 'Approved');
});

test('trip: LR is unique per vendor; deliveries cannot be on two live trips; SAP simulated needs manual figures', async () => {
    const w = outwardWorld(), d = depsOf(w);
    const a = await loaded(w, d);
    await run(w, w.u.v1, { type: 'vendorDepart', sin: a, lrNo: 'LR-7' }, d);
    const b = await assigned(w, d, 'AS02CD5678');
    await rejects(run(w, w.u.depot, { type: 'linkDeliveries', sin: b, deliveries: ['80001234'] }, d), 409, /already on trip/);
    await run(w, w.u.depot, { type: 'linkDeliveries', sin: b, deliveries: ['80009999'] }, d);
    await run(w, w.u.depot, { type: 'loadingCheck', sin: b, reason: 'Short load for urgent order' }, d);
    w.u.head = { id: 'U30', name: 'Head', email: 'h@x.com', designation: '', roles: ['Depot Head'], units: ['UN13'], lastSignin: '' };
    await run(w, w.u.head, { type: 'approveLoading', sin: b, approve: true }, d);
    await rejects(run(w, w.u.v1, { type: 'vendorDepart', sin: b, lrNo: 'lr-7' }, d), 409, /already used/);
    await rejects(run(w, w.u.depot, { type: 'linkDeliveries', sin: b, deliveries: ['999999'] }, d), 404);
    const sim = depsOf(w, { sap: { async deliveries() { return { simulated: true, rows: [] }; } } });
    await rejects(run(w, w.u.depot, { type: 'linkDeliveries', sin: b, deliveries: ['80007777'] }, sim), 400, /not connected/);
    await run(w, w.u.depot, { type: 'linkDeliveries', sin: b, deliveries: ['80007777'], manual: [{ no: '80007777', cartons: 10, weightKg: 100, volumeM3: 1 }] }, sim);
    assert.equal(ship(w, b).deliveries[0].source, 'manual');
});

test('trip: ECC shipment must belong to the trip vendor and to one trip; cost needed', async () => {
    const w = outwardWorld(), d = depsOf(w);
    const sin = await assigned(w, d);
    await rejects(run(w, w.u.depot, { type: 'linkShipment', sin, eccShipmentNo: '12' }, d), 400);
    const other = depsOf(w, { sap: { async shipment() { return { serviceAgent: '100207', deliveries: [], cost: { net: 1 } }; } } });
    await rejects(run(w, w.u.depot, { type: 'linkShipment', sin, eccShipmentNo: '600012345' }, other), 409, /belongs to transporter/);
    const nocost = depsOf(w, { sap: { async shipment() { return { serviceAgent: '100200', deliveries: [], cost: { net: 0 } }; } } });
    await rejects(run(w, w.u.depot, { type: 'linkShipment', sin, eccShipmentNo: '600012345' }, nocost), 409, /no shipment cost/);
    await run(w, w.u.depot, { type: 'linkShipment', sin, eccShipmentNo: '600012345' }, d);
    assert.equal(ship(w, sin).eccCost.net, 40000);
    const s2 = await assigned(w, d, 'AS03EF9999');
    await rejects(run(w, w.u.depot, { type: 'linkShipment', sin: s2, eccShipmentNo: '600012345' }, d), 409, /already linked/);
});

test('trip: invoice outside tolerance goes to review and blocks approval until HO clears it', async () => {
    const w = outwardWorld(), d = depsOf(w);
    const sin = await loaded(w, d);
    await run(w, w.u.v1, { type: 'vendorDepart', sin, lrNo: 'LR-9' }, d, NOW + H);
    await run(w, w.u.depot, { type: 'recordReceipt', sin, cartonsReceived: 200 }, d, NOW + 20 * H);
    await run(w, w.u.v1, { type: 'vendorUploadPod', sin, file: pdf }, d, NOW + 21 * H);
    const r = await run(w, w.u.v1, { type: 'vendorInvoice', sin, invoiceNo: 'B1', invoiceDate: iso(NOW), amount: 50000, lrNo: 'LR-9', file: pdf }, d, NOW + 22 * H);
    assert.equal(r.result.within, false);
    const id = r.result.invoiceId, inv = () => w.db.invoices.find((i) => i.id === id);
    assert.equal(inv().review, 'Under Review');
    await rejects(run(w, w.u.fin1, { type: 'setInvoice', id, to: 'Pending (Finance)' }, d), 409, /review/);
    await rejects(run(w, w.u.fin1, { type: 'reviewFreightInvoice', id, decision: 'approve' }, d), 403);
    await run(w, w.u.ho, { type: 'reviewFreightInvoice', id, decision: 'approve', remark: 'Toll change' }, d);
    await run(w, w.u.fin1, { type: 'setInvoice', id, to: 'Pending (Finance)' }, d);
    // rejection lets the vendor resubmit
    const w2 = outwardWorld(), d2 = depsOf(w2);
    const s2 = await loaded(w2, d2);
    await run(w2, w2.u.v1, { type: 'vendorDepart', sin: s2, lrNo: 'LR-1' }, d2, NOW + H);
    await run(w2, w2.u.depot, { type: 'recordReceipt', sin: s2, cartonsReceived: 200 }, d2, NOW + 20 * H);
    await run(w2, w2.u.v1, { type: 'vendorUploadPod', sin: s2, file: pdf }, d2, NOW + 21 * H);
    const bad = await run(w2, w2.u.v1, { type: 'vendorInvoice', sin: s2, invoiceNo: 'C1', invoiceDate: iso(NOW), amount: 60000, lrNo: 'LR-1', file: pdf }, d2, NOW + 22 * H);
    await run(w2, w2.u.ho, { type: 'reviewFreightInvoice', id: bad.result.invoiceId, decision: 'reject', remark: 'Wrong rate' }, d2);
    assert.equal(w2.db.invoices[0].status, 'Disapproved');
    const again = await run(w2, w2.u.v1, { type: 'vendorInvoice', sin: s2, invoiceNo: 'C2', invoiceDate: iso(NOW), amount: 42000, lrNo: 'LR-1', file: pdf }, d2, NOW + 23 * H);
    assert.equal(again.result.within, true);
});

test('trip: ULIP poll applies events, recomputes ETA; sweep flags unlinked trips; public link expires', async () => {
    const w = outwardWorld();
    const d = depsOf(w, { ulip: { simulated: () => false, async validateVehicle() { return { ok: true }; }, async track() { return [{ lat: 24.8, lon: 91.9, at: iso(NOW + 6 * H), place: 'Toll A' }, { lat: 24.0, lon: 90.9, at: iso(NOW + 12 * H), place: 'Toll B' }]; } } });
    const sin = await loaded(w, d);
    await run(w, w.u.v1, { type: 'vendorDepart', sin, lrNo: 'LR-5', departedAt: iso(NOW) }, d, NOW + H);
    const before = ship(w, sin).etaAt;
    const r = await engine.trips.pollTracking(w.db, NOW + 13 * H, d);
    assert.equal(r.updated, 1);
    assert.equal(ship(w, sin).events.filter((e) => e.source === 'ULIP').length, 2);
    assert.equal(ship(w, sin).pos.source, 'ULIP');
    assert.notEqual(ship(w, sin).etaAt, before);
    assert.equal((await engine.trips.pollTracking(w.db, NOW + 14 * H, d)).updated, 0);   // same events are not applied twice
    const w2 = outwardWorld(), d2 = depsOf(w2);
    const s2 = await assigned(w2, d2);
    assert.equal(engine.sweep(w2.db, NOW + 13 * H).unlinked, 1);
    assert.equal(engine.sweep(w2.db, NOW + 14 * H).unlinked, 0);
    const tok = ship(w, sin).trackToken;
    await run(w, w.u.depot, { type: 'recordReceipt', sin, cartonsReceived: 200 }, d, NOW + 30 * H);
    await run(w, w.u.v1, { type: 'vendorUploadPod', sin, file: pdf }, d, NOW + 31 * H);
    assert.equal(engine.trips.publicTrack(w.db, tok, NOW + 32 * H).status, 'Delivered');
    assert.equal(engine.trips.publicTrack(w.db, tok, NOW + 60 * H).expired, true);
    assert.equal(engine.trips.publicTrack(w.db, 'zz', NOW), null);
    assert.equal(engine.trips.publicTrack(w.db, '0'.repeat(32), NOW), null);
});

test('trip: settings and lane sync from SAP are validated; vendor view never carries the tracking token', async () => {
    const w = outwardWorld(), d = depsOf(w);
    await rejects(run(w, w.u.depot, { type: 'saveSettings', settings: { capacityMinPct: 70 } }, d), 403);
    await rejects(run(w, w.u.ho, { type: 'saveSettings', settings: { capacityMinPct: 500 } }, d), 400);
    await rejects(run(w, w.u.ho, { type: 'saveSettings', settings: { invoiceMailbox: 'not-an-email' } }, d), 400);
    await run(w, w.u.ho, { type: 'saveSettings', settings: { capacityMinPct: 70, invoiceMailbox: 'f@emami.test', consentText: 'New wording' } }, d);
    assert.equal(w.db.settings.capacityMinPct, 70); assert.equal(w.db.settings.consentVersion, 'v2');
    const r = await run(w, w.u.ho, { type: 'syncLanes' }, d);
    // GAU-CCU matches existing locations; the unknown SAP point XXX becomes a location instead of dropping the rate
    assert.equal(r.result.lanes, 2); assert.equal(r.result.locationsAdded, 1); assert.equal(r.result.skippedCount, 0);
    assert.equal(w.db.locs.find((l) => l.id === 'XXX').source, 'sap');
    // a gateway on the old model (no condition record / unit / mode) is refused
    await rejects(run(w, w.u.ho, { type: 'syncLanes' }, { ...d, sap: { ...d.sap, async lanes() { return [{ fromLoc: 'GAU', toLoc: 'CCU', vendor: '100200', rate: 4.9 }]; } } }), 503, /metadata cache/);
    const sin = await loaded(w, d);
    await run(w, w.u.v1, { type: 'vendorDepart', sin, lrNo: 'LR-3' }, d, NOW + H);
    assert.equal(engine.scopedDb(w.db, w.u.v1).shipments[0].trackToken, undefined);
});

test('files: type, size and content are checked', () => {
    assert.throws(() => checkFile({ name: 'a.exe', mime: 'application/x-msdownload', dataBase64: PDF }), /Only PDF/);
    assert.throws(() => checkFile({ name: 'a.pdf', mime: 'application/pdf', dataBase64: PNG }), /does not match/);
    assert.throws(() => checkFile({ name: 'a.pdf', mime: 'application/pdf', dataBase64: Buffer.alloc(4 * 1024 * 1024 + 10, 0x25).toString('base64') }), /4 MB/);
    assert.equal(checkFile({ name: 'ok pod.pdf', mime: 'application/pdf', dataBase64: PDF }).name, 'ok pod.pdf');
});

test('outward: HO can hand an escalated indent to a chosen vendor', async () => {
    const w = outwardWorld(); await run(w, w.u.ho, laneCmd());
    const { result } = await run(w, w.u.depot, indentCmd());
    await run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'reject', reason: 'No' });
    await run(w, w.u.v2, { type: 'vendorRespond', id: result.indentId, response: 'reject', reason: 'No' });
    assert.equal(w.db.indents[0].escalated, true);
    await rejects(run(w, w.u.depot, { type: 'offerIndent', id: result.indentId, carrierId: 'C001' }), 403);
    await rejects(run(w, w.u.ho, { type: 'offerIndent', id: result.indentId, carrierId: 'C003' }), 409);
    await run(w, w.u.ho, { type: 'offerIndent', id: result.indentId, carrierId: 'C001' });
    const r = await run(w, w.u.v1, { type: 'vendorRespond', id: result.indentId, response: 'accept' });
    assert.equal(w.db.shipments.find((s) => s.sin === r.result.sin).freight, 41000);
});

test('lanes from SAP ZB00: mode-wise rates, offers follow the indent vehicle type, per-KG freight estimated on the indent quantity', async () => {
    const w = outwardWorld();
    const row = (o) => ({ fromLoc: 'GUWAHATI', toLoc: 'KOLKATA', vendor: '100200', rate: 4.9, distanceKm: 1030, transitH: 30, priority: 1, route: 'ZGUKOL', routeText: 'Guwahati to Kolkata', sapVehicle: 'RTPKG', vehicleText: 'Rate Per KG',
        rateBasis: 'WEIGHT', shippingType: '01', shippingText: 'Truck', sdabw: 'NORM', shtyp: 'ZSD1', zdays: '', currency: 'INR', perQty: 1, perUnit: 'KG', condTable: 'A973', condRecord: '1', validTo: '9999-12-31', ...o });
    w.db.locs.find((l) => l.id === 'GAU').city = 'Guwahati'; w.db.locs.find((l) => l.id === 'CCU').city = 'Kolkata';
    const rows = [
        row({}),                                                                              // C001, any vehicle, 4.90/KG
        row({ vendor: '100207', rate: 4.5, condRecord: '2' }),                                // C002 cheaper, any vehicle
        row({ vendor: '100207', rate: 4.4, condTable: 'A964', zdays: '5', condRecord: '3' }), // same mode in A964: A973 row wins
        row({ vendor: '100200', sapVehicle: 'FTL9MT', vehicleText: 'Full Truck Load 9 Metric Ton', rateBasis: 'FLAT RATE', rate: 3.8, condRecord: '4' }),
        row({ vendor: '100200', shippingType: '03', shippingText: 'Train', rate: 3.1, condRecord: '5' }),
        row({ vendor: '999999', condRecord: '6' }),                                           // not in the vendor master, no name: skipped
        row({ vendor: '888888', vendorName: 'Lane Only Carrier', rate: 6, condRecord: '8' }),  // outside ZTRP: added from the rate row
        row({ fromLoc: '', toLoc: '', route: 'ZNOPT', condRecord: '7' }),                     // route without stages
    ];
    const d = { ...depsOf(w), sap: { ...depsOf(w).sap, async lanes() { return rows; } } };
    const r = await run(w, w.u.ho, { type: 'syncLanes' }, d);
    assert.equal(r.result.lanes, 1); assert.equal(r.result.rates, 5); assert.equal(r.result.carriersAdded, 1); assert.equal(r.result.skippedCount, 2); assert.equal(r.result.locationsAdded, 0); assert.equal(r.result.vehicleTypesAdded, 1);
    const lane = w.db.lanes.find((l) => l.id === 'LN-GAU-CCU');
    assert.deepEqual(lane.sapRoutes, ['ZGUKOL']);
    const c2 = lane.vendors.find((v) => v.carrierId === 'C002');
    assert.equal(c2.condTable, 'A973'); assert.equal(c2.rate, 4.5); assert.equal(c2.priority, 1);
    assert.equal(lane.vendors.find((v) => v.carrierId === 'C001' && v.sapVehicle === 'RTPKG' && v.shippingType === '01').priority, 2);
    assert.equal(w.db.vehicleTypes.find((v) => v.code === 'FTL9MT').maxWeightKg, 9000);
    assert.equal(w.db.sapTexts.shipping['03'], 'Train');

    // an FTL9MT indent goes first to the FTL9MT rate (C001), a CONT15MT indent to the cheapest any-vehicle truck rate (C002)
    const a = await run(w, w.u.depot, indentCmd({ vehicleType: 'FTL9MT', shippingType: '01' }), d);
    assert.equal(a.result.offeredTo, 'C001'); assert.equal(w.db.indents[0].offers[0].rate, 3.8); assert.equal(w.db.indents[0].offers[0].per, 'KG');
    const b = await run(w, w.u.depot, indentCmd({ shippingType: '01' }), d);
    assert.equal(b.result.offeredTo, 'C002');
    // accept: freight estimated on 12 MT, invoice checked against rate x delivered weight (2 deliveries x 6000 kg)
    const acc = await run(w, w.u.v2, { type: 'vendorRespond', id: b.result.indentId, response: 'accept' }, d);
    const s = w.db.shipments.find((x) => x.sin === acc.result.sin);
    assert.equal(s.freight, 54000); assert.deepEqual(s.freightRate, { rate: 4.5, per: 'KG', currency: 'INR' });

    // a hand-entered vendor row survives the next sync
    await run(w, w.u.ho, { type: 'upsertLane', id: 'LN-GAU-CCU', fromLocId: 'GAU', toLocId: 'CCU', distanceKm: 1030, transitH: 30, vendors: [...lane.vendors, { carrierId: 'C001', priority: 9, rate: 50000, vehicleType: 'CONT15MT' }] });
    await run(w, w.u.ho, { type: 'syncLanes' }, d);
    assert.ok(w.db.lanes.find((l) => l.id === 'LN-GAU-CCU').vendors.some((v) => v.rate === 50000 && v.source === undefined));
});

test('trip invoices (Instavans replacement): checked in SAP, written as TT-<sin>, failures kept for retry, exit on departure, vendor refused', async () => {
    const w = outwardWorld();
    const writes = [];
    const inv = (no, o = {}) => ({ no, delivery: '80001234', plant: 'UN13', date: '2026-11-26', customer: 'K1', customerName: 'Shop', cancelled: false, cases: 6.5, value: 22750, currency: 'INR', grossKg: 71.5, netKg: 65, ttSin: '', ttVehicle: '', instaSin: '', instaVehicle: '', message: '', ...o });
    let sapDown = false;
    const d = depsOf(w, { sap: { ...depsOf(w).sap,
        async tripInvoices(q) { return { simulated: false, rows: [...(q.billing || []), ...(q.deliveries || []).map(() => '4280111664')].map((n) => n === '4280111666' ? inv(n, { message: 'Billing document 4280111666 is cancelled.' }) : n === '4280111667' ? inv(n, { ttSin: 'TT-SIN99', ttVehicle: 'XX01' }) : inv(n, n === '4280111664' ? { instaSin: 'AVQ01134', instaVehicle: 'KA57NC4857' } : {})) }; },
        async writeTripVehicle(v) { if (sapDown) throw new sap.SapError('SAP is not reachable', 502); writes.push(v); return { ok: true, target: 'TRIPTRAIL', message: 'saved' }; } } });
    const sin = await loaded(w, d);
    const s = () => w.db.shipments.find((x) => x.sin === sin);
    const f = await run(w, w.u.depot, { type: 'findTripInvoices', sin }, d);
    assert.equal(f.result.rows[0].no, '4280111664');
    await rejects(run(w, w.u.v1, { type: 'setTripInvoices', sin, invoices: ['4280111664'] }, d), 403);
    await rejects(run(w, w.u.depot, { type: 'setTripInvoices', sin, invoices: ['4280111666'] }, d), 409, /cancelled/);
    await rejects(run(w, w.u.depot, { type: 'setTripInvoices', sin, invoices: ['4280111667'] }, d), 409, /already on Trip Trail vehicle/);
    await rejects(run(w, w.u.depot, { type: 'setTripInvoices', sin, invoices: ['12AB'] }, d), 400);
    const r = await run(w, w.u.depot, { type: 'setTripInvoices', sin, invoices: ['4280111664', '4280111665'] }, d);
    assert.equal(r.result.count, 2); assert.equal(r.result.sap.ok, true);
    assert.equal(writes[0].sin, `TT-${sin}`); assert.deepEqual(writes[0].invoices, ['4280111664', '4280111665']); assert.equal(writes[0].exit, false); assert.equal(writes[0].plant, 'UN13');
    assert.deepEqual(s().invoices[0].instavans, { sin: 'AVQ01134', vehicle: 'KA57NC4857' });
    // SAP down: the list is kept on the trip, the failure is recorded, retry works once SAP is back
    sapDown = true;
    const r2 = await run(w, w.u.depot, { type: 'setTripInvoices', sin, invoices: ['4280111664'] }, d);
    assert.equal(r2.result.sap.ok, false); assert.equal(s().invoices.length, 1);
    sapDown = false;
    await run(w, w.u.depot, { type: 'syncTripVehicle', sin }, d);
    assert.equal(s().sapVehicle.ok, true); assert.deepEqual(writes[writes.length - 1].invoices, ['4280111664']);
    // departure marks the vehicle exited in SAP
    await run(w, w.u.v1, { type: 'vendorDepart', sin, lrNo: 'LR-9' }, d, NOW + H);
    assert.equal(writes[writes.length - 1].exit, true);
});

test('vehicle type: internal cargo size (cm) is all-or-nothing, derives the volume, and survives a save without it', async () => {
    const w = outwardWorld();
    const vt = (o) => ({ type: 'upsertVehicleType', code: 'FTL9MT', name: '9 MT truck', maxWeightKg: 9000, ...o });
    await rejects(run(w, w.u.ho, vt({ maxVolumeM3: 30, lengthCm: 600 })), 400, /length, width and height together/);
    await run(w, w.u.ho, vt({ lengthCm: 600, widthCm: 240, heightCm: 240 }));          // no volume given: 600*240*240 = 34.56 m3
    const a = w.db.vehicleTypes.find((x) => x.code === 'FTL9MT');
    assert.deepEqual([a.lengthCm, a.widthCm, a.heightCm, a.maxVolumeM3], [600, 240, 240, 34.56]);
    await run(w, w.u.ho, vt({ maxVolumeM3: 33 }));                                      // a save without sizes keeps them
    const b = w.db.vehicleTypes.find((x) => x.code === 'FTL9MT');
    assert.deepEqual([b.lengthCm, b.widthCm, b.heightCm, b.maxVolumeM3], [600, 240, 240, 33]);
    await rejects(run(w, w.u.ho, vt({ code: 'NOVOL' })), 400);                          // neither volume nor size
    await run(w, w.u.ho, vt({ code: 'OLD', maxVolumeM3: 20 }));                         // sizes stay optional
    assert.equal(w.db.vehicleTypes.find((x) => x.code === 'OLD').lengthCm, undefined);
});
