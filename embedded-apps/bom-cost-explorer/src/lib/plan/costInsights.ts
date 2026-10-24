/**
 * Product-costing analytics on the plan's SAP Mode P result (browser-only, decimal.js). Used by Breakup & cost >
 * Simulate (plant drill-down, savings, KPIs & sensitivity). All figures come from SAP's leaf lines:
 *
 *   material cost of a line   = SelRatePcInr x QtyTot          freight = FrtPcInr x QtyTot      landed = TotCostInr
 *   plant roll-up             = leaf lines grouped by Hwerks (costed plant) > plan material > component
 *   savings vs a benchmark    = (SelRatePcInr - benchmark rate) x QtyTot, only where the benchmark is LOWER
 *                               benchmarks: Budget (BudLanded), Actual (ActRatePcInr), MBEW / Consumption /
 *                               cheapest priced SAP rate option (need the lazy rate options)
 *   price-increase exposure   = (ActRatePcInr - SelRatePcInr) x QtyTot, where the latest actual is HIGHER
 *   ABC (Pareto)              = components by landed cost: A up to 80 % cumulative, B up to 95 %, C the rest
 *   sensitivity               = plan impact of +-10 % on one component = 10 % of its landed cost
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import { costCategory, type CostCategory } from '../cost/categories';
import type { PlanCostLine } from './fields';
import type { PlanLineWithOptions } from './sources';
import { componentRate } from './sources';
import type { CompSimResult } from './componentSim';

const cat = (l: PlanCostLine) => costCategory(l as unknown as { Mtart: string; Matkl: string });
const pct = (a: Decimal, b: Decimal) => (b.isZero() ? null : a.div(b).times(100));

/* ---------- plant drill-down ---------- */

export interface PlantRow {
  hwerks: string;
  fgs: number;
  countries: string[];
  components: number;
  base: Decimal;
  sim: Decimal;
  delta: Decimal;
  deltaPct: Decimal | null;
  mix: Record<CostCategory, Decimal>; // landed cost by category (SAP)
  freight: Decimal;
  products: CompSimResult['products'];
}

export function plantSummary(rows: PlanCostLine[], r: CompSimResult): PlantRow[] {
  const m = new Map<string, PlantRow & { comp: Set<string>; land: Set<string> }>();
  for (const l of rows) {
    if (!isLeafRow(l)) continue;
    let p = m.get(l.Hwerks);
    if (!p) m.set(l.Hwerks, (p = { hwerks: l.Hwerks, fgs: 0, countries: [], components: 0, base: ZERO, sim: ZERO, delta: ZERO, deltaPct: null, mix: { RM: ZERO, PERFUME: ZERO, PM: ZERO, OTHER: ZERO }, freight: ZERO, products: [], comp: new Set(), land: new Set() }));
    p.comp.add(l.Idnrk);
    p.land.add(l.Land1);
    p.mix[cat(l)] = p.mix[cat(l)].plus(D(l.TotCostInr));
    p.freight = p.freight.plus(D(l.FrtPcInr).times(D(l.QtyTot)));
  }
  for (const pr of r.products) {
    const p = m.get(pr.hwerks);
    if (!p) continue;
    p.products.push(pr);
    p.base = p.base.plus(pr.base);
    p.sim = p.sim.plus(pr.sim);
  }
  return [...m.values()].map(({ comp, land, ...p }) => ({
    ...p, fgs: p.products.length, components: comp.size, countries: [...land].sort(), delta: p.sim.minus(p.base), deltaPct: pct(p.sim.minus(p.base), p.base),
  })).sort((a, b) => b.base.cmp(a.base));
}

/* ---------- savings & exposure ---------- */

export const BENCHMARKS = ['BUDGET', 'ACTUAL', 'MBEW', 'CONSUMP', 'CHEAPEST'] as const;
export type Benchmark = (typeof BENCHMARKS)[number];
export const BENCHMARK_LABEL: Record<Benchmark, string> = { BUDGET: 'Budget', ACTUAL: 'Latest actual', MBEW: 'C-MAP', CONSUMP: 'Consumption', CHEAPEST: 'Cheapest SAP option' };
export const NEEDS_OPTIONS: Benchmark[] = ['MBEW', 'CONSUMP', 'CHEAPEST'];

function benchmarkRate(l: PlanLineWithOptions, b: Benchmark): Decimal | null {
  if (b === 'BUDGET') return componentRate(l, 'BUDGET');
  if (b === 'MBEW') return componentRate(l, 'MBEW');
  if (b === 'CONSUMP') return componentRate(l, 'CONSUMP');
  if (b === 'ACTUAL') { const a = D(l.ActRatePcInr); return a.gt(0) ? a : null; }
  const opts = (l.RateOptions ?? []).map((o) => D(o.RatePcInr)).filter((v) => v.gt(0));
  return opts.length ? opts.reduce((a, v) => (v.lt(a) ? v : a)) : null;
}

