import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import {
  fetchProvisionLog,
  PROVISION_LOG_STATUSES,
  PROVISION_LOG_STATUS_LABELS,
  type ProvisionLogRow,
  type ProvisionLogStatus,
} from '../../../src/lib/paymentTrackingApi';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { formatDeliveryDate } from '../../../src/lib/provisionMetrics';

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (roleLoading || !email) return;
    setLoading(true);
    setLoadError(null);
    fetchProvisionLog(email)
      .then(setRows)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load submission history.'))
      .finally(() => setLoading(false));
  }, [email, roleLoading]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.zstatus !== statusFilter) return false;
      if (!q) return true;
      const haystack = [row.poNumber, row.poItemNo, row.vendorName, row.serviceText, row.remarks].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, statusFilter]);

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  return (
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
          filteredRows.map((row) => (
            <View key={row.key} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>PO {row.poNumber || '—'} · Item {row.poItemNo || '—'}</Text>
                  {row.vendorName ? <Text style={styles.cardSubtitle} numberOfLines={1}>{row.vendorName}</Text> : null}
                </View>
                <StatusBadge status={row.zstatus} text={row.zstatusText} />
              </View>

              <View style={styles.fieldGrid}>
                <InfoField label="Service" value={row.serviceText} />
                <InfoField label="Action Date" value={formatDeliveryDate(row.actionDate)} />
                <InfoField label="Remarks" value={row.remarks} />
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
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
});
