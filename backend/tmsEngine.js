/*
   SmarTruck TMS (embedded-apps/smartruck-tms) - the rules. Pure logic over one in-memory database object (the same shape as the app's
   src/lib/types.ts `Db`): no HTTP, no SQL. tms.js loads the database under a lock, calls apply(), and saves it. Everything the demo
   app did in the browser is decided here in live mode, because the browser is not trusted:
     - permissions are checked per action (ROLE_PERMS), and unit scope per row;
     - the actor, ids, timestamps and audit lines come from the server, never from the request;
     - a shipment can only be patched in the fields PATCHABLE; status moves only along FLOW.
   Integrations (SAP OData, telecom consent, e-way bill, notifications) are injected as `deps` so they can be faked in tests.
*/
const FLOW = ['Requested', 'Accepted', 'Assigned', 'Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Completed'];
const LIVE = ['Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery'];
const INV_FLOW = ['Pending (Logistics)', 'Pending (Finance)', 'Approved', 'Billed', 'Ready For Payment', 'Paid'];

const ROLE_PERMS = {
    'Allocation Executive': ['order.create', 'order.allocate', 'order.cancel', 'bid.award', 'plan.view'],
    'Carrier Administrator': ['carrier.add', 'carrier.block', 'carrier.delete', 'carrier.weightage'],
    'Finance Executive': ['inv.approve.l', 'voucher.create'],
    'Finance Administrator': ['inv.approve.f', 'inv.pay', 'note.create'],
    Marketing: ['customer.edit', 'report.view'],
    'Control Tower': ['ship.update', 'sim.manage', 'report.view', 'plan.view'],
    'Carrier Vendor': ['bid.place'],
    'Distribution Planner': ['plan.view', 'plan.run'],
    Admin: ['*'],
};

class EngineError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const fail = (m, s) => { throw new EngineError(m, s); };

const permsOf = (u) => new Set((u.roles || []).flatMap((r) => ROLE_PERMS[r] || []));
const can = (u, p) => { const s = permsOf(u); return s.has('*') || s.has(p); };
const need = (u, p, what) => { if (!can(u, p)) fail(`Your role does not have permission${what ? ` to ${what}` : ''}.`, 403); };
const isAdmin = (u) => (u.roles || []).includes('Admin');
const isVendor = (u) => (u.roles || []).includes('Carrier Vendor') && !!u.carrierId;
const inScope = (u, unitId) => isAdmin(u) || (u.units || []).includes(unitId);
const iso = (t) => new Date(t).toISOString();
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = (v, name, { min = 0, max = 1e9 } = {}) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail(`${name} must be a number between ${min} and ${max}.`); return n; };
const id = (db, prefix) => `${prefix}${++db.seq}`;
const log = (s, at, actor, text) => { s.log = [...(s.log || []), { at: iso(at), actor, text }].slice(-200); };

function emptyDb() {
    return { units: [], locs: [], carriers: [], customers: [], orders: [], shipments: [], invoices: [], vouchers: [], notes: [], users: [], notifications: [], geofences: [], seq: 100000, vehicleTypes: [], lanes: [], indents: [], settings: {} };
}

// ------------------------------------------------------------------------------------------------------------- geometry
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
    const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(x));
}
/** Where on the straight line a->b a point p projects (0..1) and how far p is from that line (km). Good enough for corridor checks between cities. */
function project(a, b, p) {
    const k = Math.cos(rad((a.lat + b.lat) / 2));
    const ax = a.lon * k, bx = b.lon * k, px = p.lon * k;
    const dx = bx - ax, dy = b.lat - a.lat;
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (p.lat - a.lat) * dy) / len2));
    return { t, off: km(p, { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }) };
}

// ------------------------------------------------------------------------------------------------------------- scoping
const lowestBid = (b) => (b.bids.length ? Math.min(...b.bids.map((x) => x.price)) : undefined);
const minStep = (b, low) => (b.diffType === 'Percentage' ? low * (b.diffValue / 100) : b.diffValue);

/** What this user may see. Vendors see only auctions they are invited to, anonymised: their own bids and the current lowest price. */
function scopedDb(db, user, allUnits = false) {
    if (isVendor(user)) {
        const orders = db.orders.filter((o) => o.mode === 'BID' && o.bid && (o.bid.vendors.includes(user.carrierId)))
            .map((o) => ({ ...o, customerId: '', po: '', so: '', project: '', comments: '', remarks: [], bid: { ...o.bid, vendors: [], bids: o.bid.bids.filter((b) => b.carrierId === user.carrierId), lowest: lowestBid(o.bid) } }));
        return { ...emptyDb(), units: db.units, locs: db.locs, orders, indents: outward.vendorIndents(db, user), shipments: db.shipments.filter((s) => s.carrierId === user.carrierId).map((s) => ({ ...s, customerId: '', trackToken: undefined })), invoices: db.invoices.filter((i) => i.carrierId === user.carrierId), users: db.users.filter((u) => u.id === user.id), carriers: db.carriers.filter((c) => c.id === user.carrierId), seq: 0 };
    }
    const ok = (r) => (allUnits || isAdmin(user)) ? (isAdmin(user) || (user.units || []).includes(r.unitId)) : (user.units || []).includes(r.unitId);
    const users = can(user, 'user.manage') ? db.users : db.users.map((u) => ({ id: u.id, name: u.name, designation: u.designation, email: '', units: [], roles: [], lastSignin: '' }));
    outward.ensure(db);
    return { ...db, orders: db.orders.filter(ok), shipments: db.shipments.filter(ok), indents: db.indents.filter(ok), invoices: db.invoices.filter(ok), users, seq: 0 };
}

