import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchCostLines } from '@/lib/sap/service';
import { resetSapConfig } from '@/lib/sap/config';
import { buildSelectionFilter } from '@/lib/sap/filter';
import { mockRequestLog } from '../../mock/sap';
import { resetPlanMock } from '../../mock/plan';
import { defaultQuery, type CostQuery } from '@/lib/query/schema';
import { resetRatesCapability } from '@/lib/rates/capability';
import { attachRateOptions, clearRatesCache, directRequest, expandRequest, fetchRateOptions } from '@/lib/rates/options';
import { rateOptionFilter } from '@/lib/rates/optionFilter';
import { PRIO_PRESETS, parsePrio, prioFromItems, prioItems, prioLabel, prioString } from '@/lib/rates/priority';
import { integrityMessage, ratesIntegrity } from '@/lib/rates/integrity';
import { MBEW_ONLY_HINT, rateCoverage } from '@/lib/rates/coverage';
import { cheapestWhatIf, repickByPriority, sourceMatrix } from '@/lib/rates/whatif';
import { costFilter, defaultPlanCostQuery } from '@/lib/plan/requests';
import { headerRollups } from '@/lib/plan/maths';
import { fetchPlanCostLines } from '@/lib/plan/client';
import { uploadPlan } from '@/lib/plan/write';
import { isLeafRow } from '@/lib/cost/tree';
import type { CostLine } from '@/lib/sap/fields';
import { line as leaf, opt as baseOpt } from './helpers';
import type { RateOptionRow } from '@/lib/rates/fields';
const opt = (p: Partial<RateOptionRow>) => ({ ...baseOpt(p), ...p }) as RateOptionRow;

const q = (p: Partial<CostQuery> = {}): CostQuery => ({ ...defaultQuery('B'), materials: ['FG1001'], plants: ['1000'], ...p });
const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_EXPAND_501', 'MOCK_SAP_RATES', 'SAP_EXPAND_RATE_OPTIONS', 'NEXT_PUBLIC_RATES_PROBE_MATNR', 'NEXT_PUBLIC_RATES_PROBE_WERKS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetRatesCapability('NGD');
  clearRatesCache();
  resetPlanMock();
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

const filterOf = (u: string) => decodeURIComponent((/[?&]\$filter=([^&]*)/.exec(u) ?? [])[1] ?? '');
const path = (u: string) => u.split('?')[0];

describe('priority editor -> Prio', () => {
  it('Prio is built from the editor order; MARKT only when checked; upper case, comma separated, no spaces', () => {
    let items = prioItems(PRIO_PRESETS[0].prio); // Report default: no MARKT
    expect(items.map((i) => `${i.source}:${i.on ? 1 : 0}`)).toEqual(['CONTRACT:1', 'INFOREC:1', 'CONSUMP:1', 'MBEW:1', 'MARKT:0']);
    expect(prioString(prioFromItems(items))).toBe('CONTRACT,INFOREC,CONSUMP,MBEW');
    // drag MBEW to the top, tick MARKT
    items = [items[3], items[0], items[1], items[2], { ...items[4], on: true }];
    const prio = prioFromItems(items);
    expect(prioString(prio)).toBe('MBEW,CONTRACT,INFOREC,CONSUMP,MARKT');
    expect(buildSelectionFilter(q({ prio: prio as CostQuery['prio'] }))).toContain("Prio eq 'MBEW,CONTRACT,INFOREC,CONSUMP,MARKT'");
    expect(buildSelectionFilter(q({ prio: ['CONTRACT', 'MBEW'] }))).toContain("Prio eq 'CONTRACT,MBEW'");
    expect(buildSelectionFilter(q({ prio: ['CONTRACT', 'MBEW'] }))).not.toContain('MARKT');
    expect(prioString([' contract ', 'mbew', 'MBEW'])).toBe('CONTRACT,MBEW');
    expect(parsePrio('contract, Inforec ,MBEW')).toEqual(['CONTRACT', 'INFOREC', 'MBEW']);
    expect(prioLabel(['CONTRACT', 'MBEW'])).toBe('CONTRACT > C-MAP');
  });
  it('plan breakup: default priority = Report default; the editor value goes into the Mode P filter', () => {
    expect(costFilter(defaultPlanCostQuery('P'))).toContain("Prio eq 'CONTRACT,INFOREC,CONSUMP,MBEW'");
    expect(costFilter({ ...defaultPlanCostQuery('P'), prio: prioString(PRIO_PRESETS[1].prio) })).toContain("Prio eq 'CONTRACT,INFOREC,MARKT,CONSUMP,MBEW'");
  });
});

