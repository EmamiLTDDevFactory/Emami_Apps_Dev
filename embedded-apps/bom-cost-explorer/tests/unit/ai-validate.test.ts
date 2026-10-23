import { describe, expect, it } from 'vitest';
import { FactBook, citedIds } from '@/lib/ai/facts';
import { extractNumbers, parseAnswer, validateAnswer } from '@/lib/ai/validate';

const book = () => {
  const b = new FactBook();
  b.add('Cost per piece now', '25.62', { unit: 'INR/pc', source: 't.now' }); // F1
  b.add('Change per piece', '-1.4237', { unit: 'INR/pc', source: 't.delta', dp: 2 }); // F2
  b.add('Change %', '-5.27', { unit: '%', source: 't.pct' }); // F3
  b.add('Plan cost', '12345678.90', { unit: 'INR', source: 't.plan' }); // F4
  b.add('Components', 14, { unit: 'count', source: 't.n' }); // F5
  b.add('Rate low', '1.20', { unit: 'INR', source: 't.lo' }); // F6
  b.add('Rate high', '1.50', { unit: 'INR', source: 't.hi' }); // F7
  b.add('Annual impact', '140000', { unit: 'INR', source: 't.y' }); // F8
  b.add('Big impact', '20000000', { unit: 'INR', source: 't.cr' }); // F9
  return b;
};
const v = (text: string, facts?: string[], ignore: string[] = []) => validateAnswer({ paragraphs: [{ text, facts }] }, book().list(), ignore);
const nums = (t: string, ignore: string[] = []) => extractNumbers(t, ignore).map((h) => h.value.toString());

describe('facts', () => {
  it('ids are sequential and repeated facts reuse the id', () => {
    const b = new FactBook();
    expect(b.add('a', 1, { source: 's' })).toBe('F1');
    expect(b.add('b', 2, { source: 's' })).toBe('F2');
    expect(b.add('a', 1, { source: 's' })).toBe('F1');
  });
  it('INR display uses Indian grouping; % shows the sign as given', () => {
    expect(book().get('F4')!.display).toBe('1,23,45,678.90');
    expect(book().get('F3')!.display).toBe('-5.27%');
  });
  it('citedIds finds [F#] ids', () => expect(citedIds('a [F1] b [F12]')).toEqual(['F1', 'F12']));
  it('forModel exposes id, label, value, display, unit only', () => expect(Object.keys(book().forModel()[0]).sort()).toEqual(['display', 'id', 'label', 'unit', 'value']));
});

describe('extractNumbers', () => {
  it('integers and decimals', () => expect(nums('cost 25.62 and 14 parts')).toEqual(['25.62', '14']));
  it('Indian grouping', () => expect(nums('1,23,45,678.90')).toEqual(['12345678.9']));
  it('Western grouping', () => expect(nums('12,345,678.90')).toEqual(['12345678.9']));
  it('negative with hyphen and minus sign', () => expect(nums('-1.42 and −5.27')).toEqual(['-1.42', '-5.27']));
  it('percent is flagged', () => expect(extractNumbers('5.27%')[0].percent).toBe(true));
  it('range with hyphen gives both ends', () => expect(nums('1.20-1.50')).toEqual(['1.2', '1.5']));
  it('range with en dash and "to"', () => expect(nums('1.20–1.50 or 1.20 to 1.50')).toEqual(['1.2', '1.5', '1.2', '1.5']));
  it('lakh and crore multiply', () => expect(nums('1.4 lakh and 2 crore')).toEqual(['140000', '20000000']));
  it('thousand multiplies', () => expect(nums('3.5 thousand')).toEqual(['3500']));
  it('fact ids are ignored', () => expect(nums('[F12] [F3]')).toEqual([]));
  it('years are ignored', () => expect(nums('in 2026 vs 1999')).toEqual([]));
  it('dates are ignored (dd.mm.yyyy, ISO, slash, month names)', () => expect(nums('14.10.2026 2026-10-14 14/10/2026 14 Oct 2026 Oct 14, 2026')).toEqual([]));
  it('times are ignored', () => expect(nums('at 06:00')).toEqual([]));
  it('material numbers and codes glued to letters are ignored', () => expect(nums('FG1001 ZFR1 H2 BD10 100003292')).toEqual([]));
  it('plant codes passed in ignore are skipped', () => expect(nums('plant 1000 and 1100', ['1000', '1100'])).toEqual([]));
  it('a number followed by a unit after a space is kept', () => expect(nums('5 KG')).toEqual(['5']));
  it('rounding tolerance follows the decimals shown', () => {
    expect(extractNumbers('1.4')[0].tolerance.toString()).toBe('0.05');
    expect(extractNumbers('1.42')[0].tolerance.toString()).toBe('0.005');
    expect(extractNumbers('14')[0].tolerance.toString()).toBe('0.5');
    expect(extractNumbers('1.4 lakh')[0].tolerance.toString()).toBe('5000');
  });
});

