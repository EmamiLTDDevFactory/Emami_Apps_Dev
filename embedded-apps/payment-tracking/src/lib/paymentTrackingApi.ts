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
// key). BUKRS/WERKS/AEDAT/PSTYP/KNTTP/SES_COUNT/SES_REV_COUNT/ERDAT_SES are still NOT exposed on
// the entity, so none of those are mapped here — but Eindt (delivery date, from EKET) IS now live,
// along with the financial-year fields derived from it server-side (Gjahr/Monat/Quarter/
// FiscyearTxt): the ABAP restricts EINDT to the current financial year (Apr YYYY - Mar YYYY+1) by
// default and accepts a Gjahr filter to report a different one — see ProvisionFilter/
// buildFilterParts below and MonthYearContext.tsx for how the UI drives that.
// Land1 (country key) and GrCur/SesCur (currency keys for GrVal/SesVal) are now live on the entity
// too (confirmed the same way — a direct GET against ZProvisionTrackSet), but Land1 is NOT yet
// wired into the ABAP's own filter handling (a `Land1 eq 'IN'` $filter is silently ignored — same
// server, same result count with or without it), so Country stays a client-side-only filter
// dimension in ProvisionFilters.tsx, never sent to SAP, unlike Ebeln/Lifnr/Ernam/Sakto/Kostl/
// Status/Gjahr below which the ABAP does honor.
// Email is now live too, and — per instruction, same lesson as Market Rate's ZmarketRateSet —
// every call sends the signed-in user's own login email as a real `Email eq '...'` clause, never
// omitted; the backend is trusted to decide Admin-vs-own-items scope from that email's role.
// There's nothing here for a user to "confirm" — every field is a server-computed fact, so every
// screen built on this is read-only.
import axios from 'axios';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZMM_PO_FOLLOWUP_SRV';
/** The SAP landscape this build talks to (the segment after /api/ in SAP_BASE_URL): NGD = development, NWP = production.
 * Shown as a DEV / PRD badge in the header so nobody mistakes one for the other. */
export const SAP_SYSTEM = (SAP_BASE_URL.match(/\/api\/([A-Z]{3})\//)?.[1] ?? '') as string;
const ENTITY_SET = 'ZProvisionTrackSet';

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

/** SAP OData v2 JSON encodes Edm.DateTime as "/Date(epochMillis)/" — same shape
 * embedded-apps/po-followup/src/lib/poFollowupApi.ts already unpacks for Eindt on the sibling
 * entity (ZDelvPendPOSet) this app used to read from, same SAP service. "" for anything else/
 * unparseable rather than throwing, since not every row is guaranteed a schedule line. */
/** Edm.Time ('PT14H30M05S') or 'HHMMSS' / 'HH:MM:SS' -> 'HH:MM:SS'; '' when blank or unreadable. */
function parseODataTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const iso = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?$/);
  const p2 = (n: string | undefined) => String(Number(n || 0)).padStart(2, '0');
  if (iso) return `${p2(iso[1])}:${p2(iso[2])}:${p2(iso[3])}`;
  const flat = value.replace(/:/g, '');
  return /^\d{6}$/.test(flat) ? `${flat.slice(0, 2)}:${flat.slice(2, 4)}:${flat.slice(4, 6)}` : '';
}

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
  grCurrency: string; // GrCur — currency key GrVal is denominated in
  sesValue: string; // SesVal — accepted SES value
  sesCurrency: string; // SesCur — currency key SesVal is denominated in
  country: string; // Land1 — vendor/plant country key, e.g. 'IN', 'AE'
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
    grCurrency: str(raw.GrCur),
    sesValue: str(raw.SesVal),
    sesCurrency: str(raw.SesCur),
    country: str(raw.Land1),
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

// ---------------------------------------------------------------------------------------------
// Vendor PO Followup / Provision confirmation flow (User's "Upcoming Provision" / "Missed
// Provision" side-pane screens) — a different entity set (ZVendorPOFollowupSet) and a different
// write-back entity (ZProvHeader), on the SAME SAP service (ZMM_PO_FOLLOWUP_SRV) as the read-only
// ZProvisionTrackSet reporting above. Per instruction: the GET is filtered by the signed-in user's
// own login Email plus Zaction ('U' for Upcoming Provision), and every value sent back on submit
// comes from what this GET actually returned for that row (or what the user typed into one of the
// three editable fields) — nothing here is invented.
const FOLLOWUP_ENTITY_SET = 'ZVendorPOFollowupSet';
// Confirmed live: GET on 'ZProvHeader' 404s ("Resource not found for the segment"), GET on
// 'ZProvHeaderSet' instead returns "Method not implemented" (i.e. the entity set exists, its
// GET_ENTITYSET just isn't wired up) — matching this service's own "EntityType + Set" naming
// convention (ZMarketRateHeaderSet, ZProvisionTrackSet, ZVendorPOFollowupSet) and the instruction
// that this entity is POST-only.
const PROV_HEADER_ENTITY_SET = 'ZProvHeaderSet';

/** SAP OData v2 JSON encodes Edm.DateTime as "/Date(epochMillis)/" on the way in; ZProvHeader's
 * POST body (RevisedDelDate/Eindt/ZinvDate) expects the same literal shape on the way out —
 * inverse of parseODataDate above. `dateStr` is a 'YYYY-MM-DD' local date (from a date input),
 * re-encoded at UTC midnight so it round-trips through SAP as the same calendar date regardless
 * of the browser's timezone. */
function toODataDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `/Date(${Date.UTC(y, (m || 1) - 1, d || 1)})/`;
}

/** ZProvHeaderSet's deep-insert POST throws CX_SXML_PARSE_ERROR — "Failed to read property
 * '<X>'" — for ANY property sent as JSON `null`, not just the Edm.Binary attachment fields first
 * found to trip it (dev testing 2026-09-10 hit this on 'Value', then again on 'Comments'): the
 * Gateway's JSON-to-Atom/XML converter can't deserialize an explicit null on this entity at all,
 * for any facet type. Every optional field below (RevisedDelDate/Eindt/ZinvDate/Comments/Value/
 * Mimetype/Filename) is therefore still built with `null` where it doesn't apply — clearest to
 * read — and this strips every null/undefined key (recursively, so it also covers the nested
 * ToProvItems array) right before the request goes out, rather than each field needing its own
 * conditional-key workaround. */
function omitNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => omitNulls(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v === null || v === undefined) continue;
      result[k] = omitNulls(v);
    }
    return result as T;
  }
  return value;
}

/** One PO/item row from ZVendorPOFollowupSet, scoped to the signed-in user's own email and a
 * given Zaction. Fields not shown on screen (lifnr/lblni/materialCode/materialDesc/
 * vendorName) are still captured here — this entity returns them alongside the ones the UI does
 * display — purely so ZProvHeader's submit payload below can echo them back untouched, per
 * instruction ("pass the data from the screen data only"), never invented. */
