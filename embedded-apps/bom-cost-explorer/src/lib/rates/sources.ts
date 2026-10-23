/**
 * Rate sources view model: one block per source (report colours), the option SAP used, the cheapest
 * option, and the saving. Leaf rows only (HasChild blank), so nothing is counted twice. Money in
 * decimal.js. A rate of 0 never counts as cheapest.
 *
 * Option total INR: TotCostInr when the direct set sends it; otherwise (expand) the option's rate per
 * piece in INR x ProdQty plus the cost line's freight per piece in INR x ProdQty. (RatePcInr already is
 * RatePc x Fx x FxInr from SAP, so it stays right when the option currency differs from the plant's.)
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import type { CostLine } from '../sap/fields';
import { RATE_SOURCE_ORDER, type RateOptionRow } from './fields';
import { isFreightIncluded, sourceFreightInr, sourceFreightLoc } from '../cost/freightIncluded';

export interface SourceOptionRow {
  line: CostLine;
  lineIdx: number;
  opt: RateOptionRow;
  total: Decimal;
  totalLoc: Decimal;
  used: boolean;
  cheapest: boolean;
}

export interface SourceBlock {
  source: string;
  rows: SourceOptionRow[];
  /** sum over lines of the best option of this source on that line */
  total: Decimal;
  lines: number;
}

export interface SourcesModel {
  blocks: SourceBlock[];
  usedTotal: Decimal; // SAP's own TotCostInr of the leaf lines that have options
  cheapestTotal: Decimal; // per line the cheapest non-zero option (else SAP's line total)
  saving: Decimal; // usedTotal - cheapestTotal
  linesWithOptions: number;
  leafLines: number;
  noRateLines: number; // SelSource blank (freight only)
}

const qty = (l: CostLine) => D(l.ProdQty);
/** Option total for the line: rate x qty plus the component's freight x qty - none for Consumption / MBEW (freight included). */
export function optionTotal(o: RateOptionRow, l: CostLine): Decimal {
  if (isFreightIncluded(o.Source)) return D(o.RatePcInr).times(qty(l));
  if (o.TotCostInr !== undefined && o.TotCostInr !== '') return D(o.TotCostInr);
  return D(o.RatePcInr).times(qty(l)).plus(sourceFreightInr(o.Source, l).times(qty(l)));
}
export function optionTotalLoc(o: RateOptionRow, l: CostLine): Decimal {
  if (isFreightIncluded(o.Source)) return D(o.RatePcLoc).times(qty(l));
  if (o.TotCostLoc !== undefined && o.TotCostLoc !== '') return D(o.TotCostLoc);
  return D(o.RatePcLoc).times(qty(l)).plus(sourceFreightLoc(o.Source, l).times(qty(l)));
}

/** The option SAP selected: Selected = 'X' (direct set), else the option of SelSource closest to SelRatePcInr. */
export function usedOption(l: CostLine, opts: RateOptionRow[]): RateOptionRow | null {
  const flagged = opts.find((o) => (o.Selected ?? '').trim().toUpperCase() === 'X' || o.Selected === 'true');
  if (flagged) return flagged;
  const same = opts.filter((o) => o.Source === l.SelSource);
  if (!same.length) return null;
  const target = D(l.SelRatePcInr);
  return same.reduce((best, o) => (D(o.RatePcInr).minus(target).abs().lt(D(best.RatePcInr).minus(target).abs()) ? o : best));
}

export function cheapestOption(l: CostLine, opts: RateOptionRow[]): RateOptionRow | null {
  let best: RateOptionRow | null = null;
  let bestTotal: Decimal | null = null;
  for (const o of opts) {
    if (!D(o.RatePcInr).gt(0)) continue;
    const t = optionTotal(o, l);
    if (bestTotal === null || t.lt(bestTotal)) {
      best = o;
      bestTotal = t;
    }
  }
  return best;
}

export function buildSourcesModel(lines: CostLine[]): SourcesModel {
  const bySource = new Map<string, SourceOptionRow[]>();
  const bestPerSourceLine = new Map<string, Map<number, Decimal>>();
  let usedTotal = ZERO;
  let cheapestTotal = ZERO;
  let linesWithOptions = 0;
  let leafLines = 0;
  let noRateLines = 0;
  lines.forEach((l, lineIdx) => {
    if (!isLeafRow(l)) return;
    leafLines++;
    if (!l.SelSource) noRateLines++;
    const opts = l.RateOptions ?? [];
    if (!opts.length) return;
    linesWithOptions++;
    const used = usedOption(l, opts);
    const cheap = cheapestOption(l, opts);
    usedTotal = usedTotal.plus(D(l.TotCostInr));
    cheapestTotal = cheapestTotal.plus(cheap ? optionTotal(cheap, l) : D(l.TotCostInr));
    for (const o of opts) {
      const total = optionTotal(o, l);
      const row: SourceOptionRow = { line: l, lineIdx, opt: o, total, totalLoc: optionTotalLoc(o, l), used: o === used, cheapest: o === cheap };
      const list = bySource.get(o.Source) ?? [];
      list.push(row);
      bySource.set(o.Source, list);
      if (D(o.RatePcInr).gt(0)) {
        const m = bestPerSourceLine.get(o.Source) ?? new Map<number, Decimal>();
        const prev = m.get(lineIdx);
        if (!prev || total.lt(prev)) m.set(lineIdx, total);
        bestPerSourceLine.set(o.Source, m);
      }
    }
  });
  const order = [...RATE_SOURCE_ORDER, ...[...bySource.keys()].filter((s) => !(RATE_SOURCE_ORDER as readonly string[]).includes(s)).sort()];
  const blocks = order
    .filter((s) => bySource.has(s))
    .map((source) => {
      const best = bestPerSourceLine.get(source) ?? new Map<number, Decimal>();
      let total = ZERO;
      for (const v of best.values()) total = total.plus(v);
      const rows = bySource.get(source)!;
      return { source, rows, total, lines: new Set(rows.map((r) => r.lineIdx)).size };
    });
  return { blocks, usedTotal, cheapestTotal, saving: usedTotal.minus(cheapestTotal), linesWithOptions, leafLines, noRateLines };
}
