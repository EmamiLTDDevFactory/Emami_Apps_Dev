import { describe, expect, it } from 'vitest';
import { budgetPerUnit } from '@/lib/cost/budgetUnit';

const leaf = (o: Record<string, string>): { HasChild: string; BudLanded: string; BudSrcamt: string; SelRate: string; SelRatePc: string; BudUnitFactor?: number } => ({ HasChild: '', BudLanded: '65000', BudSrcamt: '65000', SelRate: '55000', SelRatePc: '55', ...o });

describe('budget rate per component unit', () => {
  it('brings a per-kg budget rate to the BOM unit (g) with the line\'s own SelRate / SelRatePc', () => {
    const r = budgetPerUnit(leaf({}));
    expect(Number(r.BudLanded)).toBeCloseTo(65, 9); expect(Number(r.BudSrcamt)).toBeCloseTo(65, 9); expect(r.BudUnitFactor).toBe(1000);
  });
  it('handles a price unit of 100 and leaves equal units alone', () => {
    expect(Number(budgetPerUnit(leaf({ BudLanded: '300', BudSrcamt: '300', SelRate: '200', SelRatePc: '2' })).BudLanded)).toBeCloseTo(3, 9);
    const same = budgetPerUnit(leaf({ SelRate: '2', SelRatePc: '2' }));
    expect(same.BudLanded).toBe('65000'); expect(same.BudUnitFactor).toBe(1);
  });
  it('is idempotent, skips parents, no budget, and lines with no selected rate', () => {
    const once = budgetPerUnit(leaf({}));
    expect(budgetPerUnit(once)).toBe(once);
    const parent = leaf({ HasChild: 'X' }); expect(budgetPerUnit(parent)).toBe(parent);
    const none = leaf({ BudLanded: '0' }); expect(budgetPerUnit(none)).toBe(none);
    const norate = leaf({ SelRate: '0', SelRatePc: '0' }); expect(budgetPerUnit(norate).BudLanded).toBe('65000'); expect(budgetPerUnit(norate).BudUnitFactor).toBeUndefined();
  });
});
