import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { colors, radii } from '../../../src/theme/tokens';
import {
  createPurchaseOrders,
  exportCreatedPosToExcel,
  parseExcelFile,
  revalidateRow,
  type CreatedPo,
  type UploadedPoRow,
} from '../../../src/lib/poCreationSimulator';
import {
  uploadServicePoFile,
  PoUploadError,
  type PoUploadResult,
  type PoUploadResultRow,
} from '../../../src/lib/paymentTrackingApi';
import { exportFailedRowsToCsv } from '../../../src/lib/exportCsv';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

const STORAGE_KEY = 'payment-tracking-created-pos';
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Bundled via Metro (see metro.config.js's assetExts) from assets/files/ — same mechanism the
// sidebar logo already uses (see _layout.tsx's require of emami-apps-logo.png), so it merges into
// the hub's shared dist/assets/ at build time (see scripts/build-embedded-apps.js's
// SHARED_FOLDERS) without needing separate hosting. On web this resolves directly to a servable
// URI string; the object-with-.uri shape is handled too in case a native build ever reaches here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SERVICE_PO_TEMPLATE_ASSET = require('../../../assets/files/ZMM_SRV_PO_Upload_Template.xlsx');
const SERVICE_PO_TEMPLATE_URL: string =
  typeof SERVICE_PO_TEMPLATE_ASSET === 'string' ? SERVICE_PO_TEMPLATE_ASSET : (SERVICE_PO_TEMPLATE_ASSET?.uri ?? '');

function loadStoredPos(): CreatedPo[] {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredPos(pos: CreatedPo[]): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // Storage full/unavailable — the created POs still live in this session's own state, just
    // won't survive a refresh. Nothing actionable for the user here.
  }
}

/** Same date-input pattern as every other screen in this app (raw HTML date input on web, native
 * community picker everywhere else) — duplicated per this app's own convention. */
function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <input
        type="date"
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        aria-label={label}
        style={{
          width: '100%',
          height: 32,
          padding: '4px 6px',
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.white,
          color: colors.ink,
          fontSize: 12,
          boxSizing: 'border-box',
        }}
      />
    );
  }

  const dateObj = value ? new Date(`${value}T00:00:00`) : new Date();
  return (
    <View>
      <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name="calendar-outline" size={13} color={colors.rust} />
        <Text style={styles.dateBtnText}>{value || 'Select date'}</Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === 'android' ? 'spinner' : 'default'}
          onChange={(_event: any, selected?: Date) => {
            setShowPicker(Platform.OS === 'ios');
            if (selected) onChange(selected.toISOString().split('T')[0]);
          }}
        />
      )}
    </View>
  );
}

/** Column widths for the "2. Review line items" report table — only the template's own columns
 * (required ones marked with a trailing * in the header); no Material Code/Description, since a
 * Service PO has no material master line and the template doesn't carry those fields. */
const TABLE_COLUMNS = {
  row: 30,
  status: 80,
  vendorCode: 104,
  vendorName: 120,
  quantity: 68,
  unitPrice: 84,
  currency: 64,
  plant: 64,
  purchaseOrg: 88,
  deliveryDate: 118,
  costCenter: 96,
  glAccount: 96,
  remove: 36,
} as const;

/** `sticky` (a left offset in px) freezes this header cell while its table scrolls horizontally —
 * web-only (react-native-web passes 'sticky' straight through to CSS; RN's own ViewStyle type
 * doesn't know that position, hence the cast), used by the Service PO Bulk Upload report to freeze
 * columns through Vendor Name. Omit it for a normal, non-frozen header cell. */
function TableHeaderCell({ width, sticky, children }: { width: number; sticky?: number; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.tableHeaderCell,
        { width },
        sticky != null && ({ position: 'sticky', left: sticky, zIndex: 3, backgroundColor: colors.appBg } as any),
      ]}
    >
      <Text style={styles.tableHeaderText}>{children}</Text>
    </View>
  );
}

