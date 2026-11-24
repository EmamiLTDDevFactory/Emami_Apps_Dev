import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { buildCompare, varTone, type RateCosting } from '@/lib/dash/compare';
import { parseBudget, type Cdrill } from '@/lib/dash/cdrill';
import type { CdrillRow } from '@/lib/dash/types';

const D = (v: string | number) => new Decimal(v);
const trow = (o: Partial<CdrillRow>): CdrillRow => ({ Grain: 'T', Matnr: '1', Charg: 'UN13', Idnrk: '', Maktx: '', Mtart: '', Matkl: '', Cat: 'R', Meins: 'KG', Flag: '02', Msg: '', Orders: 0, SoldQty: '0', ProdQty: '0', Qty: '0', Val: '0', AvgQtyPc: '0.01', AvgCostPc: '0', RmPc: '0', PmPc: '0', PfPc: '0', OthPc: '0', ...o } as CdrillRow);
const comp = (matnr: string, cat: 'R' | 'P', costPc: string) => ({ matnr, maktx: 'x', mtart: '', matkl: '', cat, meins: 'KG', qty: D(1), val: D(1), qtyPc: D('0.01'), costPc: D(costPc), share: null });
const actual = { summary: null, batches: [], comps: { R: [comp('000000000100', 'R', '2.2'), comp('000000000200', 'R', '1')], P: [], F: [], O: [] }, costed: 1, notCosted: 0, budget: [] } as unknown as Cdrill;
const bud = parseBudget([trow({ Idnrk: '000000000100', AvgCostPc: '2' }), trow({ Idnrk: '000000000300', AvgCostPc: '0.5' })])[0];

describe('component comparison', () => {
  it('joins actual and budget on the component number and shows variance to budget', () => {
    const c = buildCompare(actual, bud, null);
    const by = Object.fromEntries(c.rows.map((r) => [r.key, r]));
    expect(String(by['100'].actVar)).toBe('0.2'); expect(by['100'].actVarPct?.toFixed(0)).toBe('10');
    expect(by['200'].budCost).toBeNull(); expect(String(by['200'].actVar)).toBe('1');          // consumed, not budgeted
    expect(String(by['300'].actVar)).toBe('-0.5');                                             // budgeted, not consumed
    expect(String(c.total.actual)).toBe('3.2'); expect(String(c.total.budget)).toBe('2.5'); expect(String(c.total.actVar)).toBe('0.7');
  });
  it('adds the rate type cost per piece and its variance', () => {
    const rate: RateCosting = { werks: 'UN13', type: 'SELECTED', priced: 1, leaves: 1, notes: [], comps: new Map([['100', { key: '100', maktx: 'x', cat: 'R', qtyPc: D('0.01'), rate: D(190), costPc: D('1.9'), src: 'CONTRACT' }]]) };
    const r = buildCompare(actual, bud, rate).rows.find((x) => x.key === '100')!;
    expect(String(r.rateCost)).toBe('1.9'); expect(String(r.rateVar)).toBe('-0.1');
  });
  it('an NBC budget leaves the budget column empty', () => {
    const nbc = parseBudget([trow({ Flag: 'NBC', Msg: 'none' })])[0];
    const c = buildCompare(actual, nbc, null);
    expect(c.total.budget.isZero()).toBe(true); expect(String(c.total.actVar)).toBe('3.2');
  });
  it('colours over budget red, under green, within half a percent neutral', () => {
    expect(varTone(D(1), D(10))).toBe('bad'); expect(varTone(D(-1), D(-10))).toBe('good'); expect(varTone(D('0.001'), D('0.2'))).toBe(''); expect(varTone(null, null)).toBe('');
  });
});
