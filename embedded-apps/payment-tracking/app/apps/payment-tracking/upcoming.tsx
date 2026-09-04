import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../src/theme/tokens';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../../src/lib/paymentTrackingApi';
import PaymentTrackingTable from '../../../src/components/PaymentTrackingTable';
import { ProvisionHero } from '../../../src/components/ProvisionUI';
import { usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';

/** Upcoming Provision — non-Admin's first side-pane option (moved here from index.tsx so the root
 * route, "/", could become the Home command-center landing screen instead). Scoped by the signed-in
 * user's own login email (Email is now live on ZProvisionTrackSet, always sent — see
 * paymentTrackingApi.ts's header comment).
 *
 * PROVISIONAL STATUS SPLIT, still needs confirmation: there's no Zaction/Interval/date field on
 * this entity (unlike the old ZDelvPendPOSet-based Payment Tracking this replaced), so there's no
 * way to bucket by a delivery-date window anymore. Until told otherwise, this shows every item NOT
 * yet at the main exposure status ('01' Service Entry Sheet not created, '04' SES created but
 * acceptance pending) — "Missed Provision" (missed-delivery.tsx) takes '02' (GR/MIGO posted, no
 * SES — the main provision exposure bucket). Flag if this split is wrong. */
export default function PaymentTrackingUpcoming() {
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
    fetchProvisionPOs(email)
      .then((all) => setRows(all.filter((r) => r.status === '01' || r.status === '04')))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load upcoming provision items.'))
      .finally(() => setLoading(false));
  }, [email]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <ProvisionHero
          eyebrow="Provision Tracking"
          title="Upcoming Provision"
          subtitle="Service Entry Sheet not yet created, or created and still awaiting acceptance — items that need action before they become overdue."
        />

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
