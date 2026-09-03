import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../src/theme/tokens';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';
import { fetchUpcomingDeliveryPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import PaymentTrackingTable from '../../../src/components/PaymentTrackingTable';
import PeriodFilter, { type Period } from '../../../src/components/PeriodFilter';

/** Upcoming — Option A in the side pane. Loads Zaction 'A', filtered server-side by the 7/15-day
 * period (sent to SAP as `Interval eq 7`/`Interval eq 15`). Read-only — see paymentTrackingApi.ts's
 * header comment for why there's no confirmation workflow here, unlike Delivery Confirmation. */
export default function PaymentTrackingUpcoming() {
  const [email] = useState(() => getHubEmail());
  const [period, setPeriod] = useState<Period>(7);

  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setLoading(false);
      setError('Not signed in.');
      return;
    }
    setLoading(true);
    setError(null);
    fetchUpcomingDeliveryPOs(email, period)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load upcoming payment items.'))
      .finally(() => setLoading(false));
  }, [email, period]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <PeriodFilter value={period} onChange={setPeriod} label="Delivery in next" />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading upcoming payment items…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <PaymentTrackingTable rows={rows} emptyMessage={`No upcoming payment items in the next ${period} days.`} />
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
});
