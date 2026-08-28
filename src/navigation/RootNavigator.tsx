import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { appById } from '../data/mockData';
import { verifySsoToken } from '../lib/authApi';
import LoginScreen from '../screens/LoginScreen';
import AppDetailScreen from '../screens/AppDetailScreen';
import DrawerNavigator from './DrawerNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const SSO_ERROR_MESSAGES: Record<string, string> = {
  not_registered: 'This email-id is not registered. Contact your admin for access.',
  invalid_response: 'Sign-in failed. Please try again.',
  not_configured: 'Single sign-on is not set up yet. Please contact IT.',
};

export default function RootNavigator() {
  const { isLoggedIn, login, logout } = useAuth();
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [verifyingSso, setVerifyingSso] = useState(false);

  // Microsoft SSO completes with a full-page redirect back to this app's own
  // URL (not a fetch response) — the backend's ACS endpoint appends either
  // ?ssoToken=<jwt> (success) or ?ssoError=<code> (failure) to it. Pick that
  // up once on mount, exchange the token for a verified session, then scrub
  // it from the address bar either way so it can't be replayed or bookmarked.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('ssoToken');
    const errorCode = params.get('ssoError');
    if (!token && !errorCode) return;

    window.history.replaceState({}, '', window.location.pathname);
    if (token) {
      setVerifyingSso(true);
      verifySsoToken(token).then((result) => {
        setVerifyingSso(false);
        if (result.ok) {
          // `token` here is the same hub JWT verified above — reuse it as-is rather than minting
          // a new one, so it's the identical token same-origin embedded apps (e.g. Audit & CAPA)
          // can trust.
          login(result.email, token, 'sso');
        } else {
          setSsoError(result.error || 'Sign-in could not be verified.');
        }
      });
    } else if (errorCode) {
      setSsoError(SSO_ERROR_MESSAGES[errorCode] || 'Sign-in failed. Please try again.');
    }
  }, []);

  // A same-origin embedded app (e.g. MoldHealthCheck's own Logout button) can trigger a REAL hub
  // logout — not just leaving that sub-app while the hub itself stays signed in — by navigating
  // here with ?logout=1. Reuses this exact same logout() the hub's own Settings screen calls
  // (clears emami_apps_* state, and for an SSO session redirects through SAML Single Logout too)
  // rather than duplicating any of that logic inside the embedded app itself.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('logout') !== '1') return;
    window.history.replaceState({}, '', window.location.pathname);
    logout();
  }, []);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isLoggedIn ? (
        <Stack.Screen name="Login">
          {() => (
            <LoginScreen
              error={ssoError}
              verifying={verifyingSso}
              onDismissError={() => setSsoError(null)}
              onLogin={login}
            />
          )}
        </Stack.Screen>
      ) : (
        <>
          <Stack.Screen name="Main" component={DrawerNavigator} />
          <Stack.Screen
            name="AppDetail"
            component={AppDetailScreen}
            options={({ route }) => ({
              headerShown: true,
              title: appById(route.params.appId)?.name ?? '',
              headerStyle: { backgroundColor: colors.plum },
              headerTintColor: colors.white,
              headerShadowVisible: false,
            })}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
