import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';
import { formatDateFriendly, type UpcomingPoRow } from '../lib/poFollowupApi';
import DateField from './DateField';

export type ConfirmAnswer = 'neutral' | 'yes' | 'no';

export interface Revision {
  answer: ConfirmAnswer;
  revisedDelDate: string; // yyyy-mm-dd, only meaningful once answer === 'no'
  comments: string;
}

interface Column {
  key: 'poNumber' | 'poItemNo' | 'poText' | 'materialDesc' | 'deliveryDate';
  label: string;
  width: number;
}

const COLUMNS: Column[] = [
  { key: 'poNumber', label: 'PO Number', width: 110 },
  { key: 'poItemNo', label: 'PO Item No', width: 90 },
  { key: 'poText', label: 'PO Text', width: 200 },
  { key: 'materialDesc', label: 'Material Description', width: 220 },
  { key: 'deliveryDate', label: 'Delivery Date', width: 130 },
];
const CONFIRM_COL_WIDTH = 220;

export function emptyRevision(row: UpcomingPoRow): Revision {
  return { answer: 'neutral', revisedDelDate: row.deliveryDate, comments: '' };
}

interface UpcomingPoTableProps {
  rows: UpcomingPoRow[];
  emptyMessage: string;
  /** Missed Delivery reuses this same table for its read-only listing — no "Delivery Confirmed?"
   * column, no toggle/modal, just the data columns. */
  readOnly?: boolean;
  /** Controlled per-row answer state, lifted to the parent screen so it can drive the Final
   * Submission button (enabled once any row has an answer) and the unsaved-changes/leave-page
   * warning. Only required (and only rendered) when readOnly is false. */
  revisions?: Record<string, Revision>;
  onRevisionsChange?: (next: Record<string, Revision>) => void;
  /** Locks every toggle after a successful Final Submission — the confirmed answers stay visible,
   * but can no longer be edited. */
  locked?: boolean;
}

/** Upcoming Delivery PO table. Each row answers "Delivery Confirmed?" via a three-state Yes/No
 * toggle that starts neutral (neither button highlighted): choosing Yes confirms immediately with
 * nothing further to do; choosing No opens a modal to capture a revised delivery date (defaults to
 * that row's own Delivery Date) and a mandatory comment — the toggle stays neutral until that modal
 * is actually saved, so cancelling (or closing without saving) leaves the row unanswered rather than
 * silently counting it as "No". No submit endpoint has been specified for these edits yet — Final
 * Submission (see index.tsx) only tracks/validates them client-side for now. */
