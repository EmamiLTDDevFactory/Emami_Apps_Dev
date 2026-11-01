import { describe, expect, it } from 'vitest';
import { NO_ORIGIN, itemOrigin, originBreakup, originMapOf } from '@/lib/cost/originBreakup';
import { runScenarios, scenarios, ratesBySource } from '@/lib/cost/priorityScenarios';
import { EMPTY_SIM } from '@/lib/cost/simulate';
import { leaf, opt } from './helpers';

describe('origin group breakup', () => {
  it('adds up by group, largest first, no-origin last, shares sum to 100', () => {
    const r = originBreakup([{ origin: 'IMPORT', value: '30' }, { origin: '', value: '50' }, { origin: 'LOCAL', value: '70' }, { origin: 'IMPORT', value: '20' }]);
    expect(r.slices.map((s) => s.origin)).toEqual(['LOCAL', 'IMPORT', NO_ORIGIN]);
    expect(r.slices[1].value.toFixed(0)).toBe('50');
    expect(r.slices[1].lines).toBe(2);
    expect(r.total.toFixed(0)).toBe('170');
    expect(r.slices.reduce((a, s) => a + s.share!.toNumber(), 0)).toBeCloseTo(100, 6);
  });
  it('zero total gives no share, never NaN', () => {
    expect(originBreakup([{ origin: 'A', value: '0' }]).slices[0].share).toBeNull();
  });
  it('item origin: own HRKFT first, else the BOM costing map', () => {
    const m = originMapOf([{ Idnrk: 'M1', CompOgrp: ' IMP ' }, { Idnrk: 'M1', CompOgrp: 'X' }, { Idnrk: 'M2', CompOgrp: '' }]);
    expect(itemOrigin({ Idnrk: 'M1' }, m)).toBe('IMP');
    expect(itemOrigin({ Idnrk: 'M1', Hrkft: 'OWN' }, m)).toBe('OWN');
    expect(itemOrigin({ Idnrk: 'M2' }, m)).toBe('');
  });
});

describe('priority scenarios', () => {
  const options = [
    opt({ Source: 'CONTRACT', RatePc: '12', RatePcInr: '12', ValidFrom: '2026-01-01' }),
    opt({ Source: 'MBEW', RatePc: '11', RatePcInr: '11', ValidFrom: '2026-09-01' }),
  ];
  const row = leaf(1, 1, 'RM1', '12', '0', '10', { SelSource: 'CONTRACT', SelCond: 'PB00', RateOptions: options });
  it('first row is SAP, C-MAP first re-picks MBEW and shows the delta', () => {
    const res = runScenarios([row], scenarios(['CONTRACT', 'MBEW', 'INFOREC', 'MARKT', 'CONSUMP']), 10);
    expect(res[0].id).toBe('sap');
    expect(res[0].total.toFixed(2)).toBe('120.00');
    const c = res.find((x) => x.id === 'first-MBEW')!;
    expect(c.total.toFixed(2)).toBe('110.00');
    expect(c.delta.toFixed(2)).toBe('-10.00');
    expect(c.repicked).toBe(1);
    expect(c.label).toBe('C-MAP first');
    expect(res.find((x) => x.id === 'first-CONTRACT')!.repicked).toBe(0);
  });
  it('SAP scenario is the identity', () => expect(scenarios(['MBEW'])[0].settings).toEqual(EMPTY_SIM));
  it('rates by source', () => expect(Object.keys(ratesBySource(row)).sort()).toEqual(['CONTRACT', 'MBEW']));
});
