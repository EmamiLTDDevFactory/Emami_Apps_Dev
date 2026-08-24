import React, { createContext, useContext, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_STORAGE_KEY = 'emami_apps_is_logged_in';
const AUTH_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

interface AuthContextValue {
  isLoggedIn: boolean;
  /** The email that logged in, via either path (Microsoft or direct) — null until known. */
  userEmail: string | null;
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

  const value = useMemo(
    () => ({
      isLoggedIn,
      userEmail,
      login: (email?: string) => {
        setIsLoggedIn(true);
        AsyncStorage.setItem(AUTH_STORAGE_KEY, 'true').catch(() => {});
        if (email) {
          setUserEmail(email);
          AsyncStorage.setItem(AUTH_EMAIL_STORAGE_KEY, email).catch(() => {});
        }
      },
      logout: () => {
        setIsLoggedIn(false);
        setUserEmail(null);
        AsyncStorage.multiRemove([AUTH_STORAGE_KEY, AUTH_EMAIL_STORAGE_KEY]).catch(() => {});
      },
    }),
    [isLoggedIn, userEmail]
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
