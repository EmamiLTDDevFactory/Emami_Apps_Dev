import { describe, expect, it } from 'vitest';
import { budgetPlan, elapsedMonths, emptyBudget, groupSavings, monthRates, savingsEstimate, type BudgetSettings } from '@/lib/plan/budgetSim';
import type { PlanLineWithOptions } from '@/lib/plan/sources';

// 10 units a month of each component (120 a year)
const months = (q: number) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`QtyM${i + 1}`, String(q)]));
const L = (o: Record<string, string>) => ({
  Land1: 'IN', Hwerks: '1000', Werks: '1000', Headmat: 'FG1', Headtxt: 'Oil', PlanQty: '1200', Level: '1', Parent: 'FG1', HasChild: '',
  Mtart: 'ROH', Matkl: '101', Meins: 'KG', Maktx: '', SelSource: 'PO', SelRatePcInr: '0', BudLanded: '0', ActRatePcInr: '0', QtyTot: '120', ...months(10), ...o,
}) as unknown as PlanLineWithOptions;
const rows = [
  L({ Idnrk: '100003292', BudLanded: '100', SelRatePcInr: '105', ActRatePcInr: '90' }), // 120 x 100 = 12 000
  L({ Idnrk: 'PM1', BudLanded: '10', Mtart: 'VERP', ActRatePcInr: '12' }), // 1 200
  L({ Idnrk: '100003292', Headmat: 'FG2', Headtxt: 'Balm', PlanQty: '600', BudLanded: '100', ActRatePcInr: '90' }), // 12 000
  L({ Idnrk: 'NOBUD', SelRatePcInr: '5' }), // no budget: selected 5 -> 600
];
const S = (o: Partial<BudgetSettings> = {}): BudgetSettings => ({ ...emptyBudget(), ...o });

