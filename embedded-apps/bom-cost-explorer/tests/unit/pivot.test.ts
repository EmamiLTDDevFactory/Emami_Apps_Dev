import { describe, expect, it } from 'vitest';
import { buildPivot, compare } from '@/lib/cost/pivot';
import { leaf, parent } from './helpers';

const at = (plant: string, curr = 'INR') => ({ Werks: plant, LocCurr: curr, Hwerks: '1000' });

describe('buildPivot (mode C)', () => {
  const rows = [
    // plant 1000
    parent(1, 1, 'BULK', '99', at('1000')),
    leaf(2, 2, 'RM1', '10', '1', '2', at('1000')), // 22
    leaf(3, 1, 'PM1', '3', '0', '1', at('1000')), // 3
    leaf(4, 1, 'PM1', '3', '0', '1', at('1000')), // same component twice -> summed: 6
    // plant 1100 (cheaper RM1, no rate for PM1)
    parent(1, 1, 'BULK', '88', at('1100')),
    leaf(2, 2, 'RM1', '8', '1', '2', at('1100')), // 18
    leaf(3, 1, 'PM1', '0', '0.5', '1', at('1100')), // freight only, no rate
    leaf(4, 1, 'PM1', '0', '0.5', '1', at('1100')),
    // plant BD10 in BDT - pivot only uses INR fields
    leaf(2, 2, 'RM1', '12', '0', '2', at('BD10', 'BDT')), // 24
  ];
  const p = buildPivot(rows, ['1000', '1100', 'BD10']);

  it('has one row per header x component (leaves only) plus a TOTAL row', () => {
    expect(p.rows.map((r) => `${r.kind}:${r.comp}`)).toEqual(['component:RM1', 'component:PM1', 'total:']);
  });
  it('sums a component that appears twice under a header', () => {
    const pm = p.rows.find((r) => r.comp === 'PM1')!;
    expect(pm.cells['1000']!.cost.toFixed(2)).toBe('6.00');
    expect(pm.cells['1000']!.qty.toFixed()).toBe('2');
    expect(pm.cells['1000']!.ratePc.toFixed()).toBe('3');
  });
  it('finds min, max, difference and the cheapest plant', () => {
    const rm = p.rows.find((r) => r.comp === 'RM1')!;
    expect(rm.min!.toFixed(2)).toBe('18.00');
    expect(rm.max!.toFixed(2)).toBe('24.00');
    expect(rm.diff!.toFixed(2)).toBe('6.00');
    expect(rm.cheapest).toBe('1100');
  });
  it('only compares when at least two plants have a cost (no-rate plants do not count)', () => {
    const pm = p.rows.find((r) => r.comp === 'PM1')!;
    expect(pm.cells['1100']!.hasRate).toBe(false);
    expect(pm.min).toBeNull();
    expect(pm.cheapest).toBeNull();
  });
  it('header TOTAL = sum of leaf components per plant, never parent rows', () => {
    const t = p.rows.find((r) => r.kind === 'total')!;
    expect(t.cells['1000']!.cost.toFixed(2)).toBe('28.00'); // 22 + 6 (parent 99 ignored)
    expect(t.cells['1100']!.cost.toFixed(2)).toBe('19.00'); // 18 + 0.5 + 0.5
    expect(t.cheapest).toBe('1100');
  });
  it('compare() ignores plants without a cell', () => {
    expect(compare({}, ['1000', '1100']).min).toBeNull();
  });
});
