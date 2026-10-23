import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { fetchCostLines } from '@/lib/sap/service';
import { defaultQuery } from '@/lib/query/schema';
import { excludeIncludedFreight, excludeIncludedFreightRmPm, isFreightIncluded, componentFreightInr, type FreightTagged } from '@/lib/cost/freightIncluded';
import { optionTotal } from '@/lib/rates/sources';
import { rateWithFreight } from '@/lib/rates/withFreight';
import { simulateRow, EMPTY_SIM } from '@/lib/cost/simulate';
import { rateSummary } from '@/lib/cost/rateSummary';
import { reconcile } from '@/lib/freight/breakup';
import { line, opt } from './helpers';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'FREIGHT_INCLUDED_SOURCES', 'NEXT_PUBLIC_FREIGHT_INCLUDED_SOURCES'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => { delete process.env.FREIGHT_INCLUDED_SOURCES; delete process.env.NEXT_PUBLIC_FREIGHT_INCLUDED_SOURCES; });
afterEach(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; resetSapConfig(); });

// SAP's figures for an MBEW line (live NGQ 23.10.2026: 104.54 + 10 standard freight = 114.54), ProdQty 2
const mbew = () => line({ Idnrk: 'RM1', HasChild: '', SelSource: 'MBEW', SelRatePcInr: '104.54', SelRatePcLoc: '104.54', FrtPcInr: '10', FrtPcLoc: '10', FrtSrc: 'STANDARD',
  TotCostPcInr: '114.54', TotCostPcLoc: '114.54', TotCostInr: '229.08', TotCostLoc: '229.08', ProdQty: '2', LocCurr: 'INR',
  RateOptions: [opt({ Source: 'MBEW', RatePcInr: '104.54', RatePcLoc: '104.54' }), opt({ Source: 'INFOREC', RatePcInr: '100', RatePcLoc: '100' }), opt({ Source: 'CONSUMP', RatePcInr: '101', RatePcLoc: '101' })] });

