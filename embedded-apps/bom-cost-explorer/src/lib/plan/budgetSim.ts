/**
 * Requirement tab maths: component quantities and where used, plan cost at MONTHLY budget rates, component rate
 * simulation, and the interim savings estimate. Browser-only on the SAP Mode P lines (decimal.js).
 *
 * Monthly budget rate of a component (fiscal months, index 0 = April):
 *   H1 (Apr..Sep, idx 0..5)  = BudLanded (SAP budget landed rate per component unit, INR)
 *   H2 (Oct..Mar, idx 6..11) = the H2 revision entered in the app: the component's own revised rate, else its own
 *                              %, else the all-component H2 %, else BudLanded unchanged
 *   (until SAP sends a rate per month; then `monthRates` reads those instead - one place to change)
 *   No budget rate: the selected SAP rate is used when `fallback` is on, and the line is counted as "no budget".
 *
 * Plan cost at budget  = sum over leaf lines and months of QtyM(m) x rate(m)
 * Simulated            = the same with the component's rate changed: new absolute rate (all months), or +-% on the
 *                        month rate (so the H2 revision is kept)
 * Product (FG) cost    = per plan country + plant + plan material; per piece = cost / PlanQty
 *
 * Savings estimate (interim, until SAP sends actual consumption):
 *   months     = elapsed fiscal months (April .. the last completed month), or the months chosen
 *   actual qty = the PLANNED quantity of those months (estimate)
 *   actual rate= ActRatePcInr (average actual) or the Consumption rate option
 *   saving     = (budget rate(m) - actual rate) x qty(m)        + = saving, - = overspend
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import { ls } from '../client/storage';
import { monthQty } from './maths';
import { componentRate, type PlanLineWithOptions } from './sources';

export const H2_START = 6; // October
export const MONTHS = 12;

export interface RateChange { pct?: number; pc?: string }
export interface BudgetSettings {
  h2Pct: number; // all components, from October
  h2: Record<string, RateChange>; // Idnrk -> H2 revision (rate or %)
  sim: Record<string, RateChange>; // Idnrk -> simulated change (rate for all months, or % on the month rate)
  fallback: boolean; // use the selected SAP rate where there is no budget rate
}
export const emptyBudget = (): BudgetSettings => ({ h2Pct: 0, h2: {}, sim: {}, fallback: true });

const hasPc = (c?: RateChange) => !!c && c.pc !== undefined && c.pc !== '' && D(c.pc).gte(0);
export const isActive = (c?: RateChange) => hasPc(c) || !!c?.pct;
export const isSimIdentity = (s: BudgetSettings) => !Object.values(s.sim).some(isActive);

/** Budget rate per unit of a line for each fiscal month, and where it came from. */
export function monthRates(l: PlanLineWithOptions, s: BudgetSettings): { rates: Decimal[]; source: 'budget' | 'selected' | 'none' } {
  let base = componentRate(l, 'BUDGET');
  let source: 'budget' | 'selected' | 'none' = 'budget';
  if (!base) {
    const sel = s.fallback ? componentRate(l, 'SELECTED') : null;
    if (sel) { base = sel; source = 'selected'; } else { base = ZERO; source = 'none'; }
  }
  const own = s.h2[l.Idnrk];
  const h2 = hasPc(own) ? D(own!.pc!) : base.times(D(1).plus(D(own?.pct || s.h2Pct || 0).div(100)));
  return { rates: Array.from({ length: MONTHS }, (_, m) => (m >= H2_START ? h2 : base!)), source };
}

/** Month rates after the simulated change of the line's component. */
export function simRates(rates: Decimal[], c?: RateChange): Decimal[] {
  if (hasPc(c)) return rates.map(() => D(c!.pc!));
  if (c?.pct) return rates.map((r) => r.times(D(1).plus(D(c.pct!).div(100))));
  return rates;
}

const sum = (a: Decimal[]) => a.reduce((x, v) => x.plus(v), ZERO);
const pct = (d: Decimal, b: Decimal) => (b.isZero() ? null : d.div(b).times(100));

