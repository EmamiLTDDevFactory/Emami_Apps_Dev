import React from 'react';
(globalThis as unknown as { React: typeof React }).React = React;
import { renderToStaticMarkup } from 'react-dom/server';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import VarCell from '@/components/wac/VarCell';
import { COLUMNS, sortRows, visibleColumns } from '@/lib/wac/columns';
import { comparisonLimited, fmtVarPct, intersectPlants, kpis, maxAbsVariance, reconWarn, selectionTotal, sortComponents, sourceHasData, tone, toneWord } from '@/lib/wac/view';
import { nullableDecimal, normalizeWac } from '@/lib/wac/service';
import type { WacCompRow, WacRow } from '@/lib/wac/types';

const row = (p: Partial<WacRow> = {}): WacRow => ({
  Rowid: 1, Matnr: 'FG1', Maktx: 'Oil', Werks: 'UN13', Mtart: 'FERT', Zbrand: '0116', Prodha: 'P', Zskugrcodecrs: 'C1', Zskugroupcrs: 'G', Uom: 'PC', Docs: 3, Batches: 2, DupDocs: 0, Qty: '100',
  ActRm: '5', ActPm: '3', ActPerf: '1', ActMat: '9', ActConv: '2', ActLanded: '11', ActRecon: '0',
  VarpSel: '0.0000', VarpCmap: '0.0000', VarpCon: '0.0000', VarpAvg: '0.0000', FlagSel: '', FlagCmap: '', FlagCon: '', FlagAvg: '', Status: '', Msg: '', ...p,
});
const comp = (p: Partial<WacCompRow> = {}): WacCompRow => ({
  Rowid: 1, Matnr: 'FG1', Werks: 'UN13', Idnrk: 'C1', CompTxt: 'x', Mtart: 'ROH', Grp: 'RM', SrcSel: 'INFOREC', Uom: 'KG', QtyPu: '1', RateSel: '1', RateCmap: '1', RateCon: '1', RateAvg: '0',
  CostSel: '1', CostCmap: '1', CostCon: '1', CostAvg: '0', VarpCmap: '0.0000', VarpCon: '0.0000', VarpAvg: '0.0000', Flag: '', ...p,
});

describe('colours and signs', () => {
  it('flag H red, M amber, blank green; no value is n/a (grey), never green', () => {
    expect(tone('12.5', 'H')).toBe('bad');
    expect(tone('6', 'M')).toBe('warn');
    expect(tone('1.0', '')).toBe('good');
    expect(tone('0.0000', '')).toBe('good');
    expect(tone('', '')).toBe('na');
    expect(tone('', 'H')).toBe('na');
    expect(toneWord('bad')).toBe('High');
  });
  it('the sign says where actual is: + above, − below, n/a empty', () => {
    expect(fmtVarPct('4.2')).toBe('+4.2 %');
    expect(fmtVarPct('-1')).toBe('−1.0 %');
    expect(fmtVarPct('0')).toBe('0.0 %');
    expect(fmtVarPct('')).toBe('n/a');
  });
  it('the cell renders grey n/a and a word next to the colour (colour is never the only signal)', () => {
    const na = renderToStaticMarkup(React.createElement(VarCell, { value: '', flag: '' }));
    expect(na).toContain('text-faint');
    expect(na).not.toContain('text-good');
    expect(na).toContain('n/a');
    const high = renderToStaticMarkup(React.createElement(VarCell, { value: '12', flag: 'H', dir: '+' }));
    expect(high).toContain('text-bad');
    expect(high).toContain('+12.0 %');
    expect(high).toContain('High');
    expect(renderToStaticMarkup(React.createElement(VarCell, { value: '3', flag: '' }))).toContain('text-good');
  });
});

