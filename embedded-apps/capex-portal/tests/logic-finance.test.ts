import { describe, it, expect } from 'vitest';
import { calcIRR, calcNPV, calcPayback, calcMetrics, trimCashflows, metricsForDisplay, metricWarnings } from '@/lib/finance';

const base = [1000, 300, 300, 300, 300, 300];

describe('README verified values', () => {
  it('IRR 15.24%', () => expect(calcIRR(base)).toBeCloseTo(15.24, 2));
  it('NPV at IRR ~ 0', () => expect(Math.abs(calcNPV(calcIRR(base), base))).toBeLessThan(1e-3));
  it('payback 3.33', () => expect(calcPayback(base)).toBeCloseTo(3.33, 2));
  it('sign of the t0 flow is ignored', () => expect(calcIRR([-1000, 300, 300, 300, 300, 300])).toBeCloseTo(15.24, 2));
});

describe('NPV', () => {
  it('discounts year n by (1+r)^n', () => {
    expect(calcNPV(10, [100, 110])).toBeCloseTo(0, 9);
    expect(calcNPV(0, [1000, 300, 300])).toBe(-400);
  });
  it('junk is zero', () => {
    expect(calcNPV(NaN, [100, NaN as never, 50])).toBe(-50);
    expect(calcNPV(10, [])).toBe(-0);
  });
});

describe('IRR', () => {
  it('NaN when never bracketed (all inflows 0 or all outflow-only)', () => {
    expect(calcIRR([1000])).toBeNaN();
    expect(calcIRR([1000, 0, 0])).toBeNaN();
    expect(calcIRR([0, 100])).toBeNaN();
  });
  it('negative IRR', () => expect(calcIRR([1000, 500, 200])).toBeLessThan(0));
  it('simple one-year', () => expect(calcIRR([100, 120])).toBeCloseTo(20, 3));
});

describe('payback', () => {
  it('exact year boundary', () => expect(calcPayback([300, 100, 100, 100])).toBeCloseTo(3, 9));
  it('never recovered -> NaN', () => expect(calcPayback([1000, 100, 100])).toBeNaN());
  it('discounted payback is longer', () => expect(calcPayback(base, 10)).toBeGreaterThan(calcPayback(base, 0)));
  it('skips non-positive years', () => expect(calcPayback([100, -50, 200])).toBeCloseTo(1.5, 9));
});

describe('calcMetrics / form helpers', () => {
  it('matches the individual functions', () => {
    const m = calcMetrics(1000, [300, 300, 300, 300, 300], 12);
    expect(m.irr).toBeCloseTo(15.24, 2);
    expect(m.npv).toBeCloseTo(calcNPV(12, base), 9);
    expect(m.payback).toBeGreaterThan(3.33);
  });
  it('trimCashflows drops trailing zeros, keeps leading zeros before a value', () => {
    expect(trimCashflows([0, 0, 5, 0, 7, 0, 0])).toEqual([0, 0, 5, 0, 7]);
    expect(trimCashflows(['1', '', null, 2])).toEqual([1, 0, 0, 2]);
    expect(trimCashflows([0, 0])).toEqual([]);
  });
  it('metricsForDisplay nulls', () => {
    expect(metricsForDisplay(0, [1, 2], 15)).toEqual({ irr: null, npv: null, payback: null });
    expect(metricsForDisplay(100, [], 15)).toEqual({ irr: null, npv: null, payback: null });
    const m = metricsForDisplay(1000, [300, 300, 300, 300, 300], 15);
    expect(m.irr).toBeCloseTo(15.24, 2);
    const never = metricsForDisplay(1000, [10, 10], 15);
    expect(never.irr).toBeLessThan(0);
    expect(never.payback).toBeNull();
    expect(never.npv).toBeLessThan(0);
  });
  it('metricWarnings', () => {
    expect(metricWarnings({ irr: 10, npv: -5 }, 15)).toEqual({ irrBelowHurdle: true, npvNegative: true });
    expect(metricWarnings({ irr: 15, npv: 0 }, 15)).toEqual({ irrBelowHurdle: false, npvNegative: false });
    expect(metricWarnings({ irr: null, npv: null }, 15)).toEqual({ irrBelowHurdle: false, npvNegative: false });
  });
});
