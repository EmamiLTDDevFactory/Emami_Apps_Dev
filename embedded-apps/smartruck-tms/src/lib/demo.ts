import type { Db, Order, Shipment, Invoice, Stop, ShipStatus, Activity, Carrier, Basis, InvStatus, Consent, Tracking, EPod, ShipType } from './types';

/** Fixed "now" so the demo data reads the same on every load (the plan was audited on 19-Nov-2026). */
export const NOW = new Date('2026-11-19T10:00:00+05:30').getTime();
const H = 3600_000;
export const iso = (t: number) => new Date(t).toISOString();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const UNITS = [
  ['UN13', 'Guwahati Unit (Pacharia)', 'East', 'Guwahati'], ['UN01', 'Kolkata Unit (Sodepur)', 'East', 'Kolkata'],
  ['UN04', 'Pantnagar Unit', 'North', 'Pantnagar'], ['UN07', 'Vapi Unit', 'West', 'Vapi'],
  ['UN09', 'Chennai Unit (Sriperumbudur)', 'South', 'Chennai'], ['UN11', 'Indore Depot', 'Central', 'Indore'],
  ['UN15', 'Dankuni Warehouse', 'East', 'Kolkata'], ['UN18', 'Bhiwandi Hub', 'West', 'Mumbai'],
] as const;

const LOCS: [string, string, string, string, number, number, string][] = [
  ['Guwahati', 'Assam', 'NE', 'GAU', 26.14, 91.74, '781101'], ['Kolkata', 'West Bengal', 'East', 'CCU', 22.57, 88.36, '700001'],
  ['Patna', 'Bihar', 'East', 'PAT', 25.59, 85.14, '800001'], ['Lucknow', 'Uttar Pradesh', 'North', 'LKO', 26.85, 80.95, '226001'],
  ['Delhi', 'Delhi', 'North', 'DEL', 28.61, 77.21, '110001'], ['Jaipur', 'Rajasthan', 'North', 'JAI', 26.91, 75.79, '302001'],
  ['Ahmedabad', 'Gujarat', 'West', 'AMD', 23.02, 72.57, '380001'], ['Mumbai', 'Maharashtra', 'West', 'BOM', 19.08, 72.88, '400001'],
  ['Pune', 'Maharashtra', 'West', 'PNQ', 18.52, 73.86, '411001'], ['Indore', 'Madhya Pradesh', 'Central', 'IDR', 22.72, 75.86, '452001'],
  ['Nagpur', 'Maharashtra', 'Central', 'NAG', 21.15, 79.09, '440001'], ['Hyderabad', 'Telangana', 'South', 'HYD', 17.39, 78.49, '500001'],
  ['Bengaluru', 'Karnataka', 'South', 'BLR', 12.97, 77.59, '560001'], ['Chennai', 'Tamil Nadu', 'South', 'MAA', 13.08, 80.27, '600001'],
  ['Bhubaneswar', 'Odisha', 'East', 'BBI', 20.3, 85.82, '751001'], ['Ranchi', 'Jharkhand', 'East', 'IXR', 23.34, 85.31, '834001'],
];

const CARRIER_NAMES = [
  'Elite Roadways Pvt. Ltd.', 'Gati Freight Carriers', 'Shree Maruti Courier', 'Blue Dart Surface Logistics', 'VRL Logistics',
  'Rivigo Fleet Services', 'North East Cargo Movers', 'Safexpress Transport', 'TCI Freight', 'Patel Roadways', 'Om Sai Transport Co.', 'Delhivery Freight',
];
const VEHICLE_TYPES = ['CONT15MT', 'CONT20MT', 'TRUCK9MT', 'TRUCK16MT', 'LCV3MT', 'TRAILER32MT'];
const MATERIALS = ['Navratna Cool Talc', 'Boroplus Antiseptic Cream', 'Zandu Balm', 'Fair & Handsome', 'Kesh King Oil', 'Healthy & Tasty Oil', 'Mentho Plus Balm', 'Packing Material', 'Glycerine (RM)'];
const DRIVERS = ['Ramesh Yadav', 'Suresh Kumar', 'Manoj Singh', 'Dinesh Patel', 'Bablu Das', 'Imran Khan', 'Gurpreet Singh', 'Anil Meena', 'Rajan Nair', 'Karthik S', 'Mahesh Jadhav', 'Pintu Roy'];
const SEGMENTS = ['General Trade', 'Modern Trade', 'E-Commerce', 'CSD', 'Export'];
const ZONES = ['NE', 'East', 'North', 'West', 'South', 'Central'];

