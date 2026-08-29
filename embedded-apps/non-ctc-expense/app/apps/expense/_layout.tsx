import React, { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '../../../src/context/AuthContext';
import { ClaimProvider } from '../../../src/context/ClaimContext';
import { ActivityIndicator, Image, LogBox, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Suppress dev-mode error overlay so red X does not appear during demo
LogBox.ignoreAllLogs();

function RootLayoutNav() {
  const { isAuthenticated, isInitializing, currentUser, logout } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Tracks the last route this effect actually navigated to, so a redundant
  // re-run with the same resolved auth state (e.g. segments settling after
  // a web navigation) doesn't push a second duplicate history entry — while
  // still firing for real transitions like a successful login or logout.
  const lastAutoRedirect = useRef<string | null>(null);
  // Whether this effect has resolved once already since the app loaded. AuthContext's
  // isInitializing already stays true for the entire hub-email auto-login attempt, so by the
  // time it flips false, isAuthenticated already reflects the real outcome — there's no need to
  // land on /login first and immediately correct course from there. Landing on the right screen
  // in one hop (rather than /login then (tabs)) is what avoids stacking an extra, invisible
  // history entry during boot — same effect as RC Portal's equivalent flow, which never
  // navigates away from its starting URL at all during auto-login.
  const hasSettledOnce = useRef(false);

  useEffect(() => {
    if (isInitializing) return;

    const inAuthGroup = segments[0] === 'apps' && segments[1] === 'expense' && segments[2] === 'login';

    let target: string | null = null;
    if (!hasSettledOnce.current) {
      hasSettledOnce.current = true;
      target = isAuthenticated ? '/apps/expense/(tabs)' : '/apps/expense/login';
    } else if (!isAuthenticated && !inAuthGroup) {
      target = '/apps/expense/login';
    } else if (isAuthenticated && inAuthGroup) {
      target = '/apps/expense/(tabs)';
    }

    if (target && lastAutoRedirect.current !== target) {
      lastAutoRedirect.current = target;
      // replace, not push: this is an automatic bounce (auth state resolving), not something the
      // user consciously navigated to — pushing would leave e.g. /login in history even though
      // the user never saw it (auto-login skips past it), so pressing Back later would land back
      // on it and immediately auto-login again, looking like Back does nothing / goes somewhere
      // random. replace keeps that transition out of history entirely.
      router.replace(target);
    }
  }, [isAuthenticated, isInitializing, segments]);

  // NOTE: this used to also plant one extra "anchor" history entry here (via router.push, right
  // on top of the settle-replace above) as a safety net against landing on a blank browser-internal
  // page. Removed — it was a duplicate entry with the *same* URL as the one already produced by the
  // replace above, and that duplicate is exactly what made Back need one extra press to get out of
  // this app (RC Portal, which has no such duplicate, only ever needs one). The popstate handler
  // below is the actual safety net now: it inspects where Back really landed rather than assuming
  // an extra history entry is needed, so removing the duplicate doesn't reopen the blank-page case
  // it was guarding against.

  // Browser Back should exit cleanly to the EmamiApps hub Dashboard only once there's no more
  // in-app history to go back to — never fall through to whatever entry happens to be sitting
  // behind this app's own screens.
  //
  // This used to be decided with router.canGoBack() (via a wasAtRootRef snapshot taken just
  // before the pop). That signal turned out to be unreliable: Expo Router's own internal
  // back-stack bookkeeping doesn't always match what the browser actually does, and two very
  // normal in-app actions could make canGoBack() read "false" right when they shouldn't:
  //   1. Pressing the Dashboard tab while on another tab — React Navigation resolves "go to a
  //      tab you've already visited, especially the first one" by popping back through history
  //      to that earlier entry, not by pushing forward. That pop fires a real popstate.
  //   2. The Claim Details header back arrow calling router.back() — also a real history pop,
  //      hence another popstate.
  // Both of those are 100% legitimate in-app navigations, but the old check couldn't tell them
  // apart from "the user backed all the way out of the app", so it sometimes force-exited to the
  // hub in the middle of perfectly normal navigation.
  //
  // The reliable signal is simpler: after any pop, look at where the browser actually landed. All
  // of this app's own screens live under /apps/expense — so if the resulting URL is still inside
  // that prefix, some in-app screen exists to show and Expo Router will render it normally (no
  // action needed here). Only when the pop has landed *outside* /apps/expense — the hub's own
  // page, or a browser-internal page with nothing on it — do we force the clean handoff to the
  // hub Dashboard.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const APP_PREFIX = '/apps/expense';
    const handlePopState = () => {
      const path = window.location.pathname;
      const stillInsideThisApp = path === APP_PREFIX || path.startsWith(`${APP_PREFIX}/`);
      if (!stillInsideThisApp) {
        window.location.replace('/');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (isInitializing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#005A9E" />
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
        >
          <Text style={styles.backToHubText}>{'←'} Back to Emami Apps</Text>
        </TouchableOpacity>
        {isAuthenticated && currentUser ? (
          <View style={styles.userBar}>
            <View style={styles.userBarLeft}>
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../../assets/images/emami-logo1.png.jpg')}
                  style={styles.userLogo}
                  resizeMode="contain"
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.userBarLabel}>Logged in as</Text>
                <Text style={styles.userBarName} numberOfLines={1} ellipsizeMode="tail">{currentUser.employeeName || currentUser.name || 'Unknown User'}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={() => {
                // logout() flips isAuthenticated false, which fires this file's own redirect
                // effect (line ~23) toward /apps/expense/login — an instant in-app route change
                // that would otherwise flash briefly before the slower full-page navigation below
                // replaces it. Pre-marking that target as "already redirected there" makes the
                // effect's dedup check (line ~35) skip the push entirely — this ref resets fresh
                // on the next full page load, so it never affects a later login.
                lastAutoRedirect.current = '/apps/expense/login';
                logout();
                // Back to the EmamiApps hub Dashboard, not this app's own login page — logout()
                // above only clears this app's own session (user_session), not the hub's
                // emami_apps_* keys, so the hub stays logged in.
                if (typeof window !== 'undefined') {
                  window.location.href = '/';
                }
              }}
            >
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="claim/[id]"
            options={{
              headerShown: true,
              headerTitle: "Claim Details & Audit Trail",
              headerStyle: { backgroundColor: '#002E5D' },
              headerTintColor: '#FFFFFF',
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => {
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace('/apps/expense/(tabs)');
                    }
                  }}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              ),
            }}
          />
        </Stack>
      </SafeAreaView>
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ClaimProvider>
        <RootLayoutNav />
      </ClaimProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#002E5D',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  backToHubBar: {
    backgroundColor: '#002E5D',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backToHubText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  userBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 6,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  logoWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  userLogo: {
    width: 64,
    height: 64,
  },
  userBarLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  userBarName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  logoutBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  logoutText: {
    color: '#005A9E',
    fontWeight: '700',
  },
});
