import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classify, mergeOverrides, needsReview, filterPlants, toCsv, inIndia, hasPoint, states, countBy, esc } from '../src/lib/plantMap.js';

const data = JSON.parse(fs.readFileSync(new URL('../public/plant-locations.json', import.meta.url), 'utf8'));
const P = data.plants;

test('type classification follows the code prefix, MWH from the planning tool', () => {
  assert.equal(classify('DP15'), 'Depot'); assert.equal(classify('un13'), 'Unit'); assert.equal(classify('3P01'), '3P'); assert.equal(classify('XX01'), 'Plant');
  assert.equal(classify('DP38', 'MWH'), 'MWH');
});

test('data file: 110 plants, counts agree, every point is inside India, nothing invented', () => {
  assert.equal(P.length, 110); assert.equal(data.counts.plants, 110);
  assert.equal(data.counts.withCoordinates, P.filter(hasPoint).length);
  assert.ok(P.every((p) => !hasPoint(p) || inIndia(p.lat, p.lon)));
  assert.deepEqual(data.missing.sort(), P.filter((p) => !hasPoint(p)).map((p) => p.code).sort());
  assert.ok(P.filter((p) => !hasPoint(p)).every((p) => p.source === null && p.confidence === null));
  assert.ok(P.every((p) => p.type === classify(p.code, p.type === 'MWH' ? 'MWH' : '')));
  assert.equal(new Set(P.map((p) => p.code)).size, 110);
});

test('state centroid sanity: the PIN-geocoded plants sit in their state (Guwahati plants in Assam, Kolkata plants in West Bengal)', () => {
  const near = (c, la, lo, r) => { const p = P.find((x) => x.code === c); const d = Math.hypot((p.lat - la) * 111, (p.lon - lo) * 100); assert.ok(d < r, `${c} is ${d.toFixed(0)} km from the expected place`); };
  near('DP09', 26.15, 91.75, 40); near('UN02', 26.15, 91.75, 40); near('DP15', 22.57, 88.36, 40); near('DP62', 30.3, 78.0, 80);
});

test('overrides: applied inside India, ignored outside / for garbage, edited plants stop needing review', () => {
  const first = P.find(hasPoint);
  const m = mergeOverrides(P, { [first.code]: { lat: 20, lon: 80 }, DP15: { lat: 55, lon: 80 }, NOPE: { lat: 20, lon: 80 } });
  const a = m.find((p) => p.code === first.code);
  assert.deepEqual([a.lat, a.lon, a.edited], [20, 80, true]); assert.deepEqual(a.original, { lat: first.lat, lon: first.lon });
  assert.equal(m.find((p) => p.code === 'DP15').edited, false);               // outside India: refused
  assert.equal(m.length, P.length);
  const lowOne = { code: 'X', lat: 10, lon: 77, confidence: 'low' };
  assert.equal(needsReview(mergeOverrides([lowOne], {})[0]), true);
  assert.equal(needsReview(mergeOverrides([lowOne], { X: { lat: 11, lon: 77 } })[0]), false);
  assert.equal(mergeOverrides(P, null).length, P.length);
});

test('review list = not high confidence or no point', () => {
  const r = filterPlants(mergeOverrides(P, {}), { reviewOnly: true });
  assert.ok(r.length >= data.missing.length && r.every((p) => !hasPoint(p) || p.confidence !== 'high'));
  assert.ok(data.missing.every((c) => r.some((p) => p.code === c)));
});

test('filters: type, state, search (code, name, city, PIN)', () => {
  const depots = filterPlants(P, { types: ['Depot'] }); assert.ok(depots.length > 30 && depots.every((p) => p.type === 'Depot'));
  const st = states(P)[0]; assert.ok(filterPlants(P, { state: st }).every((p) => p.state === st));
  assert.equal(filterPlants(P, { q: 'dp15' }).length, 1);
  const pin = P.find((p) => p.pincode).pincode; assert.ok(filterPlants(P, { q: pin }).length >= 1);
  assert.equal(filterPlants(P, { q: 'zzzz-nothing' }).length, 0);
  assert.equal(filterPlants(P, {}).length, P.length);
  assert.equal(Object.values(countBy(P, 'type')).reduce((a, b) => a + b, 0), 110);
});

test('CSV: header, one row per plant, quoting, empty coordinates for plants without a point', () => {
  const csv = toCsv([{ code: 'A', name: 'He said "hi", ok', type: 'Depot', lat: 1.5, lon: 2.5, note: 'x\ny' }, { code: 'B', type: 'Unit' }]).split('\r\n');
  assert.equal(csv[0].split(',')[0], 'Plant');
  assert.ok(csv[1].includes('"He said ""hi"", ok"')); assert.ok(csv[1].includes(',1.5,2.5,'));
  assert.equal(toCsv(P).split('\r\n').length, 111);
});

test('popup text is escaped', () => assert.equal(esc('<img src=x onerror=1> & "'), '&lt;img src=x onerror=1&gt; &amp; &quot;'));
