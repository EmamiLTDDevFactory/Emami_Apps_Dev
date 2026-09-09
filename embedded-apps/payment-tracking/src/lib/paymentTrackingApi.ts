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
}

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
    revisedDeliveryDate: parseODataDate(raw.RevisedDeldate),
    provisionValue: str(raw.Netwr),
    currency: str(raw.Waers),
    invoiceNo: str(raw.ZzinvNo),
    invoiceDate: parseODataDate(raw.ZinvDate),
    invoiceAmount: str(raw.ZzinvAmt),
    comments: str(raw.Comments),
    status: str(raw.Stat),
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
// naming convention. Dev testing (2026-09-10) found the request 413s (Payload Too Large — some
// gateway in front of this OData service caps the body) when the attachment is sent at full size,
// which is why the caller (upcoming.tsx/admin-upcoming.tsx, via pdfAttachment.ts's
// ensureAttachmentUnderLimit) compresses anything over 70KB before it ever reaches here.
function toProvItem(c: ProvisionConfirmation, email: string) {
  const { row } = c;
  return {
    Lifnr: row.lifnr,
    Email: email,
    Ebeln: row.poNumber,
    Ebelp: row.poItemNo,
    Matnr: row.materialCode,
    Maktx: row.materialDesc,
    Txz01: row.serviceText,
    Name1: row.vendorName,
    Zaction: row.zaction,
    RevisedDelDate: c.delvConf ? null : toODataDate(c.revisedDelDate),
    Eindt: row.deliveryDate ? toODataDate(row.deliveryDate) : null,
    Waers: row.currency,
    Brtwr: row.provisionValue,
    ZzinvNo: c.invoiceNo,
    ZinvDate: c.invoiceDate ? toODataDate(c.invoiceDate) : null,
    ZzinvAmt: c.invoiceAmount,
    DelvConf: c.delvConf ? 'Y' : 'N',
    Value: c.delvConf && c.attachmentBase64 ? c.attachmentBase64 : null,
    Mimetype: c.delvConf && c.attachmentMimeType ? c.attachmentMimeType.slice(0, 100) : null,
    Filename: c.delvConf && c.attachmentName ? c.attachmentName.slice(0, 90) : null,
  };
}

/** Pending Approval (Admin's side-pane tab) — every ZVendorPOFollowupSet row scoped to the signed-
 * in Admin's own login email, no Zaction filter (per instruction: Email only) — the backend is
 * trusted to expand scope to every user's pending items once it sees an Admin email, same posture
 * as fetchProvisionPOs above. */
export async function fetchPendingApprovals(email: string): Promise<VendorPOFollowupRow[]> {
  const params = {
    '$format': 'json',
    '$filter': `Email eq '${email}'`,
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
    const result = await sapClient.post(`/${PROV_HEADER_ENTITY_SET}`, payload);
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
// with Zaction overridden to 'A' (Approve) or 'R' (Reject) instead of echoing the row's original
// Zaction — that field is already how this entity carries a row's state, so an Admin decision is
// just a different Zaction value on the same write. Every other field is echoed back from what the
// GET already returned for that row, same posture as toProvItem above — nothing invented.
export type ApprovalDecision = 'A' | 'R';

function toApprovalItem(row: VendorPOFollowupRow, decision: ApprovalDecision) {
  return {
    Lifnr: row.lifnr,
    Ebeln: row.poNumber,
    Ebelp: row.poItemNo,
    Matnr: row.materialCode,
    Maktx: row.materialDesc,
    Txz01: row.serviceText,
    Name1: row.vendorName,
    Zaction: decision,
    RevisedDelDate: row.revisedDeliveryDate ? toODataDate(row.revisedDeliveryDate) : null,
    Eindt: row.deliveryDate ? toODataDate(row.deliveryDate) : null,
    Waers: row.currency,
    Brtwr: row.provisionValue,
    ZzinvNo: row.invoiceNo,
    ZinvDate: row.invoiceDate ? toODataDate(row.invoiceDate) : null,
    ZzinvAmt: row.invoiceAmount,
    Comments: row.comments,
    DelvConf: 'Y',
  };
}

/** One or more Pending Approval rows, approved or rejected by the signed-in Admin — same
 * ZProvHeaderSet POST as submitProvisionApproval (header's Lifnr/Ebeln/Ebelp/Lblni taken from the
 * FIRST row, same SEGW key-trio requirement), Email always the signed-in Admin's own login email. */
export async function submitApprovalDecision(
  rows: VendorPOFollowupRow[],
  email: string,
  decision: ApprovalDecision
): Promise<void> {
  if (rows.length === 0) return;
  const first = rows[0];
  const payload = {
    Lifnr: first.lifnr,
    Email: email,
    Ebeln: first.poNumber,
    Ebelp: first.poItemNo,
    Lblni: first.entrySheetNo,
    ToProvItems: rows.map((r) => toApprovalItem(r, decision)),
  };
  try {
    const result = await sapClient.post(`/${PROV_HEADER_ENTITY_SET}`, payload);
    const body = result.data?.d || result.data;
    if (body?.Type === 'E') {
      throw new Error(body.Message || 'SAP rejected this submission.');
    }
  } catch (err: any) {
    const sapMessage = err?.response?.data?.error?.message?.value;
    const fallback = decision === 'A' ? 'Could not approve this item.' : 'Could not reject this item.';
    throw new Error(sapMessage || (err instanceof Error ? err.message : fallback));
  }
}

/** Mass approve/reject — groups the selected rows by vendor (Lifnr), one ZProvHeader POST per
 * vendor, run sequentially (not Promise.all), same rationale as submitProvisionApprovalBatch:
 * one vendor's failure can't leave a partial mix of concurrent SAP writes, and the caller gets a
 * per-vendor failure list instead of an all-or-nothing throw. */
export async function submitApprovalDecisionBatch(
  rows: VendorPOFollowupRow[],
  email: string,
  decision: ApprovalDecision
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
      await submitApprovalDecision(group, email, decision);
    } catch (err) {
      const fallback = decision === 'A' ? 'Could not approve this item.' : 'Could not reject this item.';
      failures.push({ lifnr, error: err instanceof Error ? err.message : fallback });
    }
  }
  return failures;
}
