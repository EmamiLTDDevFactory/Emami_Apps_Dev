import { describe, expect, it } from 'vitest';
import { MAX_FREIGHT_DAYS, NEED_PLANT_OR_MATERIAL, analysisFilter, clampFreightDays, defaultInclFrt, selectionProblem } from '@/lib/freight/analysisFetch';

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
    expect(selectionProblem({ materials: ['RM-1'], plants: [], types, range, freightDays: 0 })).toMatch(/1 to 92/);
    expect(selectionProblem({ materials: ['RM-1'], plants: [], types, range, freightDays: 92 })).toBe('');
  });
});

describe('FreightDays: whole number 1 to 92, clamped before it is sent', () => {
  it('clamps', () => {
    expect(clampFreightDays(500)).toBe(MAX_FREIGHT_DAYS);
    expect(clampFreightDays(0)).toBe(1);
    expect(clampFreightDays('31')).toBe(31);
    expect(clampFreightDays('abc')).toBe(92);
    expect(clampFreightDays(30.9)).toBe(30);
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
  it('dates go as two separate Edm.DateTime properties, never a combined range', () => {
    const f = analysisFilter({ ...base, plant: 'UB01' });
    expect(f).toContain("BudatFrom eq datetime'2026-08-01T00:00:00'");
    expect(f).toContain("BudatTo eq datetime'2026-10-31T00:00:00'");
  });
  it('no dates: no Budat clause; FreightDays only on the freight set', () => {
    const f = analysisFilter({ ...base, plant: 'UB01', range: { from: '', to: '' }, inclFrt: false });
    expect(f).not.toContain('Budat');
    expect(f).toContain('FreightDays eq 92');
    expect(analysisFilter({ ...base, mode: 'M', plant: 'UB01' })).not.toContain('FreightDays');
  });
  it('InclFrt is always sent, true or false (typed as the live service defines it on these sets)', () => {
    expect(analysisFilter({ ...base, plant: 'UB01', inclFrt: true })).toMatch(/InclFrt eq /);
    expect(analysisFilter({ ...base, plant: 'UB01', inclFrt: false })).toMatch(/InclFrt eq /);
  });
});
