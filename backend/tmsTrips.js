/*
   SmarTruck TMS - Outward tracking, trip lifecycle (Release 1, slices 2-6). Companion of tmsOutward.js (indents/offers); same conventions as
   tmsEngine.js: pure logic over the Db object, actor/ids/times from the server, permission per action, unit scope per row, vendor commands
   restricted to the vendor's own carrier, every rule checked BEFORE anything is changed.

   Lifecycle of a trip (a shipment that came from an indent):
     Accepted -> vendorAssign (vehicle, driver, driver consent, ULIP document check) -> Assigned
              -> linkDeliveries (SAP read) + linkShipment (ECC shipment, cost) + loadingCheck (capacity, override/approval)
              -> depart (LR unique per vendor, seal, photo) -> In Transit (tracking token, ETA, ULIP/manual checkpoints)
              -> recordReceipt (arrival, cartons, damage, charges) -> uploadPod (closes the trip) -> submitFreightInvoice (POD, LR, tolerance, mail)
   ECC stays the system of record: nothing here writes to SAP.
*/
const crypto = require('crypto');

const MIME = { 'application/pdf': [0x25, 0x50, 0x44, 0x46], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff] };
const MAX_FILE = 4 * 1024 * 1024;
const ROAD_FACTOR = 1.28;

/** Validates an uploaded file (name, type, size, leading bytes must match the declared type). Returns the decoded size. Throws a plain Error message. */
function checkFile(f) {
    if (!f || typeof f !== 'object') throw new Error('Attach a file.');
    const mime = String(f.mime || '').toLowerCase();
    const sig = MIME[mime];
    if (!sig) throw new Error('Only PDF, PNG or JPEG files are accepted.');
    const b64 = String(f.dataBase64 || '');
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(b64) || b64.length < 8) throw new Error('The file content is not valid.');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX_FILE) throw new Error('The file is larger than 4 MB.');
    if (!sig.every((x, i) => buf[i] === x)) throw new Error('The file content does not match its type.');
    const name = String(f.name || '').replace(/[^\w.\- ]/g, '_').slice(0, 80);
    if (!name) throw new Error('The file needs a name.');
    return { size: buf.length, mime, name };
}

