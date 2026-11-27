/**
 * Freight of ONE plan component in ONE plant, as the Freight analysis screen shows it (Production Plan > breakup > Freight/pc).
 * The same FreightRowSet request as Freight analysis (analysisFilter, Mode F, AllItems when NEXT_PUBLIC_FREIGHT_ALL_ITEMS is on) for the component and
 * its plant over a PO-date range, and the same maths (groupPoLines -> poLines / analyseFreight). Nothing new is asked of SAP.
 * The calculation the plan itself used (the latest PO freight, by condition type) stays with FreightBreakupPanel (lib/freight/breakup.ts).
 */
import { sapGetCollection, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { ENTITY_SET } from '../sap/entities';
import { FIELDS_BY_SET, type FreightRow } from '../sap/fields';
import type { SapMessage } from '../sap/messages';
import { D, type Decimal } from '../cost/decimal';
import { FREIGHT_ALL_ITEMS, analysisFilter } from '../freight/analysisFetch';
import { analyseFreight, groupPoLines, hasPostings, poLines, type Component, type DateRange, type FreightAnalysisRow, type PoLine } from '../freight/analysis';
import { componentFreightInr } from '../cost/freightIncluded';
import { qtyPerFgPiece } from './rateDetail';
import type { PlanCostLine } from './fields';

export type RangePreset = 3 | 6 | 12 | 24 | 60;
export const RANGE_PRESETS: RangePreset[] = [3, 6, 12, 24, 60];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The last N months up to today (PO date). */
export function rangeOf(months: RangePreset, now = new Date()): DateRange {
  const from = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return { from: iso(from), to: iso(now) };
}
const daysBetween = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
const strip = (m: string) => String(m ?? '').trim().replace(/^0+(?=\d)/, '');

export interface CompFreight {
  rows: FreightRow[];
  /** the rows grouped to one per PO line when SAP sent postings (AllItems) */
  lines: PoLine[];
  summary: FreightAnalysisRow | null;
  postings: boolean;
  messages: SapMessage[];
  ms: number;
  truncated: boolean;
}

const PAGE = 5000;
const MAX = 50_000;

/** FreightRowSet for one component and plant over the range, every PO line (LatestOnly blank), freight included. */
export async function fetchCompFreight(c: { material: string; plant: string; text: string; mtart: string }, range: DateRange, opts: SapGetOptions = {}): Promise<CompFreight> {
  const filter = analysisFilter({ mode: 'F', materials: [strip(c.material)], plant: c.plant, range, inclFrt: true, freightDays: daysBetween(range.from, range.to), latestOnly: false, allItems: FREIGHT_ALL_ITEMS });
  const rows: FreightRow[] = [];
  const messages: SapMessage[] = [];
  let ms = 0;
  let total: number | null = null;
  for (let skip = 0; skip < MAX; skip += PAGE) {
    const r = await sapGetCollection(ENTITY_SET.FREIGHT, { $filter: filter, $top: String(PAGE), $skip: String(skip), $inlinecount: 'allpages' }, opts);
    ms += r.ms;
    if (skip === 0) messages.push(...r.messages);
    total = r.count ?? total;
    rows.push(...r.rows.map((raw) => normalizeEntity<FreightRow>(raw, FIELDS_BY_SET.FREIGHT as never)));
    if (r.rows.length < PAGE || (total !== null && rows.length >= total)) break;
  }
  return { ...analyseComp(c, rows, range), messages, ms, truncated: rows.length >= MAX };
}

/** Pure part (tested): PO lines and the weighted actual / standard of the component, exactly as Freight analysis computes them. */
export function analyseComp(c: { material: string; plant: string; text: string; mtart: string }, rows: FreightRow[], range: DateRange): Pick<CompFreight, 'rows' | 'lines' | 'summary' | 'postings'> {
  // the component key must be spelled as SAP spells Material on the freight rows (leading zeros or not)
  const sapMat = rows.find((r) => strip(r.Material) === strip(c.material))?.Material ?? c.material;
  const comp: Component = { key: `${c.plant.trim()}|${String(sapMat).trim()}`, material: String(sapMat).trim(), text: c.text, plant: c.plant.trim(), mtart: c.mtart };
  const postings = hasPostings(rows);
  const grouped = postings ? groupPoLines(rows) : rows;
  return { rows, lines: poLines([comp], grouped, range), summary: analyseFreight([comp], grouped, range)[0] ?? null, postings };
}

/** How the plan line's freight reaches the plan: per component unit (SAP), per FG piece (x component qty per FG piece) and the plan value (x plan quantity). */
export interface PlanFreightCalc { perUnit: Decimal; unit: string; qtyPerFg: Decimal | null; perFg: Decimal | null; planQty: Decimal; planValue: Decimal; fgPlanQty: Decimal }
export function planFreightCalc(l: PlanCostLine): PlanFreightCalc {
  const perUnit = componentFreightInr(l);
  const q = qtyPerFgPiece(l);
  return { perUnit, unit: l.Meins, qtyPerFg: q, perFg: q ? perUnit.times(q) : null, planQty: D(l.QtyTot), planValue: perUnit.times(D(l.QtyTot)), fgPlanQty: D(l.PlanQty) };
}
