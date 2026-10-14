/**
 * Two SAP feeds the business is adding to ZMM_BOM_COST_SRV for the Production Plan (Requirement tab):
 *
 *   BudgetRateSet   budgeted rate per component and plant with a validity period (valid from / valid to), so the
 *                   rate of each month is the record valid on the 1st of that month (H1 rate, revised H2 rate...)
 *   ProdActualSet   actual production of finished goods per plant and month: quantity and value (= the actual)
 *
 * The entity and property names below are the app's proposal until the SAP team confirms theirs - change them only
 * here (BUDGET_RATE_SET / PROD_ACTUAL_SET and the two field maps). Until a set answers, the Requirement tab keeps
 * working as before (BudLanded + the H2 revision entered in the app; the savings report as an estimate), and says
 * which set or property is missing.
 *
 *   GET BudgetRateSet?$filter=(Werks eq '1000' or ...)
 *       Matnr, Werks, Datab (valid from), Datbi (valid to), Rate (local, per Peinh), Waers, RateInr (INR, per Peinh),
 *       Peinh (price unit), Meins
 *   GET ProdActualSet?$filter=(Werks eq ...) and Spmon ge '202604' and Spmon le '202703'
 *       Matnr (FG), Werks, Spmon (YYYYMM), Menge (produced qty), Meins, Value (local), Waers, ValueInr (INR)
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { SapError, sapGetCollection, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { odataString } from '../sap/filter';
import { sapConfig } from '../sap/config';

export const BUDGET_RATE_SET = 'BudgetRateSet';
export const PROD_ACTUAL_SET = 'ProdActualSet';

export const BUDGET_RATE = {
  Matnr: ['Matnr', 's'], Werks: ['Werks', 's'], Datab: ['Datab', 's'], Datbi: ['Datbi', 's'],
  Rate: ['Rate', 'd'], Waers: ['Waers', 's'], RateInr: ['RateInr', 'd'], Peinh: ['Peinh', 'd'], Meins: ['Meins', 's'],
} as const;
export const PROD_ACTUAL = {
  Matnr: ['Matnr', 's'], Werks: ['Werks', 's'], Spmon: ['Spmon', 's'], Menge: ['Menge', 'd'], Meins: ['Meins', 's'],
  Value: ['Value', 'd'], Waers: ['Waers', 's'], ValueInr: ['ValueInr', 'd'],
} as const;

export interface BudgetRateRow { Matnr: string; Werks: string; Datab: string; Datbi: string; Rate: string; Waers: string; RateInr: string; Peinh: string; Meins: string }
export interface ProdActualRow { Matnr: string; Werks: string; Spmon: string; Menge: string; Meins: string; Value: string; Waers: string; ValueInr: string }

const anyOf = (prop: string, values: string[]) => {
  const v = [...new Set(values.map((x) => x.trim().toUpperCase()).filter(Boolean))];
  if (!v.length) return null;
  return v.length === 1 ? `${prop} eq ${odataString(v[0])}` : `(${v.map((x) => `${prop} eq ${odataString(x)}`).join(' or ')})`;
};

/** Fiscal year April (fyStart) .. March (fyStart + 1) as YYYYMM. */
export const fyPeriods = (fyStart: number) => ({ from: `${fyStart}04`, to: `${fyStart + 1}03` });

export function budgetRateRequest(plants: string[]) {
  const f = anyOf('Werks', plants);
  return { entitySet: BUDGET_RATE_SET, params: (f ? { $filter: f } : {}) as Record<string, string | undefined> };
}
export function prodActualRequest(plants: string[], fyStart: number) {
  const p = fyPeriods(fyStart);
  const f = [anyOf('Werks', plants), `Spmon ge ${odataString(p.from)}`, `Spmon le ${odataString(p.to)}`].filter(Boolean).join(' and ');
  return { entitySet: PROD_ACTUAL_SET, params: { $filter: f } as Record<string, string | undefined> };
}

/* ---------- availability ---------- */

export type FeedStatus = 'ready' | 'missing' | 'error';
export interface Feed<T> { status: FeedStatus; rows: T[]; note: string; system: string }

const MISSING = /Resource not found for (the )?segment|No service found|not found in type|Invalid entity set/i;
const PROPERTY = /Property '?([\w/]+)'? (?:not found|is invalid)/i;