describe('validateAnswer', () => {
  it('exact number with its id passes', () => expect(v('Cost is 25.62 INR [F1].').ok).toBe(true));
  it('number without any fact id fails', () => expect(v('Cost is 25.62 INR.').errors[0].reason).toBe('number without a fact id'));
  it('number with the wrong id fails', () => expect(v('Cost is 25.62 INR [F5].').ok).toBe(false));
  it('rounded display of a fact passes (1.42 for -1.4237)', () => expect(v('Down by 1.42 INR [F2].').ok).toBe(true));
  it('coarser rounding passes (1.4)', () => expect(v('Down by 1.4 INR [F2].').ok).toBe(true));
  it('a wrong rounding fails (1.43)', () => expect(v('Down by 1.43 INR [F2].').ok).toBe(false));
  it('sign words: "down by" matches a negative fact', () => expect(v('It went down by 5.27% [F3].').ok).toBe(true));
  it('explicit negative matches a negative fact', () => expect(v('Change −1.42 [F2].').ok).toBe(true));
  it('percent passes', () => expect(v('A 5.27% fall [F3].').ok).toBe(true));
  it('Indian grouped total passes', () => expect(v('Plan cost 1,23,45,678.90 INR [F4].').ok).toBe(true));
  it('Western grouped total passes', () => expect(v('Plan cost 12,345,678.90 INR [F4].').ok).toBe(true));
  it('lakh passes against 140000', () => expect(v('About 1.4 lakh [F8] a year.').ok).toBe(true));
  it('crore passes against 2 crore', () => expect(v('Some 2 crore [F9].').ok).toBe(true));
  it('range: both ends must be cited facts', () => expect(v('Rates 1.20-1.50 INR [F6] [F7].').ok).toBe(true));
  it('range with one end not a fact fails', () => expect(v('Rates 1.20-1.70 INR [F6] [F7].').ok).toBe(false));
  it('ids listed in "facts" count as cited', () => expect(v('14 components.', ['F5']).ok).toBe(true));
  it('unknown fact id is an error', () => expect(v('Cost 25.62 [F99].').errors.some((e) => e.reason.includes('unknown'))).toBe(true));
  it('dates, years and plant codes in mixed text are fine', () => expect(v('On 14.10.2026 in 2026 plant 1000 cost 25.62 [F1].', undefined, ['1000']).ok).toBe(true));
  it('material numbers in text are fine', () => expect(v('Component 100003292 (FG1001) adds 25.62 [F1].').ok).toBe(true));
  it('text with no numbers passes', () => expect(v('No change above the thresholds.').ok).toBe(true));
  it('invented number in a check fails', () => expect(validateAnswer({ paragraphs: [{ text: 'ok' }], checks: [{ text: 'Check 7 vendors.' }] }, book().list()).ok).toBe(false));
  it('counts are matched exactly (14 not 15)', () => expect(v('15 components [F5].').ok).toBe(false));
  it('a number may cite several facts and match any of them', () => expect(v('25.62 INR [F1][F5].').ok).toBe(true));
});

describe('parseAnswer', () => {
  it('plain JSON', () => expect(parseAnswer('{"paragraphs":[{"text":"a","facts":[]}]}')?.paragraphs[0].text).toBe('a'));
  it('fenced JSON', () => expect(parseAnswer('```json\n{"paragraphs":[{"text":"a"}]}\n```')?.paragraphs).toHaveLength(1));
  it('digest shape {text, facts}', () => expect(parseAnswer('{"text":"x","facts":["F1"]}')?.paragraphs[0].facts).toEqual(['F1']));
  it('invalid JSON returns null', () => expect(parseAnswer('not json')).toBeNull());
  it('wrong shape returns null', () => expect(parseAnswer('{"foo":1}')).toBeNull());
});
