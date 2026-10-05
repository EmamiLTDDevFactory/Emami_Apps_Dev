/** Dashboard KPIs, charts data and the data-quality lists, from SAP rows + (base or simulated)
 * per-row values. Leaf rows only, decimal.js throughout. */
import type { CostLine } from '../sap/fields';
import { D, ZERO, Decimal } from './decimal';
import { isLeafRow, rowKey } from './tree';
import type { SimRow } from './simulate';

export const UNLIMITED_COVER = 999;

/** Lowest coverage (days) over the three horizons, ignoring 999 (= no requirement). null when
 * every horizon is unlimited or coverage wasn't requested. */
export function minCover(r: CostLine): number | null {
  const vals = [r.CovH1, r.CovH2, r.CovH3].map((v) => Number(v)).filter((v) => Number.isFinite(v) && v !== UNLIMITED_COVER);
  const hasAny = [r.ReqH1, r.ReqH2, r.ReqH3, r.CovH1, r.CovH2, r.CovH3].some((v) => !D(v).isZero());
  if (!hasAny || vals.length === 0) return null;
  return Math.min(...vals);
}

export interface Kpis {
  total: Decimal;
  freight: Decimal;
  freightShare: Decimal | null;
  leafCount: number;
  noRate: number;
  donor: number;
  lowCover: number;
  lowCoverValue: Decimal;
  budgetRows: number;
  budgetVariance: Decimal; // + = actual above budget
  budgetBase: Decimal;
}

const add = (m: Map<string, Decimal>, k: string, v: Decimal) => m.set(k, (m.get(k) ?? ZERO).plus(v));
const top = (m: Map<string, Decimal>, n: number) => Array.from(m.entries()).sort((a, b) => b[1].cmp(a[1])).slice(0, n);

export function analyse(rows: CostLine[], vals: SimRow[], opts: { coverDays: number }) {
  const k: Kpis = { total: ZERO, freight: ZERO, freightShare: null, leafCount: 0, noRate: 0, donor: 0, lowCover: 0, lowCoverValue: ZERO, budgetRows: 0, budgetVariance: ZERO, budgetBase: ZERO };
  const bySource = new Map<string, Decimal>();
  const byComp = new Map<string, Decimal>();
  const compText = new Map<string, string>();
  const byPlant = new Map<string, Decimal>();
  const byGroup = new Map<string, Decimal>();
  const coverRisk: { row: CostLine; i: number; cover: number; value: Decimal }[] = [];
  const budget = new Map<string, { label: string; plant: string; variance: Decimal; perPc: Decimal; qty: Decimal }>();

  rows.forEach((r, i) => {
    if (!isLeafRow(r)) return;
    const v = vals[i];
    k.leafCount++;
    k.total = k.total.plus(v.total);
    k.freight = k.freight.plus(v.frtPcInr.times(v.qty));
    if (!v.source) k.noRate++;
    if (r.Donor) k.donor++;
    add(bySource, v.source || 'NO RATE', v.total);
    add(byComp, r.Idnrk, v.total);
    compText.set(r.Idnrk, r.Maktx);
    add(byPlant, r.Hwerks, v.total);
    add(byGroup, r.Matkl || '(none)', v.total);
    const cov = minCover(r);
    if (cov !== null && cov < opts.coverDays) {
      k.lowCover++;
      k.lowCoverValue = k.lowCoverValue.plus(v.total);
      coverRisk.push({ row: r, i, cover: cov, value: v.total });
    }
    const bud = D(r.BudLanded);
    if (bud.gt(0)) {
      k.budgetRows++;
      // Variance per piece = actual landed per piece minus budget landed per piece.
      const perPc = v.totPcInr.minus(bud);
      const variance = perPc.times(v.qty);
      k.budgetVariance = k.budgetVariance.plus(variance);
      k.budgetBase = k.budgetBase.plus(bud.times(v.qty));
      const key = `${r.Hwerks}|${r.Idnrk}`;
      const b = budget.get(key) ?? { label: `${r.Idnrk} ${r.Maktx}`, plant: r.Hwerks, variance: ZERO, perPc, qty: ZERO };
      b.variance = b.variance.plus(variance);
      b.qty = b.qty.plus(v.qty);
      budget.set(key, b);
    }
  });
  k.freightShare = k.total.isZero() ? null : k.freight.div(k.total).times(100);
  const budgetList = Array.from(budget.values());
  return {
    kpis: k,
    bySource: Array.from(bySource.entries()).sort((a, b) => b[1].cmp(a[1])),
    topDrivers: top(byComp, 10).map(([c, v]) => ({ comp: c, text: compText.get(c) ?? '', value: v })),
    byPlant: top(byPlant, 50),
    byGroup: top(byGroup, 12),
    coverRisk: coverRisk.sort((a, b) => b.value.cmp(a.value)),
    budgetOver: budgetList.filter((b) => b.variance.gt(0)).sort((a, b) => b.variance.cmp(a.variance)).slice(0, 10),
    budgetUnder: budgetList.filter((b) => b.variance.lt(0)).sort((a, b) => a.variance.cmp(b.variance)).slice(0, 10),
  };
}

