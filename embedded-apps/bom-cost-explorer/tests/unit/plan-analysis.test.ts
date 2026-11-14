import { describe, expect, it } from 'vitest';
import { analyse, priorKey, type PriorRates } from '@/lib/plan/analysis';
import { analysisSheets } from '@/lib/plan/analysisExport';
import type { PlanCostLine } from '@/lib/plan/fields';
import { budgetPerUnit } from '@/lib/cost/budgetUnit';

const base = { Land1: 'IN', Landx: 'India', Hwerks: 'P1', Headmat: '4000', Headtxt: 'FG ONE', PlanQty: '1000', HasChild: '', Level: 2, BomSrc: 'OWN', LocCurr: 'INR', Werks: 'P1', Meins: 'G', Mtart: 'ROH', Matkl: '404' };
// Capsacin-like leaf: price unit kg, BOM unit g (factor 1000), current 55/g, budget 65000/kg.
const leaf = (o: Record<string, unknown>) => budgetPerUnit({ ...base, QtyTot: '400', SelSource: 'CONTRACT', SelRate: '55000', SelRatePc: '55', SelRatePcInr: '55', TotCostPcInr: '55', TotCostInr: '22000', TotCostLoc: '22000', TotCostPcLoc: '55', BudLanded: '65000', BudSrcamt: '65000', BudSrccurr: 'INR', BudSource: 'ZCOMP', BudGjahr: '2026', ...o } as never) as unknown as PlanCostLine;
const parent = { ...base, HasChild: 'X', Level: 1, Idnrk: '4000' } as unknown as PlanCostLine;

describe('budget analysis', () => {
  const lines = [parent, leaf({ Idnrk: '100', Maktx: 'CAPSACIN' }), leaf({ Idnrk: '200', Maktx: 'PACK', Mtart: 'PKGN', Meins: 'PC', SelRate: '2', SelRatePc: '2', SelRatePcInr: '2', TotCostPcInr: '2', TotCostInr: '800', QtyTot: '400', BudLanded: '3', BudSrcamt: '3' })];

  it('brings the budget rate from its price unit to the BOM unit', () => {
    const a = analyse(lines, null);
    const cap = a.items.find((i) => i.comp === '100')!;
    expect(cap.unitFactor).toBe(1000);
    expect(cap.budgetRateInr).toBeCloseTo(65, 6);
    expect(cap.budgetCostInr).toBeCloseTo(26000, 6);
    const pack = a.items.find((i) => i.comp === '200')!;
    expect(pack.budgetCostInr).toBeCloseTo(1200, 6);
  });

  it('rolls the FG up per piece, by category, and against current cost', () => {
    const a = analyse(lines, null);
    const f = a.fgs[0];
    expect(f.costInr).toBeCloseTo(22800, 6);
    expect(f.budgetInr).toBeCloseTo(27200, 6);
    expect(f.budgetPcInr).toBeCloseTo(27.2, 6);
    expect(f.byCat.RM).toBeCloseTo(26000, 6); expect(f.byCat.PM).toBeCloseTo(1200, 6);
    expect(f.budgetVsCurrentPct).toBeCloseTo(19.298, 2);
    expect(a.totals.budgetInr).toBeCloseTo(27200, 6);
  });

  it('compares with previous-year rates like for like and leaves uncovered components at the budget rate', () => {
    const prior: PriorRates = new Map([[priorKey('IN', 'P1', '100'), { rate: 50000, curr: 'INR', inr: 50000 }]]);
    const a = analyse(lines, prior);
    const cap = a.items.find((i) => i.comp === '100')!;
    expect(cap.priorRateInr).toBeCloseTo(50, 6);
    expect(cap.yoyPct).toBeCloseTo(30, 6);
    expect(a.fgs[0].priorInr).toBeCloseTo(20000 + 1200, 6);
    expect(a.totals.yoyPct).toBeCloseTo(((27200 - 21200) / 21200) * 100, 4);
    expect(a.comps.find((c) => c.comp === '200')!.yoyPct).toBeNull();
  });

  it('ranks components into ABC classes, lists gaps and failed FGs, and every sheet cell can be read', () => {
    const noBudget = leaf({ Idnrk: '300', Maktx: 'NO BUD', BudLanded: '0', BudSrcamt: '0' });
    const a = analyse([...lines, noBudget], null, null, [{ werks: 'P2', materials: ['0000009'], message: 'timeout' }]);
    expect(a.comps[0].comp).toBe('100'); expect(a.comps[0].abc).toBe('A');
    expect(a.comps.at(-1)!.cumShare).toBeCloseTo(1, 6);
    expect(a.totals.noBudget).toBe(1); expect(a.totals.failed).toBe(1);
    expect(a.risks.map((r) => r.type)).toEqual(expect.arrayContaining(['Not costed (SAP failed)', 'No budget rate (zcomponent)']));
    const { main, extra } = analysisSheets(a, 'PLAN', ['P1'], '2026');
    expect(extra.map((e) => e.name)).toContain('FG item breakup');
    for (const s of [{ ...main }, ...extra]) for (let i = 0; i < s.count; i++) for (const c of s.cols) expect(() => c.get(i)).not.toThrow();
  });
});