export interface SavingsRow {
  idnrk: string;
  maktx: string;
  cat: CostCategory;
  meins: string;
  qty: Decimal;
  selCost: Decimal; // material cost at the selected rate
  selPc: Decimal | null;
  best: { benchmark: Benchmark; rate: Decimal; saving: Decimal } | null; // largest saving over all benchmarks
  byBenchmark: Partial<Record<Benchmark, { rate: Decimal; saving: Decimal }>>; // saving > 0 only
  exposure: Decimal; // latest actual above selected
  fgs: number;
}

export interface SavingsResult {
  rows: SavingsRow[];
  totalSel: Decimal;
  potential: Decimal; // sum of each component's best saving
  potentialPct: Decimal | null;
  byBenchmark: Record<Benchmark, { saving: Decimal; components: number; priced: number }>;
  exposure: Decimal;
  exposureComponents: number;
}

export function savings(lines: PlanLineWithOptions[]): SavingsResult {
  const m = new Map<string, SavingsRow & { heads: Set<string>; sums: Partial<Record<Benchmark, { cost: Decimal; priced: boolean }>> }>();
  const byB = Object.fromEntries(BENCHMARKS.map((b) => [b, { saving: ZERO, components: 0, priced: 0 }])) as SavingsResult['byBenchmark'];
  for (const l of lines) {
    if (!isLeafRow(l)) continue;
    const qty = D(l.QtyTot);
    const sel = D(l.SelRatePcInr);
    let c = m.get(l.Idnrk);
    if (!c) m.set(l.Idnrk, (c = { idnrk: l.Idnrk, maktx: l.Maktx, cat: cat(l), meins: l.Meins, qty: ZERO, selCost: ZERO, selPc: null, best: null, byBenchmark: {}, exposure: ZERO, fgs: 0, heads: new Set(), sums: {} }));
    c.qty = c.qty.plus(qty);
    c.selCost = c.selCost.plus(sel.times(qty));
    c.heads.add(`${l.Land1}|${l.Hwerks}|${l.Headmat}`);
    const act = D(l.ActRatePcInr);
    if (act.gt(sel) && sel.gt(0)) c.exposure = c.exposure.plus(act.minus(sel).times(qty));
    for (const b of BENCHMARKS) {
      const rate = benchmarkRate(l, b);
      const s = c.sums[b] ?? { cost: ZERO, priced: true };
      if (rate === null) s.priced = false;
      else s.cost = s.cost.plus(rate.times(qty));
      c.sums[b] = s;
    }
  }
  const rows: SavingsRow[] = [];
  let totalSel = ZERO;
  let potential = ZERO;
  let exposure = ZERO;
  let exposureComponents = 0;
  for (const { heads, sums, ...c } of m.values()) {
    totalSel = totalSel.plus(c.selCost);
    c.fgs = heads.size;
    c.selPc = c.qty.gt(0) ? c.selCost.div(c.qty) : null;
    for (const b of BENCHMARKS) {
      const s = sums[b];
      if (!s || !s.priced || !c.qty.gt(0)) continue;
      byB[b].priced++;
      const saving = c.selCost.minus(s.cost);
      if (saving.gt(0)) {
        c.byBenchmark[b] = { rate: s.cost.div(c.qty), saving };
        byB[b].saving = byB[b].saving.plus(saving);
        byB[b].components++;
        if (!c.best || saving.gt(c.best.saving)) c.best = { benchmark: b, rate: s.cost.div(c.qty), saving };
      }
    }
    if (c.best) potential = potential.plus(c.best.saving);
    if (c.exposure.gt(0)) { exposure = exposure.plus(c.exposure); exposureComponents++; }
    rows.push(c);
  }
  rows.sort((a, b) => (b.best?.saving ?? ZERO).cmp(a.best?.saving ?? ZERO) || b.selCost.cmp(a.selCost));
  return { rows, totalSel, potential, potentialPct: pct(potential, totalSel), byBenchmark: byB, exposure, exposureComponents };
}

/* ---------- KPIs, ABC, sensitivity ---------- */

export type AbcClass = 'A' | 'B' | 'C';
export interface AbcRow { idnrk: string; maktx: string; cat: CostCategory; base: Decimal; share: Decimal; cumShare: Decimal; cls: AbcClass; fgs: number; impactPer10: Decimal }

