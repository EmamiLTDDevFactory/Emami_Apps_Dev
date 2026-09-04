import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import PaymentTrackingTable from '../../../src/components/PaymentTrackingTable';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

/** Missed Provision — non-Admin's second side-pane option. Scoped by the signed-in user's own
 * login email, same as Upcoming Provision (see index.tsx's header comment for why, and for the
 * status split this is provisional on).
 *
 * PROVISIONAL SPLIT, needs confirmation. Shows status '02' — "GR/MIGO posted, Service Entry Sheet
 * not created", called out explicitly as the main provision exposure bucket. Flag if this split
 * is wrong. */
export default function PaymentTrackingMissedDelivery() {
  const { email } = usePaymentTrackingAuth();
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
    fetchProvisionPOs(email, { status: '02' })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load missed provision items.'))
      .finally(() => setLoading(false));
  }, [email]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <ProvisionHero
          eyebrow="Provision Tracking"
          title="Missed Provision"
          subtitle="GR/MIGO posted but no Service Entry Sheet created yet — your main provision exposure bucket."
        />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading missed provision items…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <PaymentTrackingTable rows={rows} emptyMessage="No missed provision items." />
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
