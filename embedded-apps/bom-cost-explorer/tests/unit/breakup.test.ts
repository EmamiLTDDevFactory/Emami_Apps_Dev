import { describe, expect, it } from 'vitest';
import { costCategory } from '@/lib/cost/categories';
import { componentRates, perPiece, perPieceByPlant } from '@/lib/cost/perPiece';
import { EMPTY_SIM, isIdentity, simulate, simulateRow, type SimSettings } from '@/lib/cost/simulate';
import { leaf, parent } from './helpers';

const S = (p: Partial<SimSettings>): SimSettings => ({ ...EMPTY_SIM, ...p });

describe('cost category rule', () => {
  it('ROH + material group 106 = Perfume, other ROH = RM, PKGN/VERP = PM', () => {
    expect(costCategory({ Mtart: 'ROH', Matkl: '106' })).toBe('PERFUME');
    expect(costCategory({ Mtart: 'ROH', Matkl: '0106' })).toBe('PERFUME');
    expect(costCategory({ Mtart: 'ROH', Matkl: '101' })).toBe('RM');
    expect(costCategory({ Mtart: 'ROH', Matkl: '1060' })).toBe('RM');
    expect(costCategory({ Mtart: 'PKGN', Matkl: '106' })).toBe('PM');
    expect(costCategory({ Mtart: 'VERP', Matkl: '' })).toBe('PM');
    expect(costCategory({ Mtart: 'HALB', Matkl: '' })).toBe('OTHER');
    expect(costCategory({ Mtart: 'ZDCO', Matkl: '' })).toBe('OTHER');
  });
});

// FG1 per 1000 PC (ExplQty 1000): RM 10x2=20, perfume 50x0.1=5, PM 1x1000=1000 (+freight 0.1/pc = 100)
const at = (plant: string) => ({ Hwerks: plant, Werks: plant });
const rows = (plant: string, pmRate = '1') => [
  parent(1, 1, 'BULK', '25', at(plant)),
  leaf(2, 2, 'RM1', '10', '0', '2', { ...at(plant), Mtart: 'ROH', Matkl: '101' }),
  leaf(3, 2, 'PERF', '50', '0', '0.1', { ...at(plant), Mtart: 'ROH', Matkl: '106' }),
  leaf(4, 1, 'BOTTLE', pmRate, '0.1', '1000', { ...at(plant), Mtart: 'VERP', Matkl: 'PM-B' }),
];

describe('cost per 1 PC and breakup', () => {
  const r = [...rows('1000'), ...rows('1100', '0.9')];
  const base = simulate(r, EMPTY_SIM);
  it('splits leaf cost per piece into RM / Perfume / PM (parents never counted)', () => {
    const [p1000] = perPiece(r, base, '1000');
    expect(p1000.base.RM.toFixed(4)).toBe('0.0200');
    expect(p1000.base.PERFUME.toFixed(4)).toBe('0.0050');
    expect(p1000.base.PM.toFixed(4)).toBe('1.1000');
    expect(p1000.base.TOTAL.toFixed(4)).toBe('1.1250');
    expect(p1000.delta.isZero()).toBe(true);
  });
  it('component rate change -> impact per 1 PC in INR and %', () => {
    const sim = simulate(r, S({ compPct: { '1000|BOTTLE': 10 } })); // bottle 1 -> 1.1 INR/pc in plant 1000 only
    const items = perPiece(r, sim, '1000');
    const p1000 = items.find((i) => i.plant === '1000')!;
    const p1100 = items.find((i) => i.plant === '1100')!;
    expect(p1000.delta.toFixed(4)).toBe('0.1000');
    expect(p1000.deltaPct!.toFixed(4)).toBe((0.1 / 1.125 * 100).toFixed(4));
    expect(p1000.sim.PM.toFixed(4)).toBe('1.2000');
    expect(p1100.delta.isZero()).toBe(true);
  });
  it('a pure quantity multiplier leaves cost per piece flat', () => {
    const sim = simulate(r, S({ qtyMult: 3 }));
    const [p] = perPiece(r, sim, '1000', 3);
    expect(p.delta.toFixed(6)).toBe('0.000000');
  });
  it('compares plants in INR and finds the cheapest', () => {
    const m = perPieceByPlant(perPiece(r, base, '1000'));
    expect(m.plants).toEqual(['1000', '1100']);
    expect(m.rows[0].cheapest).toBe('1100');
  });
});

describe('component-rate simulation', () => {
  const row = leaf(1, 1, 'RM1', '10', '1', '4', { Hwerks: '1000', Werks: '1000' });
  it('changes the material rate only (freight untouched), keyed by plant|component', () => {
    const s = simulateRow(row, S({ compPct: { '1000|RM1': -20 } }));
    expect(s.ratePcInr.toFixed(4)).toBe('8.0000');
    expect(s.frtPcInr.toFixed(4)).toBe('1.0000');
    expect(s.total.toFixed(2)).toBe('36.00');
    expect(simulateRow(row, S({ compPct: { '1100|RM1': -20 } })).changed).toBe(false);
  });
  it('stacks with the source % and is part of isIdentity', () => {
    expect(isIdentity(S({ compPct: { '1000|RM1': 0 } }))).toBe(true);
    expect(isIdentity(S({ compPct: { '1000|RM1': 5 } }))).toBe(false);
    const s = simulateRow(row, S({ compPct: { '1000|RM1': 10 }, ratePct: { INFOREC: 10 } }));
    expect(s.ratePcInr.toFixed(4)).toBe('12.1000');
  });
  it('lists components per plant with their SAP rate per piece', () => {
    const list = componentRates(rows('1000'));
    expect(list.map((c) => `${c.key}:${c.category}`)).toEqual(['1000|BOTTLE:PM', '1000|RM1:RM', '1000|PERF:PERFUME']);
    expect(list.find((c) => c.comp === 'PERF')!.ratePcInr.toFixed(2)).toBe('50.00');
  });
});
