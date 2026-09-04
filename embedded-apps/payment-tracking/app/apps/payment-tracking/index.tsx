import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { num, formatValue, breakdownBy } from '../../../src/lib/provisionMetrics';
import { ProvisionHero, KpiCard, HorizontalBarBreakdown, OptionCard } from '../../../src/components/ProvisionUI';

/** Home — the app's root route ("/apps/payment-tracking/") and first side-pane tab for every role.
 * A "command center" landing: top-line KPIs plus quick links into whatever this role's real work
 * screens are (Admin: Dashboard/Provision Details; everyone else: their own Upcoming/Missed
 * Provision), so nobody lands on a blank page or has to guess where to go first. Reuses
 * fetchProvisionPOs(email) — same call every other screen makes, always sending the signed-in
 * user's own login email (see paymentTrackingApi.ts's header comment on why it's never omitted). */
export default function ProvisionHome() {
  const router = useRouter();
  const { email, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (!email) {
      setLoading(false);
      setError('Not signed in.');
      return;
    }
    setLoading(true);
    setError(null);
    fetchProvisionPOs(email)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load provision data.'))
      .finally(() => setLoading(false));
  }, [email, roleLoading]);

  const distinctPOs = useMemo(() => new Set(rows.map((r) => r.poNumber)).size, [rows]);
  const totalPending = useMemo(() => rows.reduce((sum, r) => sum + num(r.pendingValue), 0), [rows]);
  const upcomingRows = useMemo(() => rows.filter((r) => r.status === '01' || r.status === '04'), [rows]);
  // '02' = GR/MIGO posted but no Service Entry Sheet yet — called out explicitly as "your main
  // provision exposure bucket".
  const missedRows = useMemo(() => rows.filter((r) => r.status === '02'), [rows]);
  const distinctCostCenters = useMemo(() => new Set(rows.filter((r) => r.costCenter).map((r) => r.costCenter)).size, [rows]);
  const distinctVendors = useMemo(() => new Set(rows.filter((r) => r.vendor).map((r) => r.vendor)).size, [rows]);

  const statusBreakdown = useMemo(
    () => breakdownBy(rows, (r) => r.status || '(unknown)', (r) => r.status || 'Unknown', (r) => r.statusText),
    [rows]
  );

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  const quickLinks = isAdmin
    ? [
        {
          key: 'dashboard',
          icon: 'grid-outline' as const,
          title: 'Dashboard',
          subtitle: 'Cross-org KPIs plus pending-value breakdowns by status and cost center.',
          href: '/apps/payment-tracking/dashboard',
        },
        {
          key: 'provision-details',
          icon: 'layers-outline' as const,
          title: 'Provision Details',
          subtitle: 'Drill into tiles by cost center, or browse every open PO in a detailed report.',
          href: '/apps/payment-tracking/provision-details',
        },
      ]
    : [
        {
          key: 'upcoming',
          icon: 'calendar-outline' as const,
          title: 'Upcoming Provision',
          subtitle: `${upcomingRows.length} item${upcomingRows.length === 1 ? '' : 's'} — Service Entry Sheet not yet created, or awaiting acceptance.`,
          href: '/apps/payment-tracking/upcoming',
        },
        {
          key: 'missed',
          icon: 'alert-circle-outline' as const,
          title: 'Missed Provision',
          subtitle: `${missedRows.length} item${missedRows.length === 1 ? '' : 's'} — GR/MIGO posted, no Service Entry Sheet yet. Your main exposure bucket.`,
          href: '/apps/payment-tracking/missed-delivery',
        },
      ];

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <ProvisionHero
        eyebrow="Provision Tracking"
        title="Command Center"
        subtitle={
          isAdmin
            ? 'Cross-org visibility into every open service PO — pending value, exposure, and where to drill in next.'
            : 'Your open service POs at a glance — what still needs action, and what to open next.'
        }
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.rust} />
          <Text style={styles.loadingText}>Loading provision data…</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <View style={styles.kpiGrid}>
            <KpiCard icon="document-text-outline" label="Open POs" value={String(distinctPOs)} />
            <KpiCard icon="list-outline" label="Open line items" value={String(rows.length)} />
            <KpiCard icon="cash-outline" label="Pending bill value" value={formatValue(totalPending)} accent={colors.red} />
            {isAdmin ? (
              <>
                <KpiCard icon="business-outline" label="Cost centers involved" value={String(distinctCostCenters)} />
                <KpiCard icon="people-outline" label="Vendors involved" value={String(distinctVendors)} />
              </>
            ) : (
              <>
                <KpiCard icon="calendar-outline" label="Upcoming Provision items" value={String(upcomingRows.length)} />
                <KpiCard icon="alert-circle-outline" label="Missed Provision items" value={String(missedRows.length)} accent={colors.red} />
              </>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Where to go next</Text>
            <Text style={styles.sectionSubtitle}>
              {isAdmin
                ? 'Pick a view — the cross-org Dashboard for KPIs and trends, or Provision Details to drill into individual POs.'
                : 'Pick a list to work through — items you still need to action, or items already past the main exposure point.'}
            </Text>
            <View style={styles.optionsRow}>
              {quickLinks.map((q) => (
                <OptionCard
                  key={q.key}
                  icon={q.icon}
                  title={q.title}
                  subtitle={q.subtitle}
                  onPress={() => router.replace(q.href as any)}
                />
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pending bill value by status</Text>
            <Text style={styles.cardSubtitle}>
              The provision lifecycle from Service Entry Sheet not created through accepted — where your open value currently sits.
            </Text>
            <HorizontalBarBreakdown data={statusBreakdown} emptyMessage="No open provisions to break down yet." />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
    gap: 18,
  },
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
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    color: colors.inkSoft,
    marginBottom: 10,
    lineHeight: 18,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
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
    marginTop: 3,
    marginBottom: 12,
    lineHeight: 17,
  },
});
