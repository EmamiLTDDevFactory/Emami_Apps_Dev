/**
 * Freight break-up of one cost line, by condition type (like the SAP CDS ZMM_FREIGHT). No SAP change: the
 * existing FreightRowSet, with the filter built by the SAME function the Freight screen uses
 * (buildSelectionFilter, Mode F):
 *
 *   Mode eq 'F' and Matnr eq '<line.Idnrk>' and Werks eq '<line.Werks>'   (component plant, not Hwerks)
 *   and FreightDays eq 3650 and StdFrt eq <run> and LatestOnly eq true
 *
 * No look-back limit: FreightDays is always the widest window the service accepts (FREIGHT_NO_LIMIT_DAYS, 10 years),
 * so the latest PO freight is found however old it is. StdFrt comes from the run that produced the lines, never
 * from the form.
 * The app is a static export (no API routes): the browser calls the gateway through the existing SAP client,
 * like every other read. Decimals arrive as strings and are added with decimal.js.
 */
import { D, ZERO, Decimal } from '../cost/decimal';
import { defaultQuery } from '../query/schema';
import { pagedRequest } from '../sap/requests';
import { sapGetCollection, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { FREIGHT_ROW, type CostLine, type FreightRow } from '../sap/fields';

/** FREIGHT_BREAKUP_ENABLED (default true). NEXT_PUBLIC_ name referenced literally so Next inlines it in the browser. */
export const FREIGHT_BREAKUP_ENABLED = String(process.env.NEXT_PUBLIC_FREIGHT_BREAKUP_ENABLED ?? process.env.FREIGHT_BREAKUP_ENABLED ?? 'true').toLowerCase() !== 'false';

/** The freight settings of the run that produced the cost lines. */
export interface FreightRun { freightDays: number; stdFrt: boolean }
export interface FreightKey extends FreightRun { matnr: string; werks: string }

/** No 180-day (or any) restriction: the widest window the service accepts (schema max), with LatestOnly. */
export const FREIGHT_NO_LIMIT_DAYS = 3650;

export const freightKeyOf = (line: Pick<CostLine, 'Idnrk' | 'Werks' | 'Hwerks'>, run: FreightRun): FreightKey => ({
  matnr: line.Idnrk, werks: line.Werks || line.Hwerks, freightDays: FREIGHT_NO_LIMIT_DAYS, stdFrt: run.stdFrt,
});
/** Cache key, same parts as the brief's ["freight-breakup", matnr, werks, freightDays, stdFrt]. */
export const cacheKey = (k: FreightKey) => JSON.stringify(['freight-breakup', k.matnr, k.werks, k.freightDays, k.stdFrt]);

/** One FreightRowSet request (one page, no paging needed for one component). */
export function freightBreakupRequest(k: FreightKey) {
  const q = { ...defaultQuery('F'), materials: [k.matnr], plants: [k.werks], freightDays: k.freightDays, stdFrt: k.stdFrt, latestOnly: true };
  return pagedRequest(q, 500, 0);
}

export async function fetchFreightBreakup(k: FreightKey, opts: SapGetOptions = {}): Promise<FreightRow[]> {
  const { entitySet, params } = freightBreakupRequest(k);
  const r = await sapGetCollection(entitySet, params, opts);
  return r.rows.map((raw) => normalizeEntity<FreightRow>(raw, FREIGHT_ROW));
}

/* ---------- display maths ---------- */

export type FreightView = 'ACTUAL' | 'STANDARD';

export interface BreakupLine {
  row: FreightRow;
  qty: Decimal; amount: Decimal; rate: Decimal; stdRate: Decimal;
  pcLoc: Decimal; pcInr: Decimal;
  zero: boolean;
}
export interface BreakupTotals { qty: Decimal; amount: Decimal; pcLoc: Decimal; pcInr: Decimal }

/** Columns for the chosen view (display only: the cost line's values never change). */
export function breakupLines(rows: FreightRow[], view: FreightView): { lines: BreakupLine[]; totals: BreakupTotals } {
  const lines = rows.map((row) => {
    const qty = D(view === 'ACTUAL' ? row.Actualdelvquantity : row.Stddelvquantity);
    const amount = D(view === 'ACTUAL' ? row.Actualdelvcostamount : row.Stddelvcostamount);
    const rate = D(view === 'ACTUAL' ? row.ActRate : row.StdRate);
    const pcLoc = D(row.UsedPcLoc);
    const pcInr = D(row.UsedPcInr);
    return { row, qty, amount, rate, stdRate: D(row.StdRate), pcLoc, pcInr, zero: amount.isZero() && pcLoc.isZero() && pcInr.isZero() };
  });
  const totals = lines.reduce((t, l) => ({ qty: t.qty.plus(l.qty), amount: t.amount.plus(l.amount), pcLoc: t.pcLoc.plus(l.pcLoc), pcInr: t.pcInr.plus(l.pcInr) }), { qty: ZERO, amount: ZERO, pcLoc: ZERO, pcInr: ZERO });
  return { lines, totals };
}

export interface Reconciliation {
  breakup: Decimal; // sum of UsedPcLoc
  line: Decimal; // line.FrtPcLoc
  diff: Decimal;
  tolerance: Decimal;
  matches: boolean;
  unitCurrencyNote: boolean; // the rows use another unit / currency than the cost line
  rowUnit: string; rowCurr: string;
}

/** Sum of UsedPcLoc vs the cost line's FrtPcLoc; matches within max(0.01, 0.05 % of the line value). */
export function reconcile(rows: FreightRow[], line: Pick<CostLine, 'FrtPcLoc' | 'Meins' | 'LocCurr'>): Reconciliation {
  const breakup = rows.reduce((a, r) => a.plus(D(r.UsedPcLoc)), ZERO);
  const lv = D(line.FrtPcLoc);
  const diff = breakup.minus(lv).abs();
  const tolerance = Decimal.max(D('0.01'), lv.abs().times('0.0005'));
  const rowUnit = rows.find((r) => r.Baseunit)?.Baseunit ?? '';
  const rowCurr = rows.find((r) => r.Localcurrency)?.Localcurrency ?? '';
  const matches = diff.lte(tolerance);
  return { breakup, line: lv, diff, tolerance, matches, unitCurrencyNote: !matches, rowUnit, rowCurr };
}

/** Distinct "PO / item · date" of the rows, for the panel subtitle. */
export const poSummary = (rows: FreightRow[]) => [...new Set(rows.filter((r) => r.Purchasedocument).map((r) => `${r.Purchasedocument}${r.Purchaseline ? ` / ${r.Purchaseline}` : ''}${r.Podate ? ` · ${r.Podate}` : ''}`))];

