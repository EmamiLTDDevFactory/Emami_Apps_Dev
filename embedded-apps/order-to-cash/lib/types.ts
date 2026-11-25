// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Tone = 'info' | 'success' | 'error';
export interface StatusMessage { id: number; at: string; text: string; tone: Tone }

export type PoStatus = 'captured' | 'exceptions' | 'ready' | 'creating' | 'so_created' | 'so_unknown' | 'rejected';
export type Source = 'pdf' | 'excel' | 'image' | 'email' | 'manual';

export interface PoHeader {
  CUSTOMER_NAME: string;
  NAME1?: string;
  KUNNR: string;
  KUNWE?: string;
  BSTKD: string;
  PO_DATE: string;
  DELIVERY_DATE: string;
  SHIP_TO: string;
  GSTIN: string;
  CURRENCY: string;
  VKORG: string;
  VTWEG: string;
  SPART: string;
  AUART: string;
  TOTAL: number | null;
  PRICE_FROM_PO?: boolean;
  OVERRIDE?: string[];
  EXCEPTIONS?: string[];
  EXISTING_SO?: string;
}

export interface Amendment { field: 'QTY' | 'PRICE'; from: number; to: number; reason: string }

export interface PoLine {
  LINE: number;
  CUST_MAT: string;
  EAN: string;
  DESCRIPTION: string;
  QTY: number | null;
  UOM: string;
  PRICE: number | null;
  MRP: number | null;
  AMOUNT: number | null;
  MATNR: string;
  MAKTX?: string;
  MAPPED_BY?: string;
  READ_FLAGS?: string[];
  DROPPED?: boolean;
  OVERRIDE?: string[];
  AMENDED?: Amendment[];
  EXCEPTIONS?: string[];
  SAP_PRICE?: number | null;
  ATP_QTY?: number | null;
  SAP_MESSAGE?: string;
}

export interface Po {
  id: number;
  status: PoStatus;
  source: Source;
  fileName: string;
  header: PoHeader;
  lines?: PoLine[];
  lineCount?: number;
  warnings: string[];
  amendments: { LINE: number; MATNR: string; DESCRIPTION: string; PO_PRICE: number; SAP_PRICE: number; DIFF_PCT: number | null }[];
  openExceptions: number;
  touched: boolean;
  soNumber: string | null;
  soResult: SoResult | { error: string } | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  validatedAt: string | null;
}

export interface SapMessage { TYPE: string; MESSAGE: string; ID?: string; NUMBER?: string }
export interface SoResult { vbeln: string; netValue: number | null; currency: string; messages: SapMessage[]; items: Row[]; testrun: boolean }

export interface Extraction { header: PoHeader; lines: PoLine[]; warnings: string[] }

export type SapRead = 'CUSTOMER_SEARCH' | 'MATERIAL_SEARCH' | 'LIST_ORDERS' | 'LIST_BACKORDERS' | 'LIST_DELIVERIES' | 'DELIVERY_ITEMS' | 'LIST_INVOICES' | 'INVOICE_ITEMS' | 'LIST_OPEN_ITEMS' | 'LIST_DEDUCTIONS' | 'DOC_FLOW';

export interface Dispute {
  id: number;
  ref_type: string;
  ref_no: string;
  kunnr: string;
  name1: string;
  amount: number | null;
  reason: string;
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'written_off';
  owner: string;
  notes: { at: string; by: string; text: string }[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  delivery: string;
  kunnr: string;
  name1: string;
  slot_date: string;
  slot_time: string;
  location: string;
  reference: string;
  status: 'requested' | 'confirmed' | 'rescheduled' | 'missed' | 'done' | 'cancelled';
  note: string;
  updated_by: string;
  updated_at: string;
}

/** Exception texts (same codes as backend/orderToCashCore.js). */
export const EXCEPTION_INFO: Record<string, { blocking: boolean; text: string; short: string }> = {
  CUSTOMER_NOT_FOUND: { blocking: true, short: 'Customer', text: 'Customer not found in SAP for this sales area.' },
  DUPLICATE_PO: { blocking: true, short: 'Duplicate PO', text: 'A sales order already exists for this customer PO number.' },
  CREDIT_BLOCK: { blocking: false, short: 'Credit', text: 'Customer is over the credit limit; the order will be credit blocked in SAP.' },
  PO_EXPIRED: { blocking: false, short: 'PO expired', text: 'The PO delivery / expiry date has passed.' },
  MATERIAL_NOT_FOUND: { blocking: true, short: 'No material', text: 'No SAP material for this customer article / EAN. Pick the material.' },
  MATERIAL_BLOCKED: { blocking: true, short: 'Blocked', text: 'Material is blocked for sales.' },
  NOT_LISTED: { blocking: true, short: 'Not listed', text: 'Material is not extended to this sales area.' },
  QTY_UNREAD: { blocking: true, short: 'No qty', text: 'Quantity missing or zero.' },
  AMOUNT_CHECK: { blocking: false, short: 'Amount', text: 'Line amount is not quantity x price on the PO; check the reading.' },
  PRICE_MISMATCH: { blocking: false, short: 'Price', text: 'PO price differs from the SAP price beyond tolerance.' },
  CASE_LOT: { blocking: false, short: 'Case lot', text: 'Quantity is not a multiple of the case lot.' },
  STOCK_SHORT: { blocking: false, short: 'Stock', text: 'Available stock is below the ordered quantity; the rest becomes a back order.' },
  MRP_MISMATCH: { blocking: false, short: 'MRP', text: 'PO MRP differs from the SAP MRP.' },
};

export const STATUS_INFO: Record<PoStatus, { label: string; cls: string }> = {
  captured: { label: 'Captured', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  exceptions: { label: 'Exceptions', cls: 'bg-red-50 text-red-700 ring-red-200' },
  ready: { label: 'Ready', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  creating: { label: 'Creating SO', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  so_created: { label: 'SO created', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  so_unknown: { label: 'Check SAP', cls: 'bg-amber-50 text-amber-800 ring-amber-300' },
  rejected: { label: 'Rejected', cls: 'bg-gray-100 text-gray-500 ring-gray-200' },
};
