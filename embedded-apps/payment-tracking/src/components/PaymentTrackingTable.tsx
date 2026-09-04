import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import type { PaymentTrackingRow } from '../lib/paymentTrackingApi';

interface Field {
  label: string;
  strong?: boolean;
  get: (row: PaymentTrackingRow) => string;
}

// Exactly the fields Provision Tracking needs, per instruction — every other field
// paymentTrackingApi.ts maps stays available on the row (e.g. for a future export) but isn't
// shown here. PO No / Line No move into the card header below instead of a field, and Status
// becomes the header badge — everything else renders as a wrapping label/value field so the whole
// row is visible without horizontal scrolling on any screen size.
const FIELDS: Field[] = [
  { label: 'PO Creater', get: (r) => r.poCreator },
  { label: 'Vendor', get: (r) => [r.vendor, r.vendorName].filter(Boolean).join(' · ') },
  { label: 'Service Txt', get: (r) => r.serviceText },
  { label: 'Activity Value', get: (r) => r.grossValue },
  { label: 'Liability Create (Y/N)', get: (r) => r.liabilityCreated },
  { label: 'Entry Sheet No', get: (r) => r.entrySheetNo },
  { label: 'Pending Bill Value', strong: true, get: (r) => r.pendingValue },
  { label: 'Cost Center', get: (r) => [r.costCenter, r.costCenterText].filter(Boolean).join(' · ') },
  { label: 'GL Code', get: (r) => [r.glAccount, r.glAccountText].filter(Boolean).join(' · ') },
];

// Card accent by the SAP-derived Status code — '02' (GR/MIGO posted, no SES) is the main provision
// exposure bucket per instruction, so it gets the strongest tint; '01' (nothing at all yet) is
// next; '03' (SES created then reversed) is informational; '04' (acceptance pending) is a mild
// amber; '05' (accepted) gets no tint — it's resolved.
const STATUS_ROW_TINT: Record<string, string> = {
  '02': `${colors.red}14`,
  '01': `${colors.red}0A`,
  '03': `${colors.inkSoft}12`,
  '04': '#FFFBEB',
};

interface PaymentTrackingTableProps {
  rows: PaymentTrackingRow[];
  emptyMessage: string;
}

/** Read-only provision-status list shared across Provision Tracking's screens (Upcoming/Missed
 * Provision, and the Provision Details pop-up's line-item list) — one card per PO item with its
 * fields wrapping into as many columns as the screen width allows (many on desktop, one or two on
 * mobile), so nothing needs horizontal scrolling to be seen. Card accent follows SAP's own computed
 * Status field rather than a client-side answer, unlike Delivery Confirmation's table. */
export default function PaymentTrackingTable({ rows, emptyMessage }: PaymentTrackingTableProps) {
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((row) => {
        const tint = STATUS_ROW_TINT[row.status];
        return (
          <View key={row.key} style={[styles.card, tint ? { backgroundColor: tint } : null]}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                PO {row.poNumber || '—'} · Line {row.poItemNo || '—'}
              </Text>
              {row.statusText ? (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{row.statusText}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.fieldGrid}>
              {FIELDS.map((f) => (
                <View key={f.label} style={styles.field}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <Text style={[styles.fieldValue, f.strong && styles.fieldValueStrong]}>
                    {f.get(row) || '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 14,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.ink,
  },
  statusBadge: {
    maxWidth: 180,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  field: {
    minWidth: 140,
    flexGrow: 1,
    flexBasis: 140,
    gap: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  fieldValue: {
    fontSize: 12.5,
    color: colors.ink,
  },
  fieldValueStrong: {
    color: colors.red,
    fontWeight: '800',
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
