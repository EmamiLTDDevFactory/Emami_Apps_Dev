'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { getContext } from '../lib/mediclaim';
import { fetchMediclaimRole } from '../lib/hubAccessApi';
import { setHubAdmin } from '../lib/maint';
import { SapError } from '../lib/sap';
import type { MediclaimContext } from '../lib/types';

interface AppContextValue {
  email: string | null;
  /** ContextSet: caller identity, roles, active period and cut-off. Null until loaded / when the service is not reachable. */
  ctx: MediclaimContext | null;
  loading: boolean;
  error: SapError | Error | null;
  /** SAP roles (ZMEDI_AUTH_USERS); the hub's Admin role is added on top for the maintenance screens. */
  isAuthUser: boolean;
  isHrAdmin: boolean;
  /** Admin menu: IsAuthUser or IsHrAdmin. */
  canAdmin: boolean;
  /** Admin for Mediclaim in the hub's Manage Access: may do every maintenance (SAP accepts the hub's word). */
  isHubAdmin: boolean;
  /** Maintenance screens: HR admin in SAP or hub Admin. */
  canMaintain: boolean;
  refresh: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [ctx, setCtx] = useState<MediclaimContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SapError | Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [hubAdmin, setHubAdminState] = useState(false);

  const loadedOnce = useRef(false);
  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    const hubEmail = getHubEmail();
    setEmail(hubEmail);
    if (!hubEmail) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchMediclaimRole(hubEmail).then((r) => {
      if (cancelled) return;
      setHubAdmin(r === 'Admin');
      setHubAdminState(r === 'Admin');
    });
    // Only the first load (or a retry after a failure) blanks the screen; later refreshes update ctx silently.
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    getContext()
      .then((c) => {
        if (cancelled) return;
        loadedOnce.current = true;
        setCtx(c);
      })
      .catch((err) => {
        if (cancelled) return;
        if (loadedOnce.current) return; // a failed background refresh keeps the last good context
        setCtx(null);
        setError(err instanceof Error ? err : new Error('Could not load your details.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const value = useMemo<AppContextValue>(
    () => ({
      email,
      ctx,
      loading,
      error,
      isAuthUser: Boolean(ctx?.IsAuthUser),
      isHrAdmin: Boolean(ctx?.IsHrAdmin),
      canAdmin: Boolean(ctx?.IsAuthUser || ctx?.IsHrAdmin || hubAdmin),
      isHubAdmin: hubAdmin,
      canMaintain: Boolean(ctx?.IsHrAdmin || hubAdmin),
      refresh,
    }),
    [email, ctx, loading, error, hubAdmin, refresh]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used within an AppProvider');
  return c;
}
