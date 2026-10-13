import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { resetPlanMock } from '../../mock/plan';
import { rowsFromGrid, validateRows, groupByPlan, cleanMonths } from '@/lib/plan/upload';
import { deletePlanEntryWithFallback, entryKeyPath, uploadBody, uploadPlan, updatePlanEntry } from '@/lib/plan/write';
import { headerRollups, shortage, bomSourceLabel } from '@/lib/plan/maths';
import { compare, scenarioMonths, simulateLine, emptyClientWhatIf, scenarioQuery, wipPlanRows, wipPlanName, lineKey } from '@/lib/plan/scenarios';
import { fetchPlanCostLines, fetchPlanEntries, fetchPlanWip } from '@/lib/plan/client';
import { defaultPlanCostQuery, costFilter } from '@/lib/plan/requests';
import { fetchRateOptionsByFilter, clearRatesCache } from '@/lib/rates/options';
import { resetRatesCapability } from '@/lib/rates/capability';
import { isLeafRow } from '@/lib/cost/tree';
import { D, ZERO } from '@/lib/cost/decimal';
import type { PlanSummary } from '@/lib/plan/fields';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_RATES', 'MOCK_SAP_NO_DELETE'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetPlanMock();
  clearRatesCache();
  resetRatesCapability('NGD');
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

const m12 = (v: number | string) => Array(12).fill(v);

describe('upload parsing and checks', () => {
  it('skips the header row, upper-cases codes, blank months become 0', () => {
    const rows = rowsFromGrid([
      ['Material', 'Plant', 'Plan', 'Country', 'Apr'],
      ['fg1001', 'ub01', 'P1', 'in', 5, '', 7],
      [],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rowNo: 2, matnr: 'FG1001', werks: 'UB01', land1: 'IN' });
    expect(rows[0].months.slice(0, 3)).toEqual(['5', '0', '7']);
  });
  it('no header: first row is data', () => {
    expect(rowsFromGrid([['FG1', '1000', 'P', 'IN', ...m12(1)]])[0].rowNo).toBe(1);
  });
  it('reports required cells, plant format, negatives, non-numbers, long names and duplicates with row numbers', () => {
    const rows = rowsFromGrid([
      ['FG1', '1000', 'P', 'IN', ...m12(1)],
      ['', '10', 'X'.repeat(31), '', -1, 'abc'],
      ['FG1', '1000', 'P', 'IN', ...m12(2)],
    ]);
    const issues = validateRows(rows);
    const at = (n: number) => issues.filter((i) => i.rowNo === n).map((i) => i.field);
    expect(at(1)).toEqual([]);
    expect(at(2)).toEqual(expect.arrayContaining(['Material', 'Plant', 'Plan', 'Country', 'Apr', 'May']));
    expect(issues.find((i) => i.rowNo === 3)?.message).toMatch(/Duplicate of row 1/);
  });
  it('more than 2000 rows is refused', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({ rowNo: i + 1, plan: 'P', matnr: `M${i}`, werks: '1000', land1: 'IN', months: m12('1') }));
    expect(validateRows(rows).some((i) => i.field === 'file')).toBe(true);
  });
  it('groups by plan; commas removed before sending', () => {
    const g = groupByPlan(rowsFromGrid([['A', '1000', 'P1', 'IN', '1,200'], ['B', '1000', 'P2', 'IN'], ['C', '1000', 'P1', 'IN']]));
    expect([...g.keys()]).toEqual(['P1', 'P2']);
    expect(cleanMonths(g.get('P1')![0]).months[0]).toBe('1200');
  });
});

describe('writes', () => {
  it('deep insert body: decimals as 3-dp strings, Entries navigation, Dryrun CHAR1', () => {
    const b = uploadBody(' P1 ', 'M', true, [{ plan: 'P1', matnr: 'fg1', werks: '1000', land1: 'in', months: m12(2) }]);
    expect(b).toMatchObject({ Plan1: 'P1', UpdMode: 'M', Dryrun: 'X' });
    expect(b.Entries[0]).toMatchObject({ Matnr: 'FG1', Land1: 'IN', Mth1: '2.000', Mth12: '2.000' });
  });
  it('key path has no "+" and quotes values', () => {
    const p = entryKeyPath({ Plan1: 'FY 27', Matnr: 'FG1', Werks: '1000', Land1: 'IN' });
    expect(p).toBe("PlanEntrySet(Plan1='FY 27',Matnr='FG1',Werks='1000',Land1='IN')");
  });
  it('check then save through the mock gateway; audit kept locally', async () => {
    const rows = [{ plan: 'NEWP', matnr: 'FG1001', werks: '1000', land1: 'IN', months: m12('10') }];
    const dry = await uploadPlan('NEWP', 'M', true, rows, 'me@x');
    expect(dry.Status).toBe('V');
    expect(dry.entries[0].Status).toBe('S');
    const save = await uploadPlan('NEWP', 'M', false, rows, 'me@x');
    expect(save).toMatchObject({ Status: 'S', Saved: 1 });
    expect((await fetchPlanEntries('NEWP')).rows).toHaveLength(1);
  });
  it('PUT changes one entry', async () => {
    const e = (await fetchPlanEntries('FY27-BASE', { plants: ['1000'] })).rows[0];
    await updatePlanEntry(e, m12('1'));
    const again = (await fetchPlanEntries('FY27-BASE', { plants: ['1000'] })).rows.find((x) => x.Matnr === e.Matnr)!;
    expect(D(again.Total).eq(12)).toBe(true);
  });
});

