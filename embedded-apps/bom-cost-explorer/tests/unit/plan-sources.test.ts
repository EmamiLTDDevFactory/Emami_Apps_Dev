import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { resetPlanMock } from '../../mock/plan';
import { PLAN_SOURCES, byCountry, componentRate, fgSources, type PlanLineWithOptions } from '@/lib/plan/sources';
import { costFilter, defaultPlanCostQuery } from '@/lib/plan/requests';
import { fetchPlanCostLines } from '@/lib/plan/client';
import { fetchRateOptionsByFilter, attachRateOptions, clearRatesCache } from '@/lib/rates/options';
import { resetRatesCapability } from '@/lib/rates/capability';
import { isLeafRow } from '@/lib/cost/tree';
import { D, ZERO } from '@/lib/cost/decimal';
import type { CostLine } from '@/lib/sap/fields';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_RATES'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetPlanMock();
  clearRatesCache();
  resetRatesCapability('NGD');
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

const opt = (Source: string, RatePcInr: string, Plant = '1000') => ({ Source, RatePcInr, Plant } as never);
const line = (p: Partial<PlanLineWithOptions>): PlanLineWithOptions => ({
  Seqnr: 1, Land1: 'IN', Landx: 'India', Hwerks: '1000', Werks: '1000', Headmat: 'FG1', Headtxt: 'FG one', Level: 1, Parent: 'FG1', Idnrk: 'C1', Maktx: 'c', Mtart: 'ROH', Meins: 'KG',
  HasChild: '', Stlal: '02', ItemStlal: '01', BomSrc: 'OWN', BomPlant: '1000', PlanQty: '100', QtyTot: '10', SelSource: 'CONTRACT', SelRatePcInr: '5', BudLanded: '6', TotCostInr: '55', RateOptions: [], ...p,
} as PlanLineWithOptions);

describe('component rate per source', () => {
  it('budget = BudLanded, selected = SelRatePcInr, MBEW / Consumption from the rate options (own plant first)', () => {
    const l = line({ RateOptions: [opt('MBEW', '7', '1100'), opt('MBEW', '4'), opt('CONSUMP', '3')] });
    expect(componentRate(l, 'BUDGET')!.toString()).toBe('6');
    expect(componentRate(l, 'SELECTED')!.toString()).toBe('5');
    expect(componentRate(l, 'MBEW')!.toString()).toBe('4');
    expect(componentRate(l, 'CONSUMP')!.toString()).toBe('3');
  });
  it('no rate = null (not 0): no budget, no option, blank SelSource', () => {
    const l = line({ BudLanded: '0', SelSource: '', RateOptions: [] });
    for (const s of PLAN_SOURCES) expect(componentRate(l, s)).toBeNull();
  });
});

describe('FG per piece', () => {
  it('sum of rate x QtyTot over leaves / PlanQty; parents ignored; unpriced counted, not zeroed; lowest = cheapest complete source', () => {
    const rows = [
      line({ Idnrk: 'SF', HasChild: 'X', QtyTot: '999', SelRatePcInr: '999', BudLanded: '999' }),
      line({ Idnrk: 'C1', QtyTot: '10', SelRatePcInr: '5', BudLanded: '6', TotCostInr: '55', RateOptions: [opt('MBEW', '4'), opt('CONSUMP', '3')] }),
      line({ Idnrk: 'C2', QtyTot: '20', SelRatePcInr: '2', BudLanded: '1', TotCostInr: '45', RateOptions: [opt('MBEW', '2')] }),
    ];
    const [fg] = fgSources(rows);
    expect(fg.stlal).toBe('02');
    expect(fg.sources.SELECTED.perPc!.toString()).toBe('0.9'); // (5*10 + 2*20) / 100
    expect(fg.sources.BUDGET.perPc!.toString()).toBe('0.8'); // (6*10 + 1*20) / 100
    expect(fg.sources.MBEW.perPc!.toString()).toBe('0.8'); // (4*10 + 2*20) / 100
    expect(fg.sources.CONSUMP).toMatchObject({ priced: 1, leaves: 2 }); // C2 has no CONSUMP option
    expect(fg.sources.CONSUMP.perPc!.toString()).toBe('0.3');
    expect(fg.selectedInclFrt!.toString()).toBe('1'); // (55 + 45) / 100
    expect(['BUDGET', 'MBEW']).toContain(fg.lowest); // CONSUMP is incomplete, so never "lowest"
  });
  it('PlanQty 0 gives no per-piece figure', () => {
    const [fg] = fgSources([line({ PlanQty: '0' })]);
    for (const s of PLAN_SOURCES) expect(fg.sources[s].perPc).toBeNull();
    expect(fg.selectedInclFrt).toBeNull();
  });
  it('country segregation keeps first-seen order', () => {
    const fg = fgSources([line({ Headmat: 'A', Land1: 'IN' }), line({ Headmat: 'B', Land1: 'AE', Landx: 'UAE', Hwerks: 'AE10' }), line({ Headmat: 'C', Land1: 'IN', Hwerks: '1100' })]);
    expect(byCountry(fg).map((c) => `${c.land1}:${c.rows.length}`)).toEqual(['IN:2', 'AE:1']);
  });
});

describe('budget in the plan run', () => {
  it('default query asks SAP for budget rates for the current year', () => {
    const f = costFilter(defaultPlanCostQuery('P'));
    expect(f).toContain('InclBudget eq true');
    expect(f).toContain(`BudgetYr eq '${new Date().getFullYear()}'`);
  });
  it('against the mock: budget, selected and (with rate options) MBEW / Consumption per FG piece', async () => {
    process.env.MOCK_SAP_RATES = 'direct-works';
    const q = { ...defaultPlanCostQuery('FY27-BASE'), plants: ['1000'] };
    const { rows } = await fetchPlanCostLines(q);
    expect(rows.filter(isLeafRow).every((l) => D(l.BudLanded).gt(0))).toBe(true);
    const opts = await fetchRateOptionsByFilter(costFilter(q), {});
    expect('rows' in opts).toBe(true);
    const lines = attachRateOptions(rows as unknown as CostLine[], 'rows' in opts ? opts.rows : []) as unknown as PlanLineWithOptions[];
    const fg = fgSources(lines);
    expect(fg.length).toBeGreaterThan(0);
    for (const f of fg) {
      expect(f.sources.BUDGET.perPc!.gt(0)).toBe(true);
      expect(f.sources.SELECTED.perPc!.gt(0)).toBe(true);
      expect(f.sources.MBEW.priced).toBeGreaterThan(0);
      const sel = lines.filter((l) => isLeafRow(l) && `${l.Land1}|${l.Hwerks}|${l.Headmat}` === f.key && l.SelSource).reduce((a, l) => a.plus(D(l.SelRatePcInr).times(D(l.QtyTot))), ZERO);
      expect(f.sources.SELECTED.perPc!.minus(sel.div(f.planQty)).abs().lt(1e-12)).toBe(true);
    }
  });
});
