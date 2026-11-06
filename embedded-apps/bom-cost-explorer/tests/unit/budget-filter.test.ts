import { describe, expect, it } from 'vitest';
import { FilterError } from '@/lib/sap/filter';
import { buildBudgetFilter, buildPendingFilter, defaultBudgetQuery, overridesParam, validateBudget, type BudgetQuery } from '@/lib/budget/filter';

const q = (p: Partial<BudgetQuery> = {}): BudgetQuery => ({ ...defaultBudgetQuery(new Date('2026-11-04')), budatFrom: '2026-04-01', budatTo: '2026-09-30', plants: ['1000'], ...p });

describe('budget filter: the SAP selection-screen rules', () => {
  it('material type, posting date from, budget year and rate year are required (the report refuses without them)', () => {
    const e = validateBudget(q({ mtart: [], budatFrom: '', budgetYr: '', rateYr: '' }));
    expect(Object.keys(e).sort()).toEqual(['budatFrom', 'budgetYr', 'mtart', 'rateYr']);
    expect(() => buildBudgetFilter(q({ budatFrom: '' }))).toThrow(FilterError);
  });
  it('several material types go to SAP as one OR group, in upper case', () => {
    const f = buildBudgetFilter(q({ mtart: ['fert', 'HALB'] }));
    expect(f).toContain("Mtart eq 'FERT'");
    expect(f).toContain("Mtart eq 'HALB'");
    expect(f).toMatch(/\(Mtart eq 'FERT' or Mtart eq 'HALB'\)/);
  });
  it('end date before start date is refused', () => { expect(validateBudget(q({ budatFrom: '2026-10-01', budatTo: '2026-04-01' })).budatTo).toBeTruthy(); });
  it('a plant is needed, and a request takes exactly one plant', () => {
    expect(validateBudget(q({ plants: [] })).plants).toBeTruthy();
    expect(() => buildBudgetFilter(q({ plants: ['1000', '1100'] }))).toThrow(/one plant per request/);
    expect(buildBudgetFilter(q({ plants: ['1000', '1100'] }), { werks: '1100' })).toContain("Werks eq '1100'");
  });
  it('dates are datetime literals, flags are X only when on, business line only without exclude division', () => {
    const f = buildBudgetFilter(q());
    expect(f).toContain("BudatFrom eq datetime'2026-04-01T00:00:00'");
    expect(f).toContain("BudatTo eq datetime'2026-09-30T00:00:00'");
    expect(f).toContain("ExclManuf eq 'X'");
    expect(f).toContain("OneSkuPerCrs eq 'X'");
    expect(f).toContain("Business eq '01'");
    expect(f).not.toContain('OnlyOverrides');
    expect(f).not.toContain('Checklist');
    const all = buildBudgetFilter(q({ exclDiv: true }));
    expect(all).toContain("ExclDiv eq 'X'");
    expect(all).not.toContain('Business eq');
  });
  it('direct purchase products only with the goods receipt source (as in the report)', () => {
    expect(buildBudgetFilter(q({ inclDirect: true, source: 'P' }))).not.toContain('InclDirect');
    expect(buildBudgetFilter(q({ inclDirect: true, source: 'G' }))).toContain("InclDirect eq 'X'");
  });
  it('several materials / schemes become an or-group; quotes are doubled; no "+" anywhere', () => {
    const f = buildBudgetFilter(q({ materials: ['FG1001', "O'NEIL"], schemes: ['F', 'C'], plans: ['FY27 BASE'] }));
    expect(f).toContain("(Matnr eq 'FG1001' or Matnr eq 'O''NEIL')");
    expect(f).toContain("(Scheme eq 'F' or Scheme eq 'C')");
    expect(f).not.toContain('+');
  });
  it('cost overrides are one string, at most 20, numbers only', () => {
    expect(overridesParam([{ matnr: 'rm1', value: '12.5', pct: '' }, { matnr: 'rm2', value: '', pct: '5' }, { matnr: '', value: '1', pct: '1' }])).toBe('RM1|12.5|0;RM2|0|5');
    expect(validateBudget(q({ overrides: [{ matnr: 'RM1', value: 'abc', pct: '' }] })).overrides).toBeTruthy();
    expect(validateBudget(q({ overrides: Array.from({ length: 21 }, (_, i) => ({ matnr: `M${i}`, value: '1', pct: '' })) })).overrides).toMatch(/At most 20/);
    expect(buildBudgetFilter(q({ overrides: [{ matnr: 'RM1', value: '12.5', pct: '' }] }))).toContain("Overrides eq 'RM1|12.5|0'");
  });
  it('AppUser is sent lower-cased when given; the approver filter needs it', () => {
    expect(buildBudgetFilter(q(), { appUser: 'A.B@Emami.IN' })).toContain("AppUser eq 'a.b@emami.in'");
    expect(() => buildPendingFilter('')).toThrow(FilterError);
    expect(buildPendingFilter('x@y.in', { gjahr: '2026', version: '03' })).toBe("AppUser eq 'x@y.in' and Gjahr eq '2026' and Version eq '03'");
  });
});

describe('cost override numbers', () => {
  it("a lone '-' or '.' is refused; numbers and empty (sent as 0) pass", () => {
    for (const bad of ['-', '.', '-.', '1.2.3', 'abc']) expect(validateBudget(q({ overrides: [{ matnr: 'RM1', value: bad, pct: '' }] })).overrides).toBeTruthy();
    for (const ok of ['', '12', '-12.5', '.5', '7.']) expect(validateBudget(q({ overrides: [{ matnr: 'RM1', value: ok, pct: '' }] })).overrides).toBeUndefined();
  });
});
