import test from 'node:test';
import assert from 'node:assert/strict';
import { addCarrierCodes, vendorCode, carrierLabel, carrierLabelOf, carrierCols, filterOptions, carrierOptions } from '../src/lib/labels.js';

const C = [
  { id: 'C001', code: '120020', name: 'Elite Roadways Pvt. Ltd.', shortName: 'ELITE' },
  { id: 'C002', code: '120033', name: 'Gati Freight Carriers', shortName: 'GATI' },
  { id: 'C003', code: 'V120046', name: 'Shree Maruti Courier', shortName: 'SHREE' },     // old demo data: V prefix
  { id: 'C004', code: '', name: 'No Code Transport', shortName: 'NOCODE' },
];

test('label is "code - name", the same everywhere', () => {
  assert.equal(carrierLabel(C[0]), '120020 - Elite Roadways Pvt. Ltd.');
  assert.equal(carrierLabel(C[0], { short: true }), '120020 - ELITE');
  assert.equal(carrierLabel(C[2]), '120046 - Shree Maruti Courier');                    // V prefix dropped
  assert.equal(carrierLabel(C[3]), 'No Code Transport');                                // no code: just the name, no dangling dash
  assert.equal(carrierLabel(undefined), '');
  assert.equal(vendorCode({ code: ' 100200 ' }), '100200'); assert.equal(vendorCode({ code: 'VAT12' }), 'VAT12');
});

test('label by id falls back to the id, never blank', () => {
  assert.equal(carrierLabelOf(C, 'C002'), '120033 - Gati Freight Carriers');
  assert.equal(carrierLabelOf(C, 'C999'), 'C999');
  assert.equal(carrierLabelOf(C, undefined), '');
});

test('export columns: code as its own column next to the name', () => {
  assert.deepEqual(carrierCols(C, 'C001'), { 'Carrier code': '120020', Carrier: 'Elite Roadways Pvt. Ltd.' });
  assert.deepEqual(carrierCols(C, 'C999'), { 'Carrier code': '', Carrier: 'C999' });
});

const O = carrierOptions(C);
const vals = (q) => filterOptions(O, q).map((o) => o.value);

test('filter matches on code AND name, case-insensitive, any order', () => {
  assert.deepEqual(vals(''), ['C001', 'C002', 'C003', 'C004']);
  assert.deepEqual(vals('2002'), ['C001']);                    // part of a code
  assert.deepEqual(vals('120033'), ['C002']);                  // whole code
  assert.deepEqual(vals('ELITE'), ['C001']);                   // upper case name
  assert.deepEqual(vals('freight gati'), ['C002']);            // words in any order
  assert.deepEqual(vals('1200 maruti'), ['C003']);             // code word + name word together
  assert.deepEqual(vals('  gati   '), ['C002']);               // whitespace ignored
  assert.deepEqual(vals('nothing here'), []);                  // no match
});

test('filter also matches the short name and keeps the option order and values (ids unchanged)', () => {
  assert.deepEqual(vals('shree'), ['C003']);
  assert.deepEqual(vals('1200'), ['C001', 'C002', 'C003']);
  assert.equal(O[0].value, 'C001'); assert.equal(O[0].label, '120020 - Elite Roadways Pvt. Ltd.');
});

test('filter works on any option list (lanes, locations, customers)', () => {
  const lanes = [{ value: 'L1', label: 'Guwahati → Kolkata' }, { value: 'L2', label: 'Kolkata → Patna' }];
  assert.deepEqual(filterOptions(lanes, 'kol').map((o) => o.value), ['L1', 'L2']);
  assert.deepEqual(filterOptions(lanes, 'guw kol').map((o) => o.value), ['L1']);
  assert.deepEqual(filterOptions(lanes, 'patna').map((o) => o.value), ['L2']);
});

test('exports: a code column is inserted before every carrier-name column, order kept', () => {
  const rows = [{ SIN: 'S1', Carrier: 'Elite Roadways Pvt. Ltd.', Freight: 100 }, { SIN: 'S2', Carrier: 'Unknown Co', Freight: 5 }, { Order: 'O1', Winner: 'gati freight carriers', Vendor: 'C003' }];
  const out = addCarrierCodes(rows, C);
  assert.deepEqual(Object.keys(out[0]), ['SIN', 'Carrier code', 'Carrier', 'Freight']); assert.equal(out[0]['Carrier code'], '120020');
  assert.deepEqual(Object.keys(out[1]), ['SIN', 'Carrier', 'Freight']);                          // not a known carrier: untouched
  assert.deepEqual(Object.keys(out[2]), ['Order', 'Winner code', 'Winner', 'Vendor code', 'Vendor']); assert.equal(out[2]['Winner code'], '120033'); assert.equal(out[2]['Vendor code'], '120046');
  assert.equal(rows[0]['Carrier code'], undefined);                                               // input rows not mutated
});
