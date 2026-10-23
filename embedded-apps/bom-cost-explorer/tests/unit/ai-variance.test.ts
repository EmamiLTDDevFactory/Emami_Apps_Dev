import { describe, expect, it } from 'vitest';
import { budgetBaseline, explainChange } from '@/lib/ai/variance';
import { buildSnapshots, paramsHash, snapParams } from '@/lib/snapshots/snapshot';
import { defaultQuery } from '@/lib/query/schema';
import type { SnapLine } from '@/lib/snapshots/snapshot';
import type { CostLine } from '@/lib/sap/fields';
import { D } from '@/lib/cost/decimal';

// p_inr = (r + f) * x so totals and the decomposition agree unless a test wants otherwise
const L = (idnrk: string, q: number, r: number, f = 0, x = 1, o: Partial<SnapLine> = {}): SnapLine => ({
  hwerks: '1000', headmat: 'FG1', idnrk, mtart: 'ROH', meins: 'KG', q: String(q), sel_source: 'CONTRACT', src_count: 2, donor: '',
  r_loc: String(r), f_loc: String(f), fx_inr: String(x), p_inr: String((r + f) * x), loc_curr: 'INR', cov_h1: '', bud_landed: '0', ...o,
});
const sumEffects = (r: ReturnType<typeof explainChange>) => Object.values(r.effects).reduce((a, v) => a.plus(v), D(0)).plus(r.byComponent.filter((x) => x.kind === 'unit changed').reduce((a, x) => a.plus(x.delta), D(0)));
const P = { prio: ['CONTRACT', 'INFOREC'], donorPlant: '', lookback: 365, explQty: '1', system: 'NGQ', inclFrt: true, stdFrt: false };

