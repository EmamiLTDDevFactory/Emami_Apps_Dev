/**
 * Cost-change explainer engine - PURE (no model, no I/O). Baseline vs current snapshot lines of one FG, per component
 * (key hwerks|headmat|idnrk|meins) with q (qty per piece), r = r_loc, f = f_loc, x = fx_inr, p = (r + f) * x:
 *   quantity effect = (q1 - q0) * p0
 *   rate effect     = q1 * (r1 - r0) * x0
 *   freight effect  = q1 * (f1 - f0) * x0
 *   FX effect       = q1 * (r1 + f1) * (x1 - x0)
 * The four add up exactly to q1*p1 - q0*p0 (asserted in tests). The totals use SAP's p_inr; the difference between that
 * and the decomposition is reported as `unexplained` (shown openly when over 0.01 INR per piece).
 * Labels: different sel_source -> the rate effect is a "source switch" (both sources named); if Prio / DonorPlant /
 * Lookback differ between the runs the switch is a "setting change". Only in current = "new component" (q1*p1);
 * only in baseline = "removed component" (-q0*p0). Rate appeared / disappeared (blank source <-> rate) is flagged.
 * Different meins = "unit changed": not decomposed, listed for review.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import type { SnapLine, SnapParams } from '../snapshots/snapshot';

export type EffectType = 'quantity' | 'rate' | 'freight' | 'FX' | 'source switch' | 'setting change' | 'new component' | 'removed component';

export interface ComponentChange {
  key: string; idnrk: string; meins: string; mtart: string;
  q0: Decimal; q1: Decimal; p0: Decimal; p1: Decimal;
  cost0: Decimal; cost1: Decimal; delta: Decimal;
  effects: Partial<Record<EffectType, Decimal>>;
  kind: 'changed' | 'new' | 'removed' | 'unit changed' | 'unchanged';
  source0: string; source1: string;
  rateAppeared: boolean; rateDisappeared: boolean;
  label: EffectType | null; // the biggest effect's name
}

export interface ExplainResult {
  total0: Decimal; total1: Decimal; delta: Decimal; deltaPct: Decimal | null;
  effects: Record<EffectType, Decimal>;
  byComponent: ComponentChange[];
  topDrivers: ComponentChange[];
  sourceSwitches: ComponentChange[];
  newComponents: ComponentChange[];
  removedComponents: ComponentChange[];
  unitChanges: { idnrk: string; meins0: string; meins1: string }[];
  unexplained: Decimal;
  warnings: string[];
  settingChange: boolean;
}

const EFFECTS: EffectType[] = ['quantity', 'rate', 'freight', 'FX', 'source switch', 'setting change', 'new component', 'removed component'];
const keyOf = (l: SnapLine) => `${l.hwerks}|${l.headmat}|${l.idnrk}|${l.meins}`;
const val = (l: SnapLine) => {
  const q = D(l.q); const r = D(l.r_loc); const f = D(l.f_loc); const x = D(l.fx_inr).gt(0) ? D(l.fx_inr) : D(1);
  return { q, r, f, x, p: r.plus(f).times(x), pInr: D(l.p_inr) };
};

export function explainChange(baseline: SnapLine[], current: SnapLine[], paramsA?: Partial<SnapParams>, paramsB?: Partial<SnapParams>): ExplainResult {
  const warnings: string[] = [];
  const effects = Object.fromEntries(EFFECTS.map((e) => [e, ZERO])) as Record<EffectType, Decimal>;
  const settingChange = !!paramsA && !!paramsB && (
    (paramsA.prio ?? []).join(',') !== (paramsB.prio ?? []).join(',') || (paramsA.donorPlant ?? '') !== (paramsB.donorPlant ?? '') || paramsA.lookback !== paramsB.lookback);
  if (!baseline.length) warnings.push('No baseline lines: there is nothing to compare with.');
  if (paramsA && paramsB) {
    const diff: string[] = [];
    if (paramsA.explQty !== paramsB.explQty) diff.push('quantity basis');
    if ((paramsA.prio ?? []).join(',') !== (paramsB.prio ?? []).join(',')) diff.push('priority');
    if ((paramsA.donorPlant ?? '') !== (paramsB.donorPlant ?? '')) diff.push('donor plant');
    if (paramsA.lookback !== paramsB.lookback) diff.push('look-back');
    if (paramsA.system && paramsB.system && paramsA.system !== paramsB.system) diff.push('SAP system');
    if (paramsA.stdFrt !== paramsB.stdFrt || paramsA.inclFrt !== paramsB.inclFrt) diff.push('freight setting');
    if (diff.length) warnings.push(`Runs are not like-for-like: ${diff.join(', ')} differ.`);
  }
  const plants0 = new Set(baseline.map((l) => l.hwerks)); const plants1 = new Set(current.map((l) => l.hwerks));
  if (baseline.length && current.length && [...plants1].some((p) => !plants0.has(p))) warnings.push('Runs are not like-for-like: different plant.');
  if (baseline.length && current.length && Math.abs(current.length - baseline.length) / baseline.length > 0.3) warnings.push(`Line counts differ by more than 30% (${baseline.length} vs ${current.length}).`);

  const b = new Map(baseline.map((l) => [keyOf(l), l]));
  const c = new Map(current.map((l) => [keyOf(l), l]));
  const byComp: ComponentChange[] = [];
  const unitChanges: ExplainResult['unitChanges'] = [];
  const handledUnit = new Set<string>();

  // unit changed: same component under the same header but another unit
  const bySku = (m: Map<string, SnapLine>) => { const o = new Map<string, SnapLine[]>(); for (const l of m.values()) { const k = `${l.hwerks}|${l.headmat}|${l.idnrk}`; o.set(k, [...(o.get(k) ?? []), l]); } return o; };
  const b2 = bySku(b); const c2 = bySku(c);
  for (const [k, list1] of c2) {
    const list0 = b2.get(k);
    if (!list0) continue;
    const u0 = list0.map((l) => l.meins).sort().join(','); const u1 = list1.map((l) => l.meins).sort().join(',');
    if (u0 !== u1) {
      unitChanges.push({ idnrk: list1[0].idnrk, meins0: u0, meins1: u1 });
      for (const l of [...list0, ...list1]) handledUnit.add(keyOf(l));
      const cost0 = list0.reduce((a, l) => a.plus(val(l).q.times(val(l).p)), ZERO);
      const cost1 = list1.reduce((a, l) => a.plus(val(l).q.times(val(l).p)), ZERO);
      byComp.push({ key: k, idnrk: list1[0].idnrk, meins: u1, mtart: list1[0].mtart, q0: ZERO, q1: ZERO, p0: ZERO, p1: ZERO, cost0, cost1, delta: cost1.minus(cost0), effects: {}, kind: 'unit changed', source0: list0[0].sel_source, source1: list1[0].sel_source, rateAppeared: false, rateDisappeared: false, label: null });
    }
  }

  const keys = new Set([...b.keys(), ...c.keys()]);
  for (const k of keys) {
    if (handledUnit.has(k)) continue;
    const l0 = b.get(k); const l1 = c.get(k);
    const ref = (l1 ?? l0)!;
    const base: Omit<ComponentChange, 'q0' | 'q1' | 'p0' | 'p1' | 'cost0' | 'cost1' | 'delta' | 'effects' | 'kind' | 'label'> = {
      key: k, idnrk: ref.idnrk, meins: ref.meins, mtart: ref.mtart, source0: l0?.sel_source ?? '', source1: l1?.sel_source ?? '',
      rateAppeared: !!l0 && !!l1 && !l0.sel_source && !!l1.sel_source, rateDisappeared: !!l0 && !!l1 && !!l0.sel_source && !l1.sel_source,
    };
    if (!l0) {
      const v1 = val(l1!); const cost1 = v1.q.times(v1.p);
      effects['new component'] = effects['new component'].plus(cost1);
      byComp.push({ ...base, q0: ZERO, q1: v1.q, p0: ZERO, p1: v1.p, cost0: ZERO, cost1, delta: cost1, effects: { 'new component': cost1 }, kind: 'new', label: 'new component' });
      continue;
    }
    if (!l1) {
      const v0 = val(l0); const cost0 = v0.q.times(v0.p);
      effects['removed component'] = effects['removed component'].minus(cost0);
      byComp.push({ ...base, q0: v0.q, q1: ZERO, p0: v0.p, p1: ZERO, cost0, cost1: ZERO, delta: cost0.neg(), effects: { 'removed component': cost0.neg() }, kind: 'removed', label: 'removed component' });
      continue;
    }
    const v0 = val(l0); const v1 = val(l1);
    const e: Partial<Record<EffectType, Decimal>> = {
      quantity: v1.q.minus(v0.q).times(v0.p),
      freight: v1.q.times(v1.f.minus(v0.f)).times(v0.x),
      FX: v1.q.times(v1.r.plus(v1.f)).times(v1.x.minus(v0.x)),
    };
    const rate = v1.q.times(v1.r.minus(v0.r)).times(v0.x);
    const switched = l0.sel_source !== l1.sel_source;
    const rateLabel: EffectType = switched ? (settingChange ? 'setting change' : 'source switch') : 'rate';
    e[rateLabel] = rate;
    for (const [t, v] of Object.entries(e) as [EffectType, Decimal][]) effects[t] = effects[t].plus(v);
    const cost0 = v0.q.times(v0.p); const cost1 = v1.q.times(v1.p);
    const delta = cost1.minus(cost0);
    const top = (Object.entries(e) as [EffectType, Decimal][]).filter(([, v]) => !v.isZero()).sort((x, y) => y[1].abs().cmp(x[1].abs()))[0];
    byComp.push({ ...base, q0: v0.q, q1: v1.q, p0: v0.p, p1: v1.p, cost0, cost1, delta, effects: e, kind: delta.isZero() ? 'unchanged' : 'changed', label: top ? top[0] : null });
  }

  // totals from SAP's own per-piece INR; the decomposition must explain the difference
  const total0 = baseline.reduce((a, l) => a.plus(D(l.q).times(D(l.p_inr))), ZERO);
  const total1 = current.reduce((a, l) => a.plus(D(l.q).times(D(l.p_inr))), ZERO);
  const delta = total1.minus(total0);
  const explained = EFFECTS.reduce((a, t) => a.plus(effects[t]), ZERO).plus(byComp.filter((x) => x.kind === 'unit changed').reduce((a, x) => a.plus(x.delta), ZERO));
  const unexplained = delta.minus(explained);
  if (unexplained.abs().gt(D('0.01'))) warnings.push('Part of the change is not explained by quantity, rate, freight or FX (SAP per-piece INR differs from rate + freight at the FX factor).');
  if (byComp.some((x) => x.rateAppeared || x.rateDisappeared)) warnings.push('A rate appeared or disappeared for at least one component (missing rate).');

  const sorted = [...byComp].sort((x, y) => y.delta.abs().cmp(x.delta.abs()));
  return {
    total0, total1, delta, deltaPct: total0.isZero() ? null : delta.div(total0).times(100),
    effects, byComponent: sorted, topDrivers: sorted.filter((x) => !x.delta.isZero()).slice(0, 10),
    sourceSwitches: sorted.filter((x) => x.kind === 'changed' && x.source0 !== x.source1),
    newComponents: sorted.filter((x) => x.kind === 'new'), removedComponents: sorted.filter((x) => x.kind === 'removed'),
    unitChanges, unexplained, warnings, settingChange,
  };
}

/** Budget baseline: p0 = bud_landed per component with q unchanged, so only a rate effect remains. */
export function budgetBaseline(current: SnapLine[]): SnapLine[] {
  return current.filter((l) => D(l.bud_landed).gt(0)).map((l) => {
    const x = D(l.fx_inr).gt(0) ? D(l.fx_inr) : D(1);
    const r0 = D(l.bud_landed).div(x).minus(D(l.f_loc));
    return { ...l, r_loc: r0.toString(), p_inr: l.bud_landed, sel_source: l.sel_source };
  });
}
