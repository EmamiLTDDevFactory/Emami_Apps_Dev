/**
 * Pure presentation logic of the Sales price page. SAP chose the order and computed every price: this file only groups, flags
 * and formats what SAP sent. Nothing here recalculates a price, a ratio or an erosion.
 */
import { dec } from '../wac/view';
import { SO_STALE_DAYS } from './flag';
import { isUsable } from './service';
import type { CogmRow, SoAreaRow, SoCondRow, SoFilterRow, SoPriceRow, SoPricingRow, SoProcRow } from './types';

/** An amount SAP actually has: not blank and not 0 (SAP answers 0 when there is no usable order). Shown as n/a (grey) otherwise. */
export const hasAmount = (v: string): boolean => { const d = dec(v); return d !== null && !d.isZero(); };

export type SoWarnKey = 'nosp' | 'sp0' | 'mrp0' | 'stale' | 'skip';
export interface SoWarning { key: SoWarnKey; label: string; detail?: string }

/** Warnings of one price row: no usable order (Sp = 0 with a message), Mrp = 0, an order older than SO_STALE_DAYS, skipped orders (NSkip > 0). */
export function rowWarnings(r: SoPriceRow, staleDays: number = SO_STALE_DAYS): SoWarning[] {
  const w: SoWarning[] = [];
  if (!isUsable(r)) w.push({ key: 'nosp', label: 'No usable order', detail: r.Msg });
  else if (!hasAmount(r.Sp)) w.push({ key: 'sp0', label: 'Selling price is 0', detail: r.Msg || undefined });
  if (!hasAmount(r.Mrp)) w.push({ key: 'mrp0', label: 'MRP is 0' });
  if (r.DaysOld > staleDays) w.push({ key: 'stale', label: `Order is ${r.DaysOld} days old`, detail: `older than ${staleDays} days` });
  if (r.NSkip > 0) w.push({ key: 'skip', label: `${r.NSkip} order${r.NSkip === 1 ? '' : 's'} skipped` });
  return w;
}

export const priceKey = (r: Pick<SoPriceRow, 'Matnr' | 'Vkorg' | 'Vtweg' | 'Auart'>): string => [r.Matnr, r.Vkorg, r.Vtweg, r.Auart].join('|');
export const areaId = (a: { Vkorg: string; Vtweg: string }): string => `${a.Vkorg}|${a.Vtweg}`;

export interface SegmentGroup { segment: string; label: string; rows: SoPriceRow[] }
const NO_SEGMENT = 'No segment';
export const segmentLabel = (r: Pick<SoPriceRow, 'Segment' | 'SegTxt'>): string => (r.Segment ? (r.SegTxt ? `${r.Segment} - ${r.SegTxt}` : r.Segment) : NO_SEGMENT);
const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
/** One group per segment (groups sorted by label, "No segment" last); inside a group by material, sales organisation, channel, document type. */
export function groupBySegment(rows: SoPriceRow[]): SegmentGroup[] {
  const map = new Map<string, SegmentGroup>();
  for (const r of rows) {
    const label = segmentLabel(r);
    if (!map.has(label)) map.set(label, { segment: r.Segment, label, rows: [] });
    map.get(label)!.rows.push(r);
  }
  const groups = Array.from(map.values());
  for (const g of groups) g.rows.sort((a, b) => cmp(a.Matnr, b.Matnr) || cmp(a.Vkorg, b.Vkorg) || cmp(a.Vtweg, b.Vtweg) || cmp(a.Auart, b.Auart));
  return groups.sort((a, b) => (a.label === NO_SEGMENT ? 1 : b.label === NO_SEGMENT ? -1 : cmp(a.label, b.label)));
}

/** Segments for the dropdown: distinct Segment / SegTxt of the rules; rules marked Excl (never counted) are hidden. */
export function segmentOptions(conds: SoCondRow[]): { code: string; text: string }[] {
  const m = new Map<string, string>();
  for (const c of conds) if (!c.Excl && c.Segment && !m.has(c.Segment)) m.set(c.Segment, c.SegTxt);
  return Array.from(m, ([code, text]) => ({ code, text })).sort((a, b) => cmp(a.code, b.code));
}
/** Document types whose rule is "never counted" (Excl) for the chosen sales organisations (all when none is chosen): greyed in the lists. */
export function neverCountedAuarts(conds: SoCondRow[], vkorg: string[]): Set<string> {
  const byAuart = new Map<string, boolean[]>();
  for (const c of conds) {
    if (!c.Auart || (vkorg.length && !vkorg.includes(c.Vkorg))) continue;
    byAuart.set(c.Auart, [...(byAuart.get(c.Auart) ?? []), c.Excl]);
  }
  return new Set(Array.from(byAuart).filter(([, v]) => v.length > 0 && v.every(Boolean)).map(([k]) => k));
}

