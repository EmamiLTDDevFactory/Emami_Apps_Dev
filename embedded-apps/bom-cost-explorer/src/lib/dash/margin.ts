/**
 * Margin analysis (Costing dashboard). SAP (DashMarginSet) returns the invoice conditions per SKU / customer; everything below is plain arithmetic on them:
 *   Gross sales = selling price (ZP12) + GST, Gross margin = Revenue - COGS, GM % = (Revenue - COGS) / Revenue x 100.
 * Revenue is the gross sales by default (as in the Gross Margin Analysis report) or the selling price without GST.
 * COGS = RM + PM + perfume + overhead + the consumer and trade scheme costs of the invoices.
 * "As per current COGM" comes from a data set the business supplies (CSV, per piece by SKU); it replaces the four base components of the SKU.
 * What-if drivers are percentage changes applied to every line; the maths is linear, so totals of a group equal the sum of its lines.
 */
import Decimal from 'decimal.js';
import type { MarginRow } from './types';

const d = (v: string | number | null | undefined) => { try { return new Decimal(String(v ?? '0') || '0'); } catch { return new Decimal(0); } };
const Z = new Decimal(0);

export interface Comp { rm: Decimal; pm: Decimal; pf: Decimal; oh: Decimal }
export interface MLine {
  grain: string; key: string; label: string; brand: string; matkl: string; matnr: string; kunag: string; scheme: string; crssku: string; business: string;
  qty: Decimal; mrp: Decimal; sp: Decimal; chRet: Decimal; chDis: Decimal; chSs: Decimal; gst: Decimal;
  base: Comp;                 // invoice RM / PM / perfume / overhead (positive conditions)
  scheme_: Comp;              // consumer + trade scheme cost per component
  bud: Comp | null;           // budget cost PER PIECE (latest approved version); null = NBC
  budVer: string; flag: string; msg: string;
}
export const sumComp = (c: Comp) => c.rm.plus(c.pm).plus(c.pf).plus(c.oh);
const comp = (rm: Decimal, pm: Decimal, pf: Decimal, oh: Decimal): Comp => ({ rm, pm, pf, oh });

export function parseMargin(rows: MarginRow[]): { sku: MLine[]; customers: MLine[] } {
  const line = (r: MarginRow): MLine => ({
    grain: r.Grain, key: `${r.Grain}|${r.Zbrand}|${r.Matnr}|${r.Bwtar ?? ''}|${r.Kunag}`, label: r.Grain === 'C' ? (r.KunagTxt || r.Kunag) : r.Maktx, brand: r.Zbrand, matkl: r.Matkl,
    matnr: r.Matnr, kunag: r.Kunag, scheme: r.Zscheme, crssku: r.Crssku, business: r.Zbusiness,
    qty: d(r.Qty), mrp: d(r.Mrp), sp: d(r.Sp), chRet: d(r.ChRet), chDis: d(r.ChDis), chSs: d(r.ChSs), gst: d(r.Gst),
    base: comp(d(r.Rm), d(r.Pm), d(r.Pf), d(r.Oh)),
    scheme_: comp(d(r.CRm).plus(d(r.TRm)), d(r.CPm).plus(d(r.TPm)), d(r.CPf).plus(d(r.TPf)), d(r.COh).plus(d(r.TOh))),
    bud: r.BudFlag === 'OK' ? comp(d(r.BudRm), d(r.BudPm), d(r.BudPf), d(r.BudOh)) : null,
    budVer: r.BudVer, flag: r.BudFlag, msg: r.Msg,
  });
  return { sku: rows.filter((r) => r.Grain === 'S').map(line), customers: rows.filter((r) => r.Grain === 'C').map(line) };
}

// ---------------------------------------------------------------- the data set of the business: "as per current COGM"
export type CurrentCogm = Record<string, Comp>;   // key = material number without leading zeros, value = cost PER PIECE

