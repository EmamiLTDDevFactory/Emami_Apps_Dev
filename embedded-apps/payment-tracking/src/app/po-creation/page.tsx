'use client';

import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CloudUpload,
  Download,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  Lock,
  Paperclip,
  RotateCw,
  X,
  XCircle,
} from 'lucide-react';
import { getDocumentAsync } from '../../lib/documentPicker';
import {
  uploadServicePoFile,
  submitPoAttachment,
  PoUploadError,
  type PoUploadResult,
  type PoUploadResultRow,
} from '../../lib/paymentTrackingApi';
import { exportFailedRowsToCsv } from '../../lib/exportCsv';
import { ensureAttachmentUnderLimit, readAttachmentAsBase64, MAX_ATTACHMENT_BYTES } from '../../lib/pdfAttachment';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { hasRole } from '../../lib/hubAccessApi';
import { Banner, Button, Card, CardTitle, Chip, Input, LoadingBlock, PageHeader, Spinner, TableWrap, cx } from '../../components/ui';

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
/** Preview table (see the Confirm step) renders at most this many of the parsed rows — a bulk upload
 * file is capped at 5MB already so this is a render-cost guard, not a real-world limit; the row
 * count shown/used on the Confirm button and sent to SAP always reflects every row, not just the
 * ones rendered. */
const MAX_PREVIEW_ROWS_RENDERED = 100;

// Served from public/files/ (was bundled via Metro's assetExts in the Expo app). Same filename.
const SERVICE_PO_TEMPLATE_URL: string = '/apps/payment-tracking/files/ZMM_SRV_PO_Upload_Template.xlsx';

/** `sticky` (a left offset in px) freezes this header cell while its table scrolls horizontally —
 * used by the Service PO Bulk Upload report to freeze columns through Vendor Name. Omit it for a
 * normal, non-frozen header cell. */
function TableHeaderCell({ width, sticky, align, children }: {
  width: number; sticky?: number; align?: 'center'; children: React.ReactNode;
}) {
  return (
    <th
      className={cx(align === 'center' && '!text-center')}
      style={{ width, minWidth: width, ...(sticky != null ? { left: sticky, zIndex: 3 } : {}) }}
    >
      {children}
    </th>
  );
}

function InfoField({ label, value, className, valueClassName }: { label: string; value: string; className?: string; valueClassName?: string }) {
  return (
    <div className={cx('min-w-[96px]', className)}>
      <p className="text-2xs font-bold uppercase tracking-[0.06em] text-inkFaint">{label}</p>
      <p className={cx('line-clamp-2 text-sm font-semibold text-ink', valueClassName)}>{value || '—'}</p>
    </div>
  );
}

/** Lifnr/Sakto/Kostl arrive ALPHA-padded with leading zeros ("0000220856") — strip for display
 * only, never re-pad or send this back to SAP. */
function stripLeadingZeros(value: string): string {
  if (!value) return '';
  return value.replace(/^0+/, '') || '0';
}

/** Ebelp arrives as "00010" — display as "10". Empty (failed row) renders a dash. */
function formatEbelp(ebelp: string): string {
  if (!ebelp) return '—';
  return stripLeadingZeros(ebelp);
}

/** Menge/GrPrice arrive as STRINGS — parseFloat before formatting, never used directly. */
function formatUploadNumber(value: string): string {
  if (!value) return '—';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** The Service PO Bulk Upload template's own columns, in the exact order the shipped
 * ZMM_SRV_PO_Upload_Template.xlsx carries them (confirmed by reading that asset's own "Field
 * help" sheet directly, including its column-position and grouping rules) — this screen reads
 * them by header name, case-insensitively, purely to build the preview below; the real upload
 * still reads the file by column position, unchanged. */
const TEMPLATE_FIELD_LABELS: Record<string, string> = {
  LIFNR: 'Vendor', BUKRS: 'Company Code', TXZ01: 'Service Text', SALES: 'Sale Value',
  MENGE: 'Quantity', GR_PRICE: 'Gross Price', MEINS: 'Unit', WERKS: 'Plant', STEUC: 'Control Code',
  SAKTO: 'GL Account', KOSTL: 'Cost Center', MWSKZ: 'Tax Code', WAERS: 'Currency',
  VPER_START: 'Validity Start', VPER_END: 'Validity End', BSART: 'Doc Type', EKORG: 'Purch. Org',
  EKGRP: 'Purch. Group', ZTERM: 'Payment Terms', INCO1: 'Incoterms 1', INCO2: 'Incoterms 2',
  ORDERID: 'Internal Order', EINDT: 'Delivery Date',
};

function findTemplateHeader(headers: string[], field: string): string | undefined {
  return headers.find((h) => String(h).trim().toUpperCase() === field);
}

/** DD.MM.YYYY, matching the template's own date convention — only reformats a real Excel date
 * serial (a cell actually formatted as a date); a plain text cell that's already "DD.MM.YYYY", or
 * anything else, is shown exactly as typed rather than reparsed and risking a wrong read. */
function formatTemplateDate(value: any): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    const parsed = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(value) : null;
    if (parsed) return `${String(parsed.d).padStart(2, '0')}.${String(parsed.m).padStart(2, '0')}.${parsed.y}`;
  }
  return String(value);
}

