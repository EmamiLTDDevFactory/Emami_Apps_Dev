import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/tokens';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';
import { fetchPendingDeliveryPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import PaymentTrackingTable from '../../../src/components/PaymentTrackingTable';
import PeriodFilter, { type Period } from '../../../src/components/PeriodFilter';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

/** Pending — Option C in the side pane, Admin-only (also gated in _layout.tsx's nav item, but
 * re-checked here directly in case someone reaches this route by URL rather than the side pane).
 * Read-only, Zaction 'P' (older backlog beyond the interval), filtered server-side. */
export default function PaymentTrackingPending() {
  const { email: hubEmailFromAuth, isAdmin, roleLoading } = usePaymentTrackingAuth();
  const [email] = useState(() => hubEmailFromAuth ?? getHubEmail());
  const [period, setPeriod] = useState<Period>(7);

  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    if (!email) {
      setLoading(false);
      setError('Not signed in.');
      return;
    }
    setLoading(true);
    setError(null);
    fetchPendingDeliveryPOs(email, period)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load pending payment items.'))
      .finally(() => setLoading(false));
  }, [email, period, isAdmin]);

  if (roleLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.deniedWrap}>
        <Ionicons name="lock-closed-outline" size={28} color={colors.inkSoft} />
        <Text style={styles.deniedText}>Pending is only visible to Admins.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <PeriodFilter value={period} onChange={setPeriod} label="Overdue beyond last" />

        {error && <Text style={styles.errorText}>{error}</Text>}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading pending payment items…</Text>
          </View>
        ) : (
          <PaymentTrackingTable rows={rows} emptyMessage={`No pending payment items beyond the last ${period} days.`} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  panel: {
    gap: 16,
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
  deniedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  deniedText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
});
