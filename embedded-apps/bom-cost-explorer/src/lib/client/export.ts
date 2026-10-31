'use client';
import { costPropVisible } from '../sap/allCosts';
import type { CostQuery } from '../query/schema';
import { describeQuery } from '../query/schema';
import { COST_LINE, type CostLine, type RateOption } from '../sap/fields';
import { currencyOf, type ColDef } from '../views';
import type { SimRow, SimSettings } from '../cost/simulate';
import { isIdentity } from '../cost/simulate';
import type { Pivot } from '../cost/pivot';
import type { TableTotals } from '../cost/table';
import type { SapMessage } from '../sap/messages';
import { sanitizeCell } from './spreadsheetSafe';
import { componentFreightInr, componentFreightLoc, type FreightTagged } from '../cost/freightIncluded';

/** Excel number formats. INR gets Indian grouping (lakh/crore) via conditional sections. */
const INR_FMT = (dp: number) => {
  const d = dp ? `.${'0'.repeat(dp)}` : '';
  return `[>=10000000]##\\,##\\,##\\,##0${d};[>=100000]##\\,##\\,##0${d};##,##0${d}`;
};
const STD_FMT = (dp: number) => `#,##0${dp ? `.${'0'.repeat(dp)}` : ''}`;
const numFmt = (dp: number, curr?: string) => (curr === 'INR' ? INR_FMT(dp) : STD_FMT(dp));

