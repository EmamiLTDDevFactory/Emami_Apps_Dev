import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { num, formatValue, breakdownBy } from '../../../src/lib/provisionMetrics';
import { ProvisionHero, HeroActionButton, KpiCard, HorizontalBarBreakdown } from '../../../src/components/ProvisionUI';
import { ProvisionFilterBar, applyProvisionFilters, EMPTY_PROVISION_FILTERS, type ProvisionFilterState } from '../../../src/components/ProvisionFilters';

/** Admin's landing screen — cross-org KPIs plus "pending value by status" and "by cost center"
 * breakdowns, from fetchProvisionPOs() called with the signed-in Admin's own login email (always
 * sent, never omitted — see paymentTrackingApi.ts's header comment). The backend is trusted to
 * expand scope to every submitter once it sees that email's role is Admin. The filter bar narrows
 * `rows` before any KPI/breakdown is computed, so every number on this screen always matches what's
 * currently filtered. */
export default function ProvisionDashboard() {
  const router = useRouter();
  const { email, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProvisionFilterState>(EMPTY_PROVISION_FILTERS);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchProvisionPOs(email)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load provision data.'))
      .finally(() => setLoading(false));
  }, [email, isAdmin, roleLoading]);

  const filteredRows = useMemo(() => applyProvisionFilters(rows, filters), [rows, filters]);

  const totalPending = useMemo(() => filteredRows.reduce((sum, r) => sum + num(r.pendingValue), 0), [filteredRows]);
  const distinctPOs = useMemo(() => new Set(filteredRows.map((r) => r.poNumber)).size, [filteredRows]);
  const distinctCostCenters = useMemo(() => new Set(filteredRows.filter((r) => r.costCenter).map((r) => r.costCenter)).size, [filteredRows]);
  const distinctVendors = useMemo(() => new Set(filteredRows.filter((r) => r.vendor).map((r) => r.vendor)).size, [filteredRows]);
  // '02' = GR/MIGO posted but no Service Entry Sheet yet — called out explicitly as "your main
  // provision exposure bucket".
  const mainExposureRows = useMemo(() => filteredRows.filter((r) => r.status === '02'), [filteredRows]);
  const mainExposureValue = useMemo(() => mainExposureRows.reduce((sum, r) => sum + num(r.pendingValue), 0), [mainExposureRows]);

  const costCenterBreakdown = useMemo(
    () => breakdownBy(filteredRows, (r) => r.costCenter || '(unassigned)', (r) => r.costCenter || 'Unassigned', (r) => r.costCenterText, 8),
    [filteredRows]
  );
  const vendorBreakdown = useMemo(
    () => breakdownBy(filteredRows, (r) => r.vendor || '(unassigned)', (r) => r.vendor || 'Unassigned', (r) => r.vendorName, 8),
    [filteredRows]
  );
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
        <Text style={styles.deniedText}>Dashboard is only available to Admins.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <ProvisionHero
        eyebrow="Admin · Cross-org"
        title="Dashboard"
        subtitle="Cross-org provision status across every open service PO — filter by any standard KPI to focus in on a slice of it."
        right={<HeroActionButton label="Provision Details" onPress={() => router.replace('/apps/payment-tracking/provision-details' as any)} />}
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
          <ProvisionFilterBar rows={rows} value={filters} onChange={setFilters} resultCount={filteredRows.length} />

          <View style={styles.kpiGrid}>
            <KpiCard icon="document-text-outline" label="Open POs" value={String(distinctPOs)} />
            <KpiCard icon="list-outline" label="Open line items" value={String(filteredRows.length)} />
            <KpiCard icon="cash-outline" label="Pending bill value" value={formatValue(totalPending)} accent={colors.red} />
            <KpiCard icon="business-outline" label="Cost centers involved" value={String(distinctCostCenters)} />
            <KpiCard icon="people-outline" label="Vendors involved" value={String(distinctVendors)} />
            <KpiCard
              icon="warning-outline"
              label="Main provision exposure — GR posted, no Service Entry Sheet"
              value={`${mainExposureRows.length} · ${formatValue(mainExposureValue)}`}
              accent={colors.red}
            />
          </View>

          <View style={styles.chartsRow}>
            <View style={[styles.card, styles.flex1]}>
              <Text style={styles.cardTitle}>Pending bill value by status</Text>
              <Text style={styles.cardSubtitle}>The provision lifecycle from Service Entry Sheet not created through accepted.</Text>
              <HorizontalBarBreakdown data={statusBreakdown} emptyMessage="No open provisions to break down yet." />
            </View>

            <View style={[styles.card, styles.flex1]}>
              <Text style={styles.cardTitle}>Pending bill value by cost center</Text>
              <Text style={styles.cardSubtitle}>Top 8 cost centers by open value — see Provision Details for the full breakdown.</Text>
              <HorizontalBarBreakdown data={costCenterBreakdown} emptyMessage="No open provisions to break down yet." />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pending bill value by vendor</Text>
            <Text style={styles.cardSubtitle}>Top 8 vendors by open value across the current filter.</Text>
            <HorizontalBarBreakdown data={vendorBreakdown} emptyMessage="No open provisions to break down yet." />
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
    gap: 16,
  },
  flex1: {
    flex: 1,
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
  chartsRow: {
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
    marginTop: 2,
    marginBottom: 12,
    lineHeight: 17,
  },
});
