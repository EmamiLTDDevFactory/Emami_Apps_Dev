/*
   SmarTruck TMS - Outward shipment tracking & freight portal (Release 1). The in-house replacement for the external vendor's SmarTruck.
   Plan: embedded-apps/smartruck-tms/docs/OUTWARD_TRACKING_PLAN.md. Same rules as tmsEngine.js: pure logic over the Db object, the actor,
   ids and times come from the server, permissions per action, unit scope per row, vendor commands checked against the vendor's own carrier.

   Slice 1 (this file): vehicle types, lane -> vendor priority list, indents, vendor offer / accept / reject, timeout to next vendor or HO.
   An accepted indent becomes an Active order + a shipment in status Accepted, so the existing assign / advance / tracking flow carries on.
*/
function build(k) {
    const { fail, need, can, inScope, isAdmin, isVendor, str, num, iso, id, log, notify, makeShipments, sees, locOf, shipOf } = k;

    const DEFAULTS = { offerTimeoutH: 4, capacityMinPct: 80, invoiceTolerancePct: 2, delayMarginH: 2, unlinkedAlertH: 12, invoiceMailbox: '', consentVersion: 'v1', consentText: 'I agree that my vehicle position may be tracked for this trip.' };
    /** Stored documents from before this module have none of these keys. */
    const ensure = (db) => {
        db.vehicleTypes ||= []; db.lanes ||= []; db.indents ||= [];
        db.settings = { ...DEFAULTS, ...(db.settings || {}) };
        return db;
    };

    const ROLE_PERMS = {
        'Depot User': ['indent.create', 'indent.cancel'],
        'HO Logistics': ['indent.create', 'indent.cancel', 'indent.override', 'lane.manage', 'ship.update', 'report.view'],
    };
    const VENDOR_PERMS = ['indent.respond', 'ship.assign.own'];
    /** Commands a Carrier Vendor user may send (each one re-checks that the row belongs to their carrier). */
    const VENDOR_CMDS = ['vendorRespond'];

    const indentOf = (db, iid) => (ensure(db).indents.find((x) => x.id === iid)) || fail('Indent not found.', 404);
    const currentOffer = (ind) => ind.offers.find((o) => o.response === 'Pending');

    /** Lane vendor rows that fit the indent's mode: a row with a vehicle type / shipping type applies only to that one, a row without applies to all.
        Exact vehicle-type rows come first, then by priority and rate. */
    const modeVendors = (lane, ind) => ((lane && lane.vendors) || [])
        .filter((v) => (!v.vehicleType || v.vehicleType === ind.vehicleType) && (!ind.shippingType || !v.shippingType || v.shippingType === ind.shippingType))
        .sort((a, b) => (a.vehicleType === ind.vehicleType ? 0 : 1) - (b.vehicleType === ind.vehicleType ? 0 : 1) || a.priority - b.priority || a.rate - b.rate);
    const offerOf = (v, now, db) => ({ carrierId: v.carrierId, offeredAt: iso(now), response: 'Pending', expiresAt: iso(now + db.settings.offerTimeoutH * 3600_000), rate: v.rate, ...(v.per ? { per: v.per, currency: v.currency || 'INR' } : {}) });

    /** Offer the indent to the next eligible vendor on its lane, or escalate to HO when the list is exhausted. */
    function offerNext(db, ind, now) {
        const lane = db.lanes.find((l) => l.id === ind.laneId);
        const tried = new Set(ind.offers.map((o) => o.carrierId));
        const next = modeVendors(lane, ind).find((v) => !tried.has(v.carrierId) && db.carriers.some((c) => c.id === v.carrierId && !c.blocked));
        if (!next) {
            ind.escalated = true;
            notify(db, now, 'crit', `Indent ${ind.id}: no vendor left on lane ${ind.laneId} - HO to allocate manually`);
            return null;
        }
        ind.offers.push(offerOf(next, now, db));
        ind.escalated = false;
        return next.carrierId;
    }

    const handlers = {
        upsertVehicleType(db, c, u) {
            ensure(db); need(u, 'lane.manage', 'maintain vehicle types');
            const code = str(c.code, 20).toUpperCase() || fail('Vehicle type code is required.');
            const row = { code, name: str(c.name, 60) || code, maxWeightKg: num(c.maxWeightKg, 'Max weight (kg)', { min: 1, max: 100000 }), maxVolumeM3: num(c.maxVolumeM3, 'Max volume (m3)', { min: 0.1, max: 500 }) };
            const i = db.vehicleTypes.findIndex((x) => x.code === code);
            if (i >= 0) db.vehicleTypes[i] = row; else db.vehicleTypes.push(row);
            return { code };
        },

        upsertLane(db, c, u) {
            ensure(db); need(u, 'lane.manage', 'maintain lanes');
            locOf(db, c.fromLocId); locOf(db, c.toLocId);
            if (c.fromLocId === c.toLocId) fail('Lane origin and destination must differ.');
            const seen = new Set();
            const vendors = (Array.isArray(c.vendors) ? c.vendors : []).map((v, i) => {
                const carrierId = str(v.carrierId, 20);
                if (!db.carriers.some((x) => x.id === carrierId)) fail(`Unknown carrier ${carrierId}.`);
                const vehicleType = str(v.vehicleType, 20).toUpperCase(), shippingType = str(v.shippingType, 2), per = str(v.per, 3).toUpperCase();
                const mk = `${carrierId}|${vehicleType}|${shippingType}|${str(v.rateBasis, 10)}|${str(v.sdabw, 4)}|${str(v.shtyp, 4)}`;
                if (seen.has(mk)) fail('A vendor can appear only once per vehicle type and shipping type on a lane.'); seen.add(mk);
                // fields of SAP rows (condition record, texts) pass through unchanged so a save from the screen does not lose them
                const keep = {}; for (const k of ['sapVehicle', 'vehicleText', 'rateBasis', 'shippingText', 'sdabw', 'shtyp', 'zdays', 'route', 'condTable', 'condRecord', 'validTo', 'source', 'perQty']) if (v[k] !== undefined && v[k] !== '') keep[k] = String(v[k]).slice(0, 60);
                return { ...keep, carrierId, priority: Number.isFinite(Number(v.priority)) ? Number(v.priority) : i + 1, rate: num(v.rate, 'Freight rate', { min: 0.01, max: 1e7 }),
                    ...(vehicleType ? { vehicleType } : {}), ...(shippingType ? { shippingType } : {}), ...(per ? { per, currency: str(v.currency, 5) || 'INR' } : {}) };
            });
            if (!vendors.length) fail('A lane needs at least one vendor.');
            // SAP rates (condition ZB00) are mastered in SAP: a hand edit of the lane keeps them; the next sync refreshes them
            const before = db.lanes.find((x) => x.id === (c.id ? str(c.id, 30) : `LN-${c.fromLocId}-${c.toLocId}`));
            if (before) for (const v of before.vendors || []) if (v.source === 'sap' && !vendors.some((x) => x.condRecord === v.condRecord)) vendors.push(v);
            const lid = c.id ? str(c.id, 30) : `LN-${c.fromLocId}-${c.toLocId}`;
            const prev = db.lanes.find((x) => x.id === lid);
            const row = { id: lid, fromLocId: c.fromLocId, toLocId: c.toLocId, distanceKm: num(c.distanceKm ?? 0, 'Distance', { max: 10000 }), transitH: num(c.transitH ?? 0, 'Transit hours', { max: 500 }), vendors, ...(prev && prev.sapRoutes ? { sapRoutes: prev.sapRoutes, syncedAt: prev.syncedAt } : {}) };
            const i = db.lanes.findIndex((x) => x.id === lid);
            if (i >= 0) db.lanes[i] = row; else db.lanes.push(row);
            return { laneId: lid };
        },

        createIndent(db, c, u, now) {
            ensure(db); need(u, 'indent.create', 'raise indents');
            if (!inScope(u, c.unitId) || !db.units.some((x) => x.id === c.unitId)) fail('You are not assigned to that unit.', 403);
            if (!db.customers.some((x) => x.id === c.customerId)) fail('Unknown customer.');
            const lane = db.lanes.find((l) => l.id === c.laneId) || fail('Unknown lane.');
            if (!db.vehicleTypes.some((v) => v.code === c.vehicleType)) fail('Unknown vehicle type.');
            const at = Date.parse(c.requiredAt);
            if (!(at > now)) fail('The required date and time must be in the future.');
            const vehicles = num(c.vehicles ?? 1, 'Vehicles', { min: 1, max: 1 }); // one vehicle per indent in Release 1, so a trip maps to one indent
            const deliveries = (Array.isArray(c.deliveries) ? c.deliveries : []).map((d) => str(d, 12)).filter(Boolean).slice(0, 50);
            const ind = {
                id: `IND${++db.seq}`, unitId: c.unitId, laneId: lane.id, fromLocId: lane.fromLocId, toLocId: lane.toLocId, customerId: c.customerId, vehicleType: c.vehicleType, vehicles,
                ...(str(c.shippingType, 2) ? { shippingType: str(c.shippingType, 2) } : {}),
                requiredAt: iso(at), deliveries, material: str(c.material, 60), qty: num(c.qty ?? 1, 'Quantity', { min: 0.1, max: 1000 }), status: 'Open', offers: [], createdAt: iso(now), createdBy: u.name, remarks: [],
            };
            const first = offerNext(db, ind, now);
            db.indents.unshift(ind);
            if (first) notify(db, now, 'info', `Indent ${ind.id} offered to ${db.carriers.find((x) => x.id === first).name}`);
            return { indentId: ind.id, offeredTo: first };
        },

        cancelIndent(db, c, u, now) {
            need(u, 'indent.cancel', 'cancel indents');
            const ind = indentOf(db, c.id); sees(u, ind);
            if (ind.status === 'Cancelled') fail('The indent is already cancelled.', 409);
            if (ind.status === 'Vehicle Assigned') fail('A vehicle is already assigned; cancel the shipment instead.', 409);
            ind.status = 'Cancelled'; ind.offers.forEach((o) => { if (o.response === 'Pending') o.response = 'Withdrawn'; });
            ind.remarks.push(`Cancelled by ${u.name}${c.reason ? `: ${str(c.reason, 200)}` : ''}`);
            if (ind.orderId) {
                const o = db.orders.find((x) => x.id === ind.orderId);
                if (o) o.status = 'Cancelled';
                db.shipments.filter((s) => s.orderId === ind.orderId && s.status !== 'Completed').forEach((s) => { s.status = 'Cancelled'; log(s, now, u.name, 'Indent cancelled'); });
            }
            return {};
        },

        /** HO hands an indent that nobody took (or any open indent) to a chosen vendor, at the lane rate or an explicit one. */
        offerIndent(db, c, u, now) {
            ensure(db); need(u, 'indent.override', 'offer an indent to a vendor');
            const ind = indentOf(db, c.id); sees(u, ind);
            if (ind.status !== 'Open') fail('Only an open indent can be offered.', 409);
            const car = db.carriers.find((x) => x.id === c.carrierId) || fail('Unknown carrier.');
            if (car.blocked) fail('That carrier is blocked.', 409);
            const lv = modeVendors(db.lanes.find((l) => l.id === ind.laneId), ind).find((v) => v.carrierId === car.id);
            const explicit = c.rate !== undefined;
            const rate = explicit ? num(c.rate, 'Freight rate', { min: 1, max: 1e7 }) : (lv ? lv.rate : fail('That carrier has no rate on this lane for this vehicle / shipping type; enter the freight rate.'));
            ind.offers.forEach((o) => { if (o.response === 'Pending') o.response = 'Withdrawn'; });
            ind.offers.push(explicit ? offerOf({ carrierId: car.id, rate }, now, db) : offerOf(lv, now, db));
            ind.escalated = false; ind.remarks.push(`Offered to ${car.name} by ${u.name}`);
            return { offeredTo: car.id };
        },

        /** The offered vendor accepts or rejects. Rejection (reason mandatory) moves the offer to the next vendor on the lane, or to HO. */
        vendorRespond(db, c, u, now) {
            ensure(db);
            if (!isVendor(u) || !can(u, 'indent.respond')) fail('Only carrier users can respond to an indent offer.', 403);
            const ind = indentOf(db, c.id);
            const offer = currentOffer(ind);
            if (ind.status !== 'Open' || !offer || offer.carrierId !== u.carrierId) fail('This indent is not currently offered to your carrier.', 409);
            if (now > Date.parse(offer.expiresAt)) fail('This offer has expired.', 409);
            if (c.response !== 'accept' && c.response !== 'reject') fail('Response must be accept or reject.');
            const reason = str(c.reason, 200);
            if (c.response === 'reject' && !reason) fail('A reason is required to reject an indent.'); // validate before changing anything
            offer.respondedAt = iso(now);
            if (c.response === 'reject') {
                offer.response = 'Rejected'; offer.reason = reason;
                const nx = offerNext(db, ind, now);
                notify(db, now, 'warn', `Indent ${ind.id} rejected by ${db.carriers.find((x) => x.id === u.carrierId).name}: ${offer.reason}${nx ? '' : ' (no vendor left)'}`);
                return { next: nx };
            }
            offer.response = 'Accepted';
            const carrier = db.carriers.find((x) => x.id === u.carrierId);
            // a per-KG lane rate (SAP ZB00) is estimated on the indent quantity (MT) until the deliveries give the real weight
            const price = offer.per === 'KG' ? Math.round(offer.rate * ind.qty * 1000) : offer.rate;
            const o = {
                id: `ORD${++db.seq}`, unitId: ind.unitId, customerId: ind.customerId, mode: 'FTL', basis: 'Vehicle', vehicleType: ind.vehicleType, vehicles: ind.vehicles,
                stops: [{ type: 'P', locId: ind.fromLocId, at: ind.requiredAt }, { type: 'D', locId: ind.toLocId, at: iso(Date.parse(ind.requiredAt) + (db.lanes.find((l) => l.id === ind.laneId).transitH || 24) * 3600_000) }],
                material: ind.material, qty: ind.qty, uom: 'MT', packages: 0, po: '', so: '', project: '', segment: '', odc: false, tolerance: 0, comments: `From indent ${ind.id}`, status: 'Active',
                createdAt: iso(now), createdBy: ind.createdBy, remarks: [`Allocated to ${carrier.name} through indent ${ind.id}`],
            };
            o.oin = `OIN-${o.unitId}-${db.seq}`;
            db.orders.unshift(o);
            const ships = makeShipments(db, o, carrier.id, price, now, `Indent ${ind.id}`);
            ships.forEach((s) => { s.indentId = ind.id; if (offer.per) s.freightRate = { rate: offer.rate, per: offer.per, currency: offer.currency || 'INR' }; if (ind.shippingType) s.shippingType = ind.shippingType; });
            db.shipments.unshift(...ships);
            ind.status = 'Allocated'; ind.orderId = o.id; ind.sin = ships[0].sin;
            notify(db, now, 'info', `Indent ${ind.id} accepted by ${carrier.name} - shipment ${ind.sin}`);
            return { orderId: o.id, sin: ind.sin };
        },
    };

    /** Time-driven part: an unanswered offer moves on. Called from the engine's sweep. */
    function sweepIndents(db, now) {
        ensure(db);
        let moved = 0;
        for (const ind of db.indents) {
            if (ind.status !== 'Open') continue;
            const offer = currentOffer(ind);
            if (offer && now > Date.parse(offer.expiresAt)) {
                offer.response = 'Timed out'; offer.respondedAt = iso(now);
                offerNext(db, ind, now); moved++;
            }
        }
        return moved;
    }

    /** What a vendor may see of the indents: only the one currently offered to them, without customer detail, plus their own accepted history. */
    function vendorIndents(db, user) {
        return ensure(db).indents.filter((i) => i.offers.some((o) => o.carrierId === user.carrierId))
            .map((i) => ({ ...i, customerId: '', createdBy: '', remarks: [], offers: i.offers.filter((o) => o.carrierId === user.carrierId) }));
    }

    // A vendor sets the vehicle on a shipment that belongs to their carrier. Reuses the engine's own `assign` rules.
    return { handlers, ensure, sweepIndents, vendorIndents, ROLE_PERMS, VENDOR_PERMS, VENDOR_CMDS, DEFAULTS };
}
module.exports = { build };
