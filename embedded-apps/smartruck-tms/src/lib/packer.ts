// Truck loading optimiser: a 3D carton packing engine (pure TypeScript, no dependencies, runs in the browser).
// Plain-TS syntax only (no enums / parameter properties) so `node --test` can run it directly (tests/packer.test.mjs).
//
// Method: block building with guillotine space splitting.
//   - Identical cartons are packed as rectangular blocks (nx rows x ny columns x nz layers), the way a loader really stacks them.
//   - The truck starts as one free space. Each step picks the (space, orientation, block shape) that places the most cartons,
//     puts the block in the space's front-left-floor corner and splits the rest into three free spaces (right, front, top).
//   - Every free space rests either on the truck floor or exactly on the footprint of the block below, so nothing floats.
//   - Fragile cartons get no space above them. Cartons are sorted so big, heavy, non-fragile types go in first (bottom, cab end) and
//     fragile ones last (top, door end).
// Coordinates: x = along the truck from the cab wall (0) to the door, y = across, z = up; all in cm. Weights in kg.

export interface TruckSpec { lengthCm: number; widthCm: number; heightCm: number; maxWeightKg: number }
export interface CartonType {
  id: string; name: string; lengthCm: number; widthCm: number; heightCm: number; weightKg: number; qty: number;
  /** Nothing may be placed on top of this carton. */
  fragile?: boolean;
  /** The carton may lie on its side (default false = this-side-up: only turned around the vertical axis). */
  canTip?: boolean;
  /** Maximum number of cartons of this type stacked in one column (default unlimited). */
  maxLayers?: number;
}
export interface Block { typeId: string; x: number; y: number; z: number; a: number; b: number; c: number; nx: number; ny: number; nz: number; count: number }
export interface Placed { typeId: string; x: number; y: number; z: number; l: number; w: number; h: number; seq: number }
export interface Space { x: number; y: number; z: number; dx: number; dy: number; dz: number; /** layers of each carton type already stacked below this space in its column */ below?: Record<string, number> }
export interface TypeResult { id: string; name: string; requested: number; placed: number; volumeM3: number; weightKg: number; reason: '' | 'space' | 'weight' | 'size' }
export interface PackResult {
  truck: TruckSpec; blocks: Block[]; cartons: Placed[]; free: Space[];
  truckVolumeM3: number; loadedVolumeM3: number; unusedVolumeM3: number; utilizationPct: number;
  /** Plain CBM check (what the volume figures alone would suggest) vs what really fits. */
  cartonsRequested: number; cartonsPlaced: number; cartonsUnplaced: number;
  totalWeightKg: number; weightPct: number;
  /** Centre of gravity of the load: x as % of the cargo length from the cab wall, y as % of the width from the left wall. */
  cog: { xPct: number; yPct: number; zPct: number };
  /** Share of the load weight in the front (cab) half / rear (door) half. */
  frontSharePct: number; rearSharePct: number;
  byType: TypeResult[];
  /** With opts.extra: how many more of that carton would still fit in the leftover space (not part of the plan). */
  extraFit?: number;
  status: 'ok' | 'under' | 'nofit' | 'overweight' | 'empty';
  warnings: string[];
}

const EPS = 1e-6;
const r2 = (n: number) => Math.round(n * 100) / 100;

function orientations(t: CartonType): [number, number, number][] {
  const { lengthCm: l, widthCm: w, heightCm: h } = t;
  const flat: [number, number, number][] = l === w ? [[l, w, h]] : [[l, w, h], [w, l, h]];
  if (!t.canTip) return flat;
  const seen = new Set<string>(); const out: [number, number, number][] = [];
  for (const o of [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]] as [number, number, number][]) { const k = o.join('x'); if (!seen.has(k)) { seen.add(k); out.push(o); } }
  return out;
}

