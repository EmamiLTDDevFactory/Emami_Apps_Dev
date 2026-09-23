import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { colors, radii } from '../../../src/theme/tokens';
import {
  uploadServicePoFile,
  submitPoAttachment,
  PoUploadError,
  type PoUploadResult,
  type PoUploadResultRow,
} from '../../../src/lib/paymentTrackingApi';
import { exportFailedRowsToCsv } from '../../../src/lib/exportCsv';
import { ensureAttachmentUnderLimit, readAttachmentAsBase64, MAX_ATTACHMENT_BYTES } from '../../../src/lib/pdfAttachment';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
/** Preview table (see PreviewTable) renders at most this many of the parsed rows — a bulk upload
 * file is capped at 5MB already so this is a render-cost guard, not a real-world limit; the row
 * count shown/used on the Confirm button and sent to SAP always reflects every row, not just the
 * ones rendered. */
const MAX_PREVIEW_ROWS_RENDERED = 100;

// Bundled via Metro (see metro.config.js's assetExts) from assets/files/ — same mechanism the
// sidebar logo already uses (see _layout.tsx's require of emami-apps-logo.png), so it merges into
// the hub's shared dist/assets/ at build time (see scripts/build-embedded-apps.js's
// SHARED_FOLDERS) without needing separate hosting. On web this resolves directly to a servable
// URI string; the object-with-.uri shape is handled too in case a native build ever reaches here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SERVICE_PO_TEMPLATE_ASSET = require('../../../assets/files/ZMM_SRV_PO_Upload_Template.xlsx');
const SERVICE_PO_TEMPLATE_URL: string =
  typeof SERVICE_PO_TEMPLATE_ASSET === 'string' ? SERVICE_PO_TEMPLATE_ASSET : (SERVICE_PO_TEMPLATE_ASSET?.uri ?? '');

/** `sticky` (a left offset in px) freezes this header cell while its table scrolls horizontally —
 * web-only (react-native-web passes 'sticky' straight through to CSS; RN's own ViewStyle type
 * doesn't know that position, hence the cast), used by the Service PO Bulk Upload report to freeze
 * columns through Vendor Name. Omit it for a normal, non-frozen header cell. */
function TableHeaderCell({ width, sticky, align, children }: {
  width: number; sticky?: number; align?: 'center'; children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.tableHeaderCell,
        { width },
        align === 'center' && styles.tableCellCenter,
        sticky != null && ({ position: 'sticky', left: sticky, zIndex: 3, backgroundColor: colors.appBg } as any),
      ]}
    >
      <Text style={[styles.tableHeaderText, align === 'center' && styles.resultCellTextCenter]}>{children}</Text>
    </View>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
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
 * instruction, 2026-09-15) — PO Number/PO Item live in the group's header card, not repeated per
 * row, so this starts at PO Item (Ebelp still varies per line within a PO). The first four
 * (through Vendor Name) are frozen while scrolling; Status is appended beyond the requested list
 * since a failed row must stay visible (dropping it would undo the "don't create a PO with any
 * errored item" behavior). No Row/serial column, per instruction. */
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

function ResultCell({ width, align, sticky, background, children }: {
  width: number; align?: 'right' | 'center'; sticky?: number; background?: string; children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.tableCell,
        { width },
        align === 'right' && styles.tableCellRight,
        align === 'center' && styles.tableCellCenter,
        sticky != null && ({ position: 'sticky', left: sticky, zIndex: 2, backgroundColor: background || colors.white } as any),
      ]}
    >
      <Text style={[styles.resultCellText, align === 'center' && styles.resultCellTextCenter]} numberOfLines={2}>{children}</Text>
    </View>
  );
}

const STATUS_BANNER_STYLE: Record<PoUploadResult['status'], { bg: string; border: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  S: { bg: `${colors.green}12`, border: `${colors.green}40`, color: colors.green, icon: 'checkmark-circle' },
  P: { bg: '#FFFBEB', border: `${colors.amber}40`, color: colors.amber, icon: 'alert-circle' },
  E: { bg: `${colors.red}12`, border: `${colors.red}40`, color: colors.red, icon: 'close-circle' },
};

