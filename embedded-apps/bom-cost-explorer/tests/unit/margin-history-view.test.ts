import { describe, expect, it } from 'vitest';
import { erosionKind, hasLine, historySeries, historySheet, sortHistory } from '@/lib/margin/historyView';
import type { MarginHistory } from '@/lib/margin/types';

const h = (p: Partial<MarginHistory> = {}): MarginHistory => ({ SnapDate: '2026-10-01', Matnr: 'M', Werks: 'UB01', Market: 'IN', Channel: '10/ZOD1', Curr: 'INR', CogmStd: '40', CogmCur: '44', CogmAct: '', RatioCur: '58', ErosionStd: '4', ErosionBase: '', ...p });

describe('History view', () => {
  it('oldest snapshot first; rows without a date last', () => {
    expect(sortHistory([h({ SnapDate: '2026-10-03' }), h({ SnapDate: null }), h({ SnapDate: '2026-10-01' })]).map((x) => x.SnapDate)).toEqual(['2026-10-01', '2026-10-03', null]);
  });
  it('series: a value SAP did not send is a gap (null), never 0; undated rows are left out', () => {
    const s = historySeries([h({ SnapDate: '2026-10-02', CogmCur: '' }), h(), h({ SnapDate: null })]);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ date: '2026-10-01', std: 40, cur: 44, act: null, ratio: 58 });
    expect(s[1].cur).toBeNull();
    expect(hasLine(s, 'act')).toBe(false);
    expect(hasLine(s, 'std')).toBe(true);
  });
  it('erosion: positive = cost up / amount down (worse), negative better, empty n/a', () => {
    expect(['4', '-1', '0', ''].map(erosionKind)).toEqual(['worse', 'better', 'none', 'na']);
  });
  it('Excel: headers and blank for empty values', () => {
    const s = historySheet([h({ SnapDate: '2026-10-02' }), h()]);
    expect(s.cols.map((c) => c.header)).toEqual(['Snapshot date', 'Material', 'Plant', 'Market', 'Channel', 'Currency', 'COGM Standard', 'COGM Current', 'COGM Actual', 'Ratio Current %', 'Erosion vs Standard', 'Erosion vs Base']);
    expect(s.cols[0].get(0)).toBe('2026-10-01');
    expect(s.cols[8].get(0)).toBeNull();
    expect(s.cols[11].get(0)).toBeNull();
  });
});
