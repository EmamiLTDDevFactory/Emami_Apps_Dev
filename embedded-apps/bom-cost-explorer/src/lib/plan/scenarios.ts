/**
 * Production Plan scenarios. Two kinds of what-if:
 *   SAP what-ifs   - fallback, material types, rate priority, donor plant: SAP runs CostLineSet Mode P again
 *                    with those options (the result is an SAP figure).
 *   client what-ifs - applied in the browser on top of the SAP rows (baseline or the SAP what-if run), always
 *                    marked "simulated": quantity multiplier (overall / per month), shift quantity between
 *                    months, % on the rate per source, % on freight, FX shock per currency, per-row rate.
 * Definitions are kept in localStorage "plan:scenarios" (per plan); results stay in memory.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import { ls } from '../client/storage';
import { monthQty } from './maths';
import type { PlanCostLine, PlanWip } from './fields';
import type { PlanCostQuery } from './requests';
import type { PlanRowInput } from './write';
import { PLAN_NAME_MAX, monthKeys } from './fields';

export interface PlanSapWhatIf {
  fallback?: boolean;
  mtartFilter?: PlanCostQuery['mtartFilter'];
  prio?: string;
  donorPlant?: string;
}

export interface PlanShift {
  from: number; // month index 0..11
  to: number;
  pct: number; // % of the "from" month's quantity moved
}

export interface PlanClientWhatIf {
  overallMult: number; // 1 = unchanged
  monthMult: number[]; // 12 multipliers
  shifts: PlanShift[];
  srcPct: Record<string, number>; // % on rate/pc by rate source
  frtPct: number; // % on freight/pc
  fxPct: Record<string, number>; // % shock by purchase currency (non-INR rows)
  rateOverride: Record<string, string>; // line key -> rate/pc INR
}

export interface PlanScenario {
  id: string;
  name: string;
  sap: PlanSapWhatIf;
  client: PlanClientWhatIf;
  updated: string;
}

export const emptyClientWhatIf = (): PlanClientWhatIf => ({ overallMult: 1, monthMult: Array(12).fill(1), shifts: [], srcPct: {}, frtPct: 0, fxPct: {}, rateOverride: {} });
export const newScenario = (name: string): PlanScenario => ({ id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, sap: {}, client: emptyClientWhatIf(), updated: new Date().toISOString() });

export const hasSapWhatIf = (s: PlanSapWhatIf) => Object.values(s).some((v) => v !== undefined && v !== '');
export function isClientIdentity(c: PlanClientWhatIf): boolean {
  return c.overallMult === 1 && c.monthMult.every((m) => m === 1) && !c.shifts.some((s) => s.pct) && !Object.values(c.srcPct).some(Boolean) && !c.frtPct && !Object.values(c.fxPct).some(Boolean) && !Object.keys(c.rateOverride).length;
}

/** The SAP query of a scenario: the plan's query with the SAP what-ifs applied. */
export const scenarioQuery = (base: PlanCostQuery, s: PlanSapWhatIf): PlanCostQuery => ({
  ...base,
  ...(s.fallback !== undefined ? { fallback: s.fallback } : {}),
  ...(s.mtartFilter ? { mtartFilter: s.mtartFilter } : {}),
  ...(s.prio !== undefined && s.prio !== '' ? { prio: s.prio } : {}), // a priority list, comma separated
  ...(s.donorPlant ? { donorPlant: s.donorPlant.toUpperCase() } : {}),
});

/** Stable key of a plan cost line across runs (Seqnr can differ between runs; the path does not). */
export const lineKey = (l: Pick<PlanCostLine, 'Land1' | 'Hwerks' | 'Headmat' | 'Parent' | 'Idnrk' | 'Level'>) => `${l.Land1}|${l.Hwerks}|${l.Headmat}|${l.Level}|${l.Parent}|${l.Idnrk}`;

/** Monthly quantities after shifts and multipliers. */
export function scenarioMonths(base: Decimal[], c: PlanClientWhatIf): Decimal[] {
  const m = [...base];
  for (const s of c.shifts) {
    if (!s.pct || s.from === s.to || s.from < 0 || s.from > 11 || s.to < 0 || s.to > 11) continue;
    const moved = base[s.from].times(s.pct).div(100);
    m[s.from] = m[s.from].minus(moved);
    m[s.to] = m[s.to].plus(moved);
  }
  return m.map((q, i) => q.times(c.monthMult[i] ?? 1).times(c.overallMult));
}

export interface SimLine {
  ratePc: Decimal; // rate/pc INR (simulated)
  frtPc: Decimal;
  totPc: Decimal;
  months: Decimal[]; // monthly cost INR
  qty: Decimal[]; // monthly quantity
  total: Decimal;
  changed: boolean;
}

export function simulateLine(l: PlanCostLine, c: PlanClientWhatIf): SimLine {
  const baseRate = D(l.SelRatePcInr);
  const baseFrt = D(l.FrtPcInr);
  const ov = c.rateOverride[lineKey(l)];
  let rate = ov !== undefined && ov !== '' ? D(ov) : baseRate.times(1 + (c.srcPct[l.SelSource] ?? 0) / 100);
  if (ov === undefined && l.SelCurr && l.SelCurr !== 'INR' && c.fxPct[l.SelCurr]) rate = rate.times(1 + c.fxPct[l.SelCurr] / 100);
  const frt = baseFrt.times(1 + c.frtPct / 100);
  const totPc = rate.plus(frt);
  const qty = scenarioMonths(monthQty(l), c);
  const months = qty.map((q) => q.times(totPc));
  const total = months.reduce((a, v) => a.plus(v), ZERO);
  return { ratePc: rate, frtPc: frt, totPc, months, qty, total, changed: !rate.eq(baseRate) || !frt.eq(baseFrt) || qty.some((q, i) => !q.eq(monthQty(l)[i])) };
}

