import { describe, expect, it } from 'vitest';
import { buildSelectionFilter, eqClause, FilterError, literal, odataDate, odataDecimal, odataString } from '@/lib/sap/filter';
import { costRequest, materialSearchRequest, pagedRequest, plantsRequest, configRequest } from '@/lib/sap/requests';
import { ENTITY_SET, MODE_TO_ENTITY } from '@/lib/sap/entities';
import { defaultQuery, type CostQuery } from '@/lib/query/schema';

const q = (p: Partial<CostQuery>): CostQuery => ({ ...defaultQuery(p.mode ?? 'B'), ...p });

describe('OData literals', () => {
  it('quotes strings and doubles embedded quotes', () => {
    expect(odataString('FG1001')).toBe("'FG1001'");
    expect(odataString("O'Neil's")).toBe("'O''Neil''s'");
  });
  it('writes Edm.Decimal with the m suffix', () => {
    expect(odataDecimal('1')).toBe('1m');
    expect(odataDecimal('2.5')).toBe('2.5m');
    expect(odataDecimal('2.500')).toBe('2.5m');
    expect(odataDecimal('1000')).toBe('1000m');
    expect(() => odataDecimal('abc')).toThrow();
  });
  it('writes datetime literals at midnight', () => {
    expect(odataDate('2026-03-31')).toBe("datetime'2026-03-31T00:00:00'");
    expect(literal('t', '2026-01-05')).toBe("datetime'2026-01-05T00:00:00'");
  });
  it('writes ABAP char flags as quoted X / empty', () => {
    expect(literal('f', true)).toBe("'X'");
    expect(literal('f', false)).toBe("''");
  });
  it('writes booleans and ints bare', () => {
    expect(literal('b', true)).toBe('true');
    expect(literal('b', false)).toBe('false');
    expect(literal('i', 365)).toBe('365');
    expect(() => literal('i', 1.5)).toThrow();
  });
});

describe('eqClause', () => {
  it('ORs multiple values of one field in parentheses and dedupes', () => {
    expect(eqClause('Werks', ['1000', '1100', '1000'])).toBe("(Werks eq '1000' or Werks eq '1100')");
    expect(eqClause('Werks', ['1000'])).toBe("Werks eq '1000'");
    expect(eqClause('Werks', [])).toBeNull();
  });
});

describe('buildSelectionFilter', () => {
  it('mode B sends the costing parameters joined by and', () => {
    const f = buildSelectionFilter(q({ mode: 'B', materials: ['FG1', "A'B"], plants: ['1000'], explQty: '2.5', inclBudget: true, budgetYr: 2026, donorPlant: '1100' }));
    expect(f).toContain("Mode eq 'B'");
    expect(f).toContain("(Matnr eq 'FG1' or Matnr eq 'A''B')");
    expect(f).toContain('ExplQty eq 2.5m');
    expect(f).toContain('InclFrt eq true');
    expect(f).toContain('StdFrt eq false');
    expect(f).toContain("InclBudget eq true and BudgetYr eq '2026'"); // BudgetYr is NUMC on the live service
    expect(f).toContain("Prio eq 'CONTRACT,INFOREC,MARKT,CONSUMP,MBEW'");
    expect(f).toContain("DonorPlant eq '1100'");
    expect(f).not.toContain('FreightDays');
    expect(f).not.toContain('LatestOnly');
    expect(f.split(' and ').length).toBeGreaterThan(8);
  });
  it('mode C sends one BOM plant as Werks and the comparison plants as Cplnt', () => {
    const f = buildSelectionFilter(q({ mode: 'C', materials: ['FG1'], bomPlant: '1000', compPlants: ['1000', 'BD10'] }));
    expect(f).toContain("Werks eq '1000'");
    expect(f).toContain("(Cplnt eq '1000' or Cplnt eq 'BD10')");
    expect(f).not.toContain('InclBudget');
  });
  it('mode R only sends materials, plants and look-back', () => {
    const f = buildSelectionFilter(q({ mode: 'R', materials: ['RM1'], plants: ['1000'], lookback: 90 }));
    expect(f).toBe("Mode eq 'R' and Matnr eq 'RM1' and Werks eq '1000' and Lookback eq 90");
  });
  it('mode F sends freight days, standard freight and latest-only', () => {
    const f = buildSelectionFilter(q({ mode: 'F', materials: ['RM1'], plants: ['1000'], freightDays: 30, latestOnly: false, stdFrt: true }));
    // Flags are ABAP char fields on FreightRowSet: 'X' / '' (booleans fail with "Invalid parametertype").
    expect(f).toBe("Mode eq 'F' and Matnr eq 'RM1' and Werks eq '1000' and FreightDays eq 30 and StdFrt eq 'X' and LatestOnly eq ''");
  });
  it('as-of and actual window dates are datetime literals', () => {
    const f = buildSelectionFilter(q({ mode: 'B', materials: ['FG1'], plants: ['1000'], useAsof: true, asofDate: '2026-04-01', budatFrom: '2026-01-01', budatTo: '2026-03-31' }));
    expect(f).toContain("UseAsof eq true and AsofDate eq datetime'2026-04-01T00:00:00'");
    expect(f).toContain("BudatFrom eq datetime'2026-01-01T00:00:00' and BudatTo eq datetime'2026-03-31T00:00:00'");
  });
  it('omits MaxLevel 0 (all levels) and sends it otherwise', () => {
    expect(buildSelectionFilter(q({ materials: ['FG1'], plants: ['1000'] }))).not.toContain('MaxLevel');
    expect(buildSelectionFilter(q({ materials: ['FG1'], plants: ['1000'], maxLevel: 2 }))).toContain('MaxLevel eq 2');
  });
});

