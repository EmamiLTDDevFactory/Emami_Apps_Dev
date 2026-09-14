import React, { useCallback, useEffect, useState } from 'react';
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
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

const STORAGE_KEY = 'payment-tracking-created-pos';

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

function EditField({ label, value, onChange, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void; keyboardType?: 'decimal-pad';
}) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboardType} style={styles.editInput} />
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

/** Purchase Order Creation and Details — Admin-only tab. Explicitly a SIMULATION (per instruction):
 * Admin uploads an Excel file of line items, "Fetch" runs a client-side validation pass sorting
 * rows into success/error (see poCreationSimulator.ts), Admin edits rows inline until every one is
 * clean, then "Save" turns the success rows into simulated Purchase Orders (grouped one PO per
 * vendor+purchase org+plant+currency) — kept in this browser's localStorage, never sent to SAP,
 * since there's no confirmed real entity for this. Admin can then review each created PO's header
 * + item detail and download everything created so far as an Excel workbook. */
export default function PurchaseOrderCreation() {
  const { isAdmin, roleLoading } = usePaymentTrackingAuth();
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
  const canSave = uploadedRows.length > 0 && errorCount === 0;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    const newPos = createPurchaseOrders(uploadedRows, createdPos);
    const merged = [...newPos, ...createdPos];
    setCreatedPos(merged);
    saveStoredPos(merged);
    setUploadedRows([]);
    setPickedFileName('');
    setPickedUri('');
    setSaving(false);
    setBanner({
      type: 'success',
      message: `${newPos.length} purchase order${newPos.length === 1 ? '' : 's'} created: ${newPos.map((p) => p.poNumber).join(', ')}.`,
    });
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

  if (!isAdmin) {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.inkSoft} />
        <Text style={styles.deniedText}>Purchase Order Creation is only available to Admins.</Text>
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

        {banner && (
          <View style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
            <Ionicons name={banner.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={16} color={banner.type === 'error' ? colors.red : colors.green} />
            <Text style={[styles.bannerText, { color: banner.type === 'error' ? colors.red : colors.green }]}>{banner.message}</Text>
            <Pressable onPress={() => setBanner(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
              <Ionicons name="close" size={16} color={colors.inkSoft} />
            </Pressable>
          </View>
        )}

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
            Expected columns: Vendor Code, Vendor Name, Material Code, Material Description, Quantity, Unit Price, Currency, Plant, Purchase Org, Delivery Date, Cost Center, GL Account.
          </Text>
        </View>

        {uploadedRows.length > 0 && (
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

            {uploadedRows.map((row) => (
              <View
                key={row.key}
                style={[styles.card, { borderLeftWidth: 3, borderLeftColor: row.status === 'success' ? colors.green : colors.red }]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: row.status === 'success' ? `${colors.green}14` : `${colors.red}14` }]}>
                    <Ionicons
                      name={row.status === 'success' ? 'checkmark-circle' : 'alert-circle'}
                      size={12}
                      color={row.status === 'success' ? colors.green : colors.red}
                    />
                    <Text style={[styles.statusBadgeText, { color: row.status === 'success' ? colors.green : colors.red }]}>
                      {row.status === 'success' ? 'Success' : 'Error'}
                    </Text>
                  </View>
                  <View style={styles.flex1} />
                  <Pressable onPress={() => removeUploadedRow(row.key)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove this row">
                    <Ionicons name="trash-outline" size={15} color={colors.inkSoft} />
                  </Pressable>
                </View>

                {row.errorMessage ? <Text style={styles.rowErrorText}>{row.errorMessage}</Text> : null}

                <View style={styles.fieldGrid}>
                  <EditField label="Vendor Code" value={row.vendorCode} onChange={(v) => patchUploadedRow(row.key, { vendorCode: v })} />
                  <EditField label="Vendor Name" value={row.vendorName} onChange={(v) => patchUploadedRow(row.key, { vendorName: v })} />
                  <EditField label="Material Code" value={row.materialCode} onChange={(v) => patchUploadedRow(row.key, { materialCode: v })} />
                  <EditField label="Material Description" value={row.materialDesc} onChange={(v) => patchUploadedRow(row.key, { materialDesc: v })} />
                  <EditField label="Quantity" value={row.quantity} onChange={(v) => patchUploadedRow(row.key, { quantity: v })} keyboardType="decimal-pad" />
                  <EditField label="Unit Price" value={row.unitPrice} onChange={(v) => patchUploadedRow(row.key, { unitPrice: v })} keyboardType="decimal-pad" />
                  <EditField label="Currency" value={row.currency} onChange={(v) => patchUploadedRow(row.key, { currency: v })} />
                  <EditField label="Plant" value={row.plant} onChange={(v) => patchUploadedRow(row.key, { plant: v })} />
                  <EditField label="Purchase Org" value={row.purchaseOrg} onChange={(v) => patchUploadedRow(row.key, { purchaseOrg: v })} />
                  <View style={styles.infoField}>
                    <Text style={styles.infoLabel}>Delivery Date</Text>
                    <DateField value={row.deliveryDate} onChange={(v) => patchUploadedRow(row.key, { deliveryDate: v })} label="Delivery Date" />
                  </View>
                  <EditField label="Cost Center" value={row.costCenter} onChange={(v) => patchUploadedRow(row.key, { costCenter: v })} />
                  <EditField label="GL Account" value={row.glAccount} onChange={(v) => patchUploadedRow(row.key, { glAccount: v })} />
                </View>
              </View>
            ))}

            <Pressable
              style={[styles.saveBtn, (!canSave || saving) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!canSave || saving}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveBtnText}>
                  {canSave ? `Confirm & Create Purchase Order${successCount === 1 ? '' : 's'}` : 'Fix all error rows to continue'}
                </Text>
              )}
            </Pressable>
          </View>
        )}

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
                            <InfoField label="Material Code" value={item.materialCode} />
                            <InfoField label="Material Description" value={item.materialDesc} />
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 9,
    gap: 5,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(31,27,51,0.05)' },
      default: { shadowColor: colors.plum, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  editInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 7,
    fontSize: 12,
    color: colors.ink,
    backgroundColor: colors.white,
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