/** SAP baseline of one line in the same shape (monthly cost = QtyMn x TotCostPcInr). */
export function baselineLine(l: PlanCostLine): SimLine {
  const qty = monthQty(l);
  const totPc = D(l.TotCostPcInr);
  const months = qty.map((q) => q.times(totPc));
  return { ratePc: D(l.SelRatePcInr), frtPc: D(l.FrtPcInr), totPc, months, qty, total: months.reduce((a, v) => a.plus(v), ZERO), changed: false };
}

export interface CompareRow {
  key: string;
  label: string;
  sub: string;
  base: Decimal[];
  scen: Decimal[];
  baseTotal: Decimal;
  scenTotal: Decimal;
  delta: Decimal;
}

const add = (a: Decimal[], b: Decimal[]) => a.map((v, i) => v.plus(b[i]));
const zeros = (): Decimal[] => Array(12).fill(ZERO);

/** Baseline vs scenario per month (one row), per plan header and per component (leaf rows only). */
export function compare(baseRows: PlanCostLine[], scenRows: PlanCostLine[], c: PlanClientWhatIf) {
  const heads = new Map<string, CompareRow>();
  const comps = new Map<string, CompareRow>();
  const touch = (m: Map<string, CompareRow>, key: string, label: string, sub: string) => {
    let r = m.get(key);
    if (!r) m.set(key, (r = { key, label, sub, base: zeros(), scen: zeros(), baseTotal: ZERO, scenTotal: ZERO, delta: ZERO }));
    return r;
  };
  for (const l of baseRows) {
    if (!isLeafRow(l)) continue;
    const b = baselineLine(l);
    for (const r of [touch(heads, `${l.Land1}|${l.Hwerks}|${l.Headmat}`, l.Headmat, `${l.Land1} · ${l.Hwerks} · ${l.Headtxt}`), touch(comps, `${l.Hwerks}|${l.Idnrk}`, l.Idnrk, `${l.Hwerks} · ${l.Maktx}`)]) r.base = add(r.base, b.months);
  }
  for (const l of scenRows) {
    if (!isLeafRow(l)) continue;
    const s = simulateLine(l, c);
    for (const r of [touch(heads, `${l.Land1}|${l.Hwerks}|${l.Headmat}`, l.Headmat, `${l.Land1} · ${l.Hwerks} · ${l.Headtxt}`), touch(comps, `${l.Hwerks}|${l.Idnrk}`, l.Idnrk, `${l.Hwerks} · ${l.Maktx}`)]) r.scen = add(r.scen, s.months);
  }
  const fin = (m: Map<string, CompareRow>) =>
    [...m.values()].map((r) => {
      const bt = r.base.reduce((a, v) => a.plus(v), ZERO);
      const st = r.scen.reduce((a, v) => a.plus(v), ZERO);
      return { ...r, baseTotal: bt, scenTotal: st, delta: st.minus(bt) };
    }).sort((a, b) => b.delta.abs().cmp(a.delta.abs()));
  const headers = fin(heads);
  const months = { base: headers.reduce((a, r) => add(a, r.base), zeros()), scen: headers.reduce((a, r) => add(a, r.scen), zeros()) };
  return { months, headers, components: fin(comps) };
}

// ---- storage -------------------------------------------------------------------------------------
const KEY = 'plan:scenarios';
export function loadScenarios(plan: string): PlanScenario[] {
  const all = ls.get<Record<string, PlanScenario[]>>(KEY, {});
  return Array.isArray(all[plan]) ? all[plan] : [];
}
export function saveScenarios(plan: string, list: PlanScenario[]) {
  const all = ls.get<Record<string, PlanScenario[]>>(KEY, {});
  all[plan] = list;
  ls.set(KEY, all);
}

// ---- WIP plan ------------------------------------------------------------------------------------
export const wipPlanName = (plan: string) => `WIP ${plan}`.slice(0, PLAN_NAME_MAX);

/** PlanWipSet rows -> plan rows: group by component + plant + country, months summed. */
export function wipPlanRows(plan: string, wip: PlanWip[]): PlanRowInput[] {
  const name = wipPlanName(plan);
  const QM = monthKeys('Qm');
  const by = new Map<string, PlanRowInput & { sums: Decimal[] }>();
  for (const w of wip) {
    if (!w.Comp) continue;
    const k = `${w.Comp}|${w.Werks}|${w.Land1}`;
    let r = by.get(k);
    if (!r) by.set(k, (r = { plan: name, matnr: w.Comp, werks: w.Werks, land1: w.Land1, months: [], sums: zeros() }));
    r.sums = r.sums.map((v, i) => v.plus(D((w as unknown as Record<string, string>)[QM[i]])));
  }
  return [...by.values()].map(({ sums, ...r }) => ({ ...r, months: sums.map((v) => v.toFixed(3)) }));
}
