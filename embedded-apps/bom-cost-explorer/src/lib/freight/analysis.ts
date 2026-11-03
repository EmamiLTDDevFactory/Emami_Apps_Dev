/**
 * Freight analysis (component-wise): the STANDARD vs ACTUAL freight of BOM components, per plant, for the PO lines
 * of a date range. Only raw / packing material types (ROH, PKGN, VERP). Pure logic, decimal.js throughout.
 *
 * Input: the components (RmPmRowSet rows: Material, Mtart, Plant) and the PO freight lines (FreightRowSet rows, many
 * per component). Per plant and component, over the PO lines whose PO date lies in the range:
 *   actual / unit   = sum(actual delivery cost x FxInr) / sum(actual delivery quantity)
 *   standard / unit = sum(standard delivery cost x FxInr) / sum(standard delivery quantity)
 * (weighted by quantity, INR per base unit; lines SAP marks EXCLUDED are left out). A component with no actual
 * delivery in the range has no actual figure (null) and is never flagged: there is nothing to compare.
 * The alert rule is applied here, on screen, to the aggregated rows; changing it never calls SAP again.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import type { FreightRow, RmPmRow } from '../sap/fields';
import type { XCol } from '../client/export';

export const FREIGHT_TYPES = ['ROH', 'PKGN', 'VERP'] as const;
export type FreightType = (typeof FREIGHT_TYPES)[number];
export const FREIGHT_TYPE_LABEL: Record<FreightType, string> = { ROH: 'ROH (raw material)', PKGN: 'PKGN (packing)', VERP: 'VERP (packaging)' };

export interface Component { key: string; material: string; text: string; plant: string; mtart: string }
const keyOf = (plant: string, material: string) => `${plant.trim()}|${material.trim()}`;

/** The BOM components of the chosen material types, one per plant and material. */
export function componentsOf(rows: Pick<RmPmRow, 'Material' | 'Matdesc' | 'Mtart' | 'Plant'>[], types: readonly string[]): Component[] {
  const want = new Set(types.map((t) => t.trim().toUpperCase()));
  const out = new Map<string, Component>();
  for (const r of rows) {
    const mtart = String(r.Mtart ?? '').trim().toUpperCase();
    if (!want.has(mtart) || !r.Material) continue;
    const k = keyOf(r.Plant, r.Material);
    if (!out.has(k)) out.set(k, { key: k, material: r.Material.trim(), text: r.Matdesc ?? '', plant: r.Plant.trim(), mtart });
  }
  return [...out.values()].sort((a, b) => a.plant.localeCompare(b.plant) || a.material.localeCompare(b.material));
}

export interface DateRange { from: string; to: string } // YYYY-MM-DD, both days included

const isExcluded = (r: Pick<FreightRow, 'UsedSrc'>) => String(r.UsedSrc ?? '').trim().toUpperCase() === 'EXCLUDED';
const day = (v: string | null | undefined) => String(v ?? '').slice(0, 10);

/** Days of SAP's freight window needed to reach back to `from` from today (FreightDays counts back from today; max 3650 on the service). */
export function freightDaysFor(from: string, now: Date = new Date()): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const d = Math.floor((today - start) / 86_400_000) + 1;
  return Math.min(3650, Math.max(1, Number.isFinite(d) ? d : 1));
}

export interface FreightAnalysisRow {
  key: string;
  plant: string;
  material: string;
  text: string;
  mtart: string;
  /** INR per base unit; null = no actual (or standard) delivery in the range */
  actual: Decimal | null;
  standard: Decimal | null;
  /** actual - standard, INR per unit; null when either figure is missing */
  variance: Decimal | null;
  /** (actual - standard) / standard x 100; null when standard is 0 or missing */
  variancePct: Decimal | null;
  unit: string;
  actualQty: Decimal;
  standardQty: Decimal;
  /** distinct PO lines in the range */
  pos: number;
  lastPo: string;
}

