import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';
import { fetchPendingDeliveryPOs, fetchUpcomingDeliveryPOs, type PoFollowupRow, type UpcomingPoRow } from '../../../src/lib/poFollowupApi';
import DateField from '../../../src/components/DateField';
import PoTable from '../../../src/components/PoTable';
import UpcomingPoTable from '../../../src/components/UpcomingPoTable';

type Tab = 'upcoming' | 'pending';

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export default function PoFollowupHome() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [email] = useState(() => getHubEmail());

  // Upcoming Delivery PO — loads automatically (Zaction 'A'), no selection needed from the user.
  const [upcomingRows, setUpcomingRows] = useState<UpcomingPoRow[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  // Pending Delivery PO — Zaction 'P', needs a From/To date range picked on screen before it can
  // be searched (see DateField / F in the spec).
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [pendingRows, setPendingRows] = useState<PoFollowupRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingSearched, setPendingSearched] = useState(false);

  useEffect(() => {
    if (!email) {
      setUpcomingLoading(false);
      setUpcomingError('Not signed in.');
      return;
    }
    setUpcomingLoading(true);
    fetchUpcomingDeliveryPOs(email)
      .then(setUpcomingRows)
      .catch((err) => setUpcomingError(err instanceof Error ? err.message : 'Could not load upcoming delivery POs.'))
      .finally(() => setUpcomingLoading(false));
  }, [email]);

  const onSearchPending = () => {
    if (!email) {
      setPendingError('Not signed in.');
      return;
    }
    if (!fromDate || !toDate) {
      setPendingError('Pick both a From and To date.');
      return;
    }
    setPendingError(null);
    setPendingLoading(true);
    setPendingSearched(true);
    fetchPendingDeliveryPOs(email, fromDate, toDate)
      .then(setPendingRows)
      .catch((err) => setPendingError(err instanceof Error ? err.message : 'Could not load pending delivery POs.'))
      .finally(() => setPendingLoading(false));
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setTab('upcoming')}
          style={[styles.tabBtn, tab === 'upcoming' && styles.tabBtnActive]}
          accessibilityRole="button"
          accessibilityLabel="Upcoming Delivery PO"
        >
          <Ionicons name="calendar-outline" size={14} color={tab === 'upcoming' ? colors.white : colors.inkSoft} />
          <Text style={[styles.tabBtnText, tab === 'upcoming' && styles.tabBtnTextActive]}>Upcoming Delivery PO</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('pending')}
          style={[styles.tabBtn, tab === 'pending' && styles.tabBtnActive]}
          accessibilityRole="button"
          accessibilityLabel="Pending Delivery PO"
        >
          <Ionicons name="hourglass-outline" size={14} color={tab === 'pending' ? colors.white : colors.inkSoft} />
          <Text style={[styles.tabBtnText, tab === 'pending' && styles.tabBtnTextActive]}>Pending Delivery PO</Text>
        </Pressable>
      </View>

      {tab === 'upcoming' ? (
        <View style={styles.panel}>
          {upcomingLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.rust} />
              <Text style={styles.loadingText}>Loading upcoming delivery POs…</Text>
            </View>
          ) : upcomingError ? (
            <Text style={styles.errorText}>{upcomingError}</Text>
          ) : (
            <UpcomingPoTable rows={upcomingRows} emptyMessage="No upcoming delivery POs found." />
          )}
        </View>
      ) : (
        <View style={styles.panel}>
          <View style={styles.dateRow}>
            <DateField label="From Date" value={fromDate} onChange={setFromDate} />
            <DateField label="To Date" value={toDate} onChange={setToDate} />
            <Pressable style={styles.searchBtn} onPress={onSearchPending} accessibilityRole="button" accessibilityLabel="Search">
              {pendingLoading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="search" size={15} color={colors.white} />
                  <Text style={styles.searchBtnText}>Search</Text>
                </>
              )}
            </Pressable>
          </View>

          {pendingError && <Text style={styles.errorText}>{pendingError}</Text>}

          {!pendingSearched ? (
            <View style={styles.emptyPrompt}>
              <Text style={styles.emptyPromptText}>Pick a From and To date, then search.</Text>
            </View>
          ) : pendingLoading ? null : (
            <PoTable rows={pendingRows} emptyMessage="No pending delivery POs found for this date range." />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  tabBtnActive: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  tabBtnTextActive: {
    color: colors.white,
  },
  panel: {
    gap: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radii.sm,
    paddingHorizontal: 18,
    backgroundColor: colors.rust,
  },
  searchBtnText: {
    fontSize: 13,
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
  emptyPrompt: {
    alignItems: 'center',
    padding: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
  },
  emptyPromptText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
});