// ------------------------------------------------------------------------------------------------------------- helpers
const orderOf = (db, oid) => db.orders.find((o) => o.id === oid) || fail('Order not found.', 404);
const shipOf = (db, sin) => db.shipments.find((s) => s.sin === sin) || fail('Shipment not found.', 404);
const invOf = (db, iid) => db.invoices.find((i) => i.id === iid) || fail('Invoice not found.', 404);
const carrierOf = (db, cid) => db.carriers.find((c) => c.id === cid) || fail('Carrier not found.', 404);
const locOf = (db, lid) => db.locs.find((l) => l.id === lid) || fail(`Unknown location ${lid}.`, 400);
const notify = (db, now, level, text) => { db.notifications = [{ id: id(db, 'N'), at: iso(now), level, text, read: false }, ...db.notifications].slice(0, 100); };
const sees = (user, row) => inScope(user, row.unitId) || fail('That record belongs to a unit you are not assigned to.', 403);

function makeShipments(db, o, carrierId, price, now, actor) {
    const p = o.stops.find((s) => s.type === 'P');
    const d = [...o.stops].reverse().find((s) => s.type === 'D');
    const a = locOf(db, p.locId), b = locOf(db, d.locId);
    const dist = Math.round(km(a, b) * 1.28);
    const out = [];
    for (let v = 0; v < o.vehicles; v++) {
        const sin = `SIN${++db.seq}`;
        out.push({
            sin, orderId: o.id, unitId: o.unitId, type: 'Primary', direction: 'Outbound', status: 'Accepted', carrierId, vehicleNo: '—', vehicleType: o.vehicleType, driver: '—', phone: '—',
            provider: 'Jio', consent: 'Pending', tracking: 'No GPS', ePod: 'Pending', freight: price, fromLocId: p.locId, toLocId: d.locId, pickupAt: p.at, progress: 0, delayH: 0, lr: '', km: dist,
            ewayExpiry: iso(new Date(p.at).getTime() + Math.max(24, dist / 40 + 12) * 3600_000), material: o.material, qty: o.qty, customerId: o.customerId,
            log: [{ at: iso(now), actor, text: 'Shipment created by allocation' }, { at: iso(now), actor: 'Carrier', text: 'Carrier accepted shipment' }],
        });
    }
    return out;
}

// ------------------------------------------------------------------------------------------------------------- commands
const PATCHABLE = { consent: ['Granted', 'Pending', 'Expired', 'Declined'], ePod: ['Pending', 'Uploaded', 'Verified'], delayReason: 'text', gpsReason: 'text', ewayNo: 'text' };
const INV_TARGETS = { 'Pending (Logistics)': {}, 'Pending (Finance)': { perm: 'inv.approve.l', from: ['Pending (Logistics)'] }, Disapproved: { perm: 'inv.approve.l', from: ['Pending (Logistics)', 'Pending (Finance)'] },
    Approved: { perm: 'inv.approve.f', from: ['Pending (Finance)'] }, Billed: { perm: 'inv.approve.f', from: ['Approved'], sap: true }, 'Ready For Payment': { perm: 'inv.pay', from: ['Billed'] }, Paid: { perm: 'inv.pay', from: ['Ready For Payment'] } };

