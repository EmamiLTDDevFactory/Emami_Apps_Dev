/**
 * "Priority simulation" of a BOM costing: the same lines costed with different rate-source priorities, side by side, so C-MAP
 * (SAP source MBEW), the standard pick of SAP and the other sources can be compared at one place. Re-uses simulate(): it only
 * re-picks among the RateOptions SAP returned, SAP's own figures stay the base.
 */
import type { CostLine } from '../sap/fields';
import { RATE_SOURCES, type RateSource } from '../query/schema';
import { D, Decimal, ZERO } from './decimal';
import { EMPTY_SIM, simulate, type SimSettings } from './simulate';
import { isLeafRow } from './tree';
import { sourceLabel } from '../rates/sourceLabel';

export interface Scenario { id: string; label: string; settings: SimSettings }
export interface ScenarioResult { id: string; label: string; total: Decimal; perUnit: Decimal | null; delta: Decimal; deltaPct: Decimal | null; repicked: number; noRate: number }

/** SAP's own pick, then each source first (the others after it in default order), then cheapest and latest. */
export function scenarios(userPrio: readonly RateSource[]): Scenario[] {
  const base = { ...EMPTY_SIM };
  const out: Scenario[] = [{ id: 'sap', label: 'SAP selection (as costed)', settings: base }];
  out.push({ id: 'prio', label: `Your priority: ${userPrio.map(sourceLabel).join(' > ')}`, settings: { ...base, pick: 'priority', prio: [...userPrio] } });
  for (const s of RATE_SOURCES) out.push({ id: `first-${s}`, label: `${sourceLabel(s)} first`, settings: { ...base, pick: 'priority', prio: [s, ...RATE_SOURCES.filter((x) => x !== s)] } });
  out.push({ id: 'cheapest', label: 'Cheapest option', settings: { ...base, pick: 'cheapest' } });
  out.push({ id: 'latest', label: 'Latest valid-from', settings: { ...base, pick: 'latest' } });
  return out;
}

/** Totals (INR, whole costing quantity) of every scenario. Needs RateOptions on the rows to differ from SAP. */
export function runScenarios(rows: readonly CostLine[], list: readonly Scenario[], qty: Decimal | string | number): ScenarioResult[] {
  const q = D(qty);
  const mk = (sc: Scenario) => {
    const sim = simulate(rows as CostLine[], sc.settings);
    let total = ZERO, repicked = 0, noRate = 0;
    rows.forEach((r, i) => { if (!isLeafRow(r)) return; total = total.plus(sim[i].total); if (sim[i].repicked) repicked++; if (!sim[i].source) noRate++; });
    return { sc, total, repicked, noRate };
  };
  const all = list.map(mk);
  const sapTotal = all[0]?.total ?? ZERO;
  return all.map(({ sc, total, repicked, noRate }) => ({
    id: sc.id, label: sc.label, total, repicked, noRate,
    perUnit: q.gt(0) ? total.div(q) : null,
    delta: total.minus(sapTotal),
    deltaPct: sapTotal.isZero() ? null : total.minus(sapTotal).div(sapTotal).times(100),
  }));
}

/** Per leaf line: the per-piece INR rate of each source (latest valid option per source), for a side-by-side C-MAP / Standard view. */
export function ratesBySource(r: CostLine): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const o of r.RateOptions ?? []) {
    const v = D(o.RatePcInr);
    if (!v.gt(0)) continue;
    const prev = out[o.Source];
    if (!prev) out[o.Source] = v;
  }
  return out;
}