describe('variance engine', () => {
  it('no change: zero delta, no drivers', () => {
    const r = explainChange([L('A', 2, 10)], [L('A', 2, 10)]);
    expect(r.delta.isZero()).toBe(true);
    expect(r.topDrivers).toHaveLength(0);
  });
  it('quantity effect = (q1 - q0) * p0', () => {
    const r = explainChange([L('A', 2, 10)], [L('A', 3, 10)]);
    expect(r.effects.quantity.toNumber()).toBe(10);
    expect(r.delta.toNumber()).toBe(10);
  });
  it('rate effect = q1 * (r1 - r0) * x0', () => {
    const r = explainChange([L('A', 2, 10)], [L('A', 2, 12)]);
    expect(r.effects.rate.toNumber()).toBe(4);
  });
  it('freight effect = q1 * (f1 - f0) * x0', () => {
    const r = explainChange([L('A', 2, 10, 1)], [L('A', 2, 10, 1.5)]);
    expect(r.effects.freight.toNumber()).toBe(1);
  });
  it('FX effect = q1 * (r1 + f1) * (x1 - x0)', () => {
    const r = explainChange([L('A', 2, 10, 0, 1)], [L('A', 2, 10, 0, 1.1)]);
    expect(r.effects.FX.toFixed(4)).toBe('2.0000');
  });
  it('all four at once still sum exactly to q1p1 - q0p0', () => {
    const r = explainChange([L('A', 2, 10, 1, 1.2)], [L('A', 2.5, 11, 1.4, 1.25)]);
    expect(sumEffects(r).minus(r.delta).abs().lt('1e-12')).toBe(true);
    expect(r.unexplained.abs().lt('0.01')).toBe(true);
  });
  it('many components: effects always sum to the total change', () => {
    const base = [L('A', 2, 10, 1, 1), L('B', 5, 3, 0.2, 83), L('C', 1, 100, 0, 1)];
    const cur = [L('A', 2.2, 10.5, 1.1, 1), L('B', 5, 3.1, 0.25, 84), L('C', 0.9, 98, 0, 1)];
    const r = explainChange(base, cur);
    expect(sumEffects(r).minus(r.delta).abs().lt('1e-9')).toBe(true);
  });
  it('source switch: the rate effect is labelled and both sources named', () => {
    const r = explainChange([L('A', 2, 10)], [L('A', 2, 12, 0, 1, { sel_source: 'MBEW' })]);
    expect(r.effects['source switch'].toNumber()).toBe(4);
    expect(r.effects.rate.isZero()).toBe(true);
    expect(r.sourceSwitches[0]).toMatchObject({ source0: 'CONTRACT', source1: 'MBEW' });
  });
  it('setting change: a switch with a different priority is a setting change, not a market change', () => {
    const r = explainChange([L('A', 2, 10)], [L('A', 2, 12, 0, 1, { sel_source: 'MBEW' })], P, { ...P, prio: ['MBEW'] });
    expect(r.effects['setting change'].toNumber()).toBe(4);
    expect(r.effects['source switch'].isZero()).toBe(true);
    expect(r.settingChange).toBe(true);
  });
  it('donor plant or look-back difference is also a setting change', () => {
    expect(explainChange([L('A', 1, 1)], [L('A', 1, 2, 0, 1, { sel_source: 'MBEW' })], P, { ...P, donorPlant: '1100' }).settingChange).toBe(true);
    expect(explainChange([L('A', 1, 1)], [L('A', 1, 2, 0, 1, { sel_source: 'MBEW' })], P, { ...P, lookback: 730 }).settingChange).toBe(true);
  });
  it('new component = q1 * p1', () => {
    const r = explainChange([L('A', 1, 10)], [L('A', 1, 10), L('B', 2, 5)]);
    expect(r.effects['new component'].toNumber()).toBe(10);
    expect(r.newComponents.map((x) => x.idnrk)).toEqual(['B']);
  });
  it('removed component = -q0 * p0', () => {
    const r = explainChange([L('A', 1, 10), L('B', 2, 5)], [L('A', 1, 10)]);
    expect(r.effects['removed component'].toNumber()).toBe(-10);
    expect(r.removedComponents.map((x) => x.idnrk)).toEqual(['B']);
  });
  it('rate appeared (blank source -> rate) is flagged with a warning', () => {
    const r = explainChange([L('A', 1, 0, 0, 1, { sel_source: '' })], [L('A', 1, 5)]);
    expect(r.byComponent[0].rateAppeared).toBe(true);
    expect(r.warnings.some((w) => w.includes('rate appeared'))).toBe(true);
  });
  it('rate disappeared is flagged', () => {
    expect(explainChange([L('A', 1, 5)], [L('A', 1, 0, 0, 1, { sel_source: '' })]).byComponent[0].rateDisappeared).toBe(true);
  });
  it('unit changed: not decomposed, listed for review', () => {
    const r = explainChange([L('A', 1, 10)], [L('A', 1000, 0.01, 0, 1, { meins: 'G' })]);
    expect(r.unitChanges).toEqual([{ idnrk: 'A', meins0: 'KG', meins1: 'G' }]);
    expect(r.byComponent[0].kind).toBe('unit changed');
    expect(r.effects.quantity.isZero()).toBe(true);
  });
  it('quantity basis difference warns not like-for-like', () => {
    expect(explainChange([L('A', 1, 1)], [L('A', 1, 1)], P, { ...P, explQty: '1000' }).warnings[0]).toContain('quantity basis');
  });
  it('different plant warns', () => {
    expect(explainChange([L('A', 1, 1)], [L('A', 1, 1, 0, 1, { hwerks: '1100' })]).warnings.some((w) => w.includes('different plant'))).toBe(true);
  });
  it('line counts differing by more than 30% warn', () => {
    const base = [L('A', 1, 1), L('B', 1, 1), L('C', 1, 1), L('D', 1, 1)];
    expect(explainChange(base, [L('A', 1, 1)]).warnings.some((w) => w.includes('30%'))).toBe(true);
  });
  it('missing baseline warns', () => expect(explainChange([], [L('A', 1, 1)]).warnings[0]).toContain('No baseline'));
  it('unexplained remainder: SAP p_inr differs from (r + f) * x -> shown openly', () => {
    const r = explainChange([L('A', 1, 10)], [L('A', 1, 10, 0, 1, { p_inr: '10.5' })]);
    expect(r.unexplained.toNumber()).toBe(0.5);
    expect(r.warnings.some((w) => w.includes('not explained'))).toBe(true);
  });
  it('top drivers are ordered by impact and capped at 10', () => {
    const base = Array.from({ length: 12 }, (_, i) => L(`C${i}`, 1, 10));
    const cur = Array.from({ length: 12 }, (_, i) => L(`C${i}`, 1, 10 + i));
    const r = explainChange(base, cur);
    expect(r.topDrivers).toHaveLength(10);
    expect(r.topDrivers[0].idnrk).toBe('C11');
  });
  it('delta % uses the baseline total', () => {
    expect(explainChange([L('A', 1, 10)], [L('A', 1, 11)]).deltaPct!.toNumber()).toBe(10);
  });
  it('budget baseline: q unchanged, p0 = bud_landed -> rate effect only', () => {
    const cur = [L('A', 2, 10, 1, 1, { bud_landed: '9' })];
    const r = explainChange(budgetBaseline(cur), cur);
    expect(r.effects.quantity.isZero()).toBe(true);
    expect(r.effects.freight.isZero()).toBe(true);
    expect(r.effects.rate.toNumber()).toBe(4); // 2 x (11 - 9)
    expect(r.delta.toNumber()).toBe(4);
  });
});