export interface VendorPOFollowupRow {
  key: string;
  lifnr: string; // Lifnr
  email: string; // Email
  poNumber: string; // Ebeln
  poItemNo: string; // Ebelp
  entrySheetNo: string; // Lblni
  materialCode: string; // Matnr
  materialDesc: string; // Maktx
  serviceText: string; // Txz01
  vendorName: string; // Name1
  zaction: string; // Zaction — echoed back as-is on submit
  deliveryDate: string; // Eindt, 'YYYY-MM-DD'
  revisedDeliveryDate: string; // RevisedDeldate, 'YYYY-MM-DD' or '' — as SAP already has it on file
  provisionValue: string; // Netwr
  currency: string; // Waers
  invoiceNo: string; // ZzinvNo
  invoiceDate: string; // ZinvDate, 'YYYY-MM-DD'
  invoiceAmount: string; // ZzinvAmt
  comments: string; // Comments
  /** Stat — the row's real approval state on SAP: 'P' = pending approval, 'A' = approved, ' '
   * (blank) = not yet submitted for approval. Drives Pending Approval's Pending/Approved tabs
   * (see pending-approval.tsx) instead of relying purely on client-side session state. */
  status: string;
  /** Attachment, if any — returned inline on the same GET as every other field (confirmed live
   * 2026-09-10, per the backend's GET_ENTITYSET), not via a separate media/$value call. `filename`
   * is set whenever a file exists on the server side even if `attachmentBase64` isn't. This used to
   * be assumed to mean "the backend skips sending content over 2MB" (filename-only past that size),
   * but that's now confirmed WRONG for at least one case — a file well under 2MB still came back
   * with an empty Value. So filename-without-content doesn't reliably mean "too large"; it just
   * means SAP didn't return the bytes, for a reason GET_ENTITYSET itself needs to be checked for.
   * Empty filename means no attachment for this PO item. */
  filename: string; // Filename
  mimetype: string; // Mimetype
  attachmentBase64: string; // Value
}

/** Zaction values a Pending Approval row's own Zaction field carries, per the ZROLE_ACTION domain
 * (SE11) — same domain/codes as Submission History's Zstatus (see PROVISION_LOG_STATUS_LABELS
 * below). NOTE: the OData query behind this tab filters by Zaction eq 'PA' (see
 * fetchPendingApprovals) — 'PA' is the query's filter bucket, not a value the field itself ever
 * holds; each returned row's own Zaction is one of these five, confirmed live 2026-09-10. */
export type PendingApprovalAction = 'RD' | 'SA' | 'AS' | 'RS' | 'MS';

export const PENDING_APPROVAL_ACTIONS: PendingApprovalAction[] = ['RD', 'SA', 'AS', 'RS', 'MS'];

export const PENDING_APPROVAL_ACTION_LABELS: Record<PendingApprovalAction, string> = {
  RD: 'Approval for Revised Delivery Date',
  SA: 'Approval for SES',
  AS: 'SES Created',
  RS: 'SES Reversed',
  MS: 'Mail Sent to P2P',
};

function toVendorPOFollowupRow(raw: Record<string, any>, index: number): VendorPOFollowupRow {
  const str = (v: any) => (v != null ? String(v) : '');
  return {
    key: `${raw.Ebeln ?? 'po'}-${raw.Ebelp ?? index}-${raw.Lblni ?? ''}`,
    lifnr: str(raw.Lifnr),
    email: str(raw.Email),
    poNumber: str(raw.Ebeln),
    poItemNo: str(raw.Ebelp),
    entrySheetNo: str(raw.Lblni),
    materialCode: str(raw.Matnr),
    materialDesc: str(raw.Maktx),
    serviceText: str(raw.Txz01),
    vendorName: str(raw.Name1),
    zaction: str(raw.Zaction) || 'U',
    deliveryDate: parseODataDate(raw.Eindt),
    // Confirmed live 2026-09-10: this entity's field is 'RevisedDelDate' (capital D on both Del
    // and Date), NOT 'RevisedDeldate' — the lowercase-d guess used elsewhere in this file for the
    // still-unconfirmed ZProvisionLogSet. Reading the wrong casing silently returned '' here, so
    // Pending Approval's revised-date tiles always rendered blank.
    revisedDeliveryDate: parseODataDate(raw.RevisedDelDate),
    provisionValue: str(raw.Netwr),
    currency: str(raw.Waers),
    invoiceNo: str(raw.ZzinvNo),
    invoiceDate: parseODataDate(raw.ZinvDate),
    invoiceAmount: str(raw.ZzinvAmt),
    comments: str(raw.Comments),
    status: str(raw.Stat),
    filename: str(raw.Filename),
    mimetype: str(raw.Mimetype),
    attachmentBase64: str(raw.Value),
  };
}

/** Upcoming Provision (Zaction 'U') — or whatever Zaction is passed — for the signed-in user,
 * from ZVendorPOFollowupSet. Email is always sent (never omitted, same posture as every other
 * entity in this app). */
export async function fetchVendorPOFollowups(email: string, zaction: string): Promise<VendorPOFollowupRow[]> {
  const params = {
    '$format': 'json',
    '$filter': `Email eq '${email}' and Zaction eq '${zaction}'`,
  };
  const { data } = await sapClient.get(`/${FOLLOWUP_ENTITY_SET}`, { params });
  const results = data?.d?.results;
  return Array.isArray(results) ? results.map(toVendorPOFollowupRow) : [];
}

/** One row's on-screen confirmation state at submit time — the editable/derived fields the user
 * actually filled in, layered on top of the read-only VendorPOFollowupRow it came from. */
export interface ProvisionConfirmation {
  row: VendorPOFollowupRow;
  delvConf: boolean; // Delivery Confirmed? — true = Yes (default), false = No
  revisedDelDate: string; // 'YYYY-MM-DD', mandatory (and never a past date) when delvConf is false
  comments: string; // mandatory when delvConf is false
  invoiceNo: string; // mandatory when delvConf is true
  invoiceDate: string; // 'YYYY-MM-DD', mandatory when delvConf is true
  invoiceAmount: string; // mandatory when delvConf is true
  attachmentName: string; // mandatory when delvConf is true — PDF only, enforced at the picker
  attachmentBase64: string; // base64 file content, no data: URI prefix
  attachmentMimeType: string; // always 'application/pdf' when attachmentBase64 is set
}

