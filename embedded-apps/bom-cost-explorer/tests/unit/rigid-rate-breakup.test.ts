import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { breakupOfRate, budgetYearOf, currentYearRates, type BudgetBreakup, type PkgComp } from '@/lib/rigid/analysis';

// 150010368 @ UN13, packing budget scenario 7, live NWP 26.11.2026 (per 1,000 PC)
const D = (v: string) => new Decimal(v);
const comp = (comp: string, pct: string, zbud: string): PkgComp => ({ comp, compTxt: '', pctSap: D(pct), pctUsed: D(pct), zbudSap: D(zbud), zbudUsed: D(zbud), baseRate: D('0'), budgeted: D('0'), flag: 'OK' });
const item = { priceUnit: D('1000'), comps: [comp('850002287', '55', '-2.938'), comp('850002288', '45', '0')] };

describe('cost breakup of the costing rate (packing budget formula)', () => {
  it('fed SAP\'s basic rate it reproduces SAP\'s own build-up (2,741.96 per 1,000)', () => {
    const b = breakupOfRate(item, D('2.787'));
    expect(b.lines[0].base.toFixed(2)).toBe('1532.85');
    expect(b.lines[0].budgeted.toFixed(2)).toBe('1487.81');
    expect(b.lines[1].budgeted.toFixed(2)).toBe('1254.15');
    expect(b.budgeted.toFixed(2)).toBe('2741.96');
  });
  it('the rate selected in the costing (2.81 / pc, no freight): 55 % / 45 % split, ZBUD applied', () => {
    const b = breakupOfRate(item, D('2.81'));
    expect(b.rate.toFixed(2)).toBe('2810.00');
    expect(b.lines.map((l) => l.base.toFixed(2))).toEqual(['1545.50', '1264.50']);
    expect(b.lines[0].budgeted.toFixed(4)).toBe('1500.0932');
    expect(b.budgeted.toFixed(4)).toBe('2764.5932');
    expect(b.budgetedPc.toFixed(6)).toBe('2.764593');
    expect(b.pctTotal.toFixed(0)).toBe('100');
  });
  it('budget year is April to March; only the current year\'s rates are kept', () => {
    expect(budgetYearOf(new Date(2026, 10, 26))).toBe('2026');
    expect(budgetYearOf(new Date(2027, 1, 10))).toBe('2026');
    expect(budgetYearOf(new Date(2027, 3, 1))).toBe('2027');
    const row = (gjahr: string) => ({ gjahr, basic: D('1'), discount: D('0'), tax: D('0'), frgAmt: D('0'), freight: D('0'), landed: D('1'), total: D('1'), budqty: D('0'), priceUnit: D('1'), uom: 'PC', curr: 'INR', category: '', validFrom: null, validTo: null });
    const b: BudgetBreakup = { d: [row('2026'), row('2026'), row('2025'), row('2019')], p: [] };
    expect(currentYearRates(b, new Date(2026, 10, 26))).toHaveLength(2);
    expect(currentYearRates(b, new Date(2028, 5, 1))).toHaveLength(0);
  });
});
