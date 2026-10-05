import { describe, expect, it } from 'vitest';
import { analyse, dataQuality, diffScenarios, minCover } from '@/lib/cost/analytics';
import { EMPTY_SIM, simulate } from '@/lib/cost/simulate';
import { queryTable } from '@/lib/cost/table';
import { VIEW_COLUMNS } from '@/lib/views';
import { leaf, parent, opt } from './helpers';

describe('coverage', () => {
  it('999 means unlimited and is excluded', () => {
    expect(minCover(leaf(1, 1, 'A', '1', '0', '1', { CovH1: '999', CovH2: '999', CovH3: '999', ReqH1: '0' }))).toBeNull();
    expect(minCover(leaf(1, 1, 'A', '1', '0', '1', { CovH1: '12', CovH2: '999', CovH3: '40' }))).toBe(12);
  });
});

describe('dashboard', () => {
  const rows = [
    parent(1, 1, 'P', '1000'),
    leaf(2, 2, 'A', '10', '2', '10', { CovH1: '5', CovH2: '20', CovH3: '999', BudLanded: '10' }), // 120, budget 100
    leaf(3, 2, 'B', '0', '1', '10'), // no rate, freight 10
    leaf(4, 1, 'C', '5', '0', '2', { Donor: '1100' }), // 10
  ];
  const a = analyse(rows, simulate(rows, EMPTY_SIM), { coverDays: 10 });
  it('totals are leaf sums', () => expect(a.kpis.total.toFixed(2)).toBe('140.00'));
  it('freight share', () => expect(a.kpis.freightShare!.toFixed(4)).toBe(((30 / 140) * 100).toFixed(4)));
  it('counts no-rate, donor and low coverage', () => {
    expect(a.kpis.noRate).toBe(1);
    expect(a.kpis.donor).toBe(1);
    expect(a.kpis.lowCover).toBe(1);
    expect(a.kpis.lowCoverValue.toFixed(2)).toBe('120.00');
  });
  it('budget variance = (TotCostPcInr - BudLanded) x qty', () => expect(a.kpis.budgetVariance.toFixed(2)).toBe('20.00'));
  it('cost by source labels blank as NO RATE', () => expect(a.bySource.map(([s]) => s)).toContain('NO RATE'));
});

describe('data quality', () => {
  it('flags no rate, UoM hints, zero FX and donor rows', () => {
    const rows = [
      leaf(1, 1, 'A', '0', '0', '1'),
      leaf(2, 1, 'B', '5', '0', '1', { SelRate: '5000', SelRatePc: '0', SelFx: '1', SelFxInr: '1' }),
      leaf(3, 1, 'C', '5', '0', '1', { SelFx: '0', SelFxInr: '1', SelRate: '5' }),
      leaf(4, 1, 'D', '5', '0', '1', { Donor: '1100', SelFx: '1', SelFxInr: '1', SelRate: '5', RateOptions: [opt({ Uom: 'KG', Rate: '3', RatePc: '0' })] }),
    ];
    const kinds = dataQuality(rows).map((d) => `${rows[d.i].Idnrk}:${d.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(['A:NO_RATE', 'B:UOM', 'C:ZERO_FX', 'D:DONOR', 'D:UOM']));
  });
});

describe('scenario diff', () => {
  const base = [leaf(1, 1, 'A', '10', '1', '10'), leaf(2, 1, 'B', '5', '0', '4')];
  it('the waterfall adds up exactly to the delta', () => {
    const other = [leaf(1, 1, 'A', '12', '1.5', '20'), leaf(3, 1, 'C', '7', '0', '1')];
    const d = diffScenarios({ rows: base, vals: simulate(base, EMPTY_SIM) }, { rows: other, vals: simulate(other, EMPTY_SIM) });
    expect(d.delta.toFixed(2)).toBe((277 - 130).toFixed(2));
    const sumSteps = d.waterfall.reduce((a, w) => a.plus(w.value), d.base.minus(d.base));
    expect(sumSteps.toFixed(6)).toBe(d.delta.toFixed(6));
    const by = Object.fromEntries(d.waterfall.map((w) => [w.label, w.value.toFixed(2)]));
    expect(by.Quantity).toBe('110.00'); // (20-10) x 11
    expect(by.Rate).toBe('40.00'); // (12-10) x 20
    expect(by.Freight).toBe('10.00'); // 0.5 x 20
    expect(by['Plant / structure']).toBe('-13.00'); // +7 (C) - 20 (B)
  });
  it('splits FX out when the currency is the same', () => {
    const usd = (r: string, rInr: string) => leaf(1, 1, 'A', rInr, '0', '10', { SelCurr: 'USD', SelRatePc: r });
    const a = [usd('1', '80')];
    const b = [usd('1.1', '92.4')]; // price 1 -> 1.1 USD, FX 80 -> 84
    const d = diffScenarios({ rows: a, vals: simulate(a, EMPTY_SIM) }, { rows: b, vals: simulate(b, EMPTY_SIM) });
    const by = Object.fromEntries(d.waterfall.map((w) => [w.label, w.value.toFixed(2)]));
    expect(by.FX).toBe('44.00'); // (84-80) x 1.1 x 10
    expect(by.Rate).toBe('80.00'); // (1.1-1) x 80 x 10
  });
});

describe('server-side table (R/F/M paging)', () => {
  const rows = [
    { Material: 'A', Plant: '1000', Currency: 'INR', Localcurrency: 'INR', Actualdelvcostamount: '10.5', Stddelvcostamount: '1', Actualdelvquantity: '1', Stddelvquantity: '1', UsedSrc: 'ACTUAL' },
    { Material: 'B', Plant: 'BD10', Currency: 'BDT', Localcurrency: 'BDT', Actualdelvcostamount: '200', Stddelvcostamount: '1', Actualdelvquantity: '2', Stddelvquantity: '1', UsedSrc: 'STANDARD' },
    { Material: 'C', Plant: '1000', Currency: 'INR', Localcurrency: 'INR', Actualdelvcostamount: '0.2', Stddelvcostamount: '1', Actualdelvquantity: '3', Stddelvquantity: '1', UsedSrc: 'ACTUAL' },
  ];
  const page = { top: 2, skip: 0, dir: 'asc' as const, search: '', filters: {}, all: false };
  it('totals per currency across all pages', () => {
    const r = queryTable(rows, VIEW_COLUMNS.F, page);
    expect(r.total).toBe(3);
    expect(r.rows.length).toBe(2);
    expect(r.totals.Actualdelvcostamount).toEqual({ INR: '10.7', BDT: '200' });
  });
  it('sorts decimals numerically and filters', () => {
    const r = queryTable(rows, VIEW_COLUMNS.F, { ...page, sort: 'Actualdelvcostamount', dir: 'desc', top: 10 });
    expect(r.rows.map((x) => x.Material)).toEqual(['B', 'A', 'C']);
    expect(queryTable(rows, VIEW_COLUMNS.F, { ...page, filters: { UsedSrc: '=actual' } }).total).toBe(2);
    expect(queryTable(rows, VIEW_COLUMNS.F, { ...page, search: 'bd10' }).total).toBe(1);
  });
});
