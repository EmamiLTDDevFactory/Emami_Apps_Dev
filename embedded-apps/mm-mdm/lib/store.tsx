'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MessageType, StatusMessage, User } from './types';
import { RequestHeader, getSession, listRequests } from './mmApi';

/**
 * Live store: the signed-in hub user as SAP knows them (GET /session), the inbox ("waiting for me", GET /requests?scope=inbox) and the
 * status-bar message. No request data is kept here and nothing is stored in the browser: every screen reads from the backend.
 */
type Load = 'loading' | 'ready' | 'error';

interface MdmContext {
  user: User;
  sessionState: Load;
  sessionError: string;
  retrySession: () => void;
  /** Requests waiting for this user (SAP's inbox) */
  inbox: RequestHeader[];
  inboxState: Load;
  inboxError: string;
  /** Number of requests waiting for me (sidebar badge) */
  waiting: number;
  refreshInbox: () => Promise<void>;
  message: StatusMessage | null;
  notify: (type: MessageType, text: string) => void;
  clearMessage: () => void;
}

const Ctx = createContext<MdmContext | null>(null);
const NO_USER: User = { id: '', name: '', department: '', roles: [] };
const INBOX_REFRESH_MS = 90_000;

export function MdmProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(NO_USER);
  const [sessionState, setSessionState] = useState<Load>('loading');
  const [sessionError, setSessionError] = useState('');
  const [inbox, setInbox] = useState<RequestHeader[]>([]);
  const [inboxState, setInboxState] = useState<Load>('loading');
  const [inboxError, setInboxError] = useState('');
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const loadSession = useCallback(() => {
    setSessionState('loading');
    getSession()
      .then((s) => {
        if (!alive.current) return;
        setUser({ id: s.user, name: s.displayName || s.user, department: s.department, roles: s.roles });
        setSessionError('');
        setSessionState('ready');
      })
      .catch((e: Error) => {
        if (!alive.current) return;
        setSessionError(e.message);
        setSessionState('error');
      });
  }, []);

  const refreshInbox = useCallback(async () => {
    try {
      const rows = await listRequests({ scope: 'inbox' });
      if (!alive.current) return;
      setInbox(rows);
      setInboxError('');
      setInboxState('ready');
    } catch (e) {
      if (!alive.current) return;
      setInboxError(e instanceof Error ? e.message : 'The inbox could not be read.');
      setInboxState('error');
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => {
    if (sessionState !== 'ready') return;
    void refreshInbox();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshInbox(); }, INBOX_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [sessionState, refreshInbox]);

  const notify = useCallback((type: MessageType, text: string) => setMessage({ type, text, at: Date.now() }), []);
  const clearMessage = useCallback(() => setMessage(null), []);

  const value = useMemo<MdmContext>(() => ({
    user, sessionState, sessionError, retrySession: loadSession, inbox, inboxState, inboxError, waiting: inbox.length, refreshInbox, message, notify, clearMessage,
  }), [user, sessionState, sessionError, loadSession, inbox, inboxState, inboxError, refreshInbox, message, notify, clearMessage]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMdm(): MdmContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMdm must be used inside <MdmProvider>');
  return ctx;
}
