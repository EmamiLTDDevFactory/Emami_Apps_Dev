import { describe, expect, it } from 'vitest';
import { areaId, areaSelection, groupBySegment, hasAmount, lineState, neverCountedAuarts, pricingLinesOf, procSteps, proceduresIn, priceKey, rowWarnings, segmentOptions, selectedAreaIds, valuesOfKind } from '@/lib/so/view';
import type { SoAreaRow, SoCondRow, SoFilterRow, SoPriceRow, SoPricingRow, SoProcRow } from '@/lib/so/types';

const price = (p: Partial<SoPriceRow> = {}): SoPriceRow => ({
  Matnr: 'M1', Maktx: 'Oil', Vkorg: '1000', Vtweg: '10', Auart: 'ZOD1', AuartTxt: 'Domestic', Segment: 'DOM', SegTxt: 'Domestic', Kalsm: 'ZSDP01', KalsmTxt: 'Std pricing', Curr: 'INR', Uom: 'PC', Werks: '',
  Mrp: '175', Sp: '149', NetPrice: '148', SpCond: 'ZP12', Vbeln: '0000012345', Posnr: '000010', Kunnr: '1000123', Audat: '2026-10-20', DaysOld: 11, NOrders: 4, NSkip: 0, Src: 'O', Msg: '', ...p,
});
const cond = (p: Partial<SoCondRow> = {}): SoCondRow => ({ Vkorg: '1000', Vtweg: '10', Auart: 'ZOD1', Kalsm: 'ZSDP01', OrgTxt: '', ChnTxt: '', KschlSp: 'ZP12', SpTxt: '', KschlMrp: 'ZMRP', MrpTxt: '', SpBasis: '', SpAbs: '', Fallback: '', Segment: 'DOM', SegTxt: 'Domestic', Excl: false, Text: '', ChBy: '', ...p });
const area = (v: string, c: string): SoAreaRow => ({ Vkorg: v, Vtweg: c, OrgTxt: '', ChnTxt: '', Curr: 'INR', NOrders: 1, LastDate: null });
const line = (p: Partial<SoPricingRow> = {}): SoPricingRow => ({ Vbeln: '0000012345', Posnr: '000010', Matnr: 'M1', Vkorg: '1000', Vtweg: '10', Auart: 'ZOD1', Stunr: '010', Zaehk: '01', Kschl: 'ZP12', Txt: 'Selling price', Kbetr: '149', Kpein: '1', Kmein: 'PC', Kwert: '149', Waers: 'INR', Kstat: false, Kinak: '', Role: '', ...p });

describe('warnings of a price row', () => {
  it('a normal row has none', () => expect(rowWarnings(price())).toEqual([]));
  it('Sp = 0 with a message means no usable order (and shows SAP\'s message)', () => {
    const w = rowWarnings(price({ Sp: '0', Mrp: '0', Msg: 'No sales order found' }));
    expect(w.map((x) => x.key)).toEqual(['nosp', 'mrp0']);
    expect(w[0].detail).toBe('No sales order found');
  });
  it('Sp = 0 without a message is its own warning', () => expect(rowWarnings(price({ Sp: '0.0000' })).map((x) => x.key)).toEqual(['sp0']));
  it('MRP = 0 or blank', () => {
    expect(rowWarnings(price({ Mrp: '0' })).map((x) => x.key)).toEqual(['mrp0']);
    expect(rowWarnings(price({ Mrp: '' })).map((x) => x.key)).toEqual(['mrp0']);
  });
  it('stale: DaysOld above the limit (default 60, from SO_STALE_DAYS), exactly at the limit is fine', () => {
    expect(rowWarnings(price({ DaysOld: 61 })).map((x) => x.key)).toEqual(['stale']);
    expect(rowWarnings(price({ DaysOld: 60 }))).toEqual([]);
    expect(rowWarnings(price({ DaysOld: 31 }), 30).map((x) => x.key)).toEqual(['stale']);
  });
  it('skipped orders: NSkip above 0', () => {
    const w = rowWarnings(price({ NSkip: 2 }));
    expect(w.map((x) => x.key)).toEqual(['skip']);
    expect(w[0].label).toMatch(/2 orders skipped/);
    expect(rowWarnings(price({ NSkip: 1 }))[0].label).toMatch(/1 order skipped/);
  });
  it('several at once', () => expect(rowWarnings(price({ DaysOld: 90, NSkip: 1, Mrp: '0' })).map((x) => x.key)).toEqual(['mrp0', 'stale', 'skip']));
  it('an amount is n/a unless SAP has one (not blank, not 0)', () => {
    expect(hasAmount('149')).toBe(true);
    expect(hasAmount('0.0000')).toBe(false);
    expect(hasAmount('')).toBe(false);
  });
});