function TableCellInput({ width, value, onChange, keyboardType }: {
  width: number; value: string; onChange: (v: string) => void; keyboardType?: 'decimal-pad';
}) {
  return (
    <View style={[styles.tableCell, { width }]}>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboardType} style={styles.tableCellInput} />
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

function formatMoney(value: string | number, currency: string): string {
  const n = Number(value);
  return `${Number.isNaN(n) ? value : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`.trim();
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
  width: number; align?: 'right'; sticky?: number; background?: string; children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.tableCell,
        { width },
        align === 'right' && styles.tableCellRight,
        sticky != null && ({ position: 'sticky', left: sticky, zIndex: 2, backgroundColor: background || colors.white } as any),
      ]}
    >
      <Text style={styles.resultCellText} numberOfLines={2}>{children}</Text>
    </View>
  );
}

const STATUS_BANNER_STYLE: Record<PoUploadResult['status'], { bg: string; border: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  S: { bg: `${colors.green}12`, border: `${colors.green}40`, color: colors.green, icon: 'checkmark-circle' },
  P: { bg: '#FFFBEB', border: `${colors.amber}40`, color: colors.amber, icon: 'alert-circle' },
  E: { bg: `${colors.red}12`, border: `${colors.red}40`, color: colors.red, icon: 'close-circle' },
};

/** Service PO Bulk Upload — sub-tab inside the Admin PO Creation screen. Unlike the sibling
 * "Purchase Orders" tab (an explicit client-side simulation, see poCreationSimulator.ts), this
 * posts for real to SAP's ZSrvPOUploadSet deep entity (see uploadServicePoFile in
 * paymentTrackingApi.ts) — a single POST whose response carries the full per-row S/P/E result.
 * The backend owns all .xlsx parsing/validation; this screen never opens the workbook itself. */
function ServicePoUploadSection({ email }: { email: string | null }) {
  const [pickedFileName, setPickedFileName] = useState('');
  const [pickedUri, setPickedUri] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PoUploadResult | null>(null);
  const [errorBanner, setErrorBanner] = useState<{ kind: 'timeout' | 'network' | 'sap'; message: string } | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const groups = useMemo(() => (result ? groupByEbeln(result.rows) : []), [result]);

  const pickFile = async () => {
    setFileError(null);
    setErrorBanner(null);
    setResult(null);
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
      setPickedFileName('');
      setPickedUri('');
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
    if (SERVICE_PO_TEMPLATE_URL) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(SERVICE_PO_TEMPLATE_URL, '_blank');
      return;
    }
    setTemplateNotice("Template isn't hosted yet — check back soon.");
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

      <View style={styles.uploadCard}>
        <Text style={styles.sectionTitle}>Upload Excel file</Text>
        <View style={styles.uploadRow}>
          <Pressable style={styles.uploadBtn} onPress={pickFile} accessibilityRole="button">
            <Ionicons name="cloud-upload-outline" size={15} color={colors.rust} />
            <Text style={styles.uploadBtnText} numberOfLines={1}>{pickedFileName || 'Choose Excel file (.xlsx)'}</Text>
          </Pressable>
          <Pressable
            style={[styles.fetchBtn, (!pickedUri || uploading || !email) && styles.btnDisabled]}
            onPress={handleUpload}
            disabled={!pickedUri || uploading || !email}
            accessibilityRole="button"
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.fetchBtnText}>Upload{progress > 0 ? ` ${progress}%` : ''}</Text>
            )}
          </Pressable>
        </View>
        {fileError && <Text style={styles.rowErrorText}>{fileError}</Text>}

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
                      <InfoField label="Total Amount" value={groupTotal != null ? formatAmount(groupTotal) : '—'} />
                    </View>
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
                      <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.qty}>Qty</TableHeaderCell>
                      <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.amount}>Amount</TableHeaderCell>
                      <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.currency}>Currency</TableHeaderCell>
                      <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.glAccount}>GL Account</TableHeaderCell>
                      <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.costCenter}>Cost Center</TableHeaderCell>
                      <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.internalOrder}>Internal Order</TableHeaderCell>
                      <TableHeaderCell width={UPLOAD_RESULT_COLUMNS.status}>Status</TableHeaderCell>
                    </View>

                    {rows.map((row, i) => {
                      const rowBg = row.type === 'E' ? `${colors.red}0A` : `${colors.green}0A`;
                      return (
                        <View key={`${ebeln}-${row.rowno}-${i}`} style={[styles.tableRow, { backgroundColor: rowBg }]}>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.item} sticky={UPLOAD_FROZEN_LEFT.item} background={rowBg}>{formatEbelp(row.ebelp)}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.description} sticky={UPLOAD_FROZEN_LEFT.description} background={rowBg}>{row.txz01 || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.vendor} sticky={UPLOAD_FROZEN_LEFT.vendor} background={rowBg}>{stripLeadingZeros(row.lifnr) || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.vendorName} sticky={UPLOAD_FROZEN_LEFT.vendorName} background={rowBg}>{row.name1 || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.purchGroup}>{stripLeadingZeros(row.ekgrp) || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.purchOrg}>{stripLeadingZeros(row.ekorg) || '—'}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.qty} align="right">{formatUploadNumber(row.menge)}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.amount} align="right">{formatAmount(parseAmount(row.grPrice))}</ResultCell>
                          <ResultCell width={UPLOAD_RESULT_COLUMNS.currency}>{row.waers || '—'}</ResultCell>
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