export function abc(r: CompSimResult): { rows: AbcRow[]; counts: Record<AbcClass, number>; shares: Record<AbcClass, Decimal> } {
  const total = r.components.reduce((a, c) => a.plus(c.base), ZERO);
  let cum = ZERO;
  const counts = { A: 0, B: 0, C: 0 };
  const shares = { A: ZERO, B: ZERO, C: ZERO };
  const rows = [...r.components].sort((a, b) => b.base.cmp(a.base)).map((c) => {
    const share = total.gt(0) ? c.base.div(total).times(100) : ZERO;
    const before = cum;
    cum = cum.plus(share);
    const cls: AbcClass = before.lt(80) ? 'A' : before.lt(95) ? 'B' : 'C';
    counts[cls]++;
    shares[cls] = shares[cls].plus(share);
    return { idnrk: c.idnrk, maktx: c.maktx, cat: c.cat, base: c.base, share, cumShare: cum, cls, fgs: c.products, impactPer10: c.base.times(0.1) };
  });
  return { rows, counts, shares };
}

export interface PlanKpis {
  landed: Decimal;
  material: Decimal;
  freight: Decimal;
  freightShare: Decimal | null;
  mix: Record<CostCategory, Decimal>;
  mixShare: Record<CostCategory, Decimal | null>;
  fgs: number;
  components: number;
  avgComponentsPerFg: number;
  noRate: number;
  avgPerPc: Decimal | null; // plan-qty-weighted landed cost per FG piece
  per1000: Decimal | null;
  planQty: Decimal;
  donorLines: number;
  actualVariance: Decimal; // (selected - actual) x qty over lines with an actual, + = selected above actual
}

export function planKpis(rows: PlanCostLine[], r: CompSimResult): PlanKpis {
  const mix: Record<CostCategory, Decimal> = { RM: ZERO, PERFUME: ZERO, PM: ZERO, OTHER: ZERO };
  let landed = ZERO; let material = ZERO; let freight = ZERO; let noRate = 0; let donor = 0; let actVar = ZERO;
  const perFg = new Map<string, Set<string>>();
  for (const l of rows) {
    if (!isLeafRow(l)) continue;
    const q = D(l.QtyTot);
    landed = landed.plus(D(l.TotCostInr));
    material = material.plus(D(l.SelRatePcInr).times(q));
    freight = freight.plus(D(l.FrtPcInr).times(q));
    mix[cat(l)] = mix[cat(l)].plus(D(l.TotCostInr));
    if (!l.SelSource) noRate++;
    if ((l as unknown as { Donor?: string }).Donor) donor++;
    const act = D(l.ActRatePcInr);
    if (act.gt(0)) actVar = actVar.plus(D(l.SelRatePcInr).minus(act).times(q));
    const k = `${l.Land1}|${l.Hwerks}|${l.Headmat}`;
    (perFg.get(k) ?? perFg.set(k, new Set()).get(k)!).add(l.Idnrk);
  }
  const planQty = r.products.reduce((a, p) => a.plus(p.planQty), ZERO);
  const avgPerPc = planQty.gt(0) ? r.base.div(planQty) : null;
  const sizes = [...perFg.values()].map((s) => s.size);
  return {
    landed, material, freight, freightShare: pct(freight, landed), mix,
    mixShare: Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, pct(v, landed)])) as PlanKpis['mixShare'],
    fgs: r.products.length, components: r.components.length, avgComponentsPerFg: sizes.length ? Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 10) / 10 : 0,
    noRate, avgPerPc, per1000: avgPerPc ? avgPerPc.times(1000) : null, planQty, donorLines: donor, actualVariance: actVar,
  };
}

/* ---------- scenario presets ---------- */

export interface Preset { id: string; label: string; hint: string; catPct: Partial<Record<CostCategory, number>> }
export const PRESETS: Preset[] = [
  { id: 'rm5', label: 'RM +5%', hint: 'Raw material inflation', catPct: { RM: 5 } },
  { id: 'pm10', label: 'PM +10%', hint: 'Packaging price increase', catPct: { PM: 10 } },
  { id: 'perf8', label: 'Perfume +8%', hint: 'Fragrance cost increase', catPct: { PERFUME: 8 } },
  { id: 'infl', label: 'Inflation mix', hint: 'RM +5 %, Perfume +6 %, PM +3 %', catPct: { RM: 5, PERFUME: 6, PM: 3 } },
  { id: 'save3', label: 'Savings drive −3%', hint: 'Negotiation target on every category', catPct: { RM: -3, PERFUME: -3, PM: -3, OTHER: -3 } },
  { id: 'pmval', label: 'PM value engineering −5%', hint: 'Packaging redesign / light-weighting', catPct: { PM: -5 } },
];
