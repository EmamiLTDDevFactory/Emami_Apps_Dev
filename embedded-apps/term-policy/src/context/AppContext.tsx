'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { api } from '../lib/termPolicyApi';
import { fetchTermPolicyRole } from '../lib/hubAccessApi';
import { setHubAdmin } from '../lib/maint';
import type { Profile, SapRole } from '../types/policy';

interface AppContextValue {
  email: string | null;
  profile: Profile | null;
  role: SapRole;
  /** ADMIN: download, delete, limit upload, mass upload, mail. */
  isAdmin: boolean;
  /** Admin for Term Policy in the hub's Manage Access: may do every maintenance (SAP accepts the hub's word). */
  isHubAdmin: boolean;
  /** Maintenance screens: ADMIN in SAP or hub Admin. */
  canMaintain: boolean;
  /** EDITOR or ADMIN: may apply for / change another employee's policy. */
  canActForOthers: boolean;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [hubAdmin, setHubAdminState] = useState(false);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    const hubEmail = getHubEmail();
    setEmail(hubEmail);
    if (!hubEmail) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchTermPolicyRole(hubEmail).then((r) => {
      if (cancelled) return;
      setHubAdmin(r === 'Admin');
      setHubAdminState(r === 'Admin');
    });
    setLoading(true);
    setError(null);
    // SAP's own table (ZMEDI_AUTH_USERS) decides the role, not the hub's Admin role.
    api
      .getProfile(hubEmail)
      .then((p) => !cancelled && setProfile(p))
      .catch((err) => !cancelled && setError(err instanceof Error ? err : new Error('Could not load your details.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const value = useMemo<AppContextValue>(() => {
    const role: SapRole = profile?.role ?? 'USER';
    return {
      email, profile, role, isAdmin: role === 'ADMIN', isHubAdmin: hubAdmin, canMaintain: role === 'ADMIN' || hubAdmin, canActForOthers: role === 'ADMIN' || role === 'EDITOR',
      loading, error, refresh,
    };
  }, [email, profile, loading, error, hubAdmin, refresh]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
}
