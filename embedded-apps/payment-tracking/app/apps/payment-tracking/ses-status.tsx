import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow, type ProvisionStatus } from '../../../src/lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { useMonthYear } from '../../../src/context/MonthYearContext';
import { num, formatValue, breakdownBy, filterByMonth } from '../../../src/lib/provisionMetrics';
import { ProvisionHero, KpiCard, HorizontalBarBreakdown, ProvisionDetailModal } from '../../../src/components/ProvisionUI';
import { ProvisionFilterBar, applyProvisionFilters, EMPTY_PROVISION_FILTERS, type ProvisionFilterState } from '../../../src/components/ProvisionFilters';

// The SES lifecycle, per paymentTrackingApi.ts's own header comment on how Status is derived —
// used as the fixed set of tiles below so every stage always shows (even at zero) rather than only
// the statuses this month's rows happen to include.
const STATUS_STAGES: { code: ProvisionStatus; label: string; icon: keyof typeof Ionicons.glyphMap; accent: string }[] = [
  { code: '01', label: 'Service Entry Sheet not created', icon: 'document-outline', accent: colors.inkSoft },
  { code: '02', label: 'GR posted, SES not created', icon: 'warning-outline', accent: colors.red },
  { code: '03', label: 'SES created and reversed', icon: 'refresh-outline', accent: colors.inkSoft },
  { code: '04', label: 'SES created, acceptance pending', icon: 'time-outline', accent: colors.amber },
  { code: '05', label: 'SES created and accepted', icon: 'checkmark-done-outline', accent: colors.green },
];

/** Admin's Overall SES Status — a single at-a-glance summary of every open PO item's Service Entry
 * Sheet lifecycle stage (Status '01'-'05', see paymentTrackingApi.ts), across the whole org. Reuses
 * fetchProvisionPOs (ZProvisionTrackSet) exactly as Dashboard/Provision Details do — same Admin-
 * scoped email, same Month/Year context — so this always matches what those screens report. */
export default function SesStatusScreen() {
  const { email, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProvisionFilterState>(EMPTY_PROVISION_FILTERS);
  const [activeStatus, setActiveStatus] = useState<{ title: string; subtitle: string; rows: PaymentTrackingRow[] } | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchProvisionPOs(email, { gjahr: year })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load SES status data.'))
      .finally(() => setLoading(false));
  }, [email, isAdmin, roleLoading, year]);

  const monthRows = useMemo(() => filterByMonth(rows, month), [rows, month]);
  const filteredRows = useMemo(() => applyProvisionFilters(monthRows, filters), [monthRows, filters]);

  const rowsByStatus = useMemo(() => {
    const map = new Map<string, PaymentTrackingRow[]>();
    filteredRows.forEach((r) => {
      const key = r.status || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  }, [filteredRows]);

  const statusBreakdown = useMemo(
    () => breakdownBy(filteredRows, (r) => r.status || '(unknown)', (r) => r.status || 'Unknown', (r) => r.statusText),
    [filteredRows]
  );

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (!isAdmin) {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.inkSoft} />
        <Text style={styles.deniedText}>Overall SES Status is only available to Admins.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <ProvisionHero
        eyebrow="Admin · Cross-org"
        title="Overall SES Status"
        subtitle="Every open PO item's Service Entry Sheet lifecycle stage, at a glance — tap a stage or a bar for its line items."
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.rust} />
          <Text style={styles.loadingText}>Loading SES status data…</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <ProvisionFilterBar rows={monthRows} value={filters} onChange={setFilters} resultCount={filteredRows.length} />

          <View style={styles.kpiGrid}>
            {STATUS_STAGES.map((stage) => {
              const stageRows = rowsByStatus.get(stage.code) || [];
              const stageValue = stageRows.reduce((sum, r) => sum + num(r.pendingValue), 0);
              return (
                <KpiCard
                  key={stage.code}
                  icon={stage.icon}
                  label={`${stage.code} · ${stage.label}`}
                  value={`${stageRows.length} · ${formatValue(stageValue)}`}
                  accent={stage.accent}
                  onPress={() => setActiveStatus({
                    title: `${stage.code} · ${stage.label}`,
                    subtitle: `${stageRows.length} line item(s), ${formatValue(stageValue)} pending.`,
                    rows: stageRows,
                  })}
                />
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pending bill value by SES status</Text>
            <Text style={styles.cardSubtitle}>The provision lifecycle from Service Entry Sheet not created through accepted. Tap a bar for its line items.</Text>
            <HorizontalBarBreakdown
              data={statusBreakdown}
              emptyMessage="No open provisions to break down yet."
              onSelect={(d) => setActiveStatus({
                title: `Status: ${d.label}${d.sublabel ? ` — ${d.sublabel}` : ''}`,
                subtitle: `${d.count} line item(s), ${formatValue(d.value)} pending.`,
                rows: filteredRows.filter((r) => (r.status || '(unknown)') === d.key),
              })}
            />
          </View>
        </>
      )}

      {activeStatus && (
        <ProvisionDetailModal
          title={activeStatus.title}
          subtitle={activeStatus.subtitle}
          rows={activeStatus.rows}
          onClose={() => setActiveStatus(null)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
    gap: 16,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  deniedText: {
    fontSize: 13,
    color: colors.inkSoft,
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
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 18,
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
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.ink,
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
    marginBottom: 12,
    lineHeight: 17,
  },
});
