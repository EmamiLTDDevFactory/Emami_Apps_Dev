import { describe, expect, it } from 'vitest';
import { EMPTY_WHATIF, annualWord, direction, hasErrors, noResult, remainWord, validateWhatIf, whatIfQuery, withTarget } from '@/lib/margin/whatifView';
import { WHATIF_HEADERS, whatIfSheet } from '@/lib/margin/whatifExport';
import { buildMarginFilter } from '@/lib/margin/filter';
import type { MarginSim } from '@/lib/margin/types';

const sim = (p: Partial<MarginSim> = {}): MarginSim => ({ Matnr: 'A', Maktx: 'FG', Werks: 'UB01', Market: '', Channel: '', Curr: 'INR', Uom: 'PC', Msg: '', MrpBefore: '100', MrpAfter: '100', SpBefore: '80', SpAfter: '75', CogmBefore: '50', CogmAfter: '50', RemainBefore: '30', RemainAfter: '25', RatioBefore: '62.5', RatioAfter: '66.7', DeltaRemain: '-5', AnnualDeltaInr: '120000', ReqSpRatio: '', ReqSpRemain: '', ReqMrpRestore: '', ...p });

describe('What-if inputs', () => {
  it('needs at least one change or target', () => expect(validateWhatIf(EMPTY_WHATIF).general).toBeTruthy());
  it('one of new MRP / new selling price, never both', () => {
    const e = validateWhatIf({ ...EMPTY_WHATIF, newMrp: '100', newSp: '75' });
    expect(e.newMrp).toMatch(/not both/); expect(e.newSp).toMatch(/not both/);
    expect(hasErrors(validateWhatIf({ ...EMPTY_WHATIF, newSp: '75' }))).toBe(false);
  });
  it('numbers only (comma accepted), no negative price or ratio', () => {
    expect(validateWhatIf({ ...EMPTY_WHATIF, cogmDpct: 'abc' }).cogmDpct).toBeTruthy();
    expect(hasErrors(validateWhatIf({ ...EMPTY_WHATIF, cogmDpct: '5,5' }))).toBe(false);
    expect(validateWhatIf({ ...EMPTY_WHATIF, newSp: '-1' }).newSp).toBeTruthy();
    expect(hasErrors(validateWhatIf({ ...EMPTY_WHATIF, cogmDabs: '-2' }))).toBe(false); // a cost can fall
  });
  it('the query sends only what was typed; the filter gets the m suffix and the scenario', () => {
    const q = whatIfQuery({ materials: ['A'], source: 'L' }, { ...EMPTY_WHATIF, newSp: '75', cogmDpct: '5,5', scenario: 'CUR', tgtRatio: '60' });
    expect(q.newMrp).toBeUndefined(); expect(q.cogmDpct).toBe('5.5');
    const f = buildMarginFilter(q, 'SIM');
    expect(f).toContain('NewSp eq 75m'); expect(f).toContain('CogmDpct eq 5.5m'); expect(f).toContain("Scenario eq 'CUR'"); expect(f).toContain('TgtRatioIn eq 60m'); expect(f).not.toContain('NewMrp'); expect(f).not.toContain('+');
  });
});

describe('What-if wording', () => {
  it('positive annual change = loss, negative = saving, nothing = n/a (never "no change")', () => {
    expect(annualWord('120000')).toBe('Loss'); expect(annualWord('-500')).toBe('Saving'); expect(annualWord('0')).toBe('No change'); expect(annualWord('')).toBe('n/a');
  });
  it('the change of the remaining amount is worded, not profit', () => {
    expect(remainWord('-5')).toBe('Remaining amount down'); expect(remainWord('5')).toBe('Remaining amount up'); expect(remainWord('')).toBe('n/a');
    expect(direction('abc')).toBe('na');
  });
  it('a row with only a message and no after-values has no result; targets are detected', () => {
    expect(noResult(sim({ Msg: 'No price', MrpAfter: '', SpAfter: '', CogmAfter: '', RemainAfter: '', RatioAfter: '' }))).toBe(true);
    expect(noResult(sim({ Msg: 'note' }))).toBe(false);
    expect(withTarget(sim())).toBe(false); expect(withTarget(sim({ ReqSpRatio: '90' }))).toBe(true);
  });
});

describe('What-if Excel', () => {
  it('has the agreed headers and the SAP figures per row, with the direction words', () => {
    const s = whatIfSheet([sim(), sim({ Matnr: 'B', AnnualDeltaInr: '-10', DeltaRemain: '' })]);
    expect(s.name).toBe('What-if'); expect(s.count).toBe(2);
    expect(s.cols.map((c) => c.header)).toEqual([...WHATIF_HEADERS]);
    const col = (h: string) => s.cols.find((c) => c.header === h)!;
    expect(col('Annual change INR').get(0)).toBe(120000); expect(col('Loss / saving').get(0)).toBe('Loss'); expect(col('Loss / saving').get(1)).toBe('Saving');
    expect(col('Direction (remaining amount)').get(1)).toBe('n/a'); expect(col('Change of the remaining amount').get(1)).toBeNull();
  });
});
