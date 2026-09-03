import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import { formatDateFriendly, type PaymentTrackingRow } from '../lib/paymentTrackingApi';

interface Column {
  key: keyof PaymentTrackingRow;
  label: string;
  width: number;
}

// Exactly the fields Payment Tracking needs, per instruction — every other field
// paymentTrackingApi.ts maps stays available on the row (e.g. for a future export) but isn't
// shown here.
const COLUMNS: Column[] = [
  { key: 'poNumber', label: 'Po No', width: 100 },
  { key: 'poItemNo', label: 'Line No', width: 80 },
  { key: 'poCreator', label: 'PO Creater', width: 110 },
  { key: 'vendor', label: 'Vendor Code', width: 100 },
  { key: 'vendorName', label: 'Vendor Name', width: 160 },
  { key: 'poText', label: 'Service Txt', width: 200 },
  { key: 'qtyWithUnit', label: 'Qty / Au', width: 100 },
  { key: 'netValue', label: 'Activity value', width: 120 },
  { key: 'deliveryDate', label: 'Delivery Date', width: 120 },
  { key: 'liabilityCreated', label: 'Liability Create (Y/N)', width: 150 },
  { key: 'entrySheetNo', label: 'Entry Sheet No', width: 130 },
  { key: 'openValue', label: 'Pending Bill Value', width: 130 },
  { key: 'costCenter', label: 'Cost Center', width: 100 },
  { key: 'costCenterText', label: 'Cost Center Description', width: 190 },
  { key: 'glAccount', label: 'GL Code', width: 100 },
  { key: 'glAccountText', label: 'GL Description', width: 180 },
];
const DATE_KEYS = new Set<keyof PaymentTrackingRow>(['deliveryDate']);

// Row tint by SAP's own computed status — NO_SES (nothing created yet) is the most concerning,
// PARTIAL less so, REVERSED is informational (something happened and got undone).
const STATUS_ROW_TINT: Record<string, string> = {
  NO_SES: `${colors.red}12`,
  PARTIAL: '#FFFBEB',
  REVERSED: `${colors.inkSoft}12`,
};

interface PaymentTrackingTableProps {
  rows: PaymentTrackingRow[];
  emptyMessage: string;
}

/** Read-only payment-status table shared by all three Payment Tracking tabs (Upcoming/Missed/
 * Pending) — columns are the specific fields requested (see COLUMNS above), not every field the
 * backend returns (see paymentTrackingApi.ts's header comment for the full set). Row color follows
 * SAP's own computed Status field rather than a client-side answer, unlike Delivery Confirmation's
 * table. */
export default function PaymentTrackingTable({ rows, emptyMessage }: PaymentTrackingTableProps) {
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const tableWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scroll}>
      <View style={[styles.card, { width: tableWidth }]}>
        <View style={styles.headerRow}>
          {COLUMNS.map((col) => (
            <Text key={col.key} style={[styles.headerCell, { width: col.width }]}>
              {col.label}
            </Text>
          ))}
        </View>

        {rows.map((row) => {
          const rowTint = STATUS_ROW_TINT[row.status];
          return (
            <View key={row.key} style={[styles.row, rowTint ? { backgroundColor: rowTint } : null]}>
              {COLUMNS.map((col) => {
                const raw = row[col.key];
                const display = DATE_KEYS.has(col.key) ? formatDateFriendly(raw as string) : (raw as string) || '—';
                return (
                  <Text key={col.key} style={[styles.cell, { width: col.width }]} numberOfLines={2}>
                    {display}
                  </Text>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
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
  empty: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});
