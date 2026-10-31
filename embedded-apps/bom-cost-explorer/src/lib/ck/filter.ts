/**
 * $filter for the CK13N sets. LIST needs a material and ONE plant. HEADER, COMP and ITEM take either Matnr + Werks (SAP picks the
 * current standard estimate) or the estimate key Kalnr + Kadky + Tvers + Bwvar (+ Kkzma). Klvar and Status exist on LIST and HEADER
 * only. Flags are 'X' for on and left out for off. Literals reuse lib/sap/filter.ts (odataString, odataDate): no "+" in URLs.
 */
import { FilterError, odataDate, odataString } from '../sap/filter';
import { CK_FILTER as F, type CkSetKey } from './fields';

export interface CkEstimateKey { kalnr: string; kadky: string; tvers: string; bwvar: string; kkzma?: string }
export interface CkQuery {
  matnr?: string; werks?: string;
  key?: CkEstimateKey;
  klvar?: string; tvers?: string; status?: string;
  dateFrom?: string; dateTo?: string; curOnly?: boolean;
}
const s = (v: string | undefined) => (v ?? '').trim();
const eq = (n: string, v: string) => `${n} eq ${odataString(v)}`;

export function buildCkFilter(q: CkQuery, set: CkSetKey): string {
  const matnr = s(q.matnr), werks = s(q.werks).toUpperCase();
  const c: string[] = [];
  if (set === 'LIST') {
    if (!matnr) throw new FilterError('Pick a material.');
    if (!werks) throw new FilterError('Pick one plant.');
    c.push(eq(F.Matnr, matnr), eq(F.Werks, werks));
    if (s(q.klvar)) c.push(eq(F.Klvar, s(q.klvar)));
    if (s(q.tvers)) c.push(eq(F.Tvers, s(q.tvers)));
    if (s(q.status)) c.push(eq(F.Status, s(q.status)));
    if (q.dateFrom) c.push(`${F.DateFrom} eq ${odataDate(q.dateFrom)}`);
    if (q.dateTo) c.push(`${F.DateTo} eq ${odataDate(q.dateTo)}`);
    if (q.curOnly) c.push(`${F.CurOnly} eq 'X'`);
    return c.join(' and ');
  }
  if (q.key) {
    const k = q.key;
    if (!s(k.kalnr) || !s(k.kadky) || !s(k.tvers) || !s(k.bwvar)) throw new FilterError('The estimate key needs Kalnr, Kadky, Tvers and Bwvar.');
    c.push(eq(F.Kalnr, s(k.kalnr)), `${F.Kadky} eq ${odataDate(k.kadky)}`, eq(F.Tvers, s(k.tvers)), eq(F.Bwvar, s(k.bwvar)));
    if (s(k.kkzma)) c.push(eq(F.Kkzma, s(k.kkzma)));
  } else {
    if (!matnr) throw new FilterError('Pick a material.');
    if (!werks) throw new FilterError('Pick one plant.');
    c.push(eq(F.Matnr, matnr), eq(F.Werks, werks));
  }
  if (set === 'HEADER') {
    if (s(q.klvar)) c.push(eq(F.Klvar, s(q.klvar)));
    if (s(q.status)) c.push(eq(F.Status, s(q.status)));
  }
  return c.join(' and ');
}

/** A stable cache key part for an estimate. */
export const estimateId = (k: CkEstimateKey): string => [k.kalnr, k.kadky, k.tvers, k.bwvar, k.kkzma ?? ''].join('|');
