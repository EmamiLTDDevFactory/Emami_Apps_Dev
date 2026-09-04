// SAP OData integration for Provision Tracking (formerly "Payment Tracking") — reads from
// ZProvisionTrackSet (service ZMM_PO_FOLLOWUP_SRV, unchanged host as Delivery Confirmation's
// poFollowupApi.ts, but ZProvisionTrackSet is its own entity/GET_ENTITYSET method, not the
// Potype-9 branch of ZDelvPendPOSet the old Payment Tracking used). Backed by EKKO/EKPO + EKKN
// (GL/cost center) + EKET (delivery schedule line) + ESSR (service entry sheets) + EKBE (GR/SES
// history, VGABE 1/9), deriving a STATUS code per PO item:
//   01 = Service Entry Sheet not created
//   02 = GR/MIGO posted, SES not created  <- main provision exposure
//   03 = SES created and reversed
//   04 = SES created, acceptance pending
//   05 = SES created and accepted (or "partly reversed" if some sheets were)
// Field names below are confirmed directly against the live SEGW entity (Ebeln/Ebelp/Lblni as
// key). BUKRS/WERKS/AEDAT/WAERS/PSTYP/KNTTP/SES_COUNT/SES_REV_COUNT/ERDAT_SES are still NOT exposed
// on the entity, so none of those are mapped here — but Eindt (delivery date, from EKET) IS now
// live, along with the financial-year fields derived from it server-side (Gjahr/Monat/Quarter/
// FiscyearTxt): the ABAP restricts EINDT to the current financial year (Apr YYYY - Mar YYYY+1) by
// default and accepts a Gjahr filter to report a different one — see ProvisionFilter/
// buildFilterParts below and MonthYearContext.tsx for how the UI drives that.
// Email is now live too, and — per instruction, same lesson as Market Rate's ZmarketRateSet —
// every call sends the signed-in user's own login email as a real `Email eq '...'` clause, never
// omitted; the backend is trusted to decide Admin-vs-own-items scope from that email's role.
// There's nothing here for a user to "confirm" — every field is a server-computed fact, so every
// screen built on this is read-only.
import axios from 'axios';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZMM_PO_FOLLOWUP_SRV';
const ENTITY_SET = 'ZProvisionTrackSet';

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

/** SAP OData v2 JSON encodes Edm.DateTime as "/Date(epochMillis)/" — same shape
 * embedded-apps/po-followup/src/lib/poFollowupApi.ts already unpacks for Eindt on the sibling
 * entity (ZDelvPendPOSet) this app used to read from, same SAP service. "" for anything else/
 * unparseable rather than throwing, since not every row is guaranteed a schedule line. */
function parseODataDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = value.match(/\/Date\((-?\d+)\)\//);
  if (match) return new Date(Number(match[1])).toISOString().split('T')[0];
  return '';
}

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
  email: string; // Email
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
  /** Eindt — the PO item's delivery (schedule line) date, 'YYYY-MM-DD' or '' if unparseable/
   * absent. Drives the Month filter client-side (see provisionMetrics.ts's filterByMonth) — the
   * financial-year window itself is enforced server-side via the Gjahr filter, not by this field. */
  deliveryDate: string;
  /** Gjahr — the financial year this row was returned under (server-computed from Eindt), e.g.
   * '2025' for FY 2025-26. Matches whatever Gjahr was requested (or SAP's current-FY default). */
  fiscalYear: string;
  /** Monat — the financial period 1-12 where period 1 = April (server-computed, not a calendar
   * month number). Kept for reference/display; Month filtering itself uses deliveryDate's real
   * calendar month, which is what users actually recognize. */
  fiscalPeriod: string;
  /** Quarter — 'Q1'..'Q4' of the financial year (server-computed from Monat). */
  fiscalQuarter: string;
  /** FiscyearTxt — e.g. "FY 2025-26" (server-computed); MonthYearContext.tsx's fiscalYearLabel()
   * computes the same format client-side for the year picker, so this is mainly for display
   * next to a specific row rather than driving any UI on its own. */
  fiscalYearText: string;
}

function toPaymentTrackingRow(raw: Record<string, any>, index: number): PaymentTrackingRow {
  const str = (v: any) => (v != null ? String(v) : '');
  const bool = (v: any) => v === true || v === 'X' || v === 'true';
  return {
    key: `${raw.Ebeln ?? 'po'}-${raw.Ebelp ?? index}-${raw.Lblni ?? ''}`,
    email: str(raw.Email),
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
    deliveryDate: parseODataDate(raw.Eindt),
    fiscalYear: str(raw.Gjahr),
    fiscalPeriod: str(raw.Monat),
    fiscalQuarter: str(raw.Quarter),
    fiscalYearText: str(raw.FiscyearTxt),
  };
}

// Confirmed filterable on the live entity per the ABAP GET_ENTITYSET method's own filter handling
// AND present as an actual property today: Ebeln, Ebelp, Lifnr, Ernam, Sakto, Kostl, Status,
// Email, Gjahr. Bukrs/Werks/Aedat/Pstyp are filter-handled in that same ABAP but aren't live
// properties yet ("note - all fields not added") — don't filter on them until they are.
export interface ProvisionFilter {
  poNumber?: string; // Ebeln
  vendor?: string; // Lifnr
  poCreator?: string; // Ernam
  glAccount?: string; // Sakto
  costCenter?: string; // Kostl
  status?: ProvisionStatus;
  /** Financial year (the year Apr starts in, e.g. '2025' for FY 2025-26) — omit to get the ABAP's
   * own current-FY default. This is the one filter that actually changes what SAP returns for the
   * Month/Year picker; Month itself narrows the response client-side (see filterByMonth). */
  gjahr?: string;
}

function buildFilterParts(email: string, filter: ProvisionFilter): string[] {
  const parts: string[] = [`Email eq '${email}'`];
  if (filter.poNumber) parts.push(`Ebeln eq '${filter.poNumber}'`);
  if (filter.vendor) parts.push(`Lifnr eq '${filter.vendor}'`);
  if (filter.poCreator) parts.push(`Ernam eq '${filter.poCreator}'`);
  if (filter.glAccount) parts.push(`Sakto eq '${filter.glAccount}'`);
  if (filter.costCenter) parts.push(`Kostl eq '${filter.costCenter}'`);
  if (filter.status) parts.push(`Status eq '${filter.status}'`);
  if (filter.gjahr) parts.push(`Gjahr eq '${filter.gjahr}'`);
  return parts;
}

/** Every open provision item matching the given filters, always scoped by the signed-in user's
 * own login email (never omitted — see this file's header comment). For an Admin this is still
 * the cross-org view Dashboard's KPIs and Provision Details' cost-center/PO drill-down are built
 * on — the backend is trusted to expand scope to everyone once it sees that email is an Admin,
 * the same way Market Rate's ZmarketRateSet does. There is no Zaction/Interval/Potype on this
 * entity (unlike the old ZDelvPendPOSet-based Payment Tracking). */
export async function fetchProvisionPOs(email: string, filter: ProvisionFilter = {}): Promise<PaymentTrackingRow[]> {
  const raw = await fetchProvisionRows(buildFilterParts(email, filter));
  return raw.map(toPaymentTrackingRow);
}