async function readFeed<T>(req: { entitySet: string; params: Record<string, string | undefined> }, map: Parameters<typeof normalizeEntity>[1], opts: SapGetOptions): Promise<Feed<T>> {
  const system = sapConfig().system;
  try {
    const r = await sapGetCollection(req.entitySet, req.params, opts);
    return { status: 'ready', rows: r.rows.map((raw) => normalizeEntity<T>(raw, map)), note: '', system };
  } catch (e) {
    if (e instanceof SapError && e.kind === 'aborted') throw e;
    const msg = e instanceof Error ? `${e.message} ${(e as SapError).details?.map((d) => d.message).join(' ') ?? ''}` : String(e);
    const prop = PROPERTY.exec(msg);
    if (prop) return { status: 'missing', rows: [], note: `SAP ${system}: ${req.entitySet} has no property "${prop[1]}" yet.`, system };
    if ((e instanceof SapError && e.sapStatus === 404) || MISSING.test(msg)) return { status: 'missing', rows: [], note: `SAP ${system} does not have ${req.entitySet} yet.`, system };
    return { status: 'error', rows: [], note: `Could not read ${req.entitySet} from SAP ${system}: ${msg.trim()}`, system };
  }
}

export const fetchBudgetRates = (plants: string[], opts: SapGetOptions = {}) => readFeed<BudgetRateRow>(budgetRateRequest(plants), BUDGET_RATE, opts);
export const fetchProdActuals = (plants: string[], fyStart: number, opts: SapGetOptions = {}) => readFeed<ProdActualRow>(prodActualRequest(plants, fyStart), PROD_ACTUAL, opts);

/* ---------- budget rate lookup by validity ---------- */

/** SAP dates arrive as /Date(ms)/, YYYYMMDD, YYYY-MM-DD or ISO; returns yyyymmdd as a number (0 = none). */
export function sapDay(v: string): number {
  const s = String(v ?? '').trim();
  const ms = /\/Date\((-?\d+)/.exec(s);
  if (ms) { const d = new Date(Number(ms[1])); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
  const digits = s.replace(/[^0-9]/g, '').slice(0, 8);
  return digits.length === 8 ? Number(digits) : 0;
}

/** First day of fiscal month m (0 = April) of the fiscal year starting in `fyStart`, as yyyymmdd. */
export const fiscalMonthDay = (fyStart: number, m: number) => { const mm = 4 + m; const y = mm > 12 ? fyStart + 1 : fyStart; return y * 10000 + ((mm - 1) % 12 + 1) * 100 + 1; };

export interface RateRecord { from: number; to: number; inr: Decimal; loc: Decimal | null; curr: string }
export interface RateLookup { size: number; at: (werks: string, matnr: string, day: number) => RateRecord | null; has: (werks: string, matnr: string) => boolean }

export function rateLookup(rows: BudgetRateRow[]): RateLookup {
  const m = new Map<string, RateRecord[]>();
  for (const r of rows) {
    const per = D(r.Peinh).gt(0) ? D(r.Peinh) : D(1);
    const inr = D(r.RateInr).gt(0) ? D(r.RateInr).div(per) : r.Waers === 'INR' ? D(r.Rate).div(per) : null;
    if (!inr) continue;
    const k = `${r.Werks.toUpperCase()}|${r.Matnr}`;
    const list = m.get(k) ?? [];
    list.push({ from: sapDay(r.Datab) || 0, to: sapDay(r.Datbi) || 99991231, inr, loc: D(r.Rate).gt(0) ? D(r.Rate).div(per) : null, curr: r.Waers });
    m.set(k, list);
  }
  for (const list of m.values()) list.sort((a, b) => b.from - a.from); // latest validity first
  return {
    size: m.size,
    has: (w, mat) => m.has(`${w.toUpperCase()}|${mat}`),
    at: (w, mat, day) => (m.get(`${w.toUpperCase()}|${mat}`) ?? []).find((r) => r.from <= day && day <= r.to) ?? null,
  };
}

/* ---------- production actuals ---------- */

export interface ActualCell { qty: Decimal; inr: Decimal; loc: Decimal; curr: string }
/** Plant|FG -> 12 fiscal months of produced qty and value. */
export function actualsByFg(rows: ProdActualRow[], fyStart: number): Map<string, ActualCell[]> {
  const out = new Map<string, ActualCell[]>();
  for (const r of rows) {
    const p = String(r.Spmon).replace(/[^0-9]/g, '');
    if (p.length < 6) continue;
    const y = Number(p.slice(0, 4)); const mo = Number(p.slice(4, 6));
    const m = (y - fyStart) * 12 + mo - 4;
    if (m < 0 || m > 11) continue;
    const k = `${r.Werks.toUpperCase()}|${r.Matnr}`;
    const cells = out.get(k) ?? Array.from({ length: 12 }, () => ({ qty: ZERO, inr: ZERO, loc: ZERO, curr: r.Waers }));
    const c = cells[m];
    cells[m] = { qty: c.qty.plus(D(r.Menge)), inr: c.inr.plus(D(r.ValueInr).gt(0) || r.Waers !== 'INR' ? D(r.ValueInr) : D(r.Value)), loc: c.loc.plus(D(r.Value)), curr: r.Waers || c.curr };
    out.set(k, cells);
  }
  return out;
}
