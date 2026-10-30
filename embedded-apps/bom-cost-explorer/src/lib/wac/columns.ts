/** Columns of the main table: label, width, default visibility and the sort value (null sorts last). */
import Decimal from 'decimal.js';
import type { WacRow } from './types';
import { dec, flagOf, sourceHasData, SOURCES, type SrcKey } from './view';

export type ColKey = 'fg' | 'plant' | 'brand' | 'prodha' | 'crs' | 'qty' | 'docs' | 'rm' | 'pm' | 'perf' | 'mat' | 'conv' | 'landed' | 'vSel' | 'vCmap' | 'vCon' | 'vAvg';
export interface WacCol { key: ColKey; label: string; group: 'id' | 'actual' | 'var'; width: number; num: boolean; defaultVisible: boolean; src?: SrcKey; sort: (r: WacRow) => string | Decimal | null }

const d = (v: string) => dec(v);
export const COLUMNS: WacCol[] = [
  { key: 'fg', label: 'Finished good', group: 'id', width: 270, num: false, defaultVisible: true, sort: (r) => r.Matnr },
  { key: 'plant', label: 'Plant', group: 'id', width: 70, num: false, defaultVisible: true, sort: (r) => r.Werks },
  { key: 'brand', label: 'Brand', group: 'id', width: 110, num: false, defaultVisible: true, sort: (r) => r.Zbrand },
  { key: 'prodha', label: 'Product', group: 'id', width: 150, num: false, defaultVisible: false, sort: (r) => r.Prodha },
  { key: 'crs', label: 'CRS', group: 'id', width: 170, num: false, defaultVisible: false, sort: (r) => r.Zskugrcodecrs },
  { key: 'qty', label: 'Quantity', group: 'id', width: 110, num: true, defaultVisible: true, sort: (r) => d(r.Qty) },
  { key: 'docs', label: 'Docs / batches', group: 'id', width: 100, num: true, defaultVisible: true, sort: (r) => new Decimal(r.Docs) },
  { key: 'rm', label: 'RM / unit', group: 'actual', width: 100, num: true, defaultVisible: true, sort: (r) => d(r.ActRm) },
  { key: 'pm', label: 'PM / unit', group: 'actual', width: 100, num: true, defaultVisible: true, sort: (r) => d(r.ActPm) },
  { key: 'perf', label: 'Perfume / unit', group: 'actual', width: 105, num: true, defaultVisible: true, sort: (r) => d(r.ActPerf) },
  { key: 'mat', label: 'Material / unit', group: 'actual', width: 110, num: true, defaultVisible: true, sort: (r) => d(r.ActMat) },
  { key: 'conv', label: 'Conversion / unit', group: 'actual', width: 115, num: true, defaultVisible: true, sort: (r) => d(r.ActConv) },
  { key: 'landed', label: 'Landed / unit', group: 'actual', width: 105, num: true, defaultVisible: true, sort: (r) => d(r.ActLanded) },
  { key: 'vSel', label: 'vs Selected', group: 'var', width: 120, num: true, defaultVisible: true, src: 'Sel', sort: (r) => d(r.VarpSel) },
  { key: 'vCmap', label: 'vs C-MAP', group: 'var', width: 120, num: true, defaultVisible: true, src: 'Cmap', sort: (r) => d(r.VarpCmap) },
  { key: 'vCon', label: 'vs Consumption', group: 'var', width: 130, num: true, defaultVisible: true, src: 'Con', sort: (r) => d(r.VarpCon) },
  { key: 'vAvg', label: 'vs Average', group: 'var', width: 120, num: true, defaultVisible: true, src: 'Avg', sort: (r) => d(r.VarpAvg) },
];

export type SortDir = 'asc' | 'desc';
export function sortRows(rows: WacRow[], key: ColKey, dir: SortDir): WacRow[] {
  const col = COLUMNS.find((c) => c.key === key) ?? COLUMNS[0];
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = col.sort(a), y = col.sort(b);
    if (x === null && y === null) return a.Rowid - b.Rowid;
    if (x === null) return 1; // empty values always last, whichever the direction
    if (y === null) return -1;
    const c = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), undefined, { numeric: true }) : (x as Decimal).cmp(y as Decimal);
    return c ? c * sign : a.Rowid - b.Rowid;
  });
}

/** Columns to show: the chooser's visible set, minus every source column that has no value in any row. */
export function visibleColumns(rows: WacRow[], hidden: ReadonlySet<ColKey>, inclCmp: boolean): WacCol[] {
  return COLUMNS.filter((c) => !hidden.has(c.key) && (!c.src || sourceHasData(rows, c.src, inclCmp)));
}
export { SOURCES, flagOf };
