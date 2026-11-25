/**
 * IRR / NPV / payback. Ported from BaseController.calcNPV/calcIRR/calcPayback/calcMetrics
 * (docs/fiori-source/webapp/controller/BaseController.js, "FINANCIAL ENGINE").
 *
 * Cash-flow convention for the array-style API: cashflows[0] is the t0 investment (sign ignored,
 * always treated as an outflow, like Fiori's Math.abs(initialOutflow)); cashflows[1..n] are yearly net inflows.
 * Rates are in PERCENT (15 = 15%), IRR is returned in percent.
 */

const n0 = (v: unknown) => Number(v) || 0;

/** calcNPV(initialOutflow, flows, rate) with the outflow as cashflows[0]. */
export function calcNPV(ratePct: number, cashflows: number[]): number {
  const r = n0(ratePct) / 100;
  const flows = cashflows || [];
  let npv = -Math.abs(n0(flows[0]));
  for (let i = 1; i < flows.length; i++) npv += n0(flows[i]) / Math.pow(1 + r, i);
  return npv;
}

/** calcIRR: bisection on [-90%, 1000%], 200 iterations; NaN when no sign change is bracketed. */
export function calcIRR(cashflows: number[]): number {
  const f = (rate: number) => calcNPV(rate, cashflows);
  let lo = -90;
  let hi = 1000;
  let fLo = f(lo);
  const fHi = f(hi);
  if (isNaN(fLo) || isNaN(fHi) || fLo * fHi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-6 || hi - lo < 1e-7) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** calcPayback: (discounted when ratePct > 0) fractional years; NaN when never recovered. Non-positive discounted flows are skipped, as in Fiori. */
export function calcPayback(cashflows: number[], ratePct = 0): number {
  const r = n0(ratePct) / 100;
  const flows = cashflows || [];
  let remaining = Math.abs(n0(flows[0]));
  for (let i = 1; i < flows.length; i++) {
    const cf = n0(flows[i]) / Math.pow(1 + r, i);
    if (cf <= 0) continue;
    if (cf >= remaining) return i - 1 + remaining / cf;
    remaining -= cf;
  }
  return NaN;
}

export interface Metrics {
  irr: number;
  npv: number;
  payback: number;
}

/** calcMetrics(investment, inflows, rate). Raw values (NaN kept); use metricsForDisplay for the screens. */
export function calcMetrics(investment: number, inflows: number[], ratePct: number): Metrics {
  const cf = [n0(investment), ...(inflows || [])];
  return { irr: calcIRR(cf), npv: calcNPV(ratePct, cf), payback: calcPayback(cf, ratePct) };
}

/**
 * BudgetCreate.onCalc: year-1..10 inputs -> numbers, trailing zeros dropped (the Fiori filter keeps an element only if
 * it or a later one is non-zero; leading zeros survive when a later year has a value, trailing all-zero years are removed).
 */
export function trimCashflows(years: Array<number | string | null | undefined>): number[] {
  const arr = (years || []).map(n0);
  return arr.filter((_, i) => arr.slice(i).some((x) => x !== 0));
}

/**
 * BudgetCreate.onCalc end-to-end: returns null metrics (all null) when investment is 0 or there are no flows;
 * IRR/payback NaN become null, NPV is always a number.
 */
export function metricsForDisplay(
  investment: number | string | null | undefined,
  yearFlows: Array<number | string | null | undefined>,
  hurdleRatePct: number,
): { irr: number | null; npv: number | null; payback: number | null } {
  const inv = n0(investment);
  const flows = trimCashflows(yearFlows);
  if (!inv || !flows.length) return { irr: null, npv: null, payback: null };
  const m = calcMetrics(inv, flows, hurdleRatePct);
  return { irr: isNaN(m.irr) ? null : m.irr, npv: m.npv, payback: isNaN(m.payback) ? null : m.payback };
}

/** BudgetCreate._evaluateMetricQuality: warning flags (IRR below hurdle, negative NPV). */
export function metricWarnings(m: { irr: number | null; npv: number | null }, hurdleRatePct: number): { irrBelowHurdle: boolean; npvNegative: boolean } {
  return {
    irrBelowHurdle: m.irr !== null && !isNaN(m.irr) && m.irr < Number(hurdleRatePct),
    npvNegative: m.npv !== null && m.npv < 0,
  };
}
