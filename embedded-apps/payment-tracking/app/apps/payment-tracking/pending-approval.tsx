import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import {
  fetchPendingApprovals,
  submitApprovalDecision,
  submitApprovalDecisionBatch,
  PENDING_APPROVAL_ACTIONS,
  PENDING_APPROVAL_ACTION_LABELS,
  type ApprovalDecision,
  type PendingApprovalAction,
  type VendorPOFollowupRow,
} from '../../../src/lib/paymentTrackingApi';
import { base64ToBlob, base64ToBytes, looksLikePdf } from '../../../src/lib/pdfAttachment';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { useMonthYear } from '../../../src/context/MonthYearContext';
import { filterByMonth, filterByFiscalYear, formatDeliveryDate } from '../../../src/lib/provisionMetrics';

/** Per-row decision state — 'idle' until the Admin acts on it, then locks into whichever decision
 * went through (or an error, which leaves it actionable again). attachmentError is only for the
 * rare case opening an in-hand attachment fails (e.g. malformed base64) — whether one exists at
 * all is read straight off the row (see AttachmentControl below), not tracked here. */
interface RowState {
  deciding: ApprovalDecision | null; // which action is in flight, if any
  decided: ApprovalDecision | null; // which action has gone through
  error: string | null;
  attachmentError: string | null;
}

function initialRowState(): RowState {
  return { deciding: null, decided: null, error: null, attachmentError: null };
}

type DecisionFilter = 'all' | 'pending' | 'A';

const DECISION_FILTERS: { key: DecisionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'A', label: 'Approved' },
];

type ActionFilter = 'all' | PendingApprovalAction;

/** Per-Zaction color + icon so Admin can tell at a glance which type of approval a tile is —
 * mirrors Submission History's STATUS_STYLE (same ZROLE_ACTION codes), plus a neutral fallback for
 * any row whose Zaction doesn't match one of the five known codes. */
const ACTION_STYLE: Record<PendingApprovalAction, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  RD: { color: colors.amber, icon: 'calendar-outline' },
  SA: { color: colors.blue, icon: 'hourglass-outline' },
  AS: { color: colors.green, icon: 'checkmark-circle-outline' },
  RS: { color: colors.red, icon: 'arrow-undo-circle-outline' },
  MS: { color: colors.teal, icon: 'mail-outline' },
};
const UNKNOWN_ACTION_STYLE = { color: colors.inkSoft, icon: 'ellipse-outline' as keyof typeof Ionicons.glyphMap };

function actionStyleFor(zaction: string) {
  return ACTION_STYLE[zaction as PendingApprovalAction] || UNKNOWN_ACTION_STYLE;
}

function actionLabelFor(zaction: string) {
  return PENDING_APPROVAL_ACTION_LABELS[zaction as PendingApprovalAction] || zaction || 'Unknown';
}

/** Approve button copy per approval type, so Admin knows exactly what they're approving without
 * reading the fields first — e.g. "Approve Revised Delivery Date" instead of a bare "Approve" that
 * could mean the delivery date change or the SES itself. Only RD/SA are specified; any other type
 * (or an unrecognized code) falls back to the generic "Approve". */
const APPROVAL_BUTTON_LABELS: Partial<Record<PendingApprovalAction, { approve: string }>> = {
  RD: { approve: 'Approve Revised Delivery Date' },
  SA: { approve: 'Approve for SES' },
};

function approveLabelFor(zaction: string) {
  return APPROVAL_BUTTON_LABELS[zaction as PendingApprovalAction]?.approve || 'Approve';
}

/** Full-width, un-truncated banner naming what this tile is actually asking the Admin to approve
 * — replaces a squeezed inline badge that could clip a long label like "Approval for Revised
 * Delivery Date". */
