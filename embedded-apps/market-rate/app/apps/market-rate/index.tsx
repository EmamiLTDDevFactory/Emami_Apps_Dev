import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';
import { saveMarketRates, type MarketRateRow } from '../../../src/lib/marketRateApi';

let nextKey = 0;
function emptyRow(): MarketRateRow {
  nextKey += 1;
  return { key: `row-${nextKey}`, materialCode: '', marketRate: '', validFrom: '' };
}

type SaveStatus = { type: 'success' | 'error'; message: string } | null;

export default function MarketRateScreen() {
  const [rows, setRows] = useState<MarketRateRow[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  const updateCell = (key: string, field: keyof Omit<MarketRateRow, 'key'>, value: string) => {
    setStatus(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (key: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const onSave = async () => {
    setStatus(null);
    const filled = rows.filter((r) => r.materialCode.trim() || r.marketRate.trim() || r.validFrom.trim());
    if (filled.length === 0) {
      setStatus({ type: 'error', message: 'Fill in at least one row before saving.' });
      return;
    }
    const incomplete = filled.find((r) => !r.materialCode.trim() || !r.marketRate.trim() || !r.validFrom.trim());
    if (incomplete) {
      setStatus({ type: 'error', message: 'Every row needs a material code, market rate, and valid-from date.' });
      return;
    }
    const invalidRate = filled.find((r) => Number.isNaN(Number(r.marketRate)));
    if (invalidRate) {
      setStatus({ type: 'error', message: `"${invalidRate.marketRate}" isn't a valid market rate.` });
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
      await saveMarketRates(filled, getHubEmail());
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
      <View style={styles.card}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.headerCell, styles.colCode]}>Material Code</Text>
          <Text style={[styles.headerCell, styles.colRate]}>Market Rate</Text>
          <Text style={[styles.headerCell, styles.colDate]}>Valid From</Text>
          <View style={styles.colRemove} />
        </View>

        {rows.map((row, i) => (
          <View key={row.key} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
            <TextInput
              value={row.materialCode}
              onChangeText={(v) => updateCell(row.key, 'materialCode', v)}
              placeholder="e.g. RM-10234"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="characters"
              style={[styles.cellInput, styles.colCode]}
              accessibilityLabel={`Material code, row ${i + 1}`}
            />
            <TextInput
              value={row.marketRate}
              onChangeText={(v) => updateCell(row.key, 'marketRate', v)}
              placeholder="0.00"
              placeholderTextColor={colors.inkSoft}
              keyboardType="decimal-pad"
              style={[styles.cellInput, styles.colRate]}
              accessibilityLabel={`Market rate, row ${i + 1}`}
            />
            <TextInput
              value={row.validFrom}
              onChangeText={(v) => updateCell(row.key, 'validFrom', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.inkSoft}
              style={[styles.cellInput, styles.colDate]}
              accessibilityLabel={`Valid from date, row ${i + 1}`}
            />
            <Pressable
              onPress={() => removeRow(row.key)}
              disabled={rows.length === 1}
              style={[styles.removeBtn, styles.colRemove]}
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
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.appBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCell: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
  colCode: {
    flex: 2,
    minWidth: Platform.OS === 'web' ? 0 : 110,
  },
  colRate: {
    flex: 1.3,
    minWidth: Platform.OS === 'web' ? 0 : 90,
  },
  colDate: {
    flex: 1.5,
    minWidth: Platform.OS === 'web' ? 0 : 110,
  },
  colRemove: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellInput: {
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  removeBtn: {
    height: '100%',
    paddingVertical: 12,
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
