/** URL state of the Sales price page: one compact parameter `so`. Reading it never starts a request (the page waits for Show). */
import { EMPTY_LIST, type ListFilter } from './types';

export interface SoUrlState {
  materials: string[]; vkorg: string[]; vtweg: string[]; segment: string; days: number;
  auart: ListFilter; pstyv: ListFilter; kdgrp: ListFilter; kunnr: ListFilter;
}
export const SO_DEFAULT_DAYS = 90;
export const DEFAULT_SO_URL: SoUrlState = { materials: [], vkorg: [], vtweg: [], segment: '', days: SO_DEFAULT_DAYS, auart: EMPTY_LIST, pstyv: EMPTY_LIST, kdgrp: EMPTY_LIST, kunnr: EMPTY_LIST };

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const lst = (v: unknown): ListFilter => ({ in: arr((v as { i?: unknown })?.i), ex: arr((v as { e?: unknown })?.e) });

export function encodeSoUrl(s: SoUrlState): string {
  const o: Record<string, unknown> = {};
  if (s.materials.length) o.m = s.materials;
  if (s.vkorg.length) o.vk = s.vkorg;
  if (s.vtweg.length) o.vt = s.vtweg;
  if (s.segment) o.sg = s.segment;
  if (s.days !== SO_DEFAULT_DAYS) o.d = s.days;
  for (const [k, l] of [['au', s.auart], ['ps', s.pstyv], ['kg', s.kdgrp], ['ku', s.kunnr]] as const) if (l.in.length || l.ex.length) o[k] = { i: l.in, e: l.ex };
  return Object.keys(o).length ? JSON.stringify(o) : '';
}
export function decodeSoUrl(raw: string | null | undefined): SoUrlState {
  if (!raw) return DEFAULT_SO_URL;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const d = Number(o.d);
    return { materials: arr(o.m), vkorg: arr(o.vk), vtweg: arr(o.vt), segment: typeof o.sg === 'string' ? o.sg : '', days: Number.isInteger(d) && d >= 1 ? d : SO_DEFAULT_DAYS, auart: lst(o.au), pstyv: lst(o.ps), kdgrp: lst(o.kg), kunnr: lst(o.ku) };
  } catch {
    return DEFAULT_SO_URL;
  }
}
/** encodeURIComponent, not URLSearchParams.toString(): that one writes a space as "+". */
export const soSearch = (s: SoUrlState): string => { const e = encodeSoUrl(s); return e ? `?so=${encodeURIComponent(e)}` : ''; };
export const parseSoSearch = (search: string): SoUrlState => decodeSoUrl(new URLSearchParams(search).get('so'));