export function analyseFreight(components: Component[], freight: FreightRow[], range: DateRange): FreightAnalysisRow[] {
  type Acc = { aq: Decimal; aa: Decimal; sq: Decimal; sa: Decimal; pos: Set<string>; last: string; unit: string };
  const byKey = new Map<string, Acc>();
  const known = new Set(components.map((c) => c.key));
  for (const r of freight) {
    if (isExcluded(r)) continue;
    const k = keyOf(r.Plant, r.Material);
    if (!known.has(k)) continue;
    const d = day(r.Podate);
    if (!d || d < range.from || d > range.to) continue;
    const a = byKey.get(k) ?? { aq: ZERO, aa: ZERO, sq: ZERO, sa: ZERO, pos: new Set<string>(), last: '', unit: '' };
    const fx = D(r.FxInr).gt(0) ? D(r.FxInr) : D(1);
    const aq = D(r.Actualdelvquantity);
    const sq = D(r.Stddelvquantity);
    if (aq.gt(0)) { a.aq = a.aq.plus(aq); a.aa = a.aa.plus(D(r.Actualdelvcostamount).times(fx)); }
    if (sq.gt(0)) { a.sq = a.sq.plus(sq); a.sa = a.sa.plus(D(r.Stddelvcostamount).times(fx)); }
    a.pos.add(`${r.Purchasedocument}|${r.Purchaseline}`);
    if (d > a.last) a.last = d;
    a.unit = a.unit || r.Baseunit || r.Matuom || '';
    byKey.set(k, a);
  }
  return components.map((c): FreightAnalysisRow => {
    const a = byKey.get(c.key);
    const actual = a && a.aq.gt(0) ? a.aa.div(a.aq) : null;
    const standard = a && a.sq.gt(0) ? a.sa.div(a.sq) : null;
    const variance = actual && standard ? actual.minus(standard) : null;
    return {
      key: c.key, plant: c.plant, material: c.material, text: c.text, mtart: c.mtart, actual, standard, variance,
      variancePct: variance && standard && !standard.isZero() ? variance.div(standard).times(100) : null,
      unit: a?.unit ?? '', actualQty: a?.aq ?? ZERO, standardQty: a?.sq ?? ZERO, pos: a ? a.pos.size : 0, lastPo: a?.last ?? '',
    };
  });
}

/* ---------- purchase order wise: one row per PO line (the same lines the component figures are built from) ---------- */

export interface PoLine {
  key: string;
  plant: string;
  material: string;
  text: string;
  mtart: string;
  po: string;
  line: string;
  /** YYYY-MM-DD */
  poDate: string;
  /** freight condition type of the line (for example ZFR1) */
  cond: string;
  unit: string;
  /** SAP's own source for the line: ACTUAL, STANDARD (no actual delivery yet) */
  src: string;
  actualQty: Decimal;
  /** INR (document amount x FxInr) */
  actualAmount: Decimal;
  standardQty: Decimal;
  standardAmount: Decimal;
  /** INR per base unit; null when the line has no such delivery */
  actual: Decimal | null;
  standard: Decimal | null;
  variance: Decimal | null;
  variancePct: Decimal | null;
}

/** Every PO freight line of the components within the date range (lines SAP marks EXCLUDED are left out), with the same per-unit
 * figures as the component rows: INR, amount x FxInr divided by the delivered quantity. Newest PO date first. */
export function poLines(components: Component[], freight: FreightRow[], range: DateRange): PoLine[] {
  const info = new Map(components.map((c) => [c.key, c]));
  const out: PoLine[] = [];
  freight.forEach((r, i) => {
    if (isExcluded(r)) return;
    const k = keyOf(r.Plant, r.Material);
    const c = info.get(k);
    if (!c) return;
    const d = day(r.Podate);
    if (!d || d < range.from || d > range.to) return;
    const fx = D(r.FxInr).gt(0) ? D(r.FxInr) : D(1);
    const aq = D(r.Actualdelvquantity);
    const sq = D(r.Stddelvquantity);
    const aa = aq.gt(0) ? D(r.Actualdelvcostamount).times(fx) : ZERO;
    const sa = sq.gt(0) ? D(r.Stddelvcostamount).times(fx) : ZERO;
    const actual = aq.gt(0) ? aa.div(aq) : null;
    const standard = sq.gt(0) ? sa.div(sq) : null;
    const variance = actual && standard ? actual.minus(standard) : null;
    out.push({
      key: `${k}|${r.Purchasedocument}|${r.Purchaseline}|${r.Conditiontype}|${i}`, plant: c.plant, material: c.material, text: c.text, mtart: c.mtart,
      po: String(r.Purchasedocument ?? '').trim(), line: String(r.Purchaseline ?? '').trim(), poDate: d, cond: String(r.Conditiontype ?? '').trim(),
      unit: r.Baseunit || r.Matuom || '', src: String(r.UsedSrc ?? '').trim().toUpperCase(),
      actualQty: aq.gt(0) ? aq : ZERO, actualAmount: aa, standardQty: sq.gt(0) ? sq : ZERO, standardAmount: sa,
      actual, standard, variance, variancePct: variance && standard && !standard.isZero() ? variance.div(standard).times(100) : null,
    });
  });
  return out.sort((a, b) => b.poDate.localeCompare(a.poDate) || a.plant.localeCompare(b.plant) || a.material.localeCompare(b.material) || a.po.localeCompare(b.po) || a.line.localeCompare(b.line));
}

