import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import {
  fetchProvisionLog,
  submitLogAction,
  PROVISION_LOG_STATUSES,
  PROVISION_LOG_STATUS_LABELS,
  LOG_ACTION_LABELS,
  type ProvisionLogRow,
  type ProvisionLogStatus,
  type LogAction,
} from '../../../src/lib/paymentTrackingApi';
import { base64ToBlob, base64ToBytes, looksLikePdf } from '../../../src/lib/pdfAttachment';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { formatDeliveryDate } from '../../../src/lib/provisionMetrics';

/** Per-row action state for the 'AS' (SES Created) rows' Reverse SES / Mail for P2P buttons —
 * mirrors Pending Approval's RowState. attachmentError is for the rare case opening an in-hand
 * attachment fails (e.g. malformed base64). */
interface RowState {
  acting: LogAction | null; // which action is in flight, if any
  actionError: string | null;
  attachmentError: string | null;
}

function initialRowState(): RowState {
  return { acting: null, actionError: null, attachmentError: null };
}

/** In-app attachment preview — same approach as Pending Approval's AttachmentPreviewModal (an
 * <iframe> onto the attachment's blob URL, web-only). Duplicated rather than shared since every
 * screen in this app already keeps its own small modal/helpers self-contained (see e.g. each
 * screen's own InfoField). */
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
      <Pressable style={previewStyles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close preview">
        <Pressable style={previewStyles.box} onPress={() => {}}>
          <View style={previewStyles.header}>
            <Text style={previewStyles.title} numberOfLines={1}>{filename || 'Attachment'}</Text>
            <View style={previewStyles.headerActions}>
              <Pressable onPress={handleDownload} style={previewStyles.actionBtn} accessibilityRole="button" accessibilityLabel="Download attachment">
                <Ionicons name="download-outline" size={15} color={colors.white} />
                <Text style={previewStyles.actionText}>Download</Text>
              </Pressable>
              <Pressable onPress={onClose} style={previewStyles.closeBtn} accessibilityRole="button" accessibilityLabel="Close preview">
                <Ionicons name="close" size={18} color={colors.ink} />
              </Pressable>
            </View>
          </View>
          <View style={previewStyles.body}>
            {Platform.OS === 'web'
              ? React.createElement('iframe', {
                  src: blobUrl,
                  title: filename || 'Attachment preview',
                  style: { flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: colors.appBg },
                })
              : <Text style={previewStyles.fallbackText}>Preview isn't available here — use Download.</Text>}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const previewStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,16,34,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  box: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  title: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.rust,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
    backgroundColor: colors.appBg,
  },
  fallbackText: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 13,
    color: colors.inkSoft,
    padding: 24,
  },
});

/** Per-status color + icon, keyed by the ZROLE_ACTION domain code (see paymentTrackingApi.ts's
 * Submission History section) — every status gets its own accent so the list reads as a status
 * timeline at a glance, not just a flat table with a text column. */
const STATUS_STYLE: Record<ProvisionLogStatus, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  RD: { color: colors.amber, icon: 'calendar-outline' },
  SA: { color: colors.blue, icon: 'hourglass-outline' },
  AS: { color: colors.green, icon: 'checkmark-circle-outline' },
  RS: { color: colors.red, icon: 'arrow-undo-circle-outline' },
  MS: { color: colors.teal, icon: 'mail-outline' },
};

function StatusBadge({ status, text }: { status: ProvisionLogStatus | ''; text: string }) {
  const style = status ? STATUS_STYLE[status] : null;
  const color = style?.color || colors.inkSoft;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: `${color}14` }]}>
      <Ionicons name={style?.icon || 'ellipse-outline'} size={13} color={color} />
      <Text style={[badgeStyles.text, { color }]} numberOfLines={1}>{text || 'Unknown'}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  text: {
    fontSize: 10.5,
    fontWeight: '700',
  },
});

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

type StatusFilter = 'all' | ProvisionLogStatus;

