import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchSuppliedMaterials, saveMarketRates, type MarketRateRow } from '../../../src/lib/marketRateApi';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';

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

const TEXT_COLUMNS: { field: TextField; label: string; width: number; placeholder: string; keyboard?: 'decimal-pad' }[] = [
  { field: 'materialCode', label: 'Material Code', width: 130, placeholder: 'e.g. MAT-1001' },
  { field: 'materialDesc', label: 'Material Description', width: 260, placeholder: 'e.g. Light Liquid Paraffin' },
  { field: 'marketRate', label: 'Market Rate', width: 100, placeholder: '0.00', keyboard: 'decimal-pad' },
  { field: 'ratePer', label: 'Rate UOM', width: 90, placeholder: 'e.g. L' },
];

/** Reference data from ZMarketSuppDataSet — locked (not free-typed) once a row is pre-filled from
 * there, so a typo can't quietly diverge a row from SAP's actual material master. See
 * MarketRateRow.locked. */
const LOCKED_FIELDS: TextField[] = ['materialCode', 'materialDesc', 'materialType'];
/** Bolded for scannability — these are the two fields that identify which material a row is for. */
const BOLD_FIELDS: TextField[] = ['materialCode', 'materialDesc'];

const DATE_COL_WIDTH = 140;
const REMOVE_COL_WIDTH = 44;
const TABLE_WIDTH = TEXT_COLUMNS.reduce((sum, c) => sum + c.width, 0) + DATE_COL_WIDTH + REMOVE_COL_WIDTH;

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
        onChange={(e: any) => onChange(e.target.value)}
        aria-label={label}
        style={{
          width: DATE_COL_WIDTH - 20,
          height: 36,
          padding: '6px 10px',
          margin: 6,
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.white,
          color: colors.ink,
          fontSize: 12.5,
          boxSizing: 'border-box',
        }}
      />
    );
  }

  const dateObj = value ? new Date(`${value}T00:00:00`) : new Date();
  return (
    <View style={{ width: DATE_COL_WIDTH, paddingHorizontal: 6 }}>
      <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name="calendar-outline" size={13} color={colors.rust} />
        <Text style={styles.dateBtnText}>{value}</Text>
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

type SaveStatus = { type: 'success' | 'error'; message: string } | null;

export default function MarketRateScreen() {
  const [rows, setRows] = useState<MarketRateRow[]>(DEFAULT_ROWS);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  // Pre-fills the table with whatever materials this signed-in email is already associated with
  // (ZMarketSuppDataSet) instead of starting blank — market rate/GST/valid-from still need to
  // be filled in per row, those aren't part of that reference data. Falls back to the default
  // blank rows if nothing comes back (no supplier data yet, or the lookup fails).
  useEffect(() => {
    const email = getHubEmail();
    if (!email) {
      setLoadingInitial(false);
      return;
    }
    fetchSuppliedMaterials(email).then((materials) => {
      if (materials.length > 0) {
        setRows(
          materials.map((m) => {
            nextKey += 1;
            const supplierRef = [m.supplierCode, m.supplierName].filter(Boolean).join(' · ');
            return {
              key: `row-${nextKey}`,
              materialCode: m.materialCode,
              materialDesc: m.materialDesc,
              materialType: m.materialType,
              marketName: '',
              marketRate: m.latestRate,
              ratePer: m.rateUom,
              igst: '',
              sgst: '',
              cgst: '',
              validFrom: todayIso(),
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

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (key: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const onSave = async () => {
    setStatus(null);
    const filled = rows.filter((r) => TEXT_COLUMNS.some((c) => r[c.field].trim()));
    if (filled.length === 0) {
      setStatus({ type: 'error', message: 'Fill in at least one row before saving.' });
      return;
    }
    const NUMERIC: TextField[] = ['marketRate'];
    const invalidNumber = filled.find((r) => NUMERIC.some((f) => r[f].trim() && Number.isNaN(Number(r[f]))));
    if (invalidNumber) {
      setStatus({ type: 'error', message: 'Market rate must be a number.' });
      return;
    }

    setSaving(true);
    try {
      const email = getHubEmail();
      await saveMarketRates(filled, email ? { email } : undefined);
      setStatus({ type: 'success', message: `Saved ${filled.length} row${filled.length === 1 ? '' : 's'}.` });
      setRows(DEFAULT_ROWS());
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Could not save. Please try again.' });
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
                    {col.field === 'materialDesc' && !!row.supplierRef && (
                      <Text style={styles.supplierCaption} numberOfLines={1}>{row.supplierRef}</Text>
                    )}
                  </View>
                );
              })}
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

          <Pressable style={styles.addRowBtn} onPress={addRow} accessibilityRole="button" accessibilityLabel="Add row">
            <Ionicons name="add" size={16} color={colors.rust} />
            <Text style={styles.addRowText}>Add row</Text>
          </Pressable>
        </View>
      </ScrollView>

      {status && (
        <View style={[styles.statusBanner, status.type === 'success' ? styles.statusSuccess : styles.statusError]}>
          <Ionicons
            name={status.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={16}
            color={status.type === 'success' ? colors.green : colors.red}
          />
          <Text style={[styles.statusText, { color: status.type === 'success' ? colors.green : colors.red }]}>
            {status.message}
          </Text>
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
  cellInputLocked: {
    backgroundColor: colors.appBg,
    color: colors.inkSoft,
  },
  supplierCaption: {
    fontSize: 10,
    color: colors.inkSoft,
    paddingHorizontal: 10,
    marginTop: -8,
    marginBottom: 6,
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
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  dateBtnText: {
    fontSize: 12.5,
    color: colors.ink,
  },
  removeBtn: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: colors.white,
  },
  addRowText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.rust,
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
  statusSuccess: {
    backgroundColor: `${colors.green}14`,
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
});
