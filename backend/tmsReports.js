/*
   SmarTruck TMS reports (Phase 4). The live system has 40+ canned reports in 9 categories behind "Report Type -> View / Generate". Each is a
   named pure function of the user's scoped database -> rows ([{column: value}]), so it is testable and can run against a read replica
   (tms.js passes it the snapshot; nothing here writes). Adding a report = one entry in DEFS.
*/
const FLOW = ['Requested', 'Accepted', 'Assigned', 'Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Completed'];
const day = (s) => String(s || '').slice(0, 10);
const hrs = (a, b) => Math.round(((Date.parse(b) - Date.parse(a)) / 3600_000) * 10) / 10;

function ctx(db, now) {
    const city = (i) => (db.locs.find((l) => l.id === i) || {}).city || i;
    const carrier = (i) => (db.carriers.find((c) => c.id === i) || {}).name || i;
    const cust = (i) => (db.customers.find((c) => c.id === i) || {}).name || i;
    const ship = (s) => ({ SIN: s.sin, Order: s.orderId, Unit: s.unitId, Type: s.type, Status: s.status, Carrier: carrier(s.carrierId), Vehicle: s.vehicleNo, From: city(s.fromLocId), To: city(s.toLocId), 'Pickup': day(s.pickupAt), 'Freight (INR)': s.freight });
    return { db, now, city, carrier, cust, ship, ships: db.shipments, orders: db.orders, invs: db.invoices };
}

