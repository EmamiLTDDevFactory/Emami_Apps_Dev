'use client';
/** Excel export of the Margin Board: one sheet with every row as SAP sent it (n/a where a scenario is not OK), the Parameters sheet says how it was run. */
import type { XCol } from '../client/export';
import { downloadWacWorkbook, type WacSheet } from '../wac/export';
import { dec } from '../wac/view';
import { directionOf, EROSION_WORD, IMPACT_WORD, rowNote, scenarioCells, severityOf, SEVERITY_WORD, varianceCells, VARIANCE_WORD } from './boardView';
import { SCENARIO_LABEL, SCENARIOS, type MarginRow } from './types';

const num = (v: string): number | string => { const d = dec(v); return d ? Number(d.toFixed(6)) : 'n/a'; };
const NA = 'n/a';

export function boardSheet(rows: MarginRow[]): WacSheet {
  const cols: XCol[] = [
    { header: 'Finished good', width: 14, get: (i) => rows[i].Matnr }, { header: 'Description', width: 34, get: (i) => rows[i].Maktx }, { header: 'Plant', width: 8, get: (i) => rows[i].Werks },
    { header: 'Market', width: 10, get: (i) => rows[i].Market }, { header: 'Channel', width: 12, get: (i) => rows[i].Channel }, { header: 'Currency', width: 9, get: (i) => rows[i].Curr },
    { header: 'MRP', dp: 4, width: 12, get: (i) => num(rows[i].Mrp) }, { header: 'Selling price', dp: 4, width: 13, get: (i) => num(rows[i].SellPrice) },
    { header: 'Price from', width: 14, get: (i) => rows[i].PriceFrom }, { header: 'Price source', width: 12, get: (i) => rows[i].PriceSrc },
  ];
  for (const s of SCENARIOS) {
    const L = SCENARIO_LABEL[s];
    cols.push(
      { header: `${L} COGM`, dp: 4, width: 13, get: (i) => { const c = scenarioCells(rows[i], s); return c.ok ? num(c.cogm) : NA; } },
      { header: `${L} ratio % of selling price`, dp: 2, width: 14, get: (i) => { const c = scenarioCells(rows[i], s); return c.ok ? num(c.ratio) : NA; } },
      { header: `${L} amount remaining after manufacturing cost`, dp: 4, width: 18, get: (i) => { const c = scenarioCells(rows[i], s); return c.ok ? num(c.remain) : NA; } },
    );
  }
  for (const [lab, k] of [['Standard', 'STD'], ['Actual', 'ACT'], ['Budget', 'BUD']] as const) {
    cols.push(
      { header: `Current vs ${lab} (amount)`, dp: 4, width: 15, get: (i) => { const v = varianceCells(rows[i], k); return v.abs ? num(v.abs) : NA; } },
      { header: `Current vs ${lab} (%)`, dp: 2, width: 13, get: (i) => { const v = varianceCells(rows[i], k); return v.pct ? num(v.pct) : NA; } },
    );
  }
  cols.push(
    { header: 'Erosion', dp: 4, width: 12, get: (i) => num(rows[i].Erosion) }, { header: 'Erosion %', dp: 2, width: 11, get: (i) => num(rows[i].ErosionPct) },
    { header: 'Erosion reading', width: 22, get: (i) => EROSION_WORD[directionOf(rows[i].ErosionPct)] },
    { header: 'Annual impact', dp: 2, width: 14, get: (i) => num(rows[i].AnnualImpact) }, { header: 'Annual impact INR', dp: 2, curr: 'INR', width: 16, get: (i) => num(rows[i].AnnualImpactInr) },
    { header: 'Annual impact reading', width: 14, get: (i) => IMPACT_WORD[directionOf(rows[i].AnnualImpactInr)] },
    { header: 'Selling price that restores the standard', dp: 4, width: 20, get: (i) => num(rows[i].ReqSpRestore) }, { header: 'MRP that restores the standard', dp: 4, width: 20, get: (i) => num(rows[i].ReqMrpRestore) },
    { header: 'Selling price rise %', dp: 2, width: 13, get: (i) => num(rows[i].SpRisePct) }, { header: 'Volume per year', dp: 0, width: 14, get: (i) => num(rows[i].VolumeYr) },
    { header: 'Alerts', width: 8, get: (i) => rows[i].AlertCnt }, { header: 'Highest severity', width: 12, get: (i) => { const s = severityOf(rows[i]); return s ? SEVERITY_WORD[s] : ''; } },
    { header: 'Alert text', width: 30, get: (i) => rows[i].AlertTxt }, { header: 'Status', width: 8, get: (i) => rows[i].Status }, { header: 'Note', width: 40, get: (i) => rowNote(rows[i]) },
    { header: 'Variance reading (current vs standard)', width: 16, get: (i) => VARIANCE_WORD[directionOf(varianceCells(rows[i], 'STD').pct)] },
  );
  return { name: 'Margin board', cols, count: rows.length };
}

export const downloadBoard = (rows: MarginRow[], params: [string, string][]) => downloadWacWorkbook([boardSheet(rows)], params, 'margin-board');