/** Purchase Order Creation and Details — Admin-only tab. Explicitly a SIMULATION (per instruction):
 * Admin uploads an Excel file of line items, "Fetch" runs a client-side validation pass sorting
 * rows into success/error (see poCreationSimulator.ts), Admin edits rows inline until every one is
 * clean, then "Save" turns the success rows into simulated Purchase Orders (grouped one PO per
 * vendor+purchase org+plant+currency) — kept in this browser's localStorage, never sent to SAP,
 * since there's no confirmed real entity for this. Admin can then review each created PO's header
 * + item detail and download everything created so far as an Excel workbook. */
export default function PurchaseOrderCreation() {
  const { email, role, roleLoading } = usePaymentTrackingAuth();
  const [activeTab, setActiveTab] = useState<'create' | 'bulk'>('create');
  const [pickedFileName, setPickedFileName] = useState('');
  const [pickedUri, setPickedUri] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [uploadedRows, setUploadedRows] = useState<UploadedPoRow[]>([]);
  const [createdPos, setCreatedPos] = useState<CreatedPo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setCreatedPos(loadStoredPos());
  }, []);

  const pickFile = async () => {
    setFetchError(null);
    setBanner(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = (result as any).assets?.[0] ?? result;
      if (!asset?.uri) return;
      setPickedFileName(asset.name || 'workbook.xlsx');
      setPickedUri(asset.uri);
      setUploadedRows([]);
    } catch {
      setFetchError('Could not open the file picker. Please try again.');
    }
  };

  const handleFetch = async () => {
    if (!pickedUri) return;
    setFetching(true);
    setFetchError(null);
    try {
      const rows = await parseExcelFile(pickedUri);
      if (rows.length === 0) {
        setFetchError('No line items found in this file — check it has a header row and at least one data row.');
      }
      setUploadedRows(rows);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Could not read this Excel file.');
    } finally {
      setFetching(false);
    }
  };

  const patchUploadedRow = useCallback((key: string, patch: Partial<UploadedPoRow>) => {
    setUploadedRows((prev) => prev.map((r) => (r.key === key ? revalidateRow({ ...r, ...patch }) : r)));
  }, []);

  const removeUploadedRow = (key: string) => {
    setUploadedRows((prev) => prev.filter((r) => r.key !== key));
  };

  const successCount = uploadedRows.filter((r) => r.status === 'success').length;
  const errorCount = uploadedRows.length - successCount;

  const handleSave = () => {
    if (uploadedRows.length === 0) return;
    setSaving(true);
    // If any line item in a PO group has an error, that whole PO is skipped (not just the bad
    // row) — remainingRows hands back every row from a skipped group so it stays in the review
    // table for the Admin to fix or remove and save again; other, error-free groups are created.
    const { created: newPos, remainingRows, skippedGroupCount } = createPurchaseOrders(uploadedRows, createdPos);
    const merged = [...newPos, ...createdPos];
    setCreatedPos(merged);
    saveStoredPos(merged);
    setUploadedRows(remainingRows);
    if (remainingRows.length === 0) {
      setPickedFileName('');
      setPickedUri('');
    }
    setSaving(false);

    if (newPos.length > 0 && skippedGroupCount === 0) {
      setBanner({
        type: 'success',
        message: `${newPos.length} purchase order${newPos.length === 1 ? '' : 's'} created: ${newPos.map((p) => p.poNumber).join(', ')}.`,
      });
    } else if (newPos.length > 0) {
      setBanner({
        type: 'error',
        message: `${newPos.length} purchase order${newPos.length === 1 ? '' : 's'} created: ${newPos.map((p) => p.poNumber).join(', ')}. ${skippedGroupCount} PO${skippedGroupCount === 1 ? '' : 's'} skipped — every line item in a PO must be error-free. Fix or remove the error rows below and save again.`,
      });
    } else {
      setBanner({
        type: 'error',
        message: 'No purchase orders created — every group has at least one error row. Fix or remove the error rows below and save again.',
      });
    }
  };

  const toggleExpand = (poNumber: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(poNumber)) next.delete(poNumber); else next.add(poNumber);
      return next;
    });
  };

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
          eyebrow="Admin · Simulation"
          title="Purchase Order Creation and Details"
          subtitle="Upload an Excel file of line items, review the fetched rows, then confirm to create simulated Purchase Orders."
        />

        <View style={styles.tabRow}>
          {([
            { key: 'create', label: 'Purchase Orders' },
            { key: 'bulk', label: 'Service PO Bulk Upload' },
          ] as const).map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="button"
            >
              <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'bulk' && <ServicePoUploadSection email={email} />}

        {activeTab === 'create' && banner && (
          <View style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
            <Ionicons name={banner.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={16} color={banner.type === 'error' ? colors.red : colors.green} />
            <Text style={[styles.bannerText, { color: banner.type === 'error' ? colors.red : colors.green }]}>{banner.message}</Text>
            <Pressable onPress={() => setBanner(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
              <Ionicons name="close" size={16} color={colors.inkSoft} />
            </Pressable>
          </View>
        )}

        {activeTab === 'create' && (
        <View style={styles.uploadCard}>
          <Text style={styles.sectionTitle}>1. Upload Excel file</Text>
          <View style={styles.uploadRow}>
            <Pressable style={styles.uploadBtn} onPress={pickFile} accessibilityRole="button">
              <Ionicons name="cloud-upload-outline" size={15} color={colors.rust} />
              <Text style={styles.uploadBtnText} numberOfLines={1}>{pickedFileName || 'Choose Excel file (.xlsx)'}</Text>
            </Pressable>
            <Pressable
              style={[styles.fetchBtn, (!pickedUri || fetching) && styles.btnDisabled]}
              onPress={handleFetch}
              disabled={!pickedUri || fetching}
              accessibilityRole="button"
            >
              {fetching ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.fetchBtnText}>Fetch</Text>}
            </Pressable>
          </View>
          {fetchError && <Text style={styles.rowErrorText}>{fetchError}</Text>}
          <Text style={styles.helperText}>
            Expected columns: Vendor Code, Vendor Name, Quantity, Unit Price, Currency, Plant, Purchase Org, Delivery Date, Cost Center, GL Account.
          </Text>
        </View>
        )}

        {activeTab === 'create' && uploadedRows.length > 0 && (
          <View style={styles.reviewSection}>
            <View style={styles.reviewHeader}>
              <Text style={styles.sectionTitle}>2. Review line items</Text>
              <View style={styles.countBadges}>
                <View style={[styles.countBadge, { backgroundColor: `${colors.green}14` }]}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.green} />
                  <Text style={[styles.countBadgeText, { color: colors.green }]}>{successCount} success</Text>
                </View>
                <View style={[styles.countBadge, { backgroundColor: `${colors.red}14` }]}>
                  <Ionicons name="alert-circle" size={12} color={colors.red} />
                  <Text style={[styles.countBadgeText, { color: colors.red }]}>{errorCount} error</Text>
                </View>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View>
                <View style={styles.tableHeaderRow}>
                  <TableHeaderCell width={TABLE_COLUMNS.row}>#</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.status}>Status</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.vendorCode}>Vendor Code *</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.vendorName}>Vendor Name</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.quantity}>Qty *</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.unitPrice}>Unit Price *</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.currency}>Currency</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.plant}>Plant</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.purchaseOrg}>Purch. Org</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.deliveryDate}>Delivery Date *</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.costCenter}>Cost Center</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.glAccount}>GL Account</TableHeaderCell>
                  <TableHeaderCell width={TABLE_COLUMNS.remove}> </TableHeaderCell>
                </View>

                {uploadedRows.map((row, index) => (
                  <View
                    key={row.key}
                    style={[
                      styles.tableRow,
                      { backgroundColor: row.status === 'success' ? `${colors.green}0A` : `${colors.red}0A` },
                    ]}
                  >
                    <View style={[styles.tableCell, { width: TABLE_COLUMNS.row }]}>
                      <Text style={styles.rowNumberText}>{index + 1}</Text>
                    </View>
                    <View style={[styles.tableCell, { width: TABLE_COLUMNS.status }]}>
                      <View style={[styles.statusBadge, { backgroundColor: row.status === 'success' ? `${colors.green}14` : `${colors.red}14` }]}>
                        <Ionicons
                          name={row.status === 'success' ? 'checkmark-circle' : 'alert-circle'}
                          size={11}
                          color={row.status === 'success' ? colors.green : colors.red}
                        />
                        <Text style={[styles.statusBadgeText, { color: row.status === 'success' ? colors.green : colors.red }]}>
                          {row.status === 'success' ? 'OK' : 'Error'}
                        </Text>
                      </View>
                    </View>
                    <TableCellInput width={TABLE_COLUMNS.vendorCode} value={row.vendorCode} onChange={(v) => patchUploadedRow(row.key, { vendorCode: v })} />
                    <TableCellInput width={TABLE_COLUMNS.vendorName} value={row.vendorName} onChange={(v) => patchUploadedRow(row.key, { vendorName: v })} />
                    <TableCellInput width={TABLE_COLUMNS.quantity} value={row.quantity} onChange={(v) => patchUploadedRow(row.key, { quantity: v })} keyboardType="decimal-pad" />
                    <TableCellInput width={TABLE_COLUMNS.unitPrice} value={row.unitPrice} onChange={(v) => patchUploadedRow(row.key, { unitPrice: v })} keyboardType="decimal-pad" />
                    <TableCellInput width={TABLE_COLUMNS.currency} value={row.currency} onChange={(v) => patchUploadedRow(row.key, { currency: v })} />
                    <TableCellInput width={TABLE_COLUMNS.plant} value={row.plant} onChange={(v) => patchUploadedRow(row.key, { plant: v })} />
                    <TableCellInput width={TABLE_COLUMNS.purchaseOrg} value={row.purchaseOrg} onChange={(v) => patchUploadedRow(row.key, { purchaseOrg: v })} />
                    <View style={[styles.tableCell, { width: TABLE_COLUMNS.deliveryDate }]}>
                      <DateField value={row.deliveryDate} onChange={(v) => patchUploadedRow(row.key, { deliveryDate: v })} label="Delivery Date" />
                    </View>
                    <TableCellInput width={TABLE_COLUMNS.costCenter} value={row.costCenter} onChange={(v) => patchUploadedRow(row.key, { costCenter: v })} />
                    <TableCellInput width={TABLE_COLUMNS.glAccount} value={row.glAccount} onChange={(v) => patchUploadedRow(row.key, { glAccount: v })} />
                    <View style={[styles.tableCell, { width: TABLE_COLUMNS.remove }]}>
                      <Pressable onPress={() => removeUploadedRow(row.key)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove this row">
                        <Ionicons name="trash-outline" size={15} color={colors.inkSoft} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            {errorCount > 0 && (
              <View style={styles.tableErrorsList}>
                {uploadedRows.map((row, index) => (
                  row.status === 'error'
                    ? <Text key={row.key} style={styles.rowErrorText}>Row {index + 1}: {row.errorMessage}</Text>
                    : null
                ))}
              </View>
            )}

            <Pressable
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveBtnText}>Confirm & Create Purchase Order{successCount === 1 ? '' : 's'}</Text>
              )}
            </Pressable>
            {errorCount > 0 && (
              <Text style={styles.helperText}>
                Rows still in error will not be turned into a PO — any PO group containing one of them is skipped entirely.
              </Text>
            )}
          </View>
        )}

        {activeTab === 'create' && (
        <View style={styles.createdSection}>
          <View style={styles.reviewHeader}>
            <Text style={styles.sectionTitle}>Created Purchase Orders</Text>
            <Pressable
              style={[styles.downloadBtn, createdPos.length === 0 && styles.btnDisabled]}
              onPress={() => exportCreatedPosToExcel(createdPos)}
              disabled={createdPos.length === 0}
              accessibilityRole="button"
            >
              <Ionicons name="download-outline" size={14} color={colors.white} />
              <Text style={styles.downloadBtnText}>Download Excel</Text>
            </Pressable>
          </View>

          {createdPos.length === 0 ? (
            <Text style={styles.emptyText}>No purchase orders created yet.</Text>
          ) : (
            createdPos.map((po) => {
              const isExpanded = expanded.has(po.poNumber);
              return (
                <View key={po.poNumber} style={styles.poCard}>
                  <Pressable style={styles.poCardHeader} onPress={() => toggleExpand(po.poNumber)} accessibilityRole="button">
                    <View style={styles.flex1}>
                      <Text style={styles.poTitle}>PO {po.poNumber}</Text>
                      <Text style={styles.poSubtitle} numberOfLines={1}>{po.vendorName || po.vendorCode} · {po.items.length} item{po.items.length === 1 ? '' : 's'}</Text>
                    </View>
                    <Text style={styles.poTotal}>{formatMoney(po.totalValue, po.currency)}</Text>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.inkSoft} />
                  </Pressable>

                  <View style={styles.fieldGrid}>
                    <InfoField label="Vendor Code" value={po.vendorCode} />
                    <InfoField label="Purchase Org" value={po.purchaseOrg} />
                    <InfoField label="Plant" value={po.plant} />
                    <InfoField label="Currency" value={po.currency} />
                    <InfoField label="Created Date" value={po.createdDate} />
                  </View>

                  {isExpanded && (
                    <View style={styles.itemsWrap}>
                      {po.items.map((item) => (
                        <View key={item.itemNo} style={styles.itemRow}>
                          <View style={styles.fieldGrid}>
                            <InfoField label="Item No" value={item.itemNo} />
                            <InfoField label="Quantity" value={item.quantity} />
                            <InfoField label="Unit Price" value={item.unitPrice} />
                            <InfoField label="Net Value" value={item.netValue} />
                            <InfoField label="Delivery Date" value={item.deliveryDate} />
                            {item.costCenter ? <InfoField label="Cost Center" value={item.costCenter} /> : null}
                            {item.glAccount ? <InfoField label="GL Account" value={item.glAccount} /> : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
        )}
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
  bannerSuccess: {
    backgroundColor: `${colors.green}12`,
    borderColor: `${colors.green}40`,
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
  tabRow: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  tabBtn: {
    borderRadius: radii.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  tabBtnActive: {
    backgroundColor: colors.rust,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  tabBtnTextActive: {
    color: colors.white,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
  countBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  countBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
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
  resultCellText: {
    fontSize: 11.5,
    color: colors.ink,
  },
  tableCellInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 11.5,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  rowNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkSoft,
    textAlign: 'center',
  },
  tableErrorsList: {
    gap: 3,
    paddingTop: 2,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 7,
    backgroundColor: colors.white,
  },
  dateBtnText: {
    fontSize: 11.5,
    color: colors.ink,
    fontWeight: '600',
  },
  rowErrorText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.red,
  },
  saveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.rust,
    borderRadius: radii.md,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  saveBtnText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  createdSection: {
    gap: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
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
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    paddingVertical: 24,
  },
  poCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 6,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(31,27,51,0.05)' },
      default: { shadowColor: colors.plum, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
    }),
  },
  poCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  poTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  poSubtitle: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  poTotal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.rust,
  },
  itemsWrap: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  itemRow: {
    backgroundColor: colors.appBg,
    borderRadius: radii.md,
    padding: 7,
  },
});
