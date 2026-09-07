import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchMarketRates, fetchSuppliedMaterials, saveMarketRates, type MarketRateRow } from '../../../src/lib/marketRateApi';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';

const CURRENT_YEAR = new Date().getFullYear();

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

let nextKey = 0;
function emptyRow(): MarketRateRow {
  nextKey += 1;
  return {
    key: `row-${nextKey}`,
    materialCode: '',
    materialDesc: '',
    materialType: '',
    vendorCode: '',
    marketName: '',
    marketRate: '',
    ratePer: '',
    igst: '',
    sgst: '',
    cgst: '',
    validFrom: todayIso(),
    locked: false,
  };
}

const DEFAULT_ROWS = () => [emptyRow(), emptyRow(), emptyRow()];

type TextField = Exclude<keyof MarketRateRow, 'key' | 'validFrom'>;

// No "e.g. ..." example placeholders — a blank starter row with fake-looking sample material
// data read as mock content sitting in a live production form, not an input hint.
const TEXT_COLUMNS: { field: TextField; label: string; width: number; placeholder: string; keyboard?: 'decimal-pad' }[] = [
  { field: 'materialCode', label: 'Material Code', width: 130, placeholder: '' },
  { field: 'materialDesc', label: 'Material Description', width: 260, placeholder: '' },
  { field: 'marketRate', label: 'Market rate ( Existing Rate )', width: 160, placeholder: '', keyboard: 'decimal-pad' },
  { field: 'ratePer', label: 'Rate UOM', width: 90, placeholder: '' },
];

/** Reference data from ZMarketSuppDataSet — locked (not free-typed) once a row is pre-filled from
 * there, so a typo can't quietly diverge a row from SAP's actual material master. See
 * MarketRateRow.locked. */
const LOCKED_FIELDS: TextField[] = ['materialCode', 'materialDesc', 'materialType'];
/** Bolded for scannability — these are the two fields that identify which material a row is for. */
const BOLD_FIELDS: TextField[] = ['materialCode', 'materialDesc'];

const VENDOR_COL_WIDTH = 160;
const DATE_COL_WIDTH = 190;
const REMOVE_COL_WIDTH = 44;
const TABLE_WIDTH =
  TEXT_COLUMNS.reduce((sum, c) => sum + c.width, 0) + VENDOR_COL_WIDTH + DATE_COL_WIDTH + REMOVE_COL_WIDTH;

// Wider than REMOVE_COL_WIDTH — the Submitted Rates table's action column holds a Save + Cancel
// icon pair while a row is being edited, not just the single trash icon the entry table has.
const SUBMITTED_ACTION_COL_WIDTH = 76;
const SUBMITTED_TABLE_WIDTH =
  TEXT_COLUMNS.reduce((sum, c) => sum + c.width, 0) + VENDOR_COL_WIDTH + DATE_COL_WIDTH + SUBMITTED_ACTION_COL_WIDTH;

/** Valid From cell — a real date picker on every platform, not a free-text field: a raw HTML
 * date input on web (same approach non-ctc-expense's claim date field uses, for consistent
 * behavior across browsers), the native community picker everywhere else. */