const handlers = {
    createOrder(db, c, u, now) {
        need(u, 'order.create', 'post orders');
        if (!inScope(u, c.unitId)) fail('You are not assigned to that unit.', 403);
        if (!db.units.some((x) => x.id === c.unitId)) fail('Unknown unit.');
        if (!db.customers.some((x) => x.id === c.customerId)) fail('Unknown customer.');
        const stops = (Array.isArray(c.stops) ? c.stops : []).map((s) => ({ type: s.type === 'D' ? 'D' : 'P', locId: str(s.locId, 20), at: iso(Date.parse(s.at) || fail('Every stop needs a valid date and time.')) }));
        if (!stops.some((s) => s.type === 'P') || !stops.some((s) => s.type === 'D')) fail('Add at least one pickup and one delivery stop.');
        stops.forEach((s) => locOf(db, s.locId));
        if (stops[0].locId === stops[stops.length - 1].locId) fail('Pickup and delivery locations must differ.');
        const mode = c.mode === 'BID' ? 'BID' : 'FTL';
        const o = {
            id: id(db, 'ORD'), unitId: c.unitId, customerId: c.customerId, mode, basis: ['Vehicle', 'Weight', 'Pallet'].includes(c.basis) ? c.basis : 'Vehicle', vehicleType: str(c.vehicleType, 20), vehicles: num(c.vehicles, 'Vehicles', { min: 1, max: 50 }), stops,
            material: str(c.material), qty: num(c.qty, 'Quantity', { min: 0.1, max: 1000 }), uom: 'MT', packages: num(c.packages ?? 0, 'Packages'), po: str(c.po, 20), so: str(c.so, 20), project: str(c.project, 20), segment: str(c.segment, 30),
            odc: !!c.odc, tolerance: num(c.tolerance ?? 0, 'Tolerance', { max: 100 }), comments: str(c.comments, 500), status: 'Open', createdAt: iso(now), createdBy: u.name, remarks: [],
        };
        o.oin = `OIN-${o.unitId}-${db.seq}`;
        if (mode === 'BID') {
            const b = c.bid || {};
            const vendors = (Array.isArray(b.vendors) ? b.vendors : []).filter((v) => db.carriers.some((x) => x.id === v && !x.blocked));
            if (!vendors.length) fail('A bid order needs at least one eligible vendor.');
            const exp = Date.parse(b.expiresAt);
            if (!(exp > now)) fail('The bidding expiry must be in the future.');
            o.bid = { startPrice: num(b.startPrice, 'Start price', { min: 1 }), expiresAt: iso(exp), diffType: b.diffType === 'Amount' ? 'Amount' : 'Percentage', diffValue: num(b.diffValue, 'Minimum step', { min: 0.01 }), paymentTerms: str(b.paymentTerms, 20), vendors, bids: [], status: 'Open' };
            notify(db, now, 'info', `Bid order ${o.id} posted - ${vendors.length} vendors invited`);
        }
        db.orders.unshift(o);
        return { orderId: o.id, invite: o.bid ? o.bid.vendors : [] };
    },

    orderAction(db, c, u, now) {
        const o = orderOf(db, c.id); sees(u, o);
        if (c.action === 'cancel' || c.action === 'delete') need(u, 'order.cancel', 'cancel orders');
        else if (c.action === 'toBid') need(u, 'order.allocate', 'convert to bid');
        else need(u, 'order.create', 'copy orders');
        if (c.action === 'delete') { if (o.status === 'Active') fail('An active order cannot be deleted; cancel it first.', 409); db.orders = db.orders.filter((x) => x.id !== o.id); return {}; }
        if (c.action === 'cancel') {
            if (['Cancelled', 'Fulfilled'].includes(o.status)) fail(`The order is already ${o.status.toLowerCase()}.`, 409);
            o.status = 'Cancelled'; o.remarks.push(`Cancelled by ${u.name}${c.remark ? `: ${str(c.remark, 200)}` : ''}`);
            if (o.bid && o.bid.status === 'Open') o.bid.status = 'Expired';
            db.shipments.filter((s) => s.orderId === o.id && s.status !== 'Completed').forEach((s) => { s.status = 'Cancelled'; log(s, now, u.name, 'Order cancelled'); });
            return {};
        }
        if (c.action === 'toBid') {
            if (o.status !== 'Open' || o.mode === 'BID') fail('Only an open FTL order can be converted to a bid.', 409);
            o.mode = 'BID';
            o.bid = { startPrice: num(c.startPrice ?? 25000, 'Start price', { min: 1 }), expiresAt: iso(now + 4 * 3600_000), diffType: 'Percentage', diffValue: 1, paymentTerms: 'Net 30', vendors: db.carriers.filter((x) => !x.blocked).map((x) => x.id), bids: [], status: 'Open' };
            return {};
        }
        if (!['duplicate', 'rebook'].includes(c.action)) fail('Unknown order action.');
        const copy = JSON.parse(JSON.stringify(o));
        Object.assign(copy, { id: id(db, 'ORD'), createdAt: iso(now), createdBy: u.name, status: 'Open', mode: 'FTL', bid: undefined, remarks: [c.action === 'rebook' ? `Re-booked from ${o.id}` : `Duplicate of ${o.id}`] });
        copy.oin = `OIN-${copy.unitId}-${db.seq}`;
        db.orders.unshift(copy);
        return { orderId: copy.id };
    },

    addRemark(db, c, u) { const o = orderOf(db, c.id); sees(u, o); o.remarks.push(`${u.name}: ${str(c.text, 300)}`); return {}; },

    allocate(db, c, u, now) {
        need(u, 'order.allocate', 'allocate orders');
        const o = orderOf(db, c.orderId); sees(u, o);
        if (o.status !== 'Open' || o.mode === 'BID') fail('Only an open FTL order can be allocated; bid orders are awarded.', 409);
        const car = carrierOf(db, c.carrierId);
        if (car.blocked) fail('That carrier is blocked.', 409);
        db.shipments.unshift(...makeShipments(db, o, car.id, num(c.price ?? 28000, 'Freight', { min: 1 }), now, u.name));
        o.status = 'Active'; o.remarks.push(`Allocated to ${car.name} by ${u.name}`);
        return {};
    },

    assign(db, c, u, now) {
        if (!(can(u, 'ship.update') || can(u, 'order.allocate') || (isVendor(u)))) fail('Your role does not have permission to assign vehicles.', 403);
        const s = shipOf(db, c.sin); sees(u, s);
        if (s.status !== 'Accepted') fail('Only an accepted shipment can be assigned.', 409);
        const veh = str(c.vehicleNo, 15).toUpperCase().replace(/\s+/g, '');
        if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$/.test(veh)) fail('Enter a valid vehicle registration number, for example AS01AB1234.');
        const phone = str(c.phone, 15).replace(/\D/g, '');
        if (!/^[6-9]\d{9}$/.test(phone)) fail('Enter a valid 10-digit driver mobile number.');
        if (db.shipments.some((x) => x.sin !== s.sin && x.vehicleNo === veh && LIVE.concat('Assigned').includes(x.status))) fail(`Vehicle ${veh} is already on another live shipment.`, 409);
        Object.assign(s, { status: 'Assigned', vehicleNo: veh, driver: str(c.driver, 60) || fail('Driver name is required.'), phone, lr: s.lr || `LR${770000 + ++db.seq}`, consent: 'Pending' });
        log(s, now, u.name, `Vehicle ${veh} and driver ${s.driver} assigned; SIM consent requested`);
        return { consentRequest: { sin: s.sin, phone, provider: s.provider } };
    },

    advance(db, c, u, now) {
        if (!(can(u, 'ship.update') || can(u, 'order.allocate'))) fail('Your role does not have permission to move shipments.', 403);
        const s = shipOf(db, c.sin); sees(u, s);
        const i = FLOW.indexOf(s.status);
        if (i < 2 || i >= FLOW.length - 1) fail('This shipment cannot be advanced from its current status.', 409);
        s.status = FLOW[i + 1];
        if (s.status === 'In Transit') s.progress = Math.max(s.progress, 0.02);
        if (s.status === 'At Delivery' || s.status === 'Completed') s.progress = 1;
        if (s.consent === 'Granted' && s.tracking === 'No GPS') s.tracking = 'Active';
        log(s, now, u.name, `Status moved to ${s.status}`);
        if (s.status === 'Completed') completeOrderIfDone(db, s.orderId);
        return {};
    },

    patchShipment(db, c, u, now) {
        const s = shipOf(db, c.sin); sees(u, s);
        const keys = Object.keys(c.patch || {});
        if (!keys.length) fail('Nothing to change.');
        for (const k of keys) {
            const rule = PATCHABLE[k];
            if (!rule) fail(`The field ${k} cannot be changed.`, 403);
            const v = c.patch[k];
            if (Array.isArray(rule) ? !rule.includes(v) : typeof v !== 'string') fail(`Invalid value for ${k}.`);
            if (k === 'consent') need(u, 'sim.manage', 'manage SIM consent'); else need(u, 'ship.update', 'update shipments');
            if (k === 'ePod' && v === 'Verified' && s.ePod !== 'Uploaded') fail('Upload the ePOD before verifying it.', 409);
            if (k === 'ePod' && s.status !== 'Completed') fail('ePOD applies to delivered shipments only.', 409);
            s[k] = Array.isArray(rule) ? v : str(v, 200);
            if (k === 'consent' && v === 'Granted') { s.consentSince = iso(now); if (s.tracking === 'No GPS' || s.tracking === 'Non-Tracking') s.tracking = 'Active'; }
            if (k === 'consent' && ['Expired', 'Declined'].includes(v)) s.tracking = 'Non-Tracking';
        }
        log(s, now, u.name, str(c.note, 200) || `Updated ${keys.join(', ')}`);
        return keys.includes('consent') && c.patch.consent === 'Pending' ? { consentRequest: { sin: s.sin, phone: s.phone, provider: s.provider } } : {};
    },

    cancelShipment(db, c, u, now) {
        if (!(can(u, 'ship.update') || can(u, 'order.cancel'))) fail('Your role does not have permission to cancel shipments.', 403);
        const s = shipOf(db, c.sin); sees(u, s);
        if (['Completed', 'Cancelled'].includes(s.status)) fail(`The shipment is already ${s.status.toLowerCase()}.`, 409);
        s.status = 'Cancelled'; log(s, now, u.name, 'Shipment cancelled');
        return {};
    },

    placeBid(db, c, u, now) {
        const o = orderOf(db, c.orderId);
        if (!o.bid || o.bid.status !== 'Open') fail('This auction is not open.', 409);
        if (now >= Date.parse(o.bid.expiresAt)) fail('This auction has closed.', 409);
        let carrierId;
        if (isVendor(u)) carrierId = u.carrierId;
        else { need(u, 'bid.award', 'bid on behalf of a vendor'); sees(u, o); carrierId = c.carrierId; }
        if (!o.bid.vendors.includes(carrierId)) fail('That vendor is not invited to this auction.', 403);
        if (carrierOf(db, carrierId).blocked) fail('That vendor is blocked.', 403);
        const price = num(c.price, 'Price', { min: 1 });
        const low = lowestBid(o.bid) ?? o.bid.startPrice;
        const step = minStep(o.bid, low);
        if (price > low - step + 1e-9) fail(`Bid at least ${Math.ceil(step)} below the current lowest (${low}).`);
        o.bid.bids.push({ carrierId, price, at: iso(now) });
        return { lowest: price };
    },

    awardBid(db, c, u, now) {
        need(u, 'bid.award', 'award bids');
        const o = orderOf(db, c.orderId); sees(u, o);
        if (!o.bid || o.bid.status !== 'Open') fail('This auction is not open.', 409);
        const mine = o.bid.bids.filter((b) => b.carrierId === c.carrierId);
        if (!mine.length) fail('That vendor has not bid.', 409);
        const price = Math.min(...mine.map((b) => b.price));
        const car = carrierOf(db, c.carrierId);
        if (car.blocked) fail('That vendor is blocked.', 409);
        db.shipments.unshift(...makeShipments(db, o, car.id, price, now, u.name));
        o.status = 'Active';
        o.bid.status = 'Awarded'; o.bid.winner = car.id; o.bid.awardedPrice = price;
        o.remarks.push(`Bid awarded to ${car.name} at ${price} by ${u.name}; converted to order`);
        notify(db, now, 'info', `${o.id} awarded to ${car.shortName} at ${price}`);
        return { orderId: o.id, winner: car.id, price };
    },

    setInvoice(db, c, u, now) { return setInvoiceStatuses(db, [c.id], c.to, u, now); },
    bulkInvoice(db, c, u, now) { if (!Array.isArray(c.ids) || c.ids.length > 200) fail('Select up to 200 invoices.'); return setInvoiceStatuses(db, c.ids, c.to, u, now); },

    addVoucher(db, c, u, now) {
        need(u, 'voucher.create', 'create payment vouchers');
        carrierOf(db, c.carrierId);
        const v = { id: `PV-${1001 + db.vouchers.length}`, carrierId: c.carrierId, amount: num(c.amount, 'Amount', { min: 1 }), status: 'Draft', date: iso(now), invoices: [] };
        db.vouchers.unshift(v); return { id: v.id };
    },
    addNote(db, c, u, now) {
        need(u, 'note.create', 'raise debit / credit notes');
        carrierOf(db, c.carrierId);
        if (!['Debit', 'Credit'].includes(c.kind)) fail('Note type must be Debit or Credit.');
        if (c.sin) sees(u, shipOf(db, c.sin));
        const n = { id: `${c.kind === 'Debit' ? 'DN' : 'CN'}-${500 + db.notes.length}`, kind: c.kind, carrierId: c.carrierId, amount: num(c.amount, 'Amount', { min: 1 }), reason: str(c.reason, 200) || fail('A reason is required.'), date: iso(now), sin: str(c.sin, 20) };
        db.notes.unshift(n); return { id: n.id };
    },

    patchCarrier(db, c, u) {
        const car = carrierOf(db, c.id); const p = c.patch || {};
        for (const k of Object.keys(p)) {
            if (k === 'blocked') need(u, 'carrier.block', 'block carriers');
            else if (k === 'weightage') need(u, 'carrier.weightage', 'change weightage');
            else if (['lanes', 'shortName', 'paymentTerms'].includes(k)) need(u, 'carrier.add', 'edit carriers');
            else fail(`The field ${k} cannot be changed here.`, 403);
        }
        if ('blocked' in p) car.blocked = !!p.blocked;
        if ('weightage' in p) car.weightage = num(p.weightage, 'Weightage', { max: 100 });
        if ('shortName' in p) car.shortName = str(p.shortName, 20);
        if ('paymentTerms' in p) car.paymentTerms = str(p.paymentTerms, 20);
        if ('lanes' in p) { if (!Array.isArray(p.lanes) || p.lanes.length > 500) fail('Invalid lanes.'); car.lanes = p.lanes.map((l) => str(l, 12).toUpperCase()); }
        return {};
    },
    addCarrier(db, c, u) {
        need(u, 'carrier.add', 'invite carriers');
        const name = str(c.name, 80) || fail('Carrier name is required.');
        if (db.carriers.some((x) => x.name.toLowerCase() === name.toLowerCase())) fail('A carrier with that name already exists.', 409);
        const car = { id: `C${String(db.carriers.length + 1).padStart(3, '0')}`, name, code: '', type: 'Broker', shortName: name.split(' ')[0].toUpperCase(), paymentTerms: 'Net 30', weightage: 0, blocked: false, rating: 4, fleet: 0, lanes: [], rejectionPct: 0, fulfilledPct: 100 };
        db.carriers.push(car); return { id: car.id };
    },
    addCustomer(db, c, u) {
        need(u, 'customer.edit', 'edit customers');
        const name = str(c.name, 80) || fail('Customer name is required.');
        const cu = { id: `K${db.customers.length + 1}`, name, rCode: '', zone: str(c.zone, 10), contact: str(c.contact, 20), csl: u.name, segment: 'General Trade' };
        db.customers.push(cu); return { id: cu.id };
    },
    saveUser(db, c, u) {
        need(u, 'user.manage', 'manage users');
        const x = c.user || {};
        const email = str(x.email, 120).toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) fail('A valid email is required.');
        const roles = (Array.isArray(x.roles) ? x.roles : []).filter((r) => ROLE_PERMS[r]);
        const units = (Array.isArray(x.units) ? x.units : []).filter((q) => db.units.some((y) => y.id === q));
        if (!roles.length || !units.length) fail('Pick at least one role and one unit.');
        if (roles.includes('Carrier Vendor') && !db.carriers.some((y) => y.id === x.carrierId)) fail('A carrier vendor user must be linked to a carrier.');
        const cur = db.users.find((y) => y.email === email);
        const rec = { id: cur ? cur.id : `U${db.users.length + 1}`, name: str(x.name, 80) || fail('Name is required.'), email, designation: str(x.designation, 60), roles, units, carrierId: roles.includes('Carrier Vendor') ? x.carrierId : undefined, lastSignin: cur ? cur.lastSignin : '' };
        if (cur) Object.assign(cur, rec); else db.users.push(rec);
        return { id: rec.id };
    },
    markRead(db) { db.notifications.forEach((n) => { n.read = true; }); return {}; },

    // ---- Phase 3: SAP / e-way bill (async, through deps)
    async postInvoiceSap(db, c, u, now, deps) {
        need(u, 'inv.approve.f', 'post invoices to SAP');
        const inv = invOf(db, c.id); sees(u, inv);
        if (inv.sapDoc) return { sapDoc: inv.sapDoc, already: true };
        if (inv.status !== 'Approved') fail('Only an approved invoice can be posted to SAP.', 409);
        const car = carrierOf(db, inv.carrierId);
        const r = await deps.sap.postFreightInvoice({ extRef: `TMS-${inv.id}`, vendor: car.code, amount: inv.amount, invoiceDate: inv.date, unit: inv.unitId, sin: inv.sin, miro: inv.miro });
        inv.sapDoc = r.docNo; inv.status = 'Billed'; inv.simulated = !!r.simulated;
        inv.history.push({ at: iso(now), actor: u.name, text: `Posted to SAP FI (doc ${r.docNo}${r.simulated ? ', simulated' : ''})` });
        return { sapDoc: r.docNo, simulated: !!r.simulated };
    },
    async syncPayments(db, c, u, now, deps) {
        need(u, 'inv.pay', 'sync payments');
        return syncPayments(db, now, deps, u.name);
    },
    async syncMasters(db, c, u, now, deps) {
        need(u, 'user.manage', 'sync masters');
        const out = { carriers: 0, customers: 0 };
        for (const v of await deps.sap.vendors()) {
            const cur = db.carriers.find((x) => x.code === v.code);
            if (cur) Object.assign(cur, { name: v.name, paymentTerms: v.paymentTerms || cur.paymentTerms, blocked: v.blocked });
            else db.carriers.push({ id: `C${String(db.carriers.length + 1).padStart(3, '0')}`, name: v.name, code: v.code, type: 'Broker', shortName: v.name.split(' ')[0].toUpperCase(), paymentTerms: v.paymentTerms || 'Net 30', weightage: 0, blocked: v.blocked, rating: 4, fleet: 0, lanes: [], rejectionPct: 0, fulfilledPct: 100 });
            out.carriers++;
        }
        for (const k of await deps.sap.customers()) {
            const cur = db.customers.find((x) => x.rCode === k.code);
            if (cur) Object.assign(cur, { name: k.name, zone: k.zone || cur.zone });
            else db.customers.push({ id: `K${db.customers.length + 1}`, name: k.name, rCode: k.code, zone: k.zone || '', contact: '', csl: u.name, segment: 'General Trade' });
            out.customers++;
        }
        return out;
    },
    async checkPoSo(db, c, u, now, deps) { return deps.sap.checkPoSo({ po: str(c.po, 20), so: str(c.so, 20) }); },
    async ewayCheck(db, c, u, now, deps) {
        const s = shipOf(db, c.sin); sees(u, s);
        const r = await deps.eway.status(s.ewayNo || str(c.ewayNo, 20), s);
        if (r.validUpto) s.ewayExpiry = iso(Date.parse(r.validUpto));
        return r;
    },
};

