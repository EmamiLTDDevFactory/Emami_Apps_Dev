// SAP OData integration for Payment Tracking — reads from ZDelvPendPOSet (service ZMM_PO_FOLLOWUP_SRV),
// same host/entity set as Delivery Confirmation's poFollowupApi.ts, distinguished by Potype ('9'
// here vs 'M' there). Unlike Delivery Confirmation, Potype '9' is service-PO payment status, not
// delivery quantities — the backend's IF lv_po_type = '9' branch reads EKPO/EKKO/EKET (schedule
// lines) plus ESSR (service entry sheets), EKBE (PO history — posted vs. reversed values) and EKKN
// (GL account / cost center), and returns one row per PO item that is NOT YET fully accepted for
// payment (fully-accepted items are skipped server-side), with a computed status
// (NO_SES/REVERSED/PARTIAL) and the open value still outstanding. There's nothing here for a user
// to "confirm" — every field is a server-computed fact, so all three tabs are read-only.
import axios from 'axios';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZMM_PO_FOLLOWUP_SRV';
const ENTITY_SET = 'ZDelvPendPOSet';
// Same service/entity set as Delivery Confirmation (embedded-apps/po-followup) — Potype is what
// distinguishes the two apps' data on an otherwise identical SAP call; Zaction distinguishes the
// three tabs *within* each app (A = upcoming within the interval, M = overdue within the interval,
// P = older backlog beyond the interval — see the backend's own comment on gv_date_from/gv_date_to).
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

/** "2026-09-01" -> "01 Sep 2026". */
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

/** One service PO item's payment-tracking status. Field names confirmed directly against the
 * entity's own $metadata (ZDelvPendPOSet) — Ebeln/Lifnr/Interval/Potype exist as expected, and
 * every other property matches the PascalCase-from-ABAP-field-name guess used below (e.g.
 * SES_CNT -> SesCnt, VAL_NET -> ValNet). materialDesc (Maktx) and matNumber (Matnr) exist on the
 * shared entity but the po_type='9' backend branch doesn't set them for a service item (it sets
 * matGroup/Matkl instead) — mapped anyway since they're real fields, expect them blank here. */
export interface PaymentTrackingRow {
  key: string;
  poNumber: string; // Ebeln
  poItemNo: string; // Ebelp
  poText: string; // Txz01
  vendor: string; // Lifnr
  companyCode: string; // Bukrs
  matNumber: string; // Matnr
  materialDesc: string; // Maktx
  matGroup: string; // Matkl
  purchGroup: string; // Ekgrp
  acctAssignCat: string; // Knttp
  packageNo: string; // Packno
  orderUnit: string; // OrdUnit
  /** yyyy-mm-dd, parsed from Eindt's OData datetime literal. */
  deliveryDate: string;
  /** yyyy-mm-dd, parsed from Bedat's OData datetime literal. */
  poDate: string;
  scheduleQty: string; // ScheduleQty
  delvQty: string; // DlevQty
  /** ScheduleQty - DlevQty, computed client-side. '' if either source quantity is missing. */
  remainingQty: string;
  netValue: string; // Netwr
  currency: string; // Waers
  postedValue: string; // ValPost — sum of PO-history postings (EKBE, SHKZG <> 'H')
  reversedValue: string; // ValRev — sum of reversed postings (EKBE, SHKZG = 'H')
  netValuePosted: string; // ValNet — postedValue - reversedValue
  netQty: string; // QtyNet
  openValue: string; // OpenVal — net value of the PO item still outstanding
  status: string; // Status — 'NO_SES' | 'REVERSED' | 'PARTIAL'
  statusText: string; // StatTxt
  sesCount: string; // SesCnt — total service entry sheets
  sesDeleted: string; // SesDel
  sesAccepted: string; // SesAcc
  lastSesNumber: string; // LastSes
  /** yyyy-mm-dd, parsed from LastDat's OData datetime literal. */
  lastSesDate: string;
  acctAssignCount: string; // AccCnt
  /** 'X' if this item is split across more than one GL account / cost center. */
  multiAccount: boolean; // MultiAcc
  glAccount: string; // Sakto
  glAccountText: string; // SaktoTxt
  costCenter: string; // Kostl
  costCenterText: string; // KostlTxt
  internalOrder: string; // Aufnr
  wbsElement: string; // PsPosid
  daysOverdue: string; // DaysOver
}

