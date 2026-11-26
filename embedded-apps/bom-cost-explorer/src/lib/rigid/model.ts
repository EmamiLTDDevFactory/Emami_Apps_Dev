/**
 * Pure model of the ZRIGID rate (per 1000 pieces): the build-up lines, the what-if (same formulas as program ZMM_MOLD_INFO_RECORD / ZCL_MM_RIGID_COST),
 * the polymer sensitivity and the vendor comparison. SAP computes the base figures; the what-if only recomputes with the values the person changes. Nothing is written anywhere.
 */
import Decimal from 'decimal.js';
import type { RigidRow } from './fields';

const ZERO = new Decimal(0);
export const dd = (v: string | number | null | undefined): Decimal => { try { return v === null || v === undefined || v === '' ? ZERO : new Decimal(String(v)); } catch { return ZERO; } };
export const strip0 = (m: string) => m.replace(/^0+/, '');

export interface Mould { key: string; row: RigidRow; comps: RigidRow[]; landed: Decimal }
export interface RigidCalc { moulds: Mould[]; errors: RigidRow[] }

/** M rows with their B rows (same item, mould and vendor); ERR / NOBOM rows are kept apart as messages. */
export function parseCalc(rows: RigidRow[]): RigidCalc {
  const moulds: Mould[] = []; const errors: RigidRow[] = [];
  const by = new Map<string, Mould>();
  for (const r of rows) {
    if (r.Grain === 'M') {
      if (r.Flag === 'OK') { const m = { key: `${r.Matnr}|${r.Mould}|${r.Lifnr}`, row: r, comps: [], landed: dd(r.LandRate) }; moulds.push(m); by.set(m.key, m); } else errors.push(r);
    }
  }
  for (const r of rows) if (r.Grain === 'B') by.get(`${r.Matnr}|${r.Mould}|${r.Lifnr}`)?.comps.push(r);
  moulds.sort((a, b) => a.landed.comparedTo(b.landed) || a.key.localeCompare(b.key));
  return { moulds, errors };
}

export interface BuildLine { key: string; label: string; amount: Decimal }
/** The lines that add up to the landed rate (per 1000): resin, conversion, box, packing add-ons, margin, ITC, freight, others. */
export function buildUp(r: RigidRow): BuildLine[] {
  const L: [string, string, string][] = [['mat', 'Resin / material (polymer and master batch)', r.MatCost], ['conv', 'Conversion (machine day rate / output)', r.ConvCost], ['box', 'Box (ZMBX)', r.Zmbx],
    ['ppb', 'PP box and add-ons (ZPPB + ZMPB + ZMTP)', r.ZppbT], ['mac', 'Machine / mould charge (ZMAC)', r.Zmac], ['mat2', 'Material add-on (ZMAT)', r.Zmat], ['itc', 'ITC (ZITC)', r.Zitc], ['mar', 'Margin (ZMAR)', r.Zmar],
    ['ehp', 'Handling (ZEHP)', r.Zehp], ['wad', 'Wastage / adjustment (ZWAD)', r.Zwad], ['daj', 'Adjustment (ZDAJ)', r.Zdaj], ['frt', 'Freight (ZMFG)', r.Zmfg]];
  return L.map(([key, label, v]) => ({ key, label, amount: dd(v) })).filter((x) => !x.amount.isZero());
}

