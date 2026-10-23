import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { costQuerySchema, defaultQuery } from '@/lib/query/schema';
import { api } from '@/lib/client/api';
import { isPlantRun, plantFgRequest } from '@/lib/client/plantRun';
import { rateSummary } from '@/lib/cost/rateSummary';
import type { CostLine } from '@/lib/sap/fields';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => { process.env.MOCK_SAP = 'true'; process.env.MOCK_SAP_DELAY_MS = '0'; resetSapConfig(); mockRequestLog.length = 0; });
afterEach(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; resetSapConfig(); });
const set = (u: string) => u.split('?')[0].split('/').pop();

describe('plant run: BOM costing with materials left empty', () => {
  it('validation: BOM costing may leave materials empty with a plant; other modes and no plant still need one', () => {
    expect(costQuerySchema.safeParse({ ...defaultQuery('B'), plants: ['1000'] }).success).toBe(true);
    expect(costQuerySchema.safeParse({ ...defaultQuery('B') }).success).toBe(false);
    expect(costQuerySchema.safeParse({ ...defaultQuery('R'), plants: ['1000'] }).success).toBe(false);
    expect(isPlantRun({ mode: 'B', materials: [], plants: ['1000'] })).toBe(true);
    expect(isPlantRun({ mode: 'B', materials: ['FG1001'], plants: ['1000'] })).toBe(false);
  });

  it('finished goods of the plant: MaterialVHSet (Werks) and Mtart eq FERT', () => {
    expect(plantFgRequest(['1000']).params.$filter).toBe("Werks eq '1000' and Mtart eq 'FERT'");
    expect(plantFgRequest(['1000', '1100']).params.$filter).toBe("(Werks eq '1000' or Werks eq '1100') and Mtart eq 'FERT'");
  });

  it('costs every FG of the plant in batches, one combined result, materials-run unchanged', async () => {
    const r = await api.cost({ ...defaultQuery('B'), plants: ['1000'] });
    expect(mockRequestLog.map(set)[0]).toBe('MaterialVHSet');
    expect(mockRequestLog.slice(1).every((u) => set(u) === 'CostLineSet')).toBe(true);
    expect(r.plantRun!.fgs).toBeGreaterThan(1);
    expect(new Set(r.rows.map((l) => l.Headmat)).size).toBe(r.plantRun!.fgs);
    expect(r.resolvedMaterials).toHaveLength(r.plantRun!.fgs);
    expect(r.messages[0].code).toBe('APP/PLANT');
    for (const u of mockRequestLog) expect(u).not.toContain('+');
    mockRequestLog.length = 0;
    const one = await api.cost({ ...defaultQuery('B'), materials: ['FG1001'], plants: ['1000'] });
    expect(mockRequestLog.map(set)).toEqual(['CostLineSet']); // a normal run is exactly as before
    expect(one.plantRun).toBeUndefined();
  });
});

describe('rate summary', () => {
  const L = (o: Record<string, unknown>) => ({ Land1: 'IN', Hwerks: '1000', Werks: '1000', Headmat: 'FG1', Headtxt: 'Oil', HasChild: '', Mtart: 'ROH', Matkl: '101', Meins: 'KG', Maktx: '', SelSource: 'CONTRACT', ProdQty: '1', TotCostInr: '0', FrtPcInr: '0', BudLanded: '0', SelRatePcInr: '0', ...o }) as unknown as CostLine;
  const opt = (Source: string, RatePcInr: string, Plant = '1000') => ({ Source, RatePcInr, Plant });
  const lines = [
    L({ Idnrk: 'RM1', ProdQty: '2', SelRatePcInr: '100', BudLanded: '90', TotCostInr: '210', FrtPcInr: '5', RateOptions: [opt('CONTRACT', '100'), opt('MBEW', '95'), opt('CONSUMP', '120')] }),
    L({ Idnrk: 'PM1', Mtart: 'VERP', ProdQty: '10', SelRatePcInr: '3', BudLanded: '0', TotCostInr: '30', RateOptions: [opt('INFOREC', '3'), opt('MBEW', '2.5')] }),
  ];

  it('FG cost per piece per rate type; incomplete types are counted, not zeroed', () => {
    const s = rateSummary(lines, '1');
    const f = s.fgs[0];
    expect(f.perPc.SELECTED.value!.toNumber()).toBe(230); // 2 x 100 + 10 x 3
    expect(f.perPc.MBEW.value!.toNumber()).toBe(215); // 2 x 95 + 10 x 2.5
    expect(f.perPc.BUDGET).toMatchObject({ priced: 1, leaves: 2 }); // PM1 has no budget
    expect(f.perPc.CHEAPEST.value!.toNumber()).toBe(215);
    expect(f.landedPc!.toNumber()).toBe(240);
    expect(f.cheapestType).toBe('MBEW');
  });

  it('RM and PM components with every rate type, lowest and spread', () => {
    const s = rateSummary(lines, '1');
    expect(s.rm.map((c) => c.idnrk)).toEqual(['RM1']);
    expect(s.pm.map((c) => c.idnrk)).toEqual(['PM1']);
    const rm = s.rm[0];
    expect(rm.rates.CONSUMP!.toNumber()).toBe(120);
    expect(rm.lowestType).toBe('BUDGET'); // 90
    expect(rm.spreadPct!.toFixed(2)).toBe('33.33'); // (120 - 90) / 90
  });

  it('per piece divides by the explosion quantity', () => {
    expect(rateSummary(lines, '10').fgs[0].perPc.SELECTED.value!.toNumber()).toBe(23);
  });
});