function completeOrderIfDone(db, orderId) {
    const o = db.orders.find((x) => x.id === orderId); if (!o) return;
    const ships = db.shipments.filter((s) => s.orderId === orderId && s.status !== 'Cancelled');
    if (ships.length && ships.length >= o.vehicles && ships.every((s) => s.status === 'Completed')) o.status = 'Fulfilled';
}

function setInvoiceStatuses(db, ids, to, u, now) {
    const rule = INV_TARGETS[to];
    if (!rule || !rule.perm) fail('Invalid invoice status.');
    need(u, rule.perm, 'make that invoice change');
    if (to === 'Billed') fail('Use "Post to SAP" - an invoice becomes Billed only when SAP accepts it.', 409);
    const rows = ids.map((x) => invOf(db, x));
    for (const i of rows) { sees(u, i); if (i.review === 'Under Review') fail(`${i.id} is outside the invoice tolerance and needs HO review first.`, 409); if (!rule.from.includes(i.status)) fail(`${i.id} is ${i.status}; it cannot move to ${to}.`, 409); }
    for (const i of rows) i.history.push({ at: iso(now), actor: u.name, text: `Status -> ${to}` }), (i.status = to);
    return { changed: rows.length };
}

async function syncPayments(db, now, deps, actor = 'System') {
    const open = db.invoices.filter((i) => i.sapDoc && ['Billed', 'Ready For Payment'].includes(i.status));
    if (!open.length) return { paid: 0 };
    const res = await deps.sap.paymentStatus(open.map((i) => i.sapDoc));
    let paid = 0;
    for (const i of open) {
        const r = res[i.sapDoc];
        if (r && r.cleared) { i.status = 'Paid'; i.history.push({ at: iso(now), actor, text: `Paid in SAP (clearing doc ${r.clearingDoc})` }); paid++; }
    }
    return { paid };
}

