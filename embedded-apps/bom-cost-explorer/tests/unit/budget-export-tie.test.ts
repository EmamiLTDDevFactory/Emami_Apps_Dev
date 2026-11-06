import { describe, expect, it } from 'vitest';
import { splitAllSheet, tieOutSheet, type FgSplit } from '@/lib/budget/export';
import type { BudgetSplitRow, BudgetSummaryRow } from '@/lib/budget/types';

const fg = (o: Partial<BudgetSummaryRow>) => ({ Matnr: 'F1', Werks: 'UN13', Maktx: 'Navratna', RmCost: '3', PmCost: '2', PerfumeCost: '1', CostPerpc1: '6', ...o }) as BudgetSummaryRow;
const sp = (Mtart: string, Hrkft: string, c: string) => ({ Matnr: 'F1', Werks: 'UN13', Mtart, Hrkft, CostPerpc1: c, ItemCode: Mtart + Hrkft }) as unknown as BudgetSplitRow;
const cell = (s: ReturnType<typeof tieOutSheet>, h: string, i = 0) => s.cols.find((c) => c.header === h)!.get(i);

describe('budget Excel with splits', () => {
  it('groups the split rows RM, Perfume, PM and adds the FG description and group', () => {
    const items: FgSplit[] = [{ fg: fg({}), split: [sp('VERP', '', '2'), sp('ROH', 'PERF', '1'), sp('ROH', 'IMP', '3')] }];
    const s = splitAllSheet(items);
    const g = s.cols.find((c) => c.header.startsWith('Group'))!;
    expect([0, 1, 2].map((i) => g.get(i))).toEqual(['RM', 'Perfume', 'PM']);
    expect(s.cols.find((c) => c.header === 'FG description')!.get(0)).toBe('Navratna');
  });
  it('tie-out: tallies, differs, and split not loaded', () => {
    const ok = [sp('ROH', 'IMP', '3'), sp('ROH', 'PERF', '1'), sp('VERP', '', '2')];
    const s = tieOutSheet([{ fg: fg({}), split: ok }, { fg: fg({ RmCost: '4' }), split: ok }, { fg: fg({}), split: null }]);
    expect([0, 1, 2].map((i) => cell(s, 'Status', i))).toEqual(['Tallies', 'Does not tally', 'Split not loaded']);
    expect(cell(s, 'RM difference', 1)).toBe(1);
    expect(cell(s, 'Split B-Cost total / pc', 0)).toBe(6);
  });
});
