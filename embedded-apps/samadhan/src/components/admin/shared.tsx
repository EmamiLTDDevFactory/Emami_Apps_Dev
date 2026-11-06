'use client';
import { useCallback, useEffect, useState } from 'react';

/** Load once, reload on demand; `error` holds the backend's message. */
export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      setData(await fn());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, setError, reload };
}

/** Run a save and report the outcome as a notice message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>, ok = 'Saved.') => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'good', text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, msg, setMsg, run };
}

export const checkboxCls = 'h-4 w-4 accent-[rgb(var(--accent))]';
