// SAP OData integration for Provision Tracking (formerly "Payment Tracking") — reads from
// ZProvisionTrackSet (service ZMM_PO_FOLLOWUP_SRV, unchanged host as Delivery Confirmation's
// poFollowupApi.ts, but ZProvisionTrackSet is its own entity/GET_ENTITYSET method, not the
// Potype-9 branch of ZDelvPendPOSet the old Payment Tracking used). Backed by EKKO/EKPO + EKKN
// (GL/cost center) + ESSR (service entry sheets) + EKBE (GR/SES history, VGABE 1/9), deriving a
// STATUS code per PO item:
//   01 = Service Entry Sheet not created
//   02 = GR/MIGO posted, SES not created  <- main provision exposure
//   03 = SES created and reversed
//   04 = SES created, acceptance pending
//   05 = SES created and accepted (or "partly reversed" if some sheets were)
// Field names below are confirmed directly against the live SEGW entity (Ebeln/Ebelp/Lblni as
// key), not the fuller append structure (ZST_MM_PROVISION_APP) the ABAP was written against —
// BUKRS/WERKS/AEDAT/WAERS/PSTYP/KNTTP/SES_COUNT/SES_REV_COUNT/ERDAT_SES were recommended but are
// NOT yet exposed on the entity ("note - all fields not added"), so none of them are mapped here.
// There's nothing here for a user to "confirm" — every field is a server-computed fact, so every
// screen built on this is read-only.
import axios from 'axios';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZMM_PO_FOLLOWUP_SRV';
const ENTITY_SET = 'ZProvisionTrackSet';

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

async function fetchProvisionRows(filterParts: string[] = []): Promise<Record<string, any>[]> {
  const params: Record<string, string> = { '$format': 'json' };
  if (filterParts.length > 0) params['$filter'] = filterParts.join(' and ');
  const { data } = await sapClient.get(`/${ENTITY_SET}`, { params });
  const results = data?.d?.results;
  return Array.isArray(results) ? results : [];
}

/** Provision status codes, per the ABAP's own derivation (see this file's header comment) — '02'
 * is explicitly "your main provision exposure bucket". */
export type ProvisionStatus = '01' | '02' | '03' | '04' | '05';

/** One PO item's provision status, from ZProvisionTrackSet. Field names confirmed directly
 * against the live SEGW entity (see this file's header comment for what's NOT yet exposed). */
export interface PaymentTrackingRow {
  /** Ebeln-Ebelp-Lblni — SEGW marks all three as the entity key, so the row key follows suit even
   * though a PO item with no service entry sheet yet has a blank Lblni. */
  key: string;
  poNumber: string; // Ebeln
  poItemNo: string; // Ebelp
  poCreator: string; // Ernam
  vendor: string; // Lifnr
  vendorName: string; // Name1
  serviceText: string; // Ktext1 — "Service Txt"
  glAccount: string; // Sakto
  glAccountText: string; // SaktoTxt
  costCenter: string; // Kostl
  costCenterText: string; // KostlTxt
  grossValue: string; // Tbtwr — "Activity value" (EKPO-BRTWR, PO currency)
  pendingValue: string; // PendVal — "Pending Bill Value" (Tbtwr minus accepted SES value)
  grValue: string; // GrVal — GR/MIGO value, net of reversals
  sesValue: string; // SesVal — accepted SES value
  grFlag: boolean; // GrFlag — GR/MIGO posted
  sesFlag: boolean; // SesFlag — a service entry sheet exists
  sesRevFlag: boolean; // SesRevFlag — a service entry sheet was reversed
  entrySheetNo: string; // Lblni
  status: ProvisionStatus | ''; // Status
  statusText: string; // StatusTxt
  /** Derived from SesFlag, not a raw field — 'N' until a service entry sheet exists, 'Y' once one
   * does (matches this column's original "Y once one exists" definition). */
  liabilityCreated: 'Y' | 'N';
}

function toPaymentTrackingRow(raw: Record<string, any>, index: number): PaymentTrackingRow {
  const str = (v: any) => (v != null ? String(v) : '');
  const bool = (v: any) => v === true || v === 'X' || v === 'true';
  return {
    key: `${raw.Ebeln ?? 'po'}-${raw.Ebelp ?? index}-${raw.Lblni ?? ''}`,
    poNumber: str(raw.Ebeln),
    poItemNo: str(raw.Ebelp),
    poCreator: str(raw.Ernam),
    vendor: str(raw.Lifnr),
    vendorName: str(raw.Name1),
    serviceText: str(raw.Ktext1),
    glAccount: str(raw.Sakto),
    glAccountText: str(raw.SaktoTxt),
    costCenter: str(raw.Kostl),
    costCenterText: str(raw.KostlTxt),
    grossValue: str(raw.Tbtwr),
    pendingValue: str(raw.PendVal),
    grValue: str(raw.GrVal),
    sesValue: str(raw.SesVal),
    grFlag: bool(raw.GrFlag),
    sesFlag: bool(raw.SesFlag),
    sesRevFlag: bool(raw.SesRevFlag),
    entrySheetNo: str(raw.Lblni),
    status: (str(raw.Status) as ProvisionStatus) || '',
    statusText: str(raw.StatusTxt),
    liabilityCreated: bool(raw.SesFlag) ? 'Y' : 'N',
  };
}

// Confirmed filterable on the live entity per the ABAP GET_ENTITYSET method's own filter handling
// AND present as an actual property today: Ebeln, Ebelp, Lifnr, Ernam, Sakto, Kostl, Status.
// Bukrs/Werks/Aedat/Pstyp are filter-handled in that same ABAP but aren't live properties yet
// ("note - all fields not added") — don't filter on them until they are.
export interface ProvisionFilter {
  poNumber?: string; // Ebeln
  vendor?: string; // Lifnr
  poCreator?: string; // Ernam
  glAccount?: string; // Sakto
  costCenter?: string; // Kostl
  status?: ProvisionStatus;
}

function buildFilterParts(filter: ProvisionFilter): string[] {
  const parts: string[] = [];
  if (filter.poNumber) parts.push(`Ebeln eq '${filter.poNumber}'`);
  if (filter.vendor) parts.push(`Lifnr eq '${filter.vendor}'`);
  if (filter.poCreator) parts.push(`Ernam eq '${filter.poCreator}'`);
  if (filter.glAccount) parts.push(`Sakto eq '${filter.glAccount}'`);
  if (filter.costCenter) parts.push(`Kostl eq '${filter.costCenter}'`);
  if (filter.status) parts.push(`Status eq '${filter.status}'`);
  return parts;
}

/** Every open provision item matching the given filters — with no filter at all, this is the
 * Admin-wide, cross-org view Dashboard's KPIs and Provision Details' cost-center/PO drill-down
 * are built on. There is no Email/Zaction/Interval/Potype on this entity (unlike the old
 * ZDelvPendPOSet-based Payment Tracking) — see this file's header comment. */
export async function fetchProvisionPOs(filter: ProvisionFilter = {}): Promise<PaymentTrackingRow[]> {
  const raw = await fetchProvisionRows(buildFilterParts(filter));
  return raw.map(toPaymentTrackingRow);
}