// ------------------------------------------------------------------------------------------------------------- Phase 2: tracking
const SPEED_LIMIT = 85, CORRIDOR_KM = 120, GAP_MIN = 60;

/** One GPS / SIM / IoT position. Moves progress, fires geofence status changes, flags anomalies. Called by the ingest endpoint (api key), not by users. */
function ingestPing(db, ping, now) {
    const s = ping.sin ? db.shipments.find((x) => x.sin === ping.sin) : db.shipments.find((x) => x.vehicleNo === String(ping.vehicleNo || '').toUpperCase() && LIVE.concat('Assigned').includes(x.status));
    if (!s) return { matched: false };
    const lat = Number(ping.lat), lon = Number(ping.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) fail('Invalid coordinates.');
    const at = Date.parse(ping.ts) || now;
    if (s.pos && at < Date.parse(s.pos.at)) return { matched: true, stale: true };
    const from = locOf(db, s.fromLocId), to = locOf(db, s.toLocId), p = { lat, lon };
    const { t, off } = project(from, to, p);
    const prev = s.pos;
    s.pos = { lat, lon, at: iso(at), speed: Number(ping.speed) || 0, source: ['SIM', 'ROAMBEE', 'GPS'].includes(ping.source) ? ping.source : 'GPS' };
    s.tracking = s.pos.source === 'SIM' ? 'Passive' : 'Active';
    const fence = (loc, type) => (db.geofences.find((g) => g.locId === loc.id && g.type === type)?.radiusM ?? (type === 'Pickup' ? 1000 : 1500)) / 1000;
    const inPick = km(p, from) <= fence(from, 'Pickup'), inDel = km(p, to) <= fence(to, 'Delivery');
    const events = [];
    if (s.status === 'Towards Pickup' && inPick) { s.status = 'At Pickup'; events.push('Geofence entry - arrived at pickup'); }
    else if (s.status === 'At Pickup' && !inPick && prev) { s.status = 'In Transit'; events.push('Geofence exit - loaded, in transit'); }
    else if (s.status === 'In Transit' && inDel) { s.status = 'At Delivery'; s.progress = 1; events.push('Geofence entry - arrived at delivery'); const g = db.geofences.find((x) => x.locId === to.id && x.type === 'Delivery'); if (g) g.completions++; }
    for (const e of events) log(s, at, 'System', e);
    if (s.status === 'In Transit') s.progress = Math.max(s.progress, Math.min(0.99, t));
    let anomaly;
    if (s.pos.speed > SPEED_LIMIT) anomaly = 'Speed';
    else if (s.status === 'In Transit' && off > CORRIDOR_KM) anomaly = 'Distance';
    if (anomaly && s.anomaly !== anomaly) { s.anomaly = anomaly; log(s, at, 'System', `Anomaly: ${anomaly}`); notify(db, now, 'warn', `${anomaly} anomaly on ${s.sin} (${s.vehicleNo})`); }
    else if (!anomaly && s.anomaly && s.anomaly !== 'Tracking') s.anomaly = undefined;
    if (s.anomaly === 'Tracking') s.anomaly = undefined;
    return { matched: true, sin: s.sin, status: s.status, anomaly: s.anomaly || null };
}

