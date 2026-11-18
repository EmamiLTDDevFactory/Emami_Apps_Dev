'use client';
/** Excel export of the packing budget rate screens (exceljs loaded on demand; text goes through sanitizeCell, the formula injection guard). */
import { sanitizeCell } from '../client/spreadsheetSafe';
import { showDate, stripZeros, type CompareRow } from './rules';
import type { PkgGroup, PkgScen } from './types';

type Row = (string | number | null)[];
interface Sheet { name: string; header: string[]; rows: Row[]; dp?: Record<number, number> }

async function save(file: string, sheets: Sheet[]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(s.header).font = { bold: true };
    for (const r of s.rows) ws.addRow(r.map((v) => (typeof v === 'string' ? sanitizeCell(v) : v)));
    s.header.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(11, Math.min(40, h.length + 4));
      const dp = s.dp?.[i];
      if (dp !== undefined) col.numFmt = `#,##0${dp ? `.${'0'.repeat(dp)}` : ''}`;
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = (s: PkgScen | null) => `packing-budget-${s ? `v${s.BudgetVersion}-${stripZeros(s.ScenId)}` : 'scenario'}`;

/** Materials and Components sheets: used and SAP values side by side. */
export function exportRates(scen: PkgScen | null, groups: PkgGroup[]) {
  const mat: Sheet = {
    name: 'Materials',
    header: ['Material', 'Description', 'Type', 'Group', 'Rate source', 'Basic (SAP)', 'Basic (used)', 'Budgeted', 'Variance', 'Var %', 'Currency', 'Per', 'UoM', 'Flags', 'Freight / unit (INR)', 'Landed (INR)', 'Group value (INR)', 'Origin group'],
    rows: groups.map(({ head: h }) => [stripZeros(h.Matnr), h.Maktx, h.Mtart, h.Matkl, h.RateSrc, h.BasicRateSap, h.BasicRateUsed, h.BudgetRate, h.Variance, h.VariancePct, h.Waers, h.Peinh, h.Meins, h.MsgFlags, h.FrtTotal, h.LandedRate, h.GroupValue, h.OriginGrp]),
    dp: { 5: 4, 6: 4, 7: 4, 8: 4, 9: 2, 14: 4, 15: 4, 16: 4 },
  };
  const comp: Sheet = {
    name: 'Components',
    header: ['Material', 'Component', 'Description', '% SAP', '% used', 'ZBUD % SAP', 'ZBUD % used', 'Base rate', 'Budgeted', 'Flags'],
    rows: groups.flatMap((g) => g.comps.map((c) => [stripZeros(g.head.Matnr), stripZeros(c.Idnrk), c.Maktx, c.PctSap, c.PctUsed, c.ZbudSap, c.ZbudUsed, c.CompBaseRate, c.CompBudRate, c.MsgFlags])),
    dp: { 3: 3, 4: 3, 5: 3, 6: 3, 7: 4, 8: 4 },
  };
  const info: Sheet | null = scen ? {
    name: 'Scenario', header: ['Field', 'Value'],
    rows: [['Scenario', stripZeros(scen.ScenId)], ['Title', scen.Descr], ['Version', scen.BudgetVersion], ['Status', scen.Status], ['Plant', scen.Werks], ['Valid from', showDate(scen.ValidFrom)], ['Valid to', showDate(scen.ValidTo)], ['Key date', showDate(scen.KeyDate)], ['Priority', scen.Prio]],
  } : null;
  return save(`${stamp(scen)}.xlsx`, [mat, comp, ...(info ? [info] : [])]);
}

export function exportCompare(scen: PkgScen | null, otherLabel: string, rows: CompareRow[]) {
  return save(`${stamp(scen)}-compare.xlsx`, [{
    name: 'Compare',
    header: ['Material', 'Description', 'Basic (this)', 'Budgeted (this)', 'Var % (this)', `Basic (${otherLabel})`, `Budgeted (${otherLabel})`, `Var % (${otherLabel})`, 'Delta budgeted'],
    rows: rows.map((r) => [stripZeros(r.Matnr), r.Maktx, r.basicThis, r.budThis, r.varThis, r.basicOther, r.budOther, r.varOther, r.delta]),
    dp: { 2: 4, 3: 4, 4: 2, 5: 4, 6: 4, 7: 2, 8: 4 },
  }]);
}
