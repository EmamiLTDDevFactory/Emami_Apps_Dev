import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMyProfile, logEvent, type UserProfile } from '../lib/authApi';

const AUTH_STORAGE_KEY = 'emami_apps_is_logged_in';
const AUTH_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

interface AuthContextValue {
  isLoggedIn: boolean;
  /** The email that logged in, via either path (Microsoft or direct) — null until known. */
  userEmail: string | null;
  /** Real name/last-login/activity stats for the logged-in user (backend/userProfile.js) — null
   * until the first fetch resolves, so screens can fall back to a loading state. */
  profile: UserProfile | null;
  refreshProfile: () => void;
  login: (email?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  initialLoggedIn = false,
  initialUserEmail = null,
}: {
  children: React.ReactNode;
  initialLoggedIn?: boolean;
  initialUserEmail?: string | null;
}) {
  const [isLoggedIn, setIsLoggedIn] = useState(initialLoggedIn);
  const [userEmail, setUserEmail] = useState<string | null>(initialUserEmail);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const refreshProfile = useCallback(() => {
    if (!userEmail) return;
    getMyProfile(userEmail).then((p) => { if (p) setProfile(p); });
  }, [userEmail]);

  // Fetches (or re-fetches) the real profile whenever the logged-in email changes — covers both
  // a fresh login and restoring a persisted session on app start (App.tsx's initialUserEmail).
  useEffect(() => {
    if (!isLoggedIn || !userEmail) {
      setProfile(null);
      return;
    }
    getMyProfile(userEmail).then((p) => { if (p) setProfile(p); });
  }, [isLoggedIn, userEmail]);

  const value = useMemo(
    () => ({
      isLoggedIn,
      userEmail,
      profile,
      refreshProfile,
      login: (email?: string) => {
        setIsLoggedIn(true);
        AsyncStorage.setItem(AUTH_STORAGE_KEY, 'true').catch(() => {});
        if (email) {
          setUserEmail(email);
          AsyncStorage.setItem(AUTH_EMAIL_STORAGE_KEY, email).catch(() => {});
        }
      },
      logout: () => {
        if (userEmail) logEvent(userEmail, 'SESSION_END');
        setIsLoggedIn(false);
        setUserEmail(null);
        setProfile(null);
        AsyncStorage.multiRemove([AUTH_STORAGE_KEY, AUTH_EMAIL_STORAGE_KEY]).catch(() => {});
      },
    }),
    [isLoggedIn, userEmail, profile, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export async function loadPersistedLoginState(): Promise<{ isLoggedIn: boolean; userEmail: string | null }> {
  try {
    const [isLoggedIn, userEmail] = await Promise.all([
      AsyncStorage.getItem(AUTH_STORAGE_KEY),
      AsyncStorage.getItem(AUTH_EMAIL_STORAGE_KEY),
    ]);
    return { isLoggedIn: isLoggedIn === 'true', userEmail: userEmail || null };
  } catch {
    return { isLoggedIn: false, userEmail: null };
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