describe('source columns', () => {
  it('hidden when the comparison is off (SAP sends 0.0000 everywhere)', () => {
    expect(sourceHasData([row({ VarpSel: '5', FlagSel: 'M' })], 'Sel', false)).toBe(false);
  });
  it('the Average column stays hidden until some row has a flag or a non-zero variance', () => {
    const rows = [row({ VarpSel: '4.2', VarpCmap: '-1', VarpCon: '11', FlagCon: 'H' })];
    expect(sourceHasData(rows, 'Sel', true)).toBe(true);
    expect(sourceHasData(rows, 'Con', true)).toBe(true);
    expect(sourceHasData(rows, 'Avg', true)).toBe(false);
    const keys = visibleColumns(rows, new Set(), true).map((c) => c.key);
    expect(keys).toContain('vSel');
    expect(keys).not.toContain('vAvg');
    expect(visibleColumns([...rows, row({ Rowid: 2, VarpAvg: '-6', FlagAvg: 'M' })], new Set(), true).map((c) => c.key)).toContain('vAvg');
    expect(visibleColumns(rows, new Set(), false).map((c) => c.key).some((k) => k.startsWith('v'))).toBe(false);
  });
  it('the chooser hides columns', () => {
    expect(visibleColumns([row()], new Set(['brand', 'docs']), false).map((c) => c.key)).not.toContain('brand');
  });
});

describe('selection total', () => {
  it('quantity-weighted mean with decimal.js (no float drift)', () => {
    const t = selectionTotal([row({ Qty: '100', ActRm: '0.1', ActMat: '0.1' }), row({ Rowid: 2, Matnr: 'FG2', Qty: '200', ActRm: '0.2', ActMat: '0.2' })])!;
    expect(t.qty).toBe('300');
    expect(new Decimal(t.rm).minus('0.16666666666666667').abs().lt('1e-15')).toBe(true);
    const exact = selectionTotal([row({ Qty: '1', ActRm: '0.1' }), row({ Rowid: 2, Qty: '1', ActRm: '0.2' })])!;
    expect(exact.rm).toBe('0.15');
  });
  it('shown only when every displayed row has the same unit', () => {
    expect(selectionTotal([row(), row({ Rowid: 2, Uom: 'KG' })])).toBeNull();
    expect(selectionTotal([row(), row({ Rowid: 2 })])?.uom).toBe('PC');
  });
  it('none for no rows or zero quantity', () => {
    expect(selectionTotal([])).toBeNull();
    expect(selectionTotal([row({ Qty: '0' })])).toBeNull();
  });
});

describe('sorting', () => {
  const rows = [row({ Rowid: 1, Matnr: 'B', ActMat: '9', VarpSel: '2' }), row({ Rowid: 2, Matnr: 'A', ActMat: '12', VarpSel: '-7' }), row({ Rowid: 3, Matnr: 'C', ActMat: '3', VarpSel: '' })];
  it('numeric and text columns, both directions', () => {
    expect(sortRows(rows, 'fg', 'asc').map((r) => r.Matnr)).toEqual(['A', 'B', 'C']);
    expect(sortRows(rows, 'mat', 'desc').map((r) => r.Matnr)).toEqual(['A', 'B', 'C']);
    expect(sortRows(rows, 'mat', 'asc').map((r) => r.Matnr)).toEqual(['C', 'B', 'A']);
  });
  it('an empty value sorts last in either direction', () => {
    expect(sortRows(rows, 'vSel', 'asc').map((r) => r.Matnr)).toEqual(['A', 'B', 'C']);
    expect(sortRows(rows, 'vSel', 'desc').map((r) => r.Matnr)).toEqual(['B', 'A', 'C']);
  });
  it('does not mutate its input and every column has a sorter', () => {
    const copy = [...rows];
    sortRows(rows, 'qty', 'asc');
    expect(rows).toEqual(copy);
    for (const c of COLUMNS) expect(() => sortRows(rows, c.key, 'asc')).not.toThrow();
  });
  it('components: largest absolute variance first, none last', () => {
    const list = [comp({ Rowid: 1, Idnrk: 'A', VarpCmap: '2' }), comp({ Rowid: 2, Idnrk: 'B', VarpCon: '-15' }), comp({ Rowid: 3, Idnrk: 'C', VarpAvg: '7', VarpCmap: '1' }), comp({ Rowid: 4, Idnrk: 'D', VarpCmap: '', VarpCon: '', VarpAvg: '' })];
    expect(sortComponents(list).map((c) => c.Idnrk)).toEqual(['B', 'C', 'A', 'D']);
    expect(maxAbsVariance(list[3])).toBeNull();
  });
});

