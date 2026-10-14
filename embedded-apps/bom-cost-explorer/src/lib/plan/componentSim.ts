/**
 * Production Plan > Breakup & cost > Simulate: what happens to each product's cost (and the whole plan) when
 * component costs go up or down. Browser-only, on top of the SAP Mode P result (always marked simulated).
 *
 * Changes, most specific first (one wins per component):
 *   1. new cost per unit for a component (landed INR per component unit, every plant)
 *   2. % change for a component
 *   3. % change for its category (RM / Perfume / PM / Other)
 *
 *   simulated line cost  = TotCostInr x (new cost per unit / TotCostPcInr)     (TotCostPcInr 0: QtyTot x new cost)
 *                        = TotCostInr x (1 + % / 100)
 *   product impact       = sum of simulated LEAF line costs per plan country + plant + plan material - SAP figure
 *   cost per FG piece    = product cost / PlanQty (as on the Breakup)
 * Settings are kept per plan in localStorage "plan:compsim".
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import { costCategory, type CostCategory } from '../cost/categories';
import { ls } from '../client/storage';
import { headerRollups, monthlyCost, monthQty, planTotals, type PlanHeaderRollup } from './maths';
import type { PlanCostLine } from './fields';

export interface CompSimSettings {
  catPct: Partial<Record<CostCategory, number>>;
  compPct: Record<string, number>; // Idnrk -> %
  compPc: Record<string, string>; // Idnrk -> new landed cost per unit, INR
}

export const emptyCompSim = (): CompSimSettings => ({ catPct: {}, compPct: {}, compPc: {} });

export const isCompSimIdentity = (s: CompSimSettings) =>
  !Object.values(s.catPct).some(Boolean) && !Object.values(s.compPct).some(Boolean) && !Object.values(s.compPc).some((v) => v !== '' && v !== undefined);

const lineCat = (l: PlanCostLine) => costCategory(l as unknown as { Mtart: string; Matkl: string });

/** What changes a component's cost, or null when nothing does. */
export function lineChange(l: PlanCostLine, s: CompSimSettings): { kind: 'pc'; pc: Decimal } | { kind: 'pct'; pct: number; from: 'component' | 'category' } | null {
  const pc = s.compPc[l.Idnrk];
  if (pc !== undefined && pc !== '' && D(pc).gte(0)) return { kind: 'pc', pc: D(pc) };
  if (s.compPct[l.Idnrk]) return { kind: 'pct', pct: s.compPct[l.Idnrk], from: 'component' };
  const c = s.catPct[lineCat(l)];
  if (c) return { kind: 'pct', pct: c, from: 'category' };
  return null;
}

/** Simulated total and monthly cost of one leaf line (SAP figures when nothing changes it). */
export function simLineCost(l: PlanCostLine, s: CompSimSettings): { total: Decimal; months: Decimal[]; pc: Decimal } {
  const base = D(l.TotCostInr);
  const basePc = D(l.TotCostPcInr);
  const ch = lineChange(l, s);
  if (!ch) return { total: base, months: monthlyCost(l), pc: basePc };
  if (ch.kind === 'pct') {
    const f = D(1).plus(D(ch.pct).div(100));
    return { total: base.times(f), months: monthlyCost(l).map((m) => m.times(f)), pc: basePc.times(f) };
  }
  if (basePc.gt(0)) {
    const f = ch.pc.div(basePc);
    return { total: base.times(f), months: monthlyCost(l).map((m) => m.times(f)), pc: ch.pc };
  }
  return { total: D(l.QtyTot).times(ch.pc), months: monthQty(l).map((q) => q.times(ch.pc)), pc: ch.pc };
}

export interface ProductImpact {
  key: string; // Land1|Hwerks|Headmat
  land1: string;
  hwerks: string;
  headmat: string;
  headtxt: string;
  planQty: Decimal;
  base: Decimal;
  sim: Decimal;
  delta: Decimal;
  deltaPct: Decimal | null;
  basePc: Decimal | null;
  simPc: Decimal | null;
  deltaPc: Decimal | null;
  changedLines: number;
}

export interface ComponentRow {
  idnrk: string;
  maktx: string;
  cat: CostCategory;
  meins: string;
  qty: Decimal; // total plan quantity of the component (all products, plants)
  base: Decimal;
  sim: Decimal;
  delta: Decimal;
  basePc: Decimal | null; // weighted landed cost per unit
  simPc: Decimal | null;
  products: number;
  plants: string[];
}

export interface CompSimResult {
  products: ProductImpact[];
  components: ComponentRow[];
  countries: { land1: string; base: Decimal; sim: Decimal; delta: Decimal; deltaPct: Decimal | null; products: number; affected: number }[];
  base: Decimal;
  sim: Decimal;
  delta: Decimal;
  deltaPct: Decimal | null;
  baseMonths: Decimal[];
  simMonths: Decimal[];
  affected: number; // products whose cost changes
}

