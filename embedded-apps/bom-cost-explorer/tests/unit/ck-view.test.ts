import { describe, expect, it } from 'vitest';
import {
  OTH_COLOR, breadcrumb, compareEstimates, currentMaterial, decodeStack, defaultEstimate, encodeStack, filterItems, groupColor, itemTypes, keyFromRow, partComps, popStack, pushStack,
  sameKey, sapKeyText, sortComps, statusTone, stdCheck,
} from '@/lib/ck/view';
import { ckSearch, parseCkUrl } from '@/lib/ck/url';
import type { CkCompRow, CkHeaderRow, CkItemRow, CkListRow } from '@/lib/ck/types';

const comp = (p: Partial<CkCompRow> = {}): CkCompRow => ({ CompNo: '100', CompTxt: 'Raw material', Grp: 'RM', Seq: 1, Total: '10', SharePct: '50', Curr: 'INR', IsSum: false, IsMemo: false, ...p });
const est = (p: Partial<CkListRow> = {}): CkListRow => ({ Matnr: 'M', Maktx: 'x', Werks: 'UN13', Kalnr: '1', Kadky: '2026-10-01', Tvers: '01', Bwvar: 'ZUV', Kkzma: '', Klvar: 'PPC1', Status: 'FR', StatusTxt: 'Released', CurStd: false, Kadat: null, Bidat: null, Losgr: '1000', Meeht: 'PC', Total: '12', StdPrice: '12', Curr: 'INR', Ernam: 'U', Erdat: null, ...p });
const item = (p: Partial<CkItemRow> = {}): CkItemRow => ({ Posnr: '0001', Typps: 'M', TyppsTxt: 'Material', Kstar: '400000', KstarTxt: 'RM consumption', Idnrk: '1001', ItemTxt: 'Oil', Mtart: 'ROH', ItemWerks: 'UN13', Kostl: '', Lstar: '', Qty: '2', Uom: 'KG', QtyUnit: 'KG', Price: '5', PriceUnit: '1', ValueLot: '10', ValueUnit: '1', Curr: 'INR', HasEst: false, ...p });

describe('status chips come from SAP\'s text, not from codes', () => {
  it('released green, marked blue, anything else grey', () => {
    expect(statusTone('Released')).toBe('good');
    expect(statusTone('Freigegeben (released)')).toBe('good');
    expect(statusTone('Marked')).toBe('info');
    expect(statusTone('Marked for release')).toBe('info');
    expect(statusTone('Costed')).toBe('neutral');
    expect(statusTone('')).toBe('neutral');
  });
  it('the same code with another text gets another tone (no code is hard-coded)', () => {
    expect(statusTone('Released')).not.toBe(statusTone('Previous'));
  });
});

describe('group colours', () => {
  it('stable per code, OTH grey, different codes differ', () => {
    expect(groupColor('RM')).toBe(groupColor('RM'));
    expect(groupColor('rm')).toBe(groupColor('RM'));
    expect(groupColor('OTH')).toBe(OTH_COLOR);
    expect(groupColor('')).toBe(OTH_COLOR);
    const set = new Set(['RM', 'PM', 'CONV', 'OVH'].map(groupColor));
    expect(set.size).toBe(4);
    expect(groupColor('RM')).toMatch(/^hsl\(\d+ 55% 42%\)$/);
  });
  it('components keep SAP\'s order; the total row is left out of the chart parts', () => {
    const rows = [comp({ Seq: 3, CompNo: 'C' }), comp({ Seq: 1, CompNo: 'A' }), comp({ Seq: 9, CompNo: 'S', Grp: 'SUM', IsSum: true }), comp({ Seq: 2, CompNo: 'B' })];
    expect(sortComps(rows).map((r) => r.CompNo)).toEqual(['A', 'B', 'C', 'S']);
    expect(partComps(rows).map((r) => r.CompNo)).toEqual(['A', 'B', 'C']);
  });
});

