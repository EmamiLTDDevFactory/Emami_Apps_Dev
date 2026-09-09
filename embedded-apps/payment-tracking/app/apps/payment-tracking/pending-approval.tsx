import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import {
  fetchPendingApprovals,
  submitApprovalDecision,
  submitApprovalDecisionBatch,
  type ApprovalDecision,
  type VendorPOFollowupRow,
} from '../../../src/lib/paymentTrackingApi';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { formatDeliveryDate } from '../../../src/lib/provisionMetrics';

/** Per-row decision state — 'idle' until the Admin acts on it, then locks into whichever decision
 * went through (or an error, which leaves it actionable again). */
interface RowState {
  deciding: ApprovalDecision | null; // which action is in flight, if any
  decided: ApprovalDecision | null; // which action has gone through
  error: string | null;
}

function initialRowState(): RowState {
  return { deciding: null, decided: null, error: null };
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

/** Admin's Pending Approval — every ZVendorPOFollowupSet row scoped to the signed-in Admin's own
 * login email (see fetchPendingApprovals). Each row: PO Number/PO Line Item/Value/Currency/Revised
 * Del Date/Delivery date/Comments/Invoice No/Invoice Date/Invoice Amount, with Approve/Reject
 * actions — row-wise or as a multi-select mass batch — both calling the same ZProvHeader POST as
 * Upcoming Provision's "send for approval" (see paymentTrackingApi.ts's submitApprovalDecision/
 * submitApprovalDecisionBatch), just with Zaction set to 'A'/'R' instead of echoed back. */
export default function PendingApproval() {
  const { email, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const [rows, setRows] = useState<VendorPOFollowupRow[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [massDeciding, setMassDeciding] = useState<ApprovalDecision | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    fetchPendingApprovals(email)
      .then((data) => {
        setRows(data);
        const state: Record<string, RowState> = {};
        data.forEach((r) => { state[r.key] = initialRowState(); });
        setRowState(state);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load pending approvals.'))
      .finally(() => setLoading(false));
  }, [email, isAdmin, roleLoading]);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = rows.filter((r) => !rowState[r.key]?.decided);
    setSelected((prev) =>
      selectable.length > 0 && selectable.every((r) => prev.has(r.key)) ? new Set() : new Set(selectable.map((r) => r.key))
    );
  };

  const decideRow = async (row: VendorPOFollowupRow, decision: ApprovalDecision) => {
    patchRow(row.key, { deciding: decision, error: null });
    try {
      await submitApprovalDecision([row], email || '', decision);
      patchRow(row.key, { deciding: null, decided: decision });
      setBanner({
        type: 'success',
        message: `PO ${row.poNumber} / Item ${row.poItemNo} ${decision === 'A' ? 'approved' : 'rejected'}.`,
      });
    } catch (e) {
      patchRow(row.key, { deciding: null, error: e instanceof Error ? e.message : 'Could not save this decision.' });
    }
  };

  const decideSelected = async (decision: ApprovalDecision) => {
    const targets = rows.filter((r) => selected.has(r.key) && !rowState[r.key]?.decided);
    if (targets.length === 0) return;

    setMassDeciding(decision);
    targets.forEach((r) => patchRow(r.key, { deciding: decision, error: null }));

    const failures = await submitApprovalDecisionBatch(targets, email || '', decision);
    const failedLifnrs = new Set(failures.map((f) => f.lifnr));
    targets.forEach((row) => {
      if (failedLifnrs.has(row.lifnr)) {
        const failure = failures.find((f) => f.lifnr === row.lifnr);
        patchRow(row.key, { deciding: null, error: failure?.error || 'Could not save this decision.' });
      } else {
        patchRow(row.key, { deciding: null, decided: decision });
      }
    });
    setSelected(new Set());
    setMassDeciding(null);

    if (failures.length === 0) {
      setBanner({ type: 'success', message: `${targets.length} item(s) ${decision === 'A' ? 'approved' : 'rejected'}.` });
    } else {
      setBanner({ type: 'error', message: `${failures.length} vendor group(s) failed — see the affected rows below.` });
    }
  };

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (!isAdmin) {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.inkSoft} />
        <Text style={styles.deniedText}>Pending Approval is only available to Admins.</Text>
      </View>
    );
  }

  const selectableCount = rows.filter((r) => !rowState[r.key]?.decided).length;
  const allSelected = selectableCount > 0 && selected.size === selectableCount;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <ProvisionHero
          eyebrow="Admin · Cross-org"
          title="Pending Approval"
          subtitle="Review every vendor's submitted PO item and approve or reject it — one at a time, or as a mass action."
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
            <Text style={styles.loadingText}>Loading pending approvals…</Text>
          </View>
        ) : loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.emptyText}>No pending approvals.</Text>
        ) : (
          <>
            <View style={styles.selectAllRow}>
              <Pressable
                onPress={toggleSelectAll}
                style={styles.checkbox}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allSelected }}
                accessibilityLabel="Select all"
              >
                <Ionicons
                  name={allSelected ? 'checkbox' : 'square-outline'}
                  size={19}
                  color={allSelected ? colors.rust : colors.inkSoft}
                />
              </Pressable>
              <Text style={styles.selectAllText}>Select all</Text>
            </View>

            {selected.size > 0 && (
              <View style={styles.massBar}>
                <Text style={styles.massBarText}>{selected.size} selected</Text>
                <View style={styles.massBarActions}>
                  <Pressable
                    style={[styles.massBtn, styles.massBtnReject, massDeciding !== null && styles.btnDisabled]}
                    onPress={() => decideSelected('R')}
                    disabled={massDeciding !== null}
                    accessibilityRole="button"
                  >
                    {massDeciding === 'R' ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.massBtnText}>Reject Selected</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.massBtn, styles.massBtnApprove, massDeciding !== null && styles.btnDisabled]}
                    onPress={() => decideSelected('A')}
                    disabled={massDeciding !== null}
                    accessibilityRole="button"
                  >
                    {massDeciding === 'A' ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.massBtnText}>Approve Selected</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {rows.map((row) => {
              const state = rowState[row.key];
              if (!state) return null;
              const busy = state.deciding !== null;
              return (
                <View key={row.key} style={[styles.card, state.decided && styles.cardDecided]}>
                  <View style={styles.cardHeader}>
                    {!state.decided && (
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
                      {row.vendorName ? <Text style={styles.cardSubtitle} numberOfLines={1}>{row.vendorName}</Text> : null}
                    </View>
                    {state.decided && (
                      <View style={[styles.decidedBadge, state.decided === 'A' ? styles.decidedBadgeApprove : styles.decidedBadgeReject]}>
                        <Ionicons
                          name={state.decided === 'A' ? 'checkmark-circle' : 'close-circle'}
                          size={13}
                          color={state.decided === 'A' ? colors.green : colors.red}
                        />
                        <Text style={[styles.decidedBadgeText, { color: state.decided === 'A' ? colors.green : colors.red }]}>
                          {state.decided === 'A' ? 'Approved' : 'Rejected'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.fieldGrid}>
                    <InfoField label="PO Number" value={row.poNumber} />
                    <InfoField label="PO Line Item" value={row.poItemNo} />
                    <InfoField label="Value" value={row.provisionValue} />
                    <InfoField label="Currency" value={row.currency} />
                    <InfoField label="Revised Del Date" value={formatDeliveryDate(row.revisedDeliveryDate)} />
                    <InfoField label="Delivery Date" value={formatDeliveryDate(row.deliveryDate)} />
                    <InfoField label="Comments" value={row.comments} />
                    <InfoField label="Invoice No" value={row.invoiceNo} />
                    <InfoField label="Invoice Date" value={formatDeliveryDate(row.invoiceDate)} />
                    <InfoField label="Invoice Amount" value={row.invoiceAmount} />
                  </View>

                  {state.error && <Text style={styles.rowErrorText}>{state.error}</Text>}

                  {!state.decided && (
                    <View style={styles.rowActions}>
                      <Pressable
                        style={[styles.rejectBtn, busy && styles.btnDisabled]}
                        onPress={() => decideRow(row, 'R')}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        {state.deciding === 'R' ? (
                          <ActivityIndicator size="small" color={colors.red} />
                        ) : (
                          <Text style={styles.rejectBtnText}>Reject</Text>
                        )}
                      </Pressable>
                      <Pressable
                        style={[styles.approveBtn, busy && styles.btnDisabled]}
                        onPress={() => decideRow(row, 'A')}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        {state.deciding === 'A' ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Text style={styles.approveBtnText}>Approve</Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
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
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  selectAllText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
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
  massBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  massBtn: {
    borderRadius: radii.md,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  massBtnApprove: {
    backgroundColor: colors.green,
  },
  massBtnReject: {
    backgroundColor: colors.red,
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
    padding: 12,
    gap: 8,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(31,27,51,0.06)' },
      default: { shadowColor: colors.plum, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
    }),
  },
  cardDecided: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    padding: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 1,
  },
  decidedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  decidedBadgeApprove: {
    backgroundColor: `${colors.green}14`,
  },
  decidedBadgeReject: {
    backgroundColor: `${colors.red}14`,
  },
  decidedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoField: {
    minWidth: 130,
    flexGrow: 1,
    flexBasis: '30%',
    gap: 2,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  rowErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.red,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  approveBtn: {
    backgroundColor: colors.green,
    borderRadius: radii.md,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  approveBtnText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '700',
  },
  rejectBtn: {
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: radii.md,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  rejectBtnText: {
    color: colors.red,
    fontSize: 12.5,
    fontWeight: '700',
  },
});
