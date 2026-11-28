// Phase 1 indents (docs/PHASE1_TRIP_TRAIL_DOC.md): pure helpers for the multi-transporter indent form, the item rows, the vendor's
// driver / vehicle grid, and the DEMO-mode mirror of the server commands (createIndent with allocations, vendorSubmitItem,
// vendorRejectItem, cancelIndent). No React, no DOM: it runs under `node --test` and in the browser.
// The live server (backend/tmsOutward.js + tmsEngine.js) is the authority; every rule here copies one of its rules so the
// screens give the same answer before the request is sent. Phone / vehicle checks are copied from tmsEngine.js assign().

export const MAX_ALLOCATIONS = 20;
export const PHONE_RE = /^[6-9]\d{9}$/;
export const VEHICLE_RE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$/;

export const normPhone = (v) => String(v ?? '').slice(0, 15).replace(/\D/g, '');
export const normVehicle = (v) => String(v ?? '').slice(0, 15).toUpperCase().replace(/\s+/g, '');
export const itemLabel = (indentId, itemNo) => `${indentId}-${itemNo}`;

/** One driver/vehicle row: '' when valid, else the message the vendor sees. */
export function validateUnit(u) {
  if (!String(u?.driver ?? '').trim()) return 'Enter the driver name.';
  if (!PHONE_RE.test(normPhone(u?.phone))) return 'Enter a valid 10-digit driver mobile number.';
  if (!VEHICLE_RE.test(normVehicle(u?.vehicleNo))) return 'Enter a valid vehicle registration number, for example AS01AB1234.';
  return '';
}

/** All rows of one item: per-row messages and a duplicate-vehicle check inside the item. */
export function validateUnits(units, vehicles) {
  const rowErrors = (units || []).map(validateUnit);
  const seen = new Map();
  (units || []).forEach((u, i) => {
    const v = normVehicle(u.vehicleNo);
    if (!v) return;
    if (seen.has(v)) { if (!rowErrors[i]) rowErrors[i] = `Vehicle ${v} is entered twice.`; } else seen.set(v, i);
  });
  const errors = [];
  if ((units || []).length !== vehicles) errors.push(`This request needs exactly ${vehicles} vehicle${vehicles === 1 ? '' : 's'}.`);
  return { rowErrors, errors, ok: !errors.length && rowErrors.every((e) => !e) };
}

// ---------------------------------------------------------------------------------------------------- the create form
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const r3 = (x) => Math.round(x * 1000) / 1000;

export const emptyRow = (requiredAt = '') => ({ carrierId: '', cases: '', vehicles: '1', qty: '', requiredAt });

export function totals(rows) {
  let cases = 0, vehicles = 0, qty = 0;
  for (const r of rows) {
    const c = num(r.cases), v = num(r.vehicles), q = num(r.qty);
    if (Number.isFinite(c)) cases += c;
    if (Number.isFinite(v)) vehicles += v;
    if (Number.isFinite(q)) qty += q;
  }
  return { cases: r3(cases), vehicles: r3(vehicles), qty: r3(qty) };
}

/** Optional targets the user typed first; remaining = target - distributed (null when no target typed). */
export function remaining(targets, t) {
  const f = (k) => { const x = num(targets?.[k]); return Number.isFinite(x) ? r3(x - t[k]) : null; };
  return { cases: f('cases'), vehicles: f('vehicles'), qty: f('qty') };
}

