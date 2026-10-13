'use client';
/**
 * Production Plan Excel: sheets Breakup, Requirement, Checks, WIP and Parameters. Each sheet holds what the
 * person has loaded (the Breakup needs a SAP run; the other sheets are filled when their tab was opened).
 */
import { exportTable, type XCol } from '../client/export';
import { D } from '../cost/decimal';
import { FISCAL_MONTHS, monthKeys, type PlanCheck, type PlanCostLine, type PlanSummary, type PlanWip } from './fields';
import { shortage } from './maths';
import type { PlanCostQuery } from './requests';
import type { SapMessage } from '../sap/messages';

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const get = (r: unknown, k: string) => (r as Record<string, unknown>)[k];

export function planParams(q: PlanCostQuery): [string, string][] {
  const yes = (b: boolean) => (b ? 'Yes' : 'No');
  return [
    ['Plan', q.plan],
    ['Plants', q.plants.join(', ') || 'all'],
    ['Materials', q.materials.join(', ') || 'all'],
    ['Material types', { A: 'All', P: 'Packing', R: 'RM + WIP' }[q.mtartFilter]],
    ['All BOMs', yes(q.allBoms)],
    ['Base plant', q.basePlant || '—'],
    ['Scrap', yes(q.scrap)],
    ['Fallback (BOM of the last producing plant)', yes(q.fallback)],
    ['Include freight', yes(q.inclFrt)],
    ['Standard freight', yes(q.stdFrt)],
    ['Rate priority', q.prio || 'SAP default'],
    ['Donor plant', q.donorPlant || '—'],
    ['Lookback days', String(q.lookback)],
    ['Months', 'Fiscal April..March (QtyM1 = April)'],
  ];
}

export function breakupCols(rows: PlanCostLine[]): XCol[] {
  const QTY = monthKeys('QtyM');
  return [
    { header: 'Country', get: (i) => rows[i].Land1 },
    { header: 'Plant', get: (i) => rows[i].Hwerks },
    { header: 'Plan material', get: (i) => rows[i].Headmat },
    { header: 'Plan material text', width: 28, get: (i) => rows[i].Headtxt },
    { header: 'BOM source', get: (i) => rows[i].BomSrc },
    { header: 'BOM plant', get: (i) => rows[i].BomPlant },
    { header: 'BOM source date', get: (i) => rows[i].BomSrcDate ?? '' },
    { header: 'Level', get: (i) => rows[i].Level },
    { header: 'Structure', width: 36, get: (i) => `${'  '.repeat(Math.max(0, rows[i].Level - 1))}${rows[i].Idnrk}` },
    { header: 'Description', width: 30, get: (i) => rows[i].Maktx },
    { header: 'Type', get: (i) => rows[i].Mtart },
    { header: 'Leaf', get: (i) => (rows[i].HasChild?.trim() ? '' : 'X') },
    { header: 'Unit', get: (i) => rows[i].Meins },
    { header: 'Plan qty (FG)', dp: 3, get: (i) => num(rows[i].PlanQty) },
    ...QTY.map((k, m) => ({ header: `${FISCAL_MONTHS[m]} qty`, dp: 3, get: (i: number) => num(get(rows[i], k)) })),
    { header: 'Total qty', dp: 3, get: (i) => num(rows[i].QtyTot) },
    { header: 'Source', get: (i) => rows[i].SelSource || 'NO RATE' },
    { header: 'Rate/pc INR', dp: 4, curr: 'INR', get: (i) => num(rows[i].SelRatePcInr) },
    { header: 'Freight/pc INR', dp: 4, curr: 'INR', get: (i) => num(rows[i].FrtPcInr) },
    { header: 'Total/pc INR', dp: 4, curr: 'INR', get: (i) => num(rows[i].TotCostPcInr) },
    ...QTY.map((k, m) => ({ header: `${FISCAL_MONTHS[m]} cost INR`, dp: 2, curr: 'INR', get: (i: number) => Number(D(get(rows[i], k) as string).times(D(rows[i].TotCostPcInr)).toFixed(2)) })),
    { header: 'Total cost INR', dp: 2, curr: 'INR', get: (i) => num(rows[i].TotCostInr) },
    { header: 'Budget landed INR', dp: 4, curr: 'INR', get: (i) => num(rows[i].BudLanded) },
    { header: 'Actual rate/pc INR', dp: 4, curr: 'INR', get: (i) => num(rows[i].ActRatePcInr) },
  ];
}