/** Periodic sweep: auctions that ran out, GPS gaps, e-way bills about to expire, consent that lapsed. Returns what changed. */
function sweep(db, now) {
    const out = { closedAuctions: 0, gaps: 0, eway: 0, delays: 0, indentsMoved: 0 };
    out.indentsMoved = outward.sweepIndents(db, now);
    out.unlinked = 0;
    for (const o of db.orders) {
        const b = o.bid;
        if (b && b.status === 'Open' && now >= Date.parse(b.expiresAt) && !b.closedNoticed) {
            b.closedNoticed = true; out.closedAuctions++;
            if (!b.bids.length) { b.status = 'Expired'; notify(db, now, 'warn', `Auction ${o.id} closed with no bids`); }
            else notify(db, now, 'info', `Auction ${o.id} closed with ${b.bids.length} bids - award it`);
        }
    }
    for (const s of db.shipments) {
        if (s.status === 'In Transit') {
            const last = s.pos ? Date.parse(s.pos.at) : null;
            if (s.consent === 'Granted' && last && now - last > GAP_MIN * 60000 && s.anomaly !== 'Tracking') { s.anomaly = 'Tracking'; s.tracking = 'Non-Tracking'; out.gaps++; log(s, now, 'System', 'No GPS ping for over 60 minutes'); }
            if (s.ewayExpiry && !s.ewayWarned && Date.parse(s.ewayExpiry) - now < 3 * 3600_000) { s.ewayWarned = true; out.eway++; notify(db, now, 'crit', `E-way bill expiring in under 3h on ${s.sin} (${s.vehicleNo})`); }
            const drop = Math.max(0, Math.round(((now - Date.parse(s.pickupAt)) / 3600_000 - Math.max(8, s.km / 42)) * 10) / 10);
            if (drop !== s.delayH) { s.delayH = Math.max(0, drop); out.delays++; }
        }
        if (s.consent === 'Granted' && s.consentSince && now - Date.parse(s.consentSince) > 30 * 86400_000) { s.consent = 'Expired'; s.tracking = 'Non-Tracking'; log(s, now, 'System', 'SIM consent subscription expired'); }
    }
    out.unlinked = trips.sweepTrips(db, now);
    return out;
}

