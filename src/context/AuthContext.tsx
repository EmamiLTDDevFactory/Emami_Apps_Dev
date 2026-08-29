import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMyProfile, getMicrosoftSignOutUrl, logEvent, recordLogin, type UserProfile } from '../lib/authApi';
import { getMyAccess } from '../lib/accessApi';
import type { MyAccess } from '../types';

export type LoginMethod = 'sso' | 'direct';

const AUTH_STORAGE_KEY = 'emami_apps_is_logged_in';
const AUTH_EMAIL_STORAGE_KEY = 'emami_apps_user_email';
/**
 * The hub's own session JWT (see backend/sessionAuth.js), persisted so same-origin embedded apps
 * — e.g. Audit & CAPA at /apps/audit-capa — can read it straight out of localStorage (this is
 * AsyncStorage's actual backing store on web, same key, no prefix) and use it to establish their
 * own session for this person without a second login screen. AsyncStorage.setItem, not
 * plain localStorage.setItem, so this still works identically on native once a native session
 * flow exists — it's just inert there today since embedded apps aren't merged into a native build.
 */
const AUTH_TOKEN_STORAGE_KEY = 'emami_apps_session_token';
/** Which path the current session came in through — 'sso' vs 'direct' — so logout() knows
 * whether there's an Entra ID session on this browser that also needs ending (see its call to
 * getMicrosoftSignOutUrl). Persisted alongside the rest of the session so this still works after
 * a page reload, not just within the tab that actually logged in. */
const AUTH_METHOD_STORAGE_KEY = 'emami_apps_login_method';

