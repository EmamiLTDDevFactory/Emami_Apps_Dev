import { describe, expect, it } from 'vitest';
import { buildMarginFilter, chunkMaterials, MARGIN_LIVE_MAX } from '@/lib/margin/filter';
import { DEFAULT_SEL, marginSearch, parseMarginSearch, toMarginQuery } from '@/lib/margin/selection';

describe('Margin filter builder', () => {
  it('several values of one property go in brackets with "or"', () => {
    expect(buildMarginFilter({ materials: ['A', 'B'], plants: ['ub01'], source: 'S' }, 'ROW')).toBe("(Matnr eq 'A' or Matnr eq 'B') and Werks eq 'UB01' and Source eq 'S'");
  });
  it('decimals carry the m suffix, dates are datetime literals, flags are Edm.String X', () => {
    const f = buildMarginFilter({ materials: ['A'], source: 'L', priceDate: '2026-11-01', explQty: '1000', inclFrt: true, newSp: '75', tgtRatio: '60' }, 'SIM');
    expect(f).toContain('NewSp eq 75m'); expect(f).toContain('TgtRatioIn eq 60m'); expect(f).toContain("PriceDate eq datetime'2026-11-01T00:00:00'"); expect(f).toContain('ExplQty eq 1000m'); expect(f).toContain("InclFrt eq 'X'");
    expect(buildMarginFilter({ materials: ['A'], inclFrt: false }, 'ROW')).not.toContain('InclFrt');
  });
  it('a new MRP and a new selling price together are refused; a bad number too', () => {
    expect(() => buildMarginFilter({ materials: ['A'], newMrp: '1', newSp: '2' }, 'SIM')).toThrow();
    expect(() => buildMarginFilter({ materials: ['A'], newSp: 'abc' }, 'SIM')).toThrow();
  });
  it('a live call takes 25 finished goods at most; a snapshot is not limited', () => {
    const m = Array.from({ length: 26 }, (_, i) => `M${i}`);
    expect(() => buildMarginFilter({ materials: m, source: 'L' }, 'ROW')).toThrow();
    expect(() => buildMarginFilter({ materials: m, source: 'S' }, 'ROW')).not.toThrow();
    expect(chunkMaterials(m).map((c) => c.length)).toEqual([MARGIN_LIVE_MAX, 1]);
  });
  it('order prices add the sales-area filters; uploaded prices never send them', () => {
    const o = buildMarginFilter({ materials: ['A'], priceSrc: 'O', vkorg: ['EM01'], vtweg: ['10', '30'], segment: ['DOM'], soDays: 90, auart: { in: ['ZOD1'], ex: ['ZOFC'] } }, 'ROW');
    expect(o).toContain("PriceSrcIn eq 'O'"); expect(o).toContain("(VtwegIn eq '10' or VtwegIn eq '30')"); expect(o).toContain('SoDaysIn eq 90'); expect(o).toContain("AuartIn eq 'ZOD1'"); expect(o).toContain("AuartEx eq 'ZOFC'");
    const u = buildMarginFilter({ materials: ['A'], priceSrc: '', vkorg: ['EM01'], market: 'IN', channel: '10' }, 'ROW');
    expect(u).not.toContain('VkorgIn'); expect(u).toContain("Market eq 'IN'");
  });
  it('set-specific filters: GroupBy only on the board, DaysBack only on history, RuleIn only on alerts', () => {
    expect(buildMarginFilter({ groupBy: 'B' }, 'BOARD')).toContain("GroupBy eq 'B'");
    expect(buildMarginFilter({ groupBy: 'B', materials: ['A'] }, 'ROW')).not.toContain('GroupBy');
    expect(buildMarginFilter({ materials: ['A'], daysBack: 180 }, 'HISTORY')).toContain('DaysBack eq 180');
    expect(() => buildMarginFilter({ daysBack: 180 }, 'HISTORY')).toThrow();
    expect(buildMarginFilter({ rule: ['E1', 'E2'] }, 'ALERT')).toContain("(RuleIn eq 'E1' or RuleIn eq 'E2')");
  });
  it('no "+" and quotes in values are doubled by the shared literal helper', () => {
    expect(buildMarginFilter({ materials: ["O'Neil"] }, 'ROW')).toContain("'O''Neil'");
  });
});

describe('Margin selection in the URL', () => {
  it('round-trips and never writes "+"', () => {
    const sel = { ...DEFAULT_SEL, materials: ['400009226', 'A B'], plants: ['UB01'], source: 'S' as const, priceSrc: 'O' as const, vkorg: ['EM01'], segment: 'DOM', auart: { in: ['ZOD1'], ex: ['ZOFC'] } };
    const s = marginSearch(sel);
    expect(s).not.toContain('+');
    expect(parseMarginSearch(s)).toMatchObject({ materials: ['400009226', 'A B'], plants: ['UB01'], source: 'S', priceSrc: 'O', vkorg: ['EM01'], segment: 'DOM', auart: { in: ['ZOD1'], ex: ['ZOFC'] } });
  });
  it('uploaded prices send Market / Channel; order prices send the sales area', () => {
    expect(toMarginQuery({ ...DEFAULT_SEL, market: 'IN', channel: '10' })).toMatchObject({ market: 'IN', priceSrc: '' });
    expect(toMarginQuery({ ...DEFAULT_SEL, priceSrc: 'O', market: 'IN', vkorg: ['EM01'] })).toMatchObject({ market: '', priceSrc: 'O', vkorg: ['EM01'] });
  });
});
