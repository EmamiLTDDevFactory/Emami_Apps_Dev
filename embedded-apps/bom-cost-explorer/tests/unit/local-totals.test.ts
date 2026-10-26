import { describe, expect, it } from 'vitest';
import { localTotals } from '@/lib/cost/localTotals';

describe('BOM costing total in local currency', () => {
  const rows = [
    { LocCurr: 'BDT', TotCostLoc: '140', TotCostInr: '100' },
    { LocCurr: 'BDT', TotCostLoc: '70', TotCostInr: '50' },
    { LocCurr: 'BDT', TotCostLoc: '999', TotCostInr: '999' }, // parent row: not counted
    { LocCurr: 'INR', TotCostLoc: '30', TotCostInr: '30' },
  ];
  const isLeaf = [true, true, false, true];

  it('leaf lines summed per local currency, INR last', () => {
    const t = localTotals(rows, isLeaf);
    expect(t.map((x) => [x.curr, x.loc.toFixed(2), x.inr.toFixed(2)])).toEqual([['BDT', '210.00', '150.00'], ['INR', '30.00', '30.00']]);
    expect(t[0].simLoc).toBeNull();
  });

  it('a simulated INR value goes to local at each line’s own rate', () => {
    const sim = ['110', '50', '0', '33'];
    const t = localTotals(rows, isLeaf, (i) => sim[i]);
    expect(t[0].simLoc!.toFixed(2)).toBe('224.00'); // 110 x 1.4 + 50 x 1.4
    expect(t[1].simLoc!.toFixed(2)).toBe('33.00');
  });
});