export type Analysis = ReturnType<typeof analyse>;

// ---- data quality -----------------------------------------------------------------------------

export type DqKind = 'NO_RATE' | 'UOM' | 'ZERO_FX' | 'DONOR' | 'OPTIONS';
export interface DqIssue { kind: DqKind; i: number; key: string; detail: string }

export const DQ_LABEL: Record<DqKind, string> = {
  NO_RATE: 'No rate',
  UOM: 'UoM conversion hint',
  ZERO_FX: 'Zero FX',
  DONOR: 'Donor plant',
  OPTIONS: 'Rate options ≠ SrcCount',
};

export function dataQuality(rows: CostLine[]): DqIssue[] {
  const out: DqIssue[] = [];
  rows.forEach((r, i) => {
    if (!isLeafRow(r)) return;
    const key = rowKey(r);
    if (!r.SelSource) out.push({ kind: 'NO_RATE', i, key, detail: D(r.FrtPcInr).gt(0) ? 'Costed with freight only' : 'No rate and no freight - zero cost' });
    if (r.SelSource && D(r.SelRate).gt(0) && D(r.SelRatePc).isZero())
      out.push({ kind: 'UOM', i, key, detail: `Rate ${r.SelRate} ${r.SelCurr} but rate/pc is 0 - check ${r.Meins} conversion` });
    for (const o of r.RateOptions ?? []) {
      if (o.Uom && o.Uom !== r.Meins && D(o.Rate).gt(0) && D(o.RatePc).isZero()) {
        out.push({ kind: 'UOM', i, key, detail: `${o.Source} option in ${o.Uom} has no per-${r.Meins} rate` });
        break;
      }
    }
    if (r.SelSource && (D(r.SelFx).isZero() || D(r.SelFxInr).isZero()))
      out.push({ kind: 'ZERO_FX', i, key, detail: `${r.SelCurr}→${r.LocCurr}: ${r.SelFx}, →INR: ${r.SelFxInr}` });
    if (r.FrtSrc && D(r.FrtPcLoc).gt(0) && D(r.FrtFx).isZero()) out.push({ kind: 'ZERO_FX', i, key, detail: `Freight FX ${r.FrtCurr} is 0` });
    if (r.Donor) out.push({ kind: 'DONOR', i, key, detail: `Rate taken from plant ${r.Donor}` });
    // Only when the options were actually expanded (RateOptions present): SAP counted SrcCount
    // sources but sent a different number of options.
    if (r.RateOptions && r.RateOptions.length !== r.SrcCount)
      out.push({ kind: 'OPTIONS', i, key, detail: `${r.RateOptions.length} rate option(s) returned, SrcCount says ${r.SrcCount}` });
  });
  return out;
}

// ---- scenario comparison ----------------------------------------------------------------------

export interface DiffInput { rows: CostLine[]; vals: SimRow[] }

interface Agg { label: string; head: string; plant: string; qty: Decimal; rateCost: Decimal; frtCost: Decimal; total: Decimal; srcCost: Decimal | null; curr: string | null | undefined }

function aggregate({ rows, vals }: DiffInput) {
  const m = new Map<string, Agg>();
  rows.forEach((r, i) => {
    if (!isLeafRow(r)) return;
    const v = vals[i];
    const key = `${r.Hwerks}|${r.Headmat}|${r.Idnrk}`;
    const a = m.get(key) ?? { label: `${r.Idnrk} ${r.Maktx}`, head: r.Headmat, plant: r.Hwerks, qty: ZERO, rateCost: ZERO, frtCost: ZERO, total: ZERO, srcCost: ZERO, curr: undefined };
    a.qty = a.qty.plus(v.qty);
    a.rateCost = a.rateCost.plus(v.ratePcInr.times(v.qty));
    a.frtCost = a.frtCost.plus(v.frtPcInr.times(v.qty));
    a.total = a.total.plus(v.total);
    // Rate in its own currency, only while one currency is involved (needed to split out FX).
    const curr = v.source ? v.rateCurr : '';
    if (a.curr === undefined) a.curr = curr;
    else if (a.curr !== curr) a.curr = null;
    if (v.source) a.srcCost = a.srcCost && v.ratePcSrc ? a.srcCost.plus(v.ratePcSrc.times(v.qty)) : null;
    m.set(key, a);
  });
  return m;
}

