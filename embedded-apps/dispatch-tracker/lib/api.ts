/**
 * Thin client for direct communication with SAP OData and Microsoft OAuth.
 * Bypasses any Node.js proxy to connect directly from the frontend.
 */
import * as storage from '@/lib/storage';
import {
  CancelledInvoice,
  CompletedInvoice,
  DispatchDetail,
  Invoice,
  PendingInvoice,
  ReturnedInvoice,
} from '@/types/models';
import { normalizeInvoice } from './sapMapping';

const TOKEN_KEY = 'dis_session_token';

// SAP system base URLs — NWP is the active one. NGD/NGQ are kept here, commented
// out, for quick switching if needed.
const API_BASE_NWP = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NWP/ZIT_DISP_INTL_ANALYTICS_SRV';
// const API_BASE_NGQ = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGQ/ZIT_DISP_INTL_ANALYTICS_SRV';
// const API_BASE_NGD = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZIT_DISP_INTL_ANALYTICS_SRV';

export const API_BASE_URL = API_BASE_NWP;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function getToken(): Promise<string | null> {
  return storage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await storage.setItem(TOKEN_KEY, token);
  else await storage.deleteItem(TOKEN_KEY);
}

// Format Date for SAP
const formatSAPDate = (dateStr?: string | null): string | null => {
  if (!dateStr) return null;
  return `\\/Date(${new Date(dateStr).getTime()})\\/`;
};

// Generic API Request (For GETs mostly, not for POST Actions that need CSRF)
async function requestSap<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined)
  };

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

    const bodyText = await res.text();
    let body: any = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { }

    if (!res.ok) {
      let errMessage = 'Request failed';
      if (body?.error?.message?.value) errMessage = body.error.message.value;
      throw new ApiError(errMessage, res.status);
    }

    return body as T;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Cannot reach the SAP API. Check your network connection.', 0);
  }
}

// -------------------------------------------------------------------------
// Invoice status caches
// -------------------------------------------------------------------------

/** The one shared From Date / To Date, set via the Depot Panel's filter row (see TopBar) — sent
 *  as SAP OData $filter properties (FrmDate/ToDate) on every one of the five invoice entity
 *  sets, alongside the existing Email filter. */
export interface InvoiceListFilter {
  frmDate?: string;
  toDate?: string;
}

/** FrmDate/ToDate are Edm.DateTime on the SAP side — a plain quoted string ('2026-08-10')
 *  gets rejected with "Invalid parametertype used at function 'eq'" (verified live against
 *  NGD). OData v2's datetime literal (unquoted, datetime'...' prefix) is what SAP expects. */
function sapDateTimeLiteral(isoDateStr: string): string {
  return `datetime'${isoDateStr}T00:00:00'`;
}

async function fetchInvoicesRaw(entitySet: string, email: string, filter: InvoiceListFilter = {}): Promise<Invoice[]> {
  const parts = [`Email eq '${email}'`];
  if (filter.frmDate) parts.push(`FrmDate eq ${sapDateTimeLiteral(filter.frmDate)}`);
  if (filter.toDate) parts.push(`ToDate eq ${sapDateTimeLiteral(filter.toDate)}`);
  const res: any = await requestSap(`/${entitySet}?$filter=${parts.join(' and ')}&$format=json`);
  const results = res.d?.results || [];
  return results.map(normalizeInvoice);
}

/**
 * Primes SAP's backend custom tables (Pending/Dispatched/Completed/Returned/Cancelled) with live
 * data for this Email + Fiscal Year + date range. Per the backend's design, InvoicePendSet/
 * InvoiceDispSet/etc. only read whatever is already sitting in those tables — LoginSet is what
 * actually pulls live SAP data into them for this Email/FiscalYear/FrmDate/ToDate. Non-fatal: a
 * failure here shouldn't block reading whatever's already in the tables.
 *
 * What actually dispatches this POST to CREATE_DEEP_ENTITY (not the auto-generated
 * LOGINSET_CREATE_ENTITY stub) is a genuine deep-insert body — the NAV_LoginToDepot/
 * NAV_LoginToInv navigation properties present in the payload itself, not $expand (that's a
 * read-time option, for GET_EXPANDED_ENTITYSET). Confirmed working with this exact shape via SAP
 * Gateway Client, called directly against SAP.
 *
 * KNOWN RISK: this same shape, sent through the Azure middleware this app actually calls through
 * (as opposed to direct-to-SAP), has hung indefinitely in testing — SAP itself handles it fine,
 * so the suspected fault is in that middleware's relay of array-valued JSON properties, not here.
 */
