import { describe, expect, it } from 'vitest';
import { emptyCompSim, isCompSimIdentity, lineChange, simLineCost, simulateComponents, type CompSimSettings } from '@/lib/plan/componentSim';
import { headerRollups } from '@/lib/plan/maths';
import type { PlanCostLine } from '@/lib/plan/fields';

const months = (q: number) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`QtyM${i + 1}`, i === 0 ? String(q) : '0']));
const L = (o: Partial<Record<string, string>>): PlanCostLine => ({
  Land1: 'IN', Hwerks: '1000', Werks: '1000', Headmat: 'FG1', Headtxt: 'Oil 100ml', PlanQty: '1000', Level: '1', Parent: 'FG1', HasChild: '',
  Mtart: 'ROH', Matkl: '101', Meins: 'KG', Maktx: '', SelSource: 'PO', ...o,
} as unknown as PlanCostLine);
const leaf = (idnrk: string, qty: number, pc: number, o: Partial<Record<string, string>> = {}) =>
  L({ Idnrk: idnrk, QtyTot: String(qty), TotCostPcInr: String(pc), TotCostInr: String(qty * pc), ...months(qty), ...o });

const rows: PlanCostLine[] = [
  L({ Idnrk: 'SFG1', HasChild: 'X', QtyTot: '10', TotCostPcInr: '0', TotCostInr: '0' }), // not a leaf: never counted
  leaf('RM1', 10, 100), // 1000
  leaf('PERF', 1, 2000, { Matkl: '106' }), // 2000 (perfume)
  leaf('BOT', 1000, 3, { Mtart: 'VERP' }), // 3000 (PM)
  leaf('RM1', 20, 100, { Headmat: 'FG2', Headtxt: 'Oil 200ml', PlanQty: '500' }), // 2000
  leaf('CAP', 500, 2, { Headmat: 'FG2', Headtxt: 'Oil 200ml', PlanQty: '500', Mtart: 'PKGN', Land1: 'BD' }), // 1000, other country
];

describe('component cost simulation', () => {
  it('nothing entered = SAP figures, zero impact', () => {
    const r = simulateComponents(rows, emptyCompSim());
    expect(isCompSimIdentity(emptyCompSim())).toBe(true);
    expect(r.base.toNumber()).toBe(9000);
    expect(r.sim.toNumber()).toBe(9000);
    expect(r.delta.isZero()).toBe(true);
    expect(r.affected).toBe(0);
  });

  it('category %: RM +10% moves only RM lines; product cost / pc and overall impact follow', () => {
    const s: CompSimSettings = { ...emptyCompSim(), catPct: { RM: 10 } };
    const r = simulateComponents(rows, s);
    expect(r.delta.toNumber()).toBe(300); // RM1 1000 + 2000 -> +300
    expect(r.deltaPct!.toFixed(4)).toBe('3.3333');
    const fg1 = r.products.find((p) => p.headmat === 'FG1')!;
    expect(fg1.base.toNumber()).toBe(6000);
    expect(fg1.sim.toNumber()).toBe(6100);
    expect(fg1.basePc!.toNumber()).toBe(6);
    expect(fg1.simPc!.toNumber()).toBe(6.1);
    expect(fg1.deltaPc!.toFixed(2)).toBe('0.10');
    const fg2 = r.products.find((p) => p.key === 'IN|1000|FG2')!;
    expect(fg2.delta.toNumber()).toBe(200);
    expect(r.products.find((p) => p.key === 'BD|1000|FG2')!.delta.isZero()).toBe(true);
    expect(r.affected).toBe(2);
    expect(r.countries.find((c) => c.land1 === 'BD')!.affected).toBe(0);
  });

  it('perfume is its own category (ROH + group 106), not RM', () => {
    const r = simulateComponents(rows, { ...emptyCompSim(), catPct: { PERFUME: -5 } });
    expect(r.delta.toNumber()).toBe(-100);
  });

  it('component % wins over category %; new cost / unit wins over both, in every product', () => {
    const s: CompSimSettings = { catPct: { RM: 10 }, compPct: { RM1: -20 }, compPc: { BOT: '4' } };
    expect(lineChange(rows[1], s)).toEqual({ kind: 'pct', pct: -20, from: 'component' });
    const r = simulateComponents(rows, s);
    // RM1: 3000 x -20% = -600; BOT: 1000 x (4 - 3) = +1000
    expect(r.delta.toNumber()).toBe(400);
    const rm1 = r.components.find((c) => c.idnrk === 'RM1')!;
    expect(rm1.products).toBe(2);
    expect(rm1.basePc!.toNumber()).toBe(100);
    expect(rm1.simPc!.toNumber()).toBe(80);
  });

  it('new cost on a component SAP priced at 0 uses QtyTot x new cost; monthly cost follows', () => {
    const z = leaf('FREE', 50, 0);
    const x = simLineCost(z, { ...emptyCompSim(), compPc: { FREE: '2' } });
    expect(x.total.toNumber()).toBe(100);
    expect(x.months[0].toNumber()).toBe(100);
  });

  it('simulated product roll-up equals headerRollups with the simulated line costs', () => {
    const s: CompSimSettings = { ...emptyCompSim(), catPct: { PM: 50 } };
    const r = simulateComponents(rows, s);
    const ref = headerRollups(rows, (l) => simLineCost(l, s).total);
    for (const p of r.products) expect(p.sim.eq(ref.get(p.key)!.total)).toBe(true);
    expect(r.simMonths.reduce((a, v) => a + v.toNumber(), 0)).toBe(r.sim.toNumber());
  });
});
