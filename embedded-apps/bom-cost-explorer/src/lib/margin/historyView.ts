/**
 * Pure presentation logic of the History screen (CogmHistorySet). SAP computed every COGM, ratio and erosion: this file only orders and shapes the
 * snapshots for the chart and the table. A value SAP did not send stays a gap (null / "n/a"), never 0.
 */
import { dec } from '../wac/view';
import type { MarginHistory } from './types';
import type { WacSheet } from '../wac/export';

export const HISTORY_DEFAULT_DAYS = 180;
export const SCENARIO_LINES = [{ key: 'std', prop: 'CogmStd', label: 'Standard' }, { key: 'cur', prop: 'CogmCur', label: 'Current' }, { key: 'act', prop: 'CogmAct', label: 'Actual' }] as const;

/** Oldest snapshot first (rows without a date last). */
export function sortHistory(rows: MarginHistory[]): MarginHistory[] {
  return [...rows].sort((a, b) => (a.SnapDate && b.SnapDate ? a.SnapDate.localeCompare(b.SnapDate) : a.SnapDate ? -1 : b.SnapDate ? 1 : 0));
}

export interface SeriesPoint { date: string; std: number | null; cur: number | null; act: number | null; ratio: number | null }
/** One point per snapshot with a date; a value SAP sent nothing for is null (a gap in the line). */
export function historySeries(rows: MarginHistory[]): SeriesPoint[] {
  const num = (v: string) => dec(v)?.toNumber() ?? null;
  return sortHistory(rows).filter((r) => !!r.SnapDate).map((r) => ({ date: r.SnapDate as string, std: num(r.CogmStd), cur: num(r.CogmCur), act: num(r.CogmAct), ratio: num(r.RatioCur) }));
}
export const hasLine = (pts: SeriesPoint[], k: 'std' | 'cur' | 'act' | 'ratio'): boolean => pts.some((p) => p[k] !== null);

/** Positive erosion = cost up / remaining amount down. */
export type ErosionKind = 'worse' | 'better' | 'none' | 'na';
export function erosionKind(v: string): ErosionKind { const d = dec(v); return d === null ? 'na' : d.gt(0) ? 'worse' : d.lt(0) ? 'better' : 'none'; }
export const EROSION_WORD: Record<ErosionKind, string> = { worse: 'Worse', better: 'Better', none: 'No change', na: 'n/a' };

const n = (v: string, dp = 6) => { const d = dec(v); return d ? Number(d.toFixed(dp)) : null; };
export function historySheet(rows: MarginHistory[]): WacSheet {
  const r = sortHistory(rows);
  return { name: 'History', count: r.length, cols: [
    { header: 'Snapshot date', width: 13, get: (i) => r[i].SnapDate ?? '' }, { header: 'Material', width: 14, get: (i) => r[i].Matnr }, { header: 'Plant', width: 8, get: (i) => r[i].Werks },
    { header: 'Market', width: 10, get: (i) => r[i].Market }, { header: 'Channel', width: 14, get: (i) => r[i].Channel }, { header: 'Currency', width: 9, get: (i) => r[i].Curr },
    { header: 'COGM Standard', dp: 4, width: 15, get: (i) => n(r[i].CogmStd) }, { header: 'COGM Current', dp: 4, width: 15, get: (i) => n(r[i].CogmCur) }, { header: 'COGM Actual', dp: 4, width: 15, get: (i) => n(r[i].CogmAct) },
    { header: 'Ratio Current %', dp: 2, width: 14, get: (i) => n(r[i].RatioCur, 4) }, { header: 'Erosion vs Standard', dp: 2, width: 16, get: (i) => n(r[i].ErosionStd, 4) }, { header: 'Erosion vs Base', dp: 2, width: 15, get: (i) => n(r[i].ErosionBase, 4) },
  ] };
}