/** CSV / tab / semicolon text with a header: Matnr + (Rm, Pm, Pf|Perfume, Oh|Overhead) per piece, or only Cogm (split over the invoice mix of the SKU later). */
export function parseCurrentCogm(text: string): { map: CurrentCogm; total: Record<string, Decimal>; rows: number; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { map: {}, total: {}, rows: 0, error: 'The file needs a header line and at least one row.' };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const at = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iM = at('matnr', 'material', 'materialcode', 'sku'), iRm = at('rm', 'rmcost'), iPm = at('pm', 'pmcost'), iPf = at('pf', 'perfume', 'perfumecost'), iOh = at('oh', 'overhead', 'overheads', 'ohcost');
  const iT = at('cogm', 'cogmpc', 'cogmperpiece', 'total', 'currentcogm');
  if (iM < 0) return { map: {}, total: {}, rows: 0, error: 'No Matnr column found.' };
  if (iT < 0 && [iRm, iPm, iPf, iOh].every((i) => i < 0)) return { map: {}, total: {}, rows: 0, error: 'Give either Cogm or the columns Rm, Pm, Pf, Oh.' };
  const map: CurrentCogm = {}, total: Record<string, Decimal> = {};
  let n = 0;
  for (const l of lines.slice(1)) {
    const c = l.split(sep).map((x) => x.trim());
    const m = (c[iM] || '').replace(/^0+/, '');
    if (!m) continue;
    const num = (i: number) => (i < 0 ? Z : d((c[i] || '').replace(/,/g, '')));
    const comps = comp(num(iRm), num(iPm), num(iPf), num(iOh));
    total[m] = iT >= 0 ? num(iT) : sumComp(comps);
    if ([iRm, iPm, iPf, iOh].some((i) => i >= 0)) map[m] = comps;
    n++;
  }
  return { map, total, rows: n };
}

/** Current cost per piece of a line, split into components (the invoice mix is used when the data set has only a total). */
export function currentComp(l: MLine, map: CurrentCogm, total: Record<string, Decimal>): Comp | null {
  const k = l.matnr.replace(/^0+/, '');
  if (map[k]) return map[k];
  const t = total[k];
  if (t === undefined) return null;
  const inv = sumComp(l.base);
  if (inv.isZero()) return comp(t, Z, Z, Z);
  return comp(t.times(l.base.rm).div(inv), t.times(l.base.pm).div(inv), t.times(l.base.pf).div(inv), t.times(l.base.oh).div(inv));
}

// ---------------------------------------------------------------- scenario
export interface Drivers { price: number; promo: number; volume: number; rm: number; pm: number; pf: number; oh: number; scheme: number }
export const NO_DRIVERS: Drivers = { price: 0, promo: 0, volume: 0, rm: 0, pm: 0, pf: 0, oh: 0, scheme: 0 };
export type Basis = 'gross' | 'sp';
export interface Cur { map: CurrentCogm; total: Record<string, Decimal>; on: boolean }

export interface Result {
  qty: Decimal; mrp: Decimal; chan: Decimal; sp: Decimal; gst: Decimal; gross: Decimal; revenue: Decimal;
  rm: Decimal; pm: Decimal; pf: Decimal; oh: Decimal; scheme: Decimal; cogs: Decimal; gm: Decimal; gmPct: Decimal | null;
  budCogs: Decimal; budQty: Decimal; nbcQty: Decimal;
}
const zeroResult = (): Result => ({ qty: Z, mrp: Z, chan: Z, sp: Z, gst: Z, gross: Z, revenue: Z, rm: Z, pm: Z, pf: Z, oh: Z, scheme: Z, cogs: Z, gm: Z, gmPct: null, budCogs: Z, budQty: Z, nbcQty: Z });

const pctF = (p: number) => new Decimal(1).plus(new Decimal(p).div(100));

