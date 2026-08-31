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

/** One PO line as returned by ZDelvPendPOSet. Field names/labels haven't been confirmed live yet
 * (unlike Market Rate's ZMarketSuppDataSet) — kept as an open record instead of a fixed shape so
 * the table can render whatever SAP actually sends back without guessing column names wrong. */
export type PoFollowupRow = Record<string, string | number | null>;

/** "2026-09-01" -> "datetime'2026-09-01T00:00:00'" — verified live against ZDelvPendPOSet
 * (NGD): Zfdate/Ztdate are Edm.DateTime fields, not the Char8 string the spec's "YYYYMMDD" wording
 * suggested. A bare quoted "20260901" string throws "Invalid parameter type used at function 'eq'"
 * at the OData parser; SAP's OData v2 datetime literal is what the field actually accepts. */
function toSapDateFilter(isoDate: string): string {
  return `datetime'${isoDate}T00:00:00'`;
}

async function fetchDelvPendPOs(filterParts: string[]): Promise<PoFollowupRow[]> {
  const { data } = await sapClient.get(`/${ENTITY_SET}`, {
    params: { '$filter': filterParts.join(' and '), '$format': 'json' },
  });
  const results = data?.d?.results;
  return Array.isArray(results) ? results : [];
}

/** Upcoming Delivery PO tab — Zaction 'D' (not the spec's original 'A'), filtered to the signed-in
 * user's email only.
 *
 * Zaction eq 'A' is broken server-side — throws SAP Gateway error /IWFND/CM_BEC/029 "RFC Error:
 * Type conflict during a function module call", reproducibly, on every live check (with or without
 * the Email filter alongside it) — while 'P', 'D', and every other value filter fine. Per
 * instruction, this now sends 'D' for the Upcoming tab instead of 'A' as a working substitute. */
export async function fetchUpcomingDeliveryPOs(email: string): Promise<PoFollowupRow[]> {
  return fetchDelvPendPOs([`Email eq '${email}'`, `Zaction eq 'D'`]);
}

/** Pending Delivery PO tab — Zaction 'P', filtered by the signed-in user's email plus the
 * from/to date range picked on screen (see toSapDateFilter for the OData datetime literal these
 * need). Verified live: this combination (unlike Zaction='A') returns cleanly. */
export async function fetchPendingDeliveryPOs(email: string, fromDate: string, toDate: string): Promise<PoFollowupRow[]> {
  return fetchDelvPendPOs([
    `Email eq '${email}'`,
    `Zaction eq 'P'`,
    `Zfdate eq ${toSapDateFilter(fromDate)}`,
    `Ztdate eq ${toSapDateFilter(toDate)}`,
  ]);
}
