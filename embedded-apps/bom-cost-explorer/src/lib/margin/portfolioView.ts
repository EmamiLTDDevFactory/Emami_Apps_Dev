/**
 * Pure presentation logic of the Portfolio screen (CogmBoardSet). SAP computed every count, weighted ratio, revenue and impact: this file only
 * orders, labels and links what SAP sent. Nothing is summed or weighted here; the table has no totals row.
 */
import { dec } from '../wac/view';
import type { MarginBoard } from './types';
import { DEFAULT_SEL, marginSearch, type MarginSel } from './selection';
import type { WacSheet } from '../wac/export';
import Decimal from 'decimal.js';

export type GroupBy = 'P' | 'W' | 'M' | 'B';
export const GROUP_BY_LABEL: Record<GroupBy, string> = { P: 'Product hierarchy', W: 'Plant', M: 'Market', B: 'Brand' };
export const GROUP_BYS: GroupBy[] = ['P', 'W', 'M', 'B'];

/** The board selection of one group: the current selection with the group's key set on the matching property (the board never runs from the URL). */
export function groupSelection(base: MarginSel, groupBy: GroupBy, key: string): MarginSel {
  const k = key.trim();
  const s: MarginSel = { ...base };
  if (groupBy === 'P') s.prodha = k;
  else if (groupBy === 'W') s.plants = k ? [k.toUpperCase()] : [];
  else if (groupBy === 'M') s.market = k;
  else s.brand = k;
  return s;
}
export const groupBoardSearch = (base: MarginSel, groupBy: GroupBy, key: string): string => marginSearch(groupSelection(base, groupBy, key));

/** Largest annual impact first (positive = loss), groups SAP sent no impact for last; ties by key. */
export function sortGroups(rows: MarginBoard[]): MarginBoard[] {
  return [...rows].sort((a, b) => {
    const x = dec(a.AnnualImpactInr), y = dec(b.AnnualImpactInr);
    if (x && y) { const c = y.cmp(x); if (c) return c; } else if (x) return -1; else if (y) return 1;
    return a.GrpKey.localeCompare(b.GrpKey);
  });
}

/** Positive annual impact = loss (cost up / remaining amount down), negative = saving. Text always accompanies the icon / colour. */
export type ImpactKind = 'loss' | 'saving' | 'none' | 'na';
export function impactKind(v: string): ImpactKind {
  const d = dec(v);
  if (d === null) return 'na';
  return d.gt(0) ? 'loss' : d.lt(0) ? 'saving' : 'none';
}
export const IMPACT_WORD: Record<ImpactKind, string> = { loss: 'Loss', saving: 'Saving', none: 'No impact', na: 'n/a' };

export interface ImpactBar { key: string; name: string; value: number; kind: ImpactKind }
/** Bars of the chart: only groups with an impact from SAP (n/a is left out, never drawn as 0), in the table order, at most `max`. */
export function impactBars(rows: MarginBoard[], max = 15): ImpactBar[] {
  return sortGroups(rows).filter((r) => dec(r.AnnualImpactInr) !== null).slice(0, max)
    .map((r) => ({ key: r.GrpKey, name: r.GrpTxt ? `${r.GrpKey} ${r.GrpTxt}` : r.GrpKey, value: dec(r.AnnualImpactInr)!.toNumber(), kind: impactKind(r.AnnualImpactInr) }));
}

const n = (v: string, dp = 6) => { const d = dec(v); return d ? Number(d.toFixed(dp)) : null; };
export function portfolioSheet(rows: MarginBoard[], groupBy: GroupBy): WacSheet {
  const r = sortGroups(rows);
  return { name: 'Portfolio', count: r.length, cols: [
    { header: GROUP_BY_LABEL[groupBy], width: 18, get: (i) => r[i].GrpKey }, { header: 'Description', width: 30, get: (i) => r[i].GrpTxt },
    { header: 'Finished goods', width: 12, get: (i) => r[i].FgCnt }, { header: 'High alerts', width: 11, get: (i) => r[i].AlertHigh }, { header: 'Medium alerts', width: 12, get: (i) => r[i].AlertMed },
    { header: 'Data gaps', width: 10, get: (i) => r[i].NoDataCnt },
    { header: 'Weighted ratio Standard %', dp: 2, width: 16, get: (i) => n(r[i].WratioStd, 4) }, { header: 'Weighted ratio Current %', dp: 2, width: 16, get: (i) => n(r[i].WratioCur, 4) },
    { header: 'Revenue', dp: 0, curr: 'INR', width: 18, get: (i) => n(r[i].RevenueInr, 2) }, { header: 'Annual impact (positive = loss)', dp: 0, curr: 'INR', width: 22, get: (i) => n(r[i].AnnualImpactInr, 2) },
  ] };
}
export type { Decimal };
