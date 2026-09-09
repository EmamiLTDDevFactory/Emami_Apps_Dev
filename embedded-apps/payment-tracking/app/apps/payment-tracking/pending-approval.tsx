import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

type DecisionFilter = 'all' | 'pending' | 'A' | 'R';

const DECISION_FILTERS: { key: DecisionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'A', label: 'Approved' },
  { key: 'R', label: 'Rejected' },
];

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
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');

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

  const currencies = useMemo(
    () => Array.from(new Set(rows.map((r) => r.currency).filter(Boolean))).sort(),
    [rows]
  );

  // Search + filter narrows what's shown, but selection/decision state stays keyed by the full row
  // set — a row selected before a search term hides it stays selected, same as any other filtered
  // list, so "Select all" below only ever (de)selects what's currently visible.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const decided = rowState[row.key]?.decided ?? null;
      if (decisionFilter === 'pending' && decided) return false;
      if ((decisionFilter === 'A' || decisionFilter === 'R') && decided !== decisionFilter) return false;
      if (currencyFilter !== 'all' && row.currency !== currencyFilter) return false;
      if (q) {
        const haystack = [
          row.poNumber, row.poItemNo, row.vendorName, row.materialDesc, row.invoiceNo, row.comments,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, rowState, search, decisionFilter, currencyFilter]);

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = filteredRows.filter((r) => !rowState[r.key]?.decided);
    setSelected((prev) => {
      const allChecked = selectable.length > 0 && selectable.every((r) => prev.has(r.key));
      const next = new Set(prev);
      selectable.forEach((r) => { if (allChecked) next.delete(r.key); else next.add(r.key); });
      return next;
    });
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

  const selectableCount = filteredRows.filter((r) => !rowState[r.key]?.decided).length;
  const allSelected = selectableCount > 0 && filteredRows.filter((r) => !rowState[r.key]?.decided).every((r) => selected.has(r.key));

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
            <View style={styles.filterBar}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={13} color={colors.inkSoft} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search PO, vendor, invoice, comments…"
                  placeholderTextColor={colors.inkSoft}
                  style={styles.searchInput}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={13} color={colors.inkSoft} />
                  </Pressable>
                )}
              </View>

              <View style={styles.chipRow}>
                {DECISION_FILTERS.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setDecisionFilter(f.key)}
                    style={[styles.chip, decisionFilter === f.key && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter: ${f.label}`}
                  >
                    <Text style={[styles.chipText, decisionFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
                  </Pressable>
                ))}
                {currencies.length > 1 && (
                  <>
                    <View style={styles.chipDivider} />
                    <Pressable
                      onPress={() => setCurrencyFilter('all')}
                      style={[styles.chip, currencyFilter === 'all' && styles.chipActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chipText, currencyFilter === 'all' && styles.chipTextActive]}>All Currencies</Text>
                    </Pressable>
                    {currencies.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => setCurrencyFilter(c)}
                        style={[styles.chip, currencyFilter === c && styles.chipActive]}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.chipText, currencyFilter === c && styles.chipTextActive]}>{c}</Text>
                      </Pressable>
                    ))}
                  </>
                )}
                <Text style={styles.resultCount}>{filteredRows.length} of {rows.length}</Text>
              </View>
            </View>

            {filteredRows.length === 0 ? (
              <Text style={styles.emptyText}>No items match your search/filter.</Text>
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
                      size={17}
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

                {filteredRows.map((row) => {
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
                          size={16}
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
          </>
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
    gap: 8,
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
  filterBar: {
    gap: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: colors.ink,
    ...Platform.select({ web: { outlineStyle: 'none' as any }, default: {} }),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  chipActive: {
    backgroundColor: `${colors.rust}14`,
    borderColor: colors.rust,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  chipTextActive: {
    color: colors.rust,
  },
  chipDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },
  resultCount: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.inkSoft,
    marginLeft: 'auto',
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  selectAllText: {
    fontSize: 11.5,
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
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  massBarText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  massBarActions: {
    flexDirection: 'row',
    gap: 6,
  },
  massBtn: {
    borderRadius: radii.md,
    paddingVertical: 7,
    paddingHorizontal: 12,
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
  cardDecided: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkbox: {
    padding: 2,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
  cardSubtitle: {
    fontSize: 10.5,
    color: colors.inkSoft,
    marginTop: 0,
  },
  decidedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  decidedBadgeApprove: {
    backgroundColor: `${colors.green}14`,
  },
  decidedBadgeReject: {
    backgroundColor: `${colors.red}14`,
  },
  decidedBadgeText: {
    fontSize: 9.5,
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
    flexBasis: '18%',
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
  rowErrorText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.red,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  approveBtn: {
    backgroundColor: colors.green,
    borderRadius: radii.md,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  approveBtnText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '700',
  },
  rejectBtn: {
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: radii.md,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  rejectBtnText: {
    color: colors.red,
    fontSize: 11.5,
    fontWeight: '700',
  },
});
