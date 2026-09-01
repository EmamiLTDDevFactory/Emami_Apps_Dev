import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';
import { formatDateFriendly, type UpcomingPoRow } from '../lib/poFollowupApi';
import DateField from './DateField';

interface Revision {
  revised: boolean;
  revisedDelDate: string; // yyyy-mm-dd, defaults to the row's Eindt once revised
  comments: string;
}

interface Column {
  key: 'poNumber' | 'poItemNo' | 'poText' | 'materialDesc' | 'deliveryDate' | 'scheduledQty' | 'deliveredQty';
  label: string;
  width: number;
}

const COLUMNS: Column[] = [
  { key: 'poNumber', label: 'PO Number', width: 110 },
  { key: 'poItemNo', label: 'PO Item No', width: 90 },
  { key: 'poText', label: 'PO Text', width: 200 },
  { key: 'materialDesc', label: 'Material Description', width: 220 },
  { key: 'deliveryDate', label: 'Delivery Date', width: 130 },
  { key: 'scheduledQty', label: 'Scheduled Quantity', width: 150 },
  { key: 'deliveredQty', label: 'Delivered Quantity', width: 150 },
];
const REVISE_COL_WIDTH = 220;
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0) + REVISE_COL_WIDTH;

function emptyRevision(row: UpcomingPoRow): Revision {
  return { revised: false, revisedDelDate: row.deliveryDate, comments: '' };
}

interface UpcomingPoTableProps {
  rows: UpcomingPoRow[];
  emptyMessage: string;
}

/** Upcoming Delivery PO table. Each row asks "Do you want to revise Delivery Date?" via a Yes/No
 * toggle instead of exposing an always-editable date/comments pair inline — choosing Yes opens a
 * modal to capture the revised date (defaults to that row's own Delivery Date) and a mandatory
 * comment; choosing No (or cancelling the modal before saving) clears any pending revision. No
 * submit endpoint has been specified for these edits yet — this only tracks/validates them
 * client-side. */
export default function UpcomingPoTable({ rows, emptyMessage }: UpcomingPoTableProps) {
  const [revisions, setRevisions] = useState<Record<string, Revision>>({});
  const [modalRowKey, setModalRowKey] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState('');
  const [draftComments, setDraftComments] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  // Re-seed per-row state whenever a fresh set of rows comes in (new fetch).
  useEffect(() => {
    const next: Record<string, Revision> = {};
    for (const row of rows) next[row.key] = emptyRevision(row);
    setRevisions(next);
  }, [rows]);

  const openModalFor = (row: UpcomingPoRow) => {
    const existing = revisions[row.key];
    setDraftDate(existing?.revised ? existing.revisedDelDate : row.deliveryDate);
    setDraftComments(existing?.revised ? existing.comments : '');
    setDraftError(null);
    setModalRowKey(row.key);
  };

  const answerNo = (row: UpcomingPoRow) => {
    setRevisions((prev) => ({ ...prev, [row.key]: emptyRevision(row) }));
  };

  const closeModal = () => setModalRowKey(null);

  const saveModal = () => {
    if (!draftComments.trim()) {
      setDraftError('Comments are required when revising the delivery date.');
      return;
    }
    if (modalRowKey) {
      setRevisions((prev) => ({
        ...prev,
        [modalRowKey]: { revised: true, revisedDelDate: draftDate, comments: draftComments.trim() },
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

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scroll}>
        <View style={[styles.card, { width: TABLE_WIDTH }]}>
          <View style={styles.headerRow}>
            {COLUMNS.map((col) => (
              <Text key={col.key} style={[styles.headerCell, { width: col.width }]} numberOfLines={2}>
                {col.label}
              </Text>
            ))}
            <Text style={[styles.headerCell, { width: REVISE_COL_WIDTH }]}>Revise Delivery Date?</Text>
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
                <View style={{ width: REVISE_COL_WIDTH, paddingVertical: 8, paddingHorizontal: 10, gap: 6 }}>
                  <View style={styles.toggleRow}>
                    <Pressable
                      onPress={() => openModalFor(row)}
                      style={[styles.toggleBtn, revision.revised && styles.toggleBtnActiveYes]}
                      accessibilityRole="button"
                      accessibilityLabel={`Revise delivery date for PO ${row.poNumber} item ${row.poItemNo}: Yes`}
                    >
                      <Text style={[styles.toggleBtnText, revision.revised && styles.toggleBtnTextActive]}>Yes</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => answerNo(row)}
                      style={[styles.toggleBtn, !revision.revised && styles.toggleBtnActiveNo]}
                      accessibilityRole="button"
                      accessibilityLabel={`Revise delivery date for PO ${row.poNumber} item ${row.poItemNo}: No`}
                    >
                      <Text style={[styles.toggleBtnText, !revision.revised && styles.toggleBtnTextActive]}>No</Text>
                    </Pressable>
                  </View>
                  {revision.revised && (
                    <Pressable onPress={() => openModalFor(row)} accessibilityRole="button">
                      <Text style={styles.revisedSummary} numberOfLines={1}>
                        → {formatDateFriendly(revision.revisedDelDate)} · edit
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={modalRowKey !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Revise Delivery Date</Text>
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
              placeholder="Why is this delivery date being revised?"
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