describe('donor plant and look-back appear only when set', () => {
  it('costing: DonorPlant only with a donor; Lookback carries the chosen value', () => {
    expect(buildSelectionFilter(q())).not.toContain('DonorPlant');
    expect(buildSelectionFilter(q({ donorPlant: '1100' }))).toContain("DonorPlant eq '1100'");
    expect(buildSelectionFilter(q({ lookback: 730 }))).toContain('Lookback eq 730');
  });
  it('plan: DonorPlant and Lookback only when set', () => {
    const base = defaultPlanCostQuery('P');
    expect(costFilter({ ...base, donorPlant: '' })).not.toContain('DonorPlant');
    expect(costFilter({ ...base, donorPlant: 'ub01' })).toContain("DonorPlant eq 'UB01'");
    expect(costFilter({ ...base, lookback: 0 })).not.toContain('Lookback');
    expect(costFilter({ ...base, lookback: 1095 })).toContain('Lookback eq 1095');
  });
});

describe('rate options loading against the mock', () => {
  it('direct set works: RateOptionSet with the costing filter (only the CHAR1 flags rewritten), no "+" in URLs', async () => {
    process.env.MOCK_SAP_RATES = 'direct-works';
    const query = q({ plants: ['1000', '1100'], donorPlant: '1200', lookback: 730 });
    const cost = await fetchCostLines(query);
    const r = await fetchRateOptions(query);
    expect('rows' in r && r.mode).toBe('direct');
    const costing = mockRequestLog.find((u) => path(u).endsWith('/CostLineSet') && !u.includes('expand'))!;
    const direct = mockRequestLog.filter((u) => path(u).endsWith('/RateOptionSet')).at(-1)!;
    expect(filterOf(direct)).toBe(rateOptionFilter(filterOf(costing)));
    expect(directRequest(query).params.$filter).toBe(rateOptionFilter(buildSelectionFilter(query)));
    expect(expandRequest(query).params.$filter).toBe(buildSelectionFilter(query));
    expect(mockRequestLog.every((u) => !u.includes('+'))).toBe(true);
    const lines = attachRateOptions(cost.rows, 'rows' in r ? r.rows : []);
    expect(lines.some((l) => (l.RateOptions?.length ?? 0) > 0)).toBe(true);
    expect(ratesIntegrity(lines.filter(isLeafRow)).allEmpty).toBe(false);
  });
  it('only expand works: falls back to $expand=RateOptions', async () => {
    process.env.MOCK_SAP_RATES = 'only-expand-works';
    const r = await fetchRateOptions(q());
    expect('rows' in r && r.mode).toBe('expand');
    expect('rows' in r && r.rows.length).toBeGreaterThan(0);
  });
  it('options all empty although SrcCount > 0: amber banner text, nothing hidden', async () => {
    process.env.MOCK_SAP_RATES = 'expand-empty';
    const query = q();
    const cost = await fetchCostLines(query);
    const r = await fetchRateOptions(query);
    expect('rows' in r && r.mode).toBe('expand');
    expect('rows' in r && r.rows.length).toBe(0);
    const lines = attachRateOptions(cost.rows, []).filter(isLeafRow);
    const integrity = ratesIntegrity(lines);
    expect(integrity.allEmpty).toBe(true);
    expect(integrity.affected).toBe(lines.filter((l) => (l.SrcCount ?? 0) > 0).length);
    expect(integrityMessage(integrity)).toMatch(/^SAP returned fewer rate options than it counted \(\d+ lines? affected\)\. The comparison may be incomplete\.$/);
    // The coverage panel still works without options (MBEW-only uses SrcCount / SelSource only).
    expect(rateCoverage(lines, query.prio, true).leafRows).toBe(lines.length);
  });
  it('plan Mode P: RateOptionSet filter = the Mode P costing filter with the CHAR1 flags rewritten', async () => {
    process.env.MOCK_SAP_RATES = 'direct-works';
    const pq = { ...defaultPlanCostQuery('FY27-BASE'), plants: ['1000'] };
    await fetchPlanCostLines(pq);
    const { fetchRateOptionsByFilter } = await import('@/lib/rates/options');
    await fetchRateOptionsByFilter(costFilter(pq));
    const costing = mockRequestLog.find((u) => path(u).endsWith('/CostLineSet'))!;
    const direct = mockRequestLog.filter((u) => path(u).endsWith('/RateOptionSet')).at(-1)!;
    expect(filterOf(direct)).toBe(rateOptionFilter(filterOf(costing)));
  });
});