interface AuthContextValue {
  isLoggedIn: boolean;
  /** The email that logged in, via either path (Microsoft or direct) — null until known. */
  userEmail: string | null;
  /** Real name/last-login/activity stats for the logged-in user (backend/userProfile.js) — null
   * until the first fetch resolves, so screens can fall back to a loading state. */
  profile: UserProfile | null;
  refreshProfile: () => void;
  /** This user's own hub-wide access level + granted apps (backend/server.js's GET /access/me) —
   * null until the first fetch resolves. Gates the Manage Access nav item/screen and which app
   * tiles render unlocked (see CustomDrawerContent.tsx, HomeScreen.tsx, AppListScreen.tsx). */
  access: MyAccess | null;
  refreshAccess: () => void;
  login: (email?: string, token?: string, method?: LoginMethod) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  initialLoggedIn = false,
  initialUserEmail = null,
  initialLoginMethod = null,
}: {
  children: React.ReactNode;
  initialLoggedIn?: boolean;
  initialUserEmail?: string | null;
  initialLoginMethod?: LoginMethod | null;
}) {
  const [isLoggedIn, setIsLoggedIn] = useState(initialLoggedIn);
  const [userEmail, setUserEmail] = useState<string | null>(initialUserEmail);
  const [loginMethod, setLoginMethod] = useState<LoginMethod | null>(initialLoginMethod);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(null);

  const refreshProfile = useCallback(() => {
    if (!userEmail) return;
    getMyProfile(userEmail).then((p) => { if (p) setProfile(p); });
  }, [userEmail]);

  const refreshAccess = useCallback(() => {
    if (!userEmail) return;
    getMyAccess(userEmail).then((a) => { if (a) setAccess(a); });
  }, [userEmail]);

  // Fetches (or re-fetches) the real profile whenever the logged-in email changes — covers both
  // a fresh login and restoring a persisted session on app start (App.tsx's initialUserEmail).
  useEffect(() => {
    if (!isLoggedIn || !userEmail) {
      setProfile(null);
      setAccess(null);
      return;
    }
    getMyProfile(userEmail).then((p) => { if (p) setProfile(p); });
    getMyAccess(userEmail).then((a) => { if (a) setAccess(a); });
  }, [isLoggedIn, userEmail]);

  const value = useMemo(
    () => ({
      isLoggedIn,
      userEmail,
      profile,
      refreshProfile,
      access,
      refreshAccess,
      login: (email?: string, token?: string, method?: LoginMethod) => {
        // Do NOT push a history entry here. An earlier attempt did
        // window.history.pushState({}, '', window.location.pathname) at this point to "plant a hub
        // Dashboard checkpoint", but at the moment login() runs the URL is still the login screen's
        // own ('/login', per navigation/linking.ts). That planted a real /login entry which, once
        // the user had navigated into an embedded app (a full page navigation), Back would load
        // fresh from the static host — where /login has no exported page, giving the "Unmatched
        // Route / Page could not be found" screen. React Navigation already puts the correct URL in
        // the address bar when the navigator swaps to Home after login; nothing extra is needed.
        setIsLoggedIn(true);
        AsyncStorage.setItem(AUTH_STORAGE_KEY, 'true').catch(() => {});
        if (email) {
          setUserEmail(email);
          AsyncStorage.setItem(AUTH_EMAIL_STORAGE_KEY, email).catch(() => {});
          // Covers both login paths — direct email (LoginScreen.tsx) and SSO (RootNavigator.tsx) —
          // since both call this function with the authenticated email. See recordLogin's comment
          // in authApi.ts for why this is needed on top of the Lambda's own (currently failing)
          // server-side write.
          recordLogin(email);
        }
        if (token) {
          AsyncStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token).catch(() => {});
        }
        if (method) {
          setLoginMethod(method);
          AsyncStorage.setItem(AUTH_METHOD_STORAGE_KEY, method).catch(() => {});
        }
      },
      logout: () => {
        if (userEmail) logEvent(userEmail, 'SESSION_END');
        const wasSso = loginMethod === 'sso';
        const ssoEmail = userEmail;
        setIsLoggedIn(false);
        setUserEmail(null);
        setProfile(null);
        setAccess(null);
        setLoginMethod(null);
        AsyncStorage.multiRemove([AUTH_STORAGE_KEY, AUTH_EMAIL_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY, AUTH_METHOD_STORAGE_KEY]).catch(() => {});
        // Ends the Entra ID session too (SAML Single Logout) — without this, the browser still had
        // a live Microsoft session after "signing out" of the app, which is what previously let a
        // different person on the same browser get silently signed in as whoever logged out last.
        // Only for SSO sessions — a direct-email login never created a Microsoft session to end.
        if (wasSso && ssoEmail) {
          const url = getMicrosoftSignOutUrl(ssoEmail);
          if (Platform.OS === 'web') {
            window.location.href = url;
          } else {
            Linking.openURL(url).catch(() => {});
          }
        }
      },
    }),
    [isLoggedIn, userEmail, profile, refreshProfile, access, refreshAccess, loginMethod]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export async function loadPersistedLoginState(): Promise<{
  isLoggedIn: boolean;
  userEmail: string | null;
  loginMethod: LoginMethod | null;
}> {
  try {
    const [isLoggedIn, userEmail, loginMethod] = await Promise.all([
      AsyncStorage.getItem(AUTH_STORAGE_KEY),
      AsyncStorage.getItem(AUTH_EMAIL_STORAGE_KEY),
      AsyncStorage.getItem(AUTH_METHOD_STORAGE_KEY),
    ]);
    return {
      isLoggedIn: isLoggedIn === 'true',
      userEmail: userEmail || null,
      loginMethod: loginMethod === 'sso' || loginMethod === 'direct' ? loginMethod : null,
    };
  } catch {
    return { isLoggedIn: false, userEmail: null, loginMethod: null };
  }
}

/** Drops a persisted "logged in" session without going through the provider — used by App.tsx
 * when it finds a persisted session that no longer checks out against Manage Access (see its
 * call to authApi.ts's checkStillAuthorized) before the app has even rendered, so there's no
 * AuthProvider/logout() to call yet. */
export async function clearPersistedLoginState(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([AUTH_STORAGE_KEY, AUTH_EMAIL_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY, AUTH_METHOD_STORAGE_KEY]);
  } catch {
    // Best-effort — App.tsx still won't treat the session as logged in either way.
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