describe('Consumption / MBEW: no freight on top', () => {
  it('only CONSUMP and MBEW by default; the switch changes the list, empty turns it off', () => {
    expect(['CONSUMP', 'MBEW', 'mbew'].map(isFreightIncluded)).toEqual([true, true, true]);
    expect(['CONTRACT', 'INFOREC', 'MARKT', ''].map(isFreightIncluded)).toEqual([false, false, false, false]);
    process.env.FREIGHT_INCLUDED_SOURCES = '';
    expect(isFreightIncluded('MBEW')).toBe(false);
    expect(excludeIncludedFreight(mbew()).TotCostInr).toBe('229.08');
  });

  it('the line: totals without freight, freight 0, SAP freight kept; applying twice changes nothing', () => {
    const r = excludeIncludedFreight(mbew()) as ReturnType<typeof mbew> & FreightTagged;
    expect([r.TotCostPcInr, r.TotCostPcLoc, r.TotCostInr, r.TotCostLoc, r.FrtPcInr, r.FrtPcLoc]).toEqual(['104.54', '104.54', '209.08', '209.08', '0', '0']);
    expect([r.FrtIncluded, r.FrtPcInrSap, r.FrtPcLocSap]).toEqual([true, '10', '10']);
    expect(excludeIncludedFreight(r)).toBe(r);
    const c = line({ HasChild: '', SelSource: 'CONTRACT', FrtPcInr: '10', TotCostPcInr: '50', TotCostInr: '50' });
    expect(excludeIncludedFreight(c)).toBe(c); // other sources unchanged
    const parent = line({ HasChild: 'X', SelSource: 'MBEW', FrtPcInr: '10' });
    expect(excludeIncludedFreight(parent)).toBe(parent);
  });

  it('options: Consumption / MBEW without freight; Contract / Info record add the component freight', () => {
    const r = excludeIncludedFreight(mbew());
    const [m, ir, cs] = r.RateOptions ?? [];
    expect(optionTotal(m as never, r).toFixed(2)).toBe('209.08');
    expect(optionTotal(cs as never, r).toFixed(2)).toBe('202.00');
    expect(optionTotal(ir as never, r).toFixed(2)).toBe('220.00'); // (100 + 10) x 2
    expect(rateWithFreight(ir, r)!.inr.toFixed(2)).toBe('110.00');
    expect(componentFreightInr(r).toFixed(0)).toBe('10');
  });

  it('simulator: re-picking Info record adds the component freight, re-picking MBEW on a contract line drops it', () => {
    const r = excludeIncludedFreight(mbew());
    const toIr = simulateRow(r, { ...EMPTY_SIM, pick: 'priority', prio: ['INFOREC', 'MBEW'] });
    expect([toIr.source, toIr.frtPcInr.toFixed(0), toIr.total.toFixed(2)]).toEqual(['INFOREC', '10', '220.00']);
    const c = line({ HasChild: '', SelSource: 'CONTRACT', SelRatePcInr: '90', FrtPcInr: '10', TotCostPcInr: '100', TotCostInr: '200', ProdQty: '2', LocCurr: 'INR',
      RateOptions: [opt({ Source: 'CONTRACT', RatePcInr: '90' }), opt({ Source: 'MBEW', RatePcInr: '95' })] });
    const toMbew = simulateRow(c, { ...EMPTY_SIM, pick: 'priority', prio: ['MBEW', 'CONTRACT'] });
    expect([toMbew.source, toMbew.frtPcInr.toFixed(0), toMbew.total.toFixed(2)]).toEqual(['MBEW', '0', '190.00']);
  });

  it('rate summary: FG landed and freight follow; Info record + freight still uses the component freight', () => {
    const s = rateSummary([excludeIncludedFreight(mbew())] as never, 1);
    expect(s.fgs[0].landedPc!.toFixed(2)).toBe('209.08');
    expect(s.fgs[0].freightPc!.toFixed(2)).toBe('0.00');
    expect(s.fgs[0].withFrt.INFOREC.inr.value!.toFixed(2)).toBe('220.00');
  });

  it('freight break-up still reconciles against SAP\'s freight of the component', () => {
    const r = excludeIncludedFreight(mbew());
    expect(reconcile([{ UsedPcLoc: '10' } as never], r).matches).toBe(true);
  });

  it('RM / PM requirement rows: freight still shown on Consumption / MBEW, totals = rate (not added)', () => {
    const row = { RateSrc: 'CONSUMP', RatePcLoc: '5', RatePcInr: '5', RateCostLoc: '50', RateCostInr: '50', FrtPcLoc: '1', FrtPcInr: '1', FrtCostLoc: '10', FrtCostInr: '10', TotPcLoc: '6', TotPcInr: '6', TotCostLoc: '60', TotCostInr: '60' };
    expect(excludeIncludedFreightRmPm(row)).toMatchObject({ FrtPcInr: '1', FrtCostInr: '10', TotPcInr: '5', TotCostInr: '50', TotCostLoc: '50' });
    const ir = { ...row, RateSrc: 'INFOREC' };
    expect(excludeIncludedFreightRmPm(ir)).toBe(ir);
  });

  it('against the mock SAP: every Consumption / MBEW leaf from the costing call carries no freight', async () => {
    process.env.MOCK_SAP = 'true'; process.env.MOCK_SAP_DELAY_MS = '0'; resetSapConfig();
    const r = await fetchCostLines({ ...defaultQuery('B'), materials: ['FG1001', 'FG3001'], plants: ['1000'], prio: ['MBEW', 'CONSUMP', 'CONTRACT', 'INFOREC'] });
    const incl = r.rows.filter((l) => !l.HasChild?.trim() && ['MBEW', 'CONSUMP'].includes(l.SelSource));
    expect(incl.length).toBeGreaterThan(0);
    for (const l of incl) expect(Number(l.FrtPcInr)).toBe(0); // not added to any total
    expect(incl.some((l) => Number(componentFreightInr(l)) > 0)).toBe(true); // SAP's freight still there to show
  });
});