export interface WhereUsedFg {
  key: string; land1: string; hwerks: string; headmat: string; headtxt: string;
  months: Decimal[]; qty: Decimal; budget: Decimal; sim: Decimal;
}
export interface ComponentQty {
  key: string; // Werks|Idnrk (component plant)
  werks: string; idnrk: string; maktx: string; mtart: string; meins: string;
  months: Decimal[]; qty: Decimal;
  h1Rate: Decimal | null; h2Rate: Decimal | null; rateSource: 'budget' | 'selected' | 'none';
  budget: Decimal; sim: Decimal; // cost of the year at monthly budget rates, before / after the simulation
  fgs: WhereUsedFg[];
}
export interface FgCost {
  key: string; land1: string; hwerks: string; headmat: string; headtxt: string; planQty: Decimal;
  budget: Decimal; sim: Decimal; delta: Decimal; deltaPct: Decimal | null;
  budgetPc: Decimal | null; simPc: Decimal | null; deltaPc: Decimal | null;
  h1: Decimal; h2: Decimal; noBudget: number;
}
export interface BudgetResult {
  components: ComponentQty[];
  fgs: FgCost[];
  budget: Decimal; sim: Decimal; delta: Decimal; deltaPct: Decimal | null;
  h1: Decimal; h2: Decimal;
  budgetMonths: Decimal[]; simMonths: Decimal[];
  noBudgetLines: number; fallbackLines: number; affected: number;
}

export function budgetPlan(lines: PlanLineWithOptions[], s: BudgetSettings): BudgetResult {
  const comps = new Map<string, ComponentQty & { where: Map<string, WhereUsedFg> }>();
  const fgs = new Map<string, FgCost>();
  let noBudgetLines = 0; let fallbackLines = 0;
  let budgetMonths: Decimal[] = Array(MONTHS).fill(ZERO);
  let simMonths: Decimal[] = Array(MONTHS).fill(ZERO);
  for (const l of lines) {
    const hk = `${l.Land1}|${l.Hwerks}|${l.Headmat}`;
    let f = fgs.get(hk);
    if (!f) fgs.set(hk, (f = { key: hk, land1: l.Land1, hwerks: l.Hwerks, headmat: l.Headmat, headtxt: l.Headtxt, planQty: D(l.PlanQty), budget: ZERO, sim: ZERO, delta: ZERO, deltaPct: null, budgetPc: null, simPc: null, deltaPc: null, h1: ZERO, h2: ZERO, noBudget: 0 }));
    if (!isLeafRow(l)) continue;
    const q = monthQty(l);
    const { rates, source } = monthRates(l, s);
    const sr = simRates(rates, s.sim[l.Idnrk]);
    const bm = q.map((x, m) => x.times(rates[m]));
    const sm = q.map((x, m) => x.times(sr[m]));
    if (source === 'none') { noBudgetLines++; f.noBudget++; }
    if (source === 'selected') { fallbackLines++; f.noBudget++; }
    const b = sum(bm); const sv = sum(sm);
    f.budget = f.budget.plus(b); f.sim = f.sim.plus(sv);
    f.h1 = f.h1.plus(sum(bm.slice(0, H2_START))); f.h2 = f.h2.plus(sum(bm.slice(H2_START)));
    budgetMonths = budgetMonths.map((v, m) => v.plus(bm[m]));
    simMonths = simMonths.map((v, m) => v.plus(sm[m]));

    const ck = `${l.Werks || l.Hwerks}|${l.Idnrk}`;
    let c = comps.get(ck);
    if (!c) comps.set(ck, (c = { key: ck, werks: l.Werks || l.Hwerks, idnrk: l.Idnrk, maktx: l.Maktx, mtart: l.Mtart, meins: l.Meins, months: Array(MONTHS).fill(ZERO), qty: ZERO, h1Rate: source === 'none' ? null : rates[0], h2Rate: source === 'none' ? null : rates[H2_START], rateSource: source, budget: ZERO, sim: ZERO, fgs: [], where: new Map() }));
    c.months = c.months.map((v, m) => v.plus(q[m]));
    c.qty = c.qty.plus(sum(q));
    c.budget = c.budget.plus(b); c.sim = c.sim.plus(sv);
    const w = c.where.get(hk) ?? { key: hk, land1: l.Land1, hwerks: l.Hwerks, headmat: l.Headmat, headtxt: l.Headtxt, months: Array(MONTHS).fill(ZERO), qty: ZERO, budget: ZERO, sim: ZERO };
    w.months = w.months.map((v, m) => v.plus(q[m]));
    w.qty = w.qty.plus(sum(q)); w.budget = w.budget.plus(b); w.sim = w.sim.plus(sv);
    c.where.set(hk, w);
  }
  const fgList = [...fgs.values()].map((f) => {
    const delta = f.sim.minus(f.budget);
    const budgetPc = f.planQty.gt(0) ? f.budget.div(f.planQty) : null;
    const simPc = f.planQty.gt(0) ? f.sim.div(f.planQty) : null;
    return { ...f, delta, deltaPct: pct(delta, f.budget), budgetPc, simPc, deltaPc: budgetPc && simPc ? simPc.minus(budgetPc) : null };
  }).sort((a, b) => b.delta.abs().cmp(a.delta.abs()) || b.budget.cmp(a.budget));
  const components = [...comps.values()].map(({ where, ...c }) => ({ ...c, fgs: [...where.values()].sort((a, b) => b.qty.cmp(a.qty)) }))
    .sort((a, b) => a.werks.localeCompare(b.werks) || b.budget.cmp(a.budget));
  const budget = sum(budgetMonths); const simT = sum(simMonths);
  return {
    components, fgs: fgList, budget, sim: simT, delta: simT.minus(budget), deltaPct: pct(simT.minus(budget), budget),
    h1: sum(budgetMonths.slice(0, H2_START)), h2: sum(budgetMonths.slice(H2_START)), budgetMonths, simMonths,
    noBudgetLines, fallbackLines, affected: fgList.filter((f) => !f.delta.isZero()).length,
  };
}

