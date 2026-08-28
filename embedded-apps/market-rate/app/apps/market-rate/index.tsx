import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { saveMarketRates, type MarketRateRow } from '../../../src/lib/marketRateApi';

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
    validFrom: '',
  };
}

type EditableField = Exclude<keyof MarketRateRow, 'key'>;

const COLUMNS: { field: EditableField; label: string; width: number; placeholder: string; keyboard?: 'decimal-pad' }[] = [
  { field: 'materialCode', label: 'Material Code', width: 130, placeholder: 'e.g. MAT-1001' },
  { field: 'materialDesc', label: 'Material Description', width: 190, placeholder: 'e.g. Light Liquid Paraffin' },
  { field: 'materialType', label: 'Material Type', width: 100, placeholder: 'e.g. ROH' },
  { field: 'marketName', label: 'Market', width: 120, placeholder: 'e.g. Kolkata' },
  { field: 'marketRate', label: 'Market Rate', width: 100, placeholder: '0.00', keyboard: 'decimal-pad' },
  { field: 'ratePer', label: 'Rate UOM', width: 90, placeholder: 'e.g. L' },
  { field: 'igst', label: 'IGST %', width: 80, placeholder: '0.00', keyboard: 'decimal-pad' },
  { field: 'sgst', label: 'SGST %', width: 80, placeholder: '0.00', keyboard: 'decimal-pad' },
  { field: 'cgst', label: 'CGST %', width: 80, placeholder: '0.00', keyboard: 'decimal-pad' },
  { field: 'validFrom', label: 'Valid From', width: 120, placeholder: 'YYYY-MM-DD' },
];

const REMOVE_COL_WIDTH = 44;
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0) + REMOVE_COL_WIDTH;

type SaveStatus = { type: 'success' | 'error'; message: string } | null;

export default function MarketRateScreen() {
  const [companyCode, setCompanyCode] = useState('1000');
  const [rows, setRows] = useState<MarketRateRow[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  const updateCell = (key: string, field: EditableField, value: string) => {
    setStatus(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (key: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const onSave = async () => {
    setStatus(null);
    if (!companyCode.trim()) {
      setStatus({ type: 'error', message: 'Company code is required.' });
      return;
    }
    const filled = rows.filter((r) => Object.entries(r).some(([k, v]) => k !== 'key' && v.trim()));
    if (filled.length === 0) {
      setStatus({ type: 'error', message: 'Fill in at least one row before saving.' });
      return;
    }
    const REQUIRED: EditableField[] = ['materialCode', 'materialDesc', 'materialType', 'marketName', 'marketRate', 'ratePer', 'validFrom'];
    const incomplete = filled.find((r) => REQUIRED.some((f) => !r[f].trim()));
    if (incomplete) {
      setStatus({ type: 'error', message: 'Every row needs a material code, description, type, market, rate, UOM, and valid-from date. GST fields default to 0 if left blank.' });
      return;
    }
    const NUMERIC: EditableField[] = ['marketRate', 'igst', 'sgst', 'cgst'];
    const invalidNumber = filled.find((r) => NUMERIC.some((f) => r[f].trim() && Number.isNaN(Number(r[f]))));
    if (invalidNumber) {
      setStatus({ type: 'error', message: 'Market rate and GST fields must be numbers.' });
      return;
    }
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const invalidDate = filled.find((r) => !DATE_RE.test(r.validFrom.trim()));
    if (invalidDate) {
      setStatus({ type: 'error', message: `"${invalidDate.validFrom}" isn't a valid date — use YYYY-MM-DD.` });
      return;
    }

    setSaving(true);
    try {
      await saveMarketRates(filled, companyCode.trim());
      setStatus({ type: 'success', message: `Saved ${filled.length} row${filled.length === 1 ? '' : 's'}.` });
      setRows([emptyRow(), emptyRow(), emptyRow()]);
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

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

      <View style={styles.companyRow}>
        <Text style={styles.companyLabel}>Company Code</Text>
        <TextInput
          value={companyCode}
          onChangeText={setCompanyCode}
          placeholder="e.g. 1000"
          placeholderTextColor={colors.inkSoft}
          style={styles.companyInput}
          accessibilityLabel="Company code"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
        <View style={[styles.card, { width: TABLE_WIDTH }]}>
          <View style={styles.tableHeaderRow}>
            {COLUMNS.map((col) => (
              <Text key={col.field} style={[styles.headerCell, { width: col.width }]}>{col.label}</Text>
            ))}
            <View style={{ width: REMOVE_COL_WIDTH }} />
          </View>

          {rows.map((row, i) => (
            <View key={row.key} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              {COLUMNS.map((col) => (
                <TextInput
                  key={col.field}
                  value={row[col.field]}
                  onChangeText={(v) => updateCell(row.key, col.field, v)}
                  placeholder={col.placeholder}
                  placeholderTextColor={colors.inkSoft}
                  keyboardType={col.keyboard}
                  autoCapitalize={col.field === 'materialCode' ? 'characters' : 'sentences'}
                  style={[styles.cellInput, { width: col.width }]}
                  accessibilityLabel={`${col.label}, row ${i + 1}`}
                />
              ))}
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
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  companyLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  companyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.ink,
    width: 120,
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
    backgroundColor: `${colors.rust}0d`,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCell: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowAlt: {
    backgroundColor: colors.appBg,
  },
  cellInput: {
    fontSize: 12.5,
    color: colors.ink,
    paddingVertical: 12,
    paddingHorizontal: 10,
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
