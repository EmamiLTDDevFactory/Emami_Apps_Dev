/** Pure rules of the budget rate management screens: dates, material numbers, filters and the frontend validation. */
import Decimal from 'decimal.js';
import type { ActionPayload, AdjType, BudHistGroup, BudHistRow, HistoryFilter, RateEdit, RateAction } from './types';

/** YYYYMMDD -> DD.MM.YYYY (anything else is shown as it is). */
export const showDate = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(6)}.${v.slice(4, 6)}.${v.slice(0, 4)}` : v);
/** <input type=date> value (YYYY-MM-DD) -> YYYYMMDD. */
export const toSapDate = (iso: string) => iso.replace(/-/g, '');
/** SAP date as <input type=date> value. */
export const toIsoDate = (sap: string) => (/^\d{8}$/.test(sap) ? `${sap.slice(0, 4)}-${sap.slice(4, 6)}-${sap.slice(6)}` : '');
/** SAP returns /Date(ms)/ for Edm.DateTime properties: normalised to YYYYMMDD. */
export function dateText(v: unknown): string {
  const s = String(v ?? '');
  const m = /^\/Date\((-?\d+)/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const padMatnr = (m: string) => { const t = m.trim().toUpperCase(); return /^\d+$/.test(t) ? t.padStart(18, '0') : t; };
export const stripZeros = (m: string) => (/^\d+$/.test(m) ? m.replace(/^0+(?=\d)/, '') : m);
export const csvList = (s: string) => Array.from(new Set(s.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)));
export const amount = (s: string) => Number(String(s).replace(/,/g, ''));

/** SAP fiscal year of a date (April start). */
export const fiscalYear = (d = new Date()) => String(d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1);
/** The purchase history window of a fiscal year: the year before it (1 April - 31 March). */
export const defaultHistWindow = (gjahr: string) => { const y = Number(gjahr); return { from: `${y - 1}-04-01`, to: `${y}-03-31` }; };

export type Errors<K extends string = string> = Partial<Record<K, string>>;

export function validateHistory(f: HistoryFilter): Errors<keyof HistoryFilter> {
  const e: Errors<keyof HistoryFilter> = {};
  if (!f.land1) e.land1 = 'Country is required';
  if (!/^\d{4}$/.test(f.gjahr)) e.gjahr = 'Year must be 4 digits';
  if (!f.histFrom) e.histFrom = 'From date is required';
  if (!f.histTo) e.histTo = 'To date is required';
  if (f.histFrom && f.histTo && toSapDate(f.histFrom) >= toSapDate(f.histTo)) e.histFrom = 'From must be before To';
  const a = amount(f.catAFrom), b = amount(f.catBFrom);
  if (!Number.isFinite(a) || a <= 0) e.catAFrom = 'Enter the Category A limit';
  if (!Number.isFinite(b) || b <= 0) e.catBFrom = 'Enter the Category B limit';
  if (!e.catAFrom && !e.catBFrom && !(a > b)) e.catAFrom = 'Cat A limit must be greater than Cat B';
  return e;
}

export function validateEdit(r: RateEdit): Errors<keyof RateEdit> {
  const e: Errors<keyof RateEdit> = {};
  if (r.adjType === 'P' || r.adjType === 'A') {
    const v = amount(r.adjValue);
    if (r.adjValue.trim() === '' || !Number.isFinite(v)) e.adjValue = 'Adjustment value is required';
    else if (r.adjType === 'P' && (v < -99 || v > 999)) e.adjValue = 'Percent must be between -99 and 999';
  }
  if (r.overrideRate.trim() !== '') {
    const o = amount(r.overrideRate);
    if (!Number.isFinite(o) || o <= 0) e.overrideRate = 'Override rate must be greater than 0';
    else if (!r.overrideRsn.trim()) e.overrideRsn = 'A reason is required with an override rate';
  }
  return e;
}

export function validateAction(p: ActionPayload): Errors<'email' | 'reason' | 'gjahr' | 'land1'> {
  const e: Errors<'email' | 'reason' | 'gjahr' | 'land1'> = {};
  if (!p.email.trim()) e.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) e.email = 'Enter a valid email';
  if (!p.land1) e.land1 = 'Country is required';
  if (!/^\d{4}$/.test(p.gjahr)) e.gjahr = 'Year must be 4 digits';
  if (p.action === 'REJECT' && !p.reason.trim()) e.reason = 'A reason is required to reject';
  return e;
}

export const ACTION_FROM: Record<RateAction, { from: string; to: string }> = {
  SUBMIT: { from: 'D', to: 'S' }, APPROVE: { from: 'S', to: 'A' }, REJECT: { from: 'S', to: 'R' }, REVISE: { from: 'R', to: 'V' },
};
export const isEditable = (status: string) => status === 'D' || status === 'V';
export const adjLabel = (t: string): AdjType | string => t;

/**
 * History at material + country level: quantity and value are summed over the plants (the plant rows are kept for the drill-down), the average
 * rate is value / quantity. Country total and category are SAP's own country-level figures, the same on every plant row, so they are taken, not added.
 * A mixed unit of measure or currency across the plants is left blank rather than added up wrongly.
 */
export function groupHistory(rows: BudHistRow[]): BudHistGroup[] {
  const by = new Map<string, BudHistRow[]>();
  for (const r of rows) { const k = `${r.Matnr}|${r.Land1}`; by.set(k, [...(by.get(k) ?? []), r]); }
  return Array.from(by, ([key, plants]) => {
    const h = plants[0];
    const qty = plants.reduce((s, r) => s.plus(String(r.NetQty)), new Decimal(0));
    const val = plants.reduce((s, r) => s.plus(String(r.NetValue)), new Decimal(0));
    const same = (f: (r: BudHistRow) => string) => (plants.every((r) => f(r) === f(h)) ? f(h) : '');
    return {
      key, Matnr: h.Matnr, Maktx: h.Maktx, Land1: h.Land1, Mtart: same((r) => r.Mtart), BaseUom: same((r) => r.BaseUom), Currency: same((r) => r.Currency),
      NetQty: qty.toNumber(), NetValue: val.toNumber(), AvgRate: qty.isZero() ? 0 : val.div(qty).toNumber(), CtryValue: h.CtryValue, Matcat: h.Matcat,
      plants: [...plants].sort((a, b) => a.Werks.localeCompare(b.Werks)),
    };
  });
}