/** Best block of `t` that fits in space `s` with at most `remaining` cartons: most cartons, then the tightest footprint. */
function bestBlock(s: Space, t: CartonType, remaining: number, maxByWeight: number) {
  const cap = Math.min(remaining, maxByWeight);
  if (cap <= 0) return null;
  let best: { a: number; b: number; c: number; nx: number; ny: number; nz: number; count: number } | null = null;
  const already = (s.below && s.below[t.id]) || 0;
  let layersCap = t.maxLayers && t.maxLayers > 0 ? t.maxLayers - already : Infinity;
  if (t.fragile) layersCap = Math.min(layersCap, 1);                 // nothing may sit on a fragile carton, so never stack them
  if (layersCap < 1) return null;
  for (const [a, b, c] of orientations(t)) {
    const mx = Math.floor((s.dx + EPS) / a), my = Math.floor((s.dy + EPS) / b), mz = Math.min(Math.floor((s.dz + EPS) / c), layersCap);
    if (mx < 1 || my < 1 || mz < 1) continue;
    for (let nz = 1; nz <= mz; nz++) {
      for (let ny = 1; ny <= my; ny++) {
        const nx = Math.min(mx, Math.floor(cap / (ny * nz)));
        if (nx < 1) continue;
        const count = nx * ny * nz;
        const tight = (nx * a) * (ny * b);
        if (!best || count > best.count || (count === best.count && tight > best.nx * best.a * best.ny * best.b)) best = { a, b, c, nx, ny, nz, count };
      }
    }
  }
  return best;
}

