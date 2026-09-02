import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../src/theme/tokens';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';
import { fetchMissedDeliveryPOs, type UpcomingPoRow } from '../../../src/lib/poFollowupApi';
import UpcomingPoTable from '../../../src/components/UpcomingPoTable';
import PeriodFilter, { type Period } from '../../../src/components/PeriodFilter';
import { addDays, todayIso } from '../../../src/lib/dateMath';

/** Missed Delivery — Option B in the side pane. Read-only list of POs whose delivery date has
 * already passed, filtered client-side to "overdue within the last 7/15 days". Uses the same
 * SAP-backed row shape and table as Upcoming PO, minus the confirmation toggle. See
 * poFollowupApi.ts's fetchMissedDeliveryPOs for the placeholder Zaction this still needs SAP to
 * confirm. */
export default function PoFollowupMissedDelivery() {
  const [email] = useState(() => getHubEmail());
  const [period, setPeriod] = useState<Period>(7);

  const [allRows, setAllRows] = useState<UpcomingPoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setLoading(false);
      setError('Not signed in.');
      return;
    }
    setLoading(true);
    fetchMissedDeliveryPOs(email)
      .then(setAllRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load missed delivery POs.'))
      .finally(() => setLoading(false));
  }, [email]);

  const rows = useMemo(() => {
    const today = todayIso();
    const earliest = addDays(today, -period);
    return allRows.filter((r) => r.deliveryDate && r.deliveryDate >= earliest && r.deliveryDate < today);
  }, [allRows, period]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <PeriodFilter value={period} onChange={setPeriod} label="Overdue within last" />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading missed delivery POs…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <UpcomingPoTable rows={rows} emptyMessage={`No missed deliveries in the last ${period} days.`} readOnly />
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