/** Everything the Raise button needs. `now` in ms. rowErrors[i] is the first problem on row i; errors are form level. */
export function validateIndentForm({ laneId, vehicleType, rows, targets, now }) {
  const errors = [], rowErrors = rows.map(() => '');
  if (!laneId) errors.push('Choose the lane.');
  if (!vehicleType) errors.push('Choose the vehicle type.');
  if (!rows.length) errors.push('Add at least one transporter.');
  if (rows.length > MAX_ALLOCATIONS) errors.push(`At most ${MAX_ALLOCATIONS} transporters per indent.`);
  const seen = new Set();
  rows.forEach((r, i) => {
    const bad = (m) => { if (!rowErrors[i]) rowErrors[i] = m; };
    if (!r.carrierId) bad('Choose a transporter.');
    else if (seen.has(r.carrierId)) bad('This transporter is already on another line.');
    else seen.add(r.carrierId);
    const c = num(r.cases), v = num(r.vehicles), q = num(r.qty);
    if (!Number.isFinite(c) || c < 0 || !Number.isInteger(c)) bad('No. of cases must be a whole number, 0 or more.');
    if (!Number.isFinite(v) || v < 1 || !Number.isInteger(v)) bad('No. of vehicles must be a whole number, 1 or more.');
    if (!Number.isFinite(q) || q <= 0) bad('Quantity (MT) must be more than 0.');
    const at = Date.parse(r.requiredAt);
    if (!r.requiredAt || !Number.isFinite(at)) bad('Enter the required date and time.');
    else if (!(at > now)) bad('The required date and time must be in the future.');
  });
  const t = totals(rows), rem = remaining(targets, t);
  const label = { cases: 'No. of cases', vehicles: 'No. of vehicles', qty: 'Quantity (MT)' };
  for (const k of ['cases', 'vehicles', 'qty']) {
    if (String(targets?.[k] ?? '').trim() !== '' && !Number.isFinite(num(targets[k]))) errors.push(`${label[k]} target is not a number.`);
    else if (rem[k] !== null && Math.abs(rem[k]) > 1e-9) errors.push(rem[k] > 0 ? `${rem[k]} of ${label[k].toLowerCase()} still to distribute.` : `${label[k]} is over the target by ${-rem[k]}.`);
  }
  return { ok: !errors.length && rowErrors.every((e) => !e), errors, rowErrors, totals: t, remaining: rem };
}

/** The createIndent command exactly as the contract names it. Targets are sent only when typed (the server checks they match). */
export function buildCreateCommand({ unitId, laneId, vehicleType, shippingType, material, deliveries, rows, targets }) {
  const allocations = rows.map((r) => ({ carrierId: r.carrierId, cases: Number(r.cases), vehicles: Number(r.vehicles), qty: Number(r.qty), requiredAt: new Date(r.requiredAt).toISOString() }));
  const earliest = allocations.map((a) => a.requiredAt).sort()[0];
  const typed = (k) => String(targets?.[k] ?? '').trim() !== '';
  return {
    type: 'createIndent', unitId, laneId, vehicleType, ...(shippingType ? { shippingType } : {}), material: String(material || '').trim(),
    deliveries: String(deliveries || '').split(/[\s,]+/).filter(Boolean), requiredAt: earliest, allocations,
    ...(typed('cases') ? { cases: Number(targets.cases) } : {}), ...(typed('vehicles') ? { vehicles: Number(targets.vehicles) } : {}), ...(typed('qty') ? { qty: Number(targets.qty) } : {}),
  };
}

/** Lane-ranked transporter choices for the select: carriers with a lane rate for this mode first (priority, then rate), then the rest. Blocked carriers are never offered. */
export function rankedCarriers(db, laneId, vehicleType, shippingType) {
  const lane = (db.lanes || []).find((l) => l.id === laneId);
  const fit = ((lane && lane.vendors) || [])
    .filter((v) => (!v.vehicleType || v.vehicleType === vehicleType) && (!shippingType || !v.shippingType || v.shippingType === shippingType))
    .sort((a, b) => (a.vehicleType === vehicleType ? 0 : 1) - (b.vehicleType === vehicleType ? 0 : 1) || a.priority - b.priority || a.rate - b.rate);
  const byCarrier = new Map();
  for (const v of fit) if (!byCarrier.has(v.carrierId)) byCarrier.set(v.carrierId, v);
  const ok = (c) => c && !c.blocked;
  const ranked = [...byCarrier.entries()].map(([id, v]) => ({ carrier: (db.carriers || []).find((c) => c.id === id), rate: v })).filter((x) => ok(x.carrier));
  const rest = (db.carriers || []).filter((c) => ok(c) && !byCarrier.has(c.id)).map((c) => ({ carrier: c, rate: null }));
  return [...ranked, ...rest];
}


