import { describe, expect, it } from 'vitest';
import { COLUMNS, NO_FILTERS, costSplit, countBy, defaultHidden, detailQuery, directionOf, filterRows, hasSplit, headerGroups, historyQuery, noEffect, noEffectReason, rowKey, rowNote, scenarioCells, severityOf, sortRows, varianceCells } from '@/lib/margin/boardView';
import { boardSheet } from '@/lib/margin/boardExport';
import { buildMarginFilter } from '@/lib/margin/filter';
import type { MarginRow } from '@/lib/margin/types';

const row = (p: Partial<MarginRow> = {}): MarginRow => ({
  Matnr: '400000001', Maktx: 'FG ONE', Werks: 'UB01', Market: 'IN', Channel: '10', Prodha: 'P1', Brand: 'B1', Curr: 'INR', Uom: 'PC', SellUom: 'PC', Mrp: '100', SellPrice: '80', PriceFrom: '', PriceSrc: '',
  CogmStd: '50', CogmAct: '52', CogmBud: '48', CogmCur: '55', OkStd: true, OkAct: true, OkBud: true, OkCur: true,
  StdRm: '30', StdPm: '15', StdPerf: '2', StdConv: '3', StdOth: '', CurRm: '33', CurPm: '16', CurPerf: '2', CurConv: '4', CurOth: '',
  RatioStd: '62.5', RatioAct: '65', RatioBud: '60', RatioCur: '68.75', RemainStd: '30', RemainAct: '28', RemainBud: '32', RemainCur: '25',
  VarCurStd: '5', VarpCurStd: '10', VarCurAct: '3', VarpCurAct: '5.8', VarCurBud: '7', VarpCurBud: '14.6', Erosion: '5', ErosionPct: '6.25', AnnualImpact: '5000', AnnualImpactInr: '5000', ReqSpRestore: '85', ReqMrpRestore: '106', SpRisePct: '6.25', ReqSpRatio: '', ReqSpRemain: '', VolumeYr: '1000',
  AlertCnt: 0, AlertSev: '', AlertTxt: '', Status: '', Msg: '', Src: '', ...p,
});

describe('n/a rules', () => {
  it('a scenario SAP does not mark OK is n/a as a whole, even when it holds a number', () => {
    const c = scenarioCells(row({ OkAct: false, CogmAct: '0', RatioAct: '0', RemainAct: '0' }), 'ACT');
    expect(c).toEqual({ ok: false, cogm: '', ratio: '', remain: '' });
    expect(scenarioCells(row(), 'STD')).toMatchObject({ ok: true, cogm: '50', ratio: '62.5', remain: '30' });
  });
  it('variance needs the current and the compared scenario to be OK', () => {
    expect(varianceCells(row(), 'STD')).toEqual({ abs: '5', pct: '10' });
    expect(varianceCells(row({ OkCur: false }), 'STD')).toEqual({ abs: '', pct: '' });
    expect(varianceCells(row({ OkBud: false }), 'BUD')).toEqual({ abs: '', pct: '' });
  });
  it('direction words: positive annual impact = loss, negative = saving, nothing from SAP = n/a (never zero)', () => {
    expect(directionOf('5000')).toBe('up'); expect(directionOf('-10')).toBe('down'); expect(directionOf('0')).toBe('none'); expect(directionOf('')).toBe('na');
  });
  it('a row note joins the status word and SAP message', () => {
    expect(rowNote({ Status: 'P', Msg: 'No price maintained' })).toBe('No price: No price maintained');
    expect(rowNote({ Status: '', Msg: '' })).toBe('');
  });
});