/* ---------- savings estimate ---------- */

/** Fiscal month index of a date (April = 0). */
export const fiscalMonth = (d = new Date()) => (d.getMonth() + 9) % 12;
/** Completed fiscal months so far this year (April .. last month); 0 in April. */
export const elapsedMonths = (d = new Date()) => fiscalMonth(d);

export type ActualBasis = 'ACTUAL' | 'CONSUMP';
export interface SavingsLine {
  key: string; werks: string; idnrk: string; maktx: string; meins: string;
  fgKey: string; headmat: string; headtxt: string; land1: string; hwerks: string;
  months: { qty: Decimal; budget: Decimal; actual: Decimal }[]; // per month in the window (others zero)
  qty: Decimal; budget: Decimal; actual: Decimal; saving: Decimal;
  budgetRate: Decimal | null; actualRate: Decimal | null;
}
export interface SavingsEstimate {
  lines: SavingsLine[]; months: number[];
  qty: Decimal; budget: Decimal; actual: Decimal; saving: Decimal; savingPct: Decimal | null;
  noActual: number; noBudget: number;
}

export function savingsEstimate(lines: PlanLineWithOptions[], s: BudgetSettings, months: number[], basis: ActualBasis): SavingsEstimate {
  const out: SavingsLine[] = [];
  let qty = ZERO; let budget = ZERO; let actual = ZERO; let noActual = 0; let noBudget = 0;
  for (const l of lines) {
    if (!isLeafRow(l)) continue;
    const { rates, source } = monthRates(l, { ...s, fallback: false });
    const act = basis === 'ACTUAL' ? (D(l.ActRatePcInr).gt(0) ? D(l.ActRatePcInr) : null) : componentRate(l, 'CONSUMP');
    if (source === 'none') { noBudget++; continue; }
    if (!act) { noActual++; continue; }
    const q = monthQty(l);
    const per = q.map((x, m) => (months.includes(m) ? { qty: x, budget: x.times(rates[m]), actual: x.times(act) } : { qty: ZERO, budget: ZERO, actual: ZERO }));
    const lq = sum(per.map((p) => p.qty)); const lb = sum(per.map((p) => p.budget)); const la = sum(per.map((p) => p.actual));
    if (lq.isZero()) continue;
    qty = qty.plus(lq); budget = budget.plus(lb); actual = actual.plus(la);
    out.push({
      key: `${l.Werks}|${l.Idnrk}|${l.Land1}|${l.Hwerks}|${l.Headmat}`, werks: l.Werks || l.Hwerks, idnrk: l.Idnrk, maktx: l.Maktx, meins: l.Meins,
      fgKey: `${l.Land1}|${l.Hwerks}|${l.Headmat}`, headmat: l.Headmat, headtxt: l.Headtxt, land1: l.Land1, hwerks: l.Hwerks,
      months: per, qty: lq, budget: lb, actual: la, saving: lb.minus(la), budgetRate: lq.gt(0) ? lb.div(lq) : null, actualRate: act,
    });
  }
  return { lines: out, months, qty, budget, actual, saving: budget.minus(actual), savingPct: pct(budget.minus(actual), budget), noActual, noBudget };
}