describe('snapshots', () => {
  const row = (o: Record<string, unknown>) => ({ Hwerks: '1000', Headmat: 'FG1', Headtxt: 'Oil', HasChild: '', Idnrk: 'A', Mtart: 'ROH', Meins: 'KG', ProdQty: '2', Menge: '2', Hbmeng: '1', SelSource: 'CONTRACT', SrcCount: 2, Donor: '', SelRatePcLoc: '10', FrtPcLoc: '0', SelFxInr: '1', TotCostPcInr: '10', LocCurr: 'INR', BudLanded: '0', ...o }) as unknown as CostLine;

  it('q = ProdQty / ExplQty; duplicated component summed with weighted rates; total = sum q * p_inr', () => {
    const q = { ...defaultQuery('B'), materials: ['FG1'], plants: ['1000'], explQty: '2' };
    const [s] = buildSnapshots([row({}), row({ ProdQty: '2', SelRatePcLoc: '20', TotCostPcInr: '20' }), row({ Idnrk: 'P', HasChild: 'X' })], q, 'NGQ', 'u');
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].q).toBe('2'); // (2 + 2) / 2
    expect(s.lines[0].r_loc).toBe('15'); // weighted
    expect(D(s.total_per_unit).toNumber()).toBe(30);
  });
  it('Hbmeng = 0 guard when ProdQty is missing', () => {
    const [s] = buildSnapshots([row({ ProdQty: '0', Hbmeng: '0' })], { ...defaultQuery('B'), materials: ['FG1'], plants: ['1000'] }, 'NGQ', 'u');
    expect(s.lines[0].q).toBe('0');
  });
  it('params hash changes with the priority and not with the time', () => {
    const q = { ...defaultQuery('B'), materials: ['FG1'], plants: ['1000'] };
    expect(paramsHash(snapParams(q, 'NGQ'))).toBe(paramsHash(snapParams(q, 'NGQ')));
    expect(paramsHash(snapParams(q, 'NGQ'))).not.toBe(paramsHash(snapParams({ ...q, prio: ['MBEW'] }, 'NGQ')));
  });
});

import { explainFacts, explainTemplate } from '@/lib/ai/explain';
import { validateAnswer } from '@/lib/ai/validate';
describe('explainer facts and template', () => {
  const ctx = { sku: 'FG1', headtxt: 'Oil', plant: '1000', baselineLabel: 'baseline', currentLabel: 'current', system: 'NGQ' };
  it('the deterministic template passes the numbers rule', () => {
    const r = explainChange([L('A', 2, 10), L('B', 1, 5)], [L('A', 2.5, 11, 0.2), L('C', 1, 3, 0, 1, { sel_source: 'MBEW' })]);
    const f = explainFacts(r, ctx);
    const t = explainTemplate(r, f, ctx);
    expect(validateAnswer(t, f.book.list(), ['1000', 'FG1']).ok).toBe(true);
    expect(t.paragraphs[0].text).toContain('went up');
  });
  it('a warning comes first in the template', () => {
    const r = explainChange([L('A', 1, 1)], [L('A', 1, 1, 0, 1, { p_inr: '2' })]);
    const t = explainTemplate(r, explainFacts(r, ctx), ctx);
    expect(t.paragraphs[0].text.startsWith('Note:')).toBe(true);
  });
});
