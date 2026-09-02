// SAP OData integration for Payment Tracking — reads from ZDelvPendPOSet (service ZMM_PO_FOLLOWUP_SRV).
// Same host as Market Rate's marketRateApi.ts, but its own SAP client (NGD, development) — per
// instruction, this app targets the dev landscape rather than production.
import axios from 'axios';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZMM_PO_FOLLOWUP_SRV';
const ENTITY_SET = 'ZDelvPendPOSet';
// Same service/entity set as Delivery Confirmation (embedded-apps/po-followup) — Potype is what
// distinguishes the two apps' data on an otherwise identical SAP call; Zaction distinguishes the
// three tabs *within* each app.
const POTYPE = '9';

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

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

/** One PO line, shared by all three tabs — explicit column set per instruction, mapped from
 * ZDelvPendPOSet's raw SAP field names (Ebeln, Ebelp, Maktx, Eindt, ScheduleQty, DlevQty). PO Text
 * (Txz01) is intentionally not mapped — dropped per instruction, not needed on any tab. Schedule
 * Qty / Delivered Qty / Remaining Qty are only rendered on Missed Delivery and Pending PO (see
 * UpcomingPoTable's showQtyColumns prop) — Upcoming PO still hides them. */
export interface UpcomingPoRow {
  key: string;
  poNumber: string; // Ebeln
  poItemNo: string; // Ebelp
  materialDesc: string; // Maktx
  /** yyyy-mm-dd, parsed from Eindt's OData datetime literal. */
  deliveryDate: string;
  scheduleQty: string; // ScheduleQty
  delvQty: string; // DlevQty
  /** ScheduleQty - DlevQty, computed client-side (SAP doesn't return this directly). '' if either
   * source quantity is missing/unparseable. */
  remainingQty: string;
}

function toUpcomingPoRow(raw: Record<string, any>, index: number): UpcomingPoRow {
  const deliveryDate = parseODataDate(raw.Eindt);
  const scheduleQtyNum = raw.ScheduleQty != null ? Number(raw.ScheduleQty) : null;
  const delvQtyNum = raw.DlevQty != null ? Number(raw.DlevQty) : null;
  const remainingQty =
    scheduleQtyNum != null && delvQtyNum != null && !Number.isNaN(scheduleQtyNum) && !Number.isNaN(delvQtyNum)
      ? String(scheduleQtyNum - delvQtyNum)
      : '';
  return {
    key: `${raw.Ebeln ?? 'po'}-${raw.Ebelp ?? index}`,
    poNumber: raw.Ebeln != null ? String(raw.Ebeln) : '',
    poItemNo: raw.Ebelp != null ? String(raw.Ebelp) : '',
    materialDesc: raw.Maktx != null ? String(raw.Maktx) : '',
    deliveryDate,
    scheduleQty: raw.ScheduleQty != null ? String(raw.ScheduleQty) : '',
    delvQty: raw.DlevQty != null ? String(raw.DlevQty) : '',
    remainingQty,
  };
}

/** The 7 Days / 15 Days side-pane sub-option — sent straight through to SAP as an `Interval`
 * filter (Interval eq 7 / Interval eq 15) rather than fetching everything and windowing the
 * results client-side, so the day-count filtering actually happens server-side. */
export type Interval = 7 | 15;

/** Upcoming Delivery PO tab — Zaction 'A', filtered to the signed-in user's email and the
 * selected Interval. Verified live working again as of the last check (it was blocked server-side
 * for a while — see git history on this file — but both 'A' and 'P' now return cleanly). */
export async function fetchUpcomingDeliveryPOs(email: string, interval: Interval): Promise<UpcomingPoRow[]> {
  const raw = await fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq 'A'`, `Potype eq '${POTYPE}'`, `Interval eq ${interval}`]);
  return raw.map(toUpcomingPoRow);
}

/** Missed Delivery tab — same row shape as Upcoming, Zaction 'M'. */
export async function fetchMissedDeliveryPOs(email: string, interval: Interval): Promise<UpcomingPoRow[]> {
  const raw = await fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq 'M'`, `Potype eq '${POTYPE}'`, `Interval eq ${interval}`]);
  return raw.map(toUpcomingPoRow);
}

/** Pending Delivery PO tab — same row shape as Upcoming, Zaction 'P' (replaces the old manual
 * Zfdate/Ztdate From/To date-range picker with the Interval param). */
export async function fetchPendingDeliveryPOs(email: string, interval: Interval): Promise<UpcomingPoRow[]> {
  const raw = await fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq 'P'`, `Potype eq '${POTYPE}'`, `Interval eq ${interval}`]);
  return raw.map(toUpcomingPoRow);
}
