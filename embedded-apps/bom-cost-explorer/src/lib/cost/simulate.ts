/**
 * Instant client-side what-ifs. These NEVER replace SAP's numbers: every result carries the SAP
 * base alongside, and the UI tags simulated figures. SAP-side logic (BOM explosion, rate
 * resolution, UoM and FX conversion) is not re-implemented here; what-ifs only re-combine the
 * values SAP already returned (RateOptions, per-piece INR rates, freight per piece, quantities).
 *
 *   simulated total (leaf) = (rate/pc INR' + freight/pc INR') x ProdQty x qty multiplier
 *   rate/pc INR'  = override                                            (if overridden), else
 *                   picked option RatePcInr x (1 + source %) x (1 + FX % of the rate currency)
 *   freight/pc'   = FrtPcInr x (1 + freight %) x (1 + FX % of the freight currency)
 *
 * FX shocks apply to the currency an amount is DENOMINATED in (SelCurr / option Curr for the
 * rate, FrtCurr for freight; LocCurr when those are blank): a USD-priced item's INR value moves
 * with USD->INR, whatever the plant's local currency is.
 */
import type { CostLine, RateOption } from '../sap/fields';
import type { RateSource } from '../query/schema';
import { D, ZERO, Decimal } from './decimal';
import { isLeafRow, rowKey } from './tree';

export type PickMode = 'sap' | 'priority' | 'cheapest' | 'latest';

export interface SimSettings {
  pick: PickMode;
  prio: RateSource[];
  /** % change of the rate per source type, e.g. { CONTRACT: 5 } */
  ratePct: Partial<Record<string, number>>;
  freightPct: number;
  /** % change of a currency's FX to INR, e.g. { USD: 3 } */
  fxPct: Record<string, number>;
  qtyMult: number;
  /** rowKey -> manual rate per piece in INR */
  overrides: Record<string, string>;
}

export const EMPTY_SIM: SimSettings = {
  pick: 'sap',
  prio: ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'],
  ratePct: {},
  freightPct: 0,
  fxPct: {},
  qtyMult: 1,
  overrides: {},
};

export function isIdentity(s: SimSettings): boolean {
  return (
    s.pick === 'sap' &&
    Object.values(s.ratePct).every((v) => !v) &&
    !s.freightPct &&
    Object.values(s.fxPct).every((v) => !v) &&
    (s.qtyMult === 1 || !s.qtyMult) &&
    Object.keys(s.overrides).length === 0
  );
}

export interface SimRow {
  qty: Decimal;
  ratePcInr: Decimal;
  frtPcInr: Decimal;
  totPcInr: Decimal;
  total: Decimal; // leaf: (rate+frt) x qty ; parent: 0 (use roll-ups)
  source: string; // effective rate source ('' = no rate)
  rateCurr: string;
  /** Rate per piece in the rate's own currency (null when not decomposable, e.g. override). */
  ratePcSrc: Decimal | null;
  optionIdx: number; // index into RateOptions of the effective option (-1 = SAP selection / none)
  repicked: boolean; // a different option than SAP's
  overridden: boolean;
  changed: boolean; // differs from SAP in any way
}

/** Which RateOption SAP selected (same source, condition, currency and per-piece INR rate). */
export function selectedOptionIndex(r: CostLine): number {
  if (!r.SelSource) return -1;
  const opts = r.RateOptions ?? [];
  let i = opts.findIndex((o) => o.Source === r.SelSource && o.Cond === r.SelCond && o.Curr === r.SelCurr && D(o.RatePcInr).eq(D(r.SelRatePcInr)));
  if (i < 0) i = opts.findIndex((o) => o.Source === r.SelSource && D(o.RatePcInr).eq(D(r.SelRatePcInr)));
  if (i < 0) i = opts.findIndex((o) => o.Source === r.SelSource);
  return i;
}

const validFromTs = (o: RateOption) => (o.ValidFrom ? Date.parse(o.ValidFrom) : 0);

