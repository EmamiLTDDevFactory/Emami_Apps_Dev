import React, { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SidePane, { type SidePaneItem } from '../../../src/components/SidePane';
import { colors, radii } from '../../../src/theme/tokens';
import { getHubEmail, hasHubSession, nameFromEmail } from '../../../src/lib/hubEmailLogin';

function formatDateCompact(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

type NavItem = SidePaneItem & { href: '/apps/po-followup/' | '/apps/po-followup/history' };

const NAV_ITEMS: NavItem[] = [
  { href: '/apps/po-followup/', label: 'Home', icon: 'home-outline' },
  { href: '/apps/po-followup/history', label: 'History', icon: 'time-outline' },
];

function NavPane({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = pathname === '/apps/po-followup' ? '/apps/po-followup/' : pathname;

  return (
    <SidePane
      isOpen={isOpen}
      onClose={onClose}
      title="PO Followup"
      subtitle="Track upcoming and pending delivery POs"
      items={NAV_ITEMS}
      activeHref={activeHref}
      onNavigate={(href) => {
        router.push(href as any);
        onClose();
      }}
    />
  );
}

// No login screen here at all — same shape as Market Rate: anyone who reached /apps/po-followup/
// is only meant to be here because the hub already signed them in — so on mount, check for a real
// hub session (not just a stray email left over in localStorage) and bounce straight back to the
// hub to sign in if there isn't one, rather than ever rendering the app for an unauthenticated
// visitor who typed the URL directly.
export default function PoFollowupLayout() {
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
          <Text style={styles.title} numberOfLines={1}>PO Followup</Text>
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
          <Stack.Screen name="history" />
        </Stack>
      </SafeAreaView>

      <NavPane isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
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