describe('header card: difference to the material master', () => {
  it('green below 0.5 %, amber from 0.5 %, n/a when SAP sent nothing', () => {
    expect(stdCheck({ StdDiffPct: '0.4999' }).state).toBe('ok');
    expect(stdCheck({ StdDiffPct: '-0.2' }).state).toBe('ok');
    expect(stdCheck({ StdDiffPct: '0' }).state).toBe('ok');
    expect(stdCheck({ StdDiffPct: '0.5', Msg: 'Components do not reproduce the price' }).state).toBe('note');
    expect(stdCheck({ StdDiffPct: '-3.2', Msg: 'Components do not reproduce the price' }).state).toBe('note');
    expect(stdCheck({ StdDiffPct: '' }).state).toBe('na');
    expect(stdCheck({ StdDiffPct: '' }).pct).toBeNull();
  });
});

describe('estimates', () => {
  it('key from a list row, default = the current standard, else the first', () => {
    const rows = [est({ Kalnr: '1' }), est({ Kalnr: '2', CurStd: true })];
    expect(keyFromRow(rows[1])).toEqual({ kalnr: '2', kadky: '2026-10-01', tvers: '01', bwvar: 'ZUV', kkzma: undefined });
    expect(defaultEstimate(rows)?.Kalnr).toBe('2');
    expect(defaultEstimate([est({ Kalnr: '9' })])?.Kalnr).toBe('9');
    expect(defaultEstimate([])).toBeNull();
    expect(keyFromRow(est({ Kalnr: '', Kadky: null }))).toBeNull();
    expect(sameKey(keyFromRow(rows[0]), keyFromRow(rows[0]))).toBe(true);
    expect(sameKey(keyFromRow(rows[0]), keyFromRow(rows[1]))).toBe(false);
    expect(sameKey(null, keyFromRow(rows[0]))).toBe(false);
  });
  it('compare: difference B - A with decimal.js (no float drift), labelled computed here in the UI', () => {
    const a = [comp({ CompNo: '1', Total: '0.1' }), comp({ CompNo: '2', CompTxt: 'Pack', Grp: 'PM', Seq: 2, Total: '5' })];
    const b = [comp({ CompNo: '1', Total: '0.3' }), comp({ CompNo: '2', CompTxt: 'Pack', Grp: 'PM', Seq: 2, Total: '4.5' })];
    const r = compareEstimates(a, b);
    expect(r.map((x) => x.diff)).toEqual(['0.2', '-0.5']);
  });
  it('a component on one side only has no difference; a different currency is never converted', () => {
    const r = compareEstimates([comp({ CompNo: '1' }), comp({ CompNo: '3', Seq: 3, Total: '2', Curr: 'INR' })], [comp({ CompNo: '1', Total: '12' }), comp({ CompNo: '3', Seq: 3, Total: '2', Curr: 'USD' }), comp({ CompNo: '4', Seq: 4, Total: '1' })]);
    expect(r.find((x) => x.CompNo === '1')!.diff).toBe('2');
    expect(r.find((x) => x.CompNo === '3')!.diff).toBeNull();
    expect(r.find((x) => x.CompNo === '4')).toMatchObject({ a: null, diff: null });
  });
  it('compare keeps SAP\'s order and the total row apart from a component with the same number', () => {
    const r = compareEstimates([comp({ CompNo: 'S', Grp: 'SUM', IsSum: true, Seq: 9, Total: '15' }), comp({ CompNo: 'S', Seq: 4, Total: '1' })], [comp({ CompNo: 'S', Grp: 'SUM', IsSum: true, Seq: 9, Total: '16' })]);
    expect(r).toHaveLength(2);
    expect(r[0].IsSum).toBe(false);
    expect(r[1]).toMatchObject({ IsSum: true, diff: '1' });
  });
  it('an empty amount is "no value", not 0', () => {
    expect(compareEstimates([comp({ Total: '' })], [comp({ Total: '3' })])[0]).toMatchObject({ a: null, diff: null });
  });
});