describe('counts and data quality', () => {
  it('KPIs come from the SAP flags', () => {
    const k = kpis([row({ FlagSel: 'H', Docs: 4 }), row({ Rowid: 2, Matnr: 'FG2', FlagCon: 'M', Status: 'D' }), row({ Rowid: 3, Matnr: 'FG3', FlagCon: 'M', FlagSel: 'H', Werks: 'UB01' }), row({ Rowid: 4, Matnr: 'FG4' })]);
    expect(k).toMatchObject({ fgs: 4, plants: 2, docs: 13, batches: 8, dupRows: 1, red: 2, amber: 1 });
  });
  it('reconciliation warning above the percentage of landed cost', () => {
    expect(reconWarn(row({ ActRecon: '0.5', ActLanded: '11' }), 2)).toBe(true);
    expect(reconWarn(row({ ActRecon: '0.1', ActLanded: '11' }), 2)).toBe(false);
    expect(reconWarn(row({ ActRecon: '-3', ActLanded: '100' }), 2)).toBe(true);
    expect(reconWarn(row({ ActRecon: '5', ActLanded: '0' }), 2)).toBe(false);
  });
  it('plants are intersected with the plants SAP lists for the person', () => {
    expect(intersectPlants(['UN13', 'XX99', 'ub01'], ['UN13', 'UB01', 'UN14'])).toEqual(['UN13', 'ub01']);
    expect(intersectPlants(['XX99'], ['UN13'])).toEqual([]);
  });
  it('the 25-finished-good limit: from SAP\'s message, or from a large empty comparison when the header is missing', () => {
    expect(comparisonLimited([{ code: '', message: 'The comparison runs for 25 finished goods at most', severity: 'warning' }], [row()], true)).toBe(true);
    expect(comparisonLimited([], [row()], true)).toBe(false);
    expect(comparisonLimited([], Array.from({ length: 26 }, (_, i) => row({ Rowid: i, Matnr: `F${i}` })), true)).toBe(true);
    expect(comparisonLimited([], Array.from({ length: 26 }, (_, i) => row({ Rowid: i, Matnr: `F${i}` })), false)).toBe(false);
  });
});

describe('normalising what SAP sends', () => {
  it('keeps the real key, canonicalises numbers and flags', () => {
    expect(nullableDecimal('')).toBe('');
    expect(nullableDecimal(' 12.5000 ')).toBe('12.5');
    expect(nullableDecimal('3.2-')).toBe('-3.2');
    expect(nullableDecimal('abc')).toBe('');
    const r = normalizeWac('ROWS', { Rowid: 7, Matnr: 'M', Qty: '162258.000', ActRm: '4.758820', VarpSel: '89.3714', FlagSel: ' h ', FlagCmap: 'X', Docs: 22, Status: 'D' });
    expect(r.Rowid).toBe(7);
    expect(r.Qty).toBe('162258');
    expect(r.VarpSel).toBe('89.3714');
    expect(r.FlagSel).toBe('H');
    expect(r.FlagCmap).toBe('');
    const c = normalizeWac('COMPARE', { Rowid: 1, Dir: '-', Flag: 'M', ActPu: '4.7', NComp: 51, NRated: 51, CoverPct: '100.0000' });
    expect(c.Dir).toBe('-');
    expect(c.Flag).toBe('M');
    expect(c.NComp).toBe(51);
  });
});
