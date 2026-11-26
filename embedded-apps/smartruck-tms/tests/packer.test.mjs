import test from 'node:test';
import assert from 'node:assert/strict';
import { pack, cartonVolumeM3 } from '../src/lib/packer.ts';

const truck = (l, w, h, kg = 0) => ({ lengthCm: l, widthCm: w, heightCm: h, maxWeightKg: kg });
const box = (id, l, w, h, qty, o = {}) => ({ id, name: id, lengthCm: l, widthCm: w, heightCm: h, weightKg: 1, qty, ...o });

/** Geometric rules every plan must satisfy: inside the truck, no overlap, nothing floating, nothing on a fragile carton. */
function assertValid(res, types) {
  const fr = new Set(types.filter((t) => t.fragile).map((t) => t.id));
  const T = res.truck, cs = res.cartons, e = 1e-6;
  for (const c of cs) {
    assert.ok(c.x >= -e && c.y >= -e && c.z >= -e, 'inside (min)');
    assert.ok(c.x + c.l <= T.lengthCm + e && c.y + c.w <= T.widthCm + e && c.z + c.h <= T.heightCm + e, `inside (max) ${JSON.stringify(c)}`);
  }
  const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    let support = 0;
    for (let j = 0; j < cs.length; j++) {
      if (i === j) continue;
      const b = cs[j];
      const ox = ov(a.x, a.x + a.l, b.x, b.x + b.l), oy = ov(a.y, a.y + a.w, b.y, b.y + b.w), oz = ov(a.z, a.z + a.h, b.z, b.z + b.h);
      assert.ok(!(ox > e && oy > e && oz > e), `overlap ${i} ${j}`);
      if (ox > e && oy > e && Math.abs(b.z + b.h - a.z) < e) support += ox * oy;
      if (fr.has(b.typeId) && ox > e && oy > e && a.z >= b.z + b.h - e) assert.fail(`carton on a fragile one ${i} over ${j}`);
    }
    if (a.z > e) assert.ok(support / (a.l * a.w) > 0.999, `carton ${i} is not fully supported (${support / (a.l * a.w)})`);
  }
  const vol = cs.reduce((s, c) => s + (c.l * c.w * c.h) / 1e6, 0);
  assert.ok(vol <= res.truckVolumeM3 + 0.011);
  assert.equal(res.cartonsPlaced, cs.length);
  assert.equal(res.cartonsRequested - res.cartonsPlaced, res.cartonsUnplaced);
}

test('the document example: 40 CBM truck, 32 CBM of cartons -> everything fits, 80 % utilisation, 8 CBM unused', () => {
  const types = [box('A', 50, 40, 40, 400)];                  // 0.08 m3 x 400 = 32 m3
  const r = pack(truck(800, 250, 200), types);                // 40 m3
  assert.equal(cartonVolumeM3(types), 32);
  assert.equal(r.truckVolumeM3, 40); assert.equal(r.cartonsPlaced, 400); assert.equal(r.cartonsUnplaced, 0);
  assert.equal(r.utilizationPct, 80); assert.equal(r.unusedVolumeM3, 8); assert.equal(r.status, 'ok');
  assertValid(r, types);
});

test('CBM alone is not enough: 4 x 0.216 m3 = 0.864 m3 in a 1 m3 truck, but only one 60 cm cube fits', () => {
  const types = [box('C', 60, 60, 60, 4)];
  const r = pack(truck(100, 100, 100), types);
  assert.ok(cartonVolumeM3(types) < r.truckVolumeM3);
  assert.equal(r.cartonsPlaced, 1); assert.equal(r.cartonsUnplaced, 3); assert.equal(r.status, 'nofit');
  assert.match(r.warnings.join(' '), /do not fit/);
  assertValid(r, types);
});

test('rotation: a long carton only fits standing up when tipping is allowed', () => {
  const t = truck(30, 30, 100);
  const flat = pack(t, [box('L', 90, 30, 30, 3)]);
  assert.equal(flat.cartonsPlaced, 0); assert.equal(flat.byType[0].reason, 'size'); assert.match(flat.warnings.join(' '), /cannot be loaded/);
  const tipped = pack(t, [box('L', 90, 30, 30, 3, { canTip: true })]);
  assert.equal(tipped.cartonsPlaced, 1);                       // 90 of 100 cm high
  assertValid(tipped, [box('L', 90, 30, 30, 3, { canTip: true })]);
});

test('turning a carton on the floor (this-side-up) is always allowed', () => {
  const types = [box('F', 60, 40, 30, 4)];
  const r = pack(truck(80, 120, 30), types);                    // 60 deep does not fit along 80? it does; 4 cartons need the 40 x 60 turn
  assert.equal(r.cartonsPlaced, 4);
  assertValid(r, types);
});

