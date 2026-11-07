import { describe, expect, it } from 'vitest';
import { D } from '@/lib/cost/decimal';
import { ALL_COLS, DEFAULT_VISIBLE, SUMMARY_COLS, calcValue, colsByKeys } from '@/lib/budget/view';
import { summarySheet } from '@/lib/budget/export';
import { activeOf, navSections, sectionPath } from '@/lib/nav/sections';
import type { BudgetSummaryRow } from '@/lib/budget/types';

const row = { Matnr: 'F1', Werks: 'UN13', CostPerpc1: '10', ACostPerpc1: '11', LastRate: '0' } as BudgetSummaryRow;

describe('budget columns', () => {
  it('every column can be chosen: keys are unique and the defaults exist', () => {
    const keys = ALL_COLS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of DEFAULT_VISIBLE) expect(keys).toContain(k);
    expect(ALL_COLS.length).toBeGreaterThan(SUMMARY_COLS.length);
  });
  it('Selected / C-Map are empty until loaded, then the FG totals', () => {
    expect(calcValue('_sel', row)).toBeNull();
    expect(calcValue('_cmap', row, { selected: D('7.5'), cmap: D('8') })?.toString()).toBe('8');
    expect(calcValue('_var', row)?.toFixed(1)).toBe('10.0');
  });
  it('the Excel summary carries the chosen calculated columns', () => {
    const cols = colsByKeys(new Set(['Matnr', '_sel', '_cmap', '_var']));
    const s = summarySheet([row], cols, () => ({ selected: D('7.5'), cmap: D('8') }));
    expect(s.cols.map((c) => c.header)).toEqual(['Material code', 'Act vs budget %', 'Selected rate / pc', 'C-Map / pc']);
    expect(s.cols.map((c) => c.get(0))).toEqual(['F1', 10, 7.5, 8]);
  });
});

describe('side pane sections', () => {
  const flags = { wac: true, ck: true, so: true, psum: true, marginRole: '', budgetRole: '' };
  it('Costing has two tiles, BOM costing and Plant comparison, and opens in place', () => {
    const s = navSections(flags).find((x) => x.id === 'costing')!;
    expect(s.items.map((i) => i.label)).toEqual(['BOM costing', 'Plant comparison']);
    expect(sectionPath(s)).toBeNull();
  });
  it('Analysis lists the costing modes and the route screens; the flags hide the admin ones', () => {
    const all = navSections(flags).find((x) => x.id === 'analysis')!.items.map((i) => i.id);
    expect(all).toEqual(expect.arrayContaining(['mode-R', 'mode-F', 'mode-M', 'freight', 'wac', 'psum', 'ck', 'so']));
    const few = navSections({ ...flags, wac: false, ck: false, so: false, psum: false }).find((x) => x.id === 'analysis')!.items.map((i) => i.id);
    expect(few).not.toContain('wac');
  });
  it('the active section follows the mode or the route', () => {
    const secs = navSections(flags);
    expect(activeOf(secs, undefined, 'C').section?.id).toBe('costing');
    expect(activeOf(secs, undefined, 'F').section?.id).toBe('analysis');
    expect(activeOf(secs, 'freight', 'B').item?.id).toBe('freight');
    expect(activeOf(secs, 'section', 'B', 'analysis').section?.id).toBe('analysis');
  });
});