// Value/Mimetype/Filename below are NOT confirmed live on ZProvHeaderSet — there's no known
// attachment field on this entity (unlike ZMM_PO_FOLLOWUP_SRV's sibling service where
// non-ctc-expense's ClaimHeaderSet/CLAIMNAV got dedicated Value/Mimetype/Filename fields added by
// SAP Basis for exactly this purpose). These three are a best-effort guess at matching that same
// naming convention. Dev testing (2026-09-10) found two live issues in order: (1) the request
// 413s (Payload Too Large — some gateway in front of this OData service caps the body) at full
// attachment size, which is why the caller (upcoming.tsx/admin-upcoming.tsx, via
// pdfAttachment.ts's ensureAttachmentUnderLimit) compresses anything over 70KB before it ever
// reaches here; (2) once that was fixed, SAP itself returned
// CX_DS_EDM_FACET_ERROR — "Property 'Mimetype' ... has invalid value 'application/pdf'" —
// confirming Mimetype IS a real field on this entity, but with a declared length shorter than
// that 15-char MIME string (this service's own $metadata endpoint refuses to serve $metadata at
// all — some gateway/proxy issue independent of auth or query-string encoding — so the actual
// limit couldn't be confirmed directly). Since every attachment here is a PDF by construction
// (mandatory PDF-only picker), Mimetype is sent as the short fixed code 'PDF' instead of the full
// MIME string — safely under any plausible field length. If SAP Basis ever confirms the real
// facet (or a different intended value), update this and the sibling ProvisionConfirmation type.
// Null fields below (RevisedDelDate/ZinvDate/Comments/Value/Mimetype/Filename, depending on
// DelvConf) are stripped by omitNulls() at the POST call site — see that function's header
// comment for why they can't just be sent as JSON null.
function toProvItem(c: ProvisionConfirmation, email: string) {
  const { row } = c;
  const hasAttachment = c.delvConf && !!c.attachmentBase64;
  return {
    Lifnr: row.lifnr,
    Email: email,
    Ebeln: row.poNumber,
    Ebelp: row.poItemNo,
    Matnr: row.materialCode,
    Maktx: row.materialDesc,
    Txz01: row.serviceText,
    Name1: row.vendorName,
    // Per instruction: "Send for Invoice Approval" (DelvConf Yes) requests SES approval, so it's
    // sent as Zaction 'SA' ("Approval for SES" per the ZROLE_ACTION domain — see
    // PENDING_APPROVAL_ACTION_LABELS below) rather than echoing the row's original Zaction ('U').
    // "Send for Revised Date Approval" (DelvConf No) is the matching 'RD' bucket ("Approval for
    // Revised Delivery Date") — not separately called out in this round of instructions, but the
    // same domain code Pending Approval's own RD tiles already expect, so both branches now write
    // a real ZROLE_ACTION code instead of the stale 'U'.
    Zaction: c.delvConf ? 'SA' : 'RD',
    RevisedDelDate: c.delvConf ? null : toODataDate(c.revisedDelDate),
    Eindt: row.deliveryDate ? toODataDate(row.deliveryDate) : null,
    Waers: row.currency,
    Brtwr: row.provisionValue,
    ZzinvNo: c.invoiceNo,
    ZinvDate: c.invoiceDate ? toODataDate(c.invoiceDate) : null,
    ZzinvAmt: c.invoiceAmount,
    // Mandatory (and collected via the Revised Delivery Date modal) when DelvConf is 'No' — field
    // name matches toApprovalItem's Comments below, the one other write on this entity.
    Comments: c.delvConf ? null : c.comments,
    DelvConf: c.delvConf ? 'Y' : 'N',
    Value: hasAttachment ? c.attachmentBase64 : null,
    Mimetype: hasAttachment ? 'PDF' : null,
    Filename: hasAttachment && c.attachmentName ? c.attachmentName.slice(0, 90) : null,
  };
}

/** Pending Approval (Admin's side-pane tab) — every ZVendorPOFollowupSet row scoped to the signed-
 * in Admin's own login email AND Zaction 'PA' (Pending Approval) — the backend is trusted to
 * expand scope to every user's pending items once it sees an Admin email, same posture as
 * fetchProvisionPOs above. */
export async function fetchPendingApprovals(email: string): Promise<VendorPOFollowupRow[]> {
  const params = {
    '$format': 'json',
    '$filter': `Email eq '${email}' and Zaction eq 'PA'`,
  };
  const { data } = await sapClient.get(`/${FOLLOWUP_ENTITY_SET}`, { params });
  const results = data?.d?.results;
  return Array.isArray(results) ? results.map(toVendorPOFollowupRow) : [];
}

/** Sends one or more confirmed rows to ZProvHeader — a deep insert, same POST-with-nested-array
 * shape as Market Rate's saveMarketRates. Per the given payload example, the header's own
 * Lifnr/Email/Ebeln/Ebelp/Lblni are the FIRST item's — SEGW requires a representative key trio at
 * the header level even though ToProvItems can span multiple PO items. Row-wise "send for
 * approval" always calls this with a single-confirmation array. Email is always the signed-in
 * user's own login email (never the row's echoed-back Email), same posture as every other write
 * in this app. */
export async function submitProvisionApproval(confirmations: ProvisionConfirmation[], email: string): Promise<void> {
  if (confirmations.length === 0) return;
  const first = confirmations[0].row;
  const payload = {
    Lifnr: first.lifnr,
    Email: email,
    Ebeln: first.poNumber,
    Ebelp: first.poItemNo,
    Lblni: first.entrySheetNo,
    ToProvItems: confirmations.map((c) => toProvItem(c, email)),
  };
  try {
    const result = await sapClient.post(`/${PROV_HEADER_ENTITY_SET}`, omitNulls(payload));
    // SAP's OData gateway sometimes returns HTTP 200 with an error body instead of a non-2xx status.
    const body = result.data?.d || result.data;
    if (body?.Type === 'E') {
      throw new Error(body.Message || 'SAP rejected this submission.');
    }
  } catch (err: any) {
    const sapMessage = err?.response?.data?.error?.message?.value;
    throw new Error(sapMessage || (err instanceof Error ? err.message : 'Could not send this for approval.'));
  }
}

/** Mass "send for approval" groups the selected rows by vendor (Lifnr) — one ZProvHeader batch
 * per vendor, since the header requires one representative Lifnr/Ebeln/Ebelp/Lblni trio. Runs
 * sequentially (not Promise.all) so one vendor's failure can't leave a partial, hard-to-diagnose
 * mix of concurrent SAP writes; returns which groups failed instead of throwing on the first one,
 * so the caller can report a per-vendor result rather than an all-or-nothing outcome. */
