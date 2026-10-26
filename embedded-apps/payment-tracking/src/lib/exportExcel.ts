'use client';

import type { PaymentTrackingRow } from './paymentTrackingApi';
import { formatDeliveryDate, num } from './provisionMetrics';

/**
 * Excel downloads for the Admin screens (Dashboard, Provision Details, Calendar, Overall SES Status and every pop-up
 * that lists line items). One workbook per click: the sheets the screen passes, written with SheetJS (loaded only when
 * someone exports). Amounts go out as numbers so Excel can sum them; dates as DD Mon YYYY like the screens show.
 */

export type Cell = string | number | null;
export interface Sheet { name: string; header: string[]; rows: Cell[][]; widths?: number[] }

/** Every line-item field the screens know, in a sensible reading order. */
export const LINE_ITEM_HEADER = [
  'PO Number', 'PO Item', 'Status', 'Status Text', 'Delivery Date', 'Fiscal Period', 'Fiscal Year', 'PO Creator',
  'Vendor', 'Vendor Name', 'Service Text', 'Activity Value', 'Pending Bill Value', 'GR Value', 'GR Currency',
  'SES Value', 'SES Currency', 'Liability Created (Y/N)', 'Entry Sheet No', 'Cost Center', 'Cost Center Text',
  'GL Code', 'GL Text', 'Country',
];

const amount = (v: string): number | null => (v === '' || v == null ? null : num(v));

export function lineItemRows(rows: PaymentTrackingRow[]): Cell[][] {
  return rows.map((r) => [
    r.poNumber, r.poItemNo, r.status, r.statusText, formatDeliveryDate(r.deliveryDate), r.fiscalPeriod, r.fiscalYear, r.poCreator,
    r.vendor, r.vendorName, r.serviceText, amount(r.grossValue), amount(r.pendingValue), amount(r.grValue), r.grCurrency,
    amount(r.sesValue), r.sesCurrency, r.liabilityCreated, r.entrySheetNo, r.costCenter, r.costCenterText,
    r.glAccount, r.glAccountText, r.country,
  ]);
}

export const lineItemSheet = (rows: PaymentTrackingRow[], name = 'Line items'): Sheet => ({
  name, header: LINE_ITEM_HEADER, rows: lineItemRows(rows),
  widths: [12, 8, 7, 34, 13, 8, 8, 14, 10, 28, 34, 14, 16, 12, 8, 12, 8, 10, 14, 12, 26, 12, 26, 8],
});

/** "Provision_Dashboard_2026-10-26.xlsx" — letters, digits, '-' and '_' only. */
export function excelFileName(base: string): string {
  const safe = base.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Export';
  return `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

/** Writes and downloads the workbook. Sheet names are trimmed to Excel's 31 characters and made unique. */
export async function downloadExcel(fileBase: string, sheets: Sheet[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    let name = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
    for (let i = 2; used.has(name); i += 1) name = `${s.name.slice(0, 28)} ${i}`;
    used.add(name);
    const ws = XLSX.utils.aoa_to_sheet([s.header, ...s.rows]);
    ws['!cols'] = (s.widths ?? s.header.map((h) => Math.max(10, Math.min(40, h.length + 2)))).map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, excelFileName(fileBase));
}