/** The whole calendar: every PO line SAP returned, whatever its date. */
export const ALL_DATES: DateRange = { from: '0000-01-01', to: '9999-12-31' };

/** PO lines of the components that SAP returned but the chosen date range hides (EXCLUDED lines never count). */
export function linesOutsideRange(components: Component[], freight: FreightRow[], range: DateRange): { returned: number; inRange: number; outside: number; earliest: string; latest: string } {
  const all = poLines(components, freight, ALL_DATES);
  const inRange = all.filter((l) => l.poDate >= range.from && l.poDate <= range.to).length;
  const dates = all.map((l) => l.poDate).sort();
  return { returned: all.length, inRange, outside: all.length - inRange, earliest: dates[0] ?? '', latest: dates[dates.length - 1] ?? '' };
}

/** Alerts first (by the rule chosen on screen), then newest PO date. */
export function sortPoLines(rows: PoLine[], rule: Rule): PoLine[] {
  return [...rows].sort((a, b) => Number(breaches(b, rule)) - Number(breaches(a, rule)) || b.poDate.localeCompare(a.poDate) || a.plant.localeCompare(b.plant) || a.material.localeCompare(b.material) || a.po.localeCompare(b.po) || a.line.localeCompare(b.line));
}

/* ---------- alert / early-watch rule (chosen on screen) ---------- */

export type RuleKind = 'pct_above' | 'abs_above' | 'any_above' | 'pct_both';
export interface Rule { kind: RuleKind; /** % for pct_*, INR per unit for abs_above; ignored for any_above */ threshold: string }
export const RULE_OPTIONS: { value: RuleKind; label: string; needsThreshold: boolean; unit: string; hint: string }[] = [
  { value: 'pct_above', label: 'Actual above standard by more than X %', needsThreshold: true, unit: '%', hint: 'Cost-up watch: flags when actual freight per unit is more than X % over standard.' },
  { value: 'abs_above', label: 'Actual above standard by more than X INR / unit', needsThreshold: true, unit: 'INR / unit', hint: 'Flags when the gap per base unit is more than X INR, however big the %.' },
  { value: 'any_above', label: 'Actual above standard (any amount)', needsThreshold: false, unit: '', hint: 'Flags every component whose actual freight is above standard.' },
  { value: 'pct_both', label: 'Actual differs from standard by more than X % (either way)', needsThreshold: true, unit: '%', hint: 'Flags big gaps in both directions, e.g. a standard that is far too high.' },
];
export const DEFAULT_RULE: Rule = { kind: 'pct_above', threshold: '10' };

/** Whether a row breaches the rule. Rows without both figures are never flagged; a missing / invalid threshold flags nothing (except 'any_above'). */
export function breaches(row: Pick<FreightAnalysisRow, 'variance' | 'variancePct'>, rule: Rule): boolean {
  const v = row.variance;
  if (!v) return false;
  const t = rule.threshold.trim() === '' ? null : D(rule.threshold);
  const valid = t !== null && t.gte(0) && /^\d+(\.\d+)?$/.test(rule.threshold.trim());
  switch (rule.kind) {
    case 'any_above': return v.gt('0.000001');
    case 'abs_above': return valid && v.gt(t!);
    case 'pct_above': return valid && !!row.variancePct && row.variancePct.gt(t!);
    case 'pct_both': return valid && !!row.variancePct && row.variancePct.abs().gt(t!);
  }
}

export const ruleText = (rule: Rule): string => {
  const o = RULE_OPTIONS.find((x) => x.value === rule.kind)!;
  return o.needsThreshold ? o.label.replace('X %', `${rule.threshold || '?'} %`).replace('X INR / unit', `${rule.threshold || '?'} INR / unit`) : o.label;
};

export interface AnalysisTotals { rows: number; withBoth: number; flagged: number; above: number; below: number; noActual: number }
export function analysisTotals(rows: FreightAnalysisRow[], rule: Rule): AnalysisTotals {
  return {
    rows: rows.length,
    withBoth: rows.filter((r) => r.variance).length,
    flagged: rows.filter((r) => breaches(r, rule)).length,
    above: rows.filter((r) => r.variance?.gt('0.000001')).length,
    below: rows.filter((r) => r.variance?.lt('-0.000001')).length,
    noActual: rows.filter((r) => !r.actual).length,
  };
}

