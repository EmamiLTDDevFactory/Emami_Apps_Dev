/** Sheets of the Sales price Excel export: only what has been loaded. Text goes through sanitizeCell in downloadWacWorkbook. */
import type { WacSheet } from '../wac/export';
import { dec } from '../wac/view';
import { segmentLabel } from './view';
import type { CogmRow, SoCondRow, SoFilterRow, SoPriceRow, SoPricingRow, SoProcRow } from './types';

const n = (v: string): number | null => { const d = dec(v); return d ? Number(d.toFixed(6)) : null; };
const yn = (b: boolean) => (b ? 'X' : '');
const sheet = <T,>(name: string, rows: T[], cols: { header: string; width?: number; dp?: number; get: (r: T) => string | number | null }[]): WacSheet => ({
  name, count: rows.length, cols: cols.map((c) => ({ header: c.header, width: c.width, dp: c.dp, get: (i: number) => c.get(rows[i]) })),
});

export const pricesSheet = (rows: SoPriceRow[]): WacSheet => sheet('Prices', rows, [
  { header: 'Segment', width: 22, get: segmentLabel }, { header: 'Material', width: 14, get: (r) => r.Matnr }, { header: 'Description', width: 34, get: (r) => r.Maktx },
  { header: 'Sales org', width: 9, get: (r) => r.Vkorg }, { header: 'Channel', width: 9, get: (r) => r.Vtweg }, { header: 'Doc type', width: 9, get: (r) => r.Auart }, { header: 'Doc type text', width: 22, get: (r) => r.AuartTxt },
  { header: 'Currency', width: 9, get: (r) => r.Curr }, { header: 'Unit', width: 7, get: (r) => r.Uom },
  { header: 'MRP (per unit)', dp: 4, width: 14, get: (r) => n(r.Mrp) }, { header: 'Selling price (per unit)', dp: 4, width: 18, get: (r) => n(r.Sp) }, { header: 'Selling price condition', width: 14, get: (r) => r.SpCond },
  { header: 'Net price (reference)', dp: 4, width: 16, get: (r) => n(r.NetPrice) },
  { header: 'Order', width: 13, get: (r) => r.Vbeln }, { header: 'Item', width: 8, get: (r) => r.Posnr }, { header: 'Order date', width: 12, get: (r) => r.Audat ?? '' }, { header: 'Days old', width: 9, get: (r) => r.DaysOld },
  { header: 'Customer', width: 12, get: (r) => r.Kunnr }, { header: 'Pricing procedure', width: 24, get: (r) => [r.Kalsm, r.KalsmTxt].filter(Boolean).join(' - ') },
  { header: 'Orders found', width: 11, get: (r) => r.NOrders }, { header: 'Orders skipped', width: 13, get: (r) => r.NSkip }, { header: 'Werks', width: 7, get: (r) => r.Werks }, { header: 'Source', width: 8, get: (r) => r.Src }, { header: 'SAP message', width: 44, get: (r) => r.Msg },
]);
export const pricingSheet = (rows: SoPricingRow[]): WacSheet => sheet('Pricing', rows, [
  { header: 'Order', width: 13, get: (r) => r.Vbeln }, { header: 'Item', width: 8, get: (r) => r.Posnr }, { header: 'Material', width: 14, get: (r) => r.Matnr },
  { header: 'Sales org', width: 9, get: (r) => r.Vkorg }, { header: 'Channel', width: 9, get: (r) => r.Vtweg }, { header: 'Doc type', width: 9, get: (r) => r.Auart },
  { header: 'Step', width: 7, get: (r) => r.Stunr }, { header: 'Counter', width: 8, get: (r) => r.Zaehk }, { header: 'Condition', width: 10, get: (r) => r.Kschl }, { header: 'Text', width: 30, get: (r) => r.Txt },
  { header: 'Rate', dp: 4, width: 13, get: (r) => n(r.Kbetr) }, { header: 'Per', dp: 3, width: 8, get: (r) => n(r.Kpein) }, { header: 'Unit', width: 7, get: (r) => r.Kmein },
  { header: 'Value', dp: 2, width: 14, get: (r) => n(r.Kwert) }, { header: 'Currency', width: 9, get: (r) => r.Waers },
  { header: 'Inactive', width: 9, get: (r) => r.Kinak }, { header: 'Statistical', width: 10, get: (r) => yn(r.Kstat) }, { header: 'Role (MRP / SP)', width: 14, get: (r) => r.Role },
]);
export const procSheet = (rows: SoProcRow[]): WacSheet => sheet('Pricing procedure', rows, [
  { header: 'Procedure', width: 11, get: (r) => r.Kalsm }, { header: 'Procedure text', width: 28, get: (r) => r.KalsmTxt }, { header: 'Step', width: 7, get: (r) => r.Stunr }, { header: 'Counter', width: 8, get: (r) => r.Zaehl },
  { header: 'Condition', width: 10, get: (r) => r.Kschl }, { header: 'Text', width: 30, get: (r) => r.Txt }, { header: 'Role (MRP / SP)', width: 14, get: (r) => r.Role },
]);
export const rulesSheet = (rows: SoCondRow[]): WacSheet => sheet('Rules', rows, [
  { header: 'Sales org', width: 9, get: (r) => r.Vkorg }, { header: 'Sales org text', width: 22, get: (r) => r.OrgTxt }, { header: 'Channel', width: 9, get: (r) => r.Vtweg }, { header: 'Channel text', width: 20, get: (r) => r.ChnTxt },
  { header: 'Doc type', width: 9, get: (r) => r.Auart }, { header: 'Procedure', width: 11, get: (r) => r.Kalsm }, { header: 'Selling price condition', width: 12, get: (r) => r.KschlSp }, { header: 'Selling price text', width: 24, get: (r) => r.SpTxt },
  { header: 'MRP condition', width: 12, get: (r) => r.KschlMrp }, { header: 'MRP text', width: 24, get: (r) => r.MrpTxt }, { header: 'Selling price basis', width: 14, get: (r) => r.SpBasis }, { header: 'Absolute', width: 10, get: (r) => r.SpAbs },
  { header: 'Fallback', width: 10, get: (r) => r.Fallback }, { header: 'Segment', width: 10, get: (r) => r.Segment }, { header: 'Segment text', width: 20, get: (r) => r.SegTxt }, { header: 'Never counted', width: 12, get: (r) => yn(r.Excl) },
  { header: 'Text', width: 36, get: (r) => r.Text }, { header: 'Changed by', width: 14, get: (r) => r.ChBy },
]);
export const filterListsSheet = (rows: SoFilterRow[]): WacSheet => sheet('Filter lists', rows, [
  { header: 'Kind', width: 9, get: (r) => r.Kind }, { header: 'Code', width: 10, get: (r) => r.Code }, { header: 'Text', width: 30, get: (r) => r.Txt }, { header: 'Lines', width: 9, get: (r) => r.NLines },
  { header: 'Orders', width: 9, get: (r) => r.NOrders }, { header: 'Share %', dp: 2, width: 10, get: (r) => n(r.SharePct) }, { header: 'Last date', width: 12, get: (r) => r.LastDate ?? '' },
]);
export const cogmSheet = (rows: CogmRow[]): WacSheet => sheet('Compare with cost', rows, [
  { header: 'Material', width: 14, get: (r) => r.Matnr }, { header: 'Description', width: 34, get: (r) => r.Maktx }, { header: 'Plant', width: 7, get: (r) => r.Werks }, { header: 'Market (sales org)', width: 12, get: (r) => r.Market }, { header: 'Channel / doc type', width: 16, get: (r) => r.Channel },
  { header: 'Currency', width: 9, get: (r) => r.Curr }, { header: 'Unit', width: 7, get: (r) => r.SellUom }, { header: 'MRP', dp: 4, width: 12, get: (r) => n(r.Mrp) }, { header: 'Selling price', dp: 4, width: 14, get: (r) => n(r.SellPrice) },
  { header: 'Price from', width: 12, get: (r) => r.PriceFrom }, { header: 'Price source', width: 10, get: (r) => r.PriceSrc },
  { header: 'Standard cost of goods manufactured', dp: 4, width: 20, get: (r) => n(r.CogmStd) }, { header: 'Current cost of goods manufactured', dp: 4, width: 20, get: (r) => n(r.CogmCur) },
  { header: 'Ratio (standard)', dp: 4, width: 13, get: (r) => n(r.RatioStd) }, { header: 'Ratio (current)', dp: 4, width: 13, get: (r) => n(r.RatioCur) },
  { header: 'Amount remaining after manufacturing cost (standard)', dp: 4, width: 22, get: (r) => n(r.RemainStd) }, { header: 'Amount remaining after manufacturing cost (current)', dp: 4, width: 22, get: (r) => n(r.RemainCur) },
  { header: 'Erosion %', dp: 2, width: 11, get: (r) => n(r.ErosionPct) }, { header: 'Annual impact (INR)', dp: 2, width: 16, get: (r) => n(r.AnnualImpactInr) }, { header: 'Selling price to restore', dp: 4, width: 16, get: (r) => n(r.ReqSpRestore) },
  { header: 'Status', width: 9, get: (r) => r.Status }, { header: 'SAP message', width: 40, get: (r) => r.Msg },
]);
