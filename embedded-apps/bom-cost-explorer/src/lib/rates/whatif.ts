/**
 * Client-side what-ifs on the rate options (always marked "simulated"; SAP's value stays visible):
 *  - cheapest source per component: the cheapest non-zero option (lib/rates/sources.ts cheapestOption);
 *  - re-pick by priority: per leaf line the first source in the given priority that has a non-zero rate
 *    (its cheapest option); a line with none keeps SAP's figure.
 * Totals from TotCostInr (direct set) or rate x qty + freight (expand); leaf rows only; decimal.js.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import type { CostLine } from '../sap/fields';
import { cheapestOption, optionTotal } from './sources';
import { normalizePrio } from './priority';
import type { RateOptionRow } from './fields';

export interface WhatIfLine { idx: number; sapSource: string; sapTotal: Decimal; simSource: string; simTotal: Decimal; changed: boolean }
export interface WhatIf { sapTotal: Decimal; simTotal: Decimal; delta: Decimal; changed: number; lines: WhatIfLine[] }

function run(lines: readonly CostLine[], pick: (l: CostLine, opts: RateOptionRow[]) => RateOptionRow | null): WhatIf {
  let sapTotal = ZERO;
  let simTotal = ZERO;
  let changed = 0;
  const out: WhatIfLine[] = [];
  lines.forEach((l, idx) => {
    if (!isLeafRow(l)) return;
    const sap = D(l.TotCostInr);
    const opts = (l.RateOptions ?? []) as RateOptionRow[];
    const o = opts.length ? pick(l, opts) : null;
    const sim = o ? optionTotal(o, l) : sap;
    const simSource = o ? o.Source : l.SelSource;
    const isChanged = !!o && (o.Source !== l.SelSource || !sim.eq(sap));
    sapTotal = sapTotal.plus(sap);
    simTotal = simTotal.plus(sim);
    if (isChanged) changed++;
    out.push({ idx, sapSource: l.SelSource, sapTotal: sap, simSource, simTotal: sim, changed: isChanged });
  });
  return { sapTotal, simTotal, delta: simTotal.minus(sapTotal), changed, lines: out };
}

export const cheapestWhatIf = (lines: readonly CostLine[]) => run(lines, (l, opts) => cheapestOption(l, opts));

export function repickByPriority(lines: readonly CostLine[], prio: readonly string[]): WhatIf {
  const p = normalizePrio(prio);
  return run(lines, (l, opts) => {
    for (const s of p) {
      const cands = opts.filter((o) => o.Source === s && D(o.RatePcInr).gt(0));
      if (cands.length) return cheapestOption(l, cands);
    }
    return null;
  });
}

/** Per leaf line and source: best non-zero rate per piece INR, or null (no rate from that source). */
export function sourceMatrix(lines: readonly CostLine[], sources: readonly string[]) {
  return lines
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => isLeafRow(l))
    .map(({ l, idx }) => {
      const cells: Record<string, Decimal | null> = {};
      for (const s of sources) {
        let best: Decimal | null = null;
        for (const o of l.RateOptions ?? []) {
          if (o.Source !== s) continue;
          const r = D(o.RatePcInr);
          if (r.gt(0) && (!best || r.lt(best))) best = r;
        }
        cells[s] = best;
      }
      return { idx, line: l, cells };
    });
}
