'use client';

// Component-level state the source Fiori app keeps on its UIComponent and shares across screens:
//  - The named JSONModels declared in manifest.json (countParameters, inProcessParameters,
//    legalSubEntity, businessProcessValidate, userJsonModel) that one screen fills just before
//    navTo() and the next screen reads in its route-matched handler. Exposed as
//    getParams/setParams(name). They are mirrored to sessionStorage so a browser refresh on a
//    drill-down screen (a real URL here, unlike the Fiori hash route) still has its context.
//  - Screen authorization (auditJsonModel>/MyDashBoard/ScreenAuth), read from ZST_AUTH_USERSet
//    exactly like BaseController.authCheck().
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { read } from '../lib/odata';

export type ParamsName = 'countParameters' | 'inProcessParameters' | 'legalSubEntity' | 'businessProcessValidate' | 'userJsonModel' | string;

export interface ScreenAuth {
  All: string;
  Master: string;
  CheckList: string;
  Scheduling: string;
  KickOff: string;
}

const EMPTY_AUTH: ScreenAuth = { All: '', Master: '', CheckList: '', Scheduling: '', KickOff: '' };

const STORAGE_PREFIX = 'audit_tool_params:';

/** GET ZST_AUTH_USERSet (no filter — SAP resolves the user server-side) and map it the same way
 * BaseController.authCheck() does: each Act* flag truthy -> "X". */
export async function fetchScreenAuth(): Promise<ScreenAuth> {
  const { results } = await read<Record<string, unknown>>('/ZST_AUTH_USERSet');
  if (results.length === 0) return { ...EMPTY_AUTH };
  const r = results[0];
  return {
    All: r.ActAll ? 'X' : '',
    Master: r.ActMaster ? 'X' : '',
    CheckList: r.ActChecklist ? 'X' : '',
    Scheduling: r.ActScheduling ? 'X' : '',
    KickOff: r.ActKickoff ? 'X' : '',
  };
}

interface AppContextValue {
  email: string;
  screenAuth: ScreenAuth;
  /** false until the first ZST_AUTH_USERSet read settles (success or failure). */
  authLoaded: boolean;
  refreshScreenAuth: () => Promise<ScreenAuth>;
  getParams: <T = Record<string, any>>(name: ParamsName) => T;
  setParams: (name: ParamsName, value: Record<string, any> | any[]) => void;
  /** Merge into an existing params model, like repeated model.setProperty("/X", v) calls. */
  mergeParams: (name: ParamsName, value: Record<string, any>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadStored(name: string): any {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + name);
    return raw ? JSON.parse(raw, (_k, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ? new Date(v) : v)) : undefined;
  } catch {
    return undefined;
  }
}

function store(name: string, value: unknown) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(value));
  } catch {
    /* storage unavailable — in-memory copy still works for this tab */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState('');
  const [screenAuth, setScreenAuth] = useState<ScreenAuth>(EMPTY_AUTH);
  const [authLoaded, setAuthLoaded] = useState(false);
  // A ref, not state: a screen sets params and calls router.push() in the same tick, and the next
  // screen must see them on its first effect — same synchronous semantics as setProperty on a
  // component-level JSONModel.
  const params = useRef<Record<string, any>>({});

  useEffect(() => {
    setEmail(getHubEmail() || '');
  }, []);

  const refreshScreenAuth = useCallback(async () => {
    const auth = await fetchScreenAuth();
    setScreenAuth(auth);
    return auth;
  }, []);

  useEffect(() => {
    refreshScreenAuth()
      .catch(() => setScreenAuth(EMPTY_AUTH))
      .finally(() => setAuthLoaded(true));
  }, [refreshScreenAuth]);

  const getParams = useCallback(<T,>(name: ParamsName): T => {
    if (params.current[name] === undefined && typeof window !== 'undefined') {
      const stored = loadStored(name);
      if (stored !== undefined) params.current[name] = stored;
    }
    return (params.current[name] ?? {}) as T;
  }, []);

  const setParams = useCallback((name: ParamsName, value: Record<string, any> | any[]) => {
    params.current[name] = value;
    store(name, value);
  }, []);

  const mergeParams = useCallback(
    (name: ParamsName, value: Record<string, any>) => {
      const next = { ...(getParams<Record<string, any>>(name) || {}), ...value };
      params.current[name] = next;
      store(name, next);
    },
    [getParams],
  );

  const value = useMemo(
    () => ({ email, screenAuth, authLoaded, refreshScreenAuth, getParams, setParams, mergeParams }),
    [email, screenAuth, authLoaded, refreshScreenAuth, getParams, setParams, mergeParams],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Reads a params model synchronously from sessionStorage — for a screen's first render, before
 * the context state has necessarily been hydrated (e.g. after a hard refresh). */
export function readStoredParams<T = Record<string, any>>(name: ParamsName): T {
  if (typeof window === 'undefined') return {} as T;
  return (loadStored(name) ?? {}) as T;
}
