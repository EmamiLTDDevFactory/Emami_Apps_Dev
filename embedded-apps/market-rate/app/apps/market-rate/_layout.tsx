import React, { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SidePane, { type SidePaneItem } from '../../../src/components/SidePane';
import { colors, radii } from '../../../src/theme/tokens';
import { getHubEmail, hasHubSession, nameFromEmail } from '../../../src/lib/hubEmailLogin';
import { MarketRateAuthProvider, useMarketRateAuth } from '../../../src/context/MarketRateAuthContext';
import Head from 'expo-router/head';

function formatDateCompact(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

type NavItem = SidePaneItem & {
  href: '/apps/market-rate/' | '/apps/market-rate/dashboard' | '/apps/market-rate/submission-history' | '/apps/market-rate/rate-entry' | '/apps/market-rate/master-data';
  adminOnly?: boolean;
  hiddenForAdmin?: boolean;
};

// Matches the hub's own useIsWideScreen breakpoint (src/hooks/useIsWideScreen.ts) so this app's
// side pane switches to a docked, always-open sidebar at the same viewport width the hub does.
const WIDE_BREAKPOINT = 768;

const NAV_ITEMS: NavItem[] = [
  // Admin already lands on Submission History (never uses the entry form or its History view),
  // so hide these two for Admin while keeping them for the regular submitting User.
  { href: '/apps/market-rate/', label: 'Home', icon: 'home-outline', hiddenForAdmin: true },
  { href: '/apps/market-rate/dashboard', label: 'History', icon: 'grid-outline', hiddenForAdmin: true },
  { href: '/apps/market-rate/submission-history', label: 'Submission History', icon: 'bar-chart-outline', adminOnly: true },
  // Admin fills in / corrects rates vendors haven't submitted, for any vendor × material.
  { href: '/apps/market-rate/rate-entry', label: 'Market Rate Entry', icon: 'create-outline', adminOnly: true },
  { href: '/apps/market-rate/master-data', label: 'Master Data', icon: 'cloud-upload-outline', adminOnly: true },
];

/** Home/Dashboard/Master Data switcher, now living in the side pane instead of a top pill bar —
 * admin-only tabs (Submission History, Master Data) only appear once the ZMarketRoleSet lookup
 * confirms Admin, and user-only tabs (Home, History) hide once it does, so an Admin never sees
 * the data-entry tabs and a User never sees the admin ones flash in while the role loads. */
function NavPane({ isOpen, onClose, isWideScreen }: { isOpen: boolean; onClose: () => void; isWideScreen: boolean }) {
  const { role, roleLoading } = useMarketRateAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = !roleLoading && role === 'Admin';
  const items = NAV_ITEMS.filter((item) => (!item.adminOnly || isAdmin) && (!item.hiddenForAdmin || !isAdmin));
  const activeHref = pathname === '/apps/market-rate' ? '/apps/market-rate/' : pathname;

  return (
    <SidePane
      isOpen={isOpen}
      onClose={onClose}
      title="Current Market Rate"
      subtitle="Enter material market rates for SAP"
      items={items}
      activeHref={activeHref}
      permanent={isWideScreen}
      onNavigate={(href) => {
        // replace, not push — these are flat sibling sections, not a stack to accumulate through.
        // push here left a synthetic ?__EXPO_ROUTER_key=... in the URL, since Expo Router has to
        // invent a stack-entry key when there's no dynamic route param to derive one from.
        router.replace(href as any);
        // On a wide viewport the pane is docked and always visible — only the narrow overlay mode
        // needs to close itself after picking a destination.
        if (!isWideScreen) onClose();
      }}
    />
  );
}

// No login screen here at all — unlike non-ctc-expense, this app has no per-user auth gate of
// its own. Anyone who reached /apps/market-rate/ is only meant to be here because the hub already
// signed them in — so on mount, check for a real hub session (not just a stray email left over in
// localStorage) and bounce straight back to the hub to sign in if there isn't one, rather than
// ever rendering the form for an unauthenticated visitor who typed the URL directly.
function MarketRateLayoutContent() {
  const { width } = useWindowDimensions();
  const isWideScreen = width >= WIDE_BREAKPOINT;
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  // Only matters below WIDE_BREAKPOINT — on a wide viewport the pane is always rendered open
  // (docked, see SidePane's `permanent` prop), so this state just tracks the narrow overlay mode.
  const [menuOpen, setMenuOpen] = useState(false);
  const [hubEmail, setHubEmail] = useState<string | null>(null);
  const [today] = useState(() => formatDateCompact(new Date()));

  useEffect(() => {
    setHubEmail(getHubEmail());
  }, []);

  useEffect(() => {
    if (hasHubSession()) {
      setAuthorized(true);
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, []);

  if (authorized !== true) {
    return (
      <View style={styles.checkingWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  return (
    <MarketRateAuthProvider>
      <View style={styles.container}>
        {/* Row so a wide-viewport docked pane (NavPane -> SidePane's `permanent` mode) sits beside
            the content and pushes it over, rather than covering it the way the narrow overlay
            mode does — same layout shape as the hub's own permanent drawer. */}
        <View style={styles.appRow}>
          <NavPane isOpen={menuOpen} onClose={() => setMenuOpen(false)} isWideScreen={isWideScreen} />

          <View style={styles.mainColumn}>
            <SafeAreaView style={styles.safeArea} edges={['top']}>
              <StatusBar style="light" />
              <TouchableOpacity
                style={styles.backToHubBar}
                onPress={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/';
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Back to Emami Apps"
              >
                <Ionicons name="arrow-back" size={14} color={colors.white} />
                <Text style={styles.backToHubText}>Back to Emami Apps</Text>
              </TouchableOpacity>

              <View style={styles.titleBar}>
                {!isWideScreen && (
                  <TouchableOpacity
                    style={styles.menuBtn}
                    onPress={() => setMenuOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Open menu"
                  >
                    <Ionicons name="menu" size={22} color={colors.ink} />
                  </TouchableOpacity>
                )}
                <Text style={styles.title} numberOfLines={1}>Current Market Rate</Text>
                <View style={styles.flex1} />
                <View style={styles.infoItem}>
                  <Ionicons name="person-circle-outline" size={13} color={colors.rust} />
                  <Text style={styles.infoText} numberOfLines={1}>
                    {hubEmail ? nameFromEmail(hubEmail) : 'Guest'}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="calendar-outline" size={13} color={colors.rust} />
                  <Text style={styles.infoText} numberOfLines={1}>{today}</Text>
                </View>
              </View>

              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="dashboard" />
                <Stack.Screen name="submission-history" />
                <Stack.Screen name="rate-entry" />
                <Stack.Screen name="master-data" />
              </Stack>
            </SafeAreaView>
          </View>
        </View>
      </View>
    </MarketRateAuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.plum,
  },
  appRow: {
    flex: 1,
    flexDirection: 'row',
  },
  mainColumn: {
    flex: 1,
  },
  checkingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.appBg,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBg,
  },
  flex1: {
    flex: 1,
  },
  backToHubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.plum,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backToHubText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    flexShrink: 1,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: colors.appBg,
  },
  infoText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
    maxWidth: 140,
  },
});

// Browser tab title — without this the tab showed the bare URL (Expo Router's static HTML ships an
// empty <title>).
export default function MarketRateLayout() {
  return (
    <>
      <Head>
        <title>Current Market Rate</title>
      </Head>
      <MarketRateLayoutContent />
    </>
  );
}
