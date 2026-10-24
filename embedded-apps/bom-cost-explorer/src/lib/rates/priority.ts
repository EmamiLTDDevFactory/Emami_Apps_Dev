/**
 * Rate source priority (Prio): the editor shows all five sources with a checkbox each; the checked ones, in
 * the editor's order, are sent as Prio eq 'A,B,C' (upper case, comma separated, no spaces). The SAP default
 * has no MARKT ("Report default"). "Cheapest" is not an SAP preset - it is the client-side what-if.
 */
import { RATE_SOURCE_ORDER } from './fields';
import { sourceLabel } from './sourceLabel';

export const ALL_RATE_SOURCES: readonly string[] = RATE_SOURCE_ORDER;
export const PRIO_PRESETS: { id: 'report' | 'all'; label: string; prio: string[] }[] = [
  { id: 'report', label: 'Report default', prio: ['CONTRACT', 'INFOREC', 'CONSUMP', 'MBEW'] },
  { id: 'all', label: 'All sources', prio: ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'] },
];

/** Normalised priority list: upper case, trimmed, known-or-not kept in order, duplicates dropped. */
export function normalizePrio(list: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of list) {
    const v = String(s).trim().toUpperCase();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** The Prio filter value: "CONTRACT,INFOREC,CONSUMP,MBEW". */
export const prioString = (list: readonly string[]) => normalizePrio(list).join(',');
/** Parses a Prio string back ("A, b ,C" -> [A, B, C]). */
export const parsePrio = (s: string | null | undefined) => normalizePrio(String(s ?? '').split(','));
/** Human label shown next to results: "CONTRACT > INFOREC > CONSUMP > C-MAP" (MBEW shown as C-MAP). */
export const prioLabel = (list: readonly string[]) => (list.length ? normalizePrio(list).map(sourceLabel).join(' > ') : 'SAP default');

export interface PrioItem { source: string; on: boolean }

/** Editor rows: checked sources in priority order first, then the unchecked ones in the report order. */
export function prioItems(prio: readonly string[], order: readonly string[] = ALL_RATE_SOURCES): PrioItem[] {
  const on = normalizePrio(prio);
  return [...on.map((source) => ({ source, on: true })), ...order.filter((s) => !on.includes(s)).map((source) => ({ source, on: false }))];
}
export const prioFromItems = (items: readonly PrioItem[]) => items.filter((i) => i.on).map((i) => i.source);
export const presetMatches = (prio: readonly string[], preset: readonly string[]) => prioString(prio) === prioString(preset);
