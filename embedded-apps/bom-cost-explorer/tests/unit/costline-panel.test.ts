import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { costQtyOf } from '@/components/costline/BomCostingPanel';
import { PRESETS } from '@/components/BomTree';

describe('BOM costing panel (Plant production summary, Standard cost, Sales price)', () => {
  it('costs a whole-number quantity of at least 1', () => {
    expect(costQtyOf(new Decimal('1234.6'))).toBe('1235');
    expect(costQtyOf('1000')).toBe('1000');
    expect(costQtyOf(0.4)).toBe('1');
    expect(costQtyOf(undefined)).toBe('1');
    expect(costQtyOf('abc')).toBe('1');
  });
  it('the All costs preset exists only when the feature is on (off in tests: the preset list is the old one)', () => {
    expect(Object.keys(PRESETS)).toEqual(['Standard', 'Rates', 'Freight', 'Budget & coverage', 'All']);
  });
});
