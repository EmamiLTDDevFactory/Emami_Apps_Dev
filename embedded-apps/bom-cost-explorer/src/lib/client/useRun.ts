'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export interface RunState<T> {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  data: T | null;
  error: ApiError | null;
  startedAt: number | null;
  elapsed: number;
}

/** One long-running request at a time: elapsed ticker, cancel via AbortController, and the
 * previous result stays visible until the new one arrives. */
export function useRun<T, A extends unknown[]>(fn: (signal: AbortSignal, ...args: A) => Promise<T>) {
  const [s, set] = useState<RunState<T>>({ status: 'idle', data: null, error: null, startedAt: null, elapsed: 0 });
  const ctl = useRef<AbortController | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (s.status !== 'running' || !s.startedAt) return;
    const t = setInterval(() => set((p) => ({ ...p, elapsed: Date.now() - (p.startedAt ?? Date.now()) })), 250);
    return () => clearInterval(t);
  }, [s.status, s.startedAt]);

  useEffect(() => () => ctl.current?.abort(), []);

  const run = useCallback(async (...args: A): Promise<T | null> => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    const startedAt = Date.now();
    set((p) => ({ ...p, status: 'running', error: null, startedAt, elapsed: 0 }));
    try {
      const data = await fnRef.current(c.signal, ...args);
      if (c.signal.aborted) return null;
      set({ status: 'done', data, error: null, startedAt: null, elapsed: Date.now() - startedAt });
      return data;
    } catch (e) {
      if (c.signal.aborted || (e as Error).name === 'AbortError') {
        set((p) => ({ ...p, status: 'cancelled', startedAt: null }));
        return null;
      }
      set((p) => ({ ...p, status: 'error', error: e instanceof ApiError ? e : new ApiError((e as Error).message, 0), startedAt: null }));
      return null;
    } finally {
      if (ctl.current === c) ctl.current = null;
    }
  }, []);

  const cancel = useCallback(() => ctl.current?.abort(), []);
  const reset = useCallback((data: T | null = null) => set({ status: data ? 'done' : 'idle', data, error: null, startedAt: null, elapsed: 0 }), []);
  return { ...s, run, cancel, reset };
}