/** Re-pick an option for a row. Returns -1 to keep SAP's selection. */
export function repick(r: CostLine, mode: PickMode, prio: readonly string[]): number {
  const opts = (r.RateOptions ?? []).filter((o) => D(o.RatePcInr).gt(0));
  if (mode === 'sap' || opts.length === 0) return -1;
  const all = r.RateOptions ?? [];
  const idx = (o: RateOption) => all.indexOf(o);
  if (mode === 'cheapest') {
    return idx(opts.reduce((best, o) => (D(o.RatePcInr).lt(D(best.RatePcInr)) ? o : best)));
  }
  if (mode === 'latest') {
    return idx(opts.reduce((best, o) => (validFromTs(o) > validFromTs(best) || (validFromTs(o) === validFromTs(best) && D(o.RatePcInr).lt(D(best.RatePcInr))) ? o : best)));
  }
  // priority: first source in the new order that has an option. If it is the source SAP already
  // chose, keep SAP's own pick (so an unchanged order reproduces SAP exactly).
  for (const src of prio) {
    const cands = opts.filter((o) => o.Source === src);
    if (!cands.length) continue;
    if (src === r.SelSource) return -1;
    // Several options of one source (plants, conditions): the latest valid one, then cheapest.
    return idx(cands.reduce((best, o) => (validFromTs(o) > validFromTs(best) || (validFromTs(o) === validFromTs(best) && D(o.RatePcInr).lt(D(best.RatePcInr))) ? o : best)));
  }
  return -1;
}

const factor = (pct: number | undefined) => (pct ? new Decimal(1).plus(new Decimal(pct).div(100)) : null);

export function baseSimRow(r: CostLine): SimRow {
  const leaf = isLeafRow(r);
  return {
    qty: D(r.ProdQty),
    ratePcInr: D(r.SelRatePcInr),
    frtPcInr: D(r.FrtPcInr),
    totPcInr: D(r.TotCostPcInr),
    total: leaf ? D(r.TotCostInr) : ZERO,
    source: r.SelSource,
    rateCurr: r.SelCurr || r.LocCurr,
    ratePcSrc: r.SelSource ? D(r.SelRatePc) : null,
    optionIdx: -1,
    repicked: false,
    overridden: false,
    changed: false,
  };
}

export function simulateRow(r: CostLine, s: SimSettings): SimRow {
  const base = baseSimRow(r);
  if (!isLeafRow(r)) return base;

  const key = rowKey(r);
  const ov = s.overrides[key];
  let ratePcInr = base.ratePcInr;
  let ratePcSrc = base.ratePcSrc;
  let source = base.source;
  let rateCurr = base.rateCurr;
  let optionIdx = -1;
  let repicked = false;

  if (ov !== undefined && ov !== '') {
    ratePcInr = D(ov);
    ratePcSrc = null;
  } else {
    const oi = repick(r, s.pick, s.prio);
    if (oi >= 0 && oi !== selectedOptionIndex(r)) {
      const o = (r.RateOptions ?? [])[oi];
      ratePcInr = D(o.RatePcInr);
      ratePcSrc = D(o.RatePc);
      source = o.Source;
      rateCurr = o.Curr || r.LocCurr;
      optionIdx = oi;
      repicked = true;
    }
    const fs = factor(s.ratePct[source]);
    const fx = factor(s.fxPct[rateCurr]);
    if (fs) {
      ratePcInr = ratePcInr.times(fs);
      if (ratePcSrc) ratePcSrc = ratePcSrc.times(fs);
    }
    if (fx) ratePcInr = ratePcInr.times(fx);
  }

  let frtPcInr = base.frtPcInr;
  const ff = factor(s.freightPct);
  const ffx = factor(s.fxPct[r.FrtCurr || r.LocCurr]);
  if (ff) frtPcInr = frtPcInr.times(ff);
  if (ffx) frtPcInr = frtPcInr.times(ffx);

  const qty = s.qtyMult && s.qtyMult !== 1 ? base.qty.times(s.qtyMult) : base.qty;
  const changed = !ratePcInr.eq(base.ratePcInr) || !frtPcInr.eq(base.frtPcInr) || !qty.eq(base.qty) || source !== base.source || ov !== undefined;
  if (!changed) return base; // keep SAP's own rounded total for untouched rows

  const totPcInr = ratePcInr.plus(frtPcInr);
  return {
    qty,
    ratePcInr,
    frtPcInr,
    totPcInr,
    total: totPcInr.times(qty),
    source,
    rateCurr,
    ratePcSrc,
    optionIdx,
    repicked,
    overridden: ov !== undefined && ov !== '',
    changed: true,
  };
}

