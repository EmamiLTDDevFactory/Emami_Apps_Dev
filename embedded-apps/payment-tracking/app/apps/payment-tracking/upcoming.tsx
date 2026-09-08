import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radii } from '../../../src/theme/tokens';
import {
  fetchVendorPOFollowups,
  submitProvisionApproval,
  submitProvisionApprovalBatch,
  type ProvisionConfirmation,
  type VendorPOFollowupRow,
} from '../../../src/lib/paymentTrackingApi';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDisplayDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** One row's local, in-progress confirmation. Invoice fields seed from whatever
 * ZVendorPOFollowupSet already had on file (not blank) so reopening this screen doesn't discard a
 * previous partial fill; DelvConf always starts at Yes with no revised date/comments per
 * instruction, regardless of what SAP has on file for those two. */
interface RowState {
  delvConf: boolean;
  revisedDelDate: string;
  comments: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: string;
  submitting: boolean;
  submitted: boolean;
  error: string | null;
}

function initialRowState(row: VendorPOFollowupRow): RowState {
  return {
    delvConf: true,
    revisedDelDate: '',
    comments: '',
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    invoiceAmount: row.invoiceAmount,
    submitting: false,
    submitted: false,
    error: null,
  };
}

/** Date input — raw HTML date input on web, native community picker everywhere else. Same
 * approach as Market Rate's own DateCell (index.tsx). `minDate` (when given) blocks anything
 * earlier than it, both at the browser level (web `min`) and via the native picker's
 * `minimumDate` — used only for Revised Delivery Date (no back-dating), never Invoice Date (a
 * real invoice is routinely dated in the past). */
function DateField({
  value, onChange, label, minDate,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  minDate?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === 'web') {
    return (
      // @ts-expect-error — raw DOM element, valid under react-native-web
      <input
        type="date"
        value={value}
        min={minDate}
        onChange={(e: any) => onChange(e.target.value)}
        aria-label={label}
        style={{
          width: '100%',
          height: 42,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.white,
          color: colors.ink,
          fontSize: 13.5,
          boxSizing: 'border-box',
        }}
      />
    );
  }

  const dateObj = value ? new Date(`${value}T00:00:00`) : new Date();
  return (
    <View>
      <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name="calendar-outline" size={15} color={colors.rust} />
        <Text style={styles.dateBtnText}>{value || 'Select date'}</Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          minimumDate={minDate ? new Date(`${minDate}T00:00:00`) : undefined}
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

/** Read-only label/value pair — wraps onto its own line on a narrow screen instead of ever
 * forcing horizontal scroll, since this screen has no wide fixed-column table anywhere. */
function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

function EditableField({
  label, value, onChange, keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'decimal-pad';
}) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label} *</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboardType} style={styles.editInput} />
    </View>
  );
}

/** Upcoming Provision — User's first side-pane option. ZVendorPOFollowupSet, filtered by the
 * signed-in user's own login email and Zaction='U'. Each row: confirm delivery (Yes/No — No opens
 * a mandatory Revised Delivery Date + Comments popup, no back-dating), fill in the three editable
 * invoice fields, then send for approval (row-wise or as a multi-select mass batch) — POSTs to
 * ZProvHeader (see paymentTrackingApi.ts's submitProvisionApproval/submitProvisionApprovalBatch). */