describe('delete', () => {
  it('DELETE when the gateway forwards it', async () => {
    const all = (await fetchPlanEntries('FY27-BASE')).rows;
    expect(await deletePlanEntryWithFallback(all[0], 'me@x')).toBe('deleted');
    expect((await fetchPlanEntries('FY27-BASE')).rows).toHaveLength(all.length - 1);
  });
  it('gateway without DELETE: plan saved again with Replace minus the row (check first)', async () => {
    process.env.MOCK_SAP_NO_DELETE = 'true';
    const all = (await fetchPlanEntries('FY27-BASE')).rows;
    expect(await deletePlanEntryWithFallback(all[1], 'me@x')).toBe('replaced');
    const left = (await fetchPlanEntries('FY27-BASE')).rows.map(entryKeyPath);
    expect(left).toHaveLength(all.length - 1);
    expect(left).not.toContain(entryKeyPath(all[1]));
    expect(mockRequestLog.filter((u) => u.includes('PlanUploadSet'))).toHaveLength(2);
  });
});

describe('maths', () => {
  it('header roll-ups from leaf rows only; per piece = leaf total / PlanQty', async () => {
    const { rows } = await fetchPlanCostLines(defaultPlanCostQuery('FY27-BASE'));
    const roll = headerRollups(rows);
    for (const h of roll.values()) {
      const leafTotal = rows.filter((l) => l.Hwerks === h.hwerks && l.Headmat === h.headmat && isLeafRow(l)).reduce((a, l) => a.plus(D(l.TotCostInr)), ZERO);
      expect(h.total.eq(leafTotal)).toBe(true);
      if (h.planQty.gt(0)) expect(h.perPiece!.times(h.planQty).minus(h.total).abs().lt(1e-9)).toBe(true);
    }
    const lp = [...roll.values()].find((h) => h.bomSrc === 'LASTPROD')!;
    expect(bomSourceLabel(lp)).toBe('From plant 1000 (last production 12.08.2026)');
  });
  it('shortage = requirement - (stock + open PO)', () => {
    expect(shortage({ BudQty: '100', Lbkum: '30', RemQty: '20' } as PlanSummary).toString()).toBe('50');
  });
});

describe('scenarios', () => {
  it('shift then multiply months', () => {
    const c = { ...emptyClientWhatIf(), shifts: [{ from: 0, to: 1, pct: 50 }], overallMult: 2 };
    const m = scenarioMonths(Array.from({ length: 12 }, () => D(10)), c);
    expect(m[0].toString()).toBe('10');
    expect(m[1].toString()).toBe('30');
    expect(m[2].toString()).toBe('20');
  });
  it('identity what-if reproduces the SAP baseline; rate % and override change only the rate', async () => {
    const { rows } = await fetchPlanCostLines(defaultPlanCostQuery('FY27-BASE'));
    const same = compare(rows, rows, emptyClientWhatIf());
    expect(same.headers.every((h) => h.delta.isZero())).toBe(true);
    const leaf = rows.find((l) => isLeafRow(l) && l.SelSource && D(l.SelRatePcInr).gt(0))!;
    const up = simulateLine(leaf, { ...emptyClientWhatIf(), srcPct: { [leaf.SelSource]: 10 } });
    expect(up.ratePc.eq(D(leaf.SelRatePcInr).times(1.1))).toBe(true);
    const ov = simulateLine(leaf, { ...emptyClientWhatIf(), rateOverride: { [lineKey(leaf)]: '1' } });
    expect(ov.ratePc.toString()).toBe('1');
    const more = compare(rows, rows, { ...emptyClientWhatIf(), overallMult: 1.5 });
    const b = more.months.base.reduce((a, v) => a.plus(v), ZERO);
    const s = more.months.scen.reduce((a, v) => a.plus(v), ZERO);
    expect(s.div(b).minus(1.5).abs().lt(1e-9)).toBe(true);
  });
  it('SAP what-ifs become query options', () => {
    const q = scenarioQuery(defaultPlanCostQuery('P'), { fallback: false, donorPlant: 'ub01', prio: 'MBEW,CONTRACT' });
    expect(costFilter(q)).toMatch(/Prio eq 'MBEW,CONTRACT'.*DonorPlant eq 'UB01'/);
    expect(costFilter(q)).not.toContain('Fallback'); // off CHAR1 flag is left out
  });
  it('WIP plan: grouped by component + plant + country, months summed, name capped at 30', async () => {
    const wip = (await fetchPlanWip('FY27-BASE')).rows;
    const rows = wipPlanRows('FY27-BASE', wip);
    expect(rows.every((r) => r.plan === 'WIP FY27-BASE')).toBe(true);
    expect(new Set(rows.map((r) => `${r.matnr}|${r.werks}|${r.land1}`)).size).toBe(rows.length);
    expect(wipPlanName('X'.repeat(40))).toHaveLength(30);
  });
});

describe('plan rate options (lazy, Mode P)', () => {
  it('expand fails, direct works: options come from RateOptionSet with the plan filter', async () => {
    process.env.MOCK_SAP_RATES = 'direct-works';
    const f = costFilter(defaultPlanCostQuery('FY27-BASE'));
    const r = await fetchRateOptionsByFilter(f, {});
    expect('rows' in r && r.rows.length).toBeGreaterThan(0);
  });
});
