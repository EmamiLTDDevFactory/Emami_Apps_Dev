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
const tx = (v: string | null | undefined) => String(v ?? '').trim();
const n = (v: Decimal | null, dp = 6): number | null => (v ? Number(v.toFixed(dp)) : null);
const day = (v: string | null | undefined) => String(v ?? '').slice(0, 10);

/** Sign of a posting from its side and Shkzg (user rule, 26.11.2026): on the STANDARD side a debit (Dr, S) is the minus, on the ACTUAL side a credit (Cr, H) is
 * the minus; the other indicator (and no Shkzg) is plus. This matches SAP: the goods receipt credits the freight clearing (Standard = H) and the invoice debits it
 * (Actual = S), so a reversal or credit note comes out negative. */
export const isMinus = (side: Side, shkzg: string | null | undefined): boolean => tx(shkzg).toUpperCase() === (side === 'standard' ? 'S' : 'H');
/** The value is taken as ABSOLUTE; only the side and the Shkzg give the sign (isMinus), whatever sign SAP puts on the value. Quantity and amount alike. */
export const signedAmount = (x: Decimal, shkzg: string | null | undefined, side: Side = 'actual'): Decimal => (isMinus(side, shkzg) ? x.abs().neg() : x.abs());
/** A summed PO line (groupPoLines, IsNet) already holds the net amount and passes through unchanged. A row that is NOT summed is read as an absolute value: on a
 * live answer (NWP) the Standard side comes as its own row with Shkzg H, so the indicator only gives a sign when postings of the same side are netted. */
const netAmount = (x: Decimal, r: Pick<FreightRow, 'Shkzg' | 'IsNet'>): Decimal => (r.IsNet ? x : x.abs());