describe('coverage', () => {
  const mk = (p: Partial<CostLine>, opts: ReturnType<typeof opt>[] = []) => ({ ...leaf(p), RateOptions: opts }) as CostLine;
  it('MBEW only: SrcCount 1 and SelSource MBEW, grouped by component; hint text', () => {
    const lines = [
      mk({ Idnrk: 'RM1', Headmat: 'FG1', SrcCount: 1, SelSource: 'MBEW' }),
      mk({ Idnrk: 'RM1', Headmat: 'FG2', SrcCount: 1, SelSource: 'MBEW', Seqnr: 2 }),
      mk({ Idnrk: 'RM2', SrcCount: 2, SelSource: 'MBEW', Seqnr: 3 }), // has another source
      mk({ Idnrk: 'RM3', SrcCount: 1, SelSource: 'CONTRACT', Seqnr: 4 }),
    ];
    const c = rateCoverage(lines, ['CONTRACT', 'INFOREC', 'CONSUMP', 'MBEW'], false);
    expect(c.mbewOnly.map((g) => `${g.idnrk}:${g.rows.length}`)).toEqual(['RM1:2']);
    expect(MBEW_ONLY_HINT).toBe('Only a C-MAP (MBEW) rate: no contract / info record / market / consumption rate in the look-back window. Try a donor plant or a longer look-back.');
  });
  it('per source: components with a rate and share of leaf rows using it; source outside priority named with its rate; donor rows counted', () => {
    const lines = [
      mk({ Idnrk: 'A', SrcCount: 2, SelSource: 'CONTRACT', Donor: '1100' }, [opt({ Source: 'CONTRACT', RatePcInr: '10' }), opt({ Source: 'MARKT', RatePcInr: '8' })]),
      mk({ Idnrk: 'B', SrcCount: 1, SelSource: 'MBEW', Seqnr: 2 }, [opt({ Source: 'MBEW', RatePcInr: '5', Seqnr: 2 })]),
    ];
    const c = rateCoverage(lines, ['CONTRACT', 'INFOREC', 'CONSUMP', 'MBEW'], true);
    const by = Object.fromEntries(c.sources.map((s) => [s.source, s]));
    expect(by.CONTRACT).toMatchObject({ components: 1, usedLeaf: 1, share: 0.5 });
    expect(by.MARKT).toMatchObject({ components: 1, usedLeaf: 0 });
    expect(c.outsidePrio).toHaveLength(1);
    expect(c.outsidePrio[0].unused.map((u) => `${u.source}:${u.ratePcInr}`)).toEqual(['MARKT:8']);
    expect(c.donorRows).toBe(1);
    expect(c.donorPlants).toEqual(['1100']);
  });
});

describe('what-ifs (client side, leaf rows, rate 0 never cheapest)', () => {
  const l1 = { ...leaf({ Idnrk: 'A', SelSource: 'CONTRACT', TotCostInr: '100', ProdQty: '10', FrtPcInr: '0' }), RateOptions: [opt({ Source: 'CONTRACT', RatePcInr: '10', TotCostInr: '100' }), opt({ Source: 'MBEW', RatePcInr: '0', TotCostInr: '0' }), opt({ Source: 'CONSUMP', RatePcInr: '8', TotCostInr: '80' })] } as CostLine;
  const parent = { ...leaf({ Idnrk: 'SF', HasChild: 'X', TotCostInr: '999', Seqnr: 9 }), RateOptions: [] } as CostLine;
  it('cheapest ignores a 0 rate and parents', () => {
    const w = cheapestWhatIf([l1, parent]);
    expect(w.sapTotal.toString()).toBe('100');
    expect(w.simTotal.toString()).toBe('80');
    expect(w.changed).toBe(1);
  });
  it('re-pick by priority takes the first priority source with a non-zero rate', () => {
    expect(repickByPriority([l1], ['MBEW', 'CONSUMP', 'CONTRACT']).simTotal.toString()).toBe('80'); // MBEW is 0 -> CONSUMP
    expect(repickByPriority([l1], ['CONTRACT', 'CONSUMP']).simTotal.toString()).toBe('100');
    expect(repickByPriority([l1], ['INFOREC']).simTotal.toString()).toBe('100'); // no rate: keeps SAP's figure
  });
  it('matrix: best rate per source, null when there is none', () => {
    const [m] = sourceMatrix([l1], ['CONTRACT', 'INFOREC', 'MBEW', 'CONSUMP']);
    expect(m.cells.CONTRACT?.toString()).toBe('10');
    expect(m.cells.INFOREC).toBeNull();
    expect(m.cells.MBEW).toBeNull(); // 0 is not a rate
  });
});

describe('plan country segregation', () => {
  it('one FG from one plant planned for two countries gives two headers, each with its own roll-up', async () => {
    const months = Array(12).fill('100');
    const rows = [
      { plan: 'CTRY TEST', matnr: 'FG1001', werks: '1000', land1: 'IN', months },
      { plan: 'CTRY TEST', matnr: 'FG1001', werks: '1000', land1: 'NP', months: Array(12).fill('50') },
    ];
    expect((await uploadPlan('CTRY TEST', 'R', false, rows, 't@x')).Status).toBe('S');
    const { rows: lines } = await fetchPlanCostLines(defaultPlanCostQuery('CTRY TEST'));
    expect(new Set(lines.map((l) => l.Land1))).toEqual(new Set(['IN', 'NP']));
    const roll = headerRollups(lines);
    expect([...roll.keys()].sort()).toEqual(['IN|1000|FG1001', 'NP|1000|FG1001']);
    expect(roll.get('IN|1000|FG1001')!.planQty.toString()).toBe('1200');
    expect(roll.get('NP|1000|FG1001')!.planQty.toString()).toBe('600');
  });
});
