/**
 * Price context: which sales areas and orders the MRP / selling price shown next to the rate sources come from. Stored in the URL
 * (?pc=...) and in session storage. Reading or writing it NEVER triggers a request. Nothing here recalculates a price.
 */
import { buildSoFilter, chunkCodes, SO_MAX_MATERIALS, type SoQuery } from '../so/filter';
import { EMPTY_LIST, type ListFilter } from '../so/types';

export interface PriceContextState {
  /** "Show MRP and selling price": the switch. Off = nothing rendered, nothing requested. */
  on: boolean;
  vkorg: string[]; vtweg: string[]; segment: string[]; days: number;
  auart: ListFilter; pstyv: ListFilter; kdgrp: ListFilter; kunnr: ListFilter;
}
export const DEFAULT_PC: PriceContextState = { on: false, vkorg: [], vtweg: [], segment: [], days: 90, auart: EMPTY_LIST, pstyv: EMPTY_LIST, kdgrp: EMPTY_LIST, kunnr: EMPTY_LIST };

const STORAGE_KEY = 'bom_price_context';

/** Compact JSON of everything that differs from the default. */
export function encodePc(s: PriceContextState): string {
  const o: Record<string, unknown> = {};
  if (s.on) o.on = 1;
  if (s.vkorg.length) o.vk = s.vkorg;
  if (s.vtweg.length) o.vt = s.vtweg;
  if (s.segment.length) o.sg = s.segment;
  if (s.days !== DEFAULT_PC.days) o.d = s.days;
  for (const [k, l] of [['au', s.auart], ['ps', s.pstyv], ['kg', s.kdgrp], ['ku', s.kunnr]] as const) if (l.in.length || l.ex.length) o[k] = { i: l.in, e: l.ex };
  return Object.keys(o).length ? JSON.stringify(o) : '';
}
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const lst = (v: unknown): ListFilter => ({ in: arr((v as { i?: unknown })?.i), ex: arr((v as { e?: unknown })?.e) });
export function decodePc(raw: string | null | undefined): PriceContextState {
  if (!raw) return DEFAULT_PC;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const days = Number(o.d);
    return { on: o.on === 1, vkorg: arr(o.vk), vtweg: arr(o.vt), segment: arr(o.sg), days: Number.isInteger(days) && days >= 1 ? days : DEFAULT_PC.days, auart: lst(o.au), pstyv: lst(o.ps), kdgrp: lst(o.kg), kunnr: lst(o.ku) };
  } catch {
    return DEFAULT_PC;
  }
}

/** URL first, then session storage. Safe where storage is blocked. */
export function loadPc(): PriceContextState {
  try {
    const u = new URLSearchParams(window.location.search).get('pc');
    if (u) return decodePc(u);
    return decodePc(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PC;
  }
}
export function savePc(s: PriceContextState): void {
  const enc = encodePc(s);
  try { if (enc) window.sessionStorage.setItem(STORAGE_KEY, enc); else window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
  try {
    const p = new URLSearchParams(window.location.search);
    if (enc) p.set('pc', enc); else p.delete('pc');
    const q = p.toString();
    const next = `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', next);
  } catch { /* ignore */ }
}

export const pcReady = (s: PriceContextState): boolean => s.on && s.vkorg.length > 0;

/** The SoPriceSet query of the context for some materials. */
export function pcQuery(s: PriceContextState, materials: string[], plants?: string[]): SoQuery {
  return { materials, plants, vkorg: s.vkorg, vtweg: s.vtweg, segment: s.segment, auart: s.auart, pstyv: s.pstyv, kdgrp: s.kdgrp, kunnr: s.kunnr, daysBack: s.days };
}
/** Material batches (at most 50 each) the context needs for the finished goods shown. Empty when the switch is off, no sales organisation is chosen, or nothing is shown. */
export function planPriceBatches(s: PriceContextState, materials: string[]): string[][] {
  if (!pcReady(s)) return [];
  return chunkCodes(Array.from(new Set(materials.map((m) => m.trim()).filter(Boolean))).sort(), SO_MAX_MATERIALS);
}
export const pcBatchKey = (s: PriceContextState, batch: string[]): string => `pc|PRICE|${buildSoFilter(pcQuery(s, batch), 'PRICE')}`;
/** Everything of one context, without the materials: the unit Refresh works on. */
export const pcCtx = (s: PriceContextState): string => `pc-ctx|${buildSoFilter({ ...pcQuery(s, ['x']), materials: undefined } as SoQuery, 'AREA')}`;
