/**
 * $filter for the sales-price sets. Several values of one property are joined with "or" inside brackets; "In" and "Ex" are separate
 * properties (AuartIn / AuartEx ...). Flags are 'X'. DateTo is a datetime literal. At most 50 materials go into one SoPriceSet
 * call (SAP answers a message above that): the caller splits with chunkCodes and merges. At most 25 finished goods per CogmRowSet call.
 */
import { FilterError, odataDate, odataString } from '../sap/filter';
import { COGM_FILTER as C, SO_FILTER as F } from './fields';
import { EMPTY_LIST, type ListFilter, type ToggleState } from './types';

export const SO_MAX_MATERIALS = 50;
export const COGM_MAX_MATERIALS = 25;

export interface SoQuery {
  materials?: string[]; plants?: string[]; vkorg?: string[]; vtweg?: string[]; segment?: string[];
  auart?: ListFilter; pstyv?: ListFilter; kdgrp?: ListFilter; kunnr?: ListFilter;
  daysBack?: number; dateTo?: string;
  kind?: string[]; kalsm?: string[];
}
const uniq = (v: readonly string[] | undefined) => Array.from(new Set((v ?? []).map((x) => String(x).trim()).filter(Boolean)));
function multi(name: string, values: string[]): string | null {
  if (!values.length) return null;
  const parts = values.map((v) => `${name} eq ${odataString(v)}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
}
export function chunkCodes<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export type SoFilterSet = 'AREA' | 'FILTER' | 'PRICE' | 'PRICING' | 'PROC' | 'COND';
export function buildSoFilter(q: SoQuery, set: SoFilterSet): string {
  if (set === 'COND') return '';
  if (set === 'PROC') {
    const k = multi(F.KalsmIn, uniq(q.kalsm));
    if (!k) throw new FilterError('Pick a pricing procedure.');
    return k;
  }
  const materials = uniq(q.materials);
  if ((set === 'PRICE' || set === 'PRICING') && !materials.length) throw new FilterError('Pick at least one material.');
  if (materials.length > SO_MAX_MATERIALS) throw new FilterError(`At most ${SO_MAX_MATERIALS} materials per call (split the list).`);
  const c: (string | null)[] = [multi(F.MatnrIn, materials), multi(F.WerksIn, uniq(q.plants).map((p) => p.toUpperCase())), multi(F.VkorgIn, uniq(q.vkorg)), multi(F.VtwegIn, uniq(q.vtweg)), multi(F.SegmentIn, uniq(q.segment))];
  const lists: [string, string, ListFilter | undefined][] = [[F.AuartIn, F.AuartEx, q.auart], [F.PstyvIn, F.PstyvEx, q.pstyv], [F.KdgrpIn, F.KdgrpEx, q.kdgrp], [F.KunnrIn, F.KunnrEx, q.kunnr]];
  for (const [inName, exName, l] of lists) { c.push(multi(inName, uniq(l?.in)), multi(exName, uniq(l?.ex))); }
  if (q.daysBack !== undefined) {
    if (!Number.isInteger(q.daysBack) || q.daysBack < 1) throw new FilterError('Days must be a whole number of at least 1.');
    c.push(`${F.DaysBack} eq ${q.daysBack}`);
  }
  if (q.dateTo) c.push(`${F.DateTo} eq ${odataDate(q.dateTo)}`);
  if (set === 'FILTER') c.push(multi(F.KindIn, uniq(q.kind)));
  return c.filter(Boolean).join(' and ');
}

/** Three-state toggle of one value: neutral, include ("only these") or exclude ("not these"). */
export function toggleState(l: ListFilter, code: string): ToggleState { return l.in.includes(code) ? 'in' : l.ex.includes(code) ? 'ex' : 'neutral'; }
export function setToggle(l: ListFilter, code: string, state: ToggleState): ListFilter {
  const rest = { in: l.in.filter((c) => c !== code), ex: l.ex.filter((c) => c !== code) };
  return state === 'in' ? { in: [...rest.in, code], ex: rest.ex } : state === 'ex' ? { in: rest.in, ex: [...rest.ex, code] } : rest;
}
export const nextToggle = (s: ToggleState): ToggleState => (s === 'neutral' ? 'in' : s === 'in' ? 'ex' : 'neutral');
export const listActive = (l: ListFilter | undefined): boolean => !!l && (l.in.length > 0 || l.ex.length > 0);

/** CogmRowSet: Matnr, Werks, PriceSrcIn 'O' (latest sales orders), the same sales-area / list filters, SoDaysIn, Source 'L' (live). */
export function buildCogmFilter(q: SoQuery & { materials: string[]; priceDate?: string }): string {
  const materials = uniq(q.materials);
  if (!materials.length) throw new FilterError('Pick at least one finished good.');
  if (materials.length > COGM_MAX_MATERIALS) throw new FilterError(`The live comparison runs for ${COGM_MAX_MATERIALS} finished goods at most.`);
  const c: (string | null)[] = [multi(C.Matnr, materials), multi(C.Werks, uniq(q.plants).map((p) => p.toUpperCase())), `${C.PriceSrcIn} eq 'O'`, `${C.Source} eq 'L'`,
    multi(F.VkorgIn, uniq(q.vkorg)), multi(F.VtwegIn, uniq(q.vtweg)), multi(F.SegmentIn, uniq(q.segment))];
  const lists: [string, string, ListFilter | undefined][] = [[F.AuartIn, F.AuartEx, q.auart], [F.PstyvIn, F.PstyvEx, q.pstyv], [F.KdgrpIn, F.KdgrpEx, q.kdgrp], [F.KunnrIn, F.KunnrEx, q.kunnr]];
  for (const [inName, exName, l] of lists) c.push(multi(inName, uniq(l?.in)), multi(exName, uniq(l?.ex)));
  if (q.daysBack !== undefined) c.push(`${C.SoDaysIn} eq ${q.daysBack}`);
  if (q.priceDate) c.push(`${C.PriceDate} eq ${odataDate(q.priceDate)}`);
  return c.filter(Boolean).join(' and ');
}
export { EMPTY_LIST };
