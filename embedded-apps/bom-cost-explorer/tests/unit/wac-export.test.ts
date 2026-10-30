import { describe, expect, it } from 'vitest';
import { componentsSheet, comparisonSheet, documentsSheet, summarySheet } from '@/lib/wac/export';
import type { WacCompRow, WacCompareRow, WacDocRow, WacRow } from '@/lib/wac/types';

const row = (p: Partial<WacRow> = {}): WacRow => ({
  Rowid: 1, Matnr: 'FG1', Maktx: '=cmd|calc', Werks: 'UN13', Mtart: 'FERT', Zbrand: '0116', Prodha: 'P', Zskugrcodecrs: 'C1', Zskugroupcrs: 'G', Uom: 'PC', Docs: 3, Batches: 2, DupDocs: 0, Qty: '100',
  ActRm: '5', ActPm: '3', ActPerf: '1', ActMat: '9', ActConv: '2', ActLanded: '11', ActRecon: '0', VarpSel: '4.2', VarpCmap: '-1', VarpCon: '11', VarpAvg: '0.0000', FlagSel: '', FlagCmap: '', FlagCon: 'H', FlagAvg: '', Status: 'D', Msg: 'm', ...p,
});
const cell = (s: ReturnType<typeof summarySheet>, header: string, i: number) => s.cols.find((c) => c.header === header)!.get(i);

describe('Excel sheets', () => {
  it('Summary: one row per finished good, numbers as numbers, the CRS as "code - description"', () => {
    const s = summarySheet([row()], false);
    expect(s.name).toBe('Summary');
    expect(s.count).toBe(1);
    expect(cell(s, 'Actual Material / unit', 0)).toBe(9);
    expect(cell(s, 'CRS', 0)).toBe('C1 - G');
    expect(cell(s, 'Var % vs Consumption', 0)).toBe(11);
    expect(cell(s, 'Flag Consumption', 0)).toBe('H');
  });
  it('Summary carries the selection total row only when it is shown', () => {
    const rows = [row({ Qty: '100', ActRm: '2' }), row({ Rowid: 2, Matnr: 'FG2', Qty: '300', ActRm: '4' })];
    const with_ = summarySheet(rows, true);
    expect(with_.count).toBe(3);
    expect(String(cell(with_, 'Finished good', 2))).toMatch(/Selection total/);
    expect(cell(with_, 'Quantity', 2)).toBe(400);
    expect(cell(with_, 'Actual RM / unit', 2)).toBe(3.5);
    expect(summarySheet(rows, false).count).toBe(2);
  });
  it('Comparison, Components and Documents sheets hold only what was loaded', () => {
    const cr = { Rowid: 1, Matnr: 'FG1', Maktx: 'x', Werks: 'UN13', Grp: 'RM', Src: 'SEL', ActPu: '4.7', SrcPu: '7.1', VarAbs: '-2.4', VarPct: '-33.5', Flag: 'H', Dir: '-', NComp: 51, NRated: 51, CoverPct: '100' } as WacCompareRow;
    const c = comparisonSheet([cr]);
    expect(c.name).toBe('Comparison');
    expect(c.cols.find((x) => x.header === 'Variance %')!.get(0)).toBe(-33.5);
    expect(comparisonSheet([]).count).toBe(0);
    const comp = componentsSheet([{ Rowid: 1, Matnr: 'FG1', Werks: 'UN13', Idnrk: 'C1', CompTxt: 't', Mtart: 'ROH', Grp: 'RM', SrcSel: 'INFOREC', Uom: 'KG', QtyPu: '1.01', RateSel: '0.39', RateCmap: '0.39', RateCon: '0.39', RateAvg: '0', CostSel: '0.3939', CostCmap: '0.3939', CostCon: '0.3939', CostAvg: '0', VarpCmap: '0', VarpCon: '0', VarpAvg: '0', Flag: '' } as WacCompRow]);
    expect(comp.name).toBe('Components');
    expect(comp.cols.find((x) => x.header === 'Qty / unit')!.get(0)).toBe(1.01);
    const doc = documentsSheet([{ Rowid: 1, Mblnr: '5005925215', Mjahr: '2026', Werks: 'UN13', Matnr: 'FG1', Charg: 'KU0010', Budat: '2026-09-02', Aufnr: '1', Via: 'PROD_ORDER', Qty: '-30', Uom: 'PC', Hwaer: 'INR', FxInr: '1', Rm: '0', Pm: '0', Perf: '0', Conv: '0', Landed: '0', Rows: 2 } as WacDocRow]);
    expect(doc.name).toBe('Documents');
    expect(doc.cols.find((x) => x.header.startsWith('Quantity'))!.get(0)).toBe(-30);
    expect(doc.cols.find((x) => x.header === 'Material document')!.get(0)).toBe('5005925215/2026');
  });
});
