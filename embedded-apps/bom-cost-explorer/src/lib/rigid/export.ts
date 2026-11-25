import type { XCol } from '../client/export';
import type { WacSheet } from '../wac/export';
import type { BudgetBreakup, HistoryLine, UtilLine, RigidAlert } from './analysis';
import { buildUp, dd, strip0, type Mould, type VendorLine, type WhatIfResult } from './model';

const n = (v: { toNumber(): number } | string | null | undefined): number | null => (v === null || v === undefined || v === '' ? null : typeof v === 'string' ? Number(dd(v).toFixed(6)) : Number(v.toNumber().toFixed(6)));
const sheet = <T,>(name: string, rows: T[], cols: { header: string; width?: number; dp?: number; get: (r: T) => string | number | null }[]): WacSheet => ({ name, count: rows.length, cols: cols.map((c): XCol => ({ header: c.header, width: c.width, dp: c.dp, get: (i) => c.get(rows[i]) })) });

export function rigidSheets(o: { vendors: VendorLine[]; moulds: Mould[]; budget: BudgetBreakup | null; history: HistoryLine[]; util: UtilLine[]; alerts: RigidAlert[]; whatIf?: { label: string; value: string }[] }): WacSheet[] {
  const out: WacSheet[] = [];
  out.push(sheet('Vendors', o.vendors, [
    { header: 'Mould', width: 12, get: (r) => r.mould }, { header: 'Mould description', width: 30, get: (r) => r.mouldTxt }, { header: 'Vendor', width: 10, get: (r) => r.lifnr }, { header: 'Vendor name', width: 28, get: (r) => r.vendor }, { header: 'Machine', width: 24, get: (r) => r.machine },
    { header: 'Output per day', dp: 0, width: 14, get: (r) => n(r.output) }, { header: 'Conversion per 1000', dp: 2, width: 15, get: (r) => n(r.conv) }, { header: 'Resin per 1000', dp: 2, width: 15, get: (r) => n(r.mat) },
    { header: 'Landed per 1000', dp: 0, width: 15, get: (r) => n(r.landed) }, { header: 'Landed per piece', dp: 4, width: 14, get: (r) => n(r.landed.div(1000)) }, { header: 'Difference to cheapest', dp: 0, width: 16, get: (r) => n(r.diff) },
  ]));
  const lines = o.moulds.flatMap((m) => buildUp(m.row).map((l) => ({ m, l })));
  out.push(sheet('Build-up', lines, [
    { header: 'Mould', width: 12, get: (r) => strip0(r.m.row.Mould) }, { header: 'Vendor', width: 24, get: (r) => r.m.row.Vendor }, { header: 'Cost line', width: 44, get: (r) => r.l.label }, { header: 'Per 1000 pieces', dp: 2, width: 15, get: (r) => n(r.l.amount) },
  ]));
  const comps = o.moulds.flatMap((m) => m.comps.map((c) => ({ m, c })));
  out.push(sheet('Components', comps, [
    { header: 'Mould', width: 12, get: (r) => strip0(r.m.row.Mould) }, { header: 'Vendor', width: 24, get: (r) => r.m.row.Vendor }, { header: 'Component', width: 14, get: (r) => strip0(r.c.Comp) }, { header: 'Description', width: 40, get: (r) => r.c.CompTxt },
    { header: 'BOM qty', dp: 4, width: 10, get: (r) => n(r.c.BomQty) }, { header: 'Scrap %', dp: 2, width: 9, get: (r) => n(r.c.ScrapPct) }, { header: 'Qty with scrap', dp: 4, width: 14, get: (r) => n(r.c.CompQty) }, { header: 'Rate ZPBR', dp: 4, width: 12, get: (r) => n(r.c.Zpbr) }, { header: 'Cost per 1000', dp: 2, width: 14, get: (r) => n(r.c.CompCost) },
  ]));
  if (o.budget?.d.length) out.push(sheet('Budget', o.budget.d, [
    { header: 'Year', width: 8, get: (r) => r.gjahr }, { header: 'Basic', dp: 4, width: 12, get: (r) => n(r.basic) }, { header: 'Discount', dp: 4, width: 12, get: (r) => n(r.discount) }, { header: 'Tax', dp: 4, width: 12, get: (r) => n(r.tax) },
    { header: 'Freight', dp: 4, width: 12, get: (r) => n(r.freight) }, { header: 'Landed', dp: 4, width: 12, get: (r) => n(r.landed) }, { header: 'Price unit', dp: 0, width: 10, get: (r) => n(r.priceUnit) }, { header: 'Budget quantity', dp: 0, width: 15, get: (r) => n(r.budqty) }, { header: 'UoM', width: 6, get: (r) => r.uom },
  ]));
  if (o.budget?.p.length) out.push(sheet('Packing budget build-up', o.budget.p, [
    { header: 'Component', width: 14, get: (r) => r.comp }, { header: 'Description', width: 40, get: (r) => r.compTxt }, { header: 'Origin', width: 8, get: (r) => r.origin }, { header: 'SAP rate', dp: 4, width: 12, get: (r) => n(r.rSap) }, { header: 'Used rate', dp: 4, width: 12, get: (r) => n(r.rUsed) },
    { header: 'Freight', dp: 4, width: 10, get: (r) => n(r.fUsed) }, { header: 'Landed rate', dp: 4, width: 12, get: (r) => n(r.landedRate) }, { header: 'Budget rate', dp: 4, width: 12, get: (r) => n(r.br) }, { header: 'Variance %', dp: 2, width: 10, get: (r) => n(r.varPct) },
  ]));
  if (o.history.length) out.push(sheet('Saved by ZRIGID', o.history, [
    { header: 'Valid from', width: 11, get: (r) => r.validFrom ?? '' }, { header: 'Valid to', width: 11, get: (r) => r.validTo ?? '' }, { header: 'Mould', width: 12, get: (r) => r.mould }, { header: 'Vendor', width: 10, get: (r) => r.lifnr },
    { header: 'Info record', width: 12, get: (r) => r.infnr }, { header: 'Landed per 1000', dp: 0, width: 15, get: (r) => n(r.landed) }, { header: 'Saved by', width: 12, get: (r) => r.user }, { header: 'Saved on', width: 11, get: (r) => r.created ?? '' },
  ]));
  out.push(sheet('Utilisation', o.util, [
    { header: 'Mould', width: 34, get: (r) => r.mould }, { header: 'Vendor', width: 26, get: (r) => r.vendor }, { header: 'Output per day', dp: 0, width: 14, get: (r) => n(r.outputDay) }, { header: 'Efficiency %', dp: 1, width: 12, get: (r) => n(r.efficiency) },
    { header: 'Cavities', dp: 0, width: 9, get: (r) => n(r.cavities) }, { header: 'Cycle time (s)', dp: 2, width: 12, get: (r) => n(r.cycle) }, { header: 'Budget quantity', dp: 0, width: 15, get: (r) => (r.budQty ? n(r.budQty) : null) },
    { header: 'Days of output for the budget', dp: 1, width: 18, get: (r) => (r.daysForBudget ? n(r.daysForBudget) : null) }, { header: 'Open PR', dp: 0, width: 11, get: (r) => n(r.openPr) }, { header: 'Asset value', dp: 0, width: 13, get: (r) => n(r.asset) }, { header: 'Depreciation', dp: 0, width: 13, get: (r) => n(r.depreciation) },
  ]));
  out.push(sheet('Alerts', o.alerts, [{ header: 'Severity', width: 10, get: (r) => r.sev }, { header: 'Alert', width: 120, get: (r) => r.text }]));
  if (o.whatIf?.length) out.push(sheet('What-if', o.whatIf, [{ header: 'Item', width: 40, get: (r) => r.label }, { header: 'Value', width: 24, get: (r) => r.value }]));
  return out;
}
export type { WhatIfResult };