export default function UpcomingPoTable({ rows, emptyMessage, readOnly, revisions: controlledRevisions, onRevisionsChange, locked }: UpcomingPoTableProps) {
  const [localRevisions, setLocalRevisions] = useState<Record<string, Revision>>({});
  const revisions = readOnly ? localRevisions : (controlledRevisions ?? localRevisions);
  const setRevisions = (updater: (prev: Record<string, Revision>) => Record<string, Revision>) => {
    const next = updater(revisions);
    if (onRevisionsChange) onRevisionsChange(next);
    else setLocalRevisions(next);
  };

  const [modalRowKey, setModalRowKey] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState('');
  const [draftComments, setDraftComments] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  // Re-seed per-row state whenever a fresh set of rows comes in (new fetch) — only for rows that
  // don't already have an entry, so an in-progress answer survives e.g. a period-filter re-render.
  useEffect(() => {
    setRevisions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of rows) {
        if (!next[row.key]) {
          next[row.key] = emptyRevision(row);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const openModalFor = (row: UpcomingPoRow) => {
    if (locked) return;
    const existing = revisions[row.key];
    setDraftDate(existing?.answer === 'no' ? existing.revisedDelDate : row.deliveryDate);
    setDraftComments(existing?.answer === 'no' ? existing.comments : '');
    setDraftError(null);
    setModalRowKey(row.key);
  };

  const answerYes = (row: UpcomingPoRow) => {
    if (locked) return;
    setRevisions((prev) => ({ ...prev, [row.key]: { answer: 'yes', revisedDelDate: row.deliveryDate, comments: '' } }));
  };

  const closeModal = () => setModalRowKey(null);

  const saveModal = () => {
    if (!draftComments.trim()) {
      setDraftError('Comments are required when the delivery isn’t confirmed.');
      return;
    }
    if (modalRowKey) {
      setRevisions((prev) => ({
        ...prev,
        [modalRowKey]: { answer: 'no', revisedDelDate: draftDate, comments: draftComments.trim() },
      }));
    }
    setModalRowKey(null);
  };

  const modalRow = rows.find((r) => r.key === modalRowKey) ?? null;

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const tableWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0) + (readOnly ? 0 : CONFIRM_COL_WIDTH);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scroll}>
        <View style={[styles.card, { width: tableWidth }]}>
          <View style={styles.headerRow}>
            {COLUMNS.map((col) => (
              <Text key={col.key} style={[styles.headerCell, { width: col.width }]} numberOfLines={2}>
                {col.label}
              </Text>
            ))}
            {!readOnly && <Text style={[styles.headerCell, { width: CONFIRM_COL_WIDTH }]}>Delivery Confirmed?</Text>}
          </View>

          {rows.map((row) => {
            const revision = revisions[row.key] ?? emptyRevision(row);
            return (
              <View key={row.key} style={styles.row}>
                {COLUMNS.map((col) => (
                  <Text key={col.key} style={[styles.cell, { width: col.width }]} numberOfLines={2}>
                    {col.key === 'deliveryDate' ? formatDateFriendly(row.deliveryDate) : row[col.key] || '—'}
                  </Text>
                ))}
                {!readOnly && (
                  <View style={{ width: CONFIRM_COL_WIDTH, paddingVertical: 8, paddingHorizontal: 10, gap: 6 }}>
                    <View style={styles.toggleRow}>
                      <Pressable
                        onPress={() => answerYes(row)}
                        disabled={locked}
                        style={[styles.toggleBtn, revision.answer === 'yes' && styles.toggleBtnActiveYes, locked && styles.toggleBtnDisabled]}
                        accessibilityRole="button"
                        accessibilityLabel={`Delivery confirmed for PO ${row.poNumber} item ${row.poItemNo}: Yes`}
                        accessibilityState={{ selected: revision.answer === 'yes', disabled: locked }}
                      >
                        <Text style={[styles.toggleBtnText, revision.answer === 'yes' && styles.toggleBtnTextActive]}>Yes</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => openModalFor(row)}
                        disabled={locked}
                        style={[styles.toggleBtn, revision.answer === 'no' && styles.toggleBtnActiveNo, locked && styles.toggleBtnDisabled]}
                        accessibilityRole="button"
                        accessibilityLabel={`Delivery confirmed for PO ${row.poNumber} item ${row.poItemNo}: No`}
                        accessibilityState={{ selected: revision.answer === 'no', disabled: locked }}
                      >
                        <Text style={[styles.toggleBtnText, revision.answer === 'no' && styles.toggleBtnTextActive]}>No</Text>
                      </Pressable>
                    </View>
                    {revision.answer === 'no' && (
                      <Pressable onPress={() => openModalFor(row)} disabled={locked} accessibilityRole="button">
                        <Text style={styles.revisedSummary} numberOfLines={1}>
                          → {formatDateFriendly(revision.revisedDelDate)} · {locked ? '' : 'edit'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {!readOnly && (
        <Modal visible={modalRowKey !== null} transparent animationType="fade" onRequestClose={closeModal}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Delivery Not Confirmed</Text>
              {modalRow && (
                <Text style={styles.modalSubtitle}>
                  PO {modalRow.poNumber} · Item {modalRow.poItemNo}
                </Text>
              )}

              <Text style={styles.modalLabel}>Revised Delivery Date</Text>
              <DateField label="Revised Delivery Date" value={draftDate} onChange={setDraftDate} />

              <Text style={[styles.modalLabel, { marginTop: 14 }]}>Comments (required)</Text>
              <TextInput
                value={draftComments}
                onChangeText={(v) => {
                  setDraftComments(v);
                  if (draftError) setDraftError(null);
                }}
                placeholder="Why isn't this delivery confirmed?"
                placeholderTextColor={colors.inkSoft}
                multiline
                style={[styles.modalCommentsInput, draftError && styles.modalCommentsInputError]}
                accessibilityLabel="Comments"
              />
              {draftError && <Text style={styles.modalErrorText}>{draftError}</Text>}

              <View style={styles.modalBtnRow}>
                <Pressable style={styles.modalCancelBtn} onPress={closeModal} accessibilityRole="button" accessibilityLabel="Cancel">
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalSaveBtn} onPress={saveModal} accessibilityRole="button" accessibilityLabel="Save">
                  <Ionicons name="checkmark" size={15} color={colors.white} />
                  <Text style={styles.modalSaveBtnText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.rust,
  },
  headerCell: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cell: {
    fontSize: 12.5,
    color: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.appBg,
  },
  toggleBtnDisabled: {
    opacity: 0.6,
  },
  toggleBtnActiveYes: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  toggleBtnActiveNo: {
    backgroundColor: colors.inkSoft,
    borderColor: colors.inkSoft,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  toggleBtnTextActive: {
    color: colors.white,
  },
  revisedSummary: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.rust,
  },
  empty: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(31,27,51,0.55)',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 22,
  },
  modalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.ink,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  modalLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    marginBottom: 6,
    marginTop: 18,
  },
  modalCommentsInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.white,
    textAlignVertical: 'top',
    ...Platform.select({ web: { outlineStyle: 'none' as any } }),
  },
  modalCommentsInputError: {
    borderColor: colors.red,
    backgroundColor: `${colors.red}0a`,
  },
  modalErrorText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.red,
    marginTop: 6,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: colors.rust,
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
});
