'use client';
/** Excel of the Cost and margin report: the columns of the screen, the same numbers. */
import type { XCol } from '../client/export';
import { downloadWacWorkbook, type WacSheet } from '../wac/export';
import { dec } from '../wac/view';
import { ratioText, type ReportKind, type ReportRow } from './report';
import type Decimal from 'decimal.js';

const n = (v: string | Decimal | null | undefined, dp = 6): number | null => { const d = typeof v === 'string' ? dec(v) : v ?? null; return d ? Number(d.toFixed(dp)) : null; };

export function reportSheet(rows: ReportRow[], kind: ReportKind, simulated: boolean): WacSheet {
  const cols: XCol[] = [
    { header: 'Material code', width: 14, get: (i) => rows[i].fg.Matnr }, { header: 'Description', width: 36, get: (i) => rows[i].fg.Maktx }, { header: 'Plant', width: 8, get: (i) => rows[i].fg.Werks },
    { header: 'Brand', width: 10, get: (i) => rows[i].fg.Zbrand }, { header: 'Product', width: 16, get: (i) => rows[i].fg.Prodha },
    { header: 'Qty', dp: 3, width: 14, get: (i) => n(rows[i].fg.Qty, 3) }, { header: 'Uom', width: 7, get: (i) => rows[i].fg.Uom },
    { header: 'RM / pc', dp: 4, curr: 'INR', width: 12, get: (i) => n(rows[i].fg.ActRm) },
    ...(kind === 'fg' ? [{ header: 'PM / pc', dp: 4, curr: 'INR', width: 12, get: (i: number) => n(rows[i].fg.ActPm) }] : []),
    { header: 'Perfume / pc', dp: 4, curr: 'INR', width: 12, get: (i) => n(rows[i].fg.ActPerf) }, { header: 'Overheads / pc', dp: 4, curr: 'INR', width: 14, get: (i) => n(rows[i].fg.ActConv) },
    { header: 'COGM / pc', dp: 4, curr: 'INR', width: 12, get: (i) => n(rows[i].cogm) },
    { header: 'Last MRP / pc', dp: 4, width: 13, get: (i) => n(rows[i].price?.Mrp) }, { header: 'Last selling price / pc', dp: 4, width: 16, get: (i) => n(rows[i].price?.Sp) },
    { header: 'Price currency', width: 9, get: (i) => rows[i].price?.Curr ?? '' },
    ...(simulated ? [{ header: 'Simulated COGM / pc (computed here)', dp: 4, curr: 'INR', width: 18, get: (i: number) => n(rows[i].sim) }, { header: 'Variance vs COGM (computed here)', dp: 4, width: 16, get: (i: number) => n(rows[i].variance) }] : []),
    { header: 'Sale org', width: 9, get: (i) => rows[i].price?.Vkorg ?? '' }, { header: 'Channel', width: 9, get: (i) => rows[i].price?.Vtweg ?? '' },
    { header: 'Margin ratio MRP : COGM (computed here)', width: 18, get: (i) => ratioText(rows[i].rMrp) }, { header: 'Margin ratio Selling price : COGM (computed here)', width: 20, get: (i) => ratioText(rows[i].rSp) },
    ...(simulated ? [{ header: 'Margin ratio Simulated COGM : COGM (computed here)', width: 22, get: (i: number) => ratioText(rows[i].rSim) }] : []),
  ];
  return { name: kind === 'fg' ? 'Cost and margin' : 'WIP cost and margin', cols, count: rows.length };
}
export const downloadReport = (sheet: WacSheet, params: [string, string][]) => downloadWacWorkbook([sheet], params, 'cost-and-margin-report');
