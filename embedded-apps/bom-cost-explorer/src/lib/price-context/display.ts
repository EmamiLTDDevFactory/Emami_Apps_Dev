/** Display rules of the price context (pure; nothing is recomputed - amounts are SAP's, shown with their own currency). */
import Decimal from 'decimal.js';
import { SO_STALE_DAYS } from '../so/flag';
import { isUsable } from '../so/service';
import type { SoPriceRow } from '../so/types';
import { CONSUMED_NOTE, hasConsumed, hasPcCost, pcSource } from '../so/view';

export const priceNum = (v: string): Decimal | null => { try { const d = new Decimal((v ?? '').trim()); return d.isFinite() && !d.isZero() ? d : null; } catch { return null; } };
/** A price of 0 / empty is "not available" (n/a), never a zero. */
export const hasPrice = (v: string): boolean => priceNum(v) !== null;

/** Usable rows first, then the most recent order first; stable. */
export function orderRows(rows: SoPriceRow[]): SoPriceRow[] {
  return [...rows].sort((a, b) => Number(isUsable(b)) - Number(isUsable(a)) || (b.Audat ?? '').localeCompare(a.Audat ?? '') || a.Auart.localeCompare(b.Auart) || a.Vtweg.localeCompare(b.Vtweg));
}
export const isStale = (r: Pick<SoPriceRow, 'DaysOld'>, limit = SO_STALE_DAYS): boolean => r.DaysOld > limit;
/** "currency differs": the price is in another currency than the cost shown on the screen - then no percentage is shown, ever. */
export const currencyDiffers = (priceCurr: string, costCurr: string | undefined): boolean => !!costCurr && !!priceCurr && priceCurr.trim().toUpperCase() !== costCurr.trim().toUpperCase();
/** "cost as % of selling price (computed here)": only when both amounts have the same currency and the price is a real number. */
export function costPctOfPrice(cost: string, costCurr: string, price: string, priceCurr: string): Decimal | null {
  if (currencyDiffers(priceCurr, costCurr) || !costCurr || !priceCurr) return null;
  const p = priceNum(price), c = priceNum(cost);
  return p && c ? c.div(p).times(100) : null;
}
export type StripState = 'off' | 'none' | 'loading' | 'error' | 'ok';
export const stripState = (a: { on: boolean; loading: boolean; error: string | null; rows: SoPriceRow[] }): StripState =>
  !a.on ? 'off' : a.error ? 'error' : a.loading && !a.rows.length ? 'loading' : a.rows.length ? 'ok' : 'none';
export const segmentChip = (r: SoPriceRow): string => [r.Segment, r.Auart].filter(Boolean).join(' · ');

/** Tooltip of a price strip: the order and the condition used, then (when SAP sent them) the cost of the latest production order: RM, PM, perfume,
 * total (RM+PM+perfume), SAP's % of the selling price and its source; consumed cost only when not 0, on its own line, never in the total. Nothing is computed. */
export function stripTitle(r: SoPriceRow): string {
  const base = `Order ${r.Vbeln}${r.Posnr ? `/${r.Posnr}` : ''} · condition ${r.SpCond || 'n/a'} · ${r.Vkorg}/${r.Vtweg} · ${r.Kalsm}${r.KalsmTxt ? ` ${r.KalsmTxt}` : ''}`;
  const lines = [base];
  const amt = (v: string) => (hasPrice(v) ? `${v.trim()} ${r.Curr}` : 'n/a');
  if (hasPcCost(r)) {
    lines.push(`Cost per ${r.Uom || 'unit'}: RM ${amt(r.RmCost)} · PM ${amt(r.PmCost)} · Perfume ${amt(r.PerfCost)} · Total (RM+PM+perfume) ${amt(r.PcTotal)}${hasPrice(r.PcRatio) ? ` · ${r.PcRatio.trim()} % of selling price` : ''}`);
    const src = pcSource(r); if (src) lines.push(src);
  } else if (!r.PcMsg?.trim()) lines.push('Cost of the latest production order: n/a');
  if (hasConsumed(r)) lines.push(`Consumed: RM ${amt(r.ConsRm)} · PM ${amt(r.ConsPm)} · Perfume ${amt(r.ConsPerf)} (${CONSUMED_NOTE})`);
  if (r.PcMsg?.trim()) lines.push(`Production cost: ${r.PcMsg.trim()}`);
  return lines.join('\n');
}