describe('itemization', () => {
  const items = [item({ Posnr: '1', Typps: 'M', TyppsTxt: 'Material' }), item({ Posnr: '2', Typps: 'E', TyppsTxt: 'Activity', Idnrk: '', Lstar: 'MACH', ItemTxt: 'Machine hours' }), item({ Posnr: '3', Typps: 'M', Idnrk: '1002', HasEst: true, ItemTxt: 'Semi' })];
  it('item types with counts, filter by type and by search', () => {
    expect(itemTypes(items)).toEqual([{ code: 'M', text: 'Material', n: 2 }, { code: 'E', text: 'Activity', n: 1 }]);
    expect(filterItems(items, new Set(['E']), '').map((r) => r.Posnr)).toEqual(['2']);
    expect(filterItems(items, new Set(), 'machine').map((r) => r.Posnr)).toEqual(['2']);
    expect(filterItems(items, new Set(['M']), '1002').map((r) => r.Posnr)).toEqual(['3']);
    expect(filterItems(items, new Set(), '')).toHaveLength(3);
  });
});

describe('drill-down breadcrumb stack and the URL', () => {
  it('push, pop, current material and path', () => {
    let s: string[] = [];
    s = pushStack(s, '1002');
    s = pushStack(s, '1003');
    expect(s).toEqual(['1002', '1003']);
    expect(currentMaterial('ROOT', s)).toBe('1003');
    expect(breadcrumb('ROOT', s)).toEqual(['ROOT', '1002', '1003']);
    s = popStack(s);
    expect(currentMaterial('ROOT', s)).toBe('1002');
    s = popStack(popStack(s));
    expect(s).toEqual([]);
    expect(currentMaterial('ROOT', s)).toBe('ROOT');
  });
  it('the same material is not pushed twice in a row; the input is not mutated', () => {
    const s = ['A'];
    expect(pushStack(s, 'A')).toEqual(['A']);
    expect(pushStack(s, '')).toEqual(['A']);
    pushStack(s, 'B');
    expect(s).toEqual(['A']);
  });
  it('encode / decode round-trip', () => {
    expect(encodeStack(['A', 'B'])).toBe('A,B');
    expect(decodeStack('A,B')).toEqual(['A', 'B']);
    expect(decodeStack(' A ; B ')).toEqual(['A', 'B']);
    expect(decodeStack('')).toEqual([]);
    expect(decodeStack(null)).toEqual([]);
  });
  it('the URL round-trips, keeps other params (?pc=) and drops empty ones', () => {
    const s = ckSearch('?pc=%7B%22on%22%3A1%7D', { mat: '200001300', plant: 'UN13', klvar: 'PPC1', tvers: '01', stack: ['1002', '1003'] });
    expect(s).toContain('pc=');
    expect(parseCkUrl(s)).toEqual({ mat: '200001300', plant: 'UN13', klvar: 'PPC1', tvers: '01', stack: ['1002', '1003'] });
    expect(s).toContain('stack=1002,1003');
    expect(ckSearch('?mat=A&plant=UN13&stack=X', { mat: '', plant: '', klvar: '', tvers: '', stack: [] })).toBe('');
    expect(parseCkUrl('?plant=un13')).toEqual({ plant: 'UN13' });
  });
});

describe('Copy for SAP', () => {
  it('lists the CK13N key values', () => {
    const h = { Matnr: 'M', Werks: 'UN13', Klvar: 'PPC1', Tvers: '01', Bwvar: 'ZUV', Kadat: '2026-10-01', Bidat: '2026-12-31', Losgr: '1000', Meeht: 'PC', Kalnr: '000012345678', Kadky: '2026-10-01', Kkzma: '', StatusTxt: 'Released', Status: 'FR' } as CkHeaderRow;
    const t = sapKeyText(h, (d) => d ?? '');
    expect(t).toContain('Material: M');
    expect(t).toContain('Plant: UN13');
    expect(t).toContain('Costing variant: PPC1');
    expect(t).toContain('Costing lot size: 1000 PC');
    expect(t).toContain('Cost estimate number (Kalnr): 000012345678');
    expect(t).toContain('Costing type (Kkzma): -');
  });
});
