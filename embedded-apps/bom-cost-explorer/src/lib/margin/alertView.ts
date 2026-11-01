/**
 * Presentation logic of the Alerts screen (CogmAlertSet). SAP decides which rule fired, its severity, value, threshold and impact; this file sorts
 * (largest impact first), filters by severity and words the scope. Row counts only; nothing is added up. Positive impact = loss (cost up / remaining amount down).
 */
import Decimal from 'decimal.js';
import { dec } from '../wac/view';
import { DEFAULT_SEL, marginSearch } from './selection';
import type { MarginAlert, Severity } from './types';

export const RULES = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9'] as const;
export const SEVERITIES: Exclude<Severity, ''>[] = ['H', 'M', 'L'];
export const SEVERITY_WORD: Record<Severity, string> = { H: 'High', M: 'Medium', L: 'Low', '': 'n/a' };
const RANK: Record<Severity, number> = { H: 3, M: 2, L: 1, '': 0 };

/** Largest impact first (a row with no impact from SAP last), then by severity, then by material and plant. Never mutates the input. */
export function sortByImpact(rows: MarginAlert[]): MarginAlert[] {
  return [...rows].sort((a, b) => {
    const x = dec(a.ImpactInr), y = dec(b.ImpactInr);
    if (x && y) { const c = y.cmp(x); if (c) return c; } else if (x) return -1; else if (y) return 1;
    return RANK[b.Severity] - RANK[a.Severity] || a.Matnr.localeCompare(b.Matnr) || a.Werks.localeCompare(b.Werks);
  });
}

/** Severity filter on the rows SAP sent (an empty list = all). */
export const filterBySeverity = (rows: MarginAlert[], sev: readonly Severity[]): MarginAlert[] => (sev.length ? rows.filter((r) => sev.includes(r.Severity)) : rows);
export const countBySeverity = (rows: MarginAlert[]): Record<Severity, number> => rows.reduce((m, r) => ({ ...m, [r.Severity]: (m[r.Severity] ?? 0) + 1 }), { H: 0, M: 0, L: 0, '': 0 } as Record<Severity, number>);

/** Scope F = one finished good; scope C = one component across several finished goods (component and number of finished goods). */
export function scopeText(r: Pick<MarginAlert, 'Scope' | 'Comp' | 'FgCnt' | 'Matnr' | 'Maktx'>): string {
  if (r.Scope === 'C') return r.FgCnt === undefined ? `Component ${r.Comp || 'n/a'}` : `Component ${r.Comp || 'n/a'} · ${r.FgCnt} finished good${r.FgCnt === 1 ? '' : 's'}`;
  return `Finished good ${r.Matnr}${r.Maktx ? ` ${r.Maktx}` : ''}`;
}
export const isComponentScope = (r: Pick<MarginAlert, 'Scope'>) => r.Scope === 'C';

/** Link that opens the Board for the row's material and plant. The Board only fills its selection from the URL; the person presses Show. A component row has no single finished good: no link. */
export function boardLink(r: Pick<MarginAlert, 'Scope' | 'Matnr' | 'Werks'>, base = ''): string | null {
  if (isComponentScope(r) || !r.Matnr) return null;
  return `${base}/margin/${marginSearch({ ...DEFAULT_SEL, materials: [r.Matnr], plants: r.Werks ? [r.Werks.toUpperCase()] : [] })}`;
}
export const alertKey = (r: MarginAlert, i: number) => `${r.Rule}|${r.Scope}|${r.Werks}|${r.Matnr}|${r.Comp}|${i}`;
export const impactDirection = (v: string): 'loss' | 'saving' | 'none' | 'na' => { const d: Decimal | null = dec(v); return d === null ? 'na' : d.gt(0) ? 'loss' : d.lt(0) ? 'saving' : 'none'; };
export const IMPACT_WORD = { loss: 'Loss', saving: 'Saving', none: 'No impact', na: 'n/a' } as const;