describe('requirement: monthly budget rates, rate simulation, where used, savings', () => {
  it('H1 = SAP budget rate, H2 = revision (component rate > component % > all %)', () => {
    expect(monthRates(rows[0], S()).rates.map((r) => r.toNumber())).toEqual(Array(12).fill(100));
    const all = monthRates(rows[0], S({ h2Pct: 10 })).rates.map((r) => r.toNumber());
    expect(all.slice(0, 6)).toEqual(Array(6).fill(100));
    expect(all.slice(6)).toEqual(Array(6).fill(110));
    expect(monthRates(rows[0], S({ h2Pct: 10, h2: { '100003292': { pc: '120' } } })).rates[11].toNumber()).toBe(120);
    expect(monthRates(rows[0], S({ h2Pct: 10, h2: { '100003292': { pct: -5 } } })).rates[6].toNumber()).toBe(95);
  });

  it('plan cost = sum of month qty x month rate; H2 revision moves only Oct-Mar', () => {
    const r = budgetPlan(rows, S());
    expect(r.budget.toNumber()).toBe(25800); // 12000 + 1200 + 12000 + 600 (selected fallback)
    expect(r.fallbackLines).toBe(1);
    const h2 = budgetPlan(rows, S({ h2: { '100003292': { pc: '110' } } }));
    expect(h2.budget.toNumber()).toBe(25800 + 2 * 60 * 10); // 2 FGs x 60 units in H2 x +10
    expect(h2.h1.toNumber()).toBe(12900);
  });

  it('rate change on 100003292 (% or absolute) shows the impact per FG and overall', () => {
    const r = budgetPlan(rows, S({ sim: { '100003292': { pct: 10 } } }));
    expect(r.delta.toNumber()).toBe(2400);
    const fg1 = r.fgs.find((f) => f.headmat === 'FG1')!;
    expect(fg1.delta.toNumber()).toBe(1200);
    expect(fg1.budgetPc!.toFixed(4)).toBe('11.5000'); // (12000 + 1200 + 600) / 1200
    expect(fg1.deltaPc!.toNumber()).toBe(1);
    const abs = budgetPlan(rows, S({ sim: { '100003292': { pc: '80' } } }));
    expect(abs.delta.toNumber()).toBe(-4800);
    expect(abs.affected).toBe(2);
  });

  it('where used: the component lists every FG with monthly quantities', () => {
    const c = budgetPlan(rows, S()).components.find((x) => x.idnrk === '100003292')!;
    expect(c.qty.toNumber()).toBe(240);
    expect(c.fgs.map((f) => f.headmat).sort()).toEqual(['FG1', 'FG2']);
    expect(c.fgs[0].months[0].toNumber()).toBe(10);
  });

  it('savings estimate = (budget - actual) x planned qty of the chosen months; groups add up', () => {
    const e = savingsEstimate(rows, S(), [0, 1, 2], 'ACTUAL'); // Apr-Jun
    // 100003292: 2 FGs x 30 units x (100 - 90) = +600 ; PM1: 30 x (10 - 12) = -60 ; NOBUD excluded
    expect(e.saving.toNumber()).toBe(540);
    expect(e.noBudget).toBe(1);
    const byMonth = groupSavings(e, 'month', ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']);
    expect(byMonth.map((m) => m.saving.toNumber())).toEqual([180, 180, 180]);
    expect(groupSavings(e, 'component', []).find((x) => x.label === 'PM1')!.saving.toNumber()).toBe(-60);
  });

  it('elapsed fiscal months: April 0, October 6, March 11', () => {
    expect(elapsedMonths(new Date(2026, 3, 10))).toBe(0);
    expect(elapsedMonths(new Date(2026, 9, 14))).toBe(6);
    expect(elapsedMonths(new Date(2027, 2, 1))).toBe(11);
  });
});

import { actualSavings, groupActual } from '@/lib/plan/budgetSim';
import { actualsByFg, rateLookup, sapDay } from '@/lib/plan/sapFeeds';

describe('SAP feeds: budget rates by validity, local currency, actual production', () => {
  const ctxFor = (rows: Parameters<typeof rateLookup>[0]) => ({ rates: rateLookup(rows), fyStart: 2026 });
  const rec = (from: string, to: string, inr: string, extra: Record<string, string> = {}) => ({ Matnr: '100003292', Werks: '1000', Datab: from, Datbi: to, Rate: inr, Waers: 'INR', RateInr: inr, Peinh: '1', Meins: 'KG', ...extra });

  it('dates: /Date(ms)/, YYYYMMDD and ISO', () => {
    expect(sapDay('20261001')).toBe(20261001);
    expect(sapDay('2026-10-01T00:00:00')).toBe(20261001);
    expect(sapDay(`/Date(${Date.UTC(2026, 9, 1)})/`)).toBe(20261001);
  });

  it('the record valid on the 1st of each month drives that month (H1 100, revised H2 120)', () => {
    const ctx = ctxFor([rec('20260401', '20260930', '100'), rec('20261001', '20270331', '120')]);
    const rates = monthRates(rows[0], S({ h2Pct: 50 }), ctx); // the app's H2 % does not apply to SAP-covered components
    expect(rates.source).toBe('sap');
    expect(rates.rates.map((x) => x.toNumber())).toEqual([...Array(6).fill(100), ...Array(6).fill(120)]);
    const r = budgetPlan(rows, S(), ctx);
    expect(r.budget.toNumber()).toBe(25800 + 2 * 60 * 20);
    expect(r.sapRateLines).toBe(2);
  });

  it('price unit and a month without a valid record (falls back to the cost-line budget rate)', () => {
    const ctx = ctxFor([rec('20260601', '20270331', '1000', { Peinh: '10' })]); // 100 per unit from June
    const m = monthRates(rows[0], S(), ctx).rates.map((x) => x.toNumber());
    expect(m[0]).toBe(100); // April: BudLanded fallback
    expect(m[2]).toBe(100); // June: 1000 / 10
  });

  it('local currency: INR / (TotCostPcInr / TotCostPcLoc)', () => {
    const bd = [L({ Idnrk: 'X', BudLanded: '70', LocCurr: 'BDT', TotCostPcInr: '0.7', TotCostPcLoc: '1', Land1: 'BD', Hwerks: 'BD10' })];
    const r = budgetPlan(bd, S());
    expect(r.fgs[0].curr).toBe('BDT');
    expect(r.fgs[0].budget.toNumber()).toBe(8400); // 120 x 70
    expect(r.fgs[0].budgetLoc!.toNumber()).toBe(12000); // / 0.7
  });

  it('savings on actual production = produced qty x budget cost per piece - production value', () => {
    // FG1: 3 components per piece 0.1 x 100 + 0.1 x 10 + 0.1 x 5 = 11.5 / pc (plan qty 1200, QtyTot 120)
    const r = budgetPlan(rows, S());
    const actuals = actualsByFg([
      { Matnr: 'FG1', Werks: '1000', Spmon: '202604', Menge: '100', Meins: 'PC', Value: '1000', Waers: 'INR', ValueInr: '1000' },
      { Matnr: 'FG1', Werks: '1000', Spmon: '202610', Menge: '100', Meins: 'PC', Value: '1000', Waers: 'INR', ValueInr: '1000' }, // October: outside the months passed
    ], 2026);
    const a = actualSavings(r, actuals, S(), [0, 1, 2, 3, 4, 5]);
    expect(a.rows).toHaveLength(1);
    expect(a.budget.toNumber()).toBe(1150); // 100 x 11.5
    expect(a.saving.toNumber()).toBe(150);
    expect(a.fgsWithout).toBe(1); // FG2 not produced
    expect(groupActual(a, 'country', [])[0].saving.toNumber()).toBe(150);
  });
});
