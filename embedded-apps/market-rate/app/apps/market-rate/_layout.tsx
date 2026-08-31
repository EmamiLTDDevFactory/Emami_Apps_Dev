import React, { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import InfoHeader from '../../../src/components/InfoHeader';
import SidePane, { type SidePaneItem } from '../../../src/components/SidePane';
import { colors } from '../../../src/theme/tokens';
import { hasHubSession } from '../../../src/lib/hubEmailLogin';
import { MarketRateAuthProvider, useMarketRateAuth } from '../../../src/context/MarketRateAuthContext';

type NavItem = SidePaneItem & { href: '/apps/market-rate/' | '/apps/market-rate/dashboard' | '/apps/market-rate/master-data'; adminOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: '/apps/market-rate/', label: 'Home', icon: 'home-outline' },
  { href: '/apps/market-rate/dashboard', label: 'Change History', icon: 'grid-outline' },
  { href: '/apps/market-rate/master-data', label: 'Master Data', icon: 'cloud-upload-outline', adminOnly: true },
];

/** Home/Dashboard/Master Data switcher, now living in the side pane instead of a top pill bar —
 * Master Data only appears once the ZMarketRoleSet lookup confirms Admin, so a User never sees it
 * flash in while the role is still loading. */
function NavPane({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { role, roleLoading } = useMarketRateAuth();
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || (!roleLoading && role === 'Admin'));
  const activeHref = pathname === '/apps/market-rate' ? '/apps/market-rate/' : pathname;

  return (
    <SidePane
      isOpen={isOpen}
      onClose={onClose}
      title="Market Rate"
      subtitle="Enter material market rates for SAP"
      items={items}
      activeHref={activeHref}
      onNavigate={(href) => {
        router.push(href as any);
        onClose();
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
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
            <View style={styles.titleLogoBox}>
              <Image
                source={require('../../../assets/images/emami-apps-logo.png')}
                style={styles.titleLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.title}>Market Rate</Text>
              <Text style={styles.subtitle}>Enter material market rates for SAP</Text>
            </View>
          </View>

          <InfoHeader />

          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="dashboard" />
            <Stack.Screen name="master-data" />
          </Stack>
        </SafeAreaView>

        <NavPane isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
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
    gap: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  menuBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleLogoBox: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleLogo: {
    width: 44,
    height: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
});
