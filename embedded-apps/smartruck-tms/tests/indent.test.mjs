import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUnit, validateUnits, validateIndentForm, totals, remaining, emptyRow, buildCreateCommand, rankedCarriers, laneOffers, transitText, recomputeStatus, needsHo, mailLabel, vendorView, itemLabel,
  demoCreateIndent, demoSubmitItem, demoRejectItem, demoCancelIndent, demoAddIndentItem,
} from '../src/lib/indentModel.js';

const NOW = Date.parse('2026-11-28T10:00:00Z');
// a datetime-local value is LOCAL time without a zone, so build it from local parts (timezone independent)
const p2 = (n) => String(n).padStart(2, '0');
const later = (h) => { const d = new Date(NOW + h * 3600_000); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const ROLES = { 'Depot User': ['indent.create', 'indent.cancel'], 'Carrier Vendor': ['indent.respond'] };
const row = (carrierId, cases, vehicles, qty, h = 5) => ({ carrierId, cases: String(cases), vehicles: String(vehicles), qty: String(qty), requiredAt: later(h) });

const world = () => ({
  units: [{ id: 'UN13' }], seq: 100, notifications: [], orders: [], shipments: [], settings: { offerTimeoutH: 4 },
  locs: [{ id: 'GAU', city: 'Guwahati', lat: 26, lon: 91 }, { id: 'CCU', city: 'Kolkata', lat: 22, lon: 88 }],
  carriers: [{ id: 'C1', name: 'Elite', email: 'a@elite.example' }, { id: 'C2', name: 'Gati', email: 'b@gati.example' }, { id: 'C3', name: 'NoMail' }, { id: 'C4', name: 'Blocked', blocked: true, email: 'x@y.z' }],
  vehicleTypes: [{ code: 'TRUCK9MT' }],
  lanes: [{ id: 'L1', fromLocId: 'GAU', toLocId: 'CCU', transitH: 26, vendors: [{ carrierId: 'C2', priority: 2, rate: 900 }, { carrierId: 'C1', priority: 1, rate: 1000 }, { carrierId: 'C4', priority: 3, rate: 800 }] }],
  indents: [],
});
const depot = { name: 'Kavita', roles: ['Depot User'], units: ['UN13'] };
const vend = (carrierId) => ({ name: `V-${carrierId}`, roles: ['Carrier Vendor'], carrierId, units: [] });
const create = (db, rows, extra = {}) => demoCreateIndent(db, { unitId: 'UN13', laneId: 'L1', vehicleType: 'TRUCK9MT', material: 'Talc', ...buildCreateCommand({ unitId: 'UN13', laneId: 'L1', vehicleType: 'TRUCK9MT', shippingType: '', material: 'Talc', deliveries: '', rows, targets: {} }), ...extra }, depot, NOW, ROLES);

test('unit validation matches the server rules (phone, vehicle, driver)', () => {
  assert.equal(validateUnit({ driver: 'Ramesh', phone: '98765 43210', vehicleNo: 'as01 ab 1234' }), '');
  assert.match(validateUnit({ driver: '', phone: '9876543210', vehicleNo: 'AS01AB1234' }), /driver name/);
  assert.match(validateUnit({ driver: 'R', phone: '5876543210', vehicleNo: 'AS01AB1234' }), /10-digit/);
  assert.match(validateUnit({ driver: 'R', phone: '987654321', vehicleNo: 'AS01AB1234' }), /10-digit/);
  assert.match(validateUnit({ driver: 'R', phone: '9876543210', vehicleNo: 'AS1' }), /registration/);
});

test('units: exact count, duplicates inside the item', () => {
  const u = (v) => ({ driver: 'R', phone: '9876543210', vehicleNo: v });
  assert.equal(validateUnits([u('AS01AB1234'), u('AS01AB1235')], 2).ok, true);
  assert.match(validateUnits([u('AS01AB1234')], 2).errors[0], /exactly 2 vehicles/);
  const d = validateUnits([u('AS01AB1234'), u('as01 ab 1234')], 2);
  assert.equal(d.ok, false); assert.match(d.rowErrors[1], /twice/);
});

test('totals, remaining to distribute, targets must match', () => {
  const rows = [row('C1', 100, 2, 18), row('C2', 50, 1, 9)];
  assert.deepEqual(totals(rows), { cases: 150, vehicles: 3, qty: 27 });
  assert.deepEqual(remaining({ cases: '200', vehicles: '', qty: '27' }, totals(rows)), { cases: 50, vehicles: null, qty: 0 });
  const bad = validateIndentForm({ laneId: 'L1', vehicleType: 'T', rows, targets: { cases: '200' }, now: NOW });
  assert.equal(bad.ok, false); assert.match(bad.errors[0], /50 of no\. of cases still to distribute/);
  const over = validateIndentForm({ laneId: 'L1', vehicleType: 'T', rows, targets: { cases: '100' }, now: NOW });
  assert.match(over.errors[0], /over the target by 50/);
  assert.equal(validateIndentForm({ laneId: 'L1', vehicleType: 'T', rows, targets: { cases: '150', vehicles: '3', qty: '27' }, now: NOW }).ok, true);
});

test('form validation: per row messages and form level messages', () => {
  const r = validateIndentForm({ laneId: '', vehicleType: '', rows: [emptyRow()], targets: {}, now: NOW });
  assert.equal(r.ok, false); assert.ok(r.errors.includes('Choose the lane.') && r.errors.includes('Choose the vehicle type.')); assert.match(r.rowErrors[0], /transporter/);
  const dup = validateIndentForm({ laneId: 'L', vehicleType: 'T', rows: [row('C1', 1, 1, 1), row('C1', 1, 1, 1)], targets: {}, now: NOW });
  assert.match(dup.rowErrors[1], /already on another line/);
  const past = validateIndentForm({ laneId: 'L', vehicleType: 'T', rows: [row('C1', 1, 1, 1, -3)], targets: {}, now: NOW });
  assert.match(past.rowErrors[0], /future/);
  assert.match(validateIndentForm({ laneId: 'L', vehicleType: 'T', rows: [row('C1', 1.5, 1, 1)], targets: {}, now: NOW }).rowErrors[0], /whole number/);
  assert.match(validateIndentForm({ laneId: 'L', vehicleType: 'T', rows: [row('C1', 1, 0, 1)], targets: {}, now: NOW }).rowErrors[0], /vehicles/);
  assert.match(validateIndentForm({ laneId: 'L', vehicleType: 'T', rows: [row('C1', 1, 1, 0)], targets: {}, now: NOW }).rowErrors[0], /Quantity/);
});

test('command follows the contract: allocations, targets only when typed, earliest required time', () => {
  const c = buildCreateCommand({ unitId: 'UN13', laneId: 'L1', vehicleType: 'T', shippingType: '01', material: ' Talc ', deliveries: '80001, 80002', rows: [row('C1', 10, 2, 18, 9), row('C2', 5, 1, 9, 3)], targets: { cases: '15' } });
  assert.equal(c.type, 'createIndent'); assert.equal(c.cases, 15); assert.equal(c.vehicles, undefined); assert.equal(c.qty, undefined);
  assert.deepEqual(c.deliveries, ['80001', '80002']); assert.equal(c.material, 'Talc'); assert.equal(c.allocations.length, 2);
  assert.deepEqual(Object.keys(c.allocations[0]).sort(), ['carrierId', 'cases', 'qty', 'requiredAt', 'vehicles']);
  assert.equal(c.requiredAt, c.allocations[1].requiredAt); assert.equal('customerId' in c, false);
});

test('lane-ranked carriers first, blocked never offered', () => {
  const r = rankedCarriers(world(), 'L1', 'TRUCK9MT', '');
  assert.deepEqual(r.map((x) => x.carrier.id), ['C1', 'C2', 'C3']);            // C1 priority 1, C2 priority 2, then the unranked C3; C4 blocked
  assert.equal(r[2].rate, null);
});

test('lane offers: only carriers with a rate on the lane, with their rows and transit time', () => {
  const w = world(); for (const v of w.lanes[0].vendors) v.zdays = '3';
  const o = laneOffers(w, 'L1', 'TRUCK9MT', '');
  assert.deepEqual(o.map((x) => x.carrier.id), ['C1', 'C2']); assert.equal(o[0].transit, '3 days'); assert.ok(o[0].rows.length >= 1);
  assert.deepEqual(laneOffers(w, 'nope', 'TRUCK9MT', ''), []);
  assert.equal(transitText({}, { transitH: 30 }), '30 h'); assert.equal(transitText({ zdays: '1' }, {}), '1 day');
});

test('demo create: same indent number, item numbers 10/20, totals derived, lane rates, mail per transporter', () => {
  const { db, result } = create(world(), [row('C1', 100, 2, 18), row('C2', 50, 1, 9), row('C3', 10, 1, 4)]);
  const i = db.indents[0];
  assert.equal(result.indentId, i.id); assert.deepEqual(i.items.map((x) => x.itemNo), [10, 20, 30]);
  assert.deepEqual([i.cases, i.vehicles, i.qty], [160, 4, 31]); assert.equal(i.status, 'Open'); assert.equal(i.customerId, '');
  assert.equal(i.items[0].rate, 1000); assert.equal(i.items[1].rate, 900); assert.equal(i.items[2].rate, 0);
  assert.equal(i.items[0].mail.simulated, true); assert.equal(i.items[0].mail.to, 'a@elite.example');
  assert.equal(mailLabel(i.items[0].mail).text, 'Not sent (simulated)');
  assert.equal(mailLabel(i.items[2].mail).text, 'No e-mail'); assert.match(result.warnings[0], /NoMail/); assert.equal(result.mails.length, 3); assert.equal(result.mails[2].error, 'No e-mail address for this transporter');
  assert.equal(itemLabel(i.id, 20), `${i.id}-20`);
});

test('demo create: server rules (permission, blocked, duplicate, totals must match)', () => {
  assert.throws(() => demoCreateIndent(world(), {}, { roles: ['Carrier Vendor'], units: ['UN13'] }, NOW, ROLES), /permission/);
  assert.throws(() => create(world(), [row('C4', 1, 1, 1)]), /blocked/);
  assert.throws(() => create(world(), [row('C1', 1, 1, 1), row('C1', 1, 1, 1)]), /another line/);
  assert.throws(() => create(world(), [row('C1', 10, 1, 5)], { cases: 11 }), /does not match/);
  assert.throws(() => create(world(), [row('C1', 10, 1, 5, -1)]), /future/);
});

test('vendor sees only their own item, nothing else about the indent', () => {
  const { db } = create(world(), [row('C1', 100, 2, 18), row('C2', 50, 1, 9)]);
  const v = vendorView(db.indents, 'C2');
  assert.equal(v.length, 1); assert.deepEqual(v[0].items.map((x) => x.carrierId), ['C2']);
  assert.equal(v[0].customerId, ''); assert.equal(v[0].createdBy, ''); assert.deepEqual(v[0].offers, []);
  assert.deepEqual(vendorView(db.indents, 'C3'), []); assert.deepEqual(vendorView(db.indents, ''), []);
});

test('vendor submit: one order, one shipment per vehicle, assigned; status moves Open -> Partly allocated -> Allocated', () => {
  let { db } = create(world(), [row('C1', 100, 2, 18), row('C2', 50, 1, 9)]);
  const id = db.indents[0].id;
  const units = [{ driver: 'Ramesh', phone: '9876543210', vehicleNo: 'as01ab1234' }, { driver: 'Suresh', phone: '9876543211', vehicleNo: 'AS01AB1235' }];
  assert.throws(() => demoSubmitItem(db, { id, itemNo: 10, units: units.slice(0, 1) }, vend('C1'), NOW), /exactly 2 vehicles/);
  assert.throws(() => demoSubmitItem(db, { id, itemNo: 10, units }, vend('C2'), NOW), /not assigned to your transport company/);
  assert.throws(() => demoSubmitItem(db, { id, itemNo: 10, units: [{ ...units[0], phone: '12' }, units[1]] }, vend('C1'), NOW), /Vehicle 1: .*10-digit/);
  assert.throws(() => demoSubmitItem(db, { id, itemNo: 10, units }, vend('C1'), NOW + 5 * 3600_000), /expired/);
  const out = demoSubmitItem(db, { id, itemNo: 10, units }, vend('C1'), NOW); db = out.db;
  const it = db.indents[0].items[0];
  assert.equal(it.status, 'Submitted'); assert.equal(it.sins.length, 2); assert.equal(db.shipments.length, 2); assert.equal(db.orders.length, 1);
  assert.ok(db.shipments.every((s) => s.status === 'Assigned' && s.carrierId === 'C1' && s.indentId === id && s.driver && s.phone && s.vehicleNo.startsWith('AS01AB')));
  assert.equal(db.shipments[1].vehicleNo, 'AS01AB1234');                          // normalised
  assert.equal(db.indents[0].status, 'Partly allocated');
  assert.throws(() => demoSubmitItem(db, { id, itemNo: 10, units }, vend('C1'), NOW), /already been answered/);
  const second = demoSubmitItem(db, { id, itemNo: 20, units: [{ driver: 'Imran', phone: '9876543212', vehicleNo: 'AS01AB1236' }] }, vend('C2'), NOW);
  assert.equal(second.db.indents[0].status, 'Allocated');
});

test('same vehicle on another live shipment is refused', () => {
  let { db } = create(world(), [row('C1', 10, 1, 5), row('C2', 10, 1, 5)]);
  const id = db.indents[0].id;
  db = demoSubmitItem(db, { id, itemNo: 10, units: [{ driver: 'A', phone: '9876543210', vehicleNo: 'AS01AB1234' }] }, vend('C1'), NOW).db;
  assert.throws(() => demoSubmitItem(db, { id, itemNo: 20, units: [{ driver: 'B', phone: '9876543211', vehicleNo: 'AS01AB1234' }] }, vend('C2'), NOW), /already on another live shipment/);
});

test('status follows the server: Open -> Partly allocated -> Allocated; rejected lines stop counting; reject needs a reason', () => {
  let { db } = create(world(), [row('C1', 10, 1, 5), row('C2', 10, 1, 5), row('C3', 4, 1, 2)]);
  const id = db.indents[0].id;
  assert.throws(() => demoRejectItem(db, { id, itemNo: 20, reason: ' ' }, vend('C2'), NOW), /reason is required/);
  db = demoRejectItem(db, { id, itemNo: 20, reason: 'No trucks free' }, vend('C2'), NOW).db;
  let i = db.indents[0];
  assert.equal(i.items[1].status, 'Rejected'); assert.equal(i.status, 'Open'); assert.equal(i.escalated, false);       // nothing submitted yet, other lines still live
  assert.equal(needsHo(i), true);                                                                                    // but HO is flagged for the rejected line
  assert.deepEqual([i.cases, i.vehicles, i.qty], [14, 2, 7]);                                                        // totals follow live lines only
  db = demoSubmitItem(db, { id, itemNo: 10, units: [{ driver: 'A', phone: '9876543210', vehicleNo: 'AS01AB1234' }] }, vend('C1'), NOW).db;
  assert.equal(db.indents[0].status, 'Partly allocated');                                                             // item 30 still Pending
  db = demoSubmitItem(db, { id, itemNo: 30, units: [{ driver: 'B', phone: '9876543211', vehicleNo: 'AS01AB1235' }] }, vend('C3'), NOW).db;
  i = db.indents[0];
  assert.equal(i.status, 'Allocated'); assert.equal(i.escalated, false);                                              // every line that still counts is submitted
  assert.match(db.notifications.find((n) => /rejected/.test(n.text)).text, /rejected by Gati: No trucks free/);
});

test('every line rejected -> still Open, escalated, totals 0', () => {
  let { db } = create(world(), [row('C1', 10, 1, 5)]);
  const id = db.indents[0].id;
  db = demoRejectItem(db, { id, itemNo: 10, reason: 'No fleet' }, vend('C1'), NOW).db;
  const i = db.indents[0];
  assert.equal(i.status, 'Open'); assert.equal(i.escalated, true); assert.equal(i.vehicles, 0);
});

test('HO re-offers a rejected line: new item number, replaced line stops counting, same indent number', () => {
  let { db } = create(world(), [row('C1', 10, 1, 5), row('C2', 10, 1, 5)]);
  const id = db.indents[0].id;
  const ho = { name: 'HO', roles: ['HO Logistics'], units: ['UN13'] }; const R = { ...ROLES, 'HO Logistics': ['indent.override'] };
  const alloc = { carrierId: 'C3', cases: 10, vehicles: 1, qty: 5, requiredAt: new Date(NOW + 9 * 3600_000).toISOString() };
  assert.throws(() => demoAddIndentItem(db, { id, allocation: alloc, replaces: 20 }, ho, NOW, R), /not a rejected or expired line/);
  db = demoRejectItem(db, { id, itemNo: 20, reason: 'No trucks' }, vend('C2'), NOW).db;
  assert.throws(() => demoAddIndentItem(db, { id, allocation: alloc }, depot, NOW, R), /permission/);
  assert.throws(() => demoAddIndentItem(db, { id, allocation: { ...alloc, carrierId: 'C1' } }, ho, NOW, R), /already has a line/);
  assert.throws(() => demoAddIndentItem(db, { id, allocation: { ...alloc, carrierId: 'C4' } }, ho, NOW, R), /blocked/);
  const out = demoAddIndentItem(db, { id, allocation: alloc, replaces: 20 }, ho, NOW, R); db = out.db;
  const i = db.indents[0];
  assert.equal(out.result.itemNo, 30); assert.equal(i.items[1].replacedBy, 30); assert.equal(i.items[2].carrierId, 'C3'); assert.equal(i.items[2].status, 'Pending');
  assert.equal(needsHo(i), false); assert.deepEqual([i.cases, i.vehicles, i.qty], [20, 2, 10]); assert.equal(i.id, id);
  assert.equal(out.result.mails[0].error, 'No e-mail address for this transporter');
});

test('vendor view recomputes the numbers from the vendor\'s own lines and hides the mail outcome', () => {
  const { db } = create(world(), [row('C1', 100, 2, 18, 8), row('C2', 50, 1, 9, 3)]);
  const v = vendorView(db.indents, 'C2')[0];
  assert.deepEqual([v.cases, v.vehicles, v.qty], [50, 1, 9]); assert.equal('mail' in v.items[0], false);
  assert.equal(v.requiredAt, v.items[0].requiredAt);
});

test('cancel: reason required, pending lines cancelled, vehicles already sent are cancelled too', () => {
  let { db } = create(world(), [row('C1', 10, 1, 5), row('C2', 10, 1, 5)]);
  const id = db.indents[0].id;
  db = demoSubmitItem(db, { id, itemNo: 10, units: [{ driver: 'A', phone: '9876543210', vehicleNo: 'AS01AB1234' }] }, vend('C1'), NOW).db;
  assert.throws(() => demoCancelIndent(db, { id, reason: '' }, depot, NOW, ROLES), /reason/);
  assert.throws(() => demoCancelIndent(db, { id, reason: 'x' }, vend('C1'), NOW, ROLES), /permission/);
  db = demoCancelIndent(db, { id, reason: 'Plan changed' }, depot, NOW, ROLES).db;
  assert.equal(db.indents[0].status, 'Cancelled'); assert.ok(db.indents[0].items.every((x) => x.status === 'Cancelled')); assert.equal(db.shipments[0].status, 'Cancelled');
  assert.throws(() => demoCancelIndent(db, { id, reason: 'again' }, depot, NOW, ROLES), /already cancelled/);
});

test('recomputeStatus on legacy indents (no items) leaves them alone', () => {
  const ind = { status: 'Open', escalated: true, items: undefined };
  assert.equal(recomputeStatus(ind), 'Open'); assert.equal(ind.escalated, true);
});
