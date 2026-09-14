// Purchase Order Creation and Details (Admin-only tab) — per instruction, this is an explicit
// SIMULATION: there is no confirmed SAP entity on ZMM_PO_FOLLOWUP_SRV (or anywhere else in this
// app) for creating a PO from an Excel upload, so nothing here calls SAP. Admin uploads an Excel
// file, "Fetch" runs a client-side validation pass that sorts rows into success/error (mirroring
// the kind of checks a real PO-creation BAPI would reject on), Admin can edit any row inline, and
// "Save" turns the successful rows into simulated Purchase Orders — grouped one PO per distinct
// vendor+purchase org+plant+currency combination, given a made-up but SAP-shaped PO number
// (46xxxxxxxx, matching this client's own real PO number range seen elsewhere in this app, e.g.
// upcoming.tsx's poNumber values) — kept only in this browser (localStorage), never sent anywhere.
import * as XLSX from 'xlsx';

export interface UploadedPoRow {
  key: string;
  vendorCode: string;
  vendorName: string;
  materialCode: string;
  materialDesc: string;
  quantity: string;
  unitPrice: string;
  currency: string;
  plant: string;
  purchaseOrg: string;
  deliveryDate: string; // 'YYYY-MM-DD'
  costCenter: string;
  glAccount: string;
  status: 'success' | 'error';
  errorMessage: string;
}

export interface CreatedPoItem {
  itemNo: string;
  materialCode: string;
  materialDesc: string;
  quantity: string;
  unitPrice: string;
  netValue: string;
  deliveryDate: string;
  costCenter: string;
  glAccount: string;
}

export interface CreatedPo {
  poNumber: string;
  vendorCode: string;
  vendorName: string;
  purchaseOrg: string;
  plant: string;
  currency: string;
  createdDate: string; // 'YYYY-MM-DD'
  totalValue: number;
  items: CreatedPoItem[];
}

/** Every column header this reads from the uploaded sheet, matched case/space-insensitively, with
 * a few common synonyms per column so a reasonably-named export from another system still parses. */
const HEADER_ALIASES: Record<keyof Omit<UploadedPoRow, 'key' | 'status' | 'errorMessage'>, string[]> = {
  vendorCode: ['vendor code', 'vendor', 'lifnr'],
  vendorName: ['vendor name', 'name1'],
  materialCode: ['material code', 'material', 'matnr'],
  materialDesc: ['material description', 'material desc', 'description', 'maktx'],
  quantity: ['quantity', 'qty', 'menge'],
  unitPrice: ['unit price', 'price', 'rate', 'netpr'],
  currency: ['currency', 'waers'],
  plant: ['plant', 'werks'],
  purchaseOrg: ['purchase org', 'purchasing org', 'purchase organization', 'ekorg'],
  deliveryDate: ['delivery date', 'delivery', 'eindt'],
  costCenter: ['cost center', 'cost centre', 'kostl'],
  glAccount: ['gl account', 'g/l account', 'sakto'],
};

function normalizeHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildHeaderMap(sheetRow: Record<string, any>): Record<string, string> {
  const map: Record<string, string> = {};
  const rawHeaders = Object.keys(sheetRow);
  (Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field];
    const match = rawHeaders.find((h) => aliases.includes(normalizeHeader(h)));
    if (match) map[field] = match;
  });
  return map;
}

