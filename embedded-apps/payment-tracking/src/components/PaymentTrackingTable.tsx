import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import { formatDateFriendly, type PaymentTrackingRow } from '../lib/paymentTrackingApi';

interface Column {
  key: keyof PaymentTrackingRow;
  label: string;
  width: number;
}

// Every field the backend returns, per instruction — grouped roughly PO identity -> qty ->
// value/status -> service entry sheet -> account assignment -> misc.
const COLUMNS: Column[] = [
  { key: 'poNumber', label: 'PO Number', width: 100 },
  { key: 'poItemNo', label: 'PO Item No', width: 90 },
  { key: 'poText', label: 'PO Text', width: 180 },
  { key: 'vendor', label: 'Vendor', width: 90 },
  { key: 'companyCode', label: 'Company Code', width: 100 },
  { key: 'matNumber', label: 'Material Number', width: 130 },
  { key: 'materialDesc', label: 'Material Description', width: 200 },
  { key: 'matGroup', label: 'Material Group', width: 110 },
  { key: 'purchGroup', label: 'Purch. Group', width: 100 },
  { key: 'acctAssignCat', label: 'Acct Assign Cat', width: 110 },
  { key: 'packageNo', label: 'Package No', width: 100 },
  { key: 'orderUnit', label: 'Order Unit', width: 90 },
  { key: 'deliveryDate', label: 'Delivery Date', width: 120 },
  { key: 'poDate', label: 'PO Date', width: 110 },
  { key: 'scheduleQty', label: 'Schedule Qty', width: 100 },
  { key: 'delvQty', label: 'Delivered Qty', width: 100 },
  { key: 'remainingQty', label: 'Remaining Qty', width: 110 },
  { key: 'netValue', label: 'Net Value', width: 100 },
  { key: 'currency', label: 'Currency', width: 80 },
  { key: 'postedValue', label: 'Posted Value', width: 100 },
  { key: 'reversedValue', label: 'Reversed Value', width: 110 },
  { key: 'netValuePosted', label: 'Net Value Posted', width: 120 },
  { key: 'netQty', label: 'Net Qty', width: 90 },
  { key: 'openValue', label: 'Open Value', width: 100 },
  { key: 'status', label: 'Status', width: 100 },
  { key: 'statusText', label: 'Status Text', width: 220 },
  { key: 'sesCount', label: 'SES Count', width: 90 },
  { key: 'sesDeleted', label: 'SES Deleted', width: 90 },
  { key: 'sesAccepted', label: 'SES Accepted', width: 100 },
  { key: 'lastSesNumber', label: 'Last SES No', width: 110 },
  { key: 'lastSesDate', label: 'Last SES Date', width: 120 },
  { key: 'acctAssignCount', label: 'Acct Assign Count', width: 130 },
  { key: 'multiAccount', label: 'Multi Account', width: 110 },
  { key: 'glAccount', label: 'GL Account', width: 100 },
  { key: 'glAccountText', label: 'GL Account Text', width: 180 },
  { key: 'costCenter', label: 'Cost Center', width: 100 },
  { key: 'costCenterText', label: 'Cost Center Text', width: 180 },
  { key: 'internalOrder', label: 'Internal Order', width: 110 },
  { key: 'wbsElement', label: 'WBS Element', width: 110 },
  { key: 'daysOverdue', label: 'Days Overdue', width: 100 },
];
const DATE_KEYS = new Set<keyof PaymentTrackingRow>(['deliveryDate', 'poDate', 'lastSesDate']);

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
 * Pending) — every field the backend returns is its own column, since none of it is something a
 * user confirms (see paymentTrackingApi.ts's header comment). Row color follows SAP's own computed
 * Status field rather than a client-side answer, unlike Delivery Confirmation's table. */
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
            <Text key={col.key} style={[styles.headerCell, { width: col.width }]} numberOfLines={2}>
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
                const display =
                  col.key === 'multiAccount'
                    ? (raw ? 'Yes' : 'No')
                    : DATE_KEYS.has(col.key)
                      ? formatDateFriendly(raw as string)
                      : (raw as string) || '—';
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
