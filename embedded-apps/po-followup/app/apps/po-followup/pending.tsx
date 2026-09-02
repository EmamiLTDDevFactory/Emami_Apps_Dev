import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';
import { fetchPendingDeliveryPOs, type UpcomingPoRow } from '../../../src/lib/poFollowupApi';
import UpcomingPoTable from '../../../src/components/UpcomingPoTable';
import PeriodFilter, { type Period } from '../../../src/components/PeriodFilter';
import { usePoFollowupAuth } from '../../../src/context/PoFollowupAuthContext';

/** Pending Delivery PO — Option C in the side pane, Admin-only (also gated in _layout.tsx's nav
 * item, but re-checked here directly in case someone reaches this route by URL rather than the
 * side pane). Zaction 'P', filtered server-side by the 7/15-day period (sent to SAP as `Interval
 * eq 7`/`Interval eq 15` — replaces the old manual From/To date-range picker). Read-only, with
 * Schedule/Delivered/Remaining Qty (row tinted red/green by whether Remaining Qty is still
 * outstanding) — same table as Missed Delivery. */
export default function PoFollowupPending() {
  const { email: hubEmailFromAuth, isAdmin, roleLoading } = usePoFollowupAuth();
  const [email] = useState(() => hubEmailFromAuth ?? getHubEmail());
  const [period, setPeriod] = useState<Period>(7);

  const [rows, setRows] = useState<UpcomingPoRow[]>([]);
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
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load pending delivery POs.'))
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
        <Text style={styles.deniedText}>Pending PO is only visible to Admins.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <PeriodFilter value={period} onChange={setPeriod} label="PO date within last" />

        {error && <Text style={styles.errorText}>{error}</Text>}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading pending delivery POs…</Text>
          </View>
        ) : (
          <UpcomingPoTable rows={rows} emptyMessage={`No pending delivery POs in the last ${period} days.`} readOnly showQtyColumns />
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
