import { odataDate, odataString } from '../sap/filter';
import { readSet, type Read } from '../price-context/odata';
import { DASH_FILTER as F, DASH_MIS_FIELDS, DASH_SET } from './fields';
import type { MisRow } from './types';

const NONE: ReadonlySet<string> = new Set();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** $filter of the MIS read: the plants (or-ed) and the as-of date. FTM = month start to that date, YTM = financial year start to that date (SAP decides). */
export function buildMisFilter(plants: string[], dateTo: string): string {
  const p = Array.from(new Set(plants.map((x) => x.trim().toUpperCase()).filter(Boolean)));
  if (!p.length) throw new Error('Enter at least one plant.');
  if (p.some((x) => !/^[A-Z0-9]{4}$/.test(x))) throw new Error('A plant is 4 characters.');
  if (!DAY.test(dateTo)) throw new Error('Enter the as-of date.');
  const w = p.map((x) => `${F.Werks} eq ${odataString(x)}`);
  return `${w.length === 1 ? w[0] : `(${w.join(' or ')})`} and ${F.DateTo} eq ${odataDate(dateTo)}`;
}

export const fetchMis = (plants: string[], dateTo: string, signal?: AbortSignal): Promise<Read<MisRow>> =>
  readSet<MisRow>(DASH_SET, DASH_MIS_FIELDS, NONE, buildMisFilter(plants, dateTo), signal);
