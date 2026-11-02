/**
 * COGM per piece of the Cost and margin report at a BOM-costing rate type. The same live BOM costing and the same rate-type figures as BOM costing > "Rate
 * summary" (lib/cost/rateSummary.ts): SAP costs the finished goods (50 per call, one plant at a time) and its rate options are attached to the lines; the
 * material cost per piece of each rate type comes from rateSummary(). Nothing is requested until the person asks (the report's "Cost at rate type" button).
 */
import type Decimal from 'decimal.js';
import { api } from '../client/api';
import { defaultQuery, MAX_MATERIALS } from '../query/schema';
import { attachRateOptions, fetchRateOptions } from '../rates/options';
import { RATE_TYPES, RATE_TYPE_LABEL, rateSummary, type FgRow, type RateType } from '../cost/rateSummary';
import { rateCogmKey } from './report';

/** The rate types BOM costing shows per finished-good piece (Rate summary hides Contract, Info record, Market and Cheapest at that level; Budget needs a budget run). */
export const COGM_RATE_TYPES: readonly RateType[] = RATE_TYPES.filter((t) => !['CONTRACT', 'INFOREC', 'MARKT', 'CHEAPEST', 'BUDGET'].includes(t));
export const COGM_RATE_LABEL = (t: RateType): string => RATE_TYPE_LABEL[t];

export interface RateCogmResult {
  /** plant | material -> the finished good's figures of every rate type */
  byKey: Map<string, FgRow>;
  notes: string[];
}

export interface Target { werks: string; matnr: string }

/** Costs the finished goods in SAP, plant by plant, and returns each one's cost per piece for every rate type. Sequential on purpose: live costing is heavy. */
export async function costAtRateTypes(targets: Target[], opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<RateCogmResult> {
  const byPlant = new Map<string, string[]>();
  for (const t of targets) { const l = byPlant.get(t.werks) ?? []; if (!l.includes(t.matnr)) l.push(t.matnr); byPlant.set(t.werks, l); }
  const total = [...byPlant.values()].reduce((n, l) => n + l.length, 0);
  const byKey = new Map<string, FgRow>();
  const notes: string[] = [];
  let done = 0;
  for (const [werks, mats] of byPlant) {
    for (let i = 0; i < mats.length; i += MAX_MATERIALS) {
      if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const q = { ...defaultQuery('B'), materials: mats.slice(i, i + MAX_MATERIALS), plants: [werks] };
      const cost = await api.cost(q, opts.signal);
      let lines = cost.rows;
      const rates = await fetchRateOptions(q, { signal: opts.signal });
      if ('unavailable' in rates) notes.push(`Plant ${werks}: ${rates.reason} Only the rate SAP selected is shown.`);
      else lines = attachRateOptions(lines, rates.rows);
      for (const fg of rateSummary(lines, q.explQty).fgs) byKey.set(rateCogmKey(fg.hwerks, fg.headmat), fg);
      done += Math.min(MAX_MATERIALS, mats.length - i);
      opts.onProgress?.(done, total);
    }
  }
  return { byKey, notes: [...new Set(notes)] };
}

/** One rate type's COGM per piece for every costed finished good; a good with no priced component of that type is left out (n/a). */
export function cogmAtType(res: RateCogmResult | null, type: RateType): Map<string, Decimal> | null {
  if (!res) return null;
  const m = new Map<string, Decimal>();
  for (const [k, fg] of res.byKey) { const v = fg.perPc[type]?.value; if (v) m.set(k, v); }
  return m;
}

/** "n of m components priced" for the tooltip: an incomplete figure is shown, but flagged. */
export function pricedNote(res: RateCogmResult | null, werks: string, matnr: string, type: RateType): string {
  const f = res?.byKey.get(rateCogmKey(werks, matnr));
  if (!f) return 'Not costed';
  const p = f.perPc[type];
  return p.priced === p.leaves ? `${p.leaves} of ${p.leaves} components priced` : `Incomplete: ${p.priced} of ${p.leaves} components have a ${COGM_RATE_LABEL(type)} rate`;
}
