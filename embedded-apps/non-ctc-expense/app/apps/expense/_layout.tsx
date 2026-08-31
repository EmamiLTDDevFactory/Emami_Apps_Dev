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

  // Navigate ONLY when the current screen is actually the wrong one for the resolved auth state.
  //
  // There used to be an extra "first settle" branch here that, the first time this effect ran,
  // unconditionally navigated to (tabs) when authenticated / to login when not — even when the
  // app was already showing exactly that screen. That redundant self-navigation is what broke
  // browser Back, and it is unique to this app: /apps/expense has no index route of its own, so
  // it already renders (tabs)/index.tsx on load, and the branch then "replaced" that route with
  // itself. Expo Router does not treat replacing a route with the same route as a replace — it
  // adds a history entry. Measured on the live site: loading /apps/expense left
  // window.history.length at 2 when a true replace must leave it at 1, so every visit started one
  // entry deep and Back needed an extra press (and, with the login hop, two or three) before it
  // could reach the hub — falling through to the stale Microsoft SSO entry instead.
  //
  // MoldHealthCheck never hit this because its /apps/mouldhealthcheck URL renders a dedicated
  // entry-gate index.tsx and it replaces to a genuinely *different* route, which Expo Router does
  // perform as a real replace — one entry, one Back press.
  //
  // The two conditions below already cover every real transition (log in from this app's own
  // login screen, session lost while inside the app), and they are self-correcting on every run,
  // so nothing is lost by dropping the first-settle special case. Keep it that way: never
  // navigate to the screen that is already showing.
  useEffect(() => {
    if (isInitializing) return;

    const inAuthGroup = segments[0] === 'apps' && segments[1] === 'expense' && segments[2] === 'login';

    let target: string | null = null;
    if (!isAuthenticated && !inAuthGroup) {
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

  // Deliberately NO browser-history handling here — no popstate listener, no "anchor" history
  // entry, no forced window.location.replace('/') on Back. This matches MoldHealthCheck
  // (embedded-apps/mouldhealthcheck/app/apps/mouldhealthcheck/_layout.tsx) and Dispatch Tracker
  // (embedded-apps/dispatch-tracker/app/_layout.tsx), the two other Expo Router apps in this repo,
  // both of which have correct browser-Back behaviour precisely because they do none of this.
  //
  // Why doing nothing is correct: the hub launches an embedded app with window.location.replace()
  // (see src/screens/AppDetailScreen.tsx), which *consumes* the /apps/<id> launch entry. So this
  // app occupies exactly ONE browser history entry, and the entry directly behind it is the real
  // hub page the user came from. One Back press therefore lands on the hub Dashboard on its own —
  // there is nothing to intercept or correct.
  //
  // Every past attempt to "help" here made it worse, because each one added extra history entries
  // or tried to intercept a pop that cannot be intercepted:
  //   - an anchor entry via router.push() — a duplicate entry, so Back needed an extra press;
  //   - a router.canGoBack() check — Expo Router's back-stack bookkeeping doesn't reliably match
  //     the browser's, so ordinary in-app navigation was misread as "exit the app";
  //   - a popstate handler inspecting window.location.pathname — useless at the one boundary that
  //     mattered: stepping back out of this app is a *cross-document* navigation, so the page is
  //     torn down and popstate never fires at all.
  // Keep this section empty.

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
    width: 64,
    height: 53,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  userLogo: {
    width: 64,
    height: 53,
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
