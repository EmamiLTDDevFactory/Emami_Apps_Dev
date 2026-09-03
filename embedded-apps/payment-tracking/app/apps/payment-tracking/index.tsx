import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import PaymentTrackingTable from '../../../src/components/PaymentTrackingTable';

/** Upcoming Provision — non-Admin's first side-pane option.
 *
 * PROVISIONAL SPLIT, needs confirmation: ZProvisionTrackSet has no Email/Zaction/Interval and no
 * date field (unlike the old ZDelvPendPOSet-based Payment Tracking this replaced), so there is no
 * longer a way to scope "my own" items or bucket by a delivery-date window. Until told otherwise,
 * this shows every item NOT yet at the main exposure status ('01' Service Entry Sheet not created,
 * '04' SES created but acceptance pending) — "Missed Provision" (missed-delivery.tsx) takes '02'
 * (GR/MIGO posted, no SES — the main provision exposure bucket). Flag if this split is wrong. */
export default function PaymentTrackingUpcoming() {
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchProvisionPOs()
      .then((all) => setRows(all.filter((r) => r.status === '01' || r.status === '04')))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load upcoming provision items.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading upcoming provision items…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <PaymentTrackingTable rows={rows} emptyMessage="No upcoming provision items." />
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