export interface WhatIf {
  zmrt: string; cycTime: string; cavities: string; hoursDay: string; efficiency: string;
  /** polymer / master batch rate per BOM component material (rate per kg) and scrap % */
  rates: Record<string, string>; scrap: Record<string, string>;
  zmbx: string; zmpb: string; zmtp: string; zppbT: string; zmac: string; zmat: string; itcPct: string; marPct: string; zehp: string; zwad: string; zdaj: string; zmfg: string;
}
/** The what-if inputs that reproduce the SAP figure (percentages recovered from the amounts SAP sent). */
export function baseWhatIf(m: Mould): WhatIf {
  const r = m.row;
  const baseItc = dd(r.ConvCost).plus(dd(r.MatCost)).plus(dd(r.Zmbx)).plus(dd(r.Zmpb)).plus(dd(r.Zmtp)).plus(dd(r.ZppbT));
  const baseMar = baseItc.plus(dd(r.Zmac));
  const pct = (amt: string, base: Decimal) => (base.gt(0) ? dd(amt).times(100).div(base).toDecimalPlaces(4).toString() : '0');
  return {
    zmrt: r.Zmrt, cycTime: r.CycTime, cavities: r.RunCavity, hoursDay: r.HoursDay, efficiency: r.FacProd,
    rates: Object.fromEntries(m.comps.map((c) => [c.Comp, c.Zpbr])), scrap: Object.fromEntries(m.comps.map((c) => [c.Comp, c.ScrapPct])),
    zmbx: r.Zmbx, zmpb: r.Zmpb, zmtp: r.Zmtp, zppbT: r.ZppbT, zmac: r.Zmac, zmat: r.Zmat, itcPct: pct(r.Zitc, baseItc), marPct: pct(r.Zmar, baseMar), zehp: r.Zehp, zwad: r.Zwad, zdaj: r.Zdaj, zmfg: r.Zmfg,
  };
}
export interface WhatIfResult { output: Decimal; conv: Decimal; mat: Decimal; itc: Decimal; mar: Decimal; landed: Decimal; landedRounded: Decimal; perPiece: Decimal }
export function simulate(m: Mould, w: WhatIf): WhatIfResult {
  const hours = dd(w.hoursDay), eff = dd(w.efficiency), cyc = dd(w.cycTime), cav = dd(w.cavities);
  const output = cyc.gt(0) ? hours.times(3600).times(eff.div(100)).div(cyc).times(cav) : ZERO;
  const conv = output.gt(0) ? dd(w.zmrt).div(output).times(1000) : ZERO;
  let mat = ZERO;
  for (const c of m.comps) {
    const qty = dd(c.BomQty).times(new Decimal(1).plus(dd(w.scrap[c.Comp] ?? c.ScrapPct).div(100)));
    mat = mat.plus(dd(w.rates[c.Comp] ?? c.Zpbr).times(qty));
  }
  const zmbx = dd(w.zmbx), zmpb = dd(w.zmpb), zmtp = dd(w.zmtp), zppbT = dd(w.zppbT), zmac = dd(w.zmac);
  const itc = conv.plus(mat).plus(zmbx).plus(zmpb).plus(zmtp).plus(zppbT).times(dd(w.itcPct)).div(100);
  const mar = conv.plus(mat).plus(zmbx).plus(zmac).plus(zmpb).plus(zmtp).plus(zppbT).times(dd(w.marPct)).div(100);
  const landed = mat.plus(zmbx).plus(conv).plus(dd(w.zmfg)).plus(zmac).plus(dd(w.zmat)).plus(itc).plus(mar).plus(dd(w.zehp)).plus(dd(w.zwad)).plus(dd(w.zdaj)).plus(zppbT);
  const landedRounded = landed.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return { output, conv, mat, itc, mar, landed, landedRounded, perPiece: landedRounded.div(1000) };
}

/** Polymer / master batch rate moved by -20 ... +20 %: the landed rate per 1000 and its change against today (SAP landed rate). */
export const SENS_STEPS = [-20, -10, -5, 5, 10, 20] as const;
export function sensitivity(m: Mould, comp?: string): { pct: number; landed: Decimal; delta: Decimal }[] {
  const base = baseWhatIf(m); const base0 = simulate(m, base).landedRounded;
  return SENS_STEPS.map((p) => {
    const rates = { ...base.rates };
    for (const c of m.comps) if (!comp || c.Comp === comp) rates[c.Comp] = dd(c.Zpbr).times(1 + p / 100).toString();
    const l = simulate(m, { ...base, rates }).landedRounded;
    return { pct: p, landed: l, delta: l.minus(base0) };
  });
}

/** Vendor comparison of one item: cheapest landed rate first, with the difference to the cheapest and the output per day. */
export interface VendorLine { key: string; mould: string; mouldTxt: string; design: string; lifnr: string; vendor: string; machine: string; output: Decimal; conv: Decimal; mat: Decimal; landed: Decimal; diff: Decimal; diffPct: Decimal | null; cheapest: boolean }
export function vendorCompare(c: RigidCalc): VendorLine[] {
  const min = c.moulds.length ? c.moulds[0].landed : ZERO;
  return c.moulds.map((m) => ({
    key: m.key, mould: strip0(m.row.Mould), mouldTxt: m.row.MouldTxt, design: m.row.Design, lifnr: strip0(m.row.Lifnr), vendor: m.row.Vendor, machine: `${m.row.Mach} ${m.row.MachTxt}`.trim(),
    output: dd(m.row.TotOut), conv: dd(m.row.ConvCost), mat: dd(m.row.MatCost), landed: m.landed, diff: m.landed.minus(min), diffPct: min.gt(0) ? m.landed.minus(min).div(min).times(100) : null, cheapest: m.landed.eq(min),
  }));
}

/** Impact of a polymer rate change on the rigid items that use it (rows of Mode U): extra cost per 1000 pieces = BOM quantity x rate change. */
export interface UsageLine { matnr: string; maktx: string; werks: string; qty: Decimal; deltaPer1000: Decimal }
export function polymerImpact(rows: RigidRow[], ratePctChange: Decimal, currentRate: Decimal): UsageLine[] {
  const dRate = currentRate.times(ratePctChange).div(100);
  return rows.filter((r) => r.Grain === 'U').map((r) => ({ matnr: strip0(r.Matnr), maktx: r.Maktx, werks: r.Werks, qty: dd(r.BomQty), deltaPer1000: dd(r.BomQty).times(dRate) })).sort((a, b) => b.deltaPer1000.abs().comparedTo(a.deltaPer1000.abs()));
}
