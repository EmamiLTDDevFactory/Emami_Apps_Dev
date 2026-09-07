import React, { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SidePane, { type SidePaneItem } from '../../../src/components/SidePane';
import { colors, radii } from '../../../src/theme/tokens';
import { getHubEmail, hasHubSession, nameFromEmail } from '../../../src/lib/hubEmailLogin';
import { MarketRateAuthProvider, useMarketRateAuth } from '../../../src/context/MarketRateAuthContext';

function formatDateCompact(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

type NavItem = SidePaneItem & {
  href: '/apps/market-rate/' | '/apps/market-rate/dashboard' | '/apps/market-rate/submission-history' | '/apps/market-rate/master-data';
  adminOnly?: boolean;
  userOnly?: boolean;
};

const DESKTOP_BREAKPOINT = 1024;

const NAV_ITEMS: NavItem[] = [
  { href: '/apps/market-rate/', label: 'Home', icon: 'home-outline', userOnly: true },
  { href: '/apps/market-rate/dashboard', label: 'History', icon: 'grid-outline', userOnly: true },
  { href: '/apps/market-rate/submission-history', label: 'Submission History', icon: 'bar-chart-outline', adminOnly: true },
  { href: '/apps/market-rate/master-data', label: 'Master Data', icon: 'cloud-upload-outline', adminOnly: true },
];

/** Home/Dashboard/Master Data switcher, now living in the side pane instead of a top pill bar —
 * admin-only tabs (Submission History, Master Data) only appear once the ZMarketRoleSet lookup
 * confirms Admin, and user-only tabs (Home, History) hide once it does, so an Admin never sees
 * the data-entry tabs and a User never sees the admin ones flash in while the role loads. */
function NavPane({ isOpen, onClose, isDesktopWeb }: { isOpen: boolean; onClose: () => void; isDesktopWeb: boolean }) {
  const { role, roleLoading } = useMarketRateAuth();
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return !roleLoading && role === 'Admin';
    if (item.userOnly) return roleLoading || role !== 'Admin';
    return true;
  });
  const activeHref = pathname === '/apps/market-rate' ? '/apps/market-rate/' : pathname;

  return (
    <SidePane
      isOpen={isOpen}
      onClose={onClose}
      title="Current Market Rate"
      subtitle="Enter material market rates for SAP"
      items={items}
      activeHref={activeHref}
      persistent={isDesktopWeb}
      onNavigate={(href) => {
        // replace, not push — these are flat sibling sections, not a stack to accumulate through.
        // push here left a synthetic ?__EXPO_ROUTER_key=... in the URL, since Expo Router has to
        // invent a stack-entry key when there's no dynamic route param to derive one from.
        router.replace(href as any);
        // On desktop web the pane stays open by default (like a docked sidebar) — only mobile/
        // native closes it after picking a destination, matching a normal drawer's behavior.
        if (!isDesktopWeb) onClose();
      }}
    />
  );
}

// No login screen here at all — unlike non-ctc-expense, this app has no per-user auth gate of
// its own. Anyone who reached /apps/market-rate/ is only meant to be here because the hub already
// signed them in — so on mount, check for a real hub session (not just a stray email left over in
// localStorage) and bounce straight back to the hub to sign in if there isn't one, rather than
// ever rendering the form for an unauthenticated visitor who typed the URL directly.
export default function MarketRateLayout() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  // Opened by default on desktop web (a docked-feeling sidebar), closed everywhere else — see
  // SidePane's `persistent` prop for how the desktop case avoids blocking the rest of the page.
  const [menuOpen, setMenuOpen] = useState(isDesktopWeb);
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
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Ionicons name="menu" size={22} color={colors.ink} />
            </TouchableOpacity>
            <Image
              source={require('../../../assets/images/emami-apps-logo.png')}
              style={styles.titleLogo}
              resizeMode="contain"
            />
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
            <Stack.Screen name="master-data" />
          </Stack>
        </SafeAreaView>

        <NavPane isOpen={menuOpen} onClose={() => setMenuOpen(false)} isDesktopWeb={isDesktopWeb} />
      </View>
    </MarketRateAuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.plum,
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
  titleLogo: {
    width: 32,
    height: 26,
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
