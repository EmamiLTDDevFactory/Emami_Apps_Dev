// SAP OData integration for PO Followup — reads from ZDelvPendPOSet (service ZMM_PO_FOLLOWUP_SRV).
// Same host as Market Rate's marketRateApi.ts, but its own SAP client (NGD, development) — per
// instruction, this app targets the dev landscape rather than production.
import axios from 'axios';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZMM_PO_FOLLOWUP_SRV';
const ENTITY_SET = 'ZDelvPendPOSet';

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

/** One PO line as returned by ZDelvPendPOSet, generic shape — used for the Pending Delivery PO
 * tab, whose column layout hasn't been specified (unlike Upcoming's, see UpcomingPoRow below).
 * Kept as an open record so the table can render whatever SAP actually sends back without
 * guessing column names wrong. */
export type PoFollowupRow = Record<string, string | number | null>;

/** "2026-09-01" -> "datetime'2026-09-01T00:00:00'" — verified live against ZDelvPendPOSet
 * (NGD): Zfdate/Ztdate are Edm.DateTime fields, not the Char8 string the spec's "YYYYMMDD" wording
 * suggested. A bare quoted "20260901" string throws "Invalid parameter type used at function 'eq'"
 * at the OData parser; SAP's OData v2 datetime literal is what the field actually accepts. */
function toSapDateFilter(isoDate: string): string {
  return `datetime'${isoDate}T00:00:00'`;
}

/** SAP OData v2 JSON encodes Edm.DateTime as "/Date(epochMillis)/" — same shape Market Rate's
 * marketRateApi.ts already had to unpack for Zdate. "" for anything else/unparseable. */
function parseODataDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = value.match(/\/Date\((-?\d+)\)\//);
  if (match) return new Date(Number(match[1])).toISOString().split('T')[0];
  return '';
}

/** "2026-09-01" -> "01 Sep 2026" — user-friendly display for Eindt per instruction. */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDateFriendly(isoDate: string): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  const month = MONTH_ABBR[Number(m) - 1];
  return month ? `${d} ${month} ${y}` : isoDate;
}

async function fetchDelvPendPOs(filterParts: string[]): Promise<Record<string, any>[]> {
  const { data } = await sapClient.get(`/${ENTITY_SET}`, {
    params: { '$filter': filterParts.join(' and '), '$format': 'json' },
  });
  const results = data?.d?.results;
  return Array.isArray(results) ? results : [];
}

/** One PO line for the Upcoming Delivery PO (and Missed Delivery) tab — explicit column set per
 * instruction, mapped from ZDelvPendPOSet's raw SAP field names (Ebeln, Ebelp, Txz01, ...).
 * Matkl/Ekgrp/OrdUnit/Matnr/schedule_qty/DelvQty are read from SAP but not surfaced in the table
 * (Schedule Qty / Delivered Qty dropped per instruction — not needed on this tab). */
export interface UpcomingPoRow {
  key: string;
  poNumber: string; // Ebeln
  poItemNo: string; // Ebelp
  poText: string; // Txz01
  materialDesc: string; // Maktx
  /** yyyy-mm-dd, parsed from Eindt's OData datetime literal. */
  deliveryDate: string;
}

function toUpcomingPoRow(raw: Record<string, any>, index: number): UpcomingPoRow {
  const deliveryDate = parseODataDate(raw.Eindt);
  return {
    key: `${raw.Ebeln ?? 'po'}-${raw.Ebelp ?? index}`,
    poNumber: raw.Ebeln != null ? String(raw.Ebeln) : '',
    poItemNo: raw.Ebelp != null ? String(raw.Ebelp) : '',
    poText: raw.Txz01 != null ? String(raw.Txz01) : '',
    materialDesc: raw.Maktx != null ? String(raw.Maktx) : '',
    deliveryDate,
  };
}

/** Upcoming Delivery PO tab — Zaction 'A', filtered to the signed-in user's email only. Verified
 * live working again as of the last check (it was blocked server-side for a while — see git
 * history on this file — but both 'A' and 'P' now return cleanly). */
export async function fetchUpcomingDeliveryPOs(email: string): Promise<UpcomingPoRow[]> {
  const raw = await fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq 'A'`]);
  return raw.map(toUpcomingPoRow);
}

/** Missed Delivery tab — same shape as Upcoming, but for POs whose delivery window has already
 * passed. 'M' is a PLACEHOLDER Zaction value (following the existing 'A'/'P' naming pattern) — no
 * third Zaction has been confirmed with SAP yet. Swap this literal for the real value once SAP
 * confirms it; until then this call will most likely just return an empty result set rather than
 * erroring, since an unrecognized Zaction is presumably filtered server-side. */
const MISSED_DELIVERY_ZACTION = 'M'; // TODO: confirm real Zaction value with SAP team.
export async function fetchMissedDeliveryPOs(email: string): Promise<UpcomingPoRow[]> {
  const raw = await fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq '${MISSED_DELIVERY_ZACTION}'`]);
  return raw.map(toUpcomingPoRow);
}

/** Pending Delivery PO tab — Zaction 'P', filtered by the signed-in user's email plus the
 * from/to date range picked on screen (see toSapDateFilter for the OData datetime literal these
 * need). */
export async function fetchPendingDeliveryPOs(email: string, fromDate: string, toDate: string): Promise<PoFollowupRow[]> {
  return fetchDelvPendPOs([
    `Email eq '${email}'`,
    `Zaction eq 'P'`,
    `Zfdate eq ${toSapDateFilter(fromDate)}`,
    `Ztdate eq ${toSapDateFilter(toDate)}`,
  ]);
}