describe('sorting, filtering, columns', () => {
  const rows = [row({ Matnr: 'A', AnnualImpactInr: '100' }), row({ Matnr: 'B', AnnualImpactInr: '-500' }), row({ Matnr: 'C', AnnualImpactInr: '' }), row({ Matnr: 'D', AnnualImpactInr: '900', AlertSev: 'H', AlertCnt: 2 }), row({ Matnr: 'E', Status: 'P', Msg: 'no price' })];
  it('sorts by SAP numbers; n/a sorts last in both directions', () => {
    // E keeps the fixture default of 5000, so it is the largest; C has no value (n/a) and goes last
    expect(sortRows(rows, 'annual', 'desc').map((r) => r.Matnr)).toEqual(['E', 'D', 'A', 'B', 'C']);
    expect(sortRows(rows, 'annual', 'asc').map((r) => r.Matnr).slice(-1)).toEqual(['C']);
    expect(sortRows(rows, 'fg', 'asc').map((r) => r.Matnr)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
  it('filters by alert severity, status and search', () => {
    expect(filterRows(rows, { ...NO_FILTERS, severity: 'H' }).map((r) => r.Matnr)).toEqual(['D']);
    expect(filterRows(rows, { ...NO_FILTERS, severity: 'none' })).toHaveLength(4);
    expect(filterRows(rows, { ...NO_FILTERS, status: 'P' }).map((r) => r.Matnr)).toEqual(['E']);
    expect(filterRows(rows, { ...NO_FILTERS, status: 'ok' })).toHaveLength(4);
    expect(filterRows(rows, { ...NO_FILTERS, search: 'no price' }).map((r) => r.Matnr)).toEqual(['E']);
    expect(severityOf(row({ AlertSev: 'M' }))).toBe('M');
  });
  it('counts are row counts only', () => {
    expect(countBy(rows)).toMatchObject({ total: 5, high: 1, noPrice: 1 });
  });
  it('columns: unique keys, the finished good always, groups in header order', () => {
    expect(new Set(COLUMNS.map((c) => c.key)).size).toBe(COLUMNS.length);
    expect(defaultHidden().has('fg')).toBe(false);
    expect(headerGroups(COLUMNS.filter((c) => !defaultHidden().has(c.key))).map((g) => g.group)).toEqual(['Finished good', 'Price', 'Standard', 'Actual', 'Budget', 'Current', 'Variance', 'Erosion and impact', 'Restore', 'Alert']);
    expect(rowKey(row())).toBe('400000001|UB01|IN|10');
  });
});

describe('row details', () => {
  const q = { materials: ['A', 'B'], plants: ['UB01'], source: 'L' as const, inclFrt: true, priceSrc: '' as const, prodha: 'P' };
  it('uploaded prices: market and channel go back as they are; the filter is valid for the live sets', () => {
    const d = detailQuery(q, row());
    expect(d).toMatchObject({ materials: ['400000001'], plants: ['UB01'], market: 'IN', channel: '10', prodha: '' });
    expect(buildMarginFilter(d, 'DRIVER')).toContain("Market eq 'IN'");
  });
  it('order prices: Market is the sales org and Channel "10/ZOD1" splits into channel and document type', () => {
    const d = detailQuery({ ...q, priceSrc: 'O', soDays: 90 }, row({ Market: 'EM01', Channel: '10/ZOD1' }));
    expect(d).toMatchObject({ market: '', channel: '', vkorg: ['EM01'], vtweg: ['10'], auart: { in: ['ZOD1'], ex: [] } });
    const f = buildMarginFilter(d, 'ALERT');
    expect(f).toContain("VkorgIn eq 'EM01'"); expect(f).toContain("AuartIn eq 'ZOD1'");
  });
  it('history is read by finished good, plant, market, channel and days', () => {
    expect(buildMarginFilter(historyQuery(row(), 180), 'HISTORY')).toBe("Matnr eq '400000001' and Werks eq 'UB01' and Market eq 'IN' and Channel eq '10' and DaysBack eq 180");
  });
  it('cost split keeps what SAP sent; "no price effect" for a driver without a standard price or rate', () => {
    expect(hasSplit(row())).toBe(true); expect(hasSplit(row({ StdRm: '', StdPm: '', StdPerf: '', StdConv: '', CurRm: '', CurPm: '', CurPerf: '', CurConv: '' }))).toBe(false);
    expect(costSplit(row()).find((p) => p.key === 'Oth')).toMatchObject({ std: '', cur: '' });
    expect(noEffect({ NoStd: true, NoRate: false })).toBe(true); expect(noEffect({ NoStd: false, NoRate: false })).toBe(false);
    expect(noEffectReason({ NoStd: true, NoRate: true })).toBe('no standard price and no rate');
  });
});

describe('Excel', () => {
  it('has the sheet name, the column headers and n/a for a scenario that is not OK', () => {
    const rows = [row(), row({ Matnr: 'X', OkAct: false })];
    const s = boardSheet(rows);
    expect(s.name).toBe('Margin board'); expect(s.count).toBe(2);
    const h = s.cols.map((c) => c.header);
    for (const w of ['Finished good', 'Selling price', 'Standard COGM', 'Actual COGM', 'Budget COGM', 'Current COGM', 'Current amount remaining after manufacturing cost', 'Annual impact INR', 'Selling price that restores the standard', 'Status', 'Note']) expect(h).toContain(w);
    const col = (name: string) => s.cols.find((c) => c.header === name)!;
    expect(col('Actual COGM').get(0)).toBe(52); expect(col('Actual COGM').get(1)).toBe('n/a');
    expect(col('Annual impact reading').get(0)).toBe('Loss');
    expect(h.join(' ')).not.toMatch(/profit/i);
  });
});
