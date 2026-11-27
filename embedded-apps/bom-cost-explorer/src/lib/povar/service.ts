import { odataDate, odataString } from '../sap/filter';
import { readSet, type Read } from '../price-context/odata';
import { POVAR_FIELDS, POVAR_FILTER as F, POVAR_SET, type PoVarRow } from './fields';

const NONE: ReadonlySet<string> = new Set();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** C = ZMM_PCOST's "Date" (receipt record created or changed on), P = posting date of the goods receipt. */
export type DateType = 'C' | 'P';
export interface OrdersQuery { plants: string[]; dateFrom: string; dateTo: string; dateType: DateType; materials?: string[]; orders?: string[] }

const anyOf = (prop: string, vals: string[]) => (vals.length ? (vals.length === 1 ? `${prop} eq ${odataString(vals[0])}` : `(${vals.map((v) => `${prop} eq ${odataString(v)}`).join(' or ')})`) : '');
const clean = (v: string[] | undefined, strip = false) => Array.from(new Set((v ?? []).map((x) => x.trim().toUpperCase()).map((x) => (strip ? x.replace(/^0+/, '') : x)).filter(Boolean)));

/** $filter of the order list (ZMM_PCOST selection): plants, date range and its meaning, optional materials / orders. Post type 01 (process orders) is SAP's default. */
export function buildOrdersFilter(q: OrdersQuery): string {
  const plants = clean(q.plants), mats = clean(q.materials, true), ords = clean(q.orders, true);
  if (!plants.length && !mats.length && !ords.length) throw new Error('Pick at least one plant (or give a material or a process order).');
  if (plants.some((x) => !/^[A-Z0-9]{4}$/.test(x))) throw new Error('A plant is 4 characters.');
  if (mats.some((x) => !/^[A-Z0-9]{1,18}$/.test(x))) throw new Error('A material number is up to 18 characters.');
  if (ords.some((x) => !/^\d{1,12}$/.test(x))) throw new Error('A process order is up to 12 digits.');
  if (!DAY.test(q.dateFrom) || !DAY.test(q.dateTo)) throw new Error('Enter both dates.');
  if (q.dateFrom > q.dateTo) throw new Error('The "from" date is after the "to" date.');
  return [anyOf(F.Werks, plants), anyOf(F.Matnr, mats), anyOf(F.Aufnr, ords), `${F.DateFrom} eq ${odataDate(q.dateFrom)}`, `${F.DateTo} eq ${odataDate(q.dateTo)}`,
    `${F.DateType} eq ${odataString(q.dateType)}`].filter(Boolean).join(' and ');
}

export const fetchOrders = (q: OrdersQuery, signal?: AbortSignal): Promise<Read<PoVarRow>> =>
  readSet<PoVarRow>(POVAR_SET, POVAR_FIELDS, NONE, buildOrdersFilter(q), signal);

/** ZMM_COST of one process order: the finished-good receipt, WIP lines and every consumed component with its rate against the MBEW price. */
export function buildBreakupFilter(aufnr: string): string {
  const a = aufnr.trim().replace(/^0+/, '');
  if (!/^\d{1,12}$/.test(a)) throw new Error('A process order is up to 12 digits.');
  return `${F.Aufnr} eq ${odataString(a)} and ${F.Grain} eq 'C'`;
}
export const fetchBreakup = (aufnr: string, signal?: AbortSignal): Promise<Read<PoVarRow>> =>
  readSet<PoVarRow>(POVAR_SET, POVAR_FIELDS, NONE, buildBreakupFilter(aufnr), signal);
