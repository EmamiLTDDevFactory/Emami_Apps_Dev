import { describe, expect, it } from 'vitest';
import {
  blocked, canDelete, canEdit, canFinalise, canRecalc, canReopen, canSubmit, changed, compareRows, createBody, finaliseCounts, flagHint, groupItems, isoDate, kpis,
  newScenarioDefaults, resolveScope, ruleToApi, showDate, timeText, validateNewScenario, validateValue, warned,
} from '@/lib/pkg/rules';
import { actionPayload } from '@/lib/pkg/api';
import type { PkgItem } from '@/lib/pkg/types';

const base: PkgItem = {
  ScenId: '0000000014', Matnr: 'M1', Idnrk: '', Maktx: 'Mat', Mtart: 'PKGN', Matkl: 'PK01', RateSrc: 'CONTRACT', BasicRateSap: 10, BasicRateUsed: 10, BudgetRateSap: 11, BudgetRate: 11, Variance: 1, VariancePct: 10,
  Waers: 'INR', Peinh: 1, Meins: 'KG', MsgFlags: '', PctSap: 0, PctUsed: 0, ZbudSap: 0, ZbudUsed: 0, CompBaseRate: 0, CompBudRate: 0,
};
const head = (o: Partial<PkgItem> = {}): PkgItem => ({ ...base, ...o });
const comp = (o: Partial<PkgItem> = {}): PkgItem => ({ ...base, Idnrk: 'C1', PctSap: 60, PctUsed: 60, ...o });

describe('status permissions', () => {
  it('edit D/C only; recalc D; submit C; finalise C/S; reopen F; delete not F', () => {
    expect(['D', 'C', 'S', 'F', 'X'].map(canEdit)).toEqual([true, true, false, false, false]);
    expect(['D', 'C', 'S', 'F'].map(canRecalc)).toEqual([true, false, false, false]);
    expect(['D', 'C', 'S'].map(canSubmit)).toEqual([false, true, false]);
    expect(['D', 'C', 'S', 'F'].map(canFinalise)).toEqual([false, true, true, false]);
    expect(['C', 'F'].map(canReopen)).toEqual([false, true]);
    expect(['C', 'F', 'X'].map(canDelete)).toEqual([true, false, true]);
  });
});

describe('flags', () => {
  it('NOBOM / PCT100 / NORATE block, NOZBUD / DUP only warn', () => {
    expect(blocked(head({ MsgFlags: 'NOBOM' }))).toBe(true);
    expect(blocked(head({ MsgFlags: 'NOZBUD,PCT100' }))).toBe(true);
    expect(blocked(head({ MsgFlags: 'DUP' }))).toBe(false);
    expect(warned(head({ MsgFlags: 'NOZBUD DUP' }))).toBe(true);
    expect(warned(head({ MsgFlags: 'NORATE' }))).toBe(false);
  });
  it('hints carry the group and the BOM total', () => {
    const g = { head: head({ MsgFlags: 'PCT100' }), comps: [comp({ PctUsed: 60 }), comp({ Idnrk: 'C2', PctUsed: 30 })] };
    expect(flagHint('PCT100', g)).toBe('BOM % total is 90.000, must be 100');
    expect(flagHint('NOBOM', g)).toBe('No ZBUD material or BOM for group PK01');
  });
});

describe('overridden', () => {
  it('abs(used - sap) > 1e-9', () => { expect(changed(10.0000000001, 10)).toBe(false); expect(changed(10.001, 10)).toBe(true); });
});

describe('grouping and KPIs', () => {
  const items = [head({ Matnr: 'A', BasicRateUsed: 12, VariancePct: 20 }), comp({ Matnr: 'A' }), head({ Matnr: 'B', MsgFlags: 'NOBOM', VariancePct: 99 }), head({ Matnr: 'C', MsgFlags: 'DUP', VariancePct: 10 })];
  it('puts components under their header, keeps order', () => {
    const g = groupItems(items);
    expect(g.map((x) => x.head.Matnr)).toEqual(['A', 'B', 'C']);
    expect(g[0].comps).toHaveLength(1);
  });
  it('counts blocked, warnings, overridden; average skips blocked rows', () => {
    const k = kpis(groupItems(items));
    expect(k).toEqual({ materials: 3, blocked: 1, warnings: 1, avgVarPct: 15, overridden: 1 });
  });
  it('a changed component % or ZBUD also counts as overridden', () => {
    expect(kpis(groupItems([head(), comp({ ZbudUsed: 5, ZbudSap: 0 })])).overridden).toBe(1);
  });
  it('finalise counts: blocked rows are skipped', () => { expect(finaliseCounts(groupItems(items))).toEqual({ n: 2, m: 1 }); });
});