export type SavingsGroup = 'component' | 'fg' | 'plant' | 'month';
export interface SavingsRow { key: string; label: string; sub: string; qty: Decimal | null; budget: Decimal; actual: Decimal; saving: Decimal; savingPct: Decimal | null; meins: string }

export function groupSavings(e: SavingsEstimate, by: SavingsGroup, monthLabels: readonly string[]): SavingsRow[] {
  const m = new Map<string, SavingsRow>();
  const add = (key: string, label: string, sub: string, qty: Decimal | null, b: Decimal, a: Decimal, meins = '') => {
    const r = m.get(key) ?? { key, label, sub, qty: qty === null ? null : ZERO, budget: ZERO, actual: ZERO, saving: ZERO, savingPct: null, meins };
    if (r.qty && qty) r.qty = r.qty.plus(qty);
    r.budget = r.budget.plus(b); r.actual = r.actual.plus(a);
    m.set(key, r);
  };
  for (const l of e.lines) {
    if (by === 'component') add(`${l.werks}|${l.idnrk}`, l.idnrk, `${l.werks} · ${l.maktx}`, l.qty, l.budget, l.actual, l.meins);
    else if (by === 'fg') add(l.fgKey, l.headmat, `${l.land1} · ${l.hwerks} · ${l.headtxt}`, null, l.budget, l.actual);
    else if (by === 'plant') add(l.hwerks, l.hwerks, 'costed plant', null, l.budget, l.actual);
    else l.months.forEach((p, i) => { if (!p.budget.isZero() || !p.actual.isZero()) add(String(i).padStart(2, '0'), monthLabels[i], '', null, p.budget, p.actual); });
  }
  const rows = [...m.values()].map((r) => ({ ...r, saving: r.budget.minus(r.actual), savingPct: pct(r.budget.minus(r.actual), r.budget) }));
  return by === 'month' ? rows.sort((a, b) => a.key.localeCompare(b.key)) : rows.sort((a, b) => b.saving.abs().cmp(a.saving.abs()));
}

/* ---------- storage (per plan) ---------- */
const KEY = 'plan:budget';
export function loadBudget(plan: string): BudgetSettings {
  const all = ls.get<Record<string, BudgetSettings>>(KEY, {});
  return { ...emptyBudget(), ...(all[plan] || {}) };
}
export function saveBudget(plan: string, s: BudgetSettings) {
  const all = ls.get<Record<string, BudgetSettings>>(KEY, {});
  all[plan] = s;
  ls.set(KEY, all);
}

