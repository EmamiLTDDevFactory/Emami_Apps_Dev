/*
   SmarTruck TMS - Outward shipment tracking & freight portal (Release 1). The in-house replacement for the external vendor's SmarTruck.
   Plan: embedded-apps/smartruck-tms/docs/OUTWARD_TRACKING_PLAN.md. Same rules as tmsEngine.js: pure logic over the Db object, the actor,
   ids and times come from the server, permissions per action, unit scope per row, vendor commands checked against the vendor's own carrier.

   Slice 1 (this file): vehicle types, lane -> vendor priority list, indents, vendor offer / accept / reject, timeout to next vendor or HO.
   An accepted indent becomes an Active order + a shipment in status Accepted, so the existing assign / advance / tracking flow carries on.
*/
function build(k) {
    const { fail, need, can, inScope, isAdmin, isVendor, str, num, iso, id, log, notify, makeShipments, sees, locOf, shipOf, checkUnit, applyUnit } = k;

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
    const VENDOR_CMDS = ['vendorRespond', 'vendorSubmitItem', 'vendorRejectItem'];

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

    // ------------------------------------------------------------------------------------------------ multi-transporter items
    // One indent number, one ITEM per transporter (10, 20, ...). docs/PHASE1_TRIP_TRAIL_DOC.md.
    const MAX_ITEMS = 20, MAX_VEHICLES = 50, EPS = 1e-6;
    const itemRef = (ind, it) => `${ind.id}-${it.itemNo}`;
    const itemOf = (ind, no) => (ind.items || []).find((x) => x.itemNo === Number(no));
    const liveItems = (ind) => (ind.items || []).filter((i) => i.status === 'Pending' || i.status === 'Submitted');
    const fmtIST = (t) => new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';

    /** Totals follow the live items; the status follows the items. */
    function recompute(ind) {
        const live = liveItems(ind);
        ind.cases = live.reduce((a, i) => a + i.cases, 0);
        ind.vehicles = live.reduce((a, i) => a + i.vehicles, 0);
        ind.qty = Math.round(live.reduce((a, i) => a + i.qty, 0) * 1e6) / 1e6;
        // a Rejected / Expired line that HO replaced (replacedBy) no longer counts against the indent
        const active = ind.items.filter((i) => i.status !== 'Cancelled' && !i.replacedBy);
        const sub = active.filter((i) => i.status === 'Submitted').length;
        ind.escalated = active.some((i) => i.status === 'Rejected' || i.status === 'Expired');
        if (!active.length) ind.status = 'Cancelled';
        else if (sub === active.length) ind.status = 'Allocated';
        else if (sub > 0) ind.status = 'Partly allocated';
        else ind.status = 'Open';
        const first = ind.items.filter((i) => i.sins && i.sins.length).sort((a, b) => a.itemNo - b.itemNo)[0];
        if (first) ind.sin = first.sins[0];
    }

    /** Validate one allocation row (shape and values only). */
    function cleanAllocation(db, a, n, fallbackAt, now) {
        const where = `Transporter line ${n}`;
        const carrierId = str(a && a.carrierId, 20);
        const car = db.carriers.find((x) => x.id === carrierId) || fail(`${where}: choose a transporter.`);
        if (car.blocked) fail(`${where}: ${car.name} is blocked.`, 409);
        const intOf = (v, name, min, max) => { const x = num(v, `${where}: ${name}`, { min, max }); if (!Number.isInteger(x)) fail(`${where}: ${name} must be a whole number.`); return x; };
        const cases = intOf(a.cases ?? 0, 'No. of cases', 0, 1e7);
        const vehicles = intOf(a.vehicles ?? 1, 'No. of vehicles', 1, MAX_VEHICLES);
        const qty = num(a.qty, `${where}: Quantity`, { min: 0.1, max: 1000 });
        const at = Date.parse(a.requiredAt || fallbackAt);
        if (!(at > now)) fail(`${where}: the required date and time must be in the future.`);
        return { carrier: car, cases, vehicles, qty, at };
    }

    /** One item for a carrier: the lane's own rate for that carrier in this indent's mode, else 0 (rate is set by HO later). */
    function makeItem(db, ind, lane, row, itemNo, now) {
        const lv = modeVendors(lane, ind).find((v) => v.carrierId === row.carrier.id);
        return {
            itemNo, carrierId: row.carrier.id, cases: row.cases, vehicles: row.vehicles, qty: row.qty, requiredAt: iso(row.at),
            rate: lv ? lv.rate : 0, ...(lv && lv.per ? { per: lv.per, currency: lv.currency || 'INR' } : {}),
            status: 'Pending', expiresAt: iso(now + db.settings.offerTimeoutH * 3600_000), units: [],
        };
    }

    /** Where a carrier's mail goes: its own e-mail if set, else the e-mails of the TMS users linked to that carrier. */
    function carrierRecipients(db, car) {
        const list = [car.email, ...db.users.filter((x) => x.carrierId === car.id).map((x) => x.email)].map((e) => str(e, 120).toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
        return [...new Set(list)];
    }
    /** ONE mail per transporter, with only that transporter's own items. Nothing about other transporters, rates or the customer. */
    function mailRequestsFor(db, ind, items, now) {
        const out = [];
        const from = db.locs.find((l) => l.id === ind.fromLocId), to = db.locs.find((l) => l.id === ind.toLocId);
        const route = `${from ? from.city : ind.fromLocId} to ${to ? to.city : ind.toLocId}`;
        const vt = db.vehicleTypes.find((v) => v.code === ind.vehicleType);
        for (const it of items) {
            const car = db.carriers.find((x) => x.id === it.carrierId);
            const rec = car ? carrierRecipients(db, car) : [];
            if (!rec.length) {
                it.mail = { to: '', sent: false, error: 'No e-mail address for this transporter', at: iso(now) };
                notify(db, now, 'warn', `Indent ${itemRef(ind, it)}: no e-mail address for ${car ? car.name : it.carrierId}; the transporter was not mailed`);
                continue;
            }
            const to_ = rec.join(', ');
            it.mail = { to: to_, sent: false, at: iso(now) };
            out.push({
                indentId: ind.id, itemNo: it.itemNo, carrierId: it.carrierId, to: to_,
                subject: `New transport request ${itemRef(ind, it)} - ${route}`,
                text: [`Dear ${car.name},`, '', `You have a new transport request from Emami: ${itemRef(ind, it)}.`, '',
                    `Route: ${route}`, `Vehicle type: ${vt ? vt.name : ind.vehicleType}`, `No. of vehicles: ${it.vehicles}`, `No. of cases: ${it.cases}`, `Quantity: ${it.qty} MT`,
                    `Required: ${fmtIST(Date.parse(it.requiredAt))}`, '', `Please sign in to Emami Apps > Trip Trail > Vendor Portal before ${fmtIST(Date.parse(it.expiresAt))} and enter the driver name, driver phone number and vehicle number for each vehicle.`].join('\n'),
            });
        }
        return out;
    }

    /** A transporter's own pending line. Same message whether the line is missing or belongs to someone else (no probing). */
    function myPendingItem(db, c, u, now) {
        const ind = indentOf(db, c.id);
        const it = itemOf(ind, c.itemNo);
        if (!ind.items || !it || it.carrierId !== u.carrierId) fail('This request is not assigned to your transport company.', 409);
        if (ind.status === 'Cancelled' || it.status === 'Cancelled') fail('This request was cancelled.', 409);
        if (it.status !== 'Pending') fail(`This request is already ${it.status.toLowerCase()}.`, 409);
        if (now > Date.parse(it.expiresAt)) fail('This request has expired.', 409);
        return { ind, it };
    }

    const handlers = {
        upsertVehicleType(db, c, u) {
            ensure(db); need(u, 'lane.manage', 'maintain vehicle types');
            const code = str(c.code, 20).toUpperCase() || fail('Vehicle type code is required.');
            // internal cargo size (cm) for the Loading Optimizer: all three or none; a save without sizes keeps the ones already there
            const dimOf = (k, label) => (c[k] === undefined || c[k] === '' || c[k] === null ? 0 : num(c[k], label, { min: 0, max: 2000 }));
            const dims = [dimOf('lengthCm', 'Length (cm)'), dimOf('widthCm', 'Width (cm)'), dimOf('heightCm', 'Height (cm)')];
            if (dims.some((d) => d > 0) && dims.some((d) => !(d > 0))) fail('Give the internal length, width and height together (cm), or leave all three empty.');
            const prev = db.vehicleTypes.find((x) => x.code === code);
            if (!dims.some((d) => d > 0) && prev && prev.lengthCm) dims.splice(0, 3, prev.lengthCm, prev.widthCm, prev.heightCm);
            const hasDims = dims.every((d) => d > 0);
            // volume not given but the size is: derive it from the size
            const vol = c.maxVolumeM3 === undefined || c.maxVolumeM3 === '' || Number(c.maxVolumeM3) === 0
                ? (hasDims ? Math.round((dims[0] * dims[1] * dims[2]) / 1e4) / 100 : num(c.maxVolumeM3, 'Max volume (m3)', { min: 0.1, max: 500 }))
                : num(c.maxVolumeM3, 'Max volume (m3)', { min: 0.1, max: 500 });
            const row = { code, name: str(c.name, 60) || code, maxWeightKg: num(c.maxWeightKg, 'Max weight (kg)', { min: 1, max: 100000 }), maxVolumeM3: vol, ...(hasDims ? { lengthCm: dims[0], widthCm: dims[1], heightCm: dims[2] } : {}) };
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
            const customerId = c.customerId === undefined || c.customerId === null || c.customerId === '' ? '' : str(c.customerId, 20);
            if (customerId && !db.customers.some((x) => x.id === customerId)) fail('Unknown customer.');
            const lane = db.lanes.find((l) => l.id === c.laneId) || fail('Unknown lane.');
            if (!db.vehicleTypes.some((v) => v.code === c.vehicleType)) fail('Unknown vehicle type.');
            const deliveries = (Array.isArray(c.deliveries) ? c.deliveries : []).map((d) => str(d, 12)).filter(Boolean).slice(0, 50);
            const shipping = str(c.shippingType, 2) ? { shippingType: str(c.shippingType, 2) } : {};

            if (Array.isArray(c.allocations) && c.allocations.length) {
                // ---- multi-transporter: one indent, one item per transporter, offered to all at once
                if (c.allocations.length > MAX_ITEMS) fail(`At most ${MAX_ITEMS} transporter lines per indent.`);
                const rows = c.allocations.map((a, i) => cleanAllocation(db, a || {}, i + 1, c.requiredAt, now));
                const ids = rows.map((r) => r.carrier.id);
                if (new Set(ids).size !== ids.length) fail('Each transporter can appear only once on an indent.');
                const total = { cases: rows.reduce((a, r) => a + r.cases, 0), vehicles: rows.reduce((a, r) => a + r.vehicles, 0), qty: Math.round(rows.reduce((a, r) => a + r.qty, 0) * 1e6) / 1e6 };
                const given = (v) => v !== undefined && v !== null && v !== '';
                if (given(c.cases) && Math.abs(Number(c.cases) - total.cases) > EPS) fail(`No. of cases (${c.cases}) does not match the transporter lines (${total.cases}).`);
                if (given(c.vehicles) && Math.abs(Number(c.vehicles) - total.vehicles) > EPS) fail(`No. of vehicles (${c.vehicles}) does not match the transporter lines (${total.vehicles}).`);
                if (given(c.qty) && Math.abs(Number(c.qty) - total.qty) > EPS) fail(`Quantity (${c.qty}) does not match the transporter lines (${total.qty}).`);
                const ind = {
                    id: `IND${++db.seq}`, unitId: c.unitId, laneId: lane.id, fromLocId: lane.fromLocId, toLocId: lane.toLocId, customerId, vehicleType: c.vehicleType, vehicles: total.vehicles, cases: total.cases, ...shipping,
                    requiredAt: iso(Math.min(...rows.map((r) => r.at))), deliveries, material: str(c.material, 60), qty: total.qty, status: 'Open', offers: [], items: [], createdAt: iso(now), createdBy: u.name, remarks: [],
                };
                rows.forEach((r, i) => ind.items.push(makeItem(db, ind, lane, r, (i + 1) * 10, now)));
                const mailRequests = mailRequestsFor(db, ind, ind.items, now);
                db.indents.unshift(ind);
                notify(db, now, 'info', `Indent ${ind.id} raised with ${ind.items.length} transporter line(s): ${ind.items.map((i) => db.carriers.find((x) => x.id === i.carrierId).name).join(', ')}`);
                return { indentId: ind.id, items: ind.items.map((i) => ({ itemNo: i.itemNo, carrierId: i.carrierId })), mailRequests };
            }

            // ---- legacy: one vehicle, offered to the lane's vendors in priority order
            const at = Date.parse(c.requiredAt);
            if (!(at > now)) fail('The required date and time must be in the future.');
            const vehicles = num(c.vehicles ?? 1, 'Vehicles', { min: 1, max: 1 }); // one vehicle per indent in Release 1, so a trip maps to one indent
            const ind = {
                id: `IND${++db.seq}`, unitId: c.unitId, laneId: lane.id, fromLocId: lane.fromLocId, toLocId: lane.toLocId, customerId, vehicleType: c.vehicleType, vehicles,
                ...shipping,
                requiredAt: iso(at), deliveries, material: str(c.material, 60), qty: num(c.qty ?? 1, 'Quantity', { min: 0.1, max: 1000 }), status: 'Open', offers: [], createdAt: iso(now), createdBy: u.name, remarks: [],
            };
            const first = offerNext(db, ind, now);
            db.indents.unshift(ind);
            if (first) notify(db, now, 'info', `Indent ${ind.id} offered to ${db.carriers.find((x) => x.id === first).name}`);
            return { indentId: ind.id, offeredTo: first };
        },

        /** HO adds a transporter line to an existing multi-transporter indent (typically after a Rejected / Expired item). */
        addIndentItem(db, c, u, now) {
            ensure(db); need(u, 'indent.override', 'add a transporter to an indent');
            const ind = indentOf(db, c.id); sees(u, ind);
            if (!ind.items) fail('Only an indent with transporter lines can take another line; use Offer for this one.', 409);
            if (ind.status === 'Cancelled') fail('The indent is cancelled.', 409);
            if (ind.items.length >= MAX_ITEMS) fail(`At most ${MAX_ITEMS} transporter lines per indent.`);
            const row = cleanAllocation(db, c.allocation || {}, ind.items.length + 1, c.allocation && c.allocation.requiredAt, now);
            if (ind.items.some((i) => i.carrierId === row.carrier.id && (i.status === 'Pending' || i.status === 'Submitted'))) fail(`${row.carrier.name} already has an open line on this indent.`, 409);
            const lane = db.lanes.find((l) => l.id === ind.laneId);
            const it = makeItem(db, ind, lane, row, Math.max(0, ...ind.items.map((i) => i.itemNo)) + 10, now);
            // which failed line this one replaces: given, else the only unreplaced Rejected / Expired line (if there is exactly one)
            const failed = ind.items.filter((i) => (i.status === 'Rejected' || i.status === 'Expired') && !i.replacedBy);
            const old = c.replaces !== undefined && c.replaces !== null && c.replaces !== '' ? failed.find((i) => i.itemNo === Number(c.replaces)) || fail('The line to replace must be a Rejected or Expired line that has not been replaced yet.', 409) : (failed.length === 1 ? failed[0] : null);
            if (old) old.replacedBy = it.itemNo;
            ind.items.push(it); recompute(ind);
            const mailRequests = mailRequestsFor(db, ind, [it], now);
            ind.remarks.push(`Line ${it.itemNo} (${row.carrier.name}) added by ${u.name}`);
            notify(db, now, 'info', `Indent ${itemRef(ind, it)} offered to ${row.carrier.name}`);
            return { indentId: ind.id, itemNo: it.itemNo, mailRequests };
        },

        cancelIndent(db, c, u, now) {
            need(u, 'indent.cancel', 'cancel indents');
            const ind = indentOf(db, c.id); sees(u, ind);
            if (ind.status === 'Cancelled') fail('The indent is already cancelled.', 409);
            if (ind.status === 'Vehicle Assigned') fail('A vehicle is already assigned; cancel the shipment instead.', 409);
            ind.status = 'Cancelled'; ind.offers.forEach((o) => { if (o.response === 'Pending') o.response = 'Withdrawn'; });
            ind.remarks.push(`Cancelled by ${u.name}${c.reason ? `: ${str(c.reason, 200)}` : ''}`);
            for (const it of ind.items || []) {
                if (it.status === 'Cancelled') continue;
                if (it.orderId) {
                    const o = db.orders.find((x) => x.id === it.orderId);
                    if (o) o.status = 'Cancelled';
                    db.shipments.filter((s) => s.orderId === it.orderId && s.status !== 'Completed').forEach((s) => { s.status = 'Cancelled'; log(s, now, u.name, 'Indent cancelled'); });
                }
                it.status = 'Cancelled';
            }
            if (ind.items) recompute(ind);
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
            if (ind.items) fail('This indent has transporter lines; add a line for another transporter instead.', 409);
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
            if (ind.items) fail('This indent has transporter lines; use the line (item) screen.', 409);
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

        /** The vendor enters driver name, phone and vehicle number for every vehicle of the line and sends it back: order + one assigned shipment per vehicle. */
        vendorSubmitItem(db, c, u, now) {
            ensure(db);
            if (!isVendor(u) || !can(u, 'indent.respond')) fail('Only carrier users can respond to an indent.', 403);
            const { ind, it } = myPendingItem(db, c, u, now);
            const rows = Array.isArray(c.units) ? c.units : [];
            if (rows.length !== it.vehicles) fail(`Enter the driver and vehicle details for exactly ${it.vehicles} vehicle${it.vehicles === 1 ? '' : 's'}.`);
            const units = rows.map((r, i) => { try { return checkUnit(db, r || {}, []); } catch (e) { e.message = `Vehicle ${i + 1}: ${e.message}`; throw e; } });
            const seen = new Set();
            units.forEach((x, i) => { if (seen.has(x.veh)) fail(`Vehicle ${i + 1}: ${x.veh} is entered twice on this request.`); seen.add(x.veh); });
            const carrier = db.carriers.find((x) => x.id === u.carrierId);
            const price = it.per === 'KG' ? Math.round(it.rate * it.qty * 1000) : it.rate;
            const o = {
                id: `ORD${++db.seq}`, unitId: ind.unitId, customerId: ind.customerId, mode: 'FTL', basis: 'Vehicle', vehicleType: ind.vehicleType, vehicles: it.vehicles,
                stops: [{ type: 'P', locId: ind.fromLocId, at: it.requiredAt }, { type: 'D', locId: ind.toLocId, at: iso(Date.parse(it.requiredAt) + (db.lanes.find((l) => l.id === ind.laneId).transitH || 24) * 3600_000) }],
                material: ind.material, qty: it.qty, uom: 'MT', packages: it.cases, po: '', so: '', project: '', segment: '', odc: false, tolerance: 0, comments: `From indent ${itemRef(ind, it)}`, status: 'Active',
                createdAt: iso(now), createdBy: ind.createdBy, remarks: [`Allocated to ${carrier.name} through indent ${itemRef(ind, it)}`],
            };
            o.oin = `OIN-${o.unitId}-${db.seq}`;
            db.orders.unshift(o);
            const ships = makeShipments(db, o, carrier.id, price, now, `Indent ${itemRef(ind, it)}`);
            const consentRequests = [];
            ships.forEach((s, i) => {
                s.indentId = ind.id; s.indentItem = it.itemNo;
                if (it.per) s.freightRate = { rate: it.rate, per: it.per, currency: it.currency || 'INR' };
                if (ind.shippingType) s.shippingType = ind.shippingType;
                consentRequests.push(applyUnit(db, s, units[i], u, now).consentRequest);
            });
            db.shipments.unshift(...ships);
            Object.assign(it, { status: 'Submitted', submittedAt: iso(now), orderId: o.id, sins: ships.map((s) => s.sin), units: units.map((x) => ({ driver: x.driver, phone: x.phone, vehicleNo: x.veh })) });
            recompute(ind);
            notify(db, now, 'info', `Indent ${itemRef(ind, it)} confirmed by ${carrier.name}: ${ships.length} vehicle(s) assigned (${ships.map((s) => s.sin).join(', ')})`);
            return { orderId: o.id, sins: it.sins, consentRequests };
        },

        /** The transporter cannot take the line. HO is told at once (critical) so it can add another transporter. */
        vendorRejectItem(db, c, u, now) {
            ensure(db);
            if (!isVendor(u) || !can(u, 'indent.respond')) fail('Only carrier users can respond to an indent.', 403);
            const { ind, it } = myPendingItem(db, c, u, now);
            const reason = str(c.reason, 200);
            if (!reason) fail('A reason is required to reject a request.');
            Object.assign(it, { status: 'Rejected', rejectReason: reason, respondedAt: iso(now) });
            recompute(ind);
            notify(db, now, 'crit', `Indent ${itemRef(ind, it)} rejected by ${db.carriers.find((x) => x.id === u.carrierId).name}: ${reason} - HO to add another transporter`);
            return {};
        },
    };

    /** Time-driven part: an unanswered offer moves on. Called from the engine's sweep. */
    function sweepIndents(db, now) {
        ensure(db);
        let moved = 0;
        for (const ind of db.indents) {
            if (ind.items) {
                let changed = false;
                for (const it of ind.items) if (it.status === 'Pending' && now > Date.parse(it.expiresAt)) {
                    it.status = 'Expired'; it.respondedAt = iso(now); changed = true; moved++;
                    notify(db, now, 'crit', `Indent ${itemRef(ind, it)} expired with no answer from ${(db.carriers.find((x) => x.id === it.carrierId) || {}).name || it.carrierId} - HO to add another transporter`);
                }
                if (changed) recompute(ind);
                continue;
            }
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
        const mine = (i) => i.offers.some((o) => o.carrierId === user.carrierId) || (i.items || []).some((x) => x.carrierId === user.carrierId);
        return ensure(db).indents.filter(mine).map((i) => {
            if (!i.items) return { ...i, customerId: '', createdBy: '', remarks: [], offers: i.offers.filter((o) => o.carrierId === user.carrierId) };
            // multi-transporter: only the caller's own lines, and totals that are the caller's own (never other transporters' split, rates, mail or the customer)
            const items = i.items.filter((x) => x.carrierId === user.carrierId).map(({ mail, ...x }) => x);
            const live = items.filter((x) => x.status === 'Pending' || x.status === 'Submitted');
            const status = items.some((x) => x.status === 'Pending') ? 'Open' : items.length && items.every((x) => x.status === 'Submitted') ? 'Allocated' : i.status === 'Cancelled' ? 'Cancelled' : items.some((x) => x.status === 'Submitted') ? 'Partly allocated' : 'Open';
            return {
                id: i.id, unitId: i.unitId, laneId: i.laneId, fromLocId: i.fromLocId, toLocId: i.toLocId, customerId: '', vehicleType: i.vehicleType, ...(i.shippingType ? { shippingType: i.shippingType } : {}),
                requiredAt: items.length ? items.map((x) => x.requiredAt).sort()[0] : i.requiredAt, deliveries: i.deliveries, material: i.material, createdAt: i.createdAt, createdBy: '', remarks: [], offers: [],
                cases: live.reduce((a, x) => a + x.cases, 0), vehicles: live.reduce((a, x) => a + x.vehicles, 0), qty: Math.round(live.reduce((a, x) => a + x.qty, 0) * 1e6) / 1e6,
                status: i.status === 'Cancelled' ? 'Cancelled' : status, items,
            };
        });
    }

    // A vendor sets the vehicle on a shipment that belongs to their carrier. Reuses the engine's own `assign` rules.
    return { handlers, ensure, sweepIndents, vendorIndents, ROLE_PERMS, VENDOR_PERMS, VENDOR_CMDS, DEFAULTS };
}
module.exports = { build };