function build(k, outward) {
    const { fail, need, can, inScope, isVendor, str, num, iso, id, log, notify, sees, shipOf, locOf, km, project, completeOrderIfDone, ingestPing } = k;
    /** SAP key of a trip vehicle in ZTMS_TRIP_* (and in ZINSTA_* after cutover): never the same shape as an Instavans SIN (AVQ.../BLU...). */
    const sapSinOf = (s) => `TT-${s.sin}`;
    /** Write the trip vehicle and its invoice list to SAP; failures are kept on the trip (retry from the trip panel), never thrown. */
    async function pushVehicle(s, deps, now) {
        const plant = s.invoicePlant || ((s.invoices || [])[0] || {}).plant || ((s.deliveries || []).find((d) => d.plant) || {}).plant || '';
        if (!plant) { s.sapVehicle = { ok: false, at: iso(now), message: 'No plant known yet (link deliveries or invoices first).' }; return s.sapVehicle; }
        try {
            const r = await deps.sap.writeTripVehicle({ sin: sapSinOf(s), shipmentId: s.indentId || s.orderId || '', plant, vehicleNo: s.vehicleNo, exit: !['Accepted', 'Assigned', 'Towards Pickup', 'At Pickup'].includes(s.status),
                invoices: (s.invoices || []).map((i) => i.no) });
            s.sapVehicle = { ok: !!r.ok, at: iso(now), message: r.message || '', target: r.target || '', ...(r.simulated ? { simulated: true } : {}) };
        } catch (e) { s.sapVehicle = { ok: false, at: iso(now), message: e.message || 'SAP is not reachable.' }; }
        return s.sapVehicle;
    }
    const ensure = outward.ensure;
    const LIVE = ['Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery'];

    const ROLE_PERMS = {
        'Depot User': ['indent.create', 'indent.cancel', 'trip.manage'],
        'Depot Head': ['indent.create', 'indent.cancel', 'trip.manage', 'loading.approve', 'charges.approve'],
        'HO Logistics': ['indent.create', 'indent.cancel', 'indent.override', 'lane.manage', 'ship.update', 'report.view', 'trip.manage', 'loading.approve', 'charges.approve', 'invoice.review', 'settings.manage'],
    };
    const VENDOR_CMDS = ['vendorAssign', 'vendorDepart', 'vendorCheckpoint', 'vendorUploadPod', 'vendorInvoice'];

    /** A vendor may touch only shipments of their own carrier; staff need the permission and the unit. */
    function tripFor(db, u, sin, staffPerm) {
        const s = shipOf(db, sin);
        if (isVendor(u)) { if (s.carrierId !== u.carrierId || !can(u, 'ship.assign.own')) fail('That shipment does not belong to your carrier.', 403); }
        else { need(u, staffPerm || 'trip.manage', 'work on trips'); sees(u, s); }
        return s;
    }
    const staffOnly = (u, perm, what) => { if (isVendor(u)) fail('Carrier users cannot do that.', 403); need(u, perm, what); };
    const hours = (n) => n * 3600_000;
    const maskVeh = (v) => (v && v.length > 6 ? `${v.slice(0, 4)}••${v.slice(-4)}` : v || '');
    const cleanDate = (v, name, now, { future = true } = {}) => { const t = Date.parse(v); if (!Number.isFinite(t)) fail(`${name} is not a valid date.`); if (!future && t > now + 5 * 60000) fail(`${name} cannot be in the future.`); return t; };

    // ------------------------------------------------------------------------------------------------ ETA
    function laneOf(db, s) { return db.lanes.find((l) => l.fromLocId === s.fromLocId && l.toLocId === s.toLocId); }
    /** Planned arrival = departure + lane transit time. ETA = from the last known position: remaining road km / lane average speed. */
    function updateEta(db, s, now) {
        if (!s.departedAt) return;
        const lane = laneOf(db, s);
        const transitH = (lane && lane.transitH) || Math.max(8, (s.km || 400) / 40);
        const planned = Date.parse(s.departedAt) + hours(transitH);
        const to = locOf(db, s.toLocId);
        let eta = planned;
        if (s.pos && s.status === 'In Transit') {
            const speed = lane && lane.distanceKm && lane.transitH ? lane.distanceKm / lane.transitH : 40;
            eta = Math.max(now, Date.parse(s.pos.at)) + hours((km(s.pos, to) * ROAD_FACTOR) / speed);
        }
        s.plannedArrival = iso(planned); s.etaAt = iso(eta);
        const lateH = (eta - planned) / 3600_000;
        s.delayFlag = lateH > ensure(db).settings.delayMarginH;
        s.delayH = Math.max(0, Math.round(lateH * 10) / 10);
    }
    function addEvent(s, ev) {
        s.events = [...(s.events || []), ev].slice(-200);
    }
    function applyPosition(db, s, p, now) {
        const from = locOf(db, s.fromLocId), to = locOf(db, s.toLocId);
        const { t } = project(from, to, p);
        s.pos = { lat: p.lat, lon: p.lon, at: iso(p.at), speed: p.speed || 0, source: p.source };
        s.progress = Math.max(s.progress || 0, Math.min(0.99, t));
        updateEta(db, s, now);
    }

    // ------------------------------------------------------------------------------------------------ handlers
    const handlers = {
        saveSettings(db, c, u) {
            ensure(db); staffOnly(u, 'settings.manage', 'change settings');
            const p = c.settings || {}, cur = db.settings, next = { ...cur };
            const n = (key, lo, hi) => { if (p[key] !== undefined) next[key] = num(p[key], key, { min: lo, max: hi }); };
            n('offerTimeoutH', 1, 72); n('capacityMinPct', 1, 100); n('invoiceTolerancePct', 0, 20); n('delayMarginH', 0, 48); n('unlinkedAlertH', 1, 72);
            if (p.invoiceMailbox !== undefined) { const m = str(p.invoiceMailbox, 120); if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) fail('Enter a valid mailbox address.'); next.invoiceMailbox = m; }
            if (p.consentText !== undefined) { next.consentText = str(p.consentText, 600); next.consentVersion = `v${(parseInt(String(cur.consentVersion || 'v0').slice(1), 10) || 0) + 1}`; }
            db.settings = next;
            return { settings: next };
        },

        /** Pull lanes from SAP: freight condition ZB00 (one row per route x transporter x mode). SAP route end points that are not yet locations are
            added as locations (coordinates to be filled in Settings); truck codes become vehicle types (capacity from the code, volume unset).
            Rows without both end points or with an unknown transporter are reported, not guessed. Vendor rows entered by hand are kept. */
        async syncLanes(db, c, u, now, deps) {
            ensure(db); need(u, 'lane.manage', 'sync lanes');
            const rows = await deps.sap.lanes();
            if (rows && rows.simulated) fail('SAP is not connected, so there is nothing to sync.', 503);
            // a gateway still on the old LaneSet model drops condition record, unit and mode: refuse rather than store per-KG rates as trip rates
            if (rows.length && rows.every((r) => !r.condRecord)) fail('The SAP gateway still serves the old LaneSet model (no condition record, rate unit or mode). Ask Basis to clear the gateway metadata cache for ZTMS_SRV, then sync again.', 503);
            const ALIAS = { BANGALORE: 'BENGALURU', CALCUTTA: 'KOLKATA', BOMBAY: 'MUMBAI', MADRAS: 'CHENNAI', TRICHUR: 'THRISSUR', PONDICHERR: 'PUDUCHERRY', GURGAON: 'GURUGRAM' };
            const title = (x) => x.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
            let locsAdded = 0, vtAdded = 0, carriersAdded = 0;
            const locFor = (code) => {
                const k = String(code || '').trim().toUpperCase();
                if (!k) return null;
                const city = ALIAS[k] || k;
                const hit = db.locs.find((l) => l.id.toUpperCase() === k || String(l.sapPoint || '').toUpperCase() === k || String(l.city).toUpperCase() === city);
                if (hit) return hit.id;
                const id = k.replace(/[^A-Z0-9]+/g, '-').slice(0, 20);
                if (!db.locs.some((l) => l.id === id)) { db.locs.push({ id, city: title(k), state: '', zone: '', lat: 0, lon: 0, pincode: '', sapPoint: k, source: 'sap' }); locsAdded++; }
                return id;
            };
            const isTruck = (v) => !!v && !/^(RTP|ABSL)/.test(v);
            const capKg = (v) => { const m = /(\d+(?:\.\d+)?)\s*(?:MT|T)\b/.exec(v.replace(/-/g, ' ')); return m ? Math.round(Number(m[1]) * 1000) : 0; };
            const PREF = { A973: 0, A964: 1, A972: 2 };
            const by = new Map(), skipped = [], texts = { vehicles: {}, shipping: {} };
            const carByCode = new Map(db.carriers.map((x) => [x.code, x]));
            for (const r of rows) {
                let car = carByCode.get(r.vendor);
                // a service agent with a freight rate but outside account group ZTRP (so not in Sync masters) is added from the rate row
                if (!car && r.vendor && r.vendorName) {
                    car = { id: `C${String(db.carriers.length + 1).padStart(3, '0')}`, name: r.vendorName, code: r.vendor, type: 'Broker', shortName: r.vendorName.split(' ')[0].toUpperCase(), paymentTerms: 'Net 30', weightage: 0, blocked: false, rating: 4, fleet: 0, lanes: [], rejectionPct: 0, fulfilledPct: 100, source: 'sap-lane' };
                    db.carriers.push(car); carByCode.set(r.vendor, car); carriersAdded++;
                }
                if (!car) { skipped.push(`${r.route || '?'} (${r.vendor || 'no vendor'}: transporter not in SAP vendor master)`); continue; }
                if (!(r.rate > 0)) { skipped.push(`${r.route || '?'} (${r.vendor}: no rate)`); continue; }
                const from = locFor(r.fromLoc), to = locFor(r.toLoc);
                if (!from || !to) { skipped.push(`${r.route || '?'} ${r.routeText || ''} (route has no start/end point in SAP)`.replace(/\s+/g, ' ')); continue; }
                if (from === to) { skipped.push(`${r.route} ${r.routeText || ''} (local route: start and end are the same point)`.replace(/\s+/g, ' ')); continue; }
                const vehicleType = isTruck(r.sapVehicle) ? r.sapVehicle : '';
                if (vehicleType && !db.vehicleTypes.some((v) => v.code === vehicleType) && capKg(vehicleType) > 0) {
                    db.vehicleTypes.push({ code: vehicleType, name: r.vehicleText || vehicleType, maxWeightKg: capKg(vehicleType), maxVolumeM3: 0, source: 'sap' }); vtAdded++;
                }
                const key = `${from}|${to}`;
                const e = by.get(key) || { fromLocId: from, toLocId: to, distanceKm: r.distanceKm, transitH: r.transitH, sapRoutes: [], rows: new Map() };
                if (r.route && !e.sapRoutes.includes(r.route)) e.sapRoutes.push(r.route);
                if (!e.distanceKm && r.distanceKm) e.distanceKm = r.distanceKm;
                if (!e.transitH && r.transitH) e.transitH = r.transitH;
                // kept small: the whole document travels to every browser; texts go once into db.sapTexts
                if (r.sapVehicle && r.vehicleText) texts.vehicles[r.sapVehicle] = r.vehicleText;
                if (r.shippingType && r.shippingText) texts.shipping[r.shippingType] = r.shippingText;
                const v = { carrierId: car.id, priority: 0, rate: r.rate, ...(r.currency !== 'INR' ? { currency: r.currency } : {}), per: r.perUnit, ...(r.perQty !== 1 ? { perQty: r.perQty } : {}), ...(vehicleType ? { vehicleType } : {}), sapVehicle: r.sapVehicle,
                    rateBasis: r.rateBasis, shippingType: r.shippingType, sdabw: r.sdabw, shtyp: r.shtyp, route: r.route, condTable: r.condTable, condRecord: r.condRecord, source: 'sap' };
                // one rate per transporter and mode; A973 (route + mode) wins over A964 (also needs transit days) and A972 (no shipping type)
                const mk = [car.id, r.sapVehicle, r.rateBasis, r.shippingType, r.sdabw, r.shtyp].join('|');
                const cur = e.rows.get(mk);
                if (!cur || (PREF[v.condTable] ?? 9) < (PREF[cur.condTable] ?? 9) || ((PREF[v.condTable] ?? 9) === (PREF[cur.condTable] ?? 9) && v.rate < cur.rate)) e.rows.set(mk, v);
                by.set(key, e);
            }
            db.sapTexts = { vehicles: { ...((db.sapTexts || {}).vehicles || {}), ...texts.vehicles }, shipping: { ...((db.sapTexts || {}).shipping || {}), ...texts.shipping } };
            let rates = 0;
            for (const e of by.values()) {
                const lid = `LN-${e.fromLocId}-${e.toLocId}`, i = db.lanes.findIndex((l) => l.id === lid);
                const manual = i >= 0 ? (db.lanes[i].vendors || []).filter((v) => v.source !== 'sap') : [];
                const sapRows = [...e.rows.values()].sort((a, b) => [a.sapVehicle, a.rateBasis, a.shippingType, a.sdabw].join('|').localeCompare([b.sapVehicle, b.rateBasis, b.shippingType, b.sdabw].join('|')) || a.rate - b.rate);
                let grp = '', n = 0;
                for (const v of sapRows) { const g = [v.sapVehicle, v.rateBasis, v.shippingType, v.sdabw].join('|'); n = g === grp ? n + 1 : 1; grp = g; v.priority = n; }
                rates += sapRows.length;
                const row = { id: lid, fromLocId: e.fromLocId, toLocId: e.toLocId, distanceKm: e.distanceKm, transitH: e.transitH, sapRoutes: e.sapRoutes, vendors: [...manual, ...sapRows], syncedAt: iso(now) };
                if (i >= 0) db.lanes[i] = row; else db.lanes.push(row);
            }
            // E-mail of the transporters on the lanes from the A964 freight-condition CDS (vendor master default address). Vendors outside account group ZTRP never come through
            // syncMasters, so their mail address would stay empty. SAP wins over a typed address, an existing address is never blanked, a failure here never fails the sync.
            let emailsFromSap = 0, emailWarning = '';
            try {
                const onLanes = new Set(rows.map((r) => r.vendor).filter(Boolean));
                const mail = new Map();
                if (typeof deps.sap.freightConditions === 'function') {
                    for (let skip = 0; skip < 50000; skip += 5000) {
                        const page = await deps.sap.freightConditions({ condType: 'ZB00', top: 5000, skip });
                        if (!page || page.simulated) break;
                        for (const f of page.rows) if (f.vendor && onLanes.has(f.vendor) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.vendorEmail || '').trim()) && !mail.has(f.vendor)) mail.set(f.vendor, String(f.vendorEmail).trim().toLowerCase());
                        if (page.rows.length < 5000) break;
                    }
                }
                for (const [code, m] of mail) { const car = carByCode.get(code); if (car && car.email !== m) { car.email = m; car.emailSource = 'sap'; emailsFromSap++; } }
            } catch (e) { emailWarning = `E-mail addresses were not read from SAP: ${e.message}`; }
            return { emailsFromSap, ...(emailWarning ? { emailWarning } : {}), lanes: by.size, rates, locationsAdded: locsAdded, vehicleTypesAdded: vtAdded, carriersAdded, skippedCount: skipped.length, skipped: [...new Set(skipped)].slice(0, 50) };
        },

        /* ---------------- Billing invoices on the trip vehicle (replaces Instavans / ZSMART_VEH) ----------------
           Parallel run: SAP keeps them in ZTMS_TRIP_VEH / ZTMS_TRIP_INV only; the Instavans tables are written by SAP only after the cutover
           switch (TVARVC ZTMS_INSTA_WRITE). The SAP key is TT-<sin> so it can never clash with an Instavans SIN. No mail is sent. */

        /** Billing documents of the linked deliveries (not saved): what the depot would put on the vehicle. */
        async findTripInvoices(db, c, u, now, deps) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (isVendor(u)) fail('Invoices are put on the vehicle by the depot.', 403);
            const dl = (s.deliveries || []).map((d) => d.no);
            if (!dl.length) fail('Link the deliveries first, or enter the billing numbers.', 409);
            const r = await deps.sap.tripInvoices({ deliveries: dl });
            if (r.simulated) fail('SAP is not connected, so billing documents cannot be looked up.', 503);
            return { rows: r.rows };
        },

        /** Put the vehicle's complete invoice list on the trip and write it to SAP. The list replaces the previous one (removed ones are flagged in SAP). */
        async setTripInvoices(db, c, u, now, deps) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (isVendor(u)) fail('Invoices are put on the vehicle by the depot.', 403);
            if (s.status === 'Cancelled') fail('This trip is cancelled.', 409);
            if (!s.vehicleNo || s.vehicleNo === '—') fail('Assign the vehicle first.', 409);
            const nos = [...new Set((Array.isArray(c.invoices) ? c.invoices : []).map((x) => str(x, 12).replace(/^0+/, '')))].filter(Boolean);
            if (nos.length > 50 || nos.some((x) => !/^\d{6,10}$/.test(x))) fail('Enter up to 50 billing document numbers (digits only).');
            for (const o of db.shipments) if (o.sin !== s.sin && o.status !== 'Cancelled') for (const i of o.invoices || []) if (nos.includes(i.no)) fail(`Billing document ${i.no} is already on trip ${o.sin} (${o.vehicleNo}).`, 409);
            const plant = str(c.plant, 4).toUpperCase() || (s.invoices && s.invoices[0] && s.invoices[0].plant) || ((s.deliveries || []).find((d) => d.plant) || {}).plant || '';
            let rows = [];
            if (nos.length) {
                const r = await deps.sap.tripInvoices({ billing: nos, plant });
                if (r.simulated) fail('SAP is not connected, so billing documents cannot be checked.', 503);
                for (const no of nos) {
                    const x = r.rows.find((y) => y.no.replace(/^0+/, '') === no) || fail(`Billing document ${no} was not found in SAP.`, 404);
                    if (x.message) fail(x.message, 409);
                    if (x.ttSin && x.ttSin !== sapSinOf(s)) fail(`Billing document ${no} is already on Trip Trail vehicle ${x.ttVehicle} (${x.ttSin}).`, 409);
                    rows.push({ no, plant: x.plant, date: x.date, customer: x.customerName || x.customer, cases: x.cases, value: x.value, currency: x.currency, grossKg: x.grossKg, netKg: x.netKg,
                        ...(x.instaSin ? { instavans: { sin: x.instaSin, vehicle: x.instaVehicle } } : {}) });
                }
            }
            const before = (s.invoices || []).map((i) => i.no);
            s.invoices = rows;
            s.invoicePlant = rows[0] ? rows[0].plant : plant;
            log(s, now, u.name, `Invoices on vehicle: ${nos.length ? nos.join(', ') : 'none'}${before.length ? ` (was ${before.join(', ')})` : ''}`);
            const sap = await pushVehicle(s, deps, now);
            return { count: rows.length, sap };
        },

        /** Re-send the trip vehicle to SAP (after SAP was unreachable). */
        async syncTripVehicle(db, c, u, now, deps) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (isVendor(u)) fail('Only the depot or HO can do this.', 403);
            if (!s.invoices || (!s.invoices.length && !s.sapVehicle)) fail('There are no invoices on this vehicle.', 409);
            const sap = await pushVehicle(s, deps, now);
            if (!sap.ok) fail(`SAP did not take it: ${sap.message}`, 502);
            return { sap };
        },

        /** Parallel run report: each billing document on a Trip Trail or Instavans vehicle, side by side (read only). */
        async parallelCheck(db, c, u, now, deps) {
            ensure(db);
            if (isVendor(u) || !(can(u, 'report.view') || can(u, 'indent.create'))) fail('You cannot view this report.', 403);
            const r = await deps.sap.parallelCheck({ plant: str(c.plant, 4).toUpperCase(), days: Math.min(366, Math.max(1, Number(c.days) || 30)) });
            if (r.simulated) fail('SAP is not connected.', 503);
            return { rows: r.rows };
        },

        async linkDeliveries(db, c, u, now, deps) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (isVendor(u)) fail('Deliveries are linked by the depot.', 403);
            if (['Completed', 'Cancelled'].includes(s.status)) fail('This trip is closed.', 409);
            const nos = [...new Set((Array.isArray(c.deliveries) ? c.deliveries : []).map((x) => str(x, 12)))].filter(Boolean);
            if (!nos.length || nos.length > 50 || nos.some((x) => !/^\d{6,12}$/.test(x))) fail('Enter 1 to 50 delivery numbers (digits only).');
            for (const o of db.shipments) if (o.sin !== s.sin && !['Completed', 'Cancelled'].includes(o.status)) for (const d of o.deliveries || []) if (nos.includes(d.no)) fail(`Delivery ${d.no} is already on trip ${o.sin}.`, 409);
            const r = await deps.sap.deliveries(nos);
            let rows;
            if (r.simulated) {
                const man = Array.isArray(c.manual) ? c.manual : [];
                rows = nos.map((no) => { const m = man.find((x) => str(x.no, 12) === no) || fail(`SAP is not connected: enter cartons, weight and volume for delivery ${no}.`); return { no, shipTo: str(m.shipTo, 60), cartons: num(m.cartons, 'Cartons', { max: 1e6 }), weightKg: num(m.weightKg, 'Weight (kg)', { max: 1e6 }), volumeM3: num(m.volumeM3, 'Volume (m3)', { max: 1e4 }), source: 'manual' }; });
            } else {
                rows = nos.map((no) => { const x = r.rows.find((y) => y.no === no) || fail(`Delivery ${no} was not found in SAP.`, 404); return { ...x, source: 'sap' }; });
            }
            s.deliveries = rows; s.loading = undefined;
            log(s, now, u.name, `Deliveries linked: ${nos.join(', ')}`);
            return { count: rows.length, source: rows[0].source };
        },

        /** Attach the ECC shipment (found via the deliveries / VTTP) and read its cost. Safe to repeat: it refreshes the cost. */
        async linkShipment(db, c, u, now, deps) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (isVendor(u)) fail('The ECC shipment is linked by the depot or HO.', 403);
            const no = str(c.eccShipmentNo, 12);
            if (!/^\d{6,12}$/.test(no)) fail('Enter the ECC shipment number (digits only).');
            if (db.shipments.some((o) => o.sin !== s.sin && o.eccShipmentNo === no && o.status !== 'Cancelled')) fail(`ECC shipment ${no} is already linked to another trip.`, 409);
            const r = await deps.sap.shipment(no);
            let cost, source = 'sap';
            if (r.simulated) {
                need(u, 'indent.override', 'enter an ECC cost by hand');
                cost = { net: num(c.manualNet, 'Shipment cost', { min: 1, max: 1e8 }), tax: num(c.manualTax ?? 0, 'Tax', { max: 1e8 }), currency: 'INR', status: 'manual' }; source = 'manual';
            } else {
                const car = db.carriers.find((x) => x.id === s.carrierId);
                if (r.serviceAgent && car && r.serviceAgent !== car.code) fail(`ECC shipment ${no} belongs to transporter ${r.serviceAgent}, not ${car.name} (${car.code}).`, 409);
                const mine = (s.deliveries || []).map((d) => d.no);
                if (mine.length && r.deliveries && r.deliveries.length && !mine.every((d) => r.deliveries.includes(d))) fail('The linked deliveries are not all on that ECC shipment.', 409);
                if (!r.cost || !(r.cost.net > 0)) fail('SAP has no shipment cost for that shipment yet.', 409);
                cost = { net: r.cost.net, tax: r.cost.tax || 0, currency: r.cost.currency || 'INR', status: r.cost.status || '' };
            }
            s.eccShipmentNo = no; s.eccCost = { ...cost, at: iso(now), source };
            log(s, now, u.name, `ECC shipment ${no} linked (cost ${cost.net + cost.tax} ${cost.currency}, ${source})`);
            return { cost: s.eccCost };
        },

        /** Capacity check: utilisation = max(weight %, volume %). Below the threshold needs a reason and depot-head approval; above 100 % needs HO. */
        loadingCheck(db, c, u, now) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (isVendor(u)) fail('The loading check is done by the depot.', 403);
            if (!s.deliveries || !s.deliveries.length) fail('Link the deliveries first.', 409);
            if (!['Assigned', 'Towards Pickup', 'At Pickup'].includes(s.status)) fail('The loading check applies before departure, once a vehicle is assigned.', 409);
            const vt = db.vehicleTypes.find((v) => v.code === s.vehicleType) || fail(`Vehicle type ${s.vehicleType} has no capacity set; add it under Settings.`, 409);
            const w = s.deliveries.reduce((a, d) => a + d.weightKg, 0), v = s.deliveries.reduce((a, d) => a + d.volumeM3, 0);
            const wPct = (w / vt.maxWeightKg) * 100, vPct = vt.maxVolumeM3 > 0 ? (v / vt.maxVolumeM3) * 100 : 0, eff = Math.max(wPct, vPct); // volume not set (SAP vehicle types): weight only
            const min = db.settings.capacityMinPct, reason = str(c.reason, 300);
            let approval = 'NotNeeded', approvedBy;
            if (eff > 100) {
                if (!can(u, 'indent.override')) fail(`The load is ${eff.toFixed(0)}% of the vehicle; over 100% can only be released by HO.`, 403);
                if (reason.length < 5) fail('Give the reason for sending an overloaded vehicle.');
                approval = 'Approved'; approvedBy = u.name;
            } else if (eff < min) {
                if (reason.length < 5) fail(`The load is ${eff.toFixed(0)}%, below the ${min}% minimum. Give the reason to proceed.`);
                approval = 'Pending';
            }
            s.loading = { weightKg: w, volumeM3: v, weightPct: Math.round(wPct * 10) / 10, volumePct: Math.round(vPct * 10) / 10, effectivePct: Math.round(eff * 10) / 10, minPct: min, reason, approval, approvedBy, at: iso(now), by: u.name };
            log(s, now, u.name, `Loading check ${s.loading.effectivePct}% (${approval === 'NotNeeded' ? 'ok' : approval})`);
            if (approval === 'Pending') notify(db, now, 'warn', `${s.sin}: loaded at ${s.loading.effectivePct}% - depot head approval needed`);
            return { loading: s.loading };
        },
        approveLoading(db, c, u, now) {
            staffOnly(u, 'loading.approve', 'approve under-loaded vehicles');
            const s = shipOf(db, c.sin); sees(u, s);
            if (!s.loading || s.loading.approval !== 'Pending') fail('There is no loading approval pending on this trip.', 409);
            if (c.approve === false && !str(c.remark, 200)) fail('Give a remark when rejecting.');
            s.loading.approval = c.approve === false ? 'Rejected' : 'Approved'; s.loading.approvedBy = u.name;
            log(s, now, u.name, `Loading ${s.loading.approval.toLowerCase()}${c.remark ? `: ${str(c.remark, 200)}` : ''}`);
            return {};
        },

        /** Vendor (own carrier) or depot assigns vehicle and driver. Consent is mandatory; documents are checked through ULIP. Allowed again before departure (vehicle replaced). */
        async vendorAssign(db, c, u, now, deps) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (!['Accepted', 'Assigned'].includes(s.status) || s.departedAt) fail('A vehicle can only be set before departure.', 409);
            const veh = str(c.vehicleNo, 15).toUpperCase().replace(/[\s-]+/g, '');
            if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$/.test(veh)) fail('Enter a valid vehicle registration number, for example AS01AB1234.');
            const phone = str(c.phone, 15).replace(/\D/g, '').slice(-10);
            if (!/^[6-9]\d{9}$/.test(phone)) fail('Enter a valid 10-digit driver mobile number.');
            const driver = str(c.driver, 60) || fail('Driver name is required.');
            if (c.driverConsent !== true) fail('The driver must consent to tracking before the vehicle can be assigned.');
            if (db.shipments.some((x) => x.sin !== s.sin && x.vehicleNo === veh && LIVE.concat('Assigned').includes(x.status))) fail(`Vehicle ${veh} is already on another live trip.`, 409);
            const v = await deps.ulip.validateVehicle(veh, { phone });
            if (!v.ok) fail(`Vehicle documents failed the ULIP check: ${(v.issues || []).join('; ') || 'not valid'}.`, 422);
            const replaced = s.status === 'Assigned' && s.vehicleNo !== veh;
            Object.assign(s, { status: 'Assigned', vehicleNo: veh, driver, phone, lr: s.lr || '', driverConsent: { at: iso(now), by: u.name, version: db.settings.consentVersion || 'v1' }, ulipCheck: { ok: true, simulated: !!v.simulated, at: iso(now), details: v.details || {} } });
            if (replaced) s.loading = undefined;
            log(s, now, u.name, `${replaced ? 'Vehicle replaced with' : 'Vehicle'} ${veh}, driver ${driver}${v.simulated ? ' (ULIP simulated)' : ' (ULIP verified)'}`);
            const ind = db.indents.find((x) => x.id === s.indentId); if (ind) ind.status = 'Vehicle Assigned';
            return { ulip: { simulated: !!v.simulated, details: v.details || {} } };
        },

        /** Departure: LR (unique per vendor), seal, optional photo. Needs a passed (or approved) loading check. Starts tracking and issues the recipient link. */
        async vendorDepart(db, c, u, now, deps) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (s.status !== 'Assigned') fail('Only a trip with an assigned vehicle can depart.', 409);
            if (!s.loading) fail('Do the loading check before departure.', 409);
            if (!['NotNeeded', 'Approved'].includes(s.loading.approval)) fail(`The loading check is ${s.loading.approval.toLowerCase()}; departure is blocked.`, 409);
            const lr = str(c.lrNo, 20).toUpperCase();
            if (!/^[A-Z0-9][A-Z0-9\-/]{2,19}$/.test(lr)) fail('Enter a valid LR number (3-20 letters, digits, - or /).');
            if (db.shipments.some((x) => x.sin !== s.sin && x.carrierId === s.carrierId && x.status !== 'Cancelled' && String(x.lr).toUpperCase() === lr)) fail(`LR ${lr} is already used by this vendor.`, 409);
            const seal = str(c.sealNo, 20);
            let photo;
            if (c.photo) { try { checkFile(c.photo); } catch (e) { fail(e.message); } if (!c.photo.mime.startsWith('image/')) fail('The departure photo must be an image.'); }
            const at = c.departedAt ? cleanDate(c.departedAt, 'Departure time', now, { future: false }) : now;
            if (c.photo) photo = await deps.files.put({ ...c.photo, sin: s.sin, by: u.email || u.name });
            Object.assign(s, { lr, sealNo: seal, departedAt: iso(at), status: 'In Transit', progress: Math.max(s.progress || 0, 0.02), trackToken: crypto.randomBytes(16).toString('hex'), tracking: deps.ulip.simulated() ? 'No GPS' : 'Active', ...(photo ? { departPhoto: photo } : {}) });
            addEvent(s, { at: iso(at), source: 'System', place: locOf(db, s.fromLocId).city, lat: locOf(db, s.fromLocId).lat, lon: locOf(db, s.fromLocId).lon, note: 'Departed' });
            updateEta(db, s, now);
            log(s, now, u.name, `Departed. LR ${lr}${seal ? `, seal ${seal}` : ''}`);
            // vehicle left: mark the SAP trip vehicle as exited (best effort; a failure stays on the trip for retry)
            if (s.invoices && s.invoices.length) await pushVehicle(s, deps, now);
            return { lr, trackToken: s.trackToken, etaAt: s.etaAt };
        },

        /** Manual position (the fallback while ULIP is not live), always labelled Manual. */
        vendorCheckpoint(db, c, u, now) {
            ensure(db);
            const s = tripFor(db, u, c.sin);
            if (s.status !== 'In Transit') fail('Checkpoints can be added while the trip is in transit.', 409);
            let lat, lon, place = str(c.place, 60);
            if (c.locId) { const l = locOf(db, str(c.locId, 20)); lat = l.lat; lon = l.lon; place = place || l.city; }
            else { lat = num(c.lat, 'Latitude', { min: -90, max: 90 }); lon = num(c.lon, 'Longitude', { min: -180, max: 180 }); }
            if (!place) fail('Give the place name.');
            const at = c.at ? cleanDate(c.at, 'Checkpoint time', now, { future: false }) : now;
            if (s.departedAt && at < Date.parse(s.departedAt)) fail('The checkpoint is before departure.');
            addEvent(s, { at: iso(at), source: 'Manual', place, lat, lon, by: u.name });
            if (!s.pos || at >= Date.parse(s.pos.at)) applyPosition(db, s, { lat, lon, at, speed: 0, source: 'MANUAL' }, now);
            log(s, now, u.name, `Manual checkpoint: ${place}`);
            return { etaAt: s.etaAt };
        },

        recordReceipt(db, c, u, now) {
            ensure(db);
            const s = shipOf(db, c.sin); staffOnly(u, 'trip.manage', 'record receipt'); sees(u, s);
            if (!['In Transit', 'At Delivery'].includes(s.status)) fail('Receipt can be recorded once the trip is in transit.', 409);
            const dispatched = (s.deliveries || []).reduce((a, d) => a + d.cartons, 0);
            if (!dispatched) fail('Link the deliveries first so received cartons can be compared.', 409);
            const rec = num(c.cartonsReceived, 'Cartons received', { max: 1e6 }), dmg = num(c.damagedQty ?? 0, 'Damaged cartons', { max: 1e6 });
            const unl = num(c.unloadingCharge ?? 0, 'Unloading charge', { max: 1e7 }), det = num(c.detentionCharge ?? 0, 'Detention charge', { max: 1e7 });
            const remarks = str(c.remarks, 500);
            if (rec + dmg > dispatched && remarks.length < 5) fail(`Received + damaged (${rec + dmg}) is more than dispatched (${dispatched}); a remark is required.`);
            if ((unl > 0 || det > 0) && remarks.length < 5) fail('Unloading and detention charges need a remark.');
            const arrived = c.arrivedAt ? cleanDate(c.arrivedAt, 'Arrival time', now, { future: false }) : now;
            if (s.departedAt && arrived < Date.parse(s.departedAt)) fail('Arrival cannot be before departure.');
            s.receipt = { arrivedAt: iso(arrived), dispatched, cartonsReceived: rec, damagedQty: dmg, shortage: Math.max(0, dispatched - rec - dmg), unloadingCharge: unl, detentionCharge: det, remarks, chargesApproval: unl > 0 || det > 0 ? 'Pending' : 'NotNeeded', by: u.name, at: iso(now) };
            s.status = 'At Delivery'; s.progress = 1; s.arrivedAt = iso(arrived);
            log(s, now, u.name, `Receipt: ${rec} received, ${dmg} damaged of ${dispatched}${s.receipt.shortage ? ` (short ${s.receipt.shortage})` : ''}`);
            if (s.receipt.chargesApproval === 'Pending') notify(db, now, 'info', `${s.sin}: unloading/detention charges await depot head approval`);
            return { receipt: s.receipt };
        },
        approveCharges(db, c, u, now) {
            staffOnly(u, 'charges.approve', 'approve charges');
            const s = shipOf(db, c.sin); sees(u, s);
            if (!s.receipt || s.receipt.chargesApproval !== 'Pending') fail('No charges are waiting for approval.', 409);
            s.receipt.chargesApproval = c.approve === false ? 'Rejected' : 'Approved'; s.receipt.approvedBy = u.name;
            log(s, now, u.name, `Unloading/detention charges ${s.receipt.chargesApproval.toLowerCase()}`);
            return {};
        },

        /** POD closes the trip. Needs receipt first. */
        async vendorUploadPod(db, c, u, now, deps) {
            const s = tripFor(db, u, c.sin);
            if (!s.receipt) fail('Record the receipt before uploading the POD.', 409);
            if (s.status === 'Completed') fail('The POD is already uploaded.', 409);
            try { checkFile(c.file); } catch (e) { fail(e.message); }
            const fileId = await deps.files.put({ ...c.file, sin: s.sin, by: u.email || u.name });
            s.pod = { fileId, name: str(c.file.name, 80), at: iso(now), by: u.name };
            s.ePod = 'Uploaded'; s.status = 'Completed'; s.progress = 1;
            log(s, now, u.name, 'POD uploaded - trip closed');
            completeOrderIfDone(db, s.orderId);
            return { fileId };
        },

        /** Vendor freight invoice: needs POD, matching LR, one live invoice per trip; amount checked against the ECC shipment cost (or agreed lane rate) plus approved charges. */
        async vendorInvoice(db, c, u, now, deps) {
            ensure(db);
            const s = tripFor(db, u, c.sin, 'invoice.review');
            if (!s.pod) fail('A freight invoice can only be submitted after the POD is uploaded.', 409);
            const no = str(c.invoiceNo, 30) || fail('Invoice number is required.');
            const date = cleanDate(c.invoiceDate, 'Invoice date', now, { future: false });
            const amount = num(c.amount, 'Invoice amount', { min: 1, max: 1e8 });
            if (String(str(c.lrNo, 20)).toUpperCase() !== String(s.lr).toUpperCase()) fail(`LR number does not match this trip (${s.lr}).`, 409);
            if (db.invoices.some((i) => i.sin === s.sin && i.status !== 'Disapproved')) fail('An invoice already exists for this trip.', 409);
            if (db.invoices.some((i) => i.carrierId === s.carrierId && i.invoiceNo === no && i.status !== 'Disapproved')) fail(`Invoice ${no} was already submitted by this vendor.`, 409);
            try { checkFile(c.file); } catch (e) { fail(e.message); }
            const extras = s.receipt && s.receipt.chargesApproval === 'Approved' ? s.receipt.unloadingCharge + s.receipt.detentionCharge : 0;
            // per-KG lane rates (SAP ZB00) are priced on the delivered gross weight once deliveries are linked
            const wKg = (s.deliveries || []).reduce((a, d) => a + (d.weightKg || 0), 0);
            const perKg = !s.eccCost && s.freightRate && s.freightRate.per === 'KG' && wKg > 0;
            const basis = s.eccCost ? 'ECC shipment cost' : perKg ? `Lane rate ${s.freightRate.rate}/KG x ${wKg} kg` : 'Agreed lane rate';
            const expected = s.eccCost ? s.eccCost.net + (s.eccCost.tax || 0) : perKg ? Math.round(s.freightRate.rate * wKg * 100) / 100 : s.freight;
            const allowed = expected + extras;
            const variancePct = Math.round(((amount - allowed) / allowed) * 1000) / 10;
            const tol = db.settings.invoiceTolerancePct;
            const within = Math.abs(variancePct) <= tol;
            const fileId = await deps.files.put({ ...c.file, sin: s.sin, by: u.email || u.name });
            const inv = { id: `INV${++db.seq}`, sin: s.sin, carrierId: s.carrierId, unitId: s.unitId, status: 'Pending (Logistics)', amount, miro: '', date: iso(date), vehicleNo: s.vehicleNo, history: [{ at: iso(now), actor: u.name, text: `Submitted by ${isVendor(u) ? 'vendor' : 'HO'} (${variancePct >= 0 ? '+' : ''}${variancePct}% vs ${basis})` }], invoiceNo: no, lrNo: s.lr, expected: Math.round(allowed * 100) / 100, basis, extras, variancePct, review: within ? 'OK' : 'Under Review', fileId, submittedAt: iso(now) };
            db.invoices.unshift(inv);
            if (!within) notify(db, now, 'warn', `Invoice ${no} is ${variancePct}% off the ${basis} (limit ${tol}%) - review needed`);
            const carrier = db.carriers.find((x) => x.id === s.carrierId);
            const mailbox = db.settings.invoiceMailbox || '';
            return { invoiceId: inv.id, within, variancePct, mailRequest: mailbox ? { to: mailbox, subject: `Freight invoice ${no} - ${carrier ? carrier.name : ''} - LR ${s.lr}`, text: `Invoice ${no} dated ${iso(date).slice(0, 10)} for INR ${amount}\nTrip ${s.sin}, vehicle ${s.vehicleNo}, LR ${s.lr}\nExpected (${basis}${extras ? ` + approved charges ${extras}` : ''}): INR ${Math.round(allowed)}\nVariance: ${variancePct}% (${within ? 'within' : 'OUTSIDE'} the ${tol}% tolerance)`, fileId, invoiceId: inv.id } : null, mailSkipped: !mailbox };
        },
        reviewFreightInvoice(db, c, u, now) {
            staffOnly(u, 'invoice.review', 'review invoices');
            const inv = db.invoices.find((i) => i.id === c.id) || fail('Invoice not found.', 404);
            sees(u, inv);
            if (inv.review !== 'Under Review') fail('This invoice is not waiting for review.', 409);
            if (c.decision === 'reject') {
                const why = str(c.remark, 200) || fail('Give the reason for rejecting.');
                inv.review = 'Rejected'; inv.status = 'Disapproved'; inv.history.push({ at: iso(now), actor: u.name, text: `Rejected after review: ${why}` });
            } else if (c.decision === 'approve') {
                inv.review = 'Cleared'; inv.history.push({ at: iso(now), actor: u.name, text: `Variance accepted${c.remark ? `: ${str(c.remark, 200)}` : ''}` });
            } else fail('Decision must be approve or reject.');
            return {};
        },
    };

    // ------------------------------------------------------------------------------------------------ time-driven
    /** Called from the engine's sweep: refresh ETA for trips in transit, flag trips whose ECC shipment is still not linked. */
    function sweepTrips(db, now) {
        ensure(db);
        let unlinked = 0;
        for (const s of db.shipments) {
            if (!s.indentId) continue;
            if (s.status === 'In Transit') updateEta(db, s, now);
            if (!s.eccShipmentNo && !s.unlinkedWarned && ['Assigned', 'In Transit'].includes(s.status) && now - Date.parse(s.log && s.log[0] ? s.log[0].at : iso(now)) > hours(db.settings.unlinkedAlertH)) {
                s.unlinkedWarned = true; unlinked++;
                notify(db, now, 'warn', `Trip ${s.sin} (${s.vehicleNo}) has no ECC shipment linked yet`);
            }
        }
        return unlinked;
    }

    /** Async: ask ULIP for new positions of trips in transit (max 60 per run) and apply them. Errors on one vehicle never stop the rest. */
    async function pollTracking(db, now, deps) {
        ensure(db);
        let updated = 0, failed = 0;
        for (const s of db.shipments.filter((x) => x.status === 'In Transit' && x.indentId && x.vehicleNo).slice(0, 60)) {
            try {
                const from = locOf(db, s.fromLocId), to = locOf(db, s.toLocId);
                const evs = await deps.ulip.track(s.vehicleNo, { from, to, departedAt: s.departedAt, transitH: (laneOf(db, s) || {}).transitH || 24, now });
                const known = new Set((s.events || []).map((e) => e.at));
                const fresh = (evs || []).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon) && Date.parse(e.at) && !known.has(iso(Date.parse(e.at)))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
                for (const e of fresh) addEvent(s, { at: iso(Date.parse(e.at)), source: 'ULIP', place: String(e.place || '').slice(0, 60), lat: e.lat, lon: e.lon });
                const last = fresh[fresh.length - 1];
                if (last) { ingestPing(db, { sin: s.sin, lat: last.lat, lon: last.lon, speed: last.speed || 0, ts: last.at, source: 'GPS' }, now); if (s.pos) s.pos.source = 'ULIP'; updateEta(db, s, now); updated++; }
            } catch { failed++; }
        }
        return { updated, failed };
    }

    /** What the recipient link may show - nothing about the driver, the customer, or the money. */
    function publicTrack(db, token, now) {
        const s = typeof token === 'string' && /^[0-9a-f]{32}$/.test(token) ? db.shipments.find((x) => x.trackToken === token) : null;
        if (!s) return null;
        const done = s.status === 'Completed' || s.status === 'Cancelled';
        if (s.status === 'Cancelled' || (done && now - Date.parse(s.arrivedAt || s.pod && s.pod.at || iso(now)) > hours(6))) return { expired: true };
        const last = (s.events || [])[(s.events || []).length - 1];
        return { status: s.status === 'Completed' ? 'Delivered' : s.status === 'At Delivery' ? 'Arrived' : s.status, from: locOf(db, s.fromLocId).city, to: locOf(db, s.toLocId).city, vehicle: maskVeh(s.vehicleNo), etaAt: s.etaAt || null, plannedArrival: s.plannedArrival || null, delayed: !!s.delayFlag, lastPlace: last ? last.place : '', lastAt: last ? last.at : '', departedAt: s.departedAt || null, deliveredAt: s.status === 'Completed' ? s.arrivedAt : null };
    }

    return { handlers, ROLE_PERMS, VENDOR_CMDS, sweepTrips, pollTracking, publicTrack, updateEta, maskVeh };
}
module.exports = { build, checkFile, MAX_FILE };