/** Transit time of a lane rate row as text: the SAP days of the freight condition (ZDays, A964) when it has them, else the lane's transit hours. */
export function transitText(v, lane) {
  const d = Number(v && v.zdays);
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}`;
  const h = Number(lane && lane.transitH);
  return h > 0 ? (h >= 48 ? `${Math.round(h / 24)} days` : `${h} h`) : '';
}

/** Transporters that have a freight rate on the lane for this vehicle type / shipping type: one entry per carrier (best row: exact vehicle, priority, lowest rate)
 *  with all its rate rows, so the screen can show the full rate detail. Blocked carriers are never offered. */
export function laneOffers(db, laneId, vehicleType, shippingType) {
  const lane = (db.lanes || []).find((l) => l.id === laneId);
  if (!lane) return [];
  const rows = (lane.vendors || []).filter((v) => (!v.vehicleType || v.vehicleType === vehicleType) && (!shippingType || !v.shippingType || v.shippingType === shippingType))
    .sort((a, b) => (a.vehicleType === vehicleType ? 0 : 1) - (b.vehicleType === vehicleType ? 0 : 1) || a.priority - b.priority || a.rate - b.rate);
  const by = new Map();
  for (const v of rows) { const e = by.get(v.carrierId) || []; e.push(v); by.set(v.carrierId, e); }
  return [...by.entries()].map(([id, list]) => ({ carrier: (db.carriers || []).find((c) => c.id === id), rate: list[0], rows: list, transit: transitText(list[0], lane) })).filter((x) => x.carrier && !x.carrier.blocked);
}

// ---------------------------------------------------------------------------------------------------- list / status helpers
const counts = (i) => (i.status === 'Pending' || i.status === 'Submitted') && !i.replacedBy;   // a line that still counts: live, not replaced
/** Lines HO still has to act on: rejected / expired and not yet replaced. */
export const lostItems = (ind) => (ind.items || []).filter((i) => (i.status === 'Rejected' || i.status === 'Expired') && !i.replacedBy);
/** Same rules as the server: Open = nothing submitted (all lines lost => escalated); Partly allocated = some submitted but not all live lines (a Pending line counts as not submitted);
 *  Allocated = every live line is submitted; Cancelled = every line cancelled. Totals follow the live lines (Pending + Submitted). */
export const recomputeStatus = (ind) => {
  if (!(ind.items || []).length) return ind.status;
  const all = ind.items, live = all.filter(counts);
  if (all.every((i) => i.status === 'Cancelled')) { ind.status = 'Cancelled'; ind.escalated = false; return ind.status; }
  const sub = live.filter((i) => i.status === 'Submitted').length;
  const sum = (k) => Math.round(live.reduce((x, i) => x + i[k], 0) * 1000) / 1000;
  ind.cases = sum('cases'); ind.vehicles = sum('vehicles'); ind.qty = sum('qty');
  if (live.length) ind.requiredAt = live.map((i) => i.requiredAt).sort()[0];
  ind.status = live.length && sub === live.length ? 'Allocated' : sub > 0 ? 'Partly allocated' : 'Open';
  ind.escalated = live.length === 0 && lostItems(ind).length > 0;
  return ind.status;
};
export const needsHo = (ind) => !!ind.escalated || (ind.status !== 'Cancelled' && lostItems(ind).length > 0);

/** Mail status label for an item. */
export function mailLabel(m) {
  if (!m) return { text: '—', tone: 'gray' };
  if (m.sent) return { text: 'Sent', tone: 'green' };
  if (m.error) return /e-?mail/i.test(m.error) ? { text: 'No e-mail', tone: 'amber' } : { text: 'Failed', tone: 'red' };
  if (m.simulated) return { text: 'Not sent (simulated)', tone: 'gray' };
  return { text: 'Not sent', tone: 'gray' };
}

/** What a vendor may see (mirrors the server's vendorIndents): only indents that have a line for their carrier, only those lines (without the mail outcome), and cases / vehicles /
 *  qty / status / required time computed from their own lines. Nothing about the customer, other transporters, remarks or who raised it. */
export function vendorView(indents, carrierId) {
  if (!carrierId) return [];
  return (indents || []).filter((i) => (i.items || []).some((x) => x.carrierId === carrierId))
    .map((i) => {
      const items = i.items.filter((x) => x.carrierId === carrierId).map(({ mail, ...rest }) => rest);
      const v = { ...i, customerId: '', createdBy: '', remarks: [], offers: [], items };
      recomputeStatus(v);
      return v;
    });
}

// ---------------------------------------------------------------------------------------------------- DEMO mirror of the commands
// Each takes the whole demo Db and returns { db, result } with a NEW db (the store sets it) or throws Error(message) with the same text the server would send.
const fail = (m) => { throw new Error(m); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const iso = (t) => new Date(t).toISOString();
const perms = (user, roleMap) => { const s = new Set(); for (const r of user.roles || []) (roleMap[r] || []).forEach((p) => s.add(p)); return s; };
const can = (user, roleMap, p) => { if ((user.roles || []).includes('Admin')) return true; return perms(user, roleMap).has(p); };

export function demoCreateIndent(db0, c, user, now, roleMap) {
  if (!can(user, roleMap, 'indent.create')) fail('Your role does not have permission to raise indents.');
  const db = clone(db0); db.indents ||= []; db.notifications ||= [];
  if (!(user.units || []).includes(c.unitId) || !db.units.some((x) => x.id === c.unitId)) fail('You are not assigned to that unit.');
  const lane = (db.lanes || []).find((l) => l.id === c.laneId) || fail('Unknown lane.');
  if (!(db.vehicleTypes || []).some((v) => v.code === c.vehicleType)) fail('Unknown vehicle type.');
  const al = Array.isArray(c.allocations) ? c.allocations : [];
  if (!al.length || al.length > MAX_ALLOCATIONS) fail(`Choose 1 to ${MAX_ALLOCATIONS} transporters.`);
  const seen = new Set(); const items = [];
  const timeoutH = (db.settings && db.settings.offerTimeoutH) || 4;
  al.forEach((a, k) => {
    const carrier = db.carriers.find((x) => x.id === a.carrierId) || fail(`Line ${k + 1}: unknown transporter.`);
    if (carrier.blocked) fail(`Line ${k + 1}: ${carrier.name} is blocked.`);
    if (seen.has(carrier.id)) fail(`Line ${k + 1}: ${carrier.name} is on another line.`);
    seen.add(carrier.id);
    const cases = Number(a.cases), vehicles = Number(a.vehicles), qty = Number(a.qty), at = Date.parse(a.requiredAt);
    if (!(cases >= 0) || !Number.isInteger(cases)) fail(`Line ${k + 1}: No. of cases must be a whole number, 0 or more.`);
    if (!(vehicles >= 1) || !Number.isInteger(vehicles)) fail(`Line ${k + 1}: No. of vehicles must be a whole number, 1 or more.`);
    if (!(qty > 0)) fail(`Line ${k + 1}: Quantity must be more than 0.`);
    if (!(at > now)) fail(`Line ${k + 1}: The required date and time must be in the future.`);
    const lv = (lane.vendors || []).filter((v) => v.carrierId === carrier.id && (!v.vehicleType || v.vehicleType === c.vehicleType) && (!c.shippingType || !v.shippingType || v.shippingType === c.shippingType))
      .sort((x, y) => (x.vehicleType === c.vehicleType ? 0 : 1) - (y.vehicleType === c.vehicleType ? 0 : 1) || x.priority - y.priority || x.rate - y.rate)[0];
    items.push({ itemNo: (k + 1) * 10, carrierId: carrier.id, cases, vehicles, qty, requiredAt: iso(at), rate: lv ? lv.rate : 0, ...(lv && lv.per ? { per: lv.per, currency: lv.currency || 'INR' } : {}),
      status: 'Pending', expiresAt: iso(now + timeoutH * 3600_000), units: [] });
  });
  const sum = (k) => Math.round(items.reduce((s, i) => s + i[k], 0) * 1000) / 1000;
  for (const [k, label] of [['cases', 'No. of cases'], ['vehicles', 'No. of vehicles'], ['qty', 'Quantity']]) {
    if (c[k] !== undefined && c[k] !== '' && Math.abs(Number(c[k]) - sum(k)) > 1e-9) fail(`${label} (${c[k]}) does not match the transporter lines (${sum(k)}).`);
  }
  // one mail per transporter, only its own lines; the demo never sends (same as TMS_MAIL_URL unset on the server)
  const warnings = [];
  for (const it of items) {
    const carrier = db.carriers.find((x) => x.id === it.carrierId);
    const to = String(carrier.email || '').trim();
    if (!to) { it.mail = { sent: false, error: 'No e-mail address for this transporter', at: iso(now) }; warnings.push(`${carrier.name} has no e-mail address`); } else it.mail = { to, sent: false, simulated: true, at: iso(now) };
  }
  const ind = {
    id: `IND${++db.seq}`, unitId: c.unitId, laneId: lane.id, fromLocId: lane.fromLocId, toLocId: lane.toLocId, customerId: '', vehicleType: c.vehicleType,
    ...(c.shippingType ? { shippingType: c.shippingType } : {}), vehicles: sum('vehicles'), cases: sum('cases'), requiredAt: items.map((i) => i.requiredAt).sort()[0], deliveries: (c.deliveries || []).slice(0, 50),
    material: String(c.material || '').trim().slice(0, 60), qty: sum('qty'), status: 'Open', offers: [], items, createdAt: iso(now), createdBy: user.name, remarks: [],
  };
  db.indents.unshift(ind);
  db.notifications.unshift({ id: `N${Date.now()}${db.seq}`, at: iso(now), level: 'info', text: `Indent ${ind.id} raised with ${items.length} transporter item${items.length === 1 ? '' : 's'}`, read: false });
  const mails = items.map((i) => ({ indentId: ind.id, itemNo: i.itemNo, carrierId: i.carrierId, to: i.mail.to || '', sent: false, ...(i.mail.simulated ? { simulated: true } : {}), ...(i.mail.error ? { error: i.mail.error } : {}) }));
  return { db, result: { indentId: ind.id, items: items.map((i) => ({ itemNo: i.itemNo, carrierId: i.carrierId })), mails, warnings } };
}

const LIVE = ['Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Assigned'];
export function demoSubmitItem(db0, c, user, now) {
  if (!(user.roles || []).includes('Carrier Vendor') || !user.carrierId) fail('Only carrier users can respond to an indent.');
  const db = clone(db0);
  const ind = (db.indents || []).find((i) => i.id === c.id) || fail('Indent not found.');
  const item = (ind.items || []).find((i) => i.itemNo === Number(c.itemNo) && i.carrierId === user.carrierId) || fail('This request is not assigned to your transport company.');
  if (item.status !== 'Pending') fail('This request has already been answered.');
  if (now > Date.parse(item.expiresAt)) fail('This request has expired.');
  const units = (Array.isArray(c.units) ? c.units : []).map((u) => ({ driver: String(u.driver ?? '').trim().slice(0, 60), phone: normPhone(u.phone), vehicleNo: normVehicle(u.vehicleNo) }));
  const v = validateUnits(units, item.vehicles);
  if (v.errors.length) fail(v.errors[0]);
  const badAt = v.rowErrors.findIndex((e) => e); if (badAt >= 0) fail(`Vehicle ${badAt + 1}: ${v.rowErrors[badAt]}`);
  for (const u of units) if (db.shipments.some((x) => x.vehicleNo === u.vehicleNo && LIVE.includes(x.status))) fail(`Vehicle ${u.vehicleNo} is already on another live shipment.`);
  // one order for the item, one shipment per vehicle, each assigned its unit (as the server's accept + assign do)
  const carrier = db.carriers.find((x) => x.id === user.carrierId);
  const orderId = `ORD${++db.seq}`;
  const a = db.locs.find((l) => l.id === ind.fromLocId) || { lat: 0, lon: 0 }, b = db.locs.find((l) => l.id === ind.toLocId) || { lat: 0, lon: 0 };
  const km = Math.round(Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 100) * 1.28);
  const transitH = ((db.lanes || []).find((l) => l.id === ind.laneId) || {}).transitH || 24;
  const price = item.per === 'KG' ? Math.round(item.rate * item.qty * 1000) : item.rate;
  db.orders.unshift({
    id: orderId, oin: `OIN-${ind.unitId}-${db.seq}`, unitId: ind.unitId, customerId: '', mode: 'FTL', basis: 'Vehicle', vehicleType: ind.vehicleType, vehicles: item.vehicles,
    stops: [{ type: 'P', locId: ind.fromLocId, at: item.requiredAt }, { type: 'D', locId: ind.toLocId, at: iso(Date.parse(item.requiredAt) + transitH * 3600_000) }],
    material: ind.material, qty: item.qty, uom: 'MT', packages: item.cases, po: '', so: '', project: '', segment: '', odc: false, tolerance: 0, comments: `From indent ${itemLabel(ind.id, item.itemNo)}`,
    status: 'Active', createdAt: iso(now), createdBy: ind.createdBy, remarks: [`Allocated to ${carrier.name} through indent ${itemLabel(ind.id, item.itemNo)}`],
  });
  const sins = [];
  units.forEach((u, k) => {
    const sin = `SIN${db.seq}${k + 1}`; sins.push(sin);
    db.shipments.unshift({
      sin, orderId, unitId: ind.unitId, type: 'Primary', direction: 'Outbound', status: 'Assigned', carrierId: carrier.id, vehicleNo: u.vehicleNo, vehicleType: ind.vehicleType, driver: u.driver, phone: u.phone,
      provider: 'Jio', consent: 'Pending', tracking: 'No GPS', ePod: 'Pending', freight: price, fromLocId: ind.fromLocId, toLocId: ind.toLocId, pickupAt: item.requiredAt, progress: 0, delayH: 0,
      lr: `LR${770000 + ++db.seq}`, km, ewayExpiry: iso(Date.parse(item.requiredAt) + Math.max(24, km / 40 + 12) * 3600_000), material: ind.material, qty: Math.round((item.qty / item.vehicles) * 1000) / 1000,
      customerId: '', indentId: ind.id, indentItem: item.itemNo,
      log: [{ at: iso(now), actor: user.name, text: `Indent ${itemLabel(ind.id, item.itemNo)} submitted by ${carrier.name}` }, { at: iso(now), actor: user.name, text: `Vehicle ${u.vehicleNo} and driver ${u.driver} assigned` }],
    });
  });
  Object.assign(item, { status: 'Submitted', units, submittedAt: iso(now), orderId, sins });
  recomputeStatus(ind);
  db.notifications.unshift({ id: `N${Date.now()}${db.seq}`, at: iso(now), level: 'info', text: `Indent ${itemLabel(ind.id, item.itemNo)}: ${carrier.name} sent ${units.length} vehicle${units.length === 1 ? '' : 's'} (${sins.join(', ')})`, read: false });
  return { db, result: { orderId, sins } };
}

export function demoRejectItem(db0, c, user, now) {
  if (!(user.roles || []).includes('Carrier Vendor') || !user.carrierId) fail('Only carrier users can respond to an indent.');
  const db = clone(db0);
  const ind = (db.indents || []).find((i) => i.id === c.id) || fail('Indent not found.');
  const item = (ind.items || []).find((i) => i.itemNo === Number(c.itemNo) && i.carrierId === user.carrierId) || fail('This request is not assigned to your transport company.');
  if (item.status !== 'Pending') fail('This request has already been answered.');
  const reason = String(c.reason ?? '').trim().slice(0, 200);
  if (!reason) fail('A reason is required to reject a request.');
  item.status = 'Rejected'; item.rejectReason = reason;
  recomputeStatus(ind);
  const carrier = db.carriers.find((x) => x.id === user.carrierId);
  db.notifications.unshift({ id: `N${Date.now()}${db.seq}`, at: iso(now), level: 'crit', text: `Indent ${itemLabel(ind.id, item.itemNo)} rejected by ${carrier.name}: ${reason} - HO to re-allocate`, read: false });
  return { db, result: { ok: true } };
}

export function demoCancelIndent(db0, c, user, now, roleMap) {
  if (!can(user, roleMap, 'indent.cancel')) fail('Your role does not have permission to cancel indents.');
  const db = clone(db0);
  const ind = (db.indents || []).find((i) => i.id === c.id) || fail('Indent not found.');
  if (ind.status === 'Cancelled') fail('The indent is already cancelled.');
  const reason = String(c.reason ?? '').trim();
  if (!reason) fail('A reason is required.');
  for (const it of ind.items || []) {
    if (it.status === 'Pending') it.status = 'Cancelled';
    else if (it.status === 'Submitted') { db.shipments.filter((s) => (it.sins || []).includes(s.sin) && s.status !== 'Completed').forEach((s) => { s.status = 'Cancelled'; s.log.push({ at: iso(now), actor: user.name, text: 'Indent cancelled' }); }); it.status = 'Cancelled'; }
  }
  ind.status = 'Cancelled'; ind.escalated = false; ind.remarks = [...(ind.remarks || []), `Cancelled by ${user.name}: ${reason}`];
  return { db, result: { ok: true } };
}

/** HO adds a transporter line after a Rejected / Expired one (the replaced line gets `replacedBy` and stops counting). Same checks as createIndent for the one allocation. */
export function demoAddIndentItem(db0, c, user, now, roleMap) {
  if (!can(user, roleMap, 'indent.override')) fail('Your role does not have permission to add a transporter to an indent.');
  const db = clone(db0);
  const ind = (db.indents || []).find((i) => i.id === c.id) || fail('Indent not found.');
  if (!(ind.items || []).length) fail('Only an indent with transporter lines can take another line.');
  if (ind.status === 'Cancelled') fail('The indent is cancelled.');
  const a = c.allocation || {};
  const carrier = db.carriers.find((x) => x.id === a.carrierId) || fail('Unknown transporter.');
  if (carrier.blocked) fail(`${carrier.name} is blocked.`);
  if (ind.items.some((i) => i.carrierId === carrier.id && counts(i))) fail(`${carrier.name} already has a line on this indent.`);
  const cases = Number(a.cases), vehicles = Number(a.vehicles), qty = Number(a.qty), at = Date.parse(a.requiredAt);
  if (!(cases >= 0) || !Number.isInteger(cases)) fail('No. of cases must be a whole number, 0 or more.');
  if (!(vehicles >= 1) || !Number.isInteger(vehicles)) fail('No. of vehicles must be a whole number, 1 or more.');
  if (!(qty > 0)) fail('Quantity must be more than 0.');
  if (!(at > now)) fail('The required date and time must be in the future.');
  const failed = lostItems(ind);
  const replaced = c.replaces !== undefined ? failed.find((i) => i.itemNo === Number(c.replaces)) : (failed.length === 1 ? failed[0] : undefined);
  if (c.replaces !== undefined && !replaced) fail('That line is not a rejected or expired line.');
  const lane = (db.lanes || []).find((l) => l.id === ind.laneId) || { vendors: [] };
  const lv = (lane.vendors || []).filter((v) => v.carrierId === carrier.id && (!v.vehicleType || v.vehicleType === ind.vehicleType) && (!ind.shippingType || !v.shippingType || v.shippingType === ind.shippingType))
    .sort((x, y) => (x.vehicleType === ind.vehicleType ? 0 : 1) - (y.vehicleType === ind.vehicleType ? 0 : 1) || x.priority - y.priority || x.rate - y.rate)[0];
  const itemNo = Math.max(...ind.items.map((i) => i.itemNo)) + 10;
  const to = String(carrier.email || '').trim();
  const item = { itemNo, carrierId: carrier.id, cases, vehicles, qty, requiredAt: iso(at), rate: lv ? lv.rate : 0, ...(lv && lv.per ? { per: lv.per, currency: lv.currency || 'INR' } : {}), status: 'Pending',
    expiresAt: iso(now + (((db.settings && db.settings.offerTimeoutH) || 4) * 3600_000)), units: [], mail: to ? { to, sent: false, simulated: true, at: iso(now) } : { sent: false, error: 'No e-mail address for this transporter', at: iso(now) } };
  ind.items.push(item);
  if (replaced) replaced.replacedBy = itemNo;
  recomputeStatus(ind);
  db.notifications.unshift({ id: `N${Date.now()}${db.seq}`, at: iso(now), level: 'info', text: `Indent ${itemLabel(ind.id, itemNo)} added for ${carrier.name}${replaced ? ` (replaces ${itemLabel(ind.id, replaced.itemNo)})` : ''}`, read: false });
  return { db, result: { indentId: ind.id, itemNo, mails: [{ indentId: ind.id, itemNo, carrierId: carrier.id, to, sent: false, ...(item.mail.simulated ? { simulated: true } : { error: item.mail.error }) }] } };
}