function ActionBanner({ zaction }: { zaction: string }) {
  const style = actionStyleFor(zaction);
  return (
    <View style={[styles.actionBanner, { backgroundColor: `${style.color}1f`, borderColor: `${style.color}55` }]}>
      <Ionicons name={style.icon} size={14} color={style.color} />
      <Text style={[styles.actionBannerText, { color: style.color }]}>{actionLabelFor(zaction)}</Text>
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

/** In-app attachment preview — an <iframe> onto the attachment's blob URL, so the browser's own
 * PDF viewer (scroll, zoom in/out, its own print/download controls) renders inside the modal
 * instead of a bare new tab. Plus an explicit Download button in the header, since not every
 * browser's inline viewer makes that obvious. Web-only (this app builds web-only, see app.json),
 * hence the plain `React.createElement('iframe', ...)` — react-native-web has no <iframe>
 * primitive of its own. */
function AttachmentPreviewModal({
  blobUrl,
  filename,
  onClose,
}: {
  blobUrl: string | null;
  filename: string;
  onClose: () => void;
}) {
  if (!blobUrl) return null;

  const handleDownload = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'attachment.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.previewOverlay} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close preview">
        <Pressable style={styles.previewBox} onPress={() => {}}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{filename || 'Attachment'}</Text>
            <View style={styles.previewHeaderActions}>
              <Pressable onPress={handleDownload} style={styles.previewActionBtn} accessibilityRole="button" accessibilityLabel="Download attachment">
                <Ionicons name="download-outline" size={15} color={colors.white} />
                <Text style={styles.previewActionText}>Download</Text>
              </Pressable>
              <Pressable onPress={onClose} style={styles.previewCloseBtn} accessibilityRole="button" accessibilityLabel="Close preview">
                <Ionicons name="close" size={18} color={colors.ink} />
              </Pressable>
            </View>
          </View>
          <View style={styles.previewBody}>
            {Platform.OS === 'web'
              ? React.createElement('iframe', {
                  src: blobUrl,
                  title: filename || 'Attachment preview',
                  style: { flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: colors.appBg },
                })
              : <Text style={styles.previewFallbackText}>Preview isn't available here — use Download.</Text>}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Admin's Pending Approval — every ZVendorPOFollowupSet row scoped to the signed-in Admin's own
 * login email and Zaction 'PA' (see fetchPendingApprovals). Each row: PO Number/PO Line Item/Service Description/
 * Provisional Value/Currency/Revised Del Date/Delivery date/Comments/Invoice No/Invoice Date/
 * Invoice Amount, with an Approve action — row-wise or as a multi-select mass batch — calling the
 * same ZProvHeader POST as Upcoming Provision's "send for approval" (see paymentTrackingApi.ts's
 * submitApprovalDecision/submitApprovalDecisionBatch), just with Zaction set to 'A' instead of
 * echoed back. Reject was removed per instruction — there is no reject action on this screen
 * anymore. Also filtered by the shared Month/Year bar and by SAP's own Stat field (Pending/Approved
 * tabs — see effectiveStatus below), not just this session's own in-memory decisions. */
export default function PendingApproval() {
  const { email, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
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
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [preview, setPreview] = useState<{ blobUrl: string; filename: string } | null>(null);

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
        data.forEach((r) => {
          const s = initialRowState();
          // Seed decided from SAP's own Stat so a row already approved in an earlier session (or
          // by someone else) renders as Approved on load, not as still-actionable.
          if ((r.status || '').trim() === 'A') s.decided = 'A';
          state[r.key] = s;
        });
        setRowState(state);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load pending approvals.'))
      .finally(() => setLoading(false));
  }, [email, isAdmin, roleLoading]);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // Month/Year (the bar every Provision Tracking screen shares — see MonthYearBar.tsx) narrows by
  // delivery date client-side, same as every other screen; ZVendorPOFollowupSet has no Gjahr server
  // filter to send the year to, unlike ZProvisionTrackSet, so both dimensions apply here.
  const monthYearRows = useMemo(
    () => filterByFiscalYear(filterByMonth(rows, month), year),
    [rows, month, year]
  );

  const currencies = useMemo(
    () => Array.from(new Set(monthYearRows.map((r) => r.currency).filter(Boolean))).sort(),
    [monthYearRows]
  );

  // A row's effective status: whatever this Admin already decided this session takes priority
  // (so an acted-on row moves tabs immediately, without waiting on a refetch), otherwise it's SAP's
  // own Stat field ('P' pending, 'A' approved, ' '/blank = not yet submitted) — real server state,
  // not just "untouched in this browser session" the way the old decided-only check was.
  const effectiveStatus = useCallback(
    (row: VendorPOFollowupRow): string => {
      const decided = rowState[row.key]?.decided ?? null;
      if (decided) return decided;
      return (row.status || '').trim();
    },
    [rowState]
  );

  // Search + filter narrows what's shown, but selection/decision state stays keyed by the full row
  // set — a row selected before a search term hides it stays selected, same as any other filtered
  // list, so "Select all" below only ever (de)selects what's currently visible.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monthYearRows.filter((row) => {
      if (decisionFilter === 'pending' && effectiveStatus(row) !== 'P') return false;
      if (decisionFilter === 'A' && effectiveStatus(row) !== 'A') return false;
      if (currencyFilter !== 'all' && row.currency !== currencyFilter) return false;
      if (actionFilter !== 'all' && row.zaction !== actionFilter) return false;
      if (q) {
        const haystack = [
          row.poNumber, row.poItemNo, row.vendorName, row.materialDesc, row.invoiceNo, row.comments,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [monthYearRows, effectiveStatus, search, decisionFilter, currencyFilter, actionFilter]);

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

  // The attachment (if any) comes back inline on the row itself — Filename/Mimetype/Value on the
  // same GET as every other field (see paymentTrackingApi.ts) — so opening it is just decoding the
  // base64 already in hand, no extra request. Opens in-app (AttachmentPreviewModal) rather than a
  // bare new tab, so Admin/User get a scroll/zoom/download-capable view without leaving the app.
  const viewAttachment = (row: VendorPOFollowupRow) => {
    if (!row.attachmentBase64) return;
    try {
      const bytes = base64ToBytes(row.attachmentBase64);
      if (!looksLikePdf(bytes)) {
        patchRow(row.key, {
          attachmentError: 'This attachment did not come through as a valid PDF (it may be corrupted or incomplete on the SAP side) — try again, or ask SAP support to check the file.',
        });
        return;
      }
      // Every attachment on this entity is a PDF by construction (mandatory PDF-only picker on the
      // upload side) — SAP's own Mimetype field isn't reliably populated, so it's hardcoded here
      // rather than trusted: a blank/wrong Mimetype made the browser render the raw bytes as text
      // instead of invoking its PDF viewer.
      const blob = base64ToBlob(row.attachmentBase64, 'application/pdf');
      const blobUrl = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.blobUrl);
        return { blobUrl, filename: row.filename || `PO-${row.poNumber}-Item-${row.poItemNo}.pdf` };
      });
      patchRow(row.key, { attachmentError: null });
    } catch (e) {
      patchRow(row.key, { attachmentError: 'Could not open this attachment.' });
    }
  };

  const closePreview = () => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });
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
    <>
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

              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => setActionFilter('all')}
                  style={[styles.chip, actionFilter === 'all' && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityLabel="Filter: All approval types"
                >
                  <Text style={[styles.chipText, actionFilter === 'all' && styles.chipTextActive]}>All Types</Text>
                </Pressable>
                {PENDING_APPROVAL_ACTIONS.map((a) => {
                  const active = actionFilter === a;
                  const style = ACTION_STYLE[a];
                  return (
                    <Pressable
                      key={a}
                      onPress={() => setActionFilter(a)}
                      style={[styles.chip, active && { backgroundColor: `${style.color}14`, borderColor: style.color }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter: ${PENDING_APPROVAL_ACTION_LABELS[a]}`}
                    >
                      <Ionicons name={style.icon} size={11} color={active ? style.color : colors.inkSoft} />
                      <Text style={[styles.chipText, active && { color: style.color }]}>{PENDING_APPROVAL_ACTION_LABELS[a]}</Text>
                    </Pressable>
                  );
                })}
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
              const actionStyle = actionStyleFor(row.zaction);
              return (
                <View
                  key={row.key}
                  style={[
                    styles.card,
                    { borderLeftWidth: 3, borderLeftColor: actionStyle.color },
                    state.decided && styles.cardDecided,
                  ]}
                >
                  <ActionBanner zaction={row.zaction} />

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
                    {row.filename ? (
                      row.attachmentBase64 ? (
                        <Pressable
                          onPress={() => viewAttachment(row)}
                          style={styles.attachmentBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`View or download attachment for PO ${row.poNumber} item ${row.poItemNo}`}
                        >
                          <Ionicons name="attach-outline" size={13} color={colors.rust} />
                          <Text style={styles.attachmentBtnText}>Attachment</Text>
                        </Pressable>
                      ) : (
                        // Filename comes through with no content (Value empty) — originally assumed
                        // to mean "backend skips anything over 2MB" (see git history), but that's
                        // been confirmed wrong for at least one case where the actual file is well
                        // under 2MB and still comes back this way. So this no longer asserts a
                        // specific reason — SAP just isn't returning the bytes, for whatever cause,
                        // and that needs SAP Basis to look at GET_ENTITYSET directly. Full opacity +
                        // an info icon (not the attach icon) so this still reads as an intentional
                        // status message rather than a washed-out/broken button — it isn't one,
                        // there's no onPress at all.
                        <View style={styles.attachmentBtnDisabled} accessibilityLabel={`Attachment "${row.filename}" has no content available to preview`}>
                          <Ionicons name="information-circle-outline" size={13} color={colors.inkSoft} />
                          <Text style={styles.attachmentBtnDisabledText}>Attachment unavailable</Text>
                        </View>
                      )
                    ) : null}
                    {state.decided && (
                      <View style={[styles.decidedBadge, styles.decidedBadgeApprove]}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                        <Text style={[styles.decidedBadgeText, { color: colors.green }]}>Approved</Text>
                      </View>
                    )}
                  </View>

                  {row.revisedDeliveryDate ? (
                    <View style={styles.overwriteCallout}>
                      <Ionicons name="swap-horizontal" size={14} color={colors.amber} />
                      <Text style={styles.overwriteCalloutText}>
                        Requested to overwrite delivery date{' '}
                        <Text style={styles.overwriteOldDate}>{formatDeliveryDate(row.deliveryDate) || '—'}</Text>
                        {'  →  '}
                        <Text style={styles.overwriteNewDate}>{formatDeliveryDate(row.revisedDeliveryDate)}</Text>
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.fieldGrid}>
                    <InfoField label="PO Number" value={row.poNumber} />
                    <InfoField label="PO Line Item" value={row.poItemNo} />
                    <InfoField label="Service Description" value={row.serviceText} />
                    <InfoField label="Provisional Value" value={row.provisionValue} />
                    <InfoField label="Currency" value={row.currency} />
                    {!row.revisedDeliveryDate && <InfoField label="Delivery Date" value={formatDeliveryDate(row.deliveryDate)} />}
                    <InfoField label="Comments" value={row.comments} />
                    {row.zaction !== 'RD' && (
                      <>
                        <InfoField label="Invoice No" value={row.invoiceNo} />
                        <InfoField label="Invoice Date" value={formatDeliveryDate(row.invoiceDate)} />
                        <InfoField label="Invoice Amount" value={row.invoiceAmount} />
                      </>
                    )}
                  </View>

                  {state.error && <Text style={styles.rowErrorText}>{state.error}</Text>}
                  {state.attachmentError && <Text style={styles.rowErrorText}>{state.attachmentError}</Text>}

                  {!state.decided && (
                    <View style={styles.rowActions}>
                      <Pressable
                        style={[styles.approveBtn, styles.approveBtnFull, busy && styles.btnDisabled]}
                        onPress={() => decideRow(row, 'A')}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        {state.deciding === 'A' ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Text style={styles.approveBtnText}>{approveLabelFor(row.zaction)}</Text>
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
    <AttachmentPreviewModal blobUrl={preview?.blobUrl ?? null} filename={preview?.filename ?? ''} onClose={closePreview} />
    </>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    padding: 7,
    gap: 4,
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
    gap: 5,
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
  decidedBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
  },
  attachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  attachmentBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.rust,
  },
  attachmentBtnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.appBg,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  attachmentBtnDisabledText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  overwriteCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${colors.amber}12`,
    borderWidth: 1,
    borderColor: `${colors.amber}40`,
    borderRadius: radii.md,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  overwriteCalloutText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink,
  },
  overwriteOldDate: {
    color: colors.inkSoft,
    textDecorationLine: 'line-through',
  },
  overwriteNewDate: {
    color: colors.amber,
    fontWeight: '800',
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  infoField: {
    // Sized to content (no flexGrow) rather than stretching to fill the row — stretching left
    // short values (dates, amounts) surrounded by a lot of empty box, which read as blank gaps.
    minWidth: 84,
    flexShrink: 0,
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
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 5,
  },
  approveBtn: {
    backgroundColor: colors.green,
    borderRadius: radii.md,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  approveBtnFull: {
    flex: 1,
    alignItems: 'center',
  },
  approveBtnText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '700',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,16,34,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  previewBox: {
    width: '100%',
    maxWidth: 900,
    height: '90%',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 12px 40px rgba(20,16,34,0.35)' },
      default: { shadowColor: colors.plum, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
    }),
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  previewTitle: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  previewHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.rust,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  previewActionText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '700',
  },
  previewCloseBtn: {
    padding: 4,
  },
  previewBody: {
    flex: 1,
    backgroundColor: colors.appBg,
  },
  previewFallbackText: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 13,
    color: colors.inkSoft,
    padding: 24,
  },
});