// ------------------------------------------------------------------------------------------------------------- Phase 0: migration import
const IMPORT_KEYS = ['units', 'locs', 'carriers', 'customers', 'orders', 'shipments', 'invoices', 'geofences', 'users'];
/** Validates and merges an export from the old system. dryRun reports problems without writing. Referential integrity is checked before anything is applied. */
function importData(db, payload, { dryRun = false } = {}) {
    const p = payload || {};
    const errors = [], counts = {};
    const next = {};
    const keyOf = { units: 'id', locs: 'id', carriers: 'id', customers: 'id', orders: 'id', shipments: 'sin', invoices: 'id', geofences: 'id', users: 'email' };
    for (const k of IMPORT_KEYS) {
        const rows = p[k] === undefined ? [] : p[k];
        if (!Array.isArray(rows)) { errors.push(`${k} must be a list.`); continue; }
        const seen = new Set();
        rows.forEach((r, i) => {
            const key = r && r[keyOf[k]];
            if (!key) errors.push(`${k}[${i}] has no ${keyOf[k]}.`);
            else if (seen.has(key)) errors.push(`${k}: duplicate ${keyOf[k]} ${key}.`);
            else seen.add(key);
        });
        next[k] = rows; counts[k] = rows.length;
    }
    const has = (k, v) => (next[k] || []).some((r) => r[keyOf[k]] === v) || db[k].some((r) => r[keyOf[k]] === v);
    (next.orders || []).forEach((o) => { if (!has('units', o.unitId)) errors.push(`order ${o.id}: unknown unit ${o.unitId}.`); if (!has('customers', o.customerId)) errors.push(`order ${o.id}: unknown customer ${o.customerId}.`); (o.stops || []).forEach((s) => { if (!has('locs', s.locId)) errors.push(`order ${o.id}: unknown location ${s.locId}.`); }); });
    (next.shipments || []).forEach((s) => { if (!has('orders', s.orderId)) errors.push(`shipment ${s.sin}: unknown order ${s.orderId}.`); if (!has('carriers', s.carrierId)) errors.push(`shipment ${s.sin}: unknown carrier ${s.carrierId}.`); if (!FLOW.concat(['Cancelled', 'Rejected']).includes(s.status)) errors.push(`shipment ${s.sin}: bad status ${s.status}.`); });
    (next.invoices || []).forEach((i) => { if (!has('shipments', i.sin)) errors.push(`invoice ${i.id}: unknown shipment ${i.sin}.`); if (!INV_FLOW.concat(['Disapproved']).includes(i.status)) errors.push(`invoice ${i.id}: bad status ${i.status}.`); });
    if (errors.length) return { ok: false, errors: errors.slice(0, 100), counts };
    if (dryRun) return { ok: true, dryRun: true, counts };
    for (const k of IMPORT_KEYS) {
        for (const r of next[k]) {
            const row = { ...r };
            if (k === 'shipments') { row.log = row.log || []; }
            if (k === 'invoices') { row.history = row.history || []; }
            if (k === 'users') { row.id = row.id || `U${db.users.length + 1}`; }
            const i = db[k].findIndex((x) => x[keyOf[k]] === r[keyOf[k]]);
            if (i >= 0) db[k][i] = row; else db[k].push(row);
        }
    }
    return { ok: true, counts };
}

