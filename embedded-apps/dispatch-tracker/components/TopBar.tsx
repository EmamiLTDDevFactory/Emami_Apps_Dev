import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { ALL_DEPOTS, useData } from '@/contexts/DataContext';
import { DateRangeRow, FilterSelect } from '@/components/FilterBar';
import { isoDate, toDate, todayDate } from '@/lib/format';
import { goBack, goToEmamiApps } from '@/lib/goBack';

/**
 * Ported from top_bar() in main_panel.py. Date/time/email are dropped on
 * phone width the same way the original CSS already hides
 * .topbar-dt/.topbar-sep/.topbar-email below 900px — a phone is just
 * always inside that same collapse range.
 */
export function TopBar() {
  const { session, readOnly, signOut } = useAuth();
  const { dateFilter, runSearch, loading, depotFilter, setDepotFilter, depotOptions } = useData();
  const isHq = readOnly;
  const initials = isHq
    ? 'HQ'
    : (session?.depot_number || session?.email || 'D').slice(0, 2).toUpperCase();
  const avatarGradientStart = isHq ? colors.purple : colors.navy;

  // Local, uncommitted UI state — only applied (via runSearch) when Go is pressed. This is the
  // ONE place the date range lives now: no per-tab filter, no auto-fetch on every date pick.
  const [frmDate, setFrmDate] = useState<Date>(() => toDate(dateFilter.frmDate) ?? todayDate());
  const [dateTo, setDateTo] = useState<Date>(() => toDate(dateFilter.toDate) ?? todayDate());
  const searching = !!loading.inv;

  // Depot applies instantly (client-side, no refetch) — unlike the dates, which wait for Go.
  const depotLabel = (code: string) => {
    const name = depotOptions.find((d) => d.code === code)?.name;
    return name ? `${code} · ${name}` : code;
  };
  const depotLabels = [ALL_DEPOTS, ...depotOptions.map((d) => depotLabel(d.code))];
  const onDepotChange = (label: string) => {
    const match = depotOptions.find((d) => depotLabel(d.code) === label);
    setDepotFilter(match ? match.code : ALL_DEPOTS);
  };

  return (
    <View>
      {Platform.OS === 'web' && (
        <View style={styles.backRow}>
          <Pressable style={styles.backBtn} onPress={goBack} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backText}>{'\u2039'} Back</Text>
          </Pressable>
          <Pressable style={styles.backBtn} onPress={goToEmamiApps} accessibilityRole="button" accessibilityLabel="Back to Emami Apps">
            <Text style={styles.backText}>{'\u2039'} Back to Emami Apps</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.bar}>
        <View style={styles.leftCluster}>
          <View style={styles.logoBlock}>
            <Image source={require('@/assets/images/emami-logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <View style={styles.wordmarkBlock}>
            <Text style={styles.system}>Dispatch Intelligence System</Text>
          </View>
          <View style={styles.panelChip}>
            <Text style={styles.panelChipText}>{isHq ? 'HQ VIEW' : 'DEPOT PANEL'}</Text>
          </View>
        </View>

        <View style={styles.rightCluster}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: avatarGradientStart }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Pressable style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filterBar}>
        <View style={{ flex: 1 }}>
          <DateRangeRow fromDate={frmDate} toDate={dateTo} onFromDateChange={setFrmDate} onToDateChange={setDateTo} />
        </View>
        <View style={styles.depotBlock}>
          <Text style={styles.depotLabel}>Depot</Text>
          <FilterSelect
            value={depotFilter === ALL_DEPOTS ? ALL_DEPOTS : depotLabel(depotFilter)}
            options={depotLabels}
            onChange={onDepotChange}
            minWidth={150}
          />
        </View>
        <Pressable
          style={[styles.goBtn, searching && styles.goBtnDisabled]}
          disabled={searching}
          onPress={() => runSearch(isoDate(frmDate), isoDate(dateTo))}>
          <Text style={styles.goBtnText}>{searching ? '…' : 'Go'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.g200,
  },
  backBtn: { borderWidth: 1, borderColor: colors.g200, borderRadius: 6, height: 26, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.navy, fontSize: 10, fontWeight: '700' },
  bar: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: colors.green,
  },
  leftCluster: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  logoBlock: { paddingRight: 10, borderRightWidth: 1, borderRightColor: colors.g200, height: 32, justifyContent: 'center' },
  logo: { height: 30, width: 36 },
  wordmarkBlock: { paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: colors.g200, justifyContent: 'center', display: 'none' },
  system: { fontSize: 7, fontWeight: '600', color: colors.g400, letterSpacing: 0.5, textTransform: 'uppercase' },
  panelChip: { marginLeft: 10, backgroundColor: colors.navyLt, borderWidth: 1, borderColor: colors.navyBd, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  panelChipText: { fontSize: 9, fontWeight: '700', color: colors.navy, letterSpacing: 0.5, textTransform: 'uppercase' },
  rightCluster: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.greenLt, borderWidth: 1, borderColor: colors.greenBd, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  liveText: { fontSize: 9, fontWeight: '700', color: colors.greenDk, letterSpacing: 0.5 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  signOutBtn: { backgroundColor: colors.green, borderRadius: 6, height: 26, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  signOutText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.g200,
  },
  depotBlock: { paddingBottom: 8 },
  depotLabel: { fontSize: 10, fontWeight: '700', color: colors.g500, marginBottom: 4, textTransform: 'uppercase' },
  goBtn: {
    height: 34,
    minWidth: 64,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBtnDisabled: { opacity: 0.6 },
  goBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