/** Keep the rows of the chosen purchasing organisations. Rows without Ekorg (an SAP that does not send it) are kept as they are: SAP has already applied the selection. */
export function filterPurchOrgs<T extends { Ekorg?: string }>(rows: T[], orgs: readonly string[]): T[] {
  const want = new Set(orgs.map((o) => o.trim().toUpperCase()).filter(Boolean));
  if (!want.size || !rows.some((r) => tx(r.Ekorg))) return rows;
  return rows.filter((r) => want.has(tx(r.Ekorg).toUpperCase()));
}

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
    // a summed PO line (IsNet) carries its net value even when the quantity of that side is 0
    if (aq.gt(0) || r.IsNet) { if (aq.gt(0)) a.aq = a.aq.plus(aq); a.aa = a.aa.plus(netAmount(D(r.Actualdelvcostamount), r).times(fx)); }
    if (sq.gt(0) || r.IsNet) { if (sq.gt(0)) a.sq = a.sq.plus(sq); a.sa = a.sa.plus(netAmount(D(r.Stddelvcostamount), r).times(fx)); }
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
  vendor: string;
  vendorName: string;
  gstPartner: string;
  placeOfSupply: string;
  transportMode: string;
  /** purchasing organisation of the PO ('' when SAP does not send it) */
  purchOrg: string;
  /** Shkzg: S debit, H credit; 'H/S' when the postings of a summed PO line carry both; '' when SAP does not send it */
  shkzg: string;
  accDoc: string;
  reference: string;
  companyCode: string;
  fgMaterial: string;
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
  /** Actual - Standard in INR for the whole line (both sides present); null otherwise. This is the figure the alert rule is tested on in the PO view. */
  amountVariance: Decimal | null;
  /** (Actual - Standard) / Standard x 100 on the amounts; null when the standard amount is 0 or missing */
  amountVariancePct: Decimal | null;
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
    const aa = aq.gt(0) || r.IsNet ? netAmount(D(r.Actualdelvcostamount), r).times(fx) : ZERO;
    const sa = sq.gt(0) || r.IsNet ? netAmount(D(r.Stddelvcostamount), r).times(fx) : ZERO;
    const actual = aq.gt(0) ? aa.div(aq) : null;
    const standard = sq.gt(0) ? sa.div(sq) : null;
    // a summed PO line keeps its signed net quantity (reversals minus); an unsummed row counts a positive quantity only
    const variance = actual && standard ? actual.minus(standard) : null;
    out.push({
      key: `${k}|${r.Purchasedocument}|${r.Purchaseline}|${r.Conditiontype}|${i}`, plant: c.plant, material: c.material, text: c.text, mtart: c.mtart,
      po: String(r.Purchasedocument ?? '').trim(), line: String(r.Purchaseline ?? '').trim(), poDate: d, cond: String(r.Conditiontype ?? '').trim(),
      vendor: tx(r.Lifnr), vendorName: tx(r.Name1), gstPartner: tx(r.GstPart), placeOfSupply: tx(r.PlcSup), transportMode: tx(r.Ztmode), purchOrg: tx(r.Ekorg), shkzg: tx(r.Shkzg).toUpperCase(),
      accDoc: tx(r.Belnr), reference: tx(r.Xblnr), companyCode: tx(r.Bukrs), fgMaterial: tx(r.FgMatnr),
      unit: r.Baseunit || r.Matuom || '', src: String(r.UsedSrc ?? '').trim().toUpperCase(),
      actualQty: r.IsNet || aq.gt(0) ? aq : ZERO, actualAmount: aa, standardQty: r.IsNet || sq.gt(0) ? sq : ZERO, standardAmount: sa,
      actual, standard, variance, variancePct: variance && standard && !standard.isZero() ? variance.div(standard).times(100) : null,
      amountVariance: aq.gt(0) && sq.gt(0) ? aa.minus(sa) : null, amountVariancePct: aq.gt(0) && sq.gt(0) && !sa.isZero() ? aa.minus(sa).div(sa).times(100) : null,
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

/** Whether a PO line breaches the rule, tested on the AMOUNT variance of the line (Actual - Standard, INR, and its %); a line without both sides is never flagged. */
export const breachesLine = (l: Pick<PoLine, 'amountVariance' | 'amountVariancePct'>, rule: Rule): boolean => breaches({ variance: l.amountVariance, variancePct: l.amountVariancePct }, rule);

/** Alerts first (by the rule chosen on screen), then newest PO date. */
export function sortPoLines(rows: PoLine[], rule: Rule): PoLine[] {
  return [...rows].sort((a, b) => Number(breachesLine(b, rule)) - Number(breachesLine(a, rule)) || b.poDate.localeCompare(a.poDate) || a.plant.localeCompare(b.plant) || a.material.localeCompare(b.material) || a.po.localeCompare(b.po) || a.line.localeCompare(b.line));
}

/* ---------- material wise weighted average (all plants and PO lines of a material together) ---------- */

export interface MaterialWeighted {
  key: string;
  material: string;
  text: string;
  mtart: string;
  unit: string;
  /** plants that have PO lines of the material in the range */
  plants: string[];
  /** PO lines in the range */
  poLines: number;
  actualQty: Decimal;
  /** net of debit and credit, INR */
  actualAmount: Decimal;
  standardQty: Decimal;
  standardAmount: Decimal;
  /** INR per base unit: net amount / delivered quantity (weighted by quantity); null without such a delivery */
  actual: Decimal | null;
  standard: Decimal | null;
  variance: Decimal | null;
  variancePct: Decimal | null;
  lastPo: string;
}

/** One row per material over every plant and PO line in the range: weighted average freight per unit = sum of the net INR amounts / sum of the delivered
 * quantities, for the actual and the standard side. Built from poLines, so exclusions, FxInr and the debit / credit netting are the same as everywhere else. */
export function materialWeighted(components: Component[], freight: FreightRow[], range: DateRange): MaterialWeighted[] {
  const lines = poLines(components, freight, range);
  const byMat = new Map<string, MaterialWeighted>();
  for (const c of components) {
    if (!byMat.has(c.material)) byMat.set(c.material, { key: c.material, material: c.material, text: c.text, mtart: c.mtart, unit: '', plants: [], poLines: 0, actualQty: ZERO, actualAmount: ZERO, standardQty: ZERO, standardAmount: ZERO, actual: null, standard: null, variance: null, variancePct: null, lastPo: '' });
  }
  for (const l of lines) {
    const m = byMat.get(l.material);
    if (!m) continue;
    m.actualQty = m.actualQty.plus(l.actualQty); m.actualAmount = m.actualAmount.plus(l.actualAmount);
    m.standardQty = m.standardQty.plus(l.standardQty); m.standardAmount = m.standardAmount.plus(l.standardAmount);
    m.poLines += 1;
    if (!m.plants.includes(l.plant)) m.plants.push(l.plant);
    m.unit = m.unit || l.unit;
    if (l.poDate > m.lastPo) m.lastPo = l.poDate;
  }
  for (const m of byMat.values()) {
    m.plants.sort();
    m.actual = m.actualQty.gt(0) ? m.actualAmount.div(m.actualQty) : null;
    m.standard = m.standardQty.gt(0) ? m.standardAmount.div(m.standardQty) : null;
    m.variance = m.actual && m.standard ? m.actual.minus(m.standard) : null;
    m.variancePct = m.variance && m.standard && !m.standard.isZero() ? m.variance.div(m.standard).times(100) : null;
  }
  return [...byMat.values()].sort((a, b) => a.material.localeCompare(b.material));
}

/* ---------- all postings (FreightRowSet with AllItems): basis, grouping, one row per posting ---------- */

/** What the person sees: every posting ('all'), or only the postings on the max posting date of their PO line and side ('maxdate', the old behaviour). */
export type Basis = 'all' | 'maxdate';

export type Side = 'actual' | 'standard';
const fxOf = (r: Pick<FreightRow, 'FxInr'>) => (D(r.FxInr).gt(0) ? D(r.FxInr) : D(1));

/** The side of a posting comes from Vgabe (1 = goods receipt = Standard, 2 or 3 = invoice = Actual), never from UsedSrc. Without Vgabe (an older SAP) the side with a quantity. */
export function sideOf(r: Pick<FreightRow, 'Vgabe' | 'Actualdelvquantity'> & Partial<Pick<FreightRow, 'Actualdelvcostamount'>>): Side {
  const v = tx(r.Vgabe);
  if (v === '1') return 'standard';
  if (v === '2' || v === '3') return 'actual';
  // Vgabe empty (as on NWP today): the side is the pair the row fills - an Actual row carries Actualdelv*, a Standard row carries Stddelv*
  return D(r.Actualdelvquantity).gt(0) || !D(r.Actualdelvcostamount ?? 0).isZero() ? 'actual' : 'standard';
}

/** Quantity and INR amount of one posting on its side, both signed by isMinus: Standard Dr (S) and Actual Cr (H) are negative. A subsequent debit / credit
 * (Vgabe 3) has no quantity of its own and its amount counts all the same. */
export function postingFigures(r: FreightRow): { side: Side; qty: Decimal; amount: Decimal } {
  const side = sideOf(r);
  const own = (s: Side) => ({ q: D(s === 'actual' ? r.Actualdelvquantity : r.Stddelvquantity), a: D(s === 'actual' ? r.Actualdelvcostamount : r.Stddelvcostamount) });
  let { q, a } = own(side);
  // A posting row (Vgabe given) whose own side is empty but the other side holds the value (the backend filled the "wrong" pair): use that pair.
  if (tx(r.Vgabe) && q.isZero() && a.isZero()) { const o = own(side === 'actual' ? 'standard' : 'actual'); if (!o.q.isZero() || !o.a.isZero()) { q = o.q; a = o.a; } }
  // A posting's value always counts (a reversal or a subsequent debit / credit may carry no quantity of its own); quantity and value carry the same sign.
  return { side, qty: signedAmount(q, r.Shkzg, side), amount: signedAmount(a, r.Shkzg, side).times(fxOf(r)) };
}

/** The rows are postings (one per posting, with Vgabe 1 / 2 / 3 and / or Shkzg), not one row per PO line. NWP sends Shkzg but leaves Vgabe empty, so either one counts. */
export const hasPostings = (rows: readonly Pick<FreightRow, 'Vgabe'>[] & readonly Partial<Pick<FreightRow, 'Shkzg'>>[]): boolean => rows.some((r) => tx(r.Vgabe) !== '' || tx((r as Partial<FreightRow>).Shkzg) !== '');

export interface BasisResult { rows: FreightRow[]; /** the data has no IsMaxDate at all (SAP without the AllItems change): rows are returned as they came */ fallback: boolean }

/** Basis and Latest only, in the browser (no SAP request). 'maxdate' keeps the IsMaxDate postings, latestOnly the IsLatestPo ones. */
export function applyBasis(rows: FreightRow[], opt: { basis: Basis; latestOnly: boolean }): BasisResult {
  if (!rows.some((r) => r.IsMaxDate)) return { rows, fallback: true };
  let out = rows;
  if (opt.basis === 'maxdate') out = out.filter((r) => r.IsMaxDate);
  if (opt.latestOnly && rows.some((r) => r.IsLatestPo)) out = out.filter((r) => r.IsLatestPo);
  return { rows: out, fallback: false };
}

const postingStamp = (r: Pick<FreightRow, 'Cpudt' | 'Belnr'>) => `${day(r.Cpudt)}|${tx(r.Belnr)}`;

/** One row per PO line (plant + material + purchase document + line + condition type): the Standard side (Vgabe 1) and the Actual side (Vgabe 2, 3) summed
 * into the SAME row, each the net of its signed postings (Standard: Dr S minus, Actual: Cr H minus; quantity and value). Descriptive fields come from the newest posting, PO date
 * unchanged. A line with a standard but no invoice yet stays (no actual figure). The result is marked IsNet and its amounts are already INR (FxInr = 1), so poLines /
 * analyseFreight give the same figures as for a one-row-per-line answer. */
export function groupPoLines(rows: FreightRow[]): FreightRow[] {
  type Acc = { newest: FreightRow; aq: Decimal; aa: Decimal; sq: Decimal; sa: Decimal; hasActual: boolean; max: boolean; latest: boolean; shkzg: Set<string> };
  const groups = new Map<string, Acc>();
  for (const r of rows) {
    if (isExcluded(r)) continue;
    const k = [keyOf(r.Plant, r.Material), tx(r.Purchasedocument), tx(r.Purchaseline), tx(r.Conditiontype)].join('|');
    const f = postingFigures(r);
    const g = groups.get(k) ?? { newest: r, aq: ZERO, aa: ZERO, sq: ZERO, sa: ZERO, hasActual: false, max: false, latest: false, shkzg: new Set<string>() };
    if (f.side === 'actual') { g.aq = g.aq.plus(f.qty); g.aa = g.aa.plus(f.amount); g.hasActual = true; } else { g.sq = g.sq.plus(f.qty); g.sa = g.sa.plus(f.amount); }
    if (postingStamp(r) > postingStamp(g.newest)) g.newest = r;
    if (tx(r.Shkzg)) g.shkzg.add(tx(r.Shkzg).toUpperCase());
    g.max = g.max || !!r.IsMaxDate;
    g.latest = g.latest || !!r.IsLatestPo;
    groups.set(k, g);
  }
  const out: FreightRow[] = [];
  for (const g of groups.values()) {
    out.push({
      // each side is its signed net (postingFigures): a side whose reversals outweigh its postings reads negative
      ...g.newest, IsNet: true, Actualdelvquantity: g.aq.toFixed(), Actualdelvcostamount: g.aa.toFixed(), Stddelvquantity: g.sq.toFixed(), Stddelvcostamount: g.sa.toFixed(),
      FxInr: '1', IsMaxDate: g.max, IsLatestPo: g.latest, Shkzg: [...g.shkzg].sort().join('/'),
    });
  }
  return out;
}

export function postingTypeText(vgabe: string | null | undefined): string {
  const v = tx(vgabe);
  return v === '1' ? 'Goods receipt' : v === '2' ? 'Invoice receipt' : v === '3' ? 'Subsequent debit / credit' : v ? `Type ${v}` : '—';
}
/** Dr / Cr from Shkzg (S debit, H credit). */
export const drCr = (shkzg: string | null | undefined) => (tx(shkzg).toUpperCase() === 'H' ? 'Cr' : tx(shkzg).toUpperCase() === 'S' ? 'Dr' : '');

export interface PostingRow {
  key: string;
  plant: string;
  material: string;
  text: string;
  po: string;
  line: string;
  /** YYYY-MM-DD */
  poDate: string;
  postingDate: string;
  side: Side;
  typeText: string;
  document: string;
  fiscalYear: string;
  item: string;
  drCr: string;
  /** Shkzg as SAP sends it (S / H) */
  shkzg: string;
  cond: string;
  qty: Decimal;
  /** INR (document amount x FxInr, FxInr 1 when missing) */
  amount: Decimal;
  src: string;
  isMaxDate: boolean;
}

/** One row per posting of the components within the PO date range (EXCLUDED lines left out). Newest posting first. */
export function postings(components: Component[], freight: FreightRow[], range: DateRange): PostingRow[] {
  const info = new Map(components.map((c) => [c.key, c]));
  const out: PostingRow[] = [];
  freight.forEach((r, i) => {
    if (isExcluded(r)) return;
    const k = keyOf(r.Plant, r.Material);
    const c = info.get(k);
    if (!c) return;
    const d = day(r.Podate);
    if (!d || d < range.from || d > range.to) return;
    const f = postingFigures(r);
    out.push({
      key: `${k}|${tx(r.Purchasedocument)}|${tx(r.Purchaseline)}|${tx(r.Conditiontype)}|${i}`, plant: c.plant, material: c.material, text: c.text,
      po: tx(r.Purchasedocument), line: tx(r.Purchaseline), poDate: d, postingDate: day(r.Cpudt), side: f.side, typeText: postingTypeText(r.Vgabe),
      document: tx(r.Belnr), fiscalYear: tx(r.Gjahr), item: tx(r.Buzei), drCr: drCr(r.Shkzg), shkzg: tx(r.Shkzg).toUpperCase(), cond: tx(r.Conditiontype), qty: f.qty, amount: f.amount,
      src: String(r.UsedSrc ?? '').trim().toUpperCase(), isMaxDate: !!r.IsMaxDate,
    });
  });
  return out.sort((a, b) => b.postingDate.localeCompare(a.postingDate) || a.plant.localeCompare(b.plant) || a.material.localeCompare(b.material) || a.po.localeCompare(b.po) || a.line.localeCompare(b.line) || a.document.localeCompare(b.document));
}

export function postingsSheet(rows: PostingRow[]): { cols: XCol[]; count: number } {
  return {
    count: rows.length,
    cols: [
      { header: 'Plant', width: 8, get: (i) => rows[i].plant },
      { header: 'Component', width: 14, get: (i) => rows[i].material },
      { header: 'Description', width: 34, get: (i) => rows[i].text },
      { header: 'Purchase order', width: 14, get: (i) => rows[i].po },
      { header: 'PO line', width: 8, get: (i) => rows[i].line },
      { header: 'PO date', width: 12, get: (i) => rows[i].poDate },
      { header: 'Posting date', width: 12, get: (i) => rows[i].postingDate },
      { header: 'Side', width: 10, get: (i) => (rows[i].side === 'actual' ? 'Actual' : 'Standard') },
      { header: 'Posting type', width: 22, get: (i) => rows[i].typeText },
      { header: 'Document', width: 16, get: (i) => rows[i].document },
      { header: 'Dr / Cr', width: 8, get: (i) => rows[i].drCr },
      { header: 'Shkzg', width: 8, get: (i) => rows[i].shkzg },
      { header: 'Quantity', dp: 3, width: 14, get: (i) => n(rows[i].qty, 3) },
      { header: 'Amount (INR)', dp: 2, curr: 'INR', width: 16, get: (i) => n(rows[i].amount, 2) },
      { header: 'Source used by SAP', width: 12, get: (i) => rows[i].src },
      { header: 'Max date', width: 9, get: (i) => (rows[i].isMaxDate ? 'yes' : 'no') },
    ],
  };
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

export function freightAnalysisSheet(rows: FreightAnalysisRow[], rule: Rule, parties?: Map<string, Parties>): { cols: XCol[]; count: number } {
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
      { header: 'Supplier / vendor name', width: 40, get: (i) => (parties?.get(`${rows[i].plant}|${rows[i].material}`)?.vendors ?? []).join('; ') },
      { header: 'Source / origin location', width: 30, get: (i) => (parties?.get(`${rows[i].plant}|${rows[i].material}`)?.sources ?? []).join('; ') },
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
      { header: 'Vendor', width: 12, get: (i) => rows[i].vendor },
      { header: 'Vendor name', width: 30, get: (i) => rows[i].vendorName },
      { header: 'GST partner', width: 18, get: (i) => rows[i].gstPartner },
      { header: 'Source / origin location (place of supply)', width: 22, get: (i) => rows[i].placeOfSupply },
      { header: 'Transporter', width: 12, get: (i) => rows[i].transportMode },
      { header: 'Shkzg (S debit / H credit)', width: 14, get: (i) => rows[i].shkzg },
      { header: 'Accounting document', width: 16, get: (i) => rows[i].accDoc },
      { header: 'Reference', width: 16, get: (i) => rows[i].reference },
      { header: 'Company code', width: 10, get: (i) => rows[i].companyCode },
      { header: 'Purchase org', width: 10, get: (i) => rows[i].purchOrg },
      { header: 'FG material', width: 14, get: (i) => rows[i].fgMaterial },
      { header: 'Unit', width: 6, get: (i) => rows[i].unit },
      { header: 'Source used by SAP', width: 12, get: (i) => rows[i].src },
      { header: 'GRN QTY', dp: 3, width: 16, get: (i) => n(rows[i].standardQty, 3) },
      { header: 'Std Freight', dp: 2, curr: 'INR', width: 20, get: (i) => n(rows[i].standardAmount, 2) },
      { header: 'Actual delivered quantity', dp: 3, width: 16, get: (i) => n(rows[i].actualQty, 3) },
      { header: 'Net actual condition value (INR)', dp: 2, curr: 'INR', width: 20, get: (i) => n(rows[i].actualAmount, 2) },
      { header: 'Variance amount (Actual - Standard, INR)', dp: 2, curr: 'INR', width: 22, get: (i) => n(rows[i].amountVariance, 2) },
      { header: 'Variance amount %', dp: 2, width: 14, get: (i) => n(rows[i].amountVariancePct, 4) },
      { header: 'Standard freight / unit (INR)', dp: 4, curr: 'INR', width: 18, get: (i) => n(rows[i].standard) },
      { header: 'Actual freight / unit (INR)', dp: 4, curr: 'INR', width: 16, get: (i) => n(rows[i].actual) },
      { header: 'Variance (INR / unit)', dp: 4, curr: 'INR', width: 16, get: (i) => n(rows[i].variance) },
      { header: 'Variance % (per unit)', dp: 2, width: 14, get: (i) => n(rows[i].variancePct, 4) },
      { header: `Alert on the line amount (${ruleText(rule)})`, width: 30, get: (i) => (breachesLine(rows[i], rule) ? 'ALERT' : rows[i].actual ? 'ok' : 'no actual freight') },
    ],
  };
}

/** Flagged first, then the biggest gap (by %, then by amount). */
export function sortMaterials(rows: MaterialWeighted[], rule: Rule): MaterialWeighted[] {
  const mag = (r: MaterialWeighted) => r.variancePct ?? r.variance ?? D('-1e9');
  return [...rows].sort((a, b) => Number(breaches(b, rule)) - Number(breaches(a, rule)) || mag(b).cmp(mag(a)) || a.material.localeCompare(b.material));
}

export function materialWeightedSheet(rows: MaterialWeighted[], rule: Rule, parties?: Map<string, Parties>): { cols: XCol[]; count: number } {
  return {
    count: rows.length,
    cols: [
      { header: 'Material', width: 14, get: (i) => rows[i].material },
      { header: 'Description', width: 34, get: (i) => rows[i].text },
      { header: 'Material type', width: 10, get: (i) => rows[i].mtart },
      { header: 'Unit', width: 6, get: (i) => rows[i].unit },
      { header: 'Plants', width: 18, get: (i) => rows[i].plants.join(', ') },
      { header: 'PO lines', dp: 0, width: 9, get: (i) => rows[i].poLines },
      { header: 'Supplier / vendor name', width: 40, get: (i) => (parties?.get(rows[i].material)?.vendors ?? []).join('; ') },
      { header: 'Source / origin location', width: 30, get: (i) => (parties?.get(rows[i].material)?.sources ?? []).join('; ') },
      { header: 'Delivered quantity (actual)', dp: 3, width: 16, get: (i) => n(rows[i].actualQty, 3) },
      { header: 'Net actual freight amount (INR)', dp: 2, curr: 'INR', width: 18, get: (i) => n(rows[i].actualAmount, 2) },
      { header: 'Weighted avg actual freight / unit (INR)', dp: 4, curr: 'INR', width: 20, get: (i) => n(rows[i].actual) },
      { header: 'GRN QTY', dp: 3, width: 16, get: (i) => n(rows[i].standardQty, 3) },
      { header: 'Std Freight', dp: 2, curr: 'INR', width: 18, get: (i) => n(rows[i].standardAmount, 2) },
      { header: 'Weighted avg standard freight / unit (INR)', dp: 4, curr: 'INR', width: 20, get: (i) => n(rows[i].standard) },
      { header: 'Variance (INR / unit)', dp: 4, curr: 'INR', width: 16, get: (i) => n(rows[i].variance) },
      { header: 'Variance %', dp: 2, width: 12, get: (i) => n(rows[i].variancePct, 4) },
      { header: 'Last PO date', width: 12, get: (i) => rows[i].lastPo },
      { header: `Alert (${ruleText(rule)})`, width: 28, get: (i) => (breaches(rows[i], rule) ? 'ALERT' : rows[i].actual ? 'ok' : 'no actual freight') },
    ],
  };
}


/* ---------- supplier and source / origin location (from the goods receipt / PO line), plant wise comparison ---------- */

export interface Parties { vendors: string[]; sources: string[] }
const uniqSorted = (a: string[]) => Array.from(new Set(a.filter(Boolean))).sort();
/** Supplier / vendor names and source (origin) locations of the PO lines, per plant|material and per material (key without plant = material). */
export function partiesOf(lines: PoLine[]): { byComponent: Map<string, Parties>; byMaterial: Map<string, Parties> } {
  const comp = new Map<string, { v: string[]; s: string[] }>(), mat = new Map<string, { v: string[]; s: string[] }>();
  for (const l of lines) {
    const name = [l.vendorName || '', l.vendor ? `(${l.vendor})` : ''].filter(Boolean).join(' ');
    for (const [m, k] of [[comp, `${l.plant}|${l.material}`], [mat, l.material]] as const) {
      const x = m.get(k) ?? { v: [], s: [] };
      x.v.push(name); x.s.push(l.placeOfSupply);
      m.set(k, x);
    }
  }
  const fin = (m: Map<string, { v: string[]; s: string[] }>) => new Map(Array.from(m.entries()).map(([k, x]) => [k, { vendors: uniqSorted(x.v), sources: uniqSorted(x.s) }]));
  return { byComponent: fin(comp), byMaterial: fin(mat) };
}
export const partiesText = (a: string[], max = 3) => (a.length <= max ? a.join('; ') : `${a.slice(0, max).join('; ')} (+${a.length - max})`);

export interface PlantCompare {
  plant: string; materials: number; poLines: number;
  /** all freight of the plant's lines in the range, INR, net of debit and credit */
  actualAmount: Decimal; standardAmount: Decimal;
  /** lines that have both an actual and a standard side: the like-for-like comparison */
  bothLines: number; bothActual: Decimal; bothStandard: Decimal;
  variance: Decimal; variancePct: Decimal | null;
  /** lines that breach the rule */
  flagged: number;
}
/** Plant wise actual vs standard freight (INR): totals of every line, and the variance on the lines that have both sides. */
export function plantCompare(lines: PoLine[], rule: Rule): PlantCompare[] {
  const m = new Map<string, PlantCompare & { mats: Set<string> }>();
  for (const l of lines) {
    const x = m.get(l.plant) ?? { plant: l.plant, materials: 0, poLines: 0, actualAmount: ZERO, standardAmount: ZERO, bothLines: 0, bothActual: ZERO, bothStandard: ZERO, variance: ZERO, variancePct: null, flagged: 0, mats: new Set<string>() };
    x.mats.add(l.material); x.poLines += 1;
    x.actualAmount = x.actualAmount.plus(l.actualAmount); x.standardAmount = x.standardAmount.plus(l.standardAmount);
    if (l.actualQty.gt(0) && l.standardQty.gt(0)) { x.bothLines += 1; x.bothActual = x.bothActual.plus(l.actualAmount); x.bothStandard = x.bothStandard.plus(l.standardAmount); }
    if (breachesLine(l, rule)) x.flagged += 1;
    m.set(l.plant, x);
  }
  return Array.from(m.values()).map((x) => {
    const v = x.bothActual.minus(x.bothStandard);
    return { ...x, materials: x.mats.size, variance: v, variancePct: x.bothStandard.isZero() ? null : v.div(x.bothStandard).times(100) };
  }).sort((a, b) => a.plant.localeCompare(b.plant));
}
export function plantCompareSheet(rows: PlantCompare[]): { cols: XCol[]; count: number } {
  return {
    count: rows.length,
    cols: [
      { header: 'Plant', width: 8, get: (i) => rows[i].plant },
      { header: 'Materials', dp: 0, width: 10, get: (i) => rows[i].materials },
      { header: 'PO lines', dp: 0, width: 9, get: (i) => rows[i].poLines },
      { header: 'Std Freight', dp: 2, curr: 'INR', width: 18, get: (i) => n(rows[i].standardAmount, 2) },
      { header: 'Actual freight (INR)', dp: 2, curr: 'INR', width: 18, get: (i) => n(rows[i].actualAmount, 2) },
      { header: 'Lines with both sides', dp: 0, width: 12, get: (i) => rows[i].bothLines },
      { header: 'Std Freight (both sides)', dp: 2, curr: 'INR', width: 20, get: (i) => n(rows[i].bothStandard, 2) },
      { header: 'Actual freight (both sides, INR)', dp: 2, curr: 'INR', width: 22, get: (i) => n(rows[i].bothActual, 2) },
      { header: 'Variance (Actual - Std, INR)', dp: 2, curr: 'INR', width: 20, get: (i) => n(rows[i].variance, 2) },
      { header: 'Variance %', dp: 2, width: 12, get: (i) => n(rows[i].variancePct, 4) },
      { header: 'Lines in alert', dp: 0, width: 12, get: (i) => rows[i].flagged },
    ],
  };
}
