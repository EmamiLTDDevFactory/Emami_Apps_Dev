import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { misSpec, bridgeSpec, salesSpec, freightSpec } from '@/lib/ai/builders/screens';
import { validateAnswer } from '@/lib/ai/validate';
import { ignoreFor, packText } from '@/lib/ai/narrate';
import { DEFAULT_RULE } from '@/lib/freight/analysis';
import type { BrandView, Window } from '@/lib/dash/logic';

const D = (v: number | string) => new Decimal(v);
const win = (b: number, a: number): Window => ({ qty: D(1000), budget: D(b), actual: D(a), actualCmp: D(a), variance: D(a - b), variancePct: b ? D(((a - b) / b) * 100) : null });
const brand = (code: string, b: number, a: number, nob = 0): BrandView => ({ brand: code, fgCnt: 10, fgNoBudget: nob, version: '02', gjahr: '2026', ftm: win(b / 10, a / 10), ytm: win(b, a), msg: '', band: a > b * 1.03 ? 'red' : 'good' });

describe('narrator facts and templates (no model)', () => {
  it('MIS: the plain template passes the numbers rule against its own facts', () => {
    const brands = [brand('0001', 7000000, 7500000, 2), brand('0004', 2000000, 3000000)];
    const tot = { ftm: win(900000, 1050000), ytm: win(9000000, 10500000) };
    const spec = misSpec({ brands, tot, plants: 'UN13', asOf: '2026-11-24', fy: '2026', version: '02', bn: (c) => (c === '0001' ? 'BoroPlus' : '7 Oil') });
    const facts = spec.facts.list();
    expect(facts.find((f) => f.label.startsWith('Year-to-date variance in percent'))!.display).toBe('16.7%');
    expect(facts.some((f) => f.label.includes('BoroPlus'))).toBe(true);
    const v = validateAnswer(spec.template(), facts, ignoreFor(spec));
    expect(v.errors).toEqual([]);
  });
  it('bridge: effects are summed per effect and the template validates', () => {
    const rows = [{ Zbrand: 'A', Effect: 'BUDGET', SortNo: 10, Value: '1000000', Msg: '' }, { Zbrand: 'B', Effect: 'BUDGET', SortNo: 10, Value: '500000', Msg: '' }, { Zbrand: 'A', Effect: 'ACTUAL', SortNo: 130, Value: '1200000', Msg: '' }, { Zbrand: 'B', Effect: 'ACTUAL', SortNo: 130, Value: '550000', Msg: '' }, { Zbrand: 'A', Effect: 'RATE_R', SortNo: 20, Value: '150000', Msg: '' }];
    const spec = bridgeSpec(rows, '', 'UN13', '2026-11-24');
    const f = spec.facts.list();
    expect(f.find((x) => x.label.startsWith('Budget'))!.display).toBe('15.00 lakh');
    expect(validateAnswer(spec.template(), f, ignoreFor(spec)).errors).toEqual([]);
  });
  it('sales and freight templates validate', () => {
    const sv = (brandCode: string, nsv: number, cogm: number) => ({ grain: 'B', brand: brandCode, nsv: D(nsv), cogm: D(cogm), gm: D(nsv - cogm), gmPct: D(((nsv - cogm) / nsv) * 100), noCogm: 1, skuCnt: 5 }) as never;
    const brands = [sv('1', 5000000, 3000000), sv('2', 1000000, 700000)];
    const tot = { gsv: D(7000000), deductions: D(1000000), nsv: D(6000000), cogm: D(3700000), gm: D(2300000), gmPct: D('38.3'), soldQty: D(100000) };
    const s = salesSpec({ brands, tot, plants: 'DP01', period: '2026-04-01 to 2026-11-24', bn: (c) => `Brand ${c === '1' ? 'One' : 'Two'}` });
    expect(validateAnswer(s.template(), s.facts.list(), ignoreFor(s)).errors).toEqual([]);
    const fr = freightSpec({ totals: { rows: 10, withBoth: 8, flagged: 3, above: 5, below: 2, noActual: 1 } as never, materials: [], plants: [], rule: 'above 10 %', period: '2026-08-27 to 2026-11-24' });
    expect(validateAnswer(fr.template(), fr.facts.list(), ignoreFor(fr)).errors).toEqual([]);
  });
  it('the review pack text names every review and says how it was written', () => {
    const t = packText([{ feature: 'mis', title: 'MIS: budget vs actual', text: 'Actual is above budget.', template: false, at: '24 Nov' }, { feature: 'sales', title: 'Sales view', text: 'Plain.', template: true, at: '24 Nov' }]);
    expect(t).toContain('MIS: budget vs actual'); expect(t).toContain('Sales view (plain summary)');
  });
});
