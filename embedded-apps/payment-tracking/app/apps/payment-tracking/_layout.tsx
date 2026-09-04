import React, { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SidePane, { type SidePaneItem } from '../../../src/components/SidePane';
import MonthYearBar from '../../../src/components/MonthYearBar';
import { colors, radii } from '../../../src/theme/tokens';
import { getHubEmail, hasHubSession, nameFromEmail } from '../../../src/lib/hubEmailLogin';
import { PaymentTrackingAuthProvider, usePaymentTrackingAuth } from '../../../src/context/PaymentTrackingAuthContext';
import { MonthYearProvider } from '../../../src/context/MonthYearContext';

function formatDateCompact(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

type Href =
  | '/apps/payment-tracking/'
  | '/apps/payment-tracking/upcoming'
  | '/apps/payment-tracking/missed-delivery'
  | '/apps/payment-tracking/history'
  | '/apps/payment-tracking/dashboard'
  | '/apps/payment-tracking/provision-details';
type NavItem = SidePaneItem & { href: Href };

// Home ('/') is the one tab every role shares — the command-center landing page. Past that, two
// completely different side panes by role, not one list with an adminOnly filter (unlike Market
// Rate's Master Data / this app's old Pending PO) — an Admin gets the cross-org Dashboard/Provision
// Details pair, everyone else gets their own Upcoming/Missed items, never both.
const HOME_NAV_ITEM: NavItem = { href: '/apps/payment-tracking/', label: 'Home', icon: 'home-outline' };
const ADMIN_NAV_ITEMS: NavItem[] = [
  HOME_NAV_ITEM,
  { href: '/apps/payment-tracking/dashboard', label: 'Dashboard', icon: 'grid-outline' },
  { href: '/apps/payment-tracking/provision-details', label: 'Provision Details', icon: 'layers-outline' },
];
const USER_NAV_ITEMS: NavItem[] = [
  HOME_NAV_ITEM,
  { href: '/apps/payment-tracking/upcoming', label: 'Upcoming Provision', icon: 'calendar-outline' },
  { href: '/apps/payment-tracking/missed-delivery', label: 'Missed Provision', icon: 'alert-circle-outline' },
];

function NavPane({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, roleLoading } = usePaymentTrackingAuth();
  const activeHref = pathname === '/apps/payment-tracking' ? '/apps/payment-tracking/' : pathname;

  // While the role lookup is still resolving, show neither set rather than flashing the wrong one.
  const items = roleLoading ? [] : isAdmin ? ADMIN_NAV_ITEMS : USER_NAV_ITEMS;

  return (
    <SidePane
      isOpen={isOpen}
      onClose={onClose}
      title="Provision Tracking"
      subtitle="Command Center — track every open service PO"
      items={items}
      activeHref={activeHref}
      onNavigate={(href) => {
        if (href === activeHref) { onClose(); return; }
        // replace, not push — these are flat sibling sections, not a stack to accumulate through.
        // push here left a synthetic ?__EXPO_ROUTER_key=... in the URL, since Expo Router has to
        // invent a stack-entry key when there's no dynamic route param to derive one from.
        router.replace(href as any);
        onClose();
      }}
    />
  );
}

// No login screen here at all — same shape as Market Rate: anyone who reached /apps/payment-tracking/
// is only meant to be here because the hub already signed them in — so on mount, check for a real
// hub session (not just a stray email left over in localStorage) and bounce straight back to the
// hub to sign in if there isn't one, rather than ever rendering the app for an unauthenticated
// visitor who typed the URL directly.
function LayoutContent() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
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
          <Text style={styles.title} numberOfLines={1}>Provision Tracking</Text>
          <View style={styles.commandBadge}>
            <Text style={styles.commandBadgeText} numberOfLines={1}>Command Center</Text>
          </View>
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

        <MonthYearBar />

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="upcoming" />
          <Stack.Screen name="missed-delivery" />
          <Stack.Screen name="history" />
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="provision-details" />
        </Stack>
      </SafeAreaView>

      <NavPane isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

export default function PaymentTrackingLayout() {
  return (
    <PaymentTrackingAuthProvider>
      <MonthYearProvider>
        <LayoutContent />
      </MonthYearProvider>
    </PaymentTrackingAuthProvider>
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
  commandBadge: {
    borderRadius: radii.pill,
    backgroundColor: `${colors.rust}18`,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  commandBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.rust,
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