// ------------------------------------------------------------------------------------------------------------- entry point
async function apply(db, cmd, user, deps = {}, now = Date.now()) {
    const h = cmd && handlers[cmd.type];
    if (!h || typeof cmd.type !== 'string' || Object.prototype.hasOwnProperty.call(Object.prototype, cmd.type)) fail('Unknown command.', 400);
    if (isVendor(user) && cmd.type !== 'placeBid' && !outward.VENDOR_CMDS.includes(cmd.type) && !trips.VENDOR_CMDS.includes(cmd.type)) fail('Carrier users can only place bids and respond to indents.', 403);
    const result = await h(db, cmd, user, now, deps);
    return { result: result || {} };
}

const outward = require('./tmsOutward').build({ fail, need, can, inScope, isAdmin, isVendor, str, num, iso, id, log, notify, makeShipments, sees, locOf, shipOf });
const trips = require('./tmsTrips').build({ fail, need, can, inScope, isAdmin, isVendor, str, num, iso, id, log, notify, sees, shipOf, locOf, km, project, completeOrderIfDone, ingestPing }, outward);
Object.assign(handlers, outward.handlers, trips.handlers);
Object.assign(ROLE_PERMS, outward.ROLE_PERMS, trips.ROLE_PERMS);
ROLE_PERMS['Carrier Vendor'].push(...outward.VENDOR_PERMS);

module.exports = { apply, scopedDb, emptyDb, ingestPing, sweep, importData, syncPayments, can, permsOf, inScope, isAdmin, isVendor, EngineError, ROLE_PERMS, FLOW, INV_FLOW, project, km, lowestBid, handlers, trips };