/** Sales areas picked in the list -> VkorgIn / VtwegIn. VtwegIn is only sent when some channel of a chosen organisation was left out. */
export function areaSelection(areas: SoAreaRow[], ids: string[]): { vkorg: string[]; vtweg: string[] } {
  const chosen = areas.filter((a) => ids.includes(areaId(a)));
  const vkorg = Array.from(new Set(chosen.map((a) => a.Vkorg)));
  const leftOut = areas.some((a) => vkorg.includes(a.Vkorg) && !ids.includes(areaId(a)));
  return { vkorg, vtweg: leftOut ? Array.from(new Set(chosen.map((a) => a.Vtweg))) : [] };
}
export function selectedAreaIds(areas: SoAreaRow[], vkorg: string[], vtweg: string[]): string[] {
  return areas.filter((a) => vkorg.includes(a.Vkorg) && (!vtweg.length || vtweg.includes(a.Vtweg))).map(areaId);
}

export const FILTER_KINDS = [
  { kind: 'AUART', key: 'auart', label: 'Document type' },
  { kind: 'PSTYV', key: 'pstyv', label: 'Item category' },
  { kind: 'KDGRP', key: 'kdgrp', label: 'Customer group' },
] as const;
export type ListKey = 'auart' | 'pstyv' | 'kdgrp' | 'kunnr';
/** Values of one kind, the most frequent first. */
export function valuesOfKind(rows: SoFilterRow[], kind: string): SoFilterRow[] {
  return rows.filter((r) => r.Kind === kind).sort((a, b) => b.NLines - a.NLines || cmp(a.Code, b.Code));
}

/** The lines of the selected order item, in condition-screen order (Step, Counter). */
export function pricingLinesOf(rows: SoPricingRow[], r: Pick<SoPriceRow, 'Vbeln' | 'Posnr' | 'Matnr'>): SoPricingRow[] {
  return rows.filter((l) => (!r.Vbeln || l.Vbeln === r.Vbeln) && (!r.Posnr || l.Posnr === r.Posnr) && (!l.Matnr || l.Matnr === r.Matnr)).sort((a, b) => cmp(a.Stunr, b.Stunr) || cmp(a.Zaehk, b.Zaehk));
}
export type LineState = 'normal' | 'inactive' | 'statistical';
export const lineState = (l: Pick<SoPricingRow, 'Kinak' | 'Kstat'>): LineState => (l.Kinak ? 'inactive' : l.Kstat ? 'statistical' : 'normal');
export const LINE_STATE_LABEL: Record<LineState, string> = { normal: '', inactive: 'Inactive', statistical: 'Statistical' };
export const roleLabel = (role: string): string => (role === 'MRP' ? 'MRP' : role === 'SP' ? 'Selling price' : '');

export function procSteps(rows: SoProcRow[], kalsm?: string): SoProcRow[] {
  return rows.filter((s) => !kalsm || s.Kalsm === kalsm).sort((a, b) => cmp(a.Stunr, b.Stunr) || cmp(a.Zaehl, b.Zaehl));
}
/** Pricing procedures present in the result rows (for the Pricing procedure tab). */
export function proceduresIn(rows: SoPriceRow[]): { kalsm: string; text: string }[] {
  const m = new Map<string, string>();
  for (const r of rows) if (r.Kalsm && !m.has(r.Kalsm)) m.set(r.Kalsm, r.KalsmTxt);
  return Array.from(m, ([kalsm, text]) => ({ kalsm, text })).sort((a, b) => cmp(a.kalsm, b.kalsm));
}

/** The "Compare with cost (SAP)" rows, as SAP sent them: the only thing done here is picking the unavailable ones for n/a. */
export const cogmHasValue = (v: string): boolean => dec(v) !== null;
export const cogmKey = (r: Pick<CogmRow, 'Matnr' | 'Werks' | 'Market' | 'Channel'>): string => [r.Matnr, r.Werks, r.Market, r.Channel].join('|');