const pct = (d: Decimal, b: Decimal) => (b.isZero() ? null : d.div(b).times(100));

export function simulateComponents(rows: PlanCostLine[], s: CompSimSettings): CompSimResult {
  const cache = rows.map((l) => (isLeafRow(l) ? simLineCost(l, s) : null));
  const baseR = headerRollups(rows);
  const simR = headerRollups(rows, (_l, i) => cache[i]!.total, (_l, i) => cache[i]!.months);
  const changed = new Map<string, number>();
  rows.forEach((l) => { if (isLeafRow(l) && lineChange(l, s)) changed.set(`${l.Land1}|${l.Hwerks}|${l.Headmat}`, (changed.get(`${l.Land1}|${l.Hwerks}|${l.Headmat}`) ?? 0) + 1); });

  const products: ProductImpact[] = [...baseR.values()].map((b: PlanHeaderRollup) => {
    const x = simR.get(b.key)!;
    const delta = x.total.minus(b.total);
    return {
      key: b.key, land1: b.land1, hwerks: b.hwerks, headmat: b.headmat, headtxt: b.headtxt, planQty: b.planQty,
      base: b.total, sim: x.total, delta, deltaPct: pct(delta, b.total),
      basePc: b.perPiece, simPc: x.perPiece, deltaPc: b.perPiece && x.perPiece ? x.perPiece.minus(b.perPiece) : null,
      changedLines: changed.get(b.key) ?? 0,
    };
  });

  const comps = new Map<string, ComponentRow & { heads: Set<string>; plantSet: Set<string> }>();
  rows.forEach((l, i) => {
    if (!isLeafRow(l)) return;
    let c = comps.get(l.Idnrk);
    if (!c) comps.set(l.Idnrk, (c = { idnrk: l.Idnrk, maktx: l.Maktx, cat: lineCat(l), meins: l.Meins, qty: ZERO, base: ZERO, sim: ZERO, delta: ZERO, basePc: null, simPc: null, products: 0, plants: [], heads: new Set(), plantSet: new Set() }));
    c.qty = c.qty.plus(D(l.QtyTot));
    c.base = c.base.plus(D(l.TotCostInr));
    c.sim = c.sim.plus(cache[i]!.total);
    c.heads.add(`${l.Land1}|${l.Hwerks}|${l.Headmat}`);
    c.plantSet.add(l.Werks || l.Hwerks);
  });
  const components = [...comps.values()].map(({ heads, plantSet, ...c }) => ({
    ...c, delta: c.sim.minus(c.base), products: heads.size, plants: [...plantSet].sort(),
    basePc: c.qty.gt(0) ? c.base.div(c.qty) : null, simPc: c.qty.gt(0) ? c.sim.div(c.qty) : null,
  })).sort((a, b) => b.base.cmp(a.base));

  const bt = planTotals(baseR.values());
  const st = planTotals(simR.values());
  const byC = new Map<string, CompSimResult['countries'][number]>();
  for (const p of products) {
    const c = byC.get(p.land1) ?? { land1: p.land1, base: ZERO, sim: ZERO, delta: ZERO, deltaPct: null, products: 0, affected: 0 };
    c.base = c.base.plus(p.base);
    c.sim = c.sim.plus(p.sim);
    c.products++;
    if (!p.delta.isZero()) c.affected++;
    byC.set(p.land1, c);
  }
  const countries = [...byC.values()].map((c) => ({ ...c, delta: c.sim.minus(c.base), deltaPct: pct(c.sim.minus(c.base), c.base) }));
  const delta = st.total.minus(bt.total);
  return {
    products: products.sort((a, b) => b.delta.abs().cmp(a.delta.abs()) || b.base.cmp(a.base)),
    components, countries,
    base: bt.total, sim: st.total, delta, deltaPct: pct(delta, bt.total),
    baseMonths: bt.months, simMonths: st.months,
    affected: products.filter((p) => !p.delta.isZero()).length,
  };
}

// ---- storage (per plan) ---------------------------------------------------------------------------
const KEY = 'plan:compsim';
export function loadCompSim(plan: string): CompSimSettings {
  const all = ls.get<Record<string, CompSimSettings>>(KEY, {});
  const s = all[plan];
  return s && typeof s === 'object' ? { ...emptyCompSim(), ...s } : emptyCompSim();
}
export function saveCompSim(plan: string, s: CompSimSettings) {
  const all = ls.get<Record<string, CompSimSettings>>(KEY, {});
  if (isCompSimIdentity(s)) delete all[plan];
  else all[plan] = s;
  ls.set(KEY, all);
}
