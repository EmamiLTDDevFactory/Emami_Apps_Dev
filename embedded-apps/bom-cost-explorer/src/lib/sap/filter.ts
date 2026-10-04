import Decimal from 'decimal.js';
import { SELECTION, sel, type FieldKind } from './fields';
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
    case 't': return odataDate(String(v));
  }
}

type SelKey = keyof typeof SELECTION;

/** `field eq v` for one value, `(field eq a or field eq b)` for several. */
export function eqClause(key: SelKey, values: unknown | unknown[]): string | null {
  const [name, kind] = SELECTION[key];
  const list = (Array.isArray(values) ? values : [values]).filter((v) => v !== undefined && v !== null && v !== '');
  const uniq = Array.from(new Set(list.map((v) => literal(kind, v))));
  if (uniq.length === 0) return null;
  const parts = uniq.map((lit) => `${name} eq ${lit}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
}

/** Builds the $filter for a selection-driven entity set from a validated query. Only the
 * parameters the mode uses are sent (same as the SAP selection screen). */
export function buildSelectionFilter(q: CostQuery): string {
  const u = (f: Parameters<typeof usesField>[1]) => usesField(q.mode, f);
  const c: (string | null)[] = [eqClause('Mode', q.mode), eqClause('Matnr', q.materials)];

  if (q.mode === 'C') {
    c.push(eqClause('Werks', q.bomPlant), eqClause('Cplnt', q.compPlants));
  } else {
    c.push(eqClause('Werks', q.plants));
  }
  if (u('explQty')) c.push(eqClause('ExplQty', q.explQty));
  if (u('maxLevel') && q.maxLevel > 0) c.push(eqClause('MaxLevel', q.maxLevel));
  if (u('lookback')) c.push(eqClause('Lookback', q.lookback));
  if (u('freightDays')) c.push(eqClause('FreightDays', q.freightDays));
  if (u('prio')) c.push(eqClause('Prio', q.prio.join(',')));
  if (u('donorPlant') && q.donorPlant) c.push(eqClause('DonorPlant', q.donorPlant));
  if (u('inclFrt')) c.push(eqClause('InclFrt', q.inclFrt));
  if (u('stdFrt')) c.push(eqClause('StdFrt', q.stdFrt));
  if (u('latestOnly')) c.push(eqClause('LatestOnly', q.latestOnly));
  if (u('inclBudget')) {
    c.push(eqClause('InclBudget', q.inclBudget));
    if (q.inclBudget && q.budgetYr) c.push(eqClause('BudgetYr', q.budgetYr));
  }
  if (u('inclCover')) {
    c.push(eqClause('InclCover', q.inclCover));
    if (q.inclCover) c.push(eqClause('Hor1', q.hor1), eqClause('Hor2', q.hor2), eqClause('Hor3', q.hor3));
  }
  if (u('budatWindow')) {
    if (q.budatFrom) c.push(eqClause('BudatFrom', q.budatFrom));
    if (q.budatTo) c.push(eqClause('BudatTo', q.budatTo));
  }
  if (u('asof') && q.useAsof && q.asofDate) c.push(eqClause('UseAsof', true), eqClause('AsofDate', q.asofDate));
  if (u('capid') && q.capid) c.push(eqClause('Capid', q.capid));

  return c.filter(Boolean).join(' and ');
}

export { sel };