describe('compare', () => {
  const mine = groupItems([head({ Matnr: 'A', BasicRateUsed: 12, BudgetRate: 13 })]);
  it('baseline uses the SAP values of the same scenario', () => {
    const [r] = compareRows(mine, null);
    expect(r.basicOther).toBe(10); expect(r.budOther).toBe(11); expect(r.delta).toBe(2); expect(r.varOther).toBe(10);
  });
  it('another scenario: missing material gives no delta', () => {
    expect(compareRows(mine, [])[0].delta).toBeNull();
    const o = groupItems([head({ Matnr: 'A', BasicRateUsed: 9, BudgetRate: 12, VariancePct: 5 })]);
    expect(compareRows(mine, o)[0]).toMatchObject({ basicOther: 9, budOther: 12, varOther: 5, delta: 1 });
  });
});

describe('edit rules', () => {
  it('maps UI rules to API rule + signed value', () => {
    expect(ruleToApi('set', 5)).toEqual({ rule: 'S', value: '5' });
    expect(ruleToApi('inc', 10)).toEqual({ rule: 'P', value: '10' });
    expect(ruleToApi('dec', 10)).toEqual({ rule: 'P', value: '-10' });
    expect(ruleToApi('add', 2)).toEqual({ rule: 'A', value: '2' });
    expect(ruleToApi('sub', 2)).toEqual({ rule: 'A', value: '-2' });
  });
  it('rejects empty / NaN; ZBUD may be negative, % and rate may not', () => {
    expect(validateValue('', 'R')).not.toBe(''); expect(validateValue('abc', 'Z')).not.toBe('');
    expect(validateValue('-2', 'Z')).toBe(''); expect(validateValue('-2', 'P')).not.toBe(''); expect(validateValue('-2', 'R')).not.toBe('');
    expect(validateValue('1,250.5', 'R')).toBe('');
  });
  it('scope: filter is blank without an active filter', () => {
    const c = { visible: ['A', 'B'], filterActive: false, selected: ['B'], matkl: 'pk01', idnrk: 'c1' };
    expect(resolveScope('filter', c)).toEqual({});
    expect(resolveScope('filter', { ...c, filterActive: true })).toEqual({ scopeMatnr: 'A,B' });
    expect(resolveScope('selected', c)).toEqual({ scopeMatnr: 'B' });
    expect(resolveScope('matkl', c)).toEqual({ scopeMatkl: 'PK01' });
    expect(resolveScope('component', c)).toEqual({ scopeIdnrk: 'C1' });
  });
});

describe('new scenario', () => {
  const ok = { ...newScenarioDefaults('2027-04-01'), descr: 'FY27', validTo: '2028-03-31' };
  it('validates', () => {
    expect(validateNewScenario(ok)).toEqual({});
    expect(validateNewScenario({ ...ok, validTo: '2027-03-31' }).validTo).toBeTruthy();
    expect(validateNewScenario({ ...ok, mtart: [] }).mtart).toBeTruthy();
    expect(validateNewScenario({ ...ok, validFrom: '' }).validFrom).toBeTruthy();
  });
  it('body defaults the key date to the start and lists selections', () => {
    expect(createBody({ ...ok, matkl: 'pk01, pk02', norm: true })).toMatchObject({ action: 'CREATE', keyDate: '2027-04-01', mtartSel: 'PKGN,VERP', matklSel: 'PK01,PK02', prio: 'CONTRACT,INFOREC,CONSUMP,MBEW', norm: 'X' });
  });
});

describe('dates and payload', () => {
  it('formats', () => {
    expect(isoDate('/Date(1806537600000)/')).toBe('2027-04-01'); expect(isoDate('20270401')).toBe('2027-04-01'); expect(isoDate('0000-00-00')).toBe('');
    expect(showDate('2027-04-01')).toBe('01-Apr-2027'); expect(timeText('PT10H05M09S')).toBe('10:05:09');
  });
  it('action payload pads the scenario, lower-cases the email, sends datetimes', () => {
    const p = actionPayload({ action: 'CREATE', scenId: '14', validFrom: '2027-04-01' }, ' A@B.com ');
    expect(p).toMatchObject({ Action: 'CREATE', ScenId: '0000000014', Email: 'a@b.com', ValidFrom: '2027-04-01T00:00:00' });
  });
});
