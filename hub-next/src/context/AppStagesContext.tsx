'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppStage } from '../types';
import { APPS } from '../data/mockData';
import { getAppStages, type StoredStage } from '../lib/appStagesApi';

/** How often an open hub re-reads the stages, so a change an admin makes shows up without a reload. */
const POLL_MS = 30_000;

interface AppStagesContextValue {
  /** The stage shown on an app's tile: what an admin set in the Admin Center, else the default from mockData. */
  stageOf: (appId: string) => AppStage | undefined;
  /** Admin-set rows (who changed it, when). */
  stored: Record<string, StoredStage>;
  /** Puts a just-saved stage in place at once (the Admin Center calls this after a successful save). */
  applySaved: (appId: string, saved: StoredStage) => void;
  refresh: () => void;
}

const DEFAULT_STAGE = new Map(APPS.map((a) => [a.id, a.stage]));
const AppStagesContext = createContext<AppStagesContextValue | undefined>(undefined);

export function AppStagesProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<Record<string, StoredStage>>({});

  const refresh = useCallback(() => {
    getAppStages().then((s) => { if (s) setStored(s); });
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const applySaved = useCallback((appId: string, saved: StoredStage) => {
    setStored((s) => ({ ...s, [appId]: saved }));
  }, []);

  const value = useMemo<AppStagesContextValue>(
    () => ({ stageOf: (appId) => stored[appId]?.stage ?? DEFAULT_STAGE.get(appId), stored, applySaved, refresh }),
    [stored, applySaved, refresh]
  );
  return <AppStagesContext.Provider value={value}>{children}</AppStagesContext.Provider>;
}

export function useAppStages() {
  const ctx = useContext(AppStagesContext);
  if (!ctx) throw new Error('useAppStages must be used inside AppStagesProvider');
  return ctx;
}