export default function UpcomingProvision() {
  const { email } = usePaymentTrackingAuth();
  const [rows, setRows] = useState<VendorPOFollowupRow[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [modalDraft, setModalDraft] = useState<{ revisedDelDate: string; comments: string }>({ revisedDelDate: '', comments: '' });
  const [modalTouched, setModalTouched] = useState(false);
  const [massSubmitting, setMassSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!email) {
      setLoading(false);
      setLoadError('Not signed in.');
      return;
    }
    setLoading(true);
    setLoadError(null);
    fetchVendorPOFollowups(email, 'U')
      .then((data) => {
        setRows(data);
        const state: Record<string, RowState> = {};
        data.forEach((r) => { state[r.key] = initialRowState(r); });
        setRowState(state);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load upcoming provision items.'))
      .finally(() => setLoading(false));
  }, [email]);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const openNoModal = (key: string) => {
    const current = rowState[key];
    setModalDraft({ revisedDelDate: current?.revisedDelDate || '', comments: current?.comments || '' });
    setModalTouched(false);
    setModalKey(key);
  };

  const handleDelvConfChange = (key: string, yes: boolean) => {
    if (yes) {
      // Back to Yes clears the revised date/comments — those only apply to a "No" answer.
      patchRow(key, { delvConf: true, revisedDelDate: '', comments: '' });
    } else {
      patchRow(key, { delvConf: false });
      openNoModal(key);
    }
  };

  const confirmModal = () => {
    if (!modalKey) return;
    if (!modalDraft.revisedDelDate || !modalDraft.comments.trim()) {
      setModalTouched(true);
      return;
    }
    patchRow(modalKey, { revisedDelDate: modalDraft.revisedDelDate, comments: modalDraft.comments.trim() });
    setModalKey(null);
  };

  const cancelModal = () => {
    // Cancelling a fresh "No" pick (nothing saved yet) reverts to Yes instead of leaving DelvConf
    // on "No" with its required fields still empty. Cancelling while *editing* an already-saved
    // No answer (comments already on file) leaves that answer untouched.
    if (modalKey && !rowState[modalKey]?.comments) {
      patchRow(modalKey, { delvConf: true });
    }
    setModalKey(null);
  };

  function rowMandatoryError(state: RowState): string | null {
    if (!state.invoiceNo.trim()) return 'Invoice Number is required.';
    if (!state.invoiceDate) return 'Invoice Date is required.';
    if (!state.invoiceAmount.trim() || Number.isNaN(Number(state.invoiceAmount))) return 'A valid Invoice Amount is required.';
    if (!state.delvConf) {
      if (!state.revisedDelDate) return 'Revised Delivery Date is required when delivery is not confirmed.';
      if (!state.comments.trim()) return 'Comments are required when delivery is not confirmed.';
    }
    return null;
  }

  function toConfirmation(row: VendorPOFollowupRow, state: RowState): ProvisionConfirmation {
    return {
      row,
      delvConf: state.delvConf,
      revisedDelDate: state.revisedDelDate,
      comments: state.comments,
      invoiceNo: state.invoiceNo,
      invoiceDate: state.invoiceDate,
      invoiceAmount: state.invoiceAmount,
    };
  }

  const submitRow = async (row: VendorPOFollowupRow) => {
    const state = rowState[row.key];
    const err = rowMandatoryError(state);
    if (err) {
      patchRow(row.key, { error: err });
      return;
    }
    patchRow(row.key, { submitting: true, error: null });
    try {
      await submitProvisionApproval([toConfirmation(row, state)]);
      patchRow(row.key, { submitting: false, submitted: true });
      setBanner({ type: 'success', message: `PO ${row.poNumber} / Item ${row.poItemNo} sent for approval.` });
    } catch (e) {
      patchRow(row.key, { submitting: false, error: e instanceof Error ? e.message : 'Could not send this for approval.' });
    }
  };

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const submitSelected = async () => {
    const targets = rows.filter((r) => selected.has(r.key) && !rowState[r.key]?.submitted);
    if (targets.length === 0) return;

    // Validate every selected row up front — a single bad row shouldn't silently drop out of an
    // otherwise-successful mass submission.
    const badRow = targets.find((r) => rowMandatoryError(rowState[r.key]));
    if (badRow) {
      const err = rowMandatoryError(rowState[badRow.key])!;
      patchRow(badRow.key, { error: err });
      setBanner({ type: 'error', message: `PO ${badRow.poNumber} / Item ${badRow.poItemNo}: ${err}` });
      return;
    }

    setMassSubmitting(true);
    targets.forEach((r) => patchRow(r.key, { submitting: true, error: null }));
    const confirmations = targets.map((row) => toConfirmation(row, rowState[row.key]));

    const failures = await submitProvisionApprovalBatch(confirmations);
    const failedLifnrs = new Set(failures.map((f) => f.lifnr));
    targets.forEach((row) => {
      if (failedLifnrs.has(row.lifnr)) {
        const failure = failures.find((f) => f.lifnr === row.lifnr);
        patchRow(row.key, { submitting: false, error: failure?.error || 'Could not send this for approval.' });
      } else {
        patchRow(row.key, { submitting: false, submitted: true });
      }
    });
    setSelected(new Set());
    setMassSubmitting(false);

    if (failures.length === 0) {
      setBanner({ type: 'success', message: `${targets.length} item(s) sent for approval.` });
    } else {
      setBanner({ type: 'error', message: `${failures.length} vendor group(s) failed — see the affected rows below.` });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <ProvisionHero
          eyebrow="Provision Tracking"
          title="Upcoming Provision"
          subtitle="Confirm delivery for each PO item, add the invoice details, and send it for approval."
        />

        {banner && (
          <View style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
            <Ionicons
              name={banner.type === 'error' ? 'alert-circle' : 'checkmark-circle'}
              size={16}
              color={banner.type === 'error' ? colors.red : colors.green}
            />
            <Text style={[styles.bannerText, { color: banner.type === 'error' ? colors.red : colors.green }]}>
              {banner.message}
            </Text>
            <Pressable onPress={() => setBanner(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
              <Ionicons name="close" size={16} color={colors.inkSoft} />
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading upcoming provision items…</Text>
          </View>
        ) : loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming provision items.</Text>
        ) : (
          <>
            {selected.size > 0 && (
              <View style={styles.massBar}>
                <Text style={styles.massBarText}>{selected.size} selected</Text>
                <Pressable
                  style={[styles.massBtn, massSubmitting && styles.btnDisabled]}
                  onPress={submitSelected}
                  disabled={massSubmitting}
                  accessibilityRole="button"
                >
                  {massSubmitting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.massBtnText}>Send Selected for Approval</Text>
                  )}
                </Pressable>
              </View>
            )}

            {rows.map((row) => {
              const state = rowState[row.key];
              if (!state) return null;
              return (
                <View key={row.key} style={[styles.card, state.submitted && styles.cardSubmitted]}>
                  <View style={styles.cardHeader}>
                    {!state.submitted && (
                      <Pressable
                        onPress={() => toggleSelected(row.key)}
                        style={styles.checkbox}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected.has(row.key) }}
                        accessibilityLabel={`Select PO ${row.poNumber} item ${row.poItemNo}`}
                      >
                        <Ionicons
                          name={selected.has(row.key) ? 'checkbox' : 'square-outline'}
                          size={19}
                          color={selected.has(row.key) ? colors.rust : colors.inkSoft}
                        />
                      </Pressable>
                    )}
                    <View style={styles.flex1}>
                      <Text style={styles.cardTitle}>PO {row.poNumber} · Item {row.poItemNo}</Text>
                      {row.materialDesc ? <Text style={styles.cardSubtitle} numberOfLines={1}>{row.materialDesc}</Text> : null}
                    </View>
                    {state.submitted && (
                      <View style={styles.submittedBadge}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                        <Text style={styles.submittedBadgeText}>Sent for approval</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.fieldGrid}>
                    <InfoField label="Delivery Date" value={formatDisplayDate(row.deliveryDate)} />
                    <InfoField label="Provision Value" value={row.provisionValue ? `${row.provisionValue} ${row.currency}` : '—'} />
                    {state.submitted ? (
                      <>
                        <InfoField label="Invoice Number" value={state.invoiceNo} />
                        <InfoField label="Invoice Date" value={formatDisplayDate(state.invoiceDate)} />
                        <InfoField label="Invoice Amount" value={state.invoiceAmount} />
                      </>
                    ) : (
                      <>
                        <EditableField
                          label="Invoice Number"
                          value={state.invoiceNo}
                          onChange={(v) => patchRow(row.key, { invoiceNo: v })}
                        />
                        <View style={styles.infoField}>
                          <Text style={styles.infoLabel}>Invoice Date *</Text>
                          <DateField
                            value={state.invoiceDate}
                            onChange={(v) => patchRow(row.key, { invoiceDate: v })}
                            label="Invoice Date"
                          />
                        </View>
                        <EditableField
                          label="Invoice Amount"
                          value={state.invoiceAmount}
                          onChange={(v) => patchRow(row.key, { invoiceAmount: v })}
                          keyboardType="decimal-pad"
                        />
                      </>
                    )}
                    {!state.delvConf && (
                      <>
                        <InfoField label="Revised Delivery Date" value={formatDisplayDate(state.revisedDelDate)} />
                        <InfoField label="Comments" value={state.comments} />
                      </>
                    )}
                  </View>

                  <View style={styles.delvConfRow}>
                    <Text style={styles.delvConfLabel}>Delivery Confirmed?</Text>
                    <View style={styles.delvConfOptions}>
                      <Pressable
                        style={[styles.delvConfBtn, state.delvConf && styles.delvConfBtnYesActive]}
                        onPress={() => handleDelvConfChange(row.key, true)}
                        disabled={state.submitted}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.delvConfBtnText, state.delvConf && styles.delvConfBtnTextActiveYes]}>Yes</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.delvConfBtn, !state.delvConf && styles.delvConfBtnNoActive]}
                        onPress={() => handleDelvConfChange(row.key, false)}
                        disabled={state.submitted}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.delvConfBtnText, !state.delvConf && styles.delvConfBtnTextActiveNo]}>No</Text>
                      </Pressable>
                    </View>
                  </View>

                  {state.error && <Text style={styles.rowErrorText}>{state.error}</Text>}

                  {!state.submitted && (
                    <Pressable
                      style={[styles.sendBtn, state.submitting && styles.btnDisabled]}
                      onPress={() => submitRow(row)}
                      disabled={state.submitting}
                      accessibilityRole="button"
                    >
                      {state.submitting ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text style={styles.sendBtnText}>Send for Approval</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}
          </>
        )}
      </View>

      <Modal visible={modalKey !== null} transparent animationType="fade" onRequestClose={cancelModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delivery Not Confirmed</Text>
            <Text style={styles.modalSubtitle}>Revised Delivery Date and Comments are required.</Text>

            <Text style={styles.modalFieldLabel}>Revised Delivery Date *</Text>
            <DateField
              value={modalDraft.revisedDelDate}
              onChange={(v) => setModalDraft((prev) => ({ ...prev, revisedDelDate: v }))}
              label="Revised Delivery Date"
              minDate={todayIso()}
            />
            {modalTouched && !modalDraft.revisedDelDate && (
              <Text style={styles.modalError}>Revised Delivery Date is required.</Text>
            )}

            <Text style={[styles.modalFieldLabel, styles.modalFieldLabelSpaced]}>Comments *</Text>
            <TextInput
              value={modalDraft.comments}
              onChangeText={(v) => setModalDraft((prev) => ({ ...prev, comments: v }))}
              placeholder="Reason for the delay…"
              multiline
              numberOfLines={3}
              style={styles.modalTextArea}
            />
            {modalTouched && !modalDraft.comments.trim() && (
              <Text style={styles.modalError}>Comments are required.</Text>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={cancelModal} accessibilityRole="button">
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={confirmModal} accessibilityRole="button">
                <Text style={styles.modalConfirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  panel: {
    gap: 16,
  },
  flex1: { flex: 1 },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  errorText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.red,
  },
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    paddingVertical: 40,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
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
  massBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  massBarText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  massBtn: {
    backgroundColor: colors.rust,
    borderRadius: radii.md,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  massBtnText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(31,27,51,0.06)' },
      default: { shadowColor: colors.plum, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
    }),
  },
  cardSubmitted: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    padding: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.green}14`,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  submittedBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.green,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoField: {
    minWidth: 150,
    flexGrow: 1,
    flexBasis: '30%',
    gap: 4,
  },
  infoLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.ink,
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13.5,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  dateBtnText: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  delvConfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  delvConfLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  delvConfOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  delvConfBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  delvConfBtnYesActive: {
    backgroundColor: `${colors.green}14`,
    borderColor: colors.green,
  },
  delvConfBtnNoActive: {
    backgroundColor: `${colors.red}14`,
    borderColor: colors.red,
  },
  delvConfBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  delvConfBtnTextActiveYes: {
    color: colors.green,
  },
  delvConfBtnTextActiveNo: {
    color: colors.red,
  },
  rowErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.red,
  },
  sendBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.rust,
    borderRadius: radii.md,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  sendBtnText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(31,27,51,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 4,
    marginBottom: 14,
  },
  modalFieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.inkSoft,
    marginBottom: 6,
  },
  modalFieldLabelSpaced: {
    marginTop: 12,
  },
  modalTextArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalError: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.red,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  modalConfirmBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    backgroundColor: colors.rust,
  },
  modalConfirmText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.white,
  },
});
