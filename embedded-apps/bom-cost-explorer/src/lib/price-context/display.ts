/** Display rules of the price context (pure; nothing is recomputed - amounts are SAP's, shown with their own currency). */
import Decimal from 'decimal.js';
import { SO_STALE_DAYS } from '../so/flag';
import { isUsable } from '../so/service';
import type { SoPriceRow } from '../so/types';

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
