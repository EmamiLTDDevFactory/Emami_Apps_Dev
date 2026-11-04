'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MessageType, StatusMessage, User } from './types';
import { SEED_MATERIALS, SEED_REQUESTS } from './mockData';
import { USERS } from './workflowConfig';
import { Db, Result, waitingFor } from './service';
import { resetSetupData } from './setupData';

// v5: view visibility per level (backend); older saved data is ignored
const STORAGE_KEY = 'sap-mdm-portal-v5';
const SEED: Db = { materials: SEED_MATERIALS, requests: SEED_REQUESTS };

interface MdmContext {
  db: Db;
  user: User;
  setUserId: (id: string) => void;
  /** Runs a service operation against the current data and stores the result */
  run: (op: (db: Db) => Result) => Result;
  waiting: number;
  message: StatusMessage | null;
  notify: (type: MessageType, text: string) => void;
  clearMessage: () => void;
  resetDemo: () => void;
}

const Ctx = createContext<MdmContext | null>(null);

export function MdmProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(SEED);
  const dbRef = useRef(db);
  const [userId, setUserId] = useState('RSHARMA');
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const user = USERS.find((u) => u.id === userId) ?? USERS[0];

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.db?.materials && saved.db?.requests) {
          setDb(saved.db);
          dbRef.current = saved.db;
        }
        if (saved.userId) setUserId(saved.userId);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ db, userId }));
    } catch {
      /* ignore */
    }
  }, [db, userId, loaded]);

  const run = useCallback((op: (db: Db) => Result) => {
    const res = op(dbRef.current);
    if (res.ok) {
      dbRef.current = res.db;
      setDb(res.db);
    }
    return res;
  }, []);

  const notify = useCallback((type: MessageType, text: string) => setMessage({ type, text, at: Date.now() }), []);
  const clearMessage = useCallback(() => setMessage(null), []);
  const resetDemo = useCallback(() => {
    dbRef.current = SEED;
    setDb(SEED);
    resetSetupData();
    notify('info', 'Demo data reset to the initial state');
  }, [notify]);

  const waiting = useMemo(() => waitingFor(db, user).length, [db, user]);

  return (
    <Ctx.Provider value={{ db, user, setUserId, run, waiting, message, notify, clearMessage, resetDemo }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMdm(): MdmContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMdm must be used inside <MdmProvider>');
  return ctx;
}
