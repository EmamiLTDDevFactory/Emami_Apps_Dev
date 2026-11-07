/**
 * Cost per FG piece at the "Selected" rate and at the C-Map (MBEW) rate, for the Budget split. Both come from the normal BOM costing (Mode B
 * CostLineSet + RateOptionSet) of the same FG and plant, not from the Budget sets: the Budget figure is priced from zcomponent, so the three differ.
 *   Selected = the rate SAP picked per component (SelRatePcInr); C-Map = the MBEW option of the component (RatePcInr, own plant first).
 *   cost per component = rate x quantity incl. scrap (ProdQty) / explosion quantity; summed per component code, so it lines up with the split rows.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import { costQuerySchema, type CostQuery } from '../query/schema';
import { fetchCostLines } from '../sap/service';
import { fetchRateOptions } from '../rates/options';
import { attachRateOptions } from '../rates/options';
import type { CostLine } from '../sap/fields';
import type { RateOptionRow } from '../rates/fields';
import type { SapGetOptions } from '../sap/client';

/** Explosion quantity: large enough that ProdQty (3 decimals) keeps small component quantities; every figure is divided back to per piece. */
export const RATE_BASIS_QTY = 1000;

export interface RateBasisComp {
  idnrk: string; selSource: string; qtyPerPc: Decimal;
  selectedPc: Decimal | null; cmapPc: Decimal | null; // INR per FG piece; null = that source has no rate for the component
}
export interface RateBasis {
  comps: Map<string, RateBasisComp>;
  selected: Decimal; cmap: Decimal; // per FG piece, priced components only
  leaves: number; selectedPriced: number; cmapPriced: number;
}

export const rateBasisQuery = (matnr: string, werks: string): CostQuery =>
  costQuerySchema.parse({ mode: 'B', materials: [matnr], plants: [werks], explQty: String(RATE_BASIS_QTY) });

/** The MBEW option of a line: the component plant's own option first, else the first priced one. */
function cmapRate(l: CostLine): Decimal | null {
  const opts = (l.RateOptions ?? []).filter((o) => o.Source === 'MBEW' && D(o.RatePcInr).gt(0));
  if (!opts.length) return null;
  return D((opts.find((o) => o.Plant === l.Werks) ?? opts[0]).RatePcInr);
}

export function rateBasisOf(lines: CostLine[], options: RateOptionRow[], explQty = RATE_BASIS_QTY): RateBasis {
  const q = D(explQty);
  const comps = new Map<string, RateBasisComp>();
  let selected = ZERO, cmap = ZERO, leaves = 0, selectedPriced = 0, cmapPriced = 0;
  for (const l of attachRateOptions(lines, options)) {
    if (!isLeafRow(l) || !l.Idnrk) continue;
    leaves++;
    const qty = D(l.ProdQty).div(q);
    const sel = l.SelSource && D(l.SelRatePcInr).gt(0) ? D(l.SelRatePcInr) : null;
    const cm = cmapRate(l);
    const c = comps.get(l.Idnrk) ?? { idnrk: l.Idnrk, selSource: l.SelSource, qtyPerPc: ZERO, selectedPc: null, cmapPc: null };
    c.qtyPerPc = c.qtyPerPc.plus(qty);
    if (sel) { const v = sel.times(qty); c.selectedPc = (c.selectedPc ?? ZERO).plus(v); selected = selected.plus(v); selectedPriced++; }
    if (cm) { const v = cm.times(qty); c.cmapPc = (c.cmapPc ?? ZERO).plus(v); cmap = cmap.plus(v); cmapPriced++; }
    comps.set(l.Idnrk, c);
  }
  return { comps, selected, cmap, leaves, selectedPriced, cmapPriced };
}

export type RateBasisResult = { basis: RateBasis } | { error: string };

/** One costing + one rate-options call for the FG and plant (as the Rate sources tab does). */
export async function fetchRateBasis(matnr: string, werks: string, opts: SapGetOptions = {}): Promise<RateBasisResult> {
  const q = rateBasisQuery(matnr, werks);
  const [cost, rates] = await Promise.all([fetchCostLines(q, opts), fetchRateOptions(q, opts)]);
  if ('unavailable' in rates) return { error: rates.reason };
  return { basis: rateBasisOf(cost.rows, rates.rows) };
}

// ---- cache shared by the summary table, the all-splits view, the split drawer and the Excel export ------------------------------
const cache = new Map<string, RateBasis>();
const listeners = new Set<() => void>();
let version = 0;
const bk = (matnr: string, werks: string) => `${matnr}|${werks}`;
export const peekRateBasis = (matnr: string, werks: string): RateBasis | undefined => cache.get(bk(matnr, werks));
export const subscribeRateBasis = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const rateBasisVersion = (): number => version;
/** Loaded once per FG and plant until `force`; a failure is returned, never cached. */
export async function loadRateBasis(matnr: string, werks: string, opts: SapGetOptions = {}, force = false): Promise<RateBasisResult> {
  const hit = cache.get(bk(matnr, werks));
  if (hit && !force) return { basis: hit };
  const r = await fetchRateBasis(matnr, werks, opts);
  if ('basis' in r) { cache.set(bk(matnr, werks), r.basis); version++; listeners.forEach((l) => l()); }
  return r;
}
export function resetRateBasis(): void { cache.clear(); version++; listeners.forEach((l) => l()); }