describe('mandatory Matnr / Werks', () => {
  it('throws before calling SAP when either is missing', () => {
    expect(() => buildSelectionFilter(q({ mode: 'R', materials: [], plants: ['1000'] }))).toThrow(FilterError);
    expect(() => buildSelectionFilter(q({ mode: 'R', materials: ['RM1'], plants: [] }))).toThrow(FilterError);
    expect(() => buildSelectionFilter(q({ mode: 'C', materials: ['FG1'], bomPlant: '', compPlants: ['1000'] }))).toThrow(/BOM plant/);
  });
});

describe('request builders (entity set names)', () => {
  it('maps every mode to its entity set', () => {
    expect(MODE_TO_ENTITY).toEqual({ B: 'CostLineSet', C: 'CostLineSet', R: 'RateRowSet', F: 'FreightRowSet', M: 'RmPmRowSet' });
  });
  it('expands RateOptions for mode B only', () => {
    const b = costRequest(q({ mode: 'B', materials: ['FG1'], plants: ['1000'] }));
    expect(b.entitySet).toBe(ENTITY_SET.COST_LINES);
    expect(b.params.$expand).toBe('RateOptions');
    const c = costRequest(q({ mode: 'C', materials: ['FG1'], bomPlant: '1000', compPlants: ['1100'] }));
    expect(c.entitySet).toBe('CostLineSet');
    expect(c.params.$expand).toBeUndefined();
  });
  it('pages the row sets with $top/$skip/$inlinecount', () => {
    const r = pagedRequest(q({ mode: 'M', materials: ['FG1'], plants: ['1000'] }), 5000, 10000);
    expect(r.entitySet).toBe('RmPmRowSet');
    expect(r.params).toMatchObject({ $top: '5000', $skip: '10000', $inlinecount: 'allpages' });
    expect(r.params.$filter).toContain("StdFrt eq ''");
  });
  it('type-ahead on MaterialVHSet uses ?search=, never $filter, min 2 chars, max 100', () => {
    expect(materialSearchRequest('o')).toBeNull();
    const m = materialSearchRequest('  navratna ')!;
    expect(m.entitySet).toBe('MaterialVHSet');
    expect(m.params).toEqual({ search: 'navratna', $top: '100' });
  });
  it('value helps and config', () => {
    expect(plantsRequest().entitySet).toBe('PlantVHSet');
    expect(configRequest().entitySet).toBe('ConfigItemSet');
  });
});
