'use client';
/** Excel export of the What-if screen: one sheet (before / after, change, targets, message per row) and the parameters. SAP figures as sent. */
import type { WacSheet } from '../wac/export';
import { downloadWacWorkbook } from '../wac/export';
import { dec } from '../wac/view';
import { annualWord, remainWord } from './whatifView';
import type { MarginSim } from './types';

const n = (v: string) => { const d = dec(v); return d ? Number(d.toFixed(6)) : null; };
export const WHATIF_HEADERS = ['Finished good', 'Description', 'Plant', 'Market', 'Channel', 'Currency', 'Unit', 'MRP before', 'MRP after', 'Selling price before', 'Selling price after', 'COGM before', 'COGM after',
  'Amount remaining before', 'Amount remaining after', 'Ratio before %', 'Ratio after %', 'Change of the remaining amount', 'Direction (remaining amount)', 'Annual change INR', 'Loss / saving',
  'Selling price for the target ratio', 'Selling price for the target remaining amount', 'MRP that restores', 'Message'] as const;

export function whatIfSheet(rows: MarginSim[]): WacSheet {
  const cols = [
    { header: WHATIF_HEADERS[0], width: 14, get: (i: number) => rows[i].Matnr }, { header: WHATIF_HEADERS[1], width: 34, get: (i: number) => rows[i].Maktx },
    { header: WHATIF_HEADERS[2], width: 8, get: (i: number) => rows[i].Werks }, { header: WHATIF_HEADERS[3], width: 10, get: (i: number) => rows[i].Market }, { header: WHATIF_HEADERS[4], width: 12, get: (i: number) => rows[i].Channel },
    { header: WHATIF_HEADERS[5], width: 9, get: (i: number) => rows[i].Curr }, { header: WHATIF_HEADERS[6], width: 7, get: (i: number) => rows[i].SellUom },
    ...([['MrpBefore', 7], ['MrpAfter', 8], ['SpBefore', 9], ['SpAfter', 10], ['CogmBefore', 11], ['CogmAfter', 12], ['RemainBefore', 13], ['RemainAfter', 14]] as const).map(([k, h]) => ({ header: WHATIF_HEADERS[h], dp: 4, width: 16, get: (i: number) => n(rows[i][k]) })),
    { header: WHATIF_HEADERS[15], dp: 2, width: 12, get: (i: number) => n(rows[i].RatioBefore) }, { header: WHATIF_HEADERS[16], dp: 2, width: 12, get: (i: number) => n(rows[i].RatioAfter) },
    { header: WHATIF_HEADERS[17], dp: 4, width: 16, get: (i: number) => n(rows[i].DeltaRemain) }, { header: WHATIF_HEADERS[18], width: 24, get: (i: number) => remainWord(rows[i].DeltaRemain) },
    { header: WHATIF_HEADERS[19], dp: 2, curr: 'INR', width: 16, get: (i: number) => n(rows[i].AnnualDeltaInr) }, { header: WHATIF_HEADERS[20], width: 12, get: (i: number) => annualWord(rows[i].AnnualDeltaInr) },
    { header: WHATIF_HEADERS[21], dp: 4, width: 18, get: (i: number) => n(rows[i].ReqSpRatio) }, { header: WHATIF_HEADERS[22], dp: 4, width: 22, get: (i: number) => n(rows[i].ReqSpRemain) },
    { header: WHATIF_HEADERS[23], dp: 4, width: 16, get: (i: number) => n(rows[i].ReqMrpRestore) }, { header: WHATIF_HEADERS[24], width: 50, get: (i: number) => rows[i].Msg },
  ];
  return { name: 'What-if', cols, count: rows.length };
}
export const downloadWhatIf = (rows: MarginSim[], params: [string, string][]) => downloadWacWorkbook([whatIfSheet(rows)], params, 'margin-what-if');
