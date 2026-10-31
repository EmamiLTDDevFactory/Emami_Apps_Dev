import { describe, expect, it } from 'vitest';
import { ALL_COSTS_ENABLED, ALL_COSTS_PROPS, costPropVisible } from '@/lib/sap/allCosts';
import { costLineSelect } from '@/lib/sap/requests';
import { COST_LINE } from '@/lib/sap/fields';

describe('All costs on BOM costing', () => {
  it('is off in tests: the costing $select is exactly the old one (no actual rate, no BOM source)', () => {
    expect(ALL_COSTS_ENABLED).toBe(false);
    const sel = costLineSelect(false).split(',');
    for (const p of ALL_COSTS_PROPS) expect(sel).not.toContain(p);
  });
  it('the extra properties are mapped (so the normaliser reads them when selected) and hidden only by the flag', () => {
    const names = Object.values(COST_LINE).map(([n]) => n);
    for (const p of ALL_COSTS_PROPS) { expect(names).toContain(p); expect(costPropVisible(p, false)).toBe(false); expect(costPropVisible(p, true)).toBe(true); }
    expect(costPropVisible('SelRatePc', false)).toBe(true);
  });
});