export function simulate(rows: CostLine[], s: SimSettings): SimRow[] {
  if (isIdentity(s)) return rows.map(baseSimRow);
  return rows.map((r) => simulateRow(r, s));
}

// ---- sensitivity ------------------------------------------------------------------------------

export interface TornadoBar {
  driver: string;
  kind: 'component' | 'freight' | 'currency';
  base: Decimal; // value the shock applies to
  down: Decimal; // total impact at -pct
  up: Decimal; // total impact at +pct
}

/** Impact on total INR of +/-pct on each driver: the top components (rate + freight), total
 * freight, and every non-group currency's FX (amounts denominated in it). Linear model. */
export function tornado(rows: CostLine[], sim: SimRow[], opts: { pct?: number; topN?: number; groupCurr?: string } = {}): TornadoBar[] {
  const pct = new Decimal(opts.pct ?? 10).div(100);
  const groupCurr = opts.groupCurr ?? 'INR';
  const byComp = new Map<string, { label: string; v: Decimal }>();
  const byCurr = new Map<string, Decimal>();
  let freight = ZERO;
  rows.forEach((r, i) => {
    if (!isLeafRow(r)) return;
    const s = sim[i];
    const c = byComp.get(r.Idnrk) ?? { label: `${r.Idnrk} ${r.Maktx}`, v: ZERO };
    c.v = c.v.plus(s.total);
    byComp.set(r.Idnrk, c);
    const frt = s.frtPcInr.times(s.qty);
    freight = freight.plus(frt);
    const rateAmt = s.ratePcInr.times(s.qty);
    if (s.rateCurr && s.rateCurr !== groupCurr && !s.overridden) byCurr.set(s.rateCurr, (byCurr.get(s.rateCurr) ?? ZERO).plus(rateAmt));
    const fc = r.FrtCurr || r.LocCurr;
    if (fc && fc !== groupCurr) byCurr.set(fc, (byCurr.get(fc) ?? ZERO).plus(frt));
  });
  const bars: TornadoBar[] = [];
  const top = Array.from(byComp.values()).sort((a, b) => b.v.cmp(a.v)).slice(0, opts.topN ?? 8);
  for (const c of top) bars.push({ driver: c.label, kind: 'component', base: c.v, down: c.v.times(pct).neg(), up: c.v.times(pct) });
  if (freight.gt(0)) bars.push({ driver: 'Freight (all)', kind: 'freight', base: freight, down: freight.times(pct).neg(), up: freight.times(pct) });
  for (const [cur, v] of byCurr) bars.push({ driver: `FX ${cur}→${groupCurr}`, kind: 'currency', base: v, down: v.times(pct).neg(), up: v.times(pct) });
  return bars.sort((a, b) => b.up.abs().cmp(a.up.abs()));
}

export const QTY_BREAKS = [0.5, 1, 2, 5, 10] as const;

/** Cost per piece of each header at quantity multiples (linear scaling of ProdQty). */
export function quantityBreaks(rows: CostLine[], sim: SimRow[], explQty: string, mults: readonly number[] = QTY_BREAKS) {
  const heads = new Map<string, { head: string; text: string; plant: string; total: Decimal }>();
  rows.forEach((r, i) => {
    if (!isLeafRow(r)) return;
    const k = `${r.Hwerks}|${r.Headmat}`;
    const h = heads.get(k) ?? { head: r.Headmat, text: r.Headtxt, plant: r.Hwerks, total: ZERO };
    h.total = h.total.plus(sim[i].total);
    heads.set(k, h);
  });
  const q = D(explQty);
  return Array.from(heads.values()).map((h) => ({
    ...h,
    breaks: mults.map((m) => {
      const qty = q.times(m);
      const total = h.total.times(m);
      return { mult: m, qty, total, perPc: qty.isZero() ? ZERO : total.div(qty) };
    }),
  }));
}