const DEFS = {
    ORDERS: {
        'To Be Allocated': (c) => c.orders.filter((o) => o.status === 'Open' && o.mode === 'FTL').map((o) => ({ Order: o.id, Unit: o.unitId, From: c.city(o.stops[0].locId), To: c.city(o.stops[o.stops.length - 1].locId), Vehicles: o.vehicles, Type: o.vehicleType, Pickup: day(o.stops[0].at), 'Hours to pickup': hrs(new Date(c.now).toISOString(), o.stops[0].at) })),
        'Non Placement Report': (c) => c.orders.filter((o) => o.status === 'Open' && Date.parse(o.stops[0].at) < c.now).map((o) => ({ Order: o.id, Unit: o.unitId, Customer: c.cust(o.customerId), From: c.city(o.stops[0].locId), 'Pickup was due': day(o.stops[0].at), 'Hours overdue': hrs(o.stops[0].at, new Date(c.now).toISOString()) })),
        'Indent And Placement': (c) => c.orders.map((o) => { const n = c.ships.filter((s) => s.orderId === o.id && s.status !== 'Cancelled').length; return { Order: o.id, Unit: o.unitId, Indented: o.vehicles, Placed: n, 'Placement %': Math.round((n / o.vehicles) * 100) }; }),
    },
    'LTL ORDERS': {
        Orders: (c) => c.ships.filter((s) => s.type === 'LTL').map(c.ship),
        Logs: (c) => c.ships.filter((s) => s.type === 'LTL').flatMap((s) => (s.log || []).map((l) => ({ SIN: s.sin, At: l.at.slice(0, 16).replace('T', ' '), Actor: l.actor, Event: l.text }))),
        ActivityTimeline: (c) => c.ships.filter((s) => s.type === 'LTL').flatMap((s) => (s.log || []).map((l) => ({ SIN: s.sin, At: l.at.slice(0, 16).replace('T', ' '), Actor: l.actor, Event: l.text }))),
    },
    'SHIPMENTS / MIS': {
        'EnRoute Vehicles Status': (c) => c.ships.filter((s) => s.status === 'In Transit').map((s) => ({ ...c.ship(s), Driver: s.driver, 'Progress %': Math.round(s.progress * 100), 'Delay (h)': s.delayH })),
        'EnRoute All Unit Vehicles Status': (c) => c.ships.filter((s) => ['Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery'].includes(s.status)).map((s) => ({ ...c.ship(s), 'Delay (h)': s.delayH })),
        'Shipment Summary': (c) => c.ships.map(c.ship),
        'Trip Sheet Report': (c) => c.ships.filter((s) => s.lr).map((s) => ({ LR: s.lr, SIN: s.sin, Vehicle: s.vehicleNo, Driver: s.driver, From: c.city(s.fromLocId), To: c.city(s.toLocId), 'Distance (km)': s.km, Material: s.material, 'Qty (MT)': s.qty })),
        'Delay Report': (c) => c.ships.filter((s) => s.delayH > 0).map((s) => ({ ...c.ship(s), 'Delay (h)': s.delayH, Reason: s.delayReason || '' })),
        'On Time Delivery Report': (c) => c.ships.filter((s) => s.status === 'Completed').map((s) => ({ ...c.ship(s), 'On time': s.delayH < 4 ? 'Yes' : 'No', 'Delay (h)': s.delayH })),
        'Halt Report': (c) => c.ships.filter((s) => ['At Pickup', 'At Delivery'].includes(s.status)).map(c.ship),
        'Daily Vehicle Halt': (c) => c.ships.filter((s) => ['At Pickup', 'At Delivery'].includes(s.status)).map((s) => ({ Date: day(new Date(c.now).toISOString()), Vehicle: s.vehicleNo, Location: s.status === 'At Pickup' ? c.city(s.fromLocId) : c.city(s.toLocId), Stage: s.status })),
        'Damages/Shortages Claim': (c) => c.db.notes.filter((n) => n.kind === 'Debit').map((n) => ({ Note: n.id, Carrier: c.carrier(n.carrierId), SIN: n.sin, Reason: n.reason, 'Amount (INR)': n.amount, Date: day(n.date) })),
        'Pending EPODs Report': (c) => c.ships.filter((s) => s.status === 'Completed' && s.ePod === 'Pending').map(c.ship),
        'EPODs JDE Report': (c) => c.ships.filter((s) => s.status === 'Completed' && s.ePod !== 'Pending').map((s) => ({ SIN: s.sin, Order: s.orderId, LR: s.lr, ePOD: s.ePod, Carrier: c.carrier(s.carrierId), 'Freight (INR)': s.freight })),
        'Epod Status': (c) => c.ships.filter((s) => s.status === 'Completed').map((s) => ({ ...c.ship(s), ePOD: s.ePod })),
        'Delivery Epods Report': (c) => c.ships.filter((s) => s.status === 'Completed' && s.ePod === 'Verified').map(c.ship),
        'Vehicle Temperature': (c) => c.ships.filter((s) => s.status === 'In Transit').map((s) => ({ Vehicle: s.vehicleNo, SIN: s.sin, Material: s.material, 'Temp (C)': '', Note: 'No temperature sensor feed connected' })),
        'Consent Report': (c) => c.ships.filter((s) => s.driver !== '—').map((s) => ({ SIN: s.sin, Driver: s.driver, Phone: s.phone, Provider: s.provider, Consent: s.consent, 'Subscribed on': day(s.consentSince) })),
        'ETA Performance Report': (c) => c.ships.filter((s) => ['In Transit', 'Completed'].includes(s.status)).map((s) => ({ ...c.ship(s), 'Delay (h)': s.delayH, 'ETA met': s.delayH <= 0 ? 'Yes' : 'No' })),
        'Penalty Amount Report': (c) => c.ships.filter((s) => s.status === 'Completed' && s.delayH > 4).map((s) => ({ ...c.ship(s), 'Delay (h)': s.delayH, 'Penalty (INR)': Math.round(s.freight * Math.min(0.1, s.delayH * 0.005)) })),
        'Billing Report': (c) => c.ships.filter((s) => s.status === 'Completed').map((s) => { const i = c.invs.find((x) => x.sin === s.sin); return { ...c.ship(s), Invoice: i ? i.id : '', 'Invoice status': i ? i.status : 'Not invoiced' }; }),
    },
    'DRIVER & VEHICLE': {
        'Driver Activity': (c) => c.ships.filter((s) => s.driver !== '—').map((s) => ({ Driver: s.driver, Phone: s.phone, SIN: s.sin, Status: s.status, 'Distance (km)': s.km })),
        'Vehicle Trip': (c) => c.ships.filter((s) => s.vehicleNo !== '—').map((s) => ({ Vehicle: s.vehicleNo, SIN: s.sin, From: c.city(s.fromLocId), To: c.city(s.toLocId), 'Distance (km)': s.km, Status: s.status })),
        'Vehicle Service': () => [],
        'Vehicle Maintenance Report': () => [],
        'Driver Expenses Report': () => [],
    },
    FREIGHT: {
        'Freight Provision': (c) => c.ships.filter((s) => s.status === 'Completed' && !c.invs.some((i) => i.sin === s.sin)).map((s) => ({ ...c.ship(s), 'Provision (INR)': s.freight })),
        'Pending Freight Report': (c) => c.invs.filter((i) => !['Paid', 'Disapproved'].includes(i.status)).map((i) => ({ Invoice: i.id, Carrier: c.carrier(i.carrierId), Status: i.status, 'Amount (INR)': i.amount, 'Age (days)': Math.floor((c.now - Date.parse(i.date)) / 86400_000) })),
        'Freight Reconciliation': (c) => c.invs.map((i) => { const s = c.ships.find((x) => x.sin === i.sin); return { Invoice: i.id, SIN: i.sin, 'Invoice (INR)': i.amount, 'Shipment (INR)': s ? s.freight : '', Difference: s ? i.amount - s.freight : '', 'SAP doc': i.sapDoc || '' }; }),
        'Carrier Invoice': (c) => c.invs.map((i) => ({ Invoice: i.id, Carrier: c.carrier(i.carrierId), Unit: i.unitId, Status: i.status, 'SAP doc': i.sapDoc || '', 'Amount (INR)': i.amount, Date: day(i.date) })),
    },
    OTHERS: {
        'User Last Login Details': (c) => c.db.users.map((u) => ({ User: u.name, Email: u.email, Roles: (u.roles || []).join('; '), 'Last sign-in': String(u.lastSignin || '').slice(0, 16).replace('T', ' ') })),
        'WareHouse Temperature': () => [],
        'Tracking Report': (c) => c.ships.filter((s) => s.pos).map((s) => ({ SIN: s.sin, Vehicle: s.vehicleNo, Lat: s.pos.lat, Lon: s.pos.lon, 'Last ping': s.pos.at.slice(0, 16).replace('T', ' '), Source: s.pos.source, Tracking: s.tracking })),
        'Mykl MIS': (c) => c.ships.map((s) => ({ SIN: s.sin, Status: s.status, Carrier: c.carrier(s.carrierId), Freight: s.freight })),
        'Location Master': (c) => c.db.locs.map((l) => ({ Code: l.id, City: l.city, State: l.state, Zone: l.zone, Pincode: l.pincode })),
        'Invoice Reports': (c) => c.invs.map((i) => ({ Invoice: i.id, Status: i.status, 'Amount (INR)': i.amount })),
    },
    'BIDDING REPORTS': {
        'Bidding Reports': (c) => c.orders.filter((o) => o.bid).map((o) => ({ Order: o.id, Status: o.bid.status, 'Start (INR)': o.bid.startPrice, Bids: o.bid.bids.length, 'Lowest (INR)': o.bid.bids.length ? Math.min(...o.bid.bids.map((b) => b.price)) : '', 'Awarded (INR)': o.bid.awardedPrice || '', Winner: o.bid.winner ? c.carrier(o.bid.winner) : '', 'Saving %': o.bid.awardedPrice ? Math.round((1 - o.bid.awardedPrice / o.bid.startPrice) * 100) : '' })),
    },
    'INVOICE REPORTS': {
        'Invoice Approved Details': (c) => c.invs.filter((i) => ['Approved', 'Billed', 'Ready For Payment', 'Paid'].includes(i.status)).map((i) => ({ Invoice: i.id, Carrier: c.carrier(i.carrierId), Status: i.status, 'SAP doc': i.sapDoc || '', 'Amount (INR)': i.amount, Approved: (i.history.filter((h) => /Approved|Billed|Paid/.test(h.text)).slice(-1)[0] || {}).at || '' })),
    },
};

const catalog = () => Object.fromEntries(Object.entries(DEFS).map(([k, v]) => [k, Object.keys(v)]));
const count = () => Object.values(DEFS).reduce((a, v) => a + Object.keys(v).length, 0);
/** Notes: reports with no data source in this system (vehicle service/maintenance, driver expenses, warehouse temperature) return no rows by design. */
function run(name, db, now = Date.now()) {
    for (const group of Object.values(DEFS)) if (Object.prototype.hasOwnProperty.call(group, name)) return group[name](ctx(db, now));
    return null;
}
module.exports = { catalog, count, run, DEFS, FLOW };