/** One line under the drivers. cur (when on) replaces the invoice RM/PM/perfume/overhead by the current cost per piece x sold quantity. */
export function evalLine(l: MLine, dr: Drivers, basis: Basis, cur?: Cur): Result {
  const vf = pctF(dr.volume), prf = pctF(dr.price).times(new Decimal(1).minus(new Decimal(dr.promo).div(100)));
  const useCur = cur?.on ? currentComp(l, cur.map, cur.total) : null;
  const b = useCur ? comp(useCur.rm.times(l.qty), useCur.pm.times(l.qty), useCur.pf.times(l.qty), useCur.oh.times(l.qty)) : l.base;
  const r = zeroResult();
  r.qty = l.qty.times(vf);
  r.mrp = l.mrp.times(vf);
  r.chan = l.chRet.plus(l.chDis).plus(l.chSs).times(vf);
  r.sp = l.sp.times(prf).times(vf);
  r.gst = l.gst.times(prf).times(vf);
  r.gross = r.sp.plus(r.gst);
  r.revenue = basis === 'gross' ? r.gross : r.sp;
  r.rm = b.rm.times(pctF(dr.rm)).times(vf);
  r.pm = b.pm.times(pctF(dr.pm)).times(vf);
  r.pf = b.pf.times(pctF(dr.pf)).times(vf);
  r.oh = b.oh.times(pctF(dr.oh)).times(vf);
  r.scheme = sumComp(l.scheme_).times(pctF(dr.scheme)).times(vf);
  r.cogs = r.rm.plus(r.pm).plus(r.pf).plus(r.oh).plus(r.scheme);
  r.gm = r.revenue.minus(r.cogs);
  r.gmPct = r.revenue.isZero() ? null : r.gm.div(r.revenue).times(100);
  if (l.bud) { r.budCogs = sumComp(l.bud).times(r.qty); r.budQty = r.qty; } else r.nbcQty = r.qty;
  return r;
}

export function addResult(a: Result, b: Result): Result {
  const o = zeroResult();
  (Object.keys(o) as (keyof Result)[]).forEach((k) => { if (k !== 'gmPct') (o[k] as Decimal) = (a[k] as Decimal).plus(b[k] as Decimal); });
  o.gmPct = o.revenue.isZero() ? null : o.gm.div(o.revenue).times(100);
  return o;
}
export const sumResults = (rs: Result[]): Result => rs.reduce(addResult, zeroResult());

export interface Group { key: string; label: string; lines: MLine[]; base: Result; scen: Result }
/** Group SKU lines (brand, material group / product category, SKU); the scenario is computed per line and added up. */
export function groupBy(lines: MLine[], by: (l: MLine) => string, labelOf: (l: MLine) => string, dr: Drivers, basis: Basis, cur?: Cur): Group[] {
  const m = new Map<string, Group>();
  for (const l of lines) {
    const k = by(l) || '(none)';
    let g = m.get(k);
    if (!g) { g = { key: k, label: labelOf(l) || k, lines: [], base: zeroResult(), scen: zeroResult() }; m.set(k, g); }
    g.lines.push(l);
    g.base = addResult(g.base, evalLine(l, NO_DRIVERS, basis, cur));
    g.scen = addResult(g.scen, evalLine(l, dr, basis, cur));
  }
  return [...m.values()].sort((a, b) => b.scen.gm.comparedTo(a.scen.gm));
}

export const totalOf = (lines: MLine[], dr: Drivers, basis: Basis, cur?: Cur): Result => sumResults(lines.map((l) => evalLine(l, dr, basis, cur)));

// ---------------------------------------------------------------- insights
/** GM change in rupees for a +5 % move of each driver, largest effect first (the "which driver matters" ranking). */
export function sensitivity(lines: MLine[], dr: Drivers, basis: Basis, cur?: Cur): { driver: keyof Drivers; label: string; delta: Decimal }[] {
  const base = totalOf(lines, dr, basis, cur).gm;
  const L: Record<keyof Drivers, string> = { price: 'Selling price +5 %', promo: 'Promo discount +5 %', volume: 'Volume +5 %', rm: 'Raw material cost +5 %', pm: 'Packing material cost +5 %', pf: 'Perfume cost +5 %', oh: 'Overhead +5 %', scheme: 'Scheme cost +5 %' };
  return (Object.keys(L) as (keyof Drivers)[])
    .map((k) => ({ driver: k, label: L[k], delta: totalOf(lines, { ...dr, [k]: dr[k] + 5 }, basis, cur).gm.minus(base) }))
    .sort((a, b) => b.delta.abs().comparedTo(a.delta.abs()));
}

