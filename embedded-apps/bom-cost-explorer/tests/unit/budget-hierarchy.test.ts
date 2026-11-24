import { describe, expect, it } from 'vitest';
import { latestFgs, rollup, materialHierRequest, lastYearAverages, previousFiscalYear, type HierNames } from '@/lib/budget/hierarchy';
import type { WacRow } from '@/lib/wac/types';
import type { BudgetSummaryRow } from '@/lib/budget/types';

const row = (o: Partial<BudgetSummaryRow>) => ({ Matnr: '400000001', Zskugrcodecrs: 'CRS1', Werks: 'UN13', MtartFg: 'FERT', Zscheme: '0', Year: '2026', CostPerpc1: '10', PCostPerpc1: '10', ACostPerpc1: '0', RmCost: '4', PmCost: '5', PerfumeCost: '1', PlanQty: '100', PlanCost: '1000', ...o }) as unknown as BudgetSummaryRow;
const names: HierNames = { B: new Map([['220316', 'XS']]), P: new Map([['2203161102', 'Energy drink']]), C: new Map([['2203161102147', '250 ML']]) };
const map = new Map([['400000001', { brand: '220316', product: '2203161102', sku: '2203161102147' }], ['400000002', { brand: '220316', product: '2203161102', sku: '2203161102147' }], ['400000003', { brand: '220316', product: '2203161102', sku: '2203161102147' }]]);

describe('budget by brand / product / SKU', () => {
  it('keeps the latest (highest) FG code of one CRS SKU + plant + type + scheme + year', () => {
    const l = latestFgs([row({ Matnr: '400000001' }), row({ Matnr: '400000002' }), row({ Matnr: '400000003', Zscheme: '1' })]);
    expect(l.map((r) => r.Matnr).sort()).toEqual(['400000002', '400000003']);
  });
  it('averages are simple averages of those FGs; plan qty and plan cost are totals; names come from the hierarchy', () => {
    const g = rollup([row({ Matnr: '400000002', CostPerpc1: '10' }), row({ Matnr: '400000003', Zscheme: '1', CostPerpc1: '20', PlanQty: '50', PlanCost: '500' })], map, names, 'brand');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ name: 'XS', fgs: 2 });
    expect(g[0].avgBudget!.toFixed(2)).toBe('15.00');
    expect(g[0].planQty.toFixed(0)).toBe('150');
    expect(g[0].planCost.toFixed(0)).toBe('1500');
  });
  it('actual is averaged over the FGs that have one, never counting a missing actual as 0', () => {
    const g = rollup([row({ Matnr: '400000002', ACostPerpc1: '12' }), row({ Matnr: '400000003', Zscheme: '1', ACostPerpc1: '0' })], map, names, 'sku');
    expect(g[0].avgActual!.toFixed(2)).toBe('12.00');
    expect(g[0]).toMatchObject({ withActual: 1, brand: 'XS', product: 'Energy drink', name: '250 ML' });
  });
  it('an FG SAP has no hierarchy for goes to its own "not in hierarchy" group, last', () => {
    const g = rollup([row({ Matnr: '400000002' }), row({ Matnr: '499999999', Zskugrcodecrs: 'CRS9' })], map, names, 'brand');
    expect(g.map((x) => x.name)).toEqual(['XS', '(not in hierarchy)']);
  });
  it('products of different brands stay apart even with the same code', () => {
    const m2 = new Map([['1', { brand: 'B1', product: 'P', sku: 'S' }], ['2', { brand: 'B2', product: 'P', sku: 'S' }]]);
    expect(rollup([row({ Matnr: '1' }), row({ Matnr: '2', Zskugrcodecrs: 'X' })], m2, names, 'product')).toHaveLength(2);
  });
  it('the material request is one OR filter on Matnr', () => {
    expect(materialHierRequest(['1', '2']).params.$filter).toBe("(Matnr eq '1' or Matnr eq '2')");
  });

  it('last year is a quantity-weighted average per CRS SKU + plant + type, and the variance is budget minus last year on the matched FGs', () => {
    const wac = (o: Partial<WacRow>) => ({ Zskugrcodecrs: 'CRS1', Werks: 'UN13', Mtart: 'FERT', Qty: '100', ActRm: '3', ActPm: '5', ActPerf: '1', ActMat: '9', ...o }) as unknown as WacRow;
    const ly = lastYearAverages([wac({}), wac({ Qty: '300', ActRm: '5', ActPm: '5', ActPerf: '1', ActMat: '11' }), wac({ Qty: '0' }), wac({ Zskugrcodecrs: '' })]);
    const a = ly.get('CRS1|UN13|FERT')!;
    expect(a.qty.toFixed(0)).toBe('400'); expect(a.rm.toFixed(2)).toBe('4.50'); expect(a.mat.toFixed(2)).toBe('10.50');
    const g = rollup([row({ Matnr: '400000002', CostPerpc1: '12' })], map, names, 'brand', ly);
    expect(g[0].ly!.mat.toFixed(2)).toBe('10.50');
    expect(g[0].varAbs!.toFixed(2)).toBe('1.50');
    expect(g[0].varPct!.toFixed(2)).toBe('14.29');
  });
  it('a group with no production last year has no variance (never compared with 0)', () => {
    const g = rollup([row({ Matnr: '400000002' })], map, names, 'brand', new Map());
    expect(g[0].ly).toBeNull(); expect(g[0].varAbs).toBeNull();
  });
  it('last year = the fiscal year before the budget year', () => {
    expect(previousFiscalYear('2026')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(previousFiscalYear('')).toBeNull();
  });
  it('shows management names when given (display only; the group code stays the SAP code)', () => {
    const mg = { brand: { '010001': 'BoroPlus' }, brandText: {}, product: { '0100010601': 'Lotion' }, productText: {}, sku: { '0100010601055': 'BoroPlus | Lotion | 100ml' } };
    const m = new Map([['400000001', { brand: '010001', product: '0100010601', sku: '0100010601055' }]]);
    const g = rollup([row({ Matnr: '400000001' })], m, names, 'sku', null, mg);
    expect(g[0].name).toBe('BoroPlus | Lotion | 100ml'); expect(g[0].code).toBe('0100010601055'); expect(g[0].brand).toBe('BoroPlus'); expect(g[0].product).toBe('Lotion');
  });
});