/** Flagged first, then the biggest gap (by %, then by amount). */
export function sortAnalysis(rows: FreightAnalysisRow[], rule: Rule): FreightAnalysisRow[] {
  const mag = (r: FreightAnalysisRow) => r.variancePct ?? r.variance ?? D('-1e9');
  return [...rows].sort((a, b) => Number(breaches(b, rule)) - Number(breaches(a, rule)) || mag(b).cmp(mag(a)) || a.plant.localeCompare(b.plant) || a.material.localeCompare(b.material));
}

const n = (v: Decimal | null, dp = 6): number | null => (v ? Number(v.toFixed(dp)) : null);
export function freightAnalysisSheet(rows: FreightAnalysisRow[], rule: Rule): { cols: XCol[]; count: number } {
  return {
    count: rows.length,
    cols: [
      { header: 'Plant', width: 8, get: (i) => rows[i].plant },
      { header: 'Component', width: 14, get: (i) => rows[i].material },
      { header: 'Description', width: 34, get: (i) => rows[i].text },
      { header: 'Material type', width: 10, get: (i) => rows[i].mtart },
      { header: 'Unit', width: 6, get: (i) => rows[i].unit },
      { header: 'Standard freight / unit (INR)', dp: 4, curr: 'INR', width: 18, get: (i) => n(rows[i].standard) },
      { header: 'Actual freight / unit (INR)', dp: 4, curr: 'INR', width: 18, get: (i) => n(rows[i].actual) },
      { header: 'Variance (INR / unit)', dp: 4, curr: 'INR', width: 16, get: (i) => n(rows[i].variance) },
      { header: 'Variance %', dp: 2, width: 12, get: (i) => n(rows[i].variancePct, 4) },
      { header: 'Actual quantity', dp: 3, width: 14, get: (i) => n(rows[i].actualQty, 3) },
      { header: 'PO lines', dp: 0, width: 9, get: (i) => rows[i].pos },
      { header: 'Last PO date', width: 12, get: (i) => rows[i].lastPo },
      { header: `Alert (${ruleText(rule)})`, width: 28, get: (i) => (breaches(rows[i], rule) ? 'ALERT' : rows[i].actual ? 'ok' : 'no actual freight') },
    ],
  };
}

export function poLinesSheet(rows: PoLine[], rule: Rule): { cols: XCol[]; count: number } {
  return {
    count: rows.length,
    cols: [
      { header: 'Plant', width: 8, get: (i) => rows[i].plant },
      { header: 'Component', width: 14, get: (i) => rows[i].material },
      { header: 'Description', width: 34, get: (i) => rows[i].text },
      { header: 'Material type', width: 10, get: (i) => rows[i].mtart },
      { header: 'Purchase order', width: 14, get: (i) => rows[i].po },
      { header: 'PO line', width: 8, get: (i) => rows[i].line },
      { header: 'PO date', width: 12, get: (i) => rows[i].poDate },
      { header: 'Freight condition', width: 10, get: (i) => rows[i].cond },
      { header: 'Unit', width: 6, get: (i) => rows[i].unit },
      { header: 'Source used by SAP', width: 12, get: (i) => rows[i].src },
      { header: 'Delivered quantity (actual)', dp: 3, width: 16, get: (i) => n(rows[i].actualQty, 3) },
      { header: 'Actual freight amount (INR)', dp: 2, curr: 'INR', width: 16, get: (i) => n(rows[i].actualAmount, 2) },
      { header: 'Actual freight / unit (INR)', dp: 4, curr: 'INR', width: 16, get: (i) => n(rows[i].actual) },
      { header: 'Standard freight / unit (INR)', dp: 4, curr: 'INR', width: 18, get: (i) => n(rows[i].standard) },
      { header: 'Variance (INR / unit)', dp: 4, curr: 'INR', width: 16, get: (i) => n(rows[i].variance) },
      { header: 'Variance %', dp: 2, width: 12, get: (i) => n(rows[i].variancePct, 4) },
      { header: `Alert (${ruleText(rule)})`, width: 28, get: (i) => (breaches(rows[i], rule) ? 'ALERT' : rows[i].actual ? 'ok' : 'no actual freight') },
    ],
  };
}