interface PreviewGroup {
  key: string;
  poId: string;
  lifnr: string;
  bukrs: string;
  rows: { itemNo: string; row: Record<string, any> }[];
}

/** Groups the freshly-parsed sheet rows the same way the upload itself will — per the template's
 * own "Field help" sheet: "Rows sharing LIFNR + BUKRS + PO_ID become ONE purchase order, one item
 * per row" — purely so Finance can see, before confirming, exactly how many POs this file will
 * create and what's in each one. Returns null when the file is missing any of the three grouping
 * columns (e.g. a differently-shaped file was picked by mistake), so the caller can fall back to
 * a flat table instead of guessing at a grouping that isn't really there. */
function groupPreviewRows(headers: string[], rows: Record<string, any>[]): PreviewGroup[] | null {
  const lifnrH = findTemplateHeader(headers, 'LIFNR');
  const bukrsH = findTemplateHeader(headers, 'BUKRS');
  const poIdH = findTemplateHeader(headers, 'PO_ID');
  if (!lifnrH || !bukrsH || !poIdH) return null;

  const groups = new Map<string, PreviewGroup>();
  rows.forEach((row) => {
    const lifnr = String(row[lifnrH] ?? '').trim();
    const bukrs = String(row[bukrsH] ?? '').trim();
    const poId = String(row[poIdH] ?? '').trim();
    const key = `${lifnr}|${bukrs}|${poId}`;
    if (!groups.has(key)) groups.set(key, { key, poId, lifnr, bukrs, rows: [] });
    const group = groups.get(key)!;
    // SAP assigns real PO items 10, 20, 30... in upload order within a group (see the template's
    // own worked example) — this mirrors that numbering for the preview, though it's not a real
    // Ebelp until the PO actually exists.
    group.rows.push({ itemNo: String((group.rows.length + 1) * 10), row });
  });
  return Array.from(groups.values());
}