export function summaryCols(rows: PlanSummary[]): XCol[] {
  return [
    { header: 'Plant', get: (i) => rows[i].Werks },
    { header: 'Component', get: (i) => rows[i].Comp },
    { header: 'Description', width: 30, get: (i) => rows[i].CompTxt },
    { header: 'Type', get: (i) => rows[i].Mtart },
    { header: 'Origin', get: (i) => rows[i].Hrkft },
    { header: 'Unit', get: (i) => rows[i].Meins },
    ...monthKeys('Qm').map((k, m) => ({ header: FISCAL_MONTHS[m], dp: 3, get: (i: number) => num(get(rows[i], k)) })),
    { header: 'Requirement', dp: 3, get: (i) => num(rows[i].BudQty) },
    { header: 'Valuated stock', dp: 3, get: (i) => num(rows[i].Lbkum) },
    { header: 'Stock value', dp: 2, curr: 'INR', get: (i) => num(rows[i].Salk3) },
    { header: 'PO qty', dp: 3, get: (i) => num(rows[i].PoQty) },
    { header: 'Delivered', dp: 3, get: (i) => num(rows[i].DelQty) },
    { header: 'Open PO', dp: 3, get: (i) => num(rows[i].RemQty) },
    { header: 'Shortage', dp: 3, get: (i) => Number(shortage(rows[i]).toFixed(3)) },
  ];
}

export const checkCols = (rows: PlanCheck[]): XCol[] => [
  { header: 'Kind', get: (i) => rows[i].Kind },
  { header: 'Plant', get: (i) => rows[i].Werks },
  { header: 'Material', get: (i) => rows[i].Matnr },
  { header: 'Component', get: (i) => rows[i].Comp },
  { header: 'Message', width: 70, get: (i) => rows[i].Msg },
];

export const wipCols = (rows: PlanWip[]): XCol[] => [
  { header: 'FG', get: (i) => rows[i].Matnr },
  { header: 'FG text', width: 28, get: (i) => rows[i].FgTxt },
  { header: 'Plant', get: (i) => rows[i].Werks },
  { header: 'Country', get: (i) => rows[i].Land1 },
  { header: 'Net weight', dp: 3, get: (i) => num(rows[i].Ntgew) },
  { header: 'Weight unit', get: (i) => rows[i].Gewei },
  { header: 'WIP component', get: (i) => rows[i].Comp },
  { header: 'Component text', width: 28, get: (i) => rows[i].CompTxt },
  ...monthKeys('Qm').map((k, m) => ({ header: FISCAL_MONTHS[m], dp: 3, get: (i: number) => num(get(rows[i], k)) })),
  { header: 'Total', dp: 3, get: (i) => num(rows[i].Qtot) },
];

export async function exportPlanWorkbook(p: { plants?: string[]; query: PlanCostQuery; cost: PlanCostLine[] | null; summary: PlanSummary[] | null; checks: PlanCheck[] | null; wip: PlanWip[] | null; messages: SapMessage[] }) {
  const cost = p.cost ?? [];
  const extra: { name: string; cols: XCol[]; count: number }[] = [];
  if (p.summary) extra.push({ name: 'Requirement', cols: summaryCols(p.summary), count: p.summary.length });
  if (p.checks) extra.push({ name: 'Checks', cols: checkCols(p.checks), count: p.checks.length });
  if (p.wip) extra.push({ name: 'WIP', cols: wipCols(p.wip), count: p.wip.length });
  const loaded = (x: unknown[] | null) => (x ? `${x.length} rows` : 'not loaded (open the tab first)');
  await exportTable({
    fmt: 'xlsx',
    name: 'Breakup',
    cols: breakupCols(cost),
    count: cost.length,
    messages: p.messages,
    extraSheets: extra,
    extraParams: [
      ...planParams({ ...p.query, plants: p.plants ?? p.query.plants }),
      ['Breakup', p.cost ? `${cost.length} rows (CostLineSet Mode P)` : 'not loaded (Run in SAP on Breakup & cost)'],
      ['Requirement', loaded(p.summary)],
      ['Checks', loaded(p.checks)],
      ['WIP', loaded(p.wip)],
      ['Monthly cost', 'QtyMn x TotCostPcInr'],
      ['Cost per FG piece', 'Sum of leaf TotCostInr / PlanQty'],
      ['Shortage', 'Requirement - (valuated stock + open PO); units as SAP sends them (not converted)'],
    ],
  });
}