function DateCell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === 'web') {
    return (
      // @ts-expect-error — raw DOM element, valid under react-native-web
      <input
        type="date"
        value={value}
        min={todayIso()}
        onChange={(e: any) => onChange(e.target.value)}
        aria-label={label}
        style={{
          width: DATE_COL_WIDTH - 20,
          height: 46,
          padding: '10px 12px',
          margin: 6,
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.white,
          color: colors.ink,
          fontSize: 15,
          boxSizing: 'border-box',
        }}
      />
    );
  }

  const dateObj = value ? new Date(`${value}T00:00:00`) : new Date();
  return (
    <View style={{ width: DATE_COL_WIDTH, paddingHorizontal: 6 }}>
      <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name="calendar-outline" size={16} color={colors.rust} />
        <Text style={styles.dateBtnText}>{value}</Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          minimumDate={new Date()}
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

// Only ever holds an error now — a successful save shows the confirmation Modal below instead of
// this inline banner (see showSuccessModal).
type SaveStatus = { message: string } | null;

export default function MarketRateScreen() {
  const [rows, setRows] = useState<MarketRateRow[]>(DEFAULT_ROWS);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // The batch just saved, held here until the success Modal's OK is pressed — only then is it
  // merged into submittedRows below.
  const [pendingSubmittedRows, setPendingSubmittedRows] = useState<MarketRateRow[] | null>(null);
  // Rows shown read-only in the "Submitted Rates" table — populated both from materials already
  // submitted today (fetched fresh on every load, so this survives a page reload) and from
  // whatever the entry form just saved this session.
  const [submittedRows, setSubmittedRows] = useState<MarketRateRow[] | null>(null);
  // Whether the fillable entry form below is shown. Starts true; goes false once everything
  // supplied is already submitted for today, or right after a fresh save (until "Submit New
  // Rates" is pressed).
  const [entryMode, setEntryMode] = useState(true);
  // Row keys currently unlocked for editing in the submitted view — only Market Rate is editable
  // even then, everything else in that row (and every other row) stays read-only.
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set());
  // Snapshot of each editing row's Market Rate at the moment Edit was pressed, so Cancel can
  // revert it without re-fetching from SAP.
  const [editOriginals, setEditOriginals] = useState<Record<string, string>>({});
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ key: string; message: string } | null>(null);

  // Pre-fills the table with whatever materials this signed-in email is already associated with
  // (ZMarketSuppDataSet) instead of starting blank — market rate/GST/valid-from still need to
  // be filled in per row, those aren't part of that reference data. Falls back to the default
  // blank rows if nothing comes back (no supplier data yet, or the lookup fails).
  //
  // Materials that already have a rate submitted with today's date (fetchMarketRates, current
  // year, this email) are excluded from that pre-fill — otherwise reopening Home later the same
  // day re-offers an already-submitted material for resubmission, and a second save would create
  // a duplicate entry for the same day.
  useEffect(() => {
    const email = getHubEmail();
    if (!email) {
      setLoadingInitial(false);
      return;
    }
    Promise.all([
      fetchSuppliedMaterials(email),
      fetchMarketRates(String(CURRENT_YEAR), { email }).catch(() => [] as MarketRateRow[]),
    ]).then(([materials, existingRates]) => {
      const today = todayIso();
      const submittedTodayCodes = new Set(
        existingRates.filter((r) => r.validFrom === today).map((r) => r.materialCode)
      );

      // fetchMarketRates doesn't carry the "code · name" supplier display string (that only
      // comes from ZMarketSuppDataSet, i.e. `materials`) — stitch it on so today's already-
      // submitted rows show the same Vendor column as freshly-saved ones do.
      const supplierRefByCode = new Map(
        materials.map((m) => [m.materialCode, [m.supplierCode, m.supplierName].filter(Boolean).join(' · ') || undefined])
      );
      const todaySubmittedRows = existingRates
        .filter((r) => r.validFrom === today)
        .map((r) => ({ ...r, supplierRef: r.supplierRef ?? supplierRefByCode.get(r.materialCode) }));
      setSubmittedRows(todaySubmittedRows.length > 0 ? todaySubmittedRows : null);

      const pending = materials.filter((m) => !submittedTodayCodes.has(m.materialCode));
      // Only hide the entry form when there WAS supplier data and every bit of it is already
      // submitted today — a user with no supplier data at all should still see the blank form.
      setEntryMode(!(materials.length > 0 && pending.length === 0));

      if (pending.length > 0) {
        setRows(
          pending.map((m) => {
            nextKey += 1;
            const supplierRef = [m.supplierCode, m.supplierName].filter(Boolean).join(' · ');
            return {
              key: `row-${nextKey}`,
              materialCode: m.materialCode,
              materialDesc: m.materialDesc,
              materialType: m.materialType,
              vendorCode: m.supplierCode,
              marketName: '',
              marketRate: m.latestRate,
              ratePer: m.rateUom,
              igst: '',
              sgst: '',
              cgst: '',
              validFrom: today,
              supplierRef: supplierRef || undefined,
              locked: true,
            };
          })
        );
      }
      setLoadingInitial(false);
    });
  }, []);

  const updateCell = (key: string, field: keyof Omit<MarketRateRow, 'key'>, value: string) => {
    setStatus(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const removeRow = (key: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const startEditRow = (row: MarketRateRow) => {
    setRowError(null);
    setEditOriginals((prev) => ({ ...prev, [row.key]: row.marketRate }));
    setEditingKeys((prev) => new Set(prev).add(row.key));
  };

  const cancelEditRow = (key: string) => {
    setRowError(null);
    const original = editOriginals[key];
    if (original !== undefined) {
      setSubmittedRows((prev) => prev && prev.map((r) => (r.key === key ? { ...r, marketRate: original } : r)));
    }
    setEditingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const updateSubmittedMarketRate = (key: string, value: string) => {
    setRowError(null);
    setSubmittedRows((prev) => prev && prev.map((r) => (r.key === key ? { ...r, marketRate: value } : r)));
  };

  const saveEditedRow = async (row: MarketRateRow) => {
    if (!row.marketRate.trim() || Number.isNaN(Number(row.marketRate))) {
      setRowError({ key: row.key, message: 'Market rate must be a number.' });
      return;
    }
    setRowError(null);
    setSavingRowKey(row.key);
    try {
      await saveMarketRates([row]);
      setEditingKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.key);
        return next;
      });
    } catch (err) {
      setRowError({ key: row.key, message: err instanceof Error ? err.message : 'Could not save. Please try again.' });
    } finally {
      setSavingRowKey(null);
    }
  };

  const startNewSubmission = () => {
    setEntryMode(true);
    setRows(DEFAULT_ROWS());
  };

  const onSave = async () => {
    setStatus(null);
    const filled = rows.filter((r) => TEXT_COLUMNS.some((c) => r[c.field].trim()));
    if (filled.length === 0) {
      setStatus({ message: 'Fill in at least one row before saving.' });
      return;
    }
    const NUMERIC: TextField[] = ['marketRate'];
    const invalidNumber = filled.find((r) => NUMERIC.some((f) => r[f].trim() && Number.isNaN(Number(r[f]))));
    if (invalidNumber) {
      setStatus({ message: 'Market rate must be a number.' });
      return;
    }

    setSaving(true);
    try {
      await saveMarketRates(filled);
      setRows(DEFAULT_ROWS());
      setPendingSubmittedRows(filled.map((r) => ({ ...r, locked: true })));
      setShowSuccessModal(true);
    } catch (err) {
      setStatus({ message: err instanceof Error ? err.message : 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadingInitial) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
        <Text style={styles.loadingText}>Loading your materials…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {submittedRows && submittedRows.length > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconBox}>
              <Ionicons name="checkmark-done-outline" size={14} color={colors.rust} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.sectionTitle}>Submitted Rates</Text>
              <Text style={styles.sectionSubtitle}>Read-only — tap Edit on a row to update its Market Rate</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
            <View style={[styles.card, { width: SUBMITTED_TABLE_WIDTH }]}>
              <View style={styles.tableHeaderRow}>
                {TEXT_COLUMNS.map((col) => (
                  <Text key={col.field} style={[styles.headerCell, { width: col.width }]}>{col.label}</Text>
                ))}
                <Text style={[styles.headerCell, { width: VENDOR_COL_WIDTH }]}>Vendor</Text>
                <Text style={[styles.headerCell, { width: DATE_COL_WIDTH }]}>Valid From</Text>
                <Text style={[styles.headerCell, { width: SUBMITTED_ACTION_COL_WIDTH }]}>Action</Text>
              </View>

              {submittedRows.map((row, i) => {
                const isEditing = editingKeys.has(row.key);
                const isSavingThisRow = savingRowKey === row.key;
                return (
                  <View key={row.key} style={styles.tableRow}>
                    {TEXT_COLUMNS.map((col) => {
                      const editableNow = isEditing && col.field === 'marketRate';
                      return (
                        <View key={col.field} style={{ width: col.width }}>
                          {editableNow ? (
                            <TextInput
                              value={row[col.field]}
                              onChangeText={(v) => updateSubmittedMarketRate(row.key, v)}
                              keyboardType={col.keyboard}
                              autoFocus
                              style={[styles.cellInput, styles.cellInputEditing]}
                              accessibilityLabel={`${col.label}, row ${i + 1}`}
                            />
                          ) : (
                            <Text
                              style={[styles.readonlyCell, BOLD_FIELDS.includes(col.field) && styles.cellInputBold]}
                              numberOfLines={1}
                            >
                              {row[col.field] || '-'}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                    <Text style={[styles.readonlyCell, { width: VENDOR_COL_WIDTH }]} numberOfLines={1}>
                      {row.supplierRef || '-'}
                    </Text>
                    <Text style={[styles.readonlyCell, { width: DATE_COL_WIDTH }]} numberOfLines={1}>
                      {row.validFrom}
                    </Text>
                    <View style={[styles.rowActionGroup, { width: SUBMITTED_ACTION_COL_WIDTH }]}>
                      {isEditing ? (
                        isSavingThisRow ? (
                          <ActivityIndicator size="small" color={colors.rust} />
                        ) : (
                          <>
                            <Pressable
                              onPress={() => saveEditedRow(row)}
                              accessibilityRole="button"
                              accessibilityLabel={`Save row ${i + 1}`}
                            >
                              <Ionicons name="checkmark-circle-outline" size={19} color={colors.green} />
                            </Pressable>
                            <Pressable
                              onPress={() => cancelEditRow(row.key)}
                              accessibilityRole="button"
                              accessibilityLabel={`Cancel edit, row ${i + 1}`}
                            >
                              <Ionicons name="close-circle-outline" size={19} color={colors.red} />
                            </Pressable>
                          </>
                        )
                      ) : (
                        <Pressable
                          onPress={() => startEditRow(row)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit row ${i + 1}`}
                        >
                          <Ionicons name="pencil-outline" size={17} color={colors.rust} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {rowError && (
            <View style={[styles.statusBanner, styles.statusError]}>
              <Ionicons name="alert-circle" size={16} color={colors.red} />
              <Text style={[styles.statusText, { color: colors.red }]}>{rowError.message}</Text>
            </View>
          )}
        </>
      )}

      {!entryMode && (
        <Pressable
          style={styles.newEntryBtn}
          onPress={startNewSubmission}
          accessibilityRole="button"
          accessibilityLabel="Submit new rates"
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.rust} />
          <Text style={styles.newEntryBtnText}>Submit New Rates</Text>
        </Pressable>
      )}

      {entryMode && (
        <>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconBox}>
              <Ionicons name="grid-outline" size={14} color={colors.rust} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.sectionTitle}>Market Rate Entries</Text>
              <Text style={styles.sectionSubtitle}>Fill in one row per material, then save the whole batch together</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
            <View style={[styles.card, { width: TABLE_WIDTH }]}>
              <View style={styles.tableHeaderRow}>
                {TEXT_COLUMNS.map((col) => (
                  <Text key={col.field} style={[styles.headerCell, { width: col.width }]}>{col.label}</Text>
                ))}
                <Text style={[styles.headerCell, { width: VENDOR_COL_WIDTH }]}>Vendor</Text>
                <Text style={[styles.headerCell, { width: DATE_COL_WIDTH }]}>Valid From</Text>
                <View style={{ width: REMOVE_COL_WIDTH }} />
              </View>

              {rows.map((row, i) => (
                <View key={row.key} style={styles.tableRow}>
                  {TEXT_COLUMNS.map((col) => {
                    const isLocked = !!row.locked && LOCKED_FIELDS.includes(col.field);
                    return (
                      <View key={col.field} style={{ width: col.width }}>
                        <TextInput
                          value={row[col.field]}
                          onChangeText={(v) => updateCell(row.key, col.field, v)}
                          placeholder={col.placeholder}
                          placeholderTextColor={colors.inkSoft}
                          keyboardType={col.keyboard}
                          autoCapitalize={col.field === 'materialCode' ? 'characters' : 'sentences'}
                          editable={!isLocked}
                          style={[
                            styles.cellInput,
                            BOLD_FIELDS.includes(col.field) && styles.cellInputBold,
                            isLocked && styles.cellInputLocked,
                          ]}
                          accessibilityLabel={`${col.label}, row ${i + 1}`}
                        />
                      </View>
                    );
                  })}
                  <Text style={[styles.readonlyCell, { width: VENDOR_COL_WIDTH }]} numberOfLines={1}>
                    {row.supplierRef || '-'}
                  </Text>
                  <DateCell
                    value={row.validFrom}
                    onChange={(v) => updateCell(row.key, 'validFrom', v)}
                    label={`Valid from date, row ${i + 1}`}
                  />
                  <Pressable
                    onPress={() => removeRow(row.key)}
                    disabled={rows.length === 1}
                    style={[styles.removeBtn, { width: REMOVE_COL_WIDTH }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove row ${i + 1}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={rows.length === 1 ? colors.border : colors.red} />
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>

          {status && (
            <View style={[styles.statusBanner, styles.statusError]}>
              <Ionicons name="alert-circle" size={16} color={colors.red} />
              <Text style={[styles.statusText, { color: colors.red }]}>{status.message}</Text>
            </View>
          )}

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={onSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save market rates"
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color={colors.white} />
                <Text style={styles.saveBtnText}>Save</Text>
              </>
            )}
          </Pressable>
        </>
      )}

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => setShowSuccessModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconBox}>
              <Ionicons name="checkmark-circle" size={30} color={colors.green} />
            </View>
            <Text style={styles.modalTitle}>Rate has been submitted successfully</Text>
            <Text style={styles.modalMessage}>Check the History tab for further changes.</Text>
            <Pressable
              style={styles.modalBtn}
              onPress={() => {
                setSubmittedRows((prev) => {
                  const incoming = pendingSubmittedRows || [];
                  if (incoming.length === 0) return prev;
                  // Drop any prior submitted-today row for a material this batch just re-saved,
                  // so re-submitting the same material doesn't leave a stale duplicate row.
                  const incomingCodes = new Set(incoming.map((r) => r.materialCode));
                  const kept = (prev || []).filter((r) => !incomingCodes.has(r.materialCode));
                  return [...kept, ...incoming];
                });
                setPendingSubmittedRows(null);
                setEntryMode(false);
                setShowSuccessModal(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.modalBtnText}>OK</Text>
            </Pressable>
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
  flex1: {
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionIconBox: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 1,
  },
  tableScroll: {
    flexGrow: 0,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(31,27,51,0.06)' },
      default: {
        shadowColor: colors.plum,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.rust,
    borderBottomWidth: 1,
    borderBottomColor: colors.rust,
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
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cellInput: {
    width: '100%',
    fontSize: 12.5,
    color: colors.ink,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  cellInputBold: {
    fontWeight: '700',
  },
  // Locked cells (material code/description pre-filled from SAP) still read as plain, legible
  // text — not editable, but not washed out either. Non-editability is conveyed by the field
  // simply not responding to taps, same as the read-only Vendor cell beside it.
  cellInputLocked: {
    backgroundColor: colors.white,
    color: colors.ink,
  },
  // Market Rate cell in the Submitted Rates table once Edit has been tapped for that row — a
  // rust-tinted border so the one editable cell in an otherwise read-only row is obvious at a glance.
  cellInputEditing: {
    borderWidth: 1,
    borderColor: colors.rust,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
  },
  rowActionGroup: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  newEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 16,
    borderRadius: radii.lg,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.rust,
  },
  newEntryBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.rust,
  },
  readonlyCell: {
    fontSize: 12.5,
    color: colors.inkSoft,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  dateBtnText: {
    fontSize: 15,
    color: colors.ink,
  },
  removeBtn: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    padding: 12,
    marginTop: 16,
    maxWidth: 900,
  },
  statusError: {
    backgroundColor: `${colors.red}14`,
  },
  statusText: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: radii.lg,
    paddingVertical: 13,
    backgroundColor: colors.rust,
    maxWidth: 900,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
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
    maxWidth: 360,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 24,
    alignItems: 'center',
  },
  modalIconBox: {
    width: 52,
    height: 52,
    borderRadius: radii.xl,
    backgroundColor: `${colors.green}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  modalBtn: {
    marginTop: 18,
    borderRadius: radii.lg,
    paddingVertical: 11,
    paddingHorizontal: 32,
    backgroundColor: colors.rust,
  },
  modalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.white,
  },
});