describe('grouping and lists', () => {
  it('rows are grouped by segment (labels sorted, "No segment" last) and ordered inside', () => {
    const rows = [price({ Matnr: 'B', Segment: 'MT', SegTxt: 'Modern trade' }), price({ Matnr: 'A', Segment: '', SegTxt: '' }), price({ Matnr: 'C' }), price({ Matnr: 'A', Segment: 'DOM', Vtweg: '20' }), price({ Matnr: 'A' })];
    const g = groupBySegment(rows);
    expect(g.map((x) => x.label)).toEqual(['DOM - Domestic', 'MT - Modern trade', 'No segment']);
    expect(g[0].rows.map((r) => `${r.Matnr}/${r.Vtweg}`)).toEqual(['A/10', 'A/20', 'C/10']);
  });
  it('a price row is identified by material, sales organisation, channel and document type', () => expect(priceKey(price())).toBe('M1|1000|10|ZOD1'));
  it('segment dropdown: distinct segments of the rules, never-counted rules hidden', () => {
    const o = segmentOptions([cond(), cond({ Auart: 'ZONL' }), cond({ Segment: 'EXP', SegTxt: 'Export' }), cond({ Segment: 'HID', SegTxt: 'Hidden', Excl: true }), cond({ Segment: '' })]);
    expect(o).toEqual([{ code: 'DOM', text: 'Domestic' }, { code: 'EXP', text: 'Export' }]);
  });
  it('document types of never-counted rules are greyed (for the chosen sales organisations)', () => {
    const conds = [cond({ Auart: 'ZRET', Excl: true }), cond({ Auart: 'ZOD1' }), cond({ Auart: 'ZMIX', Excl: true }), cond({ Auart: 'ZMIX', Excl: false }), cond({ Auart: 'ZOTH', Vkorg: '2000', Excl: true })];
    expect([...neverCountedAuarts(conds, [])].sort()).toEqual(['ZOTH', 'ZRET']);
    expect([...neverCountedAuarts(conds, ['1000'])]).toEqual(['ZRET']);
  });
  it('sales areas: VkorgIn always, VtwegIn only when a channel of a chosen organisation was left out', () => {
    const areas = [area('1000', '10'), area('1000', '20'), area('2000', '10')];
    expect(areaSelection(areas, [areaId(areas[0]), areaId(areas[1])])).toEqual({ vkorg: ['1000'], vtweg: [] });
    expect(areaSelection(areas, [areaId(areas[0])])).toEqual({ vkorg: ['1000'], vtweg: ['10'] });
    expect(areaSelection(areas, [])).toEqual({ vkorg: [], vtweg: [] });
    expect(selectedAreaIds(areas, ['1000'], [])).toEqual(['1000|10', '1000|20']);
    expect(selectedAreaIds(areas, ['1000'], ['10'])).toEqual(['1000|10']);
  });
  it('filter values of one kind, the most frequent first', () => {
    const rows: SoFilterRow[] = [{ Kind: 'AUART', Code: 'B', Txt: '', NLines: 5, NOrders: 1, SharePct: '', LastDate: null }, { Kind: 'AUART', Code: 'A', Txt: '', NLines: 9, NOrders: 1, SharePct: '', LastDate: null }, { Kind: 'PSTYV', Code: 'X', Txt: '', NLines: 99, NOrders: 1, SharePct: '', LastDate: null }];
    expect(valuesOfKind(rows, 'AUART').map((r) => r.Code)).toEqual(['A', 'B']);
  });
});

describe('pricing lines, roles and the procedure', () => {
  it('only the selected order item, in condition-screen order (step, counter)', () => {
    const lines = [line({ Stunr: '020', Kschl: 'B' }), line({ Stunr: '010', Zaehk: '02', Kschl: 'A2' }), line({ Stunr: '010', Zaehk: '01', Kschl: 'A1' }), line({ Vbeln: 'OTHER', Kschl: 'X' }), line({ Posnr: '000020', Kschl: 'Y' })];
    expect(pricingLinesOf(lines, price()).map((l) => l.Kschl)).toEqual(['A1', 'A2', 'B']);
  });
  it('inactive and statistical lines are told apart (inactive wins)', () => {
    expect(lineState(line())).toBe('normal');
    expect(lineState(line({ Kinak: 'A' }))).toBe('inactive');
    expect(lineState(line({ Kstat: true }))).toBe('statistical');
    expect(lineState(line({ Kinak: 'A', Kstat: true }))).toBe('inactive');
    // live NWP sends 'X' and 'Y' (not only the spec's 'A'): any non-blank code is inactive
    expect(lineState(line({ Kinak: 'Y', Kstat: true }))).toBe('inactive');
    expect(lineState(line({ Kinak: 'X' }))).toBe('inactive');
  });
  it('the steps of a procedure in order; the procedures present in the result', () => {
    const steps: SoProcRow[] = [{ Kalsm: 'P', KalsmTxt: '', Stunr: '020', Zaehl: '000', Kschl: 'B', Txt: '', Role: 'SP' }, { Kalsm: 'P', KalsmTxt: '', Stunr: '010', Zaehl: '000', Kschl: 'A', Txt: '', Role: 'MRP' }, { Kalsm: 'Q', KalsmTxt: '', Stunr: '005', Zaehl: '000', Kschl: 'C', Txt: '', Role: '' }];
    expect(procSteps(steps, 'P').map((s) => s.Kschl)).toEqual(['A', 'B']);
    expect(proceduresIn([price(), price({ Matnr: 'M2' }), price({ Kalsm: 'ZSDP02', KalsmTxt: 'Export' }), price({ Kalsm: '' })])).toEqual([{ kalsm: 'ZSDP01', text: 'Std pricing' }, { kalsm: 'ZSDP02', text: 'Export' }]);
  });
});