function toDateString(value: any): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().split('T')[0];
  }
  const str = String(value).trim();
  if (!str) return '';
  // Excel serial date leaking through as a raw number (sheet_to_json with raw:false usually avoids
  // this, but a locale-formatted cell can still slip through as a plain digit string).
  if (/^\d+$/.test(str) && Number(str) > 20000 && Number(str) < 60000) {
    const epoch = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(Number(str)) : null;
    if (epoch) return `${epoch.y}-${String(epoch.m).padStart(2, '0')}-${String(epoch.d).padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return str;
}

/** Same validation a real PO-creation BAPI would reject on — required master data present, a
 * positive quantity/non-negative price, and a real delivery date. Anything else (Plant/Purchase
 * Org/Cost Center/GL Account) is optional, defaulted blank rather than flagged. */
function validateRow(row: Omit<UploadedPoRow, 'key' | 'status' | 'errorMessage'>): { status: 'success' | 'error'; errorMessage: string } {
  const errors: string[] = [];
  if (!row.vendorCode.trim()) errors.push('Vendor Code is required');
  if (!row.materialCode.trim()) errors.push('Material Code is required');
  const qty = Number(row.quantity);
  if (!row.quantity.trim() || Number.isNaN(qty) || qty <= 0) errors.push('Quantity must be a positive number');
  const price = Number(row.unitPrice);
  if (!row.unitPrice.trim() || Number.isNaN(price) || price < 0) errors.push('Unit Price must be a valid, non-negative number');
  if (!row.deliveryDate) errors.push('Delivery Date is required');
  return errors.length > 0
    ? { status: 'error', errorMessage: errors.join('; ') }
    : { status: 'success', errorMessage: '' };
}

/** Re-runs validateRow after an inline edit — used by po-creation.tsx whenever Admin changes a
 * field, so a fixed row flips from error to success (or vice versa) immediately. */
export function revalidateRow(row: UploadedPoRow): UploadedPoRow {
  const { status, errorMessage } = validateRow(row);
  return { ...row, status, errorMessage };
}

/** Reads a picked .xlsx/.xls file (web `uri` from expo-document-picker) into UploadedPoRow[] —
 * first sheet only, headers matched via HEADER_ALIASES above. Every row gets validated immediately
 * so the caller can render success/error without a second pass. */
export async function parseExcelFile(uri: string): Promise<UploadedPoRow[]> {
  const res = await fetch(uri);
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const json: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (json.length === 0) return [];

  const headerMap = buildHeaderMap(json[0]);
  const str = (v: any) => (v != null ? String(v).trim() : '');

  return json.map((raw, index) => {
    const base = {
      vendorCode: str(raw[headerMap.vendorCode]),
      vendorName: str(raw[headerMap.vendorName]),
      materialCode: str(raw[headerMap.materialCode]),
      materialDesc: str(raw[headerMap.materialDesc]),
      quantity: str(raw[headerMap.quantity]),
      unitPrice: str(raw[headerMap.unitPrice]),
      currency: str(raw[headerMap.currency]) || 'INR',
      plant: str(raw[headerMap.plant]),
      purchaseOrg: str(raw[headerMap.purchaseOrg]),
      deliveryDate: toDateString(raw[headerMap.deliveryDate]),
      costCenter: str(raw[headerMap.costCenter]),
      glAccount: str(raw[headerMap.glAccount]),
    };
    const { status, errorMessage } = validateRow(base);
    return { key: `row-${index}-${Date.now()}`, ...base, status, errorMessage };
  });
}

/** Made-up but SAP-shaped 10-digit PO number, starting '46' (this client's own real PO numbers
 * elsewhere in the app — see upcoming.tsx — start '45'/'46'), sequential off however many have
 * already been created this session/browser so numbers never collide within one localStorage
 * store. */
function nextPoNumber(existingCount: number): string {
  return `46${String(100000 + existingCount).padStart(8, '0')}`;
}

/** Groups every 'success' row by vendor+purchase org+plant+currency (the same header-level fields
 * a real PO would require to be uniform across its items) into one simulated PO per group, numbered
 * off `existingPos.length` so repeated Save calls in the same session never reuse a PO number.
 * Error rows are silently excluded — the caller is expected to have already blocked Save while any
 * remain (see po-creation.tsx). */
export function createPurchaseOrders(rows: UploadedPoRow[], existingPos: CreatedPo[]): CreatedPo[] {
  const successRows = rows.filter((r) => r.status === 'success');
  const groups = new Map<string, UploadedPoRow[]>();
  successRows.forEach((r) => {
    const key = [r.vendorCode, r.purchaseOrg, r.plant, r.currency].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });

  const today = new Date().toISOString().split('T')[0];
  const created: CreatedPo[] = [];
  let counter = existingPos.length;
  groups.forEach((groupRows) => {
    const first = groupRows[0];
    const items: CreatedPoItem[] = groupRows.map((r, idx) => ({
      itemNo: String((idx + 1) * 10).padStart(3, '0'),
      materialCode: r.materialCode,
      materialDesc: r.materialDesc,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      netValue: (Number(r.quantity) * Number(r.unitPrice)).toFixed(2),
      deliveryDate: r.deliveryDate,
      costCenter: r.costCenter,
      glAccount: r.glAccount,
    }));
    const totalValue = items.reduce((sum, it) => sum + Number(it.netValue || 0), 0);
    created.push({
      poNumber: nextPoNumber(counter),
      vendorCode: first.vendorCode,
      vendorName: first.vendorName,
      purchaseOrg: first.purchaseOrg,
      plant: first.plant,
      currency: first.currency,
      createdDate: today,
      totalValue,
      items,
    });
    counter += 1;
  });
  return created;
}

/** Exports every created PO's header + item details into one workbook (two sheets: Headers,
 * Items) — same XLSX.writeFile pattern as the sibling fm-po-deviation app's exportExcel.ts. */
export function exportCreatedPosToExcel(pos: CreatedPo[]): void {
  const headerData = pos.map((po) => ({
    'PO Number': po.poNumber,
    'Vendor Code': po.vendorCode,
    'Vendor Name': po.vendorName,
    'Purchase Org': po.purchaseOrg,
    Plant: po.plant,
    Currency: po.currency,
    'Created Date': po.createdDate,
    'Total Value': po.totalValue.toFixed(2),
    'Item Count': po.items.length,
  }));
  const itemData = pos.flatMap((po) =>
    po.items.map((item) => ({
      'PO Number': po.poNumber,
      'Item No': item.itemNo,
      'Material Code': item.materialCode,
      'Material Description': item.materialDesc,
      Quantity: item.quantity,
      'Unit Price': item.unitPrice,
      'Net Value': item.netValue,
      'Delivery Date': item.deliveryDate,
      'Cost Center': item.costCenter,
      'GL Account': item.glAccount,
    }))
  );

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(headerData), 'Headers');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(itemData), 'Items');
  XLSX.writeFile(book, `Purchase_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