/** Service PO Bulk Upload — the only way to create a Purchase Order in this screen (per
 * instruction, the old client-side "Purchase Orders" simulation tab was removed). Posts for real
 * to SAP's ZSrvPOUploadSet deep entity (see uploadServicePoFile in paymentTrackingApi.ts) — a
 * single POST whose response carries the full per-row S/P/E result; the backend owns all .xlsx
 * parsing/validation for that call, it never happens twice.
 *
 * Per instruction, picking a file no longer uploads it straight to SAP: it's first read
 * client-side (see previewFile, using the same `xlsx` library already installed for the
 * now-removed simulator) purely to show the sheet's own rows/columns back to the Finance user for
 * review — a generic preview of whatever the file actually contains, not a guess at SAP's exact
 * field names. Only once they explicitly press "Confirm & Create Service POs" does handleUpload
 * fire the real, unchanged SAP call. */
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
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (res.canceled) return;
      const asset = (res as any).assets?.[0] ?? res;
      if (!asset?.uri) return;
      patchAttachment(ebeln, { attaching: true });
      const picked = await readAttachmentAsBase64(asset.uri);
      // Same body-size ceiling as every other attachment on this SAP service (see
      // pdfAttachment.ts) — compressed on web if it doesn't already fit, rejected on native.
      const base64 = await ensureAttachmentUnderLimit(picked, Platform.OS === 'web');
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
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
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
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
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

  return (
    <View style={styles.panel}>
      <View style={styles.reviewHeader}>
        <Text style={styles.helperText}>
          Upload an .xlsx file to create Service POs in bulk. The backend parses and validates the
          file — this screen does not.
        </Text>
        <Pressable onPress={handleDownloadTemplate} accessibilityRole="button">
          <View style={styles.templateLinkRow}>
            <Ionicons name="download-outline" size={13} color={colors.rust} />
            <Text style={styles.templateLinkText}>Download template</Text>
          </View>
        </Pressable>
      </View>
      {templateNotice && <Text style={styles.helperText}>{templateNotice}</Text>}

      {!result && (
        <View style={styles.uploadCard}>
          <Text style={styles.sectionTitle}>1. Upload Excel file</Text>
          <View style={styles.uploadRow}>
            <Pressable
              style={[styles.uploadBtn, (previewing || uploading) && styles.btnDisabled]}
              onPress={pickFile}
              disabled={previewing || uploading}
              accessibilityRole="button"
            >
              <Ionicons name="cloud-upload-outline" size={15} color={colors.rust} />
              <Text style={styles.uploadBtnText} numberOfLines={1}>{pickedFileName || 'Choose Excel file (.xlsx)'}</Text>
            </Pressable>
          </View>
          {fileError && <Text style={styles.rowErrorText}>{fileError}</Text>}
          {previewing && (
            <View style={styles.uploadRow}>
              <ActivityIndicator size="small" color={colors.rust} />
              <Text style={styles.helperText}>Reading file…</Text>
            </View>
          )}
          {previewError && <Text style={styles.rowErrorText}>{previewError}</Text>}

          {uploading && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}

          {errorBanner && (
            <View style={[
              styles.banner,
              errorBanner.kind === 'timeout'
                ? { backgroundColor: '#FFFBEB', borderColor: `${colors.amber}40` }
                : styles.bannerError,
            ]}>
              <Ionicons
                name={errorBanner.kind === 'timeout' ? 'alert-circle' : 'close-circle'}
                size={16}
                color={errorBanner.kind === 'timeout' ? colors.amber : colors.red}
              />
              <Text style={[styles.bannerText, { color: errorBanner.kind === 'timeout' ? colors.amber : colors.red }]}>
                {errorBanner.message}
              </Text>
              {errorBanner.kind !== 'timeout' && (
                <Pressable onPress={handleUpload} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry">
                  <Ionicons name="refresh-outline" size={16} color={colors.inkSoft} />
                </Pressable>
              )}
              <Pressable onPress={() => setErrorBanner(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
                <Ionicons name="close" size={16} color={colors.inkSoft} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {previewHeaders && previewRows && !uploading && !errorBanner && !result && (
        <View style={styles.reviewSection}>
          <View style={styles.reviewHeader}>
            <Text style={styles.sectionTitle}>2. Confirm file details</Text>
            <Text style={styles.helperText}>
              {previewGroups
                ? `${previewGroups.length} purchase order${previewGroups.length === 1 ? '' : 's'} · ${previewRows.length} line item${previewRows.length === 1 ? '' : 's'} in ${pickedFileName}`
                : `${previewRows.length} row${previewRows.length === 1 ? '' : 's'} found in ${pickedFileName}`}
            </Text>
          </View>

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
                    <View key={group.key} style={{ gap: 6 }}>
                      <View style={styles.poHeaderCard}>
                        <View style={styles.poHeaderTopRow}>
                          <Text style={styles.poHeaderTitle}>PO Group {group.poId || '—'}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: `${colors.rust}14` }]}>
                            <Ionicons name="time-outline" size={11} color={colors.rust} />
                            <Text style={[styles.statusBadgeText, { color: colors.rust }]}>Not yet created</Text>
                          </View>
                        </View>
                        <View style={styles.fieldGrid}>
                          <InfoField label="Vendor" value={group.lifnr || '—'} />
                          <InfoField label="Company Code" value={group.bukrs || '—'} />
                          <InfoField label="Items" value={String(group.rows.length)} />
                        </View>
                      </View>

                      <Text style={styles.itemDetailsLabel}>Item Details</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
                        <View>
                          <View style={styles.tableHeaderRow}>
                            <View style={[styles.tableHeaderCell, { width: 60 }]}><Text style={styles.tableHeaderText}>Item</Text></View>
                            <View style={[styles.tableHeaderCell, { width: 90 }]}><Text style={styles.tableHeaderText}>Vendor</Text></View>
                            <View style={[styles.tableHeaderCell, { width: 90 }]}><Text style={styles.tableHeaderText}>Purch. Org</Text></View>
                            <View style={[styles.tableHeaderCell, { width: 90 }]}><Text style={styles.tableHeaderText}>Purch. Group</Text></View>
                            <View style={[styles.tableHeaderCell, { width: 100 }]}><Text style={styles.tableHeaderText}>Delivery Date</Text></View>
                            <View style={[styles.tableHeaderCell, { width: 180 }]}><Text style={styles.tableHeaderText}>Service Text</Text></View>
                            {previewColumnPlan.remaining.map((h) => (
                              <View key={h} style={[styles.tableHeaderCell, { width: 120 }]}>
                                <Text style={styles.tableHeaderText} numberOfLines={2}>{TEMPLATE_FIELD_LABELS[h.trim().toUpperCase()] || h}</Text>
                              </View>
                            ))}
                          </View>
                          {group.rows.map(({ itemNo, row }) => (
                            <View key={itemNo} style={styles.tableRow}>
                              <View style={[styles.tableCell, { width: 60 }]}><Text style={styles.resultCellText}>{itemNo}</Text></View>
                              <View style={[styles.tableCell, { width: 90 }]}><Text style={styles.resultCellText}>{group.lifnr || '—'}</Text></View>
                              <View style={[styles.tableCell, { width: 90 }]}>
                                <Text style={styles.resultCellText}>{previewColumnPlan.ekorgH ? String(row[previewColumnPlan.ekorgH] ?? '') || '—' : '—'}</Text>
                              </View>
                              <View style={[styles.tableCell, { width: 90 }]}>
                                <Text style={styles.resultCellText}>{previewColumnPlan.ekgrpH ? String(row[previewColumnPlan.ekgrpH] ?? '') || '—' : '—'}</Text>
                              </View>
                              <View style={[styles.tableCell, { width: 100 }]}>
                                <Text style={styles.resultCellText}>{previewColumnPlan.eindtH ? formatTemplateDate(row[previewColumnPlan.eindtH]) || '—' : '—'}</Text>
                              </View>
                              <View style={[styles.tableCell, { width: 180 }]}>
                                <Text style={styles.resultCellText} numberOfLines={2}>{previewColumnPlan.txz01H ? String(row[previewColumnPlan.txz01H] ?? '') || '—' : '—'}</Text>
                              </View>
                              {previewColumnPlan.remaining.map((h) => (
                                <View key={h} style={[styles.tableCell, { width: 120 }]}>
                                  <Text style={styles.resultCellText} numberOfLines={2}>{row[h] === '' || row[h] == null ? '—' : String(row[h])}</Text>
                                </View>
                              ))}
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ))}
                  {hiddenGroupCount > 0 && (
                    <Text style={styles.helperText}>Showing {visibleGroups.length} of {previewGroups.length} purchase orders — every one will still be sent.</Text>
                  )}
                </>
              );
            })()
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
                <View>
                  <View style={styles.tableHeaderRow}>
                    {previewHeaders.map((h) => (
                      <View key={h} style={[styles.tableHeaderCell, { width: 140 }]}>
                        <Text style={styles.tableHeaderText} numberOfLines={2}>{h}</Text>
                      </View>
                    ))}
                  </View>
                  {previewRows.slice(0, MAX_PREVIEW_ROWS_RENDERED).map((row, i) => (
                    <View key={i} style={styles.tableRow}>
                      {previewHeaders.map((h) => (
                        <View key={h} style={[styles.tableCell, { width: 140 }]}>
                          <Text style={styles.resultCellText} numberOfLines={2}>{row[h] === '' || row[h] == null ? '—' : String(row[h])}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
              {previewRows.length > MAX_PREVIEW_ROWS_RENDERED && (
                <Text style={styles.helperText}>Showing the first {MAX_PREVIEW_ROWS_RENDERED} of {previewRows.length} rows — every row will still be sent.</Text>
              )}
              <Text style={styles.helperText}>
                This file doesn't look like the Service PO template (missing LIFNR/BUKRS/PO_ID columns), so rows can't be grouped into purchase orders for preview — showing every column as-is instead.
              </Text>
            </>
          )}

          <Text style={styles.helperText}>
            This is exactly what's in the file — nothing has been sent to SAP yet. Confirm to create these Service POs, or cancel to pick a different file.
          </Text>

          <View style={styles.uploadRow}>
            <Pressable
              style={[styles.fetchBtn, (uploading || !email) && styles.btnDisabled]}
              onPress={handleUpload}
              disabled={uploading || !email}
              accessibilityRole="button"
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.fetchBtnText}>Confirm & Create Service POs{progress > 0 ? ` ${progress}%` : ''}</Text>
              )}
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={resetPicked} disabled={uploading} accessibilityRole="button">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {result && (
        <View style={styles.reviewSection}>
          {(() => {
            const tone = STATUS_BANNER_STYLE[result.status];
            const text = result.status === 'S'
              ? `All ${result.totalRows} row${result.totalRows === 1 ? '' : 's'} posted`
              : result.status === 'P'
                ? `${result.successCnt} posted, ${result.errorCnt} failed`
                : (result.message || 'Upload failed — no rows were posted.');
            return (
              <View style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                <Ionicons name={tone.icon} size={16} color={tone.color} />
                <Text style={[styles.bannerText, { color: tone.color }]}>{text}</Text>
              </View>
            );
          })()}

          {result.errorCnt > 0 && (
            <Pressable style={styles.downloadBtn} onPress={handleExportFailedRows} accessibilityRole="button">
              <Ionicons name="download-outline" size={14} color={colors.white} />
              <Text style={styles.downloadBtnText}>Export failed rows</Text>
            </Pressable>
          )}

          {groups.map(([ebeln, rows]) => {
            const groupTotal = ebeln === '—'
              ? null
              : rows.reduce((sum, r) => {
                  const amt = parseAmount(r.grPrice);
                  return amt != null ? sum + amt : sum;
                }, 0);
            const errorRows = rows.filter((r) => r.type === 'E');
            const first = rows[0];
            return (
              <View key={ebeln} style={{ gap: 6 }}>
                {ebeln === '—' ? (
                  <Text style={styles.groupHeaderText}>Not created ({rows.length})</Text>
                ) : (
                  <View style={styles.poHeaderCard}>
                    <View style={styles.poHeaderTopRow}>
                      <Text style={styles.poHeaderTitle}>PO {ebeln}</Text>
                      {errorRows.length === 0 ? (
                        <View style={[styles.statusBadge, { backgroundColor: `${colors.green}14` }]}>
                          <Ionicons name="checkmark-circle" size={11} color={colors.green} />
                          <Text style={[styles.statusBadgeText, { color: colors.green }]}>All items posted</Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadge, { backgroundColor: `${colors.red}14` }]}>
                          <Ionicons name="alert-circle" size={11} color={colors.red} />
                          <Text style={[styles.statusBadgeText, { color: colors.red }]}>{errorRows.length} failed</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.fieldGrid}>
                      <InfoField label="Vendor" value={stripLeadingZeros(first.lifnr)} />
                      <InfoField label="Items" value={String(rows.length)} />
                      <View style={styles.infoField}>
                        <Text style={styles.infoLabel}>Total Amount</Text>
                        <Text style={styles.poTotal}>
                          {groupTotal != null ? `${first.waers || ''} ${formatAmount(groupTotal)}`.trim() : '—'}
                        </Text>
                      </View>
                    </View>

                    {(() => {
                      const att = getAttachment(ebeln);
                      return (
                        <View style={styles.quotAttachBlock}>
                          <Text style={styles.infoLabel}>Quotation Attachment</Text>
                          {att.saved ? (
                            <View style={[styles.statusBadge, { alignSelf: 'flex-start', backgroundColor: `${colors.green}14` }]}>
                              <Ionicons name="checkmark-circle" size={11} color={colors.green} />
                              <Text style={[styles.statusBadgeText, { color: colors.green }]}>{att.fileName} attached</Text>
                            </View>
                          ) : (
                            <>
                              <View style={styles.uploadRow}>
                                <Pressable
                                  style={[styles.attachBtn, att.attaching && styles.btnDisabled]}
                                  onPress={() => pickQuotation(ebeln)}
                                  disabled={att.attaching}
                                  accessibilityRole="button"
                                >
                                  <Ionicons name={att.fileName ? 'document-attach-outline' : 'attach-outline'} size={14} color={colors.rust} />
                                  <Text style={styles.attachBtnText} numberOfLines={1}>
                                    {att.attaching ? 'Attaching…' : (att.fileName || 'Choose PDF quotation')}
                                  </Text>
                                </Pressable>
                              </View>
                              {!!att.fileName && (
                                <>
                                  <TextInput
                                    value={att.description}
                                    onChangeText={(v) => patchAttachment(ebeln, { description: v })}
                                    placeholder="Description (optional)"
                                    placeholderTextColor={colors.inkSoft}
                                    style={styles.descInput}
                                  />
                                  <Pressable
                                    style={[styles.saveAttachBtn, att.saving && styles.btnDisabled]}
                                    onPress={() => saveQuotation(ebeln)}
                                    disabled={att.saving}
                                    accessibilityRole="button"
                                  >
                                    {att.saving ? (
                                      <ActivityIndicator size="small" color={colors.white} />
                                    ) : (
                                      <Text style={styles.saveAttachBtnText}>Save Attachment</Text>
                                    )}
                                  </Pressable>
                                </>
                              )}
                              {att.error && <Text style={styles.rowErrorText}>{att.error}</Text>}
                            </>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                )}

                <Text style={styles.itemDetailsLabel}>{ebeln === '—' ? 'Line Items' : 'Item Details'}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
                  <View>
                    <View style={styles.tableHeaderRow}>
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
                    </View>

                    {rows.map((row, i) => {
                      const rowBg = row.type === 'E' ? `${colors.red}0A` : `${colors.green}0A`;
                      // Sticky (frozen) cells need a fully OPAQUE background — a translucent tint
                      // lets whatever is scrolling underneath show through as it passes behind
                      // them, which is exactly what looked like "overlapping data" while
                      // scrolling horizontally. Non-sticky cells keep the translucent rowBg above
                      // since nothing scrolls underneath them.
                      const rowBgSolid = row.type === 'E' ? '#FBEEEE' : '#EEF6F1';
                      return (
                        <View key={`${ebeln}-${row.rowno}-${i}`} style={[styles.tableRow, { backgroundColor: rowBg }]}>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.item} sticky={UPLOAD_FROZEN_LEFT.item} background={rowBgSolid}>{formatEbelp(row.ebelp)}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.description} sticky={UPLOAD_FROZEN_LEFT.description} background={rowBgSolid}>{row.txz01 || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.vendor} sticky={UPLOAD_FROZEN_LEFT.vendor} background={rowBgSolid}>{stripLeadingZeros(row.lifnr) || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.vendorName} sticky={UPLOAD_FROZEN_LEFT.vendorName} background={rowBgSolid}>{row.name1 || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.purchGroup}>{stripLeadingZeros(row.ekgrp) || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.purchOrg}>{stripLeadingZeros(row.ekorg) || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.qty} align="center">{formatUploadNumber(row.menge)}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.amount} align="center">{formatAmount(parseAmount(row.grPrice))}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.currency} align="center">{row.waers || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.glAccount}>{stripLeadingZeros(row.sakto) || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.costCenter}>{stripLeadingZeros(row.kostl) || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.internalOrder}>{stripLeadingZeros(row.orderid) || '—'}</ResultCell>
                          <View style={[styles.tableCell, { width: UPLOAD_RESULT_COLUMNS.status }]}>
                            <View style={[styles.statusBadge, { backgroundColor: row.type === 'E' ? `${colors.red}14` : `${colors.green}14` }]}>
                              <Ionicons
                                name={row.type === 'E' ? 'alert-circle' : 'checkmark-circle'}
                                size={11}
                                color={row.type === 'E' ? colors.red : colors.green}
                              />
                              <Text style={[styles.statusBadgeText, { color: row.type === 'E' ? colors.red : colors.green }]}>
                                {row.type === 'E' ? 'Failed' : 'Posted'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                {errorRows.length > 0 && (
                  <View style={styles.tableErrorsList}>
                    {errorRows.map((r) => (
                      <Text key={r.rowno} style={styles.rowErrorText}>Row {r.rowno}: {r.message}</Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Purchase Order Creation and Details — Finance-only tab. Per instruction, the only way to create
 * a Purchase Order here is the Service PO Bulk Upload flow (see ServicePoUploadSection above); the
 * earlier client-side "Purchase Orders" simulation tab (never a real SAP call) has been removed. */
export default function PurchaseOrderCreation() {
  const { email, role, roleLoading } = usePaymentTrackingAuth();

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  // Defense in depth — the nav bar already hides this link from non-Finance roles, but the route
  // is still reachable by a typed URL.
  if (role !== 'Finance') {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.inkSoft} />
        <Text style={styles.deniedText}>Purchase Order Creation is only available to Finance.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <ProvisionHero
          eyebrow="Finance · Service PO Bulk Upload"
          title="Purchase Order Creation and Details"
          subtitle="Upload an Excel file of Service PO line items, review exactly what's in it, then confirm to create them in SAP."
        />

        <ServicePoUploadSection email={email} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 14,
    paddingBottom: 36,
  },
  panel: {
    gap: 10,
  },
  flex1: { flex: 1 },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  deniedText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  bannerError: {
    backgroundColor: `${colors.red}12`,
    borderColor: `${colors.red}40`,
  },
  bannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  progressTrack: {
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.rust,
  },
  groupHeaderText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  poHeaderCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.rust,
    padding: 10,
    gap: 6,
  },
  poHeaderTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 6,
    columnGap: 8,
  },
  poHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  itemDetailsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  templateLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  templateLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.rust,
  },
  uploadCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  uploadRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  uploadBtn: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: colors.appBg,
  },
  uploadBtnText: {
    fontSize: 12.5,
    color: colors.ink,
    fontWeight: '600',
    flexShrink: 1,
  },
  quotAttachBlock: {
    gap: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.appBg,
  },
  attachBtnText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '600',
    flexShrink: 1,
  },
  descInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontSize: 12.5,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  saveAttachBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.teal,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  saveAttachBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  fetchBtn: {
    backgroundColor: colors.rust,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fetchBtnText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '700',
  },
  cancelBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.inkSoft,
    fontSize: 12.5,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 10.5,
    color: colors.inkSoft,
    lineHeight: 15,
  },
  reviewSection: {
    gap: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  infoField: {
    minWidth: 96,
    flexGrow: 1,
    flexBasis: '22%',
    gap: 1,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  tableScroll: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.appBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderCell: {
    paddingVertical: 7,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  tableHeaderText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableCell: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  tableCellRight: {
    alignItems: 'flex-end',
  },
  tableCellCenter: {
    alignItems: 'center',
  },
  resultCellText: {
    fontSize: 11.5,
    color: colors.ink,
  },
  resultCellTextCenter: {
    textAlign: 'center',
  },
  tableErrorsList: {
    gap: 3,
    paddingTop: 2,
  },
  rowErrorText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.red,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.teal,
    borderRadius: radii.md,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  downloadBtnText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '700',
  },
  poTotal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.rust,
  },
});