/** Submission History (User side-pane tab) — every ZProvisionLogSet entry for the signed-in
 * user's own login email (see fetchProvisionLog), fetched once and then filtered client-side by
 * Zstatus (see filteredRows below) so switching status chips doesn't re-hit SAP. Each row gets a
 * colored indicator per status (see STATUS_STYLE above and this screen's status chip row). */
export default function PaymentTrackingHistory() {
  const { email, roleLoading } = usePaymentTrackingAuth();
  const [rows, setRows] = useState<ProvisionLogRow[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [preview, setPreview] = useState<{ blobUrl: string; filename: string } | null>(null);

  useEffect(() => {
    if (roleLoading || !email) return;
    setLoading(true);
    setLoadError(null);
    fetchProvisionLog(email)
      .then((data) => {
        setRows(data);
        const state: Record<string, RowState> = {};
        data.forEach((r) => { state[r.key] = initialRowState(); });
        setRowState(state);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load submission history.'))
      .finally(() => setLoading(false));
  }, [email, roleLoading]);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...(prev[key] ?? initialRowState()), ...patch } }));
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.zstatus !== statusFilter) return false;
      if (!q) return true;
      const haystack = [row.poNumber, row.poItemNo, row.vendorName, row.serviceText, row.remarks].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, statusFilter]);

  // Reverse SES / Mail for P2P — only offered on a row already in the 'AS' (SES Created) state.
  // Marks the row done locally on success (removeAction) rather than refetching the whole log,
  // same "acted-on row updates immediately" posture as Pending Approval's decideRow.
  const [doneActions, setDoneActions] = useState<Record<string, LogAction>>({});
  const runLogAction = async (row: ProvisionLogRow, action: LogAction) => {
    patchRow(row.key, { acting: action, actionError: null });
    try {
      await submitLogAction(row, email || '', action);
      patchRow(row.key, { acting: null });
      setDoneActions((prev) => ({ ...prev, [row.key]: action }));
    } catch (e) {
      patchRow(row.key, { acting: null, actionError: e instanceof Error ? e.message : 'Could not complete this action.' });
    }
  };

  // Attachment (if any) comes back inline on the row itself, same as Pending Approval — decoding
  // base64 already in hand, no extra request.
  const viewAttachment = (row: ProvisionLogRow) => {
    if (!row.attachmentBase64) return;
    try {
      const bytes = base64ToBytes(row.attachmentBase64);
      if (!looksLikePdf(bytes)) {
        patchRow(row.key, {
          attachmentError: 'This attachment did not come through as a valid PDF (it may be corrupted or incomplete on the SAP side) — try again, or ask SAP support to check the file.',
        });
        return;
      }
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

  return (
    <>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <ProvisionHero
          eyebrow="Submission History"
          title="Submission History"
          subtitle="Every action recorded against your provision submissions — filter by status to focus on one stage."
        />

        <View style={styles.filterBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={13} color={colors.inkSoft} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search PO, vendor, service, remarks…"
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
            <Pressable
              onPress={() => setStatusFilter('all')}
              style={[styles.chip, statusFilter === 'all' && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel="Filter: All"
            >
              <Text style={[styles.chipText, statusFilter === 'all' && styles.chipTextActive]}>All</Text>
            </Pressable>
            {PROVISION_LOG_STATUSES.map((s) => {
              const active = statusFilter === s;
              const color = STATUS_STYLE[s].color;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStatusFilter(s)}
                  style={[styles.chip, active && { backgroundColor: `${color}14`, borderColor: color }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter: ${PROVISION_LOG_STATUS_LABELS[s]}`}
                >
                  <Ionicons name={STATUS_STYLE[s].icon} size={11} color={active ? color : colors.inkSoft} />
                  <Text style={[styles.chipText, active && { color }]}>{PROVISION_LOG_STATUS_LABELS[s]}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.resultCount}>{filteredRows.length} of {rows.length}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading submission history…</Text>
          </View>
        ) : loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : filteredRows.length === 0 ? (
          <Text style={styles.emptyText}>
            {rows.length === 0 ? 'No submission history yet.' : 'No entries match your search/filter.'}
          </Text>
        ) : (
          filteredRows.map((row) => {
            const state = rowState[row.key] ?? initialRowState();
            const doneAction = doneActions[row.key];
            const busy = state.acting !== null;
            return (
            <View key={row.key} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>PO {row.poNumber || '—'} · Item {row.poItemNo || '—'}</Text>
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
                    <View style={styles.attachmentBtnDisabled} accessibilityLabel={`Attachment "${row.filename}" has no content available to preview`}>
                      <Ionicons name="information-circle-outline" size={13} color={colors.inkSoft} />
                      <Text style={styles.attachmentBtnDisabledText}>Attachment unavailable</Text>
                    </View>
                  )
                ) : null}
                <StatusBadge status={row.zstatus} text={row.zstatusText} />
              </View>

              <View style={styles.fieldGrid}>
                <InfoField label="Service" value={row.serviceText} />
                <InfoField label="Action Date" value={formatDeliveryDate(row.actionDate)} />
                <InfoField label="Delivery Date" value={formatDeliveryDate(row.deliveryDate)} />
                <InfoField label="Revised Delivery Date" value={formatDeliveryDate(row.revisedDeliveryDate)} />
                <InfoField label="Provision Amount" value={row.provisionValue} />
                <InfoField label="Invoice Number" value={row.invoiceNo} />
                <InfoField label="Invoice Date" value={formatDeliveryDate(row.invoiceDate)} />
                <InfoField label="Invoice Amount" value={row.invoiceAmount} />
                <InfoField label="Remarks" value={row.remarks} />
              </View>

              {state.actionError && <Text style={styles.rowErrorText}>{state.actionError}</Text>}
              {state.attachmentError && <Text style={styles.rowErrorText}>{state.attachmentError}</Text>}

              {row.zstatus === 'AS' && (
                doneAction ? (
                  <View style={styles.rowActionsDone}>
                    <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                    <Text style={styles.rowActionsDoneText}>{LOG_ACTION_LABELS[doneAction]} sent</Text>
                  </View>
                ) : (
                  <View style={styles.rowActions}>
                    <Pressable
                      style={[styles.logActionBtn, styles.logActionBtnReverse, busy && styles.btnDisabled]}
                      onPress={() => runLogAction(row, 'RS')}
                      disabled={busy}
                      accessibilityRole="button"
                    >
                      {state.acting === 'RS' ? (
                        <ActivityIndicator size="small" color={colors.red} />
                      ) : (
                        <Text style={styles.logActionBtnReverseText}>{LOG_ACTION_LABELS.RS}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.logActionBtn, styles.logActionBtnMail, busy && styles.btnDisabled]}
                      onPress={() => runLogAction(row, 'MS')}
                      disabled={busy}
                      accessibilityRole="button"
                    >
                      {state.acting === 'MS' ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text style={styles.logActionBtnMailText}>{LOG_ACTION_LABELS.MS}</Text>
                      )}
                    </Pressable>
                  </View>
                )
              )}
            </View>
            );
          })
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
  resultCount: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.inkSoft,
    marginLeft: 'auto',
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
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  infoField: {
    minWidth: 96,
    flexGrow: 1,
    flexBasis: '30%',
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
  rowActionsDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 5,
  },
  rowActionsDoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.green,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  logActionBtn: {
    borderRadius: radii.md,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  logActionBtnReverse: {
    borderWidth: 1,
    borderColor: colors.red,
  },
  logActionBtnReverseText: {
    color: colors.red,
    fontSize: 11.5,
    fontWeight: '700',
  },
  logActionBtnMail: {
    backgroundColor: colors.teal,
  },
  logActionBtnMailText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '700',
  },
});