function groupByEbeln(rows: PoUploadResultRow[]): [string, PoUploadResultRow[]][] {
  const map = new Map<string, PoUploadResultRow[]>();
  for (const row of rows) {
    const key = row.ebeln || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  // Real PO groups first (in first-seen order), rows that never became a PO last.
  return Array.from(map.entries()).sort((a, b) => (a[0] === '—' ? 1 : b[0] === '—' ? -1 : 0));
}

/** One PO header's Quotation Attachment state — keyed by Ebeln (see the `attachments` map in
 * ServicePoUploadSection), since a single upload can create several POs at once and each gets its
 * own independent pick/save flow. */
interface AttachmentState {
  fileName: string;
  base64: string;
  mimeType: string;
  description: string;
  attaching: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

const EMPTY_ATTACHMENT_STATE: AttachmentState = {
  fileName: '', base64: '', mimeType: '', description: '',
  attaching: false, saving: false, saved: false, error: null,
};

/** GrPrice arrives as a STRING — parseFloat before formatting, never used directly. Amount is
 * GrPrice itself, shown as-is (not multiplied by Menge — GrPrice is the only price/amount field
 * the backend sends, and Menge/Qty is its own separate column). */
function parseAmount(grPrice: string): number | null {
  const price = parseFloat(grPrice);
  return Number.isNaN(price) ? null : price;
}

function formatAmount(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ALV-style report column widths for the Service PO Bulk Upload's Item Details table (per
 * instruction, 2026-09-15) — PO Number lives in the group's header card, not repeated per row, so
 * this starts at PO Item (Ebelp still varies per line within a PO). The first four (through Vendor
 * Name) are frozen while scrolling; Status is appended beyond the requested list since a failed
 * row must stay visible (dropping it would undo the "don't create a PO with any errored item"
 * behavior). No Row/serial column, per instruction. */
const UPLOAD_RESULT_COLUMNS = {
  item: 60,
  description: 170,
  vendor: 100,
  vendorName: 140,
  purchGroup: 84,
  purchOrg: 84,
  qty: 72,
  amount: 104,
  currency: 74,
  glAccount: 100,
  costCenter: 100,
  internalOrder: 104,
  status: 84,
} as const;

/** Cumulative left offsets for the frozen columns (item -> vendorName), in the same order they
 * render — each sticky cell's `left` is where it should land once pinned. */
const UPLOAD_FROZEN_LEFT = {
  item: 0,
  description: UPLOAD_RESULT_COLUMNS.item,
  vendor: UPLOAD_RESULT_COLUMNS.item + UPLOAD_RESULT_COLUMNS.description,
  vendorName: UPLOAD_RESULT_COLUMNS.item + UPLOAD_RESULT_COLUMNS.description + UPLOAD_RESULT_COLUMNS.vendor,
} as const;

function ResultCell({ width, align, sticky, background, className, children }: {
  width: number; align?: 'right' | 'center'; sticky?: number; background?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <td
      className={cx(align === 'right' && 'text-right', align === 'center' && 'text-center', sticky != null && 'sticky', className)}
      // Sticky (frozen) cells need a fully OPAQUE background — a translucent tint lets whatever is
      // scrolling underneath show through as it passes behind them.
      style={{ width, minWidth: width, ...(sticky != null ? { left: sticky, zIndex: 2, backgroundColor: background || '#fff' } : {}) }}
    >
      <span className="line-clamp-2">{children}</span>
    </td>
  );
}

const STATUS_BANNER_TYPE: Record<PoUploadResult['status'], 'success' | 'warn' | 'error'> = {
  S: 'success',
  P: 'warn',
  E: 'error',
};

/** Compact stepper header: 1 Upload → 2 Confirm → 3 Result. Purely visual; the flow's state is
 * still driven entirely by the original state variables. */
function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Upload Excel file', 'Confirm file details', 'SAP result'];
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < step;
        const on = n === step;
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className={cx(
                'flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-xs font-semibold',
                on ? 'border-rust bg-rust text-white' : done ? 'border-ledger/40 bg-ledgerBg text-ledger' : 'border-border bg-white text-inkFaint'
              )}
            >
              <span className="num font-bold">{done ? '✓' : n}</span>
              {label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-4 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Service PO Bulk Upload — the only way to create a Purchase Order in this screen (per
 * instruction, the old client-side "Purchase Orders" simulation tab was removed). Posts for real
 * to SAP's ZSrvPOUploadSet deep entity (see uploadServicePoFile in paymentTrackingApi.ts) — a
 * single POST whose response carries the full per-row S/P/E result; the backend owns all .xlsx
 * parsing/validation for that call, it never happens twice.
 *
 * Per instruction, picking a file no longer uploads it straight to SAP: it's first read
 * client-side (see previewFile, using the `xlsx` library) purely to show the sheet's own
 * rows/columns back to the Finance user for review — a generic preview of whatever the file
 * actually contains, not a guess at SAP's exact field names. Only once they explicitly press
 * "Confirm & Create Service POs" does handleUpload fire the real, unchanged SAP call. */
function ServicePoUploadSection({ email }: { email: string | null }) {
  const [pickedFileName, setPickedFileName] = useState('');
  const [pickedUri, setPickedUri] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[] | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PoUploadResult | null>(null);
  const [errorBanner, setErrorBanner] = useState<{ kind: 'timeout' | 'network' | 'sap'; message: string } | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const groups = useMemo(() => (result ? groupByEbeln(result.rows) : []), [result]);
  const previewGroups = useMemo(
    () => (previewHeaders && previewRows ? groupPreviewRows(previewHeaders, previewRows) : null),
    [previewHeaders, previewRows]
  );
  // Which raw sheet header covers each of the priority fields (Vendor, Purch. Org, Purch. Group,
  // Delivery Date, Service Text) so they can render as their own leading columns, per instruction
  // — everything else the file carries (bar PO_ID, which becomes the group's own header) follows
  // after, in the order the file itself has them.
  const previewColumnPlan = useMemo(() => {
    if (!previewHeaders) return null;
    const lifnrH = findTemplateHeader(previewHeaders, 'LIFNR');
    const ekorgH = findTemplateHeader(previewHeaders, 'EKORG');
    const ekgrpH = findTemplateHeader(previewHeaders, 'EKGRP');
    const eindtH = findTemplateHeader(previewHeaders, 'EINDT');
    const txz01H = findTemplateHeader(previewHeaders, 'TXZ01');
    const poIdH = findTemplateHeader(previewHeaders, 'PO_ID');
    const shown = new Set([lifnrH, ekorgH, ekgrpH, eindtH, txz01H, poIdH].filter(Boolean) as string[]);
    const remaining = previewHeaders.filter((h) => !shown.has(h));
    return { lifnrH, ekorgH, ekgrpH, eindtH, txz01H, remaining };
  }, [previewHeaders]);

  // Quotation Attachment (PO header level) — only meaningful once a real PO exists, i.e. after a
  // successful upload (see `result` below), keyed by Ebeln so several POs created in one upload
  // each get their own independent pick/save state.
  const [attachments, setAttachments] = useState<Record<string, AttachmentState>>({});
  const getAttachment = (ebeln: string) => attachments[ebeln] || EMPTY_ATTACHMENT_STATE;
  const patchAttachment = (ebeln: string, patch: Partial<AttachmentState>) => {
    setAttachments((prev) => ({ ...prev, [ebeln]: { ...(prev[ebeln] || EMPTY_ATTACHMENT_STATE), ...patch } }));
  };

  const pickQuotation = async (ebeln: string) => {
    patchAttachment(ebeln, { error: null });
    try {
      const res = await getDocumentAsync({ type: 'application/pdf' });
      if (res.canceled) return;
      const asset = (res as any).assets?.[0] ?? res;
      if (!asset?.uri) return;
      patchAttachment(ebeln, { attaching: true });
      const picked = await readAttachmentAsBase64(asset.uri);
      // Same body-size ceiling as every other attachment on this SAP service (see
      // pdfAttachment.ts) — compressed on web if it doesn't already fit.
      const base64 = await ensureAttachmentUnderLimit(picked, true);
      if (!base64) {
        patchAttachment(ebeln, { attaching: false, error: `File is too large — the limit is ${Math.round(MAX_ATTACHMENT_BYTES / 1024)}KB.` });
        return;
      }
      patchAttachment(ebeln, {
        attaching: false,
        fileName: asset.name || 'quotation.pdf',
        base64,
        mimeType: 'application/pdf',
        saved: false,
      });
    } catch {
      patchAttachment(ebeln, { attaching: false, error: 'Could not attach this file. Please try again.' });
    }
  };

  const saveQuotation = async (ebeln: string) => {
    const state = getAttachment(ebeln);
    if (!state.base64) return;
    patchAttachment(ebeln, { saving: true, error: null });
    try {
      await submitPoAttachment(ebeln, state.fileName, state.mimeType, state.base64, state.description);
      patchAttachment(ebeln, { saving: false, saved: true });
    } catch (err) {
      patchAttachment(ebeln, { saving: false, error: err instanceof Error ? err.message : 'Could not save this attachment.' });
    }
  };

  const resetPicked = () => {
    setPickedFileName('');
    setPickedUri('');
    setPreviewHeaders(null);
    setPreviewRows(null);
    setPreviewError(null);
  };

  /** Client-side-only read of the picked workbook so the Finance user can see exactly what's in
   * it before anything is sent anywhere — first sheet, headers taken verbatim from row 1 (no
   * relabeling/mapping to SAP field names, since the upload template's own column headers aren't
   * a confirmed contract this screen should be guessing at; the backend still does the real,
   * authoritative parse on Confirm). */
  const previewFile = async (uri: string) => {
    setPreviewing(true);
    setPreviewError(null);
    setPreviewHeaders(null);
    setPreviewRows(null);
    try {
      const res = await fetch(uri);
      const buffer = await res.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setPreviewError('This file has no sheets.');
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length === 0) {
        setPreviewError('No data rows found — check the file has a header row and at least one data row.');
        return;
      }
      setPreviewHeaders(Object.keys(rows[0]));
      setPreviewRows(rows);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Could not read this Excel file.');
    } finally {
      setPreviewing(false);
    }
  };

  const pickFile = async () => {
    setFileError(null);
    setErrorBanner(null);
    setResult(null);
    resetPicked();
    try {
      const res = await getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
      });
      if (res.canceled) return;
      const asset = (res as any).assets?.[0] ?? res;
      if (!asset?.uri) return;
      const name: string = asset.name || 'upload.xlsx';
      if (!name.toLowerCase().endsWith('.xlsx')) {
        setFileError('Only .xlsx files are accepted.');
        return;
      }
      if (typeof asset.size === 'number' && asset.size > MAX_UPLOAD_SIZE_BYTES) {
        setFileError(`File is ${(asset.size / (1024 * 1024)).toFixed(1)} MB — the limit is 5 MB.`);
        return;
      }
      setPickedFileName(name);
      setPickedUri(asset.uri);
      await previewFile(asset.uri);
    } catch {
      setFileError('Could not open the file picker. Please try again.');
    }
  };

  const handleUpload = async () => {
    if (!pickedUri || !email) return;
    setUploading(true);
    setProgress(0);
    setErrorBanner(null);
    setResult(null);
    try {
      const res = await uploadServicePoFile(email, pickedFileName || 'upload.xlsx', pickedUri, setProgress);
      setResult(res);
      resetPicked();
    } catch (err) {
      if (err instanceof PoUploadError) {
        setErrorBanner({ kind: err.kind, message: err.message });
      } else {
        setErrorBanner({ kind: 'sap', message: err instanceof Error ? err.message : 'Upload failed.' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (!SERVICE_PO_TEMPLATE_URL) {
      setTemplateNotice("Template isn't hosted yet — check back soon.");
      return;
    }
    if (typeof document === 'undefined') return;
    // Per instruction: this needs to actually save to the local system, not just open in a new
    // tab/viewer (which is all window.open does, especially for a type the browser can preview
    // inline). Same anchor + download-attribute pattern exportCsv.ts already uses.
    const a = document.createElement('a');
    a.href = SERVICE_PO_TEMPLATE_URL;
    a.download = 'ZMM_SRV_PO_Upload_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportFailedRows = () => {
    if (!result) return;
    exportFailedRowsToCsv(
      result.rows.filter((r) => r.type === 'E').map((r) => ({ rowno: r.rowno, message: r.message })),
      'Service_PO_Upload_Failed_Rows'
    );
  };

  const showPreview = !!(previewHeaders && previewRows && !uploading && !errorBanner && !result);
  const step: 1 | 2 | 3 = result ? 3 : showPreview || uploading ? 2 : 1;

  return (
    <div className="flex flex-col gap-3">
      <Card ledger>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Stepper step={step} />
          <Button size="sm" variant="ghost" icon={Download} onClick={handleDownloadTemplate} className="text-rust">
            Download template
          </Button>
        </div>
        <p className="mt-2 text-xs text-inkSoft">
          Upload an .xlsx file to create Service POs in bulk. The backend parses and validates the
          file — this screen does not.
        </p>
        {templateNotice && <p className="mt-1 text-xs text-inkSoft">{templateNotice}</p>}

        {!result && (
          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            <CardTitle icon={CloudUpload} title="1. Upload Excel file" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={pickFile}
                disabled={previewing || uploading}
                className="flex h-[30px] min-w-[200px] flex-1 items-center gap-1.5 rounded-lg border border-dashed border-border bg-appBg px-2.5 text-left text-sm font-semibold text-ink transition-colors hover:border-rust/50 hover:bg-cream disabled:opacity-60 sm:max-w-md"
              >
                <CloudUpload size={15} className="shrink-0 text-rust" />
                <span className="truncate">{pickedFileName || 'Choose Excel file (.xlsx)'}</span>
              </button>
            </div>
            {fileError && <p className="text-xs font-semibold text-red">{fileError}</p>}
            {previewing && (
              <div className="flex items-center gap-2 text-xs text-inkSoft">
                <Spinner size={14} /> Reading file…
              </div>
            )}
            {previewError && <p className="text-xs font-semibold text-red">{previewError}</p>}

            {uploading && (
              <div className="h-[5px] overflow-hidden rounded-full bg-border">
                <div className="h-full bg-rust transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            )}

            {errorBanner && (
              <div
                role="alert"
                className={cx(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold',
                  errorBanner.kind === 'timeout' ? 'border-amber/25 bg-amberBg text-amber' : 'border-red/25 bg-redBg text-red'
                )}
              >
                {errorBanner.kind === 'timeout' ? <AlertCircle size={15} className="shrink-0" /> : <XCircle size={15} className="shrink-0" />}
                <span className="min-w-0 flex-1">{errorBanner.message}</span>
                {errorBanner.kind !== 'timeout' && (
                  <button type="button" onClick={handleUpload} aria-label="Retry" title="Retry" className="shrink-0 text-inkSoft hover:text-ink">
                    <RotateCw size={15} />
                  </button>
                )}
                <button type="button" onClick={() => setErrorBanner(null)} aria-label="Dismiss" title="Dismiss" className="shrink-0 text-inkSoft hover:text-ink">
                  <X size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {showPreview && previewHeaders && previewRows && (
        <Card>
          <CardTitle
            icon={FileSpreadsheet}
            title="2. Confirm file details"
            hint={
              previewGroups
                ? `${previewGroups.length} purchase order${previewGroups.length === 1 ? '' : 's'} · ${previewRows.length} line item${previewRows.length === 1 ? '' : 's'} in ${pickedFileName}`
                : `${previewRows.length} row${previewRows.length === 1 ? '' : 's'} found in ${pickedFileName}`
            }
          />

          <div className="flex flex-col gap-3">
            {previewGroups && previewColumnPlan ? (
              (() => {
                let rendered = 0;
                const visibleGroups = previewGroups.filter((g) => {
                  if (rendered >= MAX_PREVIEW_ROWS_RENDERED) return false;
                  rendered += g.rows.length;
                  return true;
                });
                const hiddenGroupCount = previewGroups.length - visibleGroups.length;
                return (
                  <>
                    {visibleGroups.map((group) => (
                      <div key={group.key} className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border border-l-[3px] border-l-rust bg-white px-3 py-2">
                          <p className="text-sm font-extrabold text-ink">PO Group <span className="code">{group.poId || '—'}</span></p>
                          <InfoField label="Vendor" value={group.lifnr || '—'} valueClassName="code" />
                          <InfoField label="Company Code" value={group.bukrs || '—'} valueClassName="code" />
                          <InfoField label="Items" value={String(group.rows.length)} valueClassName="num" />
                          <Chip tone="rust" icon={Clock} className="ml-auto">Not yet created</Chip>
                        </div>

                        <p className="text-2xs font-bold uppercase tracking-[0.06em] text-inkSoft">Item Details</p>
                        <TableWrap maxHeight="50vh">
                          <table className="tbl">
                            <thead>
                              <tr>
                                <th style={{ minWidth: 60 }}>Item</th>
                                <th style={{ minWidth: 90 }}>Vendor</th>
                                <th style={{ minWidth: 90 }}>Purch. Org</th>
                                <th style={{ minWidth: 90 }}>Purch. Group</th>
                                <th style={{ minWidth: 100 }}>Delivery Date</th>
                                <th style={{ minWidth: 180 }}>Service Text</th>
                                {previewColumnPlan.remaining.map((h) => (
                                  <th key={h} style={{ minWidth: 120 }}>{TEMPLATE_FIELD_LABELS[h.trim().toUpperCase()] || h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map(({ itemNo, row }) => (
                                <tr key={itemNo}>
                                  <td className="num">{itemNo}</td>
                                  <td className="code">{group.lifnr || '—'}</td>
                                  <td>{previewColumnPlan.ekorgH ? String(row[previewColumnPlan.ekorgH] ?? '') || '—' : '—'}</td>
                                  <td>{previewColumnPlan.ekgrpH ? String(row[previewColumnPlan.ekgrpH] ?? '') || '—' : '—'}</td>
                                  <td className="num">{previewColumnPlan.eindtH ? formatTemplateDate(row[previewColumnPlan.eindtH]) || '—' : '—'}</td>
                                  <td><span className="line-clamp-2">{previewColumnPlan.txz01H ? String(row[previewColumnPlan.txz01H] ?? '') || '—' : '—'}</span></td>
                                  {previewColumnPlan.remaining.map((h) => (
                                    <td key={h}><span className="line-clamp-2">{row[h] === '' || row[h] == null ? '—' : String(row[h])}</span></td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TableWrap>
                      </div>
                    ))}
                    {hiddenGroupCount > 0 && (
                      <p className="text-xs text-inkSoft">Showing {visibleGroups.length} of {previewGroups.length} purchase orders — every one will still be sent.</p>
                    )}
                  </>
                );
              })()
            ) : (
              <>
                <TableWrap maxHeight="55vh">
                  <table className="tbl">
                    <thead>
                      <tr>
                        {previewHeaders.map((h) => (
                          <th key={h} style={{ minWidth: 140 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, MAX_PREVIEW_ROWS_RENDERED).map((row, i) => (
                        <tr key={i}>
                          {previewHeaders.map((h) => (
                            <td key={h}><span className="line-clamp-2">{row[h] === '' || row[h] == null ? '—' : String(row[h])}</span></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                {previewRows.length > MAX_PREVIEW_ROWS_RENDERED && (
                  <p className="text-xs text-inkSoft">Showing the first {MAX_PREVIEW_ROWS_RENDERED} of {previewRows.length} rows — every row will still be sent.</p>
                )}
                <p className="text-xs text-inkSoft">
                  This file doesn&apos;t look like the Service PO template (missing LIFNR/BUKRS/PO_ID columns), so rows can&apos;t be grouped into purchase orders for preview — showing every column as-is instead.
                </p>
              </>
            )}

            <p className="text-xs text-inkSoft">
              This is exactly what&apos;s in the file — nothing has been sent to SAP yet. Confirm to create these Service POs, or cancel to pick a different file.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={handleUpload} disabled={uploading || !email} loading={uploading} icon={FileCheck2}>
                {uploading ? null : `Confirm & Create Service POs${progress > 0 ? ` ${progress}%` : ''}`}
              </Button>
              <Button variant="secondary" onClick={resetPicked} disabled={uploading}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {result && (
        <Card>
          <CardTitle
            icon={FileCheck2}
            title="3. SAP result"
            hint={`${result.successCnt} posted · ${result.errorCnt} failed`}
            actions={
              result.errorCnt > 0 ? (
                <Button size="sm" variant="secondary" icon={Download} onClick={handleExportFailedRows} className="text-teal">
                  Export failed rows
                </Button>
              ) : undefined
            }
          />
          <div className="flex flex-col gap-3">
            <Banner type={STATUS_BANNER_TYPE[result.status]}>
              {result.status === 'S'
                ? `All ${result.totalRows} row${result.totalRows === 1 ? '' : 's'} posted`
                : result.status === 'P'
                  ? `${result.successCnt} posted, ${result.errorCnt} failed`
                  : (result.message || 'Upload failed — no rows were posted.')}
            </Banner>

            {groups.map(([ebeln, rows]) => {
              const groupTotal = ebeln === '—'
                ? null
                : rows.reduce((sum, r) => {
                    const amt = parseAmount(r.grPrice);
                    return amt != null ? sum + amt : sum;
                  }, 0);
              const errorRows = rows.filter((r) => r.type === 'E');
              const first = rows[0];
              const att = getAttachment(ebeln);
              return (
                <div key={ebeln} className="flex flex-col gap-1.5">
                  {ebeln === '—' ? (
                    <p className="text-2xs font-extrabold uppercase tracking-[0.06em] text-inkSoft">Not created ({rows.length})</p>
                  ) : (
                    <div className="flex flex-col gap-2 rounded-lg border border-border border-l-[3px] border-l-rust bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <p className="text-sm font-extrabold text-ink">PO <span className="code">{ebeln}</span></p>
                        <InfoField label="Vendor" value={stripLeadingZeros(first.lifnr)} valueClassName="code" />
                        <InfoField label="Items" value={String(rows.length)} valueClassName="num" />
                        <InfoField
                          label="Total Amount"
                          value={groupTotal != null ? `${first.waers || ''} ${formatAmount(groupTotal)}`.trim() : '—'}
                          valueClassName="num font-extrabold text-ledger"
                        />
                        <span className="ml-auto">
                          {errorRows.length === 0 ? (
                            <Chip tone="green" icon={CheckCircle2}>All items posted</Chip>
                          ) : (
                            <Chip tone="red" icon={AlertCircle}>{errorRows.length} failed</Chip>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 border-t border-line pt-2">
                        <p className="text-2xs font-bold uppercase tracking-[0.06em] text-inkSoft">Quotation Attachment</p>
                        {att.saved ? (
                          <Chip tone="green" icon={CheckCircle2} className="self-start normal-case">{att.fileName} attached</Chip>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => pickQuotation(ebeln)}
                                disabled={att.attaching}
                                className="flex h-[30px] min-w-[180px] max-w-xs flex-1 items-center gap-1.5 rounded-lg border border-border bg-appBg px-2.5 text-left text-sm font-semibold text-ink hover:border-rust/50 disabled:opacity-60"
                              >
                                {att.fileName ? <FilePlus2 size={14} className="shrink-0 text-rust" /> : <Paperclip size={14} className="shrink-0 text-rust" />}
                                <span className="truncate">{att.attaching ? 'Attaching…' : (att.fileName || 'Choose PDF quotation')}</span>
                              </button>
                              {!!att.fileName && (
                                <>
                                  <Input
                                    value={att.description}
                                    onChange={(e) => patchAttachment(ebeln, { description: e.target.value })}
                                    placeholder="Description (optional)"
                                    className="min-w-[160px] flex-1 sm:max-w-xs"
                                  />
                                  <Button
                                    variant="primary"
                                    onClick={() => saveQuotation(ebeln)}
                                    disabled={att.saving}
                                    loading={att.saving}
                                    className="!from-teal !to-teal"
                                  >
                                    {att.saving ? null : 'Save Attachment'}
                                  </Button>
                                </>
                              )}
                            </div>
                            {att.error && <p className="text-xs font-semibold text-red">{att.error}</p>}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-2xs font-bold uppercase tracking-[0.06em] text-inkSoft">{ebeln === '—' ? 'Line Items' : 'Item Details'}</p>
                  <TableWrap maxHeight="55vh">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.item} sticky={UPLOAD_FROZEN_LEFT.item}>Item</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.description} sticky={UPLOAD_FROZEN_LEFT.description}>Service Text</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.vendor} sticky={UPLOAD_FROZEN_LEFT.vendor}>Vendor</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.vendorName} sticky={UPLOAD_FROZEN_LEFT.vendorName}>Vendor Name</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.purchGroup}>Purch. Group</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.purchOrg}>Purch. Org</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.qty} align="center">Qty</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.amount} align="center">Amount</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.currency} align="center">Currency</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.glAccount}>GL Account</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.costCenter}>Cost Center</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.internalOrder}>Internal Order</TableHeaderCell>
                          <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.status}>Status</TableHeaderCell>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => {
                          const isErr = row.type === 'E';
                          // Sticky cells get an OPAQUE version of the row tint (see ResultCell).
                          const rowBgSolid = isErr ? '#FBEEEE' : '#EEF6F1';
                          return (
                            <tr key={`${ebeln}-${row.rowno}-${i}`} className={isErr ? 'bg-red/[0.04]' : 'bg-green/[0.04]'}>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.item} sticky={UPLOAD_FROZEN_LEFT.item} background={rowBgSolid} className="num">{formatEbelp(row.ebelp)}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.description} sticky={UPLOAD_FROZEN_LEFT.description} background={rowBgSolid}>{row.txz01 || '—'}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.vendor} sticky={UPLOAD_FROZEN_LEFT.vendor} background={rowBgSolid} className="code">{stripLeadingZeros(row.lifnr) || '—'}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.vendorName} sticky={UPLOAD_FROZEN_LEFT.vendorName} background={rowBgSolid}>{row.name1 || '—'}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.purchGroup}>{stripLeadingZeros(row.ekgrp) || '—'}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.purchOrg}>{stripLeadingZeros(row.ekorg) || '—'}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.qty} align="center" className="num">{formatUploadNumber(row.menge)}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.amount} align="center" className="num">{formatAmount(parseAmount(row.grPrice))}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.currency} align="center">{row.waers || '—'}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.glAccount} className="code">{stripLeadingZeros(row.sakto) || '—'}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.costCenter} className="code">{stripLeadingZeros(row.kostl) || '—'}</ResultCell>
                              <ResultCell width={UPLOAD_RESULT_COLUMNS.internalOrder} className="code">{stripLeadingZeros(row.orderid) || '—'}</ResultCell>
                              <td style={{ width: UPLOAD_RESULT_COLUMNS.status, minWidth: UPLOAD_RESULT_COLUMNS.status }}>
                                <Chip tone={isErr ? 'red' : 'green'} icon={isErr ? AlertCircle : CheckCircle2}>
                                  {isErr ? 'Failed' : 'Posted'}
                                </Chip>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableWrap>

                  {errorRows.length > 0 && (
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      {errorRows.map((r) => (
                        <p key={r.rowno} className="text-xs font-semibold text-red">Row {r.rowno}: {r.message}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Purchase Order Creation and Details — Finance-only tab. Per instruction, the only way to create
 * a Purchase Order here is the Service PO Bulk Upload flow (see ServicePoUploadSection above); the
 * earlier client-side "Purchase Orders" simulation tab (never a real SAP call) has been removed. */
export default function PurchaseOrderCreation() {
  const { email, role, roleLoading } = usePaymentTrackingAuth();

  if (roleLoading) {
    return <LoadingBlock />;
  }

  // Defense in depth — the nav bar already hides this link from non-Finance roles, but the route
  // is still reachable by a typed URL.
  if (!hasRole(role, 'Finance')) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Lock size={22} className="text-inkSoft" />
        <p className="text-sm text-inkSoft">Purchase Order Creation is only available to Finance.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finance · Service PO Bulk Upload"
        title="Purchase Order Creation and Details"
        subtitle="Upload an Excel file of Service PO line items, review exactly what's in it, then confirm to create them in SAP."
        icon={FileSpreadsheet}
      />
      <ServicePoUploadSection email={email} />
    </div>
  );
}