/** Volume uplift (%) a promo of promoPct % needs to keep the gross margin of the lines, or null when it can never recover (margin per piece <= 0 after the discount). */
export function promoBreakeven(lines: MLine[], promoPct: number, basis: Basis, cur?: Cur): Decimal | null {
  if (promoPct <= 0) return null;
  const before = totalOf(lines, NO_DRIVERS, basis, cur);
  const after = totalOf(lines, { ...NO_DRIVERS, promo: promoPct }, basis, cur);
  if (before.qty.isZero() || after.gm.lte(0)) return null;
  return before.gm.div(after.gm).minus(1).times(100);
}

/** Component differences (current minus invoice, whole period) in rupees: where the COGM move comes from. Only SKUs found in the data set count. */
export function cogmDrivers(lines: MLine[], cur: Cur): { comp: 'rm' | 'pm' | 'pf' | 'oh'; label: string; invoice: Decimal; current: Decimal; delta: Decimal }[] {
  const acc = { rm: [Z, Z], pm: [Z, Z], pf: [Z, Z], oh: [Z, Z] } as Record<'rm' | 'pm' | 'pf' | 'oh', [Decimal, Decimal]>;
  for (const l of lines) {
    const c = currentComp(l, cur.map, cur.total);
    if (!c) continue;
    (['rm', 'pm', 'pf', 'oh'] as const).forEach((k) => { acc[k] = [acc[k][0].plus(l.base[k]), acc[k][1].plus(c[k].times(l.qty))]; });
  }
  const N = { rm: 'Raw material', pm: 'Packing material', pf: 'Perfume', oh: 'Overhead' };
  return (['rm', 'pm', 'pf', 'oh'] as const).map((k) => ({ comp: k, label: N[k], invoice: acc[k][0], current: acc[k][1], delta: acc[k][1].minus(acc[k][0]) }));
}

export interface Notes { text: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }
/** Rule-based reading of the result (no model): every sentence is built from numbers computed above. */
export function marginNotes(base: Result, scen: Result, groups: Group[], nbcCount: number): Notes[] {
  const n: Notes[] = [];
  if (base.gmPct) {
    const dlt = scen.gmPct ? scen.gmPct.minus(base.gmPct) : null;
    if (dlt && !dlt.isZero()) n.push({ text: `Scenario gross margin ${scen.gmPct!.toFixed(1)} % against ${base.gmPct.toFixed(1)} % as invoiced (${dlt.gt(0) ? '+' : ''}${dlt.toFixed(1)} points).`, tone: dlt.gt(0) ? 'good' : 'bad' });
    else n.push({ text: `Gross margin as invoiced is ${base.gmPct.toFixed(1)} % of revenue.`, tone: 'neutral' });
  }
  const best = groups.filter((g) => g.scen.revenue.gt(0))[0];
  if (best) n.push({ text: `Largest profit contributor: ${best.label} with ₹${best.scen.gm.div(100000).toFixed(1)} lakh.`, tone: 'neutral' });
  const worst = [...groups].filter((g) => g.scen.revenue.gt(0) && g.scen.gmPct).sort((a, b) => a.scen.gmPct!.comparedTo(b.scen.gmPct!))[0];
  if (worst && worst.scen.gmPct!.lt(0)) n.push({ text: `${worst.label} sells below cost (GM ${worst.scen.gmPct!.toFixed(1)} %).`, tone: 'bad' });
  if (nbcCount) n.push({ text: `${nbcCount} SKU${nbcCount > 1 ? 's have' : ' has'} No Budgeted Cost (NBC) or are trading goods: they are in the margin, but not in the budget comparison.`, tone: 'warn' });
  return n;
}