async function callLoginSet(email: string, filter: InvoiceListFilter): Promise<void> {
  if (!filter.frmDate || !filter.toDate) return;
  // No user-facing Fiscal Year field anymore — derived from To Date's year, since LoginSet's
  // payload still needs one.
  const fiscalYear = String(new Date(filter.toDate).getFullYear());
  const body = {
    Email: email,
    FiscalYear: fiscalYear,
    FrmDate: formatSAPDate(filter.frmDate),
    ToDate: formatSAPDate(filter.toDate),
    NAV_LoginToDepot: [],
    NAV_LoginToInv: [],
  };
  await fetch(`${API_BASE_URL}/LoginSet?$format=json`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function refreshInvoices(filter: InvoiceListFilter = {}): Promise<Invoice[]> {
  const email = await getToken();
  if (!email) throw new ApiError("Not logged in", 401);

  await callLoginSet(email, filter).catch(() => {});

  const [pend, disp, comp, ret, canc] = await Promise.all([
    fetchInvoicesRaw("InvoicePendSet", email, filter).catch(() => []),
    fetchInvoicesRaw("InvoiceDispSet", email, filter).catch(() => []),
    fetchInvoicesRaw("InvoiceCompSet", email, filter).catch(() => []),
    fetchInvoicesRaw("InvoiceRetSet", email, filter).catch(() => []),
    fetchInvoicesRaw("InvoiceCanSet", email, filter).catch(() => [])
  ]);

  const mapStatus = (arr: Invoice[], status: string) => arr.map(i => ({ ...i, status }));

  return [
    ...mapStatus(pend, 'Pending'),
    ...mapStatus(disp, 'Dispatched'),
    ...mapStatus(comp, 'Completed'),
    ...mapStatus(ret, 'Returned'),
    ...mapStatus(canc, 'Cancelled')
  ];
}

export const getPending = () => refreshInvoices().then(i => i.filter(x => x.status === 'Pending') as unknown as PendingInvoice[]);
export const getDispatched = () => refreshInvoices().then(i => i.filter(x => x.status === 'Dispatched') as unknown as DispatchDetail[]);
export const getCompleted = () => refreshInvoices().then(i => i.filter(x => x.status === 'Completed') as unknown as CompletedInvoice[]);
export const getReturned = () => refreshInvoices().then(i => i.filter(x => x.status === 'Returned') as unknown as ReturnedInvoice[]);
export const getCancelled = () => refreshInvoices().then(i => i.filter(x => x.status === 'Cancelled') as unknown as CancelledInvoice[]);

// -------------------------------------------------------------------------
// Actions (depot role only)
// -------------------------------------------------------------------------

async function postSapAction(entitySet: string, payload: any): Promise<{ ok: true }> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const res = await fetch(`${API_BASE_URL}/${entitySet}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const bodyText = await res.text();
    let errMessage = `Request failed (HTTP ${res.status})`;
    try {
      const body = JSON.parse(bodyText);
      if (body?.error?.message?.value) errMessage = body.error.message.value;
    } catch { }
    throw new ApiError(errMessage, res.status);
  }
  return { ok: true };
}

export interface DispatchPayload { invoice_no: string; werks: string; row_data: object; dispatch_date: string; edd: string | null; lr_no: string; vehicle_no: string; vehicle_type: string; transporter: string; cases: number; }
export const postDispatch = (body: DispatchPayload) => postSapAction('InvoiceDispSet', {
  Vbeln: body.invoice_no,
  Werks: body.werks,
  DispatchDate: formatSAPDate(body.dispatch_date),
  // Carries the invoice's original EDD through to InvoiceDispSet's CREATE_ENTITY — without
  // it, SAP's backend was recalculating EDD off the dispatch date instead of keeping the one
  // set at invoice creation.
  Edd: formatSAPDate(body.edd),
  LrNo: body.lr_no,
  VehicleNo: body.vehicle_no,
  VehicleType: body.vehicle_type,
  Transporter: body.transporter,
  Fkimg: body.cases ? body.cases.toString() : ""
});

export interface CompletePayload { invoice_no: string; werks: string; row_data: object; actual_delivery_date: string; }
export const postComplete = (body: CompletePayload) => postSapAction('InvoiceCompSet', {
  Vbeln: body.invoice_no,
  Werks: body.werks,
  ActDelDate: formatSAPDate(body.actual_delivery_date)
});

export interface ReturnPayload { invoice_no: string; werks: string; row_data: object; receiving_date: string; cancel_reason: string; }
export const postReturn = (body: ReturnPayload) => postSapAction('InvoiceRetSet', {
  Vbeln: body.invoice_no,
  Werks: body.werks,
  RecDate: formatSAPDate(body.receiving_date),
  CanRsn: body.cancel_reason
});

export interface CancelPayload { invoice_no: string; werks: string; row_data: object; cancel_date: string; cancel_reason: string; }
export const postCancel = (body: CancelPayload) => postSapAction('InvoiceCanSet', {
  Vbeln: body.invoice_no,
  Werks: body.werks,
  CanDate: formatSAPDate(body.cancel_date),
  CanRsn: body.cancel_reason
});

// -------------------------------------------------------------------------
// Lookups
// -------------------------------------------------------------------------

export const getTransporters = async (routeCode: string): Promise<string[]> => {
  const res: any = await requestSap(`/TransportSet?$filter=Route eq '${encodeURIComponent(routeCode)}'&$format=json`);
  const results = res.d?.results || [];
  return results.map((r: any) => (r.Transporter || '').trim()).filter(Boolean);
};

export const getRetVal = async (creditNote: string): Promise<string> => {
  const res: any = await requestSap(`/CreditSet('${encodeURIComponent(creditNote)}')?$format=json`);
  return res.d?.RetVal || '';
};
