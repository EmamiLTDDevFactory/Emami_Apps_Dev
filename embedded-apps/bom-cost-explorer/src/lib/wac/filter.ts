/**
 * $filter for the WAC sets. Reuses the app's own literal helpers (lib/sap/filter.ts): odataString (quoting), odataDecimal
 * (the "m" suffix), odataDate (datetime'YYYY-MM-DDT00:00:00' from a calendar day, no time-zone shift). Plant and the date
 * range are mandatory (SAP answers a message without them), so a missing one throws here before anything is sent.
 * Flags are Edm.String: 'X' for on, the filter is left out for off.
 */
import { FilterError, odataDate, odataDecimal, odataString } from '../sap/filter';
import { WAC_FILTER as F, type WacSetKey } from './fields';

export interface WacFilterInput {
  plants: string[];
  materials?: string[];
  prodha?: string[];
  dateFrom: string; // YYYY-MM-DD (a local calendar day)
  dateTo: string;
  inclCmp?: boolean;
  varPct?: string; // "Amber from %"
  varHigh?: string; // "Red from %"
  src?: string[];
  grp?: string[];
}

const uniq = (v: string[] | undefined, up = false) => Array.from(new Set((v ?? []).map((x) => String(x).trim()).filter(Boolean).map((x) => (up ? x.toUpperCase() : x))));

function multi(name: string, values: string[]): string | null {
  if (!values.length) return null;
  const parts = values.map((v) => `${name} eq ${odataString(v)}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `set` decides which optional properties exist: Prodha only on ROWS, SrcIn / GrpIn only on COMPARE, and InclCmp is always
 * sent on COMPARE and COMP (they always run the live comparison) but only when asked on ROWS and never on DOCS. */
export function buildWacFilter(q: WacFilterInput, set: WacSetKey = 'ROWS'): string {
  const plants = uniq(q.plants, true);
  if (!plants.length) throw new FilterError('Select at least one manufacturing unit (plant).');
  if (!DAY.test(q.dateFrom) || !DAY.test(q.dateTo)) throw new FilterError('Both dates are required.');
  if (q.dateFrom > q.dateTo) throw new FilterError('The "from" date is after the "to" date.');

  const c: (string | null)[] = [multi(F.Matnr, uniq(q.materials)), multi(F.Werks, plants)];
  if (set === 'ROWS') c.push(multi(F.Prodha, uniq(q.prodha)));
  c.push(`${F.DateFrom} eq ${odataDate(q.dateFrom)}`, `${F.DateTo} eq ${odataDate(q.dateTo)}`);
  const live = set === 'COMPARE' || set === 'COMP' || (set === 'ROWS' && !!q.inclCmp);
  if (live) c.push(`${F.InclCmp} eq 'X'`);
  if (live) {
    if (q.varPct?.trim()) c.push(`${F.VarPctIn} eq ${odataDecimal(q.varPct)}`);
    if (q.varHigh?.trim()) c.push(`${F.VarHighIn} eq ${odataDecimal(q.varHigh)}`);
  }
  if (set === 'COMPARE') {
    c.push(multi(F.SrcIn, uniq(q.src)), multi(F.GrpIn, uniq(q.grp)));
  }
  return c.filter(Boolean).join(' and ');
}
