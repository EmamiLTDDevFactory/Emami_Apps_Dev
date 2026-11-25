import { describe, expect, it } from 'vitest';
import { EMPTY_STORE, relativeOffsets, removeVariant, setDefaultVariant, upsertVariant, variantDates, type FreightVariant } from '@/lib/freight/variants';
import { DEFAULT_RULE, partiesText, plantCompare } from '@/lib/freight/analysis';

const v = (name: string, extra: Partial<FreightVariant> = {}): FreightVariant => ({ name, materials: ['PM1'], plants: ['UN13'], types: ['ROH'], from: '2026-09-01', to: '2026-11-24', relative: false, fromDaysAgo: 90, toDaysAgo: 0,
  freightDays: '92', inclFrt: true, latestOnly: false, purchOrgs: '', rule: { ...DEFAULT_RULE }, savedAt: '', ...extra });

describe('freight variants', () => {
  it('saves, replaces by name (case-insensitive), removes and keeps one default', () => {
    let s = upsertVariant(EMPTY_STORE, v('Daily UN13'));
    s = upsertVariant(s, v('daily un13', { plants: ['UN08'] }));
    expect(s.variants).toHaveLength(1);
    expect(s.variants[0].plants).toEqual(['UN08']);
    s = setDefaultVariant(upsertVariant(s, v('Weekly')), 'Weekly');
    expect(s.defaultName).toBe('Weekly');
    s = removeVariant(s, 'Weekly');
    expect(s.defaultName).toBe('');
    expect(upsertVariant(s, v('  ')).variants).toHaveLength(1);
  });
  it('relative dates follow today', () => {
    const today = new Date(2026, 10, 24);
    expect(variantDates(v('x', { relative: true, fromDaysAgo: 89, toDaysAgo: 0 }), today)).toEqual({ from: '2026-08-27', to: '2026-11-24' });
    expect(relativeOffsets('2026-08-27', '2026-11-24', today)).toEqual({ fromDaysAgo: 89, toDaysAgo: 0 });
    expect(variantDates(v('abs'), today)).toEqual({ from: '2026-09-01', to: '2026-11-24' });
  });
  it('lists parties with a short text', () => {
    expect(partiesText(['A', 'B', 'C', 'D'], 2)).toBe('A; B (+2)');
    expect(plantCompare([], DEFAULT_RULE)).toEqual([]);
  });
});

import Decimal from 'decimal.js';
import { partiesOf, type PoLine } from '@/lib/freight/analysis';
const line = (plant: string, material: string, aq: number, aa: number, sq: number, sa: number, vendorName = 'V', placeOfSupply = 'Pune'): PoLine => ({
  plant, material, vendor: '100', vendorName, placeOfSupply, actualQty: new Decimal(aq), actualAmount: new Decimal(aa), standardQty: new Decimal(sq), standardAmount: new Decimal(sa),
  amountVariance: aq > 0 && sq > 0 ? new Decimal(aa - sa) : null, amountVariancePct: aq > 0 && sq > 0 && sa ? new Decimal(((aa - sa) / sa) * 100) : null,
} as unknown as PoLine);

describe('plant wise freight and parties', () => {
  it('sums actual and standard per plant and compares the lines that have both sides', () => {
    const r = plantCompare([line('UN13', 'A', 10, 120, 10, 100), line('UN13', 'B', 0, 0, 5, 50), line('UN08', 'A', 4, 40, 4, 44)], DEFAULT_RULE);
    const un13 = r.find((x) => x.plant === 'UN13')!;
    expect(un13.poLines).toBe(2); expect(un13.materials).toBe(2);
    expect(un13.standardAmount.toNumber()).toBe(150); expect(un13.actualAmount.toNumber()).toBe(120);
    expect(un13.bothLines).toBe(1); expect(un13.variance.toNumber()).toBe(20); expect(un13.variancePct!.toNumber()).toBe(20);
    expect(r.find((x) => x.plant === 'UN08')!.variance.toNumber()).toBe(-4);
  });
  it('collects supplier names and source locations per component and per material', () => {
    const p = partiesOf([line('UN13', 'A', 1, 1, 1, 1, 'Acme', 'Pune'), line('UN08', 'A', 1, 1, 1, 1, 'Beta', 'Mumbai')]);
    expect(p.byMaterial.get('A')!.vendors).toEqual(['Acme (100)', 'Beta (100)']);
    expect(p.byComponent.get('UN13|A')!.sources).toEqual(['Pune']);
  });
});