const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371, d = Math.PI / 180;
  const x = Math.sin(((b[0] - a[0]) * d) / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(((b[1] - a[1]) * d) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 1.28);
};

const FLOW: ShipStatus[] = ['Requested', 'Accepted', 'Assigned', 'Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Completed'];

export function buildDemoDb(): Db {
  const r = rng(19112026);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const units = UNITS.map(([code, name, division, city]) => ({ id: code, code, name, division, city }));
  const locs = LOCS.map(([city, state, zone, code, lat, lon, pincode]) => ({ id: code, city, state, zone, lat, lon, pincode }));
  const carriers: Carrier[] = CARRIER_NAMES.map((name, i) => ({
    id: `C${String(i + 1).padStart(3, '0')}`, name, code: `V${100200 + i * 7}`, type: pick(['Asset-based', 'Broker', 'Fleet owner']),
    shortName: name.split(' ')[0].toUpperCase(), paymentTerms: pick(['Net 15', 'Net 30', 'Net 45']), weightage: Math.round(100 / CARRIER_NAMES.length),
    blocked: i === 10, rating: Math.round((3.4 + r() * 1.5) * 10) / 10, fleet: 20 + Math.floor(r() * 180),
    lanes: Array.from({ length: 3 + Math.floor(r() * 4) }, () => `${pick(locs).id}-${pick(locs).id}`),
    rejectionPct: Math.round(r() * 14), fulfilledPct: 78 + Math.floor(r() * 21),
  }));
  const customers = ['Reliance Retail', 'DMart (Avenue Supermarts)', 'Big Bazaar Distribution', 'Amazon Fulfilment Centre', 'Flipkart Hub', 'Spencer\'s Retail', 'Metro Cash & Carry', 'CSD Canteen Depot', 'Local Distributor — Siliguri', 'Local Distributor — Raipur']
    .map((name, i) => ({ id: `K${i + 1}`, name, rCode: `R${40010 + i * 13}`, zone: ZONES[i % 6], contact: `98${String(30000000 + Math.floor(r() * 69999999))}`, csl: pick(['Anita Roy', 'Vikram Shah', 'Priya Nair', 'Sanjay Gupta']), segment: pick(SEGMENTS) }));

  let seq = 13000;
  let u13 = 0;
  const CYCLE = [1, 2, 5, 3, 5, 7, 4, 5, 6, 7, 5, 2, 7, 5];
  const orders: Order[] = [];
  const shipments: Shipment[] = [];
  const invoices: Invoice[] = [];
  const actors = ['Amit (Carrier Admin)', 'Neha (Allocation Exec.)', 'System', 'Driver app', 'Control Tower'];

  for (let i = 0; i < 64; i++) {
    seq++;
    const unit = i % 3 === 0 ? units[0] : pick(units);
    const fromLoc = locs.find((l) => l.city === unit.city) ?? pick(locs);
    let toLoc = pick(locs); while (toLoc.id === fromLoc.id) toLoc = pick(locs);
    const forced = unit.id === 'UN13' ? CYCLE[u13++ % CYCLE.length] : null;
    let created = NOW - Math.floor(r() * 9 * 24) * H - Math.floor(r() * 12) * H;
    const isBid = i % 6 === 0;
    const km = haversine([fromLoc.lat, fromLoc.lon], [toLoc.lat, toLoc.lon]);
    let pickupAt = created + (6 + Math.floor(r() * 30)) * H;
    if (forced !== null) {
      pickupAt = forced <= 2 ? NOW + (3 + Math.floor(r() * 20)) * H : forced <= 4 ? NOW - Math.floor(r() * 3) * H : forced === 5 ? NOW - (3 + r() * 10) * H : NOW - (km / 42 + 3 + r() * 40) * H;
      created = Math.min(created, pickupAt - (8 + Math.floor(r() * 10)) * H);
    }
    const stops: Stop[] = [
      { type: 'P', locId: fromLoc.id, at: iso(pickupAt) },
      { type: 'D', locId: toLoc.id, at: iso(pickupAt + Math.max(8, km / 42) * H) },
    ];
    const vehicles = 1 + Math.floor(r() * 3);
    const basis = pick<Basis>(['Vehicle', 'Vehicle', 'Weight', 'Pallet']);
    const order: Order = {
      id: `ORD${seq}`, oin: `OIN-${unit.code}-${seq}`, unitId: unit.id, customerId: pick(customers).id, mode: isBid ? 'BID' : 'FTL', basis,
      vehicleType: pick(VEHICLE_TYPES), vehicles, stops, material: pick(MATERIALS), qty: 8 + Math.floor(r() * 22), uom: 'MT', packages: 200 + Math.floor(r() * 900),
      po: `PO${4500000000 + Math.floor(r() * 99999)}`, so: `SO${1000000 + Math.floor(r() * 99999)}`, project: pick(['PRJ-FY27-A', 'PRJ-FY27-B', '-']),
      segment: pick(SEGMENTS), odc: r() < 0.06, tolerance: 2, comments: '', status: 'Open', createdAt: iso(created), createdBy: pick(actors.slice(0, 2)), remarks: [],
    };
    const bidOpen = isBid && i % 12 === 0;
    if (isBid) {
      const start = Math.round((km * 38 + 4000) / 100) * 100;
      const vendors = carriers.filter((c) => !c.blocked).slice(0, 8 + Math.floor(r() * 4)).map((c) => c.id);
      order.bid = {
        startPrice: start, expiresAt: iso(bidOpen ? NOW + (2 + Math.floor(r() * 5)) * H : created + 6 * H), diffType: 'Percentage', diffValue: 1, paymentTerms: 'Net 30',
        vendors, bids: [], status: bidOpen ? 'Open' : 'Awarded',
      };
      const n = bidOpen ? 3 : 4 + Math.floor(r() * 3);
      let p = start;
      for (let b = 0; b < n; b++) {
        p = Math.round(p * (0.96 + r() * 0.03));
        order.bid.bids.push({ carrierId: vendors[b % vendors.length], price: p, at: iso(created + (b + 1) * 0.6 * H) });
      }
      if (!bidOpen) { const w = order.bid.bids[order.bid.bids.length - 1]; order.bid.winner = w.carrierId; order.bid.awardedPrice = w.price; }
    }
    // Shipments per vehicle requested (open bid and a few fresh orders have none yet).
    const unallocated = bidOpen || (i % 9 === 4) || (i % 9 === 3);
    if (!unallocated) {
      for (let v = 0; v < vehicles; v++) {
        const carrier = order.bid?.winner ? carriers.find((c) => c.id === order.bid!.winner)! : pick(carriers.filter((c) => !c.blocked));
        const ageH = (NOW - pickupAt) / H;
        let fi: number;
        if (forced !== null) fi = forced;
        else if (ageH < -2) fi = pick([0, 1, 2]);
        else if (ageH < 0) fi = pick([2, 3]);
        else if (ageH < 4) fi = pick([4, 5]);
        else if (ageH < Math.max(8, km / 42)) fi = 5;
        else fi = pick([6, 7, 7, 7]);
        const status: ShipStatus = i % 17 === 3 ? 'Cancelled' : i % 23 === 5 ? 'Rejected' : FLOW[fi];
        const assigned = ['Assigned', 'Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Completed'].includes(status);
        const consent: Consent = !assigned ? 'Pending' : pick<Consent>(['Granted', 'Granted', 'Granted', 'Granted', 'Pending', 'Expired', 'Declined']);
        const tracking: Tracking = !assigned ? 'No GPS' : consent === 'Granted' ? pick<Tracking>(['Active', 'Active', 'Active', 'Passive']) : consent === 'Declined' ? 'Non-Tracking' : pick<Tracking>(['Non-Tracking', 'No GPS']);
        const progress = status === 'In Transit' ? 0.15 + r() * 0.7 : status === 'At Delivery' || status === 'Completed' ? 1 : status === 'At Pickup' || status === 'Towards Pickup' ? 0 : 0;
        const delayH = status === 'In Transit' || status === 'Towards Pickup' ? Math.round((r() < 0.5 ? 1 + r() * 25 : 0) * 10) / 10 : status === 'Completed' ? (r() < 0.22 ? Math.round((4 + r() * 14) * 10) / 10 : 0) : 0;
        const driver = pick(DRIVERS);
        const log: Activity[] = [{ at: iso(created + 0.2 * H), actor: order.createdBy, text: 'Order created and shipment requested' }];
        if (fi >= 1 || status === 'Rejected') log.push({ at: iso(created + 1 * H), actor: status === 'Rejected' ? 'Carrier' : 'Amit (Carrier Admin)', text: status === 'Rejected' ? `${carrier.shortName} rejected the shipment` : `${carrier.shortName} accepted shipment on behalf of driver` });
        if (assigned) log.push({ at: iso(created + 2 * H), actor: 'Carrier Admin', text: `Vehicle and driver assigned (${driver})` });
        if (fi >= 3 && assigned) log.push({ at: iso(pickupAt - 2 * H), actor: 'System', text: 'Vehicle started towards pickup' });
        if (fi >= 4 && assigned) log.push({ at: iso(pickupAt), actor: 'System', text: 'Geofence entry — vehicle arrived at pickup' });
        if (fi >= 5 && assigned) log.push({ at: iso(pickupAt + 1.5 * H), actor: 'System', text: 'Geofence exit — loaded, in transit' });
        if (status === 'Completed') log.push({ at: iso(NOW - 3 * H), actor: 'System', text: 'Delivered and geofence completion recorded' });
        const sin = `SIN${seq}${v + 1}`;
        const ePod: EPod = status === 'Completed' ? pick<EPod>(['Pending', 'Uploaded', 'Verified', 'Verified']) : 'Pending';
        const tr = r(); const type: ShipType = tr < 0.62 ? 'Primary' : tr < 0.88 ? 'Secondary' : 'LTL';
        const sh: Shipment = {
          sin, orderId: order.id, unitId: unit.id, type, direction: i % 11 === 6 ? 'Inbound' : 'Outbound', status, carrierId: carrier.id,
          vehicleNo: assigned ? `${pick(['AS01', 'WB02', 'UP32', 'MH04', 'GJ01', 'TN09', 'DL1L'])}${String.fromCharCode(65 + Math.floor(r() * 26))}${String.fromCharCode(65 + Math.floor(r() * 26))}${1000 + Math.floor(r() * 8999)}` : '—',
          vehicleType: order.vehicleType, driver: assigned ? driver : '—', phone: assigned ? `97${String(10000000 + Math.floor(r() * 89999999))}` : '—',
          provider: pick(['Jio', 'Airtel', 'Vi']), consent, consentSince: consent === 'Granted' ? iso(created + 3 * H) : undefined, tracking, ePod,
          freight: order.bid?.awardedPrice ?? Math.round((km * 36 + 3500) / 50) * 50, fromLocId: fromLoc.id, toLocId: toLoc.id, pickupAt: iso(pickupAt),
          progress, delayH, anomaly: status === 'In Transit' && r() < 0.14 ? pick(['Tracking', 'Speed', 'Distance'] as const) : undefined,
          lr: assigned ? `LR${770000 + seq * 3 + v}` : '', km, ewayExpiry: iso(pickupAt + Math.max(24, km / 40 + 12) * H), material: order.material, qty: order.qty,
          customerId: order.customerId, log,
        };
        shipments.push(sh);
        if (status === 'Completed' && r() < 0.8) {
          const pool: InvStatus[] = ['Pending (Logistics)', 'Pending (Finance)', 'Approved', 'Disapproved', 'Billed', 'Ready For Payment', 'Paid'];
          const st = pick(pool);
          invoices.push({
            id: `INV-${unit.code}-${2000 + invoices.length}`, sin, carrierId: carrier.id, unitId: unit.id, status: st, amount: sh.freight, miro: `5105${600000 + invoices.length * 11}`,
            sapDoc: ['Billed', 'Ready For Payment', 'Paid'].includes(st) ? `190${5000000 + invoices.length * 17}` : undefined, date: iso(NOW - (1 + Math.floor(r() * 12)) * 24 * H), vehicleNo: sh.vehicleNo,
            history: [{ at: iso(NOW - 5 * 24 * H), actor: carrier.shortName, text: 'Invoice submitted by carrier' }],
          });
        }
      }
      order.status = shipments.filter((s) => s.orderId === order.id).every((s) => s.status === 'Completed') ? 'Fulfilled' : shipments.some((s) => s.orderId === order.id && s.status === 'Cancelled') && i % 17 === 3 ? 'Cancelled' : 'Active';
    }
    orders.push(order);
  }

  const users = [
    ['Sayontan Das', 'sayontan.das@emamigroup.com', 'Logistics Lead', ['Admin'], units.map((u) => u.id)],
    ['Neha Kapoor', 'neha.kapoor@emamigroup.com', 'Allocation Executive', ['Allocation Executive'], ['UN13', 'UN01']],
    ['Amit Sharma', 'amit.sharma@emamigroup.com', 'Carrier Administrator', ['Carrier Administrator', 'Allocation Executive'], ['UN13', 'UN15', 'UN01']],
    ['Rohit Bansal', 'rohit.bansal@emamigroup.com', 'Finance Executive', ['Finance Executive'], units.map((u) => u.id)],
    ['Meera Iyer', 'meera.iyer@emamigroup.com', 'Finance Manager', ['Finance Administrator', 'Finance Executive'], units.map((u) => u.id)],
    ['Vikash Roy', 'vikash.roy@emamigroup.com', 'Control Tower Analyst', ['Control Tower'], ['UN13']],
    ['Pooja Menon', 'pooja.menon@emamigroup.com', 'Marketing Manager', ['Marketing'], ['UN04', 'UN07']],
  ].map(([name, email, designation, roles, us], i) => ({
    id: `U${i + 1}`, name: name as string, email: email as string, designation: designation as string, roles: roles as string[], units: us as string[], lastSignin: iso(NOW - (i * 7 + 2) * H),
  }));

  const geofences = locs.slice(0, 10).flatMap((l, i) => [
    { id: `GF-P${i}`, name: `${l.city} Plant gate`, type: 'Pickup' as const, locId: l.id, radiusM: 500, completions: 20 + Math.floor(r() * 140) },
    { id: `GF-D${i}`, name: `${l.city} Customer DC`, type: 'Delivery' as const, locId: l.id, radiusM: 800, completions: 15 + Math.floor(r() * 120) },
  ]);

  const notifications = [
    { id: 'N1', at: iso(NOW - 0.4 * H), level: 'crit' as const, text: 'E-way bill expiring in 3h on 2 in-transit shipments (UN13)', read: false },
    { id: 'N2', at: iso(NOW - 1.5 * H), level: 'warn' as const, text: 'SIM consent expired for 4 drivers — resubscribe needed', read: false },
    { id: 'N3', at: iso(NOW - 3 * H), level: 'info' as const, text: 'New bid received on an open bid order', read: false },
    { id: 'N4', at: iso(NOW - 6 * H), level: 'warn' as const, text: '7 carrier invoices waiting for Finance approval > 3 days', read: true },
  ];

  return { units, locs, carriers, customers, orders, shipments, invoices, vouchers: [
    { id: 'PV-1001', carrierId: 'C001', amount: 184500, status: 'Posted', date: iso(NOW - 6 * 24 * H), invoices: [] },
    { id: 'PV-1002', carrierId: 'C004', amount: 96200, status: 'Draft', date: iso(NOW - 2 * 24 * H), invoices: [] },
  ], notes: [
    { id: 'DN-501', kind: 'Debit', carrierId: 'C002', amount: 4200, reason: 'Damage / shortage claim', date: iso(NOW - 4 * 24 * H), sin: shipments[3]?.sin ?? '' },
    { id: 'CN-210', kind: 'Credit', carrierId: 'C005', amount: 1800, reason: 'Detention reimbursement', date: iso(NOW - 3 * 24 * H), sin: shipments[8]?.sin ?? '' },
  ], users, notifications, geofences, seq };
}