function toPaymentTrackingRow(raw: Record<string, any>, index: number): PaymentTrackingRow {
  const scheduleQtyNum = raw.ScheduleQty != null ? Number(raw.ScheduleQty) : null;
  const delvQtyNum = raw.DlevQty != null ? Number(raw.DlevQty) : null;
  const remainingQty =
    scheduleQtyNum != null && delvQtyNum != null && !Number.isNaN(scheduleQtyNum) && !Number.isNaN(delvQtyNum)
      ? String(scheduleQtyNum - delvQtyNum)
      : '';
  const str = (v: any) => (v != null ? String(v) : '');
  return {
    key: `${raw.Ebeln ?? 'po'}-${raw.Ebelp ?? index}`,
    poNumber: str(raw.Ebeln),
    poItemNo: str(raw.Ebelp),
    poText: str(raw.Txz01),
    vendor: str(raw.Lifnr),
    companyCode: str(raw.Bukrs),
    matNumber: str(raw.Matnr),
    materialDesc: str(raw.Maktx),
    matGroup: str(raw.Matkl),
    purchGroup: str(raw.Ekgrp),
    acctAssignCat: str(raw.Knttp),
    packageNo: str(raw.Packno),
    orderUnit: str(raw.OrdUnit),
    deliveryDate: parseODataDate(raw.Eindt),
    poDate: parseODataDate(raw.Bedat),
    scheduleQty: str(raw.ScheduleQty),
    delvQty: str(raw.DlevQty),
    remainingQty,
    netValue: str(raw.Netwr),
    currency: str(raw.Waers),
    postedValue: str(raw.ValPost),
    reversedValue: str(raw.ValRev),
    netValuePosted: str(raw.ValNet),
    netQty: str(raw.QtyNet),
    openValue: str(raw.OpenVal),
    status: str(raw.Status),
    statusText: str(raw.StatTxt),
    sesCount: str(raw.SesCnt),
    sesDeleted: str(raw.SesDel),
    sesAccepted: str(raw.SesAcc),
    lastSesNumber: str(raw.LastSes),
    lastSesDate: parseODataDate(raw.LastDat),
    acctAssignCount: str(raw.AccCnt),
    multiAccount: raw.MultiAcc === 'X',
    glAccount: str(raw.Sakto),
    glAccountText: str(raw.SaktoTxt),
    costCenter: str(raw.Kostl),
    costCenterText: str(raw.KostlTxt),
    internalOrder: str(raw.Aufnr),
    wbsElement: str(raw.PsPosid),
    daysOverdue: str(raw.DaysOver),
  };
}

/** The 7 Days / 15 Days side-pane sub-option — sent straight through to SAP as an `Interval`
 * filter (Interval eq 7 / Interval eq 15) rather than fetching everything and windowing the
 * results client-side, so the day-count filtering actually happens server-side. */
export type Interval = 7 | 15;

/** Upcoming — Zaction 'A' (delivery date between today and today+Interval). */
export async function fetchUpcomingDeliveryPOs(email: string, interval: Interval): Promise<PaymentTrackingRow[]> {
  const raw = await fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq 'A'`, `Potype eq '${POTYPE}'`, `Interval eq ${interval}`]);
  return raw.map(toPaymentTrackingRow);
}

/** Missed — Zaction 'M' (overdue within the interval: today-Interval..today). */
export async function fetchMissedDeliveryPOs(email: string, interval: Interval): Promise<PaymentTrackingRow[]> {
  const raw = await fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq 'M'`, `Potype eq '${POTYPE}'`, `Interval eq ${interval}`]);
  return raw.map(toPaymentTrackingRow);
}

/** Pending — Zaction 'P' (older backlog: everything overdue by more than the interval). */
export async function fetchPendingDeliveryPOs(email: string, interval: Interval): Promise<PaymentTrackingRow[]> {
  const raw = await fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq 'P'`, `Potype eq '${POTYPE}'`, `Interval eq ${interval}`]);
  return raw.map(toPaymentTrackingRow);
}