export async function submitProvisionApprovalBatch(
  confirmations: ProvisionConfirmation[],
  email: string
): Promise<{ lifnr: string; error: string }[]> {
  const groups = new Map<string, ProvisionConfirmation[]>();
  confirmations.forEach((c) => {
    const key = c.row.lifnr || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  });

  const failures: { lifnr: string; error: string }[] = [];
  for (const [lifnr, group] of groups) {
    try {
      await submitProvisionApproval(group, email);
    } catch (err) {
      failures.push({ lifnr, error: err instanceof Error ? err.message : 'Could not send this for approval.' });
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------------------------
// Admin's Pending Approval decision — same ZProvHeader POST endpoint and same header/deep-insert
// shape as submitProvisionApproval above ("the same POST method, same way", per instruction), just
// with Zaction overridden instead of echoing the row's original Zaction — that field is already how
// this entity carries a row's state, so an Admin decision is just a different Zaction value on the
// same write. Approving a row already in the 'SA' (Approval for SES) bucket writes Zaction 'AS'
// (SES Created) — the domain's own next-state code — rather than a bare 'A', and approving an 'RD'
// (Revised Delivery Date) row writes 'RD', per instruction (2026-10-04). Any other approval still
// writes 'A', and a rejection still writes 'R'. 'S' is a third decision value — Save, used when Admin just wants the edited
// invoice fields/attachment persisted without deciding the row at all (see submitApprovalDecision's
// callers in pending-approval.tsx, which never set `decided` for an 'S' call). Every other field is
// echoed back from what the GET already returned for that row, same posture as toProvItem above —
// nothing invented. Null fields here (RevisedDelDate/Eindt/ZinvDate) are stripped by omitNulls() at
// the POST call site, same as toProvItem.
export type ApprovalDecision = 'A' | 'R' | 'S';

/** Admin-entered overrides for a row's four invoice fields — per instruction, Admin can fill these
 * in on Pending Approval (and on Submission History's Mail for P2P, see InvoiceEditOverrides'
 * sibling use in submitLogAction below) before the row goes out, same fields as Upcoming
 * Provision's own editable trio + attachment. Undefined/blank means "leave whatever the row
 * already had" — these are optional overlays on top of the row's own GET data, not a replacement
 * for it. */
export interface InvoiceEditOverrides {
  invoiceNo?: string;
  invoiceDate?: string;
  invoiceAmount?: string;
  attachmentBase64?: string;
  attachmentMimeType?: string;
  attachmentName?: string;
}

function toApprovalItem(row: VendorPOFollowupRow, decision: ApprovalDecision, overrides?: InvoiceEditOverrides) {
  const invoiceNo = overrides?.invoiceNo ?? row.invoiceNo;
  const invoiceDate = overrides?.invoiceDate ?? row.invoiceDate;
  const invoiceAmount = overrides?.invoiceAmount ?? row.invoiceAmount;
  const hasAttachment = !!overrides?.attachmentBase64;
  // Approving (decision 'A') writes the row's own approval code where SAP has one: an 'SA' row
  // (Approval for SES) is the point the SES gets created, so 'AS'; an 'RD' row (Revised Delivery
  // Date) writes 'RD'. Any other approval, a rejection ('R') or a plain save ('S') writes the
  // decision value itself unchanged.
  const APPROVE_ZACTION: Record<string, string> = { SA: 'AS', RD: 'RD' };
  const zaction = decision === 'A' ? APPROVE_ZACTION[(row.zaction || '').trim()] || 'A' : decision;
  return {
    Lifnr: row.lifnr,
    Ebeln: row.poNumber,
    Ebelp: row.poItemNo,
    Matnr: row.materialCode,
    Maktx: row.materialDesc,
    Txz01: row.serviceText,
    Name1: row.vendorName,
    Zaction: zaction,
    RevisedDelDate: row.revisedDeliveryDate ? toODataDate(row.revisedDeliveryDate) : null,
    Eindt: row.deliveryDate ? toODataDate(row.deliveryDate) : null,
    Waers: row.currency,
    Brtwr: row.provisionValue,
    ZzinvNo: invoiceNo,
    ZinvDate: invoiceDate ? toODataDate(invoiceDate) : null,
    ZzinvAmt: invoiceAmount,
    Comments: row.comments,
    DelvConf: 'Y',
    Value: hasAttachment ? overrides!.attachmentBase64 : null,
    Mimetype: hasAttachment ? 'PDF' : null,
    Filename: hasAttachment && overrides?.attachmentName ? overrides.attachmentName.slice(0, 90) : null,
  };
}

/** One or more Pending Approval rows, approved or rejected by the signed-in Admin — same
 * ZProvHeaderSet POST as submitProvisionApproval (header's Lifnr/Ebeln/Ebelp/Lblni taken from the
 * FIRST row, same SEGW key-trio requirement), Email always the signed-in Admin's own login email.
 * `overridesByKey` (row.key -> InvoiceEditOverrides) lets Admin's own edited invoice fields/
 * attachment ride along on the same POST, per row. */
export async function submitApprovalDecision(
  rows: VendorPOFollowupRow[],
  email: string,
  decision: ApprovalDecision,
  overridesByKey?: Record<string, InvoiceEditOverrides>
): Promise<void> {
  if (rows.length === 0) return;
  const first = rows[0];
  const payload = {
    Lifnr: first.lifnr,
    Email: email,
    Ebeln: first.poNumber,
    Ebelp: first.poItemNo,
    Lblni: first.entrySheetNo,
    ToProvItems: rows.map((r) => toApprovalItem(r, decision, overridesByKey?.[r.key])),
  };
  try {
    const result = await sapClient.post(`/${PROV_HEADER_ENTITY_SET}`, omitNulls(payload));
    const body = result.data?.d || result.data;
    if (body?.Type === 'E') {
      throw new Error(body.Message || 'SAP rejected this submission.');
    }
  } catch (err: any) {
    const sapMessage = err?.response?.data?.error?.message?.value;
    throw new Error(sapMessage || (err instanceof Error ? err.message : approvalFallbackMessage(decision)));
  }
}

function approvalFallbackMessage(decision: ApprovalDecision): string {
  if (decision === 'A') return 'Could not approve this item.';
  if (decision === 'R') return 'Could not reject this item.';
  return 'Could not save the invoice details.';
}

/** Mass approve/reject — groups the selected rows by vendor (Lifnr), one ZProvHeader POST per
 * vendor, run sequentially (not Promise.all), same rationale as submitProvisionApprovalBatch:
 * one vendor's failure can't leave a partial mix of concurrent SAP writes, and the caller gets a
 * per-vendor failure list instead of an all-or-nothing throw. */
export async function submitApprovalDecisionBatch(
  rows: VendorPOFollowupRow[],
  email: string,
  decision: ApprovalDecision,
  overridesByKey?: Record<string, InvoiceEditOverrides>
): Promise<{ lifnr: string; error: string }[]> {
  const groups = new Map<string, VendorPOFollowupRow[]>();
  rows.forEach((r) => {
    const key = r.lifnr || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });

  const failures: { lifnr: string; error: string }[] = [];
  for (const [lifnr, group] of groups) {
    try {
      await submitApprovalDecision(group, email, decision, overridesByKey);
    } catch (err) {
      failures.push({ lifnr, error: err instanceof Error ? err.message : approvalFallbackMessage(decision) });
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------------------------
// Submission History (User side-pane tab) — reads ZProvisionLogSet, a third entity set on the
// same ZMM_PO_FOLLOWUP_SRV service. Per the ZROLE_ACTION domain (SE11), Zstatus is one of:
//   RD = Revised Delivery Date, SA = Approval for SES, AS = SES Created,
//   RS = SES Reversed, MS = Mail Sent to P2P
// Confirmed live 2026-09-16 (a real $filter'd GetEntitySet response): Filename/Comments/Email/
// Mimetype/Lifnr/Ebeln/Ebelp/Lblni/Eindt/Waers/Netwr/ZzinvNo/ZinvDate/ZzinvAmt/RevisedDelDate/
// Zstatus all come back exactly as mapped below. Matnr/Maktx/Zstatustxt are confirmed NOT present
// on this entity at all (materialCode/materialDesc/the zstatusText fallback stay blank/derived,
// that's expected). Two things changed between an earlier capture that same day and this one —
// the entity itself now also returns `Value` (the attachment's base64 content, previously absent
// even on rows with a populated Filename/Mimetype) and `LogDate`/`LogTime` (new fields, not
// present before) — so this entity's own definition was extended server-side mid-day, not a
// client request-format issue. `LogDate` is mapped to actionDate below (replacing the earlier
// guess of a nonexistent `Zdate`); `LogTime` isn't currently surfaced anywhere in this row shape.
// toProvisionLogRow() below still reads every field defensively (str()/parseODataDate() already
// no-op to '' on anything missing/unparseable), so if this entity changes shape again it degrades
// to blank columns rather than throwing.
const LOG_ENTITY_SET = 'ZProvisionLogSet';

/** Zstatus values per the ZROLE_ACTION domain (SE11) — see this section's header comment. */
export type ProvisionLogStatus = 'RD' | 'SA' | 'AS' | 'RS' | 'MS';

export const PROVISION_LOG_STATUSES: ProvisionLogStatus[] = ['RD', 'SA', 'AS', 'RS', 'MS'];

/** Domain-fixed short description per status code, straight from ZROLE_ACTION — used as the
 * fallback label whenever the entity itself doesn't also return a text field for it. */
export const PROVISION_LOG_STATUS_LABELS: Record<ProvisionLogStatus, string> = {
  RD: 'Revised Delivery Date',
  SA: 'Approval for SES',
  AS: 'SES Created',
  RS: 'SES Reversed',
  MS: 'Mail Sent to P2P',
};

/** One submission-history entry from ZProvisionLogSet — see this section's header comment for what
 * a live 2026-09-16 capture confirmed. entrySheetNo/currency/filename/mimetype/attachmentBase64
 * all read correctly now; materialCode/materialDesc are confirmed always blank (the source fields
 * don't exist on this entity). */
export interface ProvisionLogRow {
  key: string;
  email: string; // Email
  poNumber: string; // Ebeln
  poItemNo: string; // Ebelp
  vendor: string; // Lifnr
  vendorName: string; // Name1
  serviceText: string; // Ktext1
  zstatus: ProvisionLogStatus | ''; // Zstatus
  /** Display label for zstatus — the entity's own text field if it returns one (guessed as
   * Zstatustxt), otherwise PROVISION_LOG_STATUS_LABELS[zstatus], otherwise the raw code. */
  zstatusText: string;
  actionDate: string; // LogDate — confirmed live 2026-09-16 (previously guessed as nonexistent Zdate)
  actionTime: string; // LogTime, 'HH:MM:SS' or '' — orders entries of the same day in the audit trail
  /** position in SAP's answer — the last tie-breaker for entries with the same date and time */
  seq: number;
  deliveryDate: string; // Eindt, 'YYYY-MM-DD'
  revisedDeliveryDate: string; // RevisedDelDate, 'YYYY-MM-DD' or ''
  provisionValue: string; // Netwr
  invoiceNo: string; // ZzinvNo
  invoiceDate: string; // ZinvDate, 'YYYY-MM-DD'
  invoiceAmount: string; // ZzinvAmt
  remarks: string; // Comments
  /** Lblni — confirmed live 2026-09-16. Needed as the ZProvHeader POST's header key trio
   * (Lifnr/Ebeln/Ebelp/Lblni) for submitLogAction below, same as VendorPOFollowupRow.entrySheetNo. */
  entrySheetNo: string; // Lblni
  materialCode: string; // Matnr — confirmed 2026-09-16: not returned by this entity, always ''
  materialDesc: string; // Maktx — confirmed 2026-09-16: not returned by this entity, always ''
  currency: string; // Waers — confirmed live 2026-09-16
  /** Attachment — filename/mimetype/attachmentBase64 (Value) all confirmed live 2026-09-16. Same
   * "empty Value doesn't reliably mean anything specific" caveat as Pending Approval's
   * VendorPOFollowupSet applies here too — an empty attachmentBase64 with a populated filename
   * still gets the "Attachment unavailable" treatment rather than being treated as an error. */
  filename: string; // Filename
  mimetype: string; // Mimetype
  attachmentBase64: string; // Value — see comment above, confirmed never populated by this read
}

function toProvisionLogRow(raw: Record<string, any>, index: number): ProvisionLogRow {
  const str = (v: any) => (v != null ? String(v) : '');
  const zstatus = (str(raw.Zstatus).toUpperCase() as ProvisionLogStatus) || '';
  return {
    key: `${raw.Ebeln ?? 'log'}-${raw.Ebelp ?? index}-${zstatus}-${index}`,
    email: str(raw.Email),
    poNumber: str(raw.Ebeln),
    poItemNo: str(raw.Ebelp),
    vendor: str(raw.Lifnr),
    vendorName: str(raw.Name1),
    serviceText: str(raw.Ktext1),
    zstatus,
    zstatusText: str(raw.Zstatustxt) || PROVISION_LOG_STATUS_LABELS[zstatus] || zstatus,
    actionDate: parseODataDate(raw.LogDate),
    actionTime: parseODataTime(raw.LogTime),
    seq: index,
    deliveryDate: parseODataDate(raw.Eindt),
    revisedDeliveryDate: parseODataDate(raw.RevisedDelDate),
    provisionValue: str(raw.Netwr),
    invoiceNo: str(raw.ZzinvNo),
    invoiceDate: parseODataDate(raw.ZinvDate),
    invoiceAmount: str(raw.ZzinvAmt),
    remarks: str(raw.Comments),
    entrySheetNo: str(raw.Lblni),
    materialCode: str(raw.Matnr),
    materialDesc: str(raw.Maktx),
    currency: str(raw.Waers),
    filename: str(raw.Filename),
    mimetype: str(raw.Mimetype),
    attachmentBase64: str(raw.Value),
  };
}

/** Submission History — every ZProvisionLogSet entry for the signed-in user's own login email.
 * Email is always sent (never omitted, same posture as every other entity in this app); the
 * status-chip filter is applied client-side over this full result set (see history.tsx) rather
 * than as a $filter, so switching chips doesn't re-hit SAP. */
export async function fetchProvisionLog(email: string): Promise<ProvisionLogRow[]> {
  const params = { '$format': 'json', '$filter': `Email eq '${email}'` };
  const { data } = await sapClient.get(`/${LOG_ENTITY_SET}`, { params });
  const results = data?.d?.results;
  return Array.isArray(results) ? results.map(toProvisionLogRow) : [];
}

// ---------------------------------------------------------------------------------------------
// Submission History row actions — for a row already in the 'AS' (SES Created) state, the next
// step is either reversing that SES or notifying P2P, not an approve/reject decision (that already
// happened earlier, which is how the row got to 'AS' in the first place). Same ZProvHeaderSet POST
// as every other write in this app ("call create entityset with different actions", per
// instruction), just with Zaction set to 'RS' or 'MS'. 'S' is a third action — Save — used when
// Admin just wants the edited invoice fields/attachment persisted without reversing the SES or
// mailing P2P (see history.tsx's own Save button, which calls this without ever touching
// doneActions the way RS/MS do, since a save doesn't complete/hide the row).
export type LogAction = 'RS' | 'MS' | 'S';

export const LOG_ACTION_LABELS: Record<LogAction, string> = {
  RS: 'Reverse SES',
  MS: 'Mail for P2P',
  S: 'Save Invoice Details',
};

function toLogActionItem(row: ProvisionLogRow, action: LogAction, overrides?: InvoiceEditOverrides) {
  const invoiceNo = overrides?.invoiceNo ?? row.invoiceNo;
  const invoiceDate = overrides?.invoiceDate ?? row.invoiceDate;
  const invoiceAmount = overrides?.invoiceAmount ?? row.invoiceAmount;
  const hasAttachment = !!overrides?.attachmentBase64;
  return {
    Lifnr: row.vendor,
    Ebeln: row.poNumber,
    Ebelp: row.poItemNo,
    Matnr: row.materialCode,
    Maktx: row.materialDesc,
    Txz01: row.serviceText,
    Name1: row.vendorName,
    Zaction: action,
    RevisedDelDate: row.revisedDeliveryDate ? toODataDate(row.revisedDeliveryDate) : null,
    Eindt: row.deliveryDate ? toODataDate(row.deliveryDate) : null,
    Waers: row.currency,
    Brtwr: row.provisionValue,
    ZzinvNo: invoiceNo,
    ZinvDate: invoiceDate ? toODataDate(invoiceDate) : null,
    ZzinvAmt: invoiceAmount,
    Comments: row.remarks,
    // Delivery was already confirmed well before this row ever reached 'AS' (SES Created) — same
    // posture as toApprovalItem's own hardcoded 'Y' for Pending Approval decisions.
    DelvConf: 'Y',
    Value: hasAttachment ? overrides!.attachmentBase64 : null,
    Mimetype: hasAttachment ? 'PDF' : null,
    Filename: hasAttachment && overrides?.attachmentName ? overrides.attachmentName.slice(0, 90) : null,
  };
}

/** One Submission History row (already 'AS'/SES Created), reversed or mailed to P2P by the
 * signed-in user — same ZProvHeaderSet POST/header-key-trio shape as submitApprovalDecision.
 * `row.entrySheetNo` (Lblni) is NOT yet confirmed live on ZProvisionLogSet — see ProvisionLogRow's
 * header comment; if this 404s/silently no-ops, that's the first thing to check. `overrides` lets
 * Admin's own edited Invoice Number/Date/Amount + attachment (filled in before Mail for P2P, see
 * history.tsx) ride along on this same POST. */
export async function submitLogAction(
  row: ProvisionLogRow,
  email: string,
  action: LogAction,
  overrides?: InvoiceEditOverrides
): Promise<void> {
  const payload = {
    Lifnr: row.vendor,
    Email: email,
    Ebeln: row.poNumber,
    Ebelp: row.poItemNo,
    Lblni: row.entrySheetNo,
    ToProvItems: [toLogActionItem(row, action, overrides)],
  };
  try {
    const result = await sapClient.post(`/${PROV_HEADER_ENTITY_SET}`, omitNulls(payload));
    const body = result.data?.d || result.data;
    if (body?.Type === 'E') {
      throw new Error(body.Message || 'SAP rejected this submission.');
    }
  } catch (err: any) {
    const sapMessage = err?.response?.data?.error?.message?.value;
    const fallback = action === 'RS'
      ? 'Could not reverse this SES.'
      : action === 'MS'
        ? 'Could not send mail to P2P.'
        : 'Could not save the invoice details.';
    throw new Error(sapMessage || (err instanceof Error ? err.message : fallback));
  }
}

/** Mass "Mail for P2P" (or Reverse SES/Save) — same vendor-grouped batching convention as
 * submitProvisionApprovalBatch/submitApprovalDecisionBatch: one ZProvHeader POST per vendor
 * (Lifnr), since the header requires one representative Ebeln/Ebelp/Lblni trio, with every
 * selected row for that vendor riding along as its own ToProvItems entry. Runs sequentially (not
 * Promise.all) so one vendor's failure can't leave a partial, hard-to-diagnose mix of concurrent
 * SAP writes; returns which vendor groups failed instead of throwing on the first one, same
 * per-vendor result shape as those siblings. */
export async function submitLogActionBatch(
  rows: ProvisionLogRow[],
  email: string,
  action: LogAction,
  overridesByKey?: Record<string, InvoiceEditOverrides>
): Promise<{ lifnr: string; error: string }[]> {
  const groups = new Map<string, ProvisionLogRow[]>();
  rows.forEach((r) => {
    const key = r.vendor || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });

  const failures: { lifnr: string; error: string }[] = [];
  for (const [lifnr, group] of groups) {
    const first = group[0];
    const payload = {
      Lifnr: first.vendor,
      Email: email,
      Ebeln: first.poNumber,
      Ebelp: first.poItemNo,
      Lblni: first.entrySheetNo,
      ToProvItems: group.map((r) => toLogActionItem(r, action, overridesByKey?.[r.key])),
    };
    try {
      const result = await sapClient.post(`/${PROV_HEADER_ENTITY_SET}`, omitNulls(payload));
      const body = result.data?.d || result.data;
      if (body?.Type === 'E') {
        throw new Error(body.Message || 'SAP rejected this submission.');
      }
    } catch (err: any) {
      const sapMessage = err?.response?.data?.error?.message?.value;
      failures.push({
        lifnr,
        error: sapMessage || (err instanceof Error ? err.message : 'Could not send mail to P2P.'),
      });
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------------------------
// Service PO bulk upload — Admin PO Creation tab's "Service PO Bulk Upload" section. Unlike the
// rest of this file (and unlike the sibling client-side PO-creation simulator in
// poCreationSimulator.ts), this is a REAL SAP call: a single POST to the deep entity
// ZSrvPOUploadSet, whose response carries the full per-row result — there is no separate GET.
// ---------------------------------------------------------------------------------------------

/** d.Status — 'S' every row posted, 'P' partial (some posted, some failed), 'E' nothing posted
 * (parse failure, or every row rejected — ToUploadItems.results is empty in that case). */
export type PoUploadStatus = 'S' | 'P' | 'E';

/** Per-row Type — 'S' posted, 'E' failed. */
export type PoUploadRowType = 'S' | 'E';

/** One row of ToUploadItems.results. Menge/GrPrice arrive as STRINGS (parseFloat before any
 * arithmetic or formatting); Ebeln/Ebelp are empty strings on a failed row.
 *
 * name1/ekgrp/ekorg/waers/orderid were added for the ALV-style report (per instruction,
 * 2026-09-15) — none of these were part of the originally-specified ToUploadItems.results shape,
 * so they're an assumption the backend now also returns them. Every field name here follows the
 * same "first letter capitalized, rest lowercase" wire casing already confirmed for every other
 * field (Grprice, Sakto, Kostl, Ebeln, Ebelp, Txz01, Menge, Lifnr — see grPrice's own note above)
 * and independently cross-checked against the real upload template's own column headers
 * (EKGRP/EKORG/WAERS/ORDERID all present there) — high confidence, but unverified against a live
 * response; if any of these render blank, that's the tell the real field name differs. */
export interface PoUploadResultRow {
  rowno: number; // Rowno — Excel row number, header counted as row 1, so the first data row is 2
  lifnr: string; // Lifnr — vendor code, zero-padded
  name1: string; // Name1 — vendor name
  bukrs: string; // Bukrs — company code
  poId: number; // PoId — this row's group id within the upload, not a PO number
  txz01: string; // Txz01 — line text
  ekgrp: string; // Ekgrp — purchase group
  ekorg: string; // Ekorg — purchase organization
  menge: string; // Menge — quantity, STRING
  grPrice: string; // wire field is "Grprice" (not "GrPrice" as originally specified) — price, STRING
  waers: string; // Waers — currency
  werks: string; // Werks — plant
  sakto: string; // Sakto — GL account, zero-padded
  kostl: string; // Kostl — cost center, zero-padded
  orderid: string; // Orderid — internal order
  ebeln: string; // Ebeln — PO number, empty when the row failed
  ebelp: string; // Ebelp — PO item, e.g. "00010", empty when the row failed
  type: PoUploadRowType;
  message: string; // SAP message, verbatim — show unmodified, do not truncate
}

export interface PoUploadResult {
  guid: string;
  status: PoUploadStatus;
  message: string;
  totalRows: number;
  successCnt: number;
  errorCnt: number;
  rows: PoUploadResultRow[]; // empty when Status === 'E' from a parse failure
}

/** Distinguishes the three upload failure modes the Service PO Bulk Upload section must show
 * differently: a timed-out request (never retry automatically — the backend may have already
 * created POs), a network failure (safe to retry), and a real SAP/Gateway error body (safe to
 * retry). */
export class PoUploadError extends Error {
  kind: 'timeout' | 'network' | 'sap';
  constructor(kind: PoUploadError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

const SERVICE_PO_UPLOAD_ENTITY_SET = 'ZSrvPOUploadSet';
const SERVICE_PO_UPLOAD_MIMETYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** SAP RAW16/CHAR32 wants 32 uppercase hex characters, no dashes. `crypto.randomUUID()` isn't
 * reliably available on native RN/Hermes (no Web Crypto global without an extra polyfill package,
 * which isn't installed here), so this builds the same shape from Math.random — fine for a
 * client-generated dedup key with no cryptographic requirement. Called fresh inside
 * uploadServicePoFile for every attempt, including a manual retry, since Guid is the backend's
 * dedup key for one upload. */
function generatePoUploadGuid(): string {
  let hex = '';
  for (let i = 0; i < 32; i += 1) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex.toUpperCase();
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Manual byte-array -> base64 encoder. expo-file-system isn't installed in this app (so there's
 * no readAsStringAsync helper) and RN doesn't reliably expose a global btoa, so this works
 * directly off the ArrayBuffer already returned by fetch(uri).arrayBuffer() — the same read
 * parseExcelFile uses in poCreationSimulator.ts. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    const hasB2 = i + 1 < bytes.length;
    const hasB3 = i + 2 < bytes.length;
    chunks.push(BASE64_CHARS[b1 >> 2]);
    chunks.push(BASE64_CHARS[((b1 & 0x03) << 4) | (hasB2 ? b2 >> 4 : 0)]);
    chunks.push(hasB2 ? BASE64_CHARS[((b2 & 0x0f) << 2) | (hasB3 ? b3 >> 6 : 0)] : '=');
    chunks.push(hasB3 ? BASE64_CHARS[b3 & 0x3f] : '=');
  }
  return chunks.join('');
}

function toPoUploadRow(raw: Record<string, any>): PoUploadResultRow {
  const str = (v: unknown) => (v != null ? String(v) : '');
  return {
    rowno: Number(raw.Rowno ?? 0),
    lifnr: str(raw.Lifnr),
    name1: str(raw.Name1),
    bukrs: str(raw.Bukrs),
    poId: Number(raw.PoId ?? 0),
    txz01: str(raw.Txz01),
    ekgrp: str(raw.Ekgrp),
    ekorg: str(raw.Ekorg),
    menge: str(raw.Menge),
    // The backend contract as originally specified calls this field "GrPrice", but the live SAP
    // response actually sends "Grprice" (only the leading G capitalized) — confirmed 2026-09-15
    // after Amount showed blank while Qty (Menge, which does match) worked fine. JS property
    // access is case-sensitive, so this must match the real wire field, not the written spec.
    grPrice: str(raw.Grprice),
    waers: str(raw.Waers),
    werks: str(raw.Werks),
    sakto: str(raw.Sakto),
    kostl: str(raw.Kostl),
    orderid: str(raw.Orderid),
    ebeln: str(raw.Ebeln),
    ebelp: str(raw.Ebelp),
    type: raw.Type === 'S' ? 'S' : 'E',
    message: str(raw.Message),
  };
}

/** Bulk Service-PO upload — a single POST to the deep entity ZSrvPOUploadSet; there is no
 * separate GET, the POST response itself carries the full per-row result (see PoUploadResult).
 *
 * Assumes ZSrvPOUploadSet lives on this same ZMM_PO_FOLLOWUP_SRV service — the backend contract
 * for this feature only names the entity set, not a service host, and this is the only SAP
 * service this app talks to. Confirm with SAP Basis; if it's actually a different service, only
 * SAP_BASE_URL above needs to change for this call.
 *
 * `uri` is the file picked via expo-document-picker (see po-creation.tsx) — read with
 * fetch(uri).arrayBuffer(), same as parseExcelFile in poCreationSimulator.ts, then base64 encoded
 * here since the backend wants plain base64, no data-URI prefix, no wrapping.
 *
 * Timeout is 120s: the backend calls BAPI_PO_CREATE1 once per PO group and can legitimately take
 * a minute on a large file. Never retry automatically on a timeout — the backend may have already
 * created POs, and a second attempt would create duplicates (see PoUploadError). */
export async function uploadServicePoFile(
  email: string,
  filename: string,
  uri: string,
  onProgress?: (pct: number) => void
): Promise<PoUploadResult> {
  const fileRes = await fetch(uri);
  const buffer = await fileRes.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  const payload = {
    Guid: generatePoUploadGuid(),
    Email: email,
    Filename: filename,
    Mimetype: SERVICE_PO_UPLOAD_MIMETYPE,
    Value: base64,
    ToUploadItems: [],
  };

  let data: any;
  try {
    const res = await sapClient.post(`/${SERVICE_PO_UPLOAD_ENTITY_SET}`, payload, {
      params: { '$format': 'json' },
      timeout: 120000,
      onUploadProgress: (evt: any) => {
        if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
      },
    });
    data = res.data;
  } catch (err: any) {
    if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '')) {
      throw new PoUploadError(
        'timeout',
        'The upload is taking longer than expected. Check whether the POs were created before retrying.'
      );
    }
    if (!err?.response) {
      throw new PoUploadError('network', 'Network error — could not reach the server. Check your connection and try again.');
    }
    const sapMessage = err?.response?.data?.error?.message?.value;
    throw new PoUploadError('sap', sapMessage || (err instanceof Error ? err.message : 'Upload failed.'));
  }

  const body = data?.d;
  const results = body?.ToUploadItems?.results;
  return {
    guid: body?.Guid != null ? String(body.Guid) : '',
    status: body?.Status === 'S' || body?.Status === 'P' ? body.Status : 'E',
    message: body?.Message != null ? String(body.Message) : '',
    totalRows: Number(body?.TotalRows ?? 0),
    successCnt: Number(body?.SuccessCnt ?? 0),
    errorCnt: Number(body?.ErrorCnt ?? 0),
    rows: Array.isArray(results) ? results.map(toPoUploadRow) : [],
  };
}

// ---------------------------------------------------------------------------------------------
// PO Header Quotation Attachment — a single flat POST to ZPOAttachmentSet once a Service PO already
// exists (see the Service PO Bulk Upload result view in po-creation.tsx), attaching a quotation
// document at the PO header level. Per instruction: Ebeln, QuotFilename, QuotMimetype, QuotValue,
// Description — no deep/nested items, unlike ZSrvPOUploadSet above.
// ---------------------------------------------------------------------------------------------

const PO_ATTACHMENT_ENTITY_SET = 'ZPOAttachmentSet';

/** Posts a quotation attachment against an already-created PO's header. `base64Value` should
 * already be under the same body-size ceiling every other attachment on this SAP service is held
 * to (see pdfAttachment.ts's MAX_ATTACHMENT_BYTES/ensureAttachmentUnderLimit) — this call doesn't
 * re-check it, the caller is expected to have compressed/validated first. */
export async function submitPoAttachment(
  ebeln: string,
  quotFilename: string,
  quotMimetype: string,
  quotValue: string,
  description: string
): Promise<void> {
  const payload = {
    Ebeln: ebeln,
    QuotFilename: quotFilename,
    QuotMimetype: quotMimetype,
    QuotValue: quotValue,
    Description: description,
  };
  try {
    const res = await sapClient.post(`/${PO_ATTACHMENT_ENTITY_SET}`, payload);
    const body = res.data?.d || res.data;
    if (body?.Type === 'E') {
      throw new Error(body.Message || 'SAP rejected this attachment.');
    }
  } catch (err: any) {
    const sapMessage = err?.response?.data?.error?.message?.value;
    throw new Error(sapMessage || (err instanceof Error ? err.message : 'Could not save this attachment.'));
  }
}

/** One PO header's quotation, as SAP actually returns it — filename, mimetype and the raw base64
 * document content (`Value`), same field names ZPOAttachmentSet was posted with. */
export interface PoAttachment {
  filename: string;
  mimetype: string;
  value: string;
}

/** Reads back the quotation attached to a PO's header — a keyed GetEntity read
 * (`ZPOAttachmentSet(Ebeln='...')`), per instruction, mirroring the same keyed-GetEntity pattern
 * PO Deviation Approval's own printform fetch already uses successfully against this SAP
 * landscape (see embedded-apps/fm-po-deviation/src/lib/sapClient.ts's fetchPrintformPdf). Returns
 * null when the PO genuinely has no quotation on file yet (404 on the keyed read) — every apps
 * "View Quotation" button is expected to treat that as "nothing to show" rather than an error. */
export async function fetchPoAttachment(ebeln: string): Promise<PoAttachment | null> {
  const key = ebeln.replace(/'/g, "''"); // OData string literals escape a single quote by doubling it
  try {
    const res = await sapClient.get(`/${PO_ATTACHMENT_ENTITY_SET}(Ebeln='${key}')`, {
      params: { '$format': 'json' },
    });
    const entity = res.data?.d;
    const value = entity?.QuotValue;
    if (!value) return null;
    return {
      filename: entity?.QuotFilename ? String(entity.QuotFilename) : `Quotation_${ebeln}`,
      mimetype: entity?.QuotMimetype ? String(entity.QuotMimetype) : 'application/pdf',
      value: String(value),
    };
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    const sapMessage = err?.response?.data?.error?.message?.value;
    throw new Error(sapMessage || (err instanceof Error ? err.message : 'Could not load this quotation.'));
  }
}

// ---------------------------------------------------------------------------------------------
// SES supporting documents — ZSESPDFUploadSet, a deep create: one POST per Service Entry Sheet with
// every chosen PDF in its file list (spec from the SAP team, 26.10.2026):
//   request  { Guid (client UUID), Lblni (SES number, 10 chars, leading zeros), Email,
//              ToFiles: [ { Filename, Value (base64 PDF) } ] }
//   response { Guid, Lblni, Status S|P|E, Message, Totalrows, Successcnt, Errorcnt,
//              ToFiles: [ { Filename, Status S|E, Message } ] }
//   overall Status: S = all attached, P = some, E = none; per file S = attached, E = failed (reason).
// Checked on NGD the same day: the header properties exist exactly so (OData names: Guid, Lblni,
// Email, Status, Message, Totalrows, Successcnt, Errorcnt), but the file list (TOFILES) was not in the
// model yet under any casing - the navigation names below are tried in order until SAP accepts one.
// ---------------------------------------------------------------------------------------------

const SES_DOC_ENTITY_SET = 'ZSESPDFUploadSet';
const SES_DOC_NAV_CANDIDATES = ['ToFiles', 'TOFILES', 'Tofiles'];

export interface SesSupportingDoc { name: string; base64: string; mimeType: string }
export interface SesDocResult { name: string; ok: boolean; error?: string }
export interface SesDocSummary { status: 'S' | 'P' | 'E' | ''; message: string; files: SesDocResult[] }

function sapErrorText(err: any, fallback: string): string {
  return err?.response?.data?.error?.message?.value || (err instanceof Error ? err.message : fallback);
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** 'SES number, 10 characters, left-padded with zeros'. */
export const padLblni = (v: string) => String(v ?? '').trim().padStart(10, '0');

/** Attaches the PDFs to the row's Service Entry Sheet. Files go in as few deep creates as possible, each request kept
 * within the same 70 KB a single attachment on this service is held to (SAP's request-size ceiling), and the answers
 * are merged: overall S when every file attached, E when none did, P otherwise. */
export async function submitSesSupportingDocs(
  row: Pick<ProvisionLogRow, 'entrySheetNo'>,
  email: string,
  docs: SesSupportingDoc[]
): Promise<SesDocSummary> {
  const LIMIT = 70 * 1024;
  const bytes = (d: SesSupportingDoc) => Math.floor(d.base64.length * 3 / 4);
  const batches: SesSupportingDoc[][] = [];
  for (const d of docs) {
    const last = batches[batches.length - 1];
    if (last && last.reduce((a, x) => a + bytes(x), 0) + bytes(d) <= LIMIT) last.push(d); else batches.push([d]);
  }
  const parts: SesDocSummary[] = [];
  for (const b of batches) parts.push(await submitSesDocBatch(row, email, b));
  if (parts.length === 1) return parts[0];
  const files = parts.flatMap((p) => p.files);
  const okCount = files.filter((f) => f.ok).length;
  const status: SesDocSummary['status'] = okCount === files.length ? 'S' : okCount === 0 ? 'E' : 'P';
  return { status, message: parts.map((p) => p.message).filter(Boolean).join(' · '), files };
}

/** One deep create with these files. Never throws: a failed call comes back as status 'E' with every file marked
 * failed and the reason, so the pop-up can always say what happened. */
async function submitSesDocBatch(
  row: Pick<ProvisionLogRow, 'entrySheetNo'>,
  email: string,
  docs: SesSupportingDoc[]
): Promise<SesDocSummary> {
  const header = { Guid: uuid(), Lblni: padLblni(row.entrySheetNo), Email: email };
  const files = docs.map((d) => ({ Filename: d.name, Value: d.base64 }));
  const allFailed = (error: string): SesDocSummary => ({ status: 'E', message: error, files: docs.map((d) => ({ name: d.name, ok: false, error })) });
  let lastError = '';
  for (const nav of SES_DOC_NAV_CANDIDATES) {
    try {
      const res = await sapClient.post(`/${SES_DOC_ENTITY_SET}`, { ...header, [nav]: files });
      const body = res.data?.d || res.data || {};
      const back: any[] = body?.[nav]?.results ?? body?.[nav] ?? [];
      const status = String(body.Status || '').toUpperCase() as SesDocSummary['status'];
      const byName = new Map(back.map((f) => [String(f.Filename ?? ''), f]));
      const results = docs.map((d) => {
        const f = byName.get(d.name);
        if (f) return { name: d.name, ok: String(f.Status).toUpperCase() === 'S', error: String(f.Status).toUpperCase() === 'S' ? undefined : String(f.Message || 'Not attached.') };
        // No per-file answer: fall back on the overall status.
        return { name: d.name, ok: status === 'S', error: status === 'S' ? undefined : String(body.Message || 'Not attached.') };
      });
      return { status, message: String(body.Message || ''), files: results };
    } catch (err: any) {
      const text = sapErrorText(err, 'Could not attach the documents.');
      lastError = text;
      // This casing of the file list is not in SAP's model: try the next one.
      if (new RegExp(`Property '?${nav}'? is invalid`, 'i').test(text)) continue;
      if (/Resource not found for the segment/i.test(text)) return allFailed(`SAP does not offer ${SES_DOC_ENTITY_SET} on this system yet.`);
      if (/CREATE_(DEEP_)?ENTITY' not implemented/i.test(text)) return allFailed(`SAP has not built the save for ${SES_DOC_ENTITY_SET} yet (${/CREATE_DEEP_ENTITY/i.test(text) ? 'CREATE_DEEP_ENTITY' : 'CREATE_ENTITY'} is not implemented).`);
      return allFailed(text);
    }
  }
  return allFailed(/is invalid/i.test(lastError)
    ? `SAP's ${SES_DOC_ENTITY_SET} has no file list (TOFILES) yet - the SAP team needs to add that navigation property.`
    : lastError);
}