export interface WaterfallStep { label: string; value: Decimal }

export interface ScenarioDiff {
  base: Decimal;
  other: Decimal;
  delta: Decimal;
  deltaPct: Decimal | null;
  waterfall: WaterfallStep[];
  byHeader: { head: string; base: Decimal; other: Decimal; delta: Decimal }[];
  byComponent: { key: string; label: string; plant: string; head: string; base: Decimal; other: Decimal; delta: Decimal; pct: Decimal | null }[];
}

/**
 * Explains other - base as: quantity, rate, FX, freight, plant/structure (components only in one
 * scenario: a different plant or BOM), and a residual (SAP rounding of TotCostInr, no-rate rows).
 * The steps always add up to the exact delta.
 */
export function diffScenarios(a: DiffInput, b: DiffInput): ScenarioDiff {
  const A = aggregate(a);
  const B = aggregate(b);
  let qtyEff = ZERO, rateEff = ZERO, fxEff = ZERO, frtEff = ZERO, plantEff = ZERO;
  let base = ZERO, other = ZERO;
  const comps: ScenarioDiff['byComponent'] = [];
  const heads = new Map<string, { base: Decimal; other: Decimal }>();
  const headAdd = (h: string, x: Decimal, y: Decimal) => {
    const e = heads.get(h) ?? { base: ZERO, other: ZERO };
    e.base = e.base.plus(x);
    e.other = e.other.plus(y);
    heads.set(h, e);
  };
  const keys = new Set([...A.keys(), ...B.keys()]);
  for (const k of keys) {
    const x = A.get(k);
    const y = B.get(k);
    base = base.plus(x?.total ?? ZERO);
    other = other.plus(y?.total ?? ZERO);
    const any = (x ?? y)!;
    headAdd(any.head, x?.total ?? ZERO, y?.total ?? ZERO);
    const delta = (y?.total ?? ZERO).minus(x?.total ?? ZERO);
    comps.push({ key: k, label: any.label, plant: any.plant, head: any.head, base: x?.total ?? ZERO, other: y?.total ?? ZERO, delta, pct: x && !x.total.isZero() ? delta.div(x.total.abs()).times(100) : null });
    if (!x || !y || x.qty.isZero() || y.qty.isZero()) {
      plantEff = plantEff.plus(delta);
      continue;
    }
    const r0 = x.rateCost.div(x.qty), r1 = y.rateCost.div(y.qty);
    const f0 = x.frtCost.div(x.qty), f1 = y.frtCost.div(y.qty);
    qtyEff = qtyEff.plus(y.qty.minus(x.qty).times(r0.plus(f0)));
    frtEff = frtEff.plus(f1.minus(f0).times(y.qty));
    const rateDelta = r1.minus(r0).times(y.qty);
    // FX split: same single currency on both sides and the source-currency rate is known.
    if (x.curr && x.curr === y.curr && x.srcCost && y.srcCost && !x.srcCost.isZero() && !y.srcCost.isZero()) {
      const s0 = x.srcCost.div(x.qty), s1 = y.srcCost.div(y.qty);
      const fx0 = r0.div(s0), fx1 = r1.div(s1);
      const fxPart = fx1.minus(fx0).times(s1).times(y.qty);
      fxEff = fxEff.plus(fxPart);
      rateEff = rateEff.plus(rateDelta.minus(fxPart));
    } else {
      rateEff = rateEff.plus(rateDelta);
    }
  }
  const delta = other.minus(base);
  const explained = qtyEff.plus(rateEff).plus(fxEff).plus(frtEff).plus(plantEff);
  const waterfall: WaterfallStep[] = [
    { label: 'Quantity', value: qtyEff },
    { label: 'Rate', value: rateEff },
    { label: 'FX', value: fxEff },
    { label: 'Freight', value: frtEff },
    { label: 'Plant / structure', value: plantEff },
    { label: 'Rounding / other', value: delta.minus(explained) },
  ];
  return {
    base,
    other,
    delta,
    deltaPct: base.isZero() ? null : delta.div(base.abs()).times(100),
    waterfall,
    byHeader: Array.from(heads.entries()).map(([head, v]) => ({ head, ...v, delta: v.other.minus(v.base) })).sort((p, q) => q.delta.abs().cmp(p.delta.abs())),
    byComponent: comps.filter((c) => !c.delta.isZero()).sort((p, q) => q.delta.abs().cmp(p.delta.abs())),
  };
}

export { Decimal };
