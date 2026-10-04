import Decimal from 'decimal.js';
import { SELECTION, sel, selectionField, type FieldKind } from './fields';
import { MODE_TO_SET_KEY, type EntitySetKey } from './entities';
import { usesField, type CostQuery } from '../query/schema';

/** OData V2 string literal: single-quoted, embedded quotes doubled. */
export function odataString(v: string): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Edm.Decimal literal with the mandatory "m" suffix (1 -> 1m, 2.50 -> 2.5m). */
export function odataDecimal(v: string | number): string {
  const d = new Decimal(String(v).trim());
  if (!d.isFinite()) throw new Error(`Not a decimal: ${v}`);
  return `${d.toFixed()}m`;
}

/** Edm.DateTime literal from YYYY-MM-DD (or anything Date can parse to a calendar day). */
export function odataDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) throw new Error(`Not a date: ${v}`);
  return `datetime'${m[1]}-${m[2]}-${m[3]}T00:00:00'`;
}

export function literal(kind: FieldKind, v: unknown): string {
  switch (kind) {
    case 's': return odataString(String(v));
    case 'd': return odataDecimal(v as string);
    case 'i': {
      const n = Number(v);
      if (!Number.isInteger(n)) throw new Error(`Not an integer: ${v}`);
      return String(n);
    }
    case 'b': return v ? 'true' : 'false';
    case 'f': return v ? "'X'" : "''";
    case 't': return odataDate(String(v));
  }
}

type SelKey = keyof typeof SELECTION;

/** `field eq v` for one value, `(field eq a or field eq b)` for several. The literal follows the
 * property's type on that entity set (fields.ts SELECTION_KIND_BY_SET). */
export function eqClause(key: SelKey, values: unknown | unknown[], set: EntitySetKey = 'COST_LINES'): string | null {
  const [name, kind] = selectionField(set, key);
  const list = (Array.isArray(values) ? values : [values]).filter((v) => v !== undefined && v !== null && v !== '');
  const uniq = Array.from(new Set(list.map((v) => literal(kind, v))));
  if (uniq.length === 0) return null;
  const parts = uniq.map((lit) => `${name} eq ${lit}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
}

export class FilterError extends Error {}

/** Builds the $filter for a selection-driven entity set (CostLineSet, RateRowSet, FreightRowSet,
 * RmPmRowSet) from a validated query. Only the parameters the mode uses are sent (same as the SAP
 * selection screen). Matnr and Werks are mandatory on every one of these sets: a query without
 * them throws before anything is sent to SAP. */
export function buildSelectionFilter(q: CostQuery): string {
  const u = (f: Parameters<typeof usesField>[1]) => usesField(q.mode, f);
  const set = MODE_TO_SET_KEY[q.mode];
  const eq = (k: SelKey, v: unknown) => eqClause(k, v, set);
  const matnr = eq('Matnr', q.materials);
  const werks = eq('Werks', q.mode === 'C' ? q.bomPlant : q.plants);
  if (!matnr) throw new FilterError('At least one material (Matnr) is required.');
  if (!werks) throw new FilterError(q.mode === 'C' ? 'The BOM plant (Werks) is required.' : 'At least one plant (Werks) is required.');
  const c: (string | null)[] = [eq('Mode', q.mode), matnr, werks];
  if (q.mode === 'C') c.push(eq('Cplnt', q.compPlants));
  if (u('explQty')) c.push(eq('ExplQty', q.explQty));
  if (u('maxLevel') && q.maxLevel > 0) c.push(eq('MaxLevel', q.maxLevel));
  if (u('lookback')) c.push(eq('Lookback', q.lookback));
  if (u('freightDays')) c.push(eq('FreightDays', q.freightDays));
  if (u('prio')) c.push(eq('Prio', q.prio.join(',')));
  if (u('donorPlant') && q.donorPlant) c.push(eq('DonorPlant', q.donorPlant));
  if (u('inclFrt')) c.push(eq('InclFrt', q.inclFrt));
  if (u('stdFrt')) c.push(eq('StdFrt', q.stdFrt));
  if (u('latestOnly')) c.push(eq('LatestOnly', q.latestOnly));
  if (u('inclBudget')) {
    c.push(eq('InclBudget', q.inclBudget));
    if (q.inclBudget && q.budgetYr) c.push(eq('BudgetYr', String(q.budgetYr)));
  }
  if (u('inclCover')) {
    c.push(eq('InclCover', q.inclCover));
    if (q.inclCover) c.push(eq('Hor1', q.hor1), eq('Hor2', q.hor2), eq('Hor3', q.hor3));
  }
  if (u('budatWindow')) {
    if (q.budatFrom) c.push(eq('BudatFrom', q.budatFrom));
    if (q.budatTo) c.push(eq('BudatTo', q.budatTo));
  }
  if (u('asof') && q.useAsof && q.asofDate) c.push(eq('UseAsof', true), eq('AsofDate', q.asofDate));
  if (u('capid') && q.capid) c.push(eq('Capid', q.capid));

  return c.filter(Boolean).join(' and ');
}

export { sel };