export function pack(truck: TruckSpec, types: CartonType[], opts: { extra?: CartonType } = {}): PackResult {
  const warnings: string[] = [];
  const clean = types.filter((t) => t.qty > 0).map((t) => ({ ...t }));
  for (const t of clean) {
    if (!(t.lengthCm > 0 && t.widthCm > 0 && t.heightCm > 0)) throw new Error(`Carton "${t.name}" needs length, width and height above zero.`);
    if (!(t.weightKg >= 0)) throw new Error(`Carton "${t.name}" has an invalid weight.`);
  }
  if (!(truck.lengthCm > 0 && truck.widthCm > 0 && truck.heightCm > 0)) throw new Error('The truck needs internal length, width and height above zero.');
  // big, heavy, non-fragile types first; fragile last
  clean.sort((p, q) => Number(!!p.fragile) - Number(!!q.fragile)
    || q.lengthCm * q.widthCm * q.heightCm - p.lengthCm * p.widthCm * p.heightCm
    || q.weightKg - p.weightKg);

  let free: Space[] = [{ x: 0, y: 0, z: 0, dx: truck.lengthCm, dy: truck.widthCm, dz: truck.heightCm }];
  const blocks: Block[] = [];
  const typeRes = new Map<string, TypeResult>();
  let weight = 0;
  const maxW = truck.maxWeightKg > 0 ? truck.maxWeightKg : Infinity;

  const place = (t: CartonType, qty: number, record: boolean) => {
    let remaining = qty, placed = 0, blocked: 'space' | 'weight' | 'size' = 'space';
    const record_ = (placedNow: number, reason: TypeResult['reason']) => {
      if (!record) return;
      const prev = typeRes.get(t.id) || { id: t.id, name: t.name, requested: 0, placed: 0, volumeM3: 0, weightKg: 0, reason: '' as TypeResult['reason'] };
      prev.requested += qty; prev.placed += placedNow;
      prev.volumeM3 += (placedNow * t.lengthCm * t.widthCm * t.heightCm) / 1e6; prev.weightKg += placedNow * t.weightKg;
      prev.reason = reason;
      typeRes.set(t.id, prev);
    };
    const fits = orientations(t).some(([a, b, c]) => a <= truck.lengthCm + EPS && b <= truck.widthCm + EPS && c <= truck.heightCm + EPS);
    if (!fits) { record_(0, 'size'); return { placed: 0, reason: 'size' as const }; }
    while (remaining > 0) {
      const byWeight = t.weightKg > 0 ? Math.floor((maxW - weight + EPS) / t.weightKg) : Infinity;
      if (byWeight <= 0) { blocked = 'weight'; break; }
      let pick: { si: number; b: NonNullable<ReturnType<typeof bestBlock>> } | null = null;
      for (let i = 0; i < free.length; i++) {
        const b = bestBlock(free[i], t, remaining, byWeight);
        if (!b) continue;
        const s = free[i];
        if (!pick || b.count > pick.b.count
          || (b.count === pick.b.count && (s.z < free[pick.si].z - EPS || (Math.abs(s.z - free[pick.si].z) < EPS && (s.x < free[pick.si].x - EPS || (Math.abs(s.x - free[pick.si].x) < EPS && s.y < free[pick.si].y)))))) pick = { si: i, b };
      }
      if (!pick) { blocked = 'space'; break; }
      const s = free[pick.si], b = pick.b;
      const bx = b.nx * b.a, by = b.ny * b.b, bz = b.nz * b.c;
      blocks.push({ typeId: t.id, x: s.x, y: s.y, z: s.z, a: b.a, b: b.b, c: b.c, nx: b.nx, ny: b.ny, nz: b.nz, count: b.count });
      weight += b.count * t.weightKg; placed += b.count; remaining -= b.count;
      // split: right / front / top. Two variants; keep the one whose largest leftover space is bigger.
      const rest: Space[] = [];
      const below = s.below ? { ...s.below } : undefined;
      const topBelow = { ...(s.below || {}), [t.id]: ((s.below && s.below[t.id]) || 0) + b.nz };
      const topSpace: Space | null = !t.fragile && s.dz - bz > EPS ? { x: s.x, y: s.y, z: s.z + bz, dx: bx, dy: by, dz: s.dz - bz, below: topBelow } : null;
      const A: Space[] = [{ x: s.x + bx, y: s.y, z: s.z, dx: s.dx - bx, dy: s.dy, dz: s.dz, below }, { x: s.x, y: s.y + by, z: s.z, dx: bx, dy: s.dy - by, dz: s.dz, below }];
      const B: Space[] = [{ x: s.x + bx, y: s.y, z: s.z, dx: s.dx - bx, dy: by, dz: s.dz, below }, { x: s.x, y: s.y + by, z: s.z, dx: s.dx, dy: s.dy - by, dz: s.dz, below }];
      const vol = (l: Space[]) => Math.max(0, ...l.map((q) => q.dx * q.dy * q.dz));
      for (const q of (vol(A) >= vol(B) ? A : B)) if (q.dx > EPS && q.dy > EPS && q.dz > EPS) rest.push(q);
      if (topSpace) rest.push(topSpace);
      free.splice(pick.si, 1, ...rest);
    }
    record_(placed, remaining > 0 ? blocked : '');
    return { placed, reason: remaining > 0 ? blocked : ('' as const) };
  };

  for (const t of clean) place(t, t.qty, true);
  const mainBlocks = blocks.length;

  // how many more of a reference carton would still fit in what is left (virtual, not part of the plan)
  let extraFit = 0;
  const extra = opts.extra;
  if (extra && extra.lengthCm > 0 && extra.widthCm > 0 && extra.heightCm > 0) {
    const keepW = weight, keepBlocks = blocks.length, keepFree = free.map((q) => ({ ...q }));
    extraFit = place({ ...extra, qty: 1e6 }, 1e6, false).placed;
    weight = keepW; blocks.length = keepBlocks; free = keepFree;
  }

  // expand blocks to cartons in loading order (layer by layer inside a block)
  const byId = new Map(clean.map((t) => [t.id, t]));
  const cartons: Placed[] = [];
  let seq = 0;
  for (let bi = 0; bi < mainBlocks; bi++) {
    const b = blocks[bi];
    for (let k = 0; k < b.nz; k++) for (let i = 0; i < b.nx; i++) for (let j = 0; j < b.ny; j++)
      cartons.push({ typeId: b.typeId, x: b.x + i * b.a, y: b.y + j * b.b, z: b.z + k * b.c, l: b.a, w: b.b, h: b.c, seq: seq++ });
  }
  blocks.length = mainBlocks;

  const truckVol = (truck.lengthCm * truck.widthCm * truck.heightCm) / 1e6;
  let loadedVol = 0, wx = 0, wy = 0, wz = 0, front = 0, rear = 0;
  for (const c of cartons) {
    const t = byId.get(c.typeId)!, v = (c.l * c.w * c.h) / 1e6; loadedVol += v;
    const cx = c.x + c.l / 2, cy = c.y + c.w / 2, cz = c.z + c.h / 2, kg = t.weightKg;
    wx += cx * kg; wy += cy * kg; wz += cz * kg;
    if (cx < truck.lengthCm / 2) front += kg; else rear += kg;
  }
  const totalWeight = cartons.reduce((a, c) => a + byId.get(c.typeId)!.weightKg, 0);
  const requested = clean.reduce((a, t) => a + t.qty, 0);
  const byType = clean.map((t) => { const r = typeRes.get(t.id)!; return { ...r, volumeM3: r2(r.volumeM3), weightKg: r2(r.weightKg) }; });
  const unplaced = requested - cartons.length;
  const cog = totalWeight > 0 ? { xPct: r2((wx / totalWeight / truck.lengthCm) * 100), yPct: r2((wy / totalWeight / truck.widthCm) * 100), zPct: r2((wz / totalWeight / truck.heightCm) * 100) } : { xPct: 50, yPct: 50, zPct: 0 };
  const frontShare = totalWeight > 0 ? r2((front / totalWeight) * 100) : 0, rearShare = totalWeight > 0 ? r2((rear / totalWeight) * 100) : 0;

  for (const t of byType) {
    if (t.reason === 'size') warnings.push(`"${t.name}" is larger than the truck in every orientation - it cannot be loaded.`);
    else if (t.reason === 'weight') warnings.push(`"${t.name}": ${t.requested - t.placed} carton(s) left out because the truck's weight limit is reached.`);
    else if (t.reason === 'space') warnings.push(`"${t.name}": ${t.requested - t.placed} carton(s) do not fit in the remaining space.`);
  }
  if (totalWeight > 0 && (frontShare < 35 || frontShare > 65)) warnings.push(`Load balance: ${frontShare}% of the weight is in the front half and ${rearShare}% in the rear half (aim for 35-65%). Check the axle loads of this vehicle.`);
  if (cog.zPct > 55) warnings.push('The centre of gravity is high; put heavy cartons at the bottom.');

  const util = truckVol > 0 ? (loadedVol / truckVol) * 100 : 0;
  const status: PackResult['status'] = requested === 0 ? 'empty' : byType.some((t) => t.reason === 'weight') ? 'overweight' : unplaced > 0 ? 'nofit' : 'ok';
  return {
    truck, blocks, cartons, free: free.map((q) => ({ ...q })),
    truckVolumeM3: r2(truckVol), loadedVolumeM3: r2(loadedVol), unusedVolumeM3: r2(truckVol - loadedVol), utilizationPct: r2(util),
    cartonsRequested: requested, cartonsPlaced: cartons.length, cartonsUnplaced: unplaced,
    totalWeightKg: r2(totalWeight), weightPct: maxW === Infinity ? 0 : r2((totalWeight / maxW) * 100),
    cog, frontSharePct: frontShare, rearSharePct: rearShare, byType, status, warnings,
    ...(extra ? { extraFit } : {}),
  };
}

/** Volume of the cartons (CBM) before any packing: what a plain volume comparison uses. */
export const cartonVolumeM3 = (types: CartonType[]) => r2(types.reduce((a, t) => a + (t.qty * t.lengthCm * t.widthCm * t.heightCm) / 1e6, 0));
