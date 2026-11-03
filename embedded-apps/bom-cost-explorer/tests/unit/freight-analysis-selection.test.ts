import { describe, expect, it } from 'vitest';
import { NEED_PLANT_OR_MATERIAL, analysisFilter, defaultInclFrt, freightDaysValue, sapDay, selectionProblem } from '@/lib/freight/analysisFetch';

const range = { from: '2026-08-01', to: '2026-10-31' };
const types = ['ROH', 'PKGN', 'VERP'];

describe('selection: a plant OR materials is enough (no finished goods)', () => {
  it('plants alone is valid', () => expect(selectionProblem({ materials: [], plants: ['UB01'], types, range })).toBe(''));
  it('materials alone is valid', () => expect(selectionProblem({ materials: ['RM-1'], plants: [], types, range })).toBe(''));
  it('nothing picked is refused with the agreed text', () => {
    expect(NEED_PLANT_OR_MATERIAL).toBe('Enter a plant or at least one material');
    expect(selectionProblem({ materials: [], plants: [], types, range })).toBe(NEED_PLANT_OR_MATERIAL);
  });
  it('no type, a wrong date range and a bad look-back are refused', () => {
    expect(selectionProblem({ materials: ['RM-1'], plants: [], types: [], range })).toMatch(/material type/);
    expect(selectionProblem({ materials: ['RM-1'], plants: [], types, range: { from: '2026-11-01', to: '2026-10-01' } })).toMatch(/From date/);
    expect(selectionProblem({ materials: ['RM-1'], plants: [], types, range, freightDays: 0 })).toMatch(/at least 1/);
    expect(selectionProblem({ materials: ['RM-1'], plants: [], types, range, freightDays: 500 })).toBe('');
  });
});

describe('FreightDays is sent exactly as typed: no upper cap', () => {
  it('keeps big values, fixes only what is not a usable number of days', () => {
    expect(freightDaysValue(500)).toBe(500);
    expect(freightDaysValue('3650')).toBe(3650);
    expect(freightDaysValue('93')).toBe(93);
    expect(freightDaysValue('31')).toBe(31);
    expect(freightDaysValue(30.9)).toBe(30);
    expect(freightDaysValue(0)).toBe(1);
    expect(freightDaysValue('')).toBe(92);
    expect(freightDaysValue('abc')).toBe(92);
  });
  it('the filter carries the typed number', () => {
    const base = { mode: 'F' as const, materials: [] as string[], plant: 'UB01', range, inclFrt: true };
    expect(analysisFilter({ ...base, freightDays: 500 })).toContain('FreightDays eq 500');
    expect(analysisFilter({ ...base, freightDays: 3650 })).toContain('FreightDays eq 3650');
  });
});

describe('Include freight default follows the dates', () => {
  it('checked when both dates are filled, unchecked otherwise', () => {
    expect(defaultInclFrt(range)).toBe(true);
    expect(defaultInclFrt({ from: '', to: '' })).toBe(false);
    expect(defaultInclFrt({ from: '2026-08-01', to: '' })).toBe(false);
  });
});

describe('the filter has only what the screen filled in', () => {
  const base = { mode: 'F' as const, materials: [] as string[], plant: '', range, inclFrt: true, freightDays: 92 };
  it('plant only: no Matnr clause', () => {
    const f = analysisFilter({ ...base, plant: 'UB01' });
    expect(f).toContain("Werks eq 'UB01'");
    expect(f).not.toContain('Matnr');
  });
  it('materials only: no Werks clause, one clause per material joined with or', () => {
    const f = analysisFilter({ ...base, materials: ['RM-1', 'PM-1'] });
    expect(f).toContain("(Matnr eq 'RM-1' or Matnr eq 'PM-1')");
    expect(f).not.toContain('Werks');
  });
  it("dates go as two separate Edm.DateTime literals datetime'YYYY-MM-DDT00:00:00' (NGQ refuses plain strings), never a combined range", () => {
    const f = analysisFilter({ ...base, plant: 'UB01' });
    expect(f).toContain("BudatFrom eq datetime'2026-08-01T00:00:00'");
    expect(f).toContain("BudatTo eq datetime'2026-10-31T00:00:00'");
    expect(f).not.toContain("BudatFrom eq '");
    expect(f).not.toContain("BudatTo eq '");
  });
  it('sapDay: a datetime literal, nothing for an empty or unreadable date', () => {
    expect(sapDay('BudatFrom', '2026-08-06')).toBe("BudatFrom eq datetime'2026-08-06T00:00:00'");
    expect(sapDay('BudatTo', '2026-11-03')).toBe("BudatTo eq datetime'2026-11-03T00:00:00'");
    expect(sapDay('BudatTo', '')).toBeNull();
    expect(sapDay('BudatTo', 'soon')).toBeNull();
  });
  it('no dates: no Budat clause; FreightDays only on the freight set', () => {
    const f = analysisFilter({ ...base, plant: 'UB01', range: { from: '', to: '' }, inclFrt: false });
    expect(f).not.toContain('Budat');
    expect(f).toContain('FreightDays eq 92');
    expect(analysisFilter({ ...base, mode: 'M', plant: 'UB01' })).not.toContain('FreightDays');
  });
  it("InclFrt is the ABAP character flag: eq 'X' when set, never eq true; omitted when not set", () => {
    const on = analysisFilter({ ...base, plant: 'UB01', inclFrt: true });
    expect(on).toContain("InclFrt eq 'X'");
    expect(on).not.toContain('InclFrt eq true');
    expect(analysisFilter({ ...base, plant: 'UB01', inclFrt: false })).not.toContain('InclFrt');
  });
  it('StdFrt is never sent', () => {
    for (const mode of ['F', 'M'] as const) expect(analysisFilter({ ...base, mode, plant: 'UB01' })).not.toContain('StdFrt');
  });
  it("LatestOnly unticked: sent as a single blank, LatestOnly eq ' ' (also when the flag is not given); never eq '' and never omitted", () => {
    for (const latestOnly of [false, undefined]) {
      const f = analysisFilter({ ...base, plant: 'UB01', latestOnly });
      expect(f).toContain("LatestOnly eq ' '");
      expect(f).not.toContain("LatestOnly eq ''");
    }
  });
  it("LatestOnly ticked: `LatestOnly eq 'X'` (never eq true)", () => {
    const f = analysisFilter({ ...base, plant: 'UB01', latestOnly: true });
    expect(f).toContain("LatestOnly eq 'X'");
    expect(f).not.toContain("LatestOnly eq ' '");
    expect(f).not.toContain('LatestOnly eq true');
  });
  it('LatestOnly is only on the freight request, never on the components request', () => {
    expect(analysisFilter({ ...base, mode: 'M', plant: 'UB01', latestOnly: true })).not.toContain('LatestOnly');
    expect(analysisFilter({ ...base, mode: 'M', plant: 'UB01', latestOnly: false })).not.toContain('LatestOnly');
  });
});
