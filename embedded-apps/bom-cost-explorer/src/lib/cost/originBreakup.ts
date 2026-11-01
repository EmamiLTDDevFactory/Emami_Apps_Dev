/**
 * Cost breakup by origin group (SAP material master HRKFT, "CompOgrp" on CostLineSet). Pure: it only adds up the values SAP
 * returned. A value without an origin group goes to NO_ORIGIN, never to another group.
 */
import { D, Decimal, ZERO } from './decimal';

export const NO_ORIGIN = '(no origin group)';

export interface OriginEntry { origin: string; value: Decimal | string | number | null | undefined }
export interface OriginSlice { origin: string; value: Decimal; share: Decimal | null; lines: number }

/** Sums by origin group, largest first (no-origin last); share = value / grand total x 100 (null when the total is 0). */
export function originBreakup(entries: readonly OriginEntry[]): { slices: OriginSlice[]; total: Decimal } {
  const m = new Map<string, { value: Decimal; lines: number }>();
  let total = ZERO;
  for (const e of entries) {
    const k = String(e.origin ?? '').trim() || NO_ORIGIN;
    const v = D(e.value);
    const cur = m.get(k) ?? { value: ZERO, lines: 0 };
    cur.value = cur.value.plus(v);
    cur.lines++;
    m.set(k, cur);
    total = total.plus(v);
  }
  const slices = Array.from(m, ([origin, x]) => ({ origin, value: x.value, lines: x.lines, share: total.isZero() ? null : x.value.div(total).times(100) }));
  slices.sort((a, b) => (a.origin === NO_ORIGIN ? 1 : 0) - (b.origin === NO_ORIGIN ? 1 : 0) || b.value.comparedTo(a.value) || a.origin.localeCompare(b.origin));
  return { slices, total };
}

/** Origin group of a CK item: its own Hrkft when SAP sent one, else the one of the component material from the BOM costing. */
export const itemOrigin = (item: { Hrkft?: string; Idnrk: string }, byMaterial?: ReadonlyMap<string, string> | null): string =>
  (item.Hrkft ?? '').trim() || (item.Idnrk ? byMaterial?.get(item.Idnrk) ?? '' : '');

/** component material -> origin group, from costing lines (first non-blank wins). */
export function originMapOf(lines: readonly { Idnrk: string; CompOgrp: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of lines) { const o = (l.CompOgrp ?? '').trim(); if (l.Idnrk && o && !m.has(l.Idnrk)) m.set(l.Idnrk, o); }
  return m;
}