export interface XCol {
  header: string;
  width?: number;
  dp?: number; // numeric when set
  curr?: string; // 'INR' for Indian grouping
  get: (i: number) => string | number | null;
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(sanitizeCell(v));
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface ExportSpec {
  fmt: 'xlsx' | 'csv';
  name: string;
  /** omitted by the Production Plan export, which passes its own parameters in extraParams */
  query?: CostQuery;
  cols: XCol[];
  count: number;
  extraParams?: [string, string][];
  messages?: SapMessage[];
  extraSheets?: { name: string; cols: XCol[]; count: number }[];
}

export async function exportTable(spec: ExportSpec) {
  const file = `bom-simulator-${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp()}`;
  if (spec.fmt === 'csv') {
    const lines = [spec.cols.map((c) => csvCell(c.header)).join(',')];
    for (let i = 0; i < spec.count; i++) lines.push(spec.cols.map((c) => csvCell(c.get(i))).join(','));
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${file}.csv`);
    return;
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BOM Simulator';
  wb.created = new Date();

  const addSheet = (name: string, cols: XCol[], count: number) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.header, width: c.width ?? Math.max(10, Math.min(40, c.header.length + 4)) }));
    for (let i = 0; i < count; i++) ws.addRow(cols.map((c) => sanitizeCell(c.get(i))));
    cols.forEach((c, ci) => {
      if (c.dp !== undefined) ws.getColumn(ci + 1).numFmt = numFmt(c.dp, c.curr);
    });
    const h = ws.getRow(1);
    h.font = { bold: true };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF4' } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };
  addSheet(spec.name.slice(0, 31), spec.cols, spec.count);
  for (const s of spec.extraSheets ?? []) addSheet(s.name.slice(0, 31), s.cols, s.count);

  const ps = wb.addWorksheet('Parameters');
  ps.columns = [{ header: 'Parameter', width: 28 }, { header: 'Value', width: 90 }];
  ps.getRow(1).font = { bold: true };
  for (const [k, v] of spec.query ? describeQuery(spec.query) : []) ps.addRow([k, sanitizeCell(v)]);
  ps.addRow(['Exported at', new Date().toLocaleString('en-IN')]);
  for (const [k, v] of spec.extraParams ?? []) ps.addRow([k, sanitizeCell(v)]);
  if (spec.messages?.length) {
    ps.addRow([]);
    ps.addRow(['SAP messages']).font = { bold: true };
    for (const m of spec.messages) ps.addRow([m.severity, sanitizeCell(`${m.code ? `${m.code}: ` : ''}${m.message}`)]);
  }
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${file}.xlsx`);
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

/** R / F / M tables. */
export async function exportRows({ fmt, name, query, cols, rows, totals }: { fmt: 'xlsx' | 'csv'; name: string; query: CostQuery; cols: ColDef[]; rows: Record<string, unknown>[]; totals?: TableTotals }) {
  const xcols: XCol[] = [];
  for (const c of cols) {
    if (c.kind === 'd') {
      const fixed = c.curr && !c.curr.startsWith('@') ? c.curr : undefined;
      xcols.push({ header: fixed ? `${c.label} (${fixed})` : c.label, dp: c.dp ?? 2, curr: fixed, width: 16, get: (i) => num(rows[i][c.key]) });
      if (c.curr?.startsWith('@')) xcols.push({ header: `${c.label} curr`, width: 8, get: (i) => currencyOf(c, rows[i]) ?? '' });
    } else xcols.push({ header: c.label, width: c.kind === 't' ? 12 : 16, get: (i) => String(rows[i][c.key] ?? '') });
  }
  const extra: [string, string][] = [['Rows', String(rows.length)]];
  for (const [k, byCurr] of Object.entries(totals ?? {})) extra.push([`Total ${cols.find((c) => c.key === k)?.label ?? k}`, Object.entries(byCurr).map(([cur, v]) => `${v} ${cur}`).join('; ')]);
  await exportTable({ fmt, name, query, cols: xcols, count: rows.length, extraParams: extra });
}

/** Mode B: every CostLine field (the "all columns" view), plus simulated values when active. */
export async function exportCostLines({ fmt, query, rows, sim, settings, messages }: { fmt: 'xlsx' | 'csv'; query: CostQuery; rows: CostLine[]; sim: SimRow[]; settings: SimSettings; messages: SapMessage[] }) {
  const simOn = !isIdentity(settings);
  const kinds = COST_LINE as Record<string, readonly [string, string]>;
  const keys = Object.keys(kinds).filter((k) => costPropVisible(k));
  const cols: XCol[] = keys.map((k) => {
    const kind = kinds[k][1];
    const inr = /Inr$/.test(k) || k === 'BudLanded';
    // Freight as SAP gave it, also where it is not added (Consumption / MBEW rates include it; see "Freight added").
    if (k === 'FrtPcInr' || k === 'FrtPcLoc') return { header: k, dp: 4, curr: k === 'FrtPcInr' ? 'INR' : undefined, width: 14, get: (i) => Number((k === 'FrtPcInr' ? componentFreightInr(rows[i]) : componentFreightLoc(rows[i])).toFixed(6)) };
    if (kind === 'd') return { header: k, dp: /Rate|Fx|Pc/.test(k) ? 4 : k.startsWith('Cov') ? 0 : 2, curr: inr ? 'INR' : undefined, width: 14, get: (i) => num((rows[i] as unknown as Record<string, unknown>)[k]) };
    return { header: k, width: k === 'Maktx' || k === 'Headtxt' ? 30 : 10, get: (i) => String((rows[i] as unknown as Record<string, unknown>)[k] ?? '') };
  });
  cols.splice(keys.indexOf('Idnrk') + 1, 0, { header: 'Structure', width: 40, get: (i) => `${'  '.repeat(Math.max(0, rows[i].Level - 1))}${rows[i].Idnrk}` });
  cols.push({ header: 'RateOptions (count)', width: 10, get: (i) => rows[i].RateOptions?.length ?? 0 });
  cols.push({ header: 'Freight added', width: 12, get: (i) => (!rows[i].HasChild?.trim() ? ((rows[i] as FreightTagged).FrtIncluded ? 'No (included in rate)' : 'Yes') : '') });
  if (simOn) {
    cols.push(
      { header: 'SIM Source', width: 12, get: (i) => sim[i].source },
      { header: 'SIM Rate/pc INR', dp: 4, curr: 'INR', width: 16, get: (i) => Number(sim[i].ratePcInr.toFixed(6)) },
      { header: 'SIM Freight/pc INR', dp: 4, curr: 'INR', width: 16, get: (i) => Number(sim[i].frtPcInr.toFixed(6)) },
      { header: 'SIM Qty', dp: 3, width: 14, get: (i) => Number(sim[i].qty.toFixed(3)) },
      { header: 'SIM Total INR', dp: 2, curr: 'INR', width: 16, get: (i) => Number(sim[i].total.toFixed(2)) },
      { header: 'SIM Overridden', width: 10, get: (i) => (sim[i].overridden ? 'X' : '') },
    );
  }
  const extra: [string, string][] = [['Rows', String(rows.length)], ['Totals', 'Sum TotCostInr over rows with HasChild blank (leaf rows)']];
  if (simOn) extra.push(['Simulation (client-side, not SAP)', JSON.stringify(settings)]);
  // Rate options as their own sheet (one row per option).
  const flat: { r: CostLine; o: RateOption }[] = [];
  for (const r of rows) for (const o of r.RateOptions ?? []) flat.push({ r, o });
  const optCols: XCol[] = [
    { header: 'Plant', get: (i) => flat[i].r.Werks },
    { header: 'Header', get: (i) => flat[i].r.Headmat },
    { header: 'Component', get: (i) => flat[i].r.Idnrk },
    { header: 'Source', get: (i) => flat[i].o.Source },
    { header: 'Option plant', get: (i) => flat[i].o.Plant },
    { header: 'Cond', get: (i) => flat[i].o.Cond },
    { header: 'Curr', get: (i) => flat[i].o.Curr },
    { header: 'Valid from', get: (i) => flat[i].o.ValidFrom ?? '' },
    { header: 'Rate', dp: 4, get: (i) => num(flat[i].o.Rate) },
    { header: 'Rate/pc', dp: 4, get: (i) => num(flat[i].o.RatePc) },
    { header: 'Rate/pc local', dp: 4, get: (i) => num(flat[i].o.RatePcLoc) },
    { header: 'Rate/pc INR', dp: 4, curr: 'INR', get: (i) => num(flat[i].o.RatePcInr) },
    { header: 'Cost INR', dp: 2, curr: 'INR', get: (i) => num(flat[i].o.CostInr) },
  ];
  await exportTable({ fmt, name: 'BOM costing', query, cols, count: rows.length, extraParams: extra, messages, extraSheets: fmt === 'xlsx' ? [{ name: 'Rate options', cols: optCols, count: flat.length }] : [] });
}

export async function exportPivot({ fmt, query, pivot, messages }: { fmt: 'xlsx' | 'csv'; query: CostQuery; pivot: Pivot; messages: SapMessage[] }) {
  const R = pivot.rows;
  const cols: XCol[] = [
    { header: 'Header', get: (i) => R[i].head },
    { header: 'Header text', width: 28, get: (i) => R[i].headText },
    { header: 'Component', get: (i) => (R[i].kind === 'total' ? 'TOTAL' : R[i].comp) },
    { header: 'Description', width: 28, get: (i) => R[i].compText },
  ];
  for (const p of pivot.plants) {
    cols.push(
      { header: `${p} Qty`, dp: 3, get: (i) => (R[i].cells[p] && R[i].kind !== 'total' ? Number(R[i].cells[p]!.qty.toFixed(3)) : null) },
      { header: `${p} Rate/pc INR`, dp: 4, curr: 'INR', get: (i) => (R[i].cells[p] && R[i].kind !== 'total' ? Number(R[i].cells[p]!.ratePc.toFixed(6)) : null) },
      { header: `${p} Freight/pc INR`, dp: 4, curr: 'INR', get: (i) => (R[i].cells[p] && R[i].kind !== 'total' ? Number(R[i].cells[p]!.frtPc.toFixed(6)) : null) },
      { header: `${p} Cost INR`, dp: 2, curr: 'INR', get: (i) => (R[i].cells[p] ? Number(R[i].cells[p]!.cost.toFixed(2)) : null) },
      { header: `${p} Source`, get: (i) => (R[i].kind === 'total' ? '' : R[i].cells[p]?.source ?? '') },
    );
  }
  cols.push(
    { header: 'Min INR', dp: 2, curr: 'INR', get: (i) => (R[i].min ? Number(R[i].min!.toFixed(2)) : null) },
    { header: 'Max INR', dp: 2, curr: 'INR', get: (i) => (R[i].max ? Number(R[i].max!.toFixed(2)) : null) },
    { header: 'Difference INR', dp: 2, curr: 'INR', get: (i) => (R[i].diff ? Number(R[i].diff!.toFixed(2)) : null) },
    { header: 'Cheapest plant', get: (i) => R[i].cheapest ?? '' },
  );
  await exportTable({ fmt, name: 'Plant comparison', query, cols, count: R.length, messages });
}