test('weight limit stops loading and says so', () => {
  const types = [box('H', 10, 10, 10, 10, { weightKg: 30 })];
  const r = pack(truck(200, 200, 200, 100), types);
  assert.equal(r.cartonsPlaced, 3); assert.equal(r.totalWeightKg, 90); assert.equal(r.status, 'overweight');
  assert.equal(r.byType[0].reason, 'weight'); assertValid(r, types);
});

test('maximum stacking height per carton type', () => {
  const types = [box('S', 10, 10, 10, 50, { maxLayers: 2 })];
  const r = pack(truck(10, 10, 100), types);
  assert.equal(r.cartonsPlaced, 2); assertValid(r, types);
  const free = pack(truck(10, 10, 100), [box('S', 10, 10, 10, 50)]);
  assert.equal(free.cartonsPlaced, 10);
  // two columns side by side: 2 layers each
  const wide = pack(truck(20, 10, 100), [box('S', 10, 10, 10, 50, { maxLayers: 3 })]);
  assert.equal(wide.cartonsPlaced, 6); assertValid(wide, [box('S', 10, 10, 10, 50, { maxLayers: 3 })]);
});

test('fragile cartons go on top and nothing is ever placed on them', () => {
  const types = [box('N', 100, 100, 50, 1, { weightKg: 20 }), box('F', 100, 100, 50, 1, { fragile: true })];
  const r = pack(truck(100, 100, 100), types);
  assert.equal(r.cartonsPlaced, 2);
  const f = r.cartons.find((c) => c.typeId === 'F'), n = r.cartons.find((c) => c.typeId === 'N');
  assert.equal(n.z, 0); assert.equal(f.z, 50);
  // two fragile cartons cannot be stacked on each other
  const two = pack(truck(100, 100, 100), [box('F', 100, 100, 50, 2, { fragile: true })]);
  assert.equal(two.cartonsPlaced, 1); assert.equal(two.cartonsUnplaced, 1);
});

test('heavy types are loaded before light ones of the same size, mixed sizes stay valid', () => {
  const types = [box('light', 40, 30, 30, 20, { weightKg: 2 }), box('big', 60, 50, 40, 30, { weightKg: 12 }), box('small', 20, 20, 15, 80, { weightKg: 1 })];
  const r = pack(truck(300, 150, 150), types);
  assert.equal(r.cartonsUnplaced, 0); assertValid(r, types);
  assert.equal(r.cartons[0].typeId, 'big');                     // biggest first
});

test('load balance warning when everything sits at the door end', () => {
  const types = [box('A', 100, 100, 100, 1, { weightKg: 500 })];
  const r = pack(truck(1000, 100, 100), types);
  assert.ok(r.cog.xPct < 20);                                   // loaded from the cab wall
  assert.match(r.warnings.join(' '), /Load balance/);
});

test('how many more cartons would fit in what is left', () => {
  const types = [box('A', 50, 40, 40, 400)];
  const r = pack(truck(800, 250, 200), types, { extra: box('A', 50, 40, 40, 1) });
  assert.equal(r.extraFit, 100);                                // the leftover 50 cm strip takes 40x50 cartons turned: 20 x 5 = 100 (a perfect 500 = 40 m3 / 0.08)
  assert.equal(r.cartonsPlaced, 400);                           // the plan itself is unchanged
  assert.equal(r.cartons.length, 400);
});

test('invalid input is refused with a clear message', () => {
  assert.throws(() => pack(truck(0, 100, 100), [box('A', 1, 1, 1, 1)]), /internal length/);
  assert.throws(() => pack(truck(100, 100, 100), [box('Z', 0, 1, 1, 1)]), /length, width and height/);
  assert.equal(pack(truck(100, 100, 100), []).status, 'empty');
});

test('property check: 300 random loads are always geometrically valid', () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (a, b) => Math.round(a + rnd() * (b - a));
  for (let n = 0; n < 300; n++) {
    const T = truck(pick(100, 700), pick(80, 250), pick(80, 250), rnd() < 0.3 ? pick(100, 3000) : 0);
    const types = Array.from({ length: pick(1, 5) }, (_, i) => box(`T${i}`, pick(10, 90), pick(10, 70), pick(8, 60), pick(1, 80), { weightKg: pick(1, 25), fragile: rnd() < 0.2, canTip: rnd() < 0.3, maxLayers: rnd() < 0.3 ? pick(1, 4) : undefined }));
    assertValid(pack(T, types), types);
  }
});

test('performance: 6,000 mixed cartons pack in well under 3 s', () => {
  const types = [box('a', 30, 20, 20, 3000), box('b', 25, 20, 15, 2500), box('c', 20, 15, 15, 500, { fragile: true })];
  const t0 = Date.now();
  const r = pack(truck(1200, 240, 240), types);
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, `took ${ms} ms`);
  assert.ok(r.cartonsPlaced > 5000, `placed ${r.cartonsPlaced}`); assertValid(r, types);
});
