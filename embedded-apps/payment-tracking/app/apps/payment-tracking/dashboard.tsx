import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radii } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatValue(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function KpiCard({ icon, label, value, accent }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; accent?: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconBox, accent ? { backgroundColor: `${accent}14` } : null]}>
        <Ionicons name={icon} size={15} color={accent || colors.rust} />
      </View>
      <View style={styles.flex1}>
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
    </View>
  );
}

function PendingValueChart({ data }: { data: { label: string; sublabel: string; value: number }[] }) {
  if (data.length === 0) {
    return <Text style={styles.chartEmptyText}>No open provisions to break down yet.</Text>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 12 }}>
      {data.map((d) => (
        <View key={d.label} style={styles.hbarRow}>
          <Text style={styles.hbarLabel} numberOfLines={1}>
            {d.label}{d.sublabel ? ` · ${d.sublabel}` : ''}
          </Text>
          <View style={styles.hbarTrack}>
            <View style={[styles.hbarFill, { width: `${(d.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.hbarValue} numberOfLines={1}>{formatValue(d.value)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Admin's landing screen — cross-org KPIs plus "pending value by status" and "by cost center"
 * breakdowns, from fetchProvisionPOs() called with the signed-in Admin's own login email (always
 * sent, never omitted — see paymentTrackingApi.ts's header comment). The backend is trusted to
 * expand scope to every submitter once it sees that email's role is Admin. */
export default function ProvisionDashboard() {
  const router = useRouter();
  const { email, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const totalPending = useMemo(() => rows.reduce((sum, r) => sum + num(r.pendingValue), 0), [rows]);
  const distinctPOs = useMemo(() => new Set(rows.map((r) => r.poNumber)).size, [rows]);
  const distinctCostCenters = useMemo(() => new Set(rows.filter((r) => r.costCenter).map((r) => r.costCenter)).size, [rows]);
  const distinctVendors = useMemo(() => new Set(rows.filter((r) => r.vendor).map((r) => r.vendor)).size, [rows]);
  // '02' = GR/MIGO posted but no Service Entry Sheet yet — called out explicitly as "your main
  // provision exposure bucket".
  const mainExposureRows = useMemo(() => rows.filter((r) => r.status === '02'), [rows]);
  const mainExposureValue = useMemo(() => mainExposureRows.reduce((sum, r) => sum + num(r.pendingValue), 0), [mainExposureRows]);

  const costCenterBreakdown = useMemo(() => {
    const byCc = new Map<string, { label: string; sublabel: string; value: number }>();
    for (const r of rows) {
      const key = r.costCenter || '(unassigned)';
      const cur = byCc.get(key) ?? { label: r.costCenter || 'Unassigned', sublabel: r.costCenterText, value: 0 };
      cur.value += num(r.pendingValue);
      byCc.set(key, cur);
    }
    return Array.from(byCc.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [rows]);

  const statusBreakdown = useMemo(() => {
    const byStatus = new Map<string, { label: string; sublabel: string; value: number; count: number }>();
    for (const r of rows) {
      const key = r.status || '(unknown)';
      const cur = byStatus.get(key) ?? { label: r.status || 'Unknown', sublabel: r.statusText, value: 0, count: 0 };
      cur.value += num(r.pendingValue);
      cur.count += 1;
      byStatus.set(key, cur);
    }
    return Array.from(byStatus.values()).sort((a, b) => (a.label < b.label ? -1 : 1));
  }, [rows]);

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
      <View style={styles.headerRow}>
        <View style={styles.flex1}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
          <Text style={styles.sectionSubtitle}>Cross-org provision status, every open service PO</Text>
        </View>
        <Pressable
          style={styles.detailsBtn}
          onPress={() => router.replace('/apps/payment-tracking/provision-details' as any)}
          accessibilityRole="button"
          accessibilityLabel="Open Provision Details"
        >
          <Text style={styles.detailsBtnText}>Provision Details</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.white} />
        </Pressable>
      </View>

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
            <KpiCard icon="business-outline" label="Cost centers involved" value={String(distinctCostCenters)} />
            <KpiCard icon="people-outline" label="Vendors involved" value={String(distinctVendors)} />
            <KpiCard
              icon="warning-outline"
              label="Main provision exposure (GR, no SES)"
              value={`${mainExposureRows.length} · ${formatValue(mainExposureValue)}`}
              accent={colors.red}
            />
          </View>

          <View style={styles.chartsRow}>
            <View style={[styles.card, styles.flex1]}>
              <Text style={styles.cardTitle}>Pending bill value by status</Text>
              <Text style={styles.cardSubtitle}>The three scenarios this dashboard tracks, plus SES-accepted/pending.</Text>
              <PendingValueChart data={statusBreakdown} />
            </View>

            <View style={[styles.card, styles.flex1]}>
              <Text style={styles.cardTitle}>Pending bill value by cost center</Text>
              <Text style={styles.cardSubtitle}>Top 8 cost centers by open value — see Provision Details for the full breakdown.</Text>
              <PendingValueChart data={costCenterBreakdown} />
            </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: colors.rust,
  },
  detailsBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.white,
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
  kpiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 190,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 14,
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  kpiLabel: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
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
  },
  chartEmptyText: {
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 8,
  },
  hbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hbarLabel: {
    width: 170,
    fontSize: 12,
    color: colors.ink,
  },
  hbarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.appBg,
    overflow: 'hidden',
  },
  hbarFill: {
    height: '100%',
    backgroundColor: colors.rust,
    borderRadius: 5,
  },
  hbarValue: {
    width: 70,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
});
