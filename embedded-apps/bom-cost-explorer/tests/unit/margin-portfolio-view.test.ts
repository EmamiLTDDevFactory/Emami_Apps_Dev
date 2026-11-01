import { describe, expect, it } from 'vitest';
import { groupBoardSearch, groupSelection, impactBars, impactKind, portfolioSheet, sortGroups } from '@/lib/margin/portfolioView';
import { DEFAULT_SEL, parseMarginSearch } from '@/lib/margin/selection';
import type { MarginBoard } from '@/lib/margin/types';

const g = (p: Partial<MarginBoard> = {}): MarginBoard => ({ GroupKind: 'P', GrpKey: 'P1', GrpTxt: 'Hair oil', FgCnt: 3, AlertHigh: 1, AlertMed: 0, NoDataCnt: 0, WratioStd: '55.1', WratioCur: '58.0', RevenueInr: '100000', AnnualImpactInr: '5000', ...p });

describe('Portfolio view', () => {
  it('a group opens the board with its key on the matching property; the link never carries a run', () => {
    expect(groupSelection(DEFAULT_SEL, 'P', '0101160653').prodha).toBe('0101160653');
    expect(groupSelection(DEFAULT_SEL, 'W', 'ub01').plants).toEqual(['UB01']);
    expect(groupSelection(DEFAULT_SEL, 'M', 'IN').market).toBe('IN');
    expect(groupSelection(DEFAULT_SEL, 'B', 'NAVRATNA').brand).toBe('NAVRATNA');
    const s = groupBoardSearch({ ...DEFAULT_SEL, materials: ['A'] }, 'B', 'NAVRATNA');
    expect(s).not.toContain('+');
    expect(parseMarginSearch(s)).toMatchObject({ materials: ['A'], brand: 'NAVRATNA' });
  });
  it('largest annual impact first (positive = loss); groups without an impact last', () => {
    const r = sortGroups([g({ GrpKey: 'B', AnnualImpactInr: '-200' }), g({ GrpKey: 'N', AnnualImpactInr: '' }), g({ GrpKey: 'A', AnnualImpactInr: '900' }), g({ GrpKey: 'C', AnnualImpactInr: '10' })]);
    expect(r.map((x) => x.GrpKey)).toEqual(['A', 'C', 'B', 'N']);
  });
  it('impact kinds: positive loss, negative saving, zero none, empty n/a', () => {
    expect(['10', '-3', '0', ''].map(impactKind)).toEqual(['loss', 'saving', 'none', 'na']);
  });
  it('the chart leaves out groups SAP sent no impact for (never a 0 bar) and caps the bars', () => {
    const bars = impactBars([g({ GrpKey: 'A', AnnualImpactInr: '' }), g({ GrpKey: 'B', AnnualImpactInr: '-5' }), g({ GrpKey: 'C', AnnualImpactInr: '7' })], 1);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ key: 'C', value: 7, kind: 'loss' });
    expect(impactBars([g({ AnnualImpactInr: '' })])).toEqual([]);
  });
  it('Excel: headers, SAP values as sent, empty = blank, no totals row', () => {
    const s = portfolioSheet([g(), g({ GrpKey: 'P2', AnnualImpactInr: '' })], 'P');
    expect(s.count).toBe(2);
    expect(s.cols.map((c) => c.header)).toEqual(['Product hierarchy', 'Description', 'Finished goods', 'High alerts', 'Medium alerts', 'Data gaps', 'Weighted ratio Standard %', 'Weighted ratio Current %', 'Revenue', 'Annual impact (positive = loss)']);
    expect(s.cols[9].get(0)).toBe(5000);
    expect(s.cols[9].get(1)).toBeNull();
  });
});
