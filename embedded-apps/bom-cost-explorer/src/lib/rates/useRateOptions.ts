'use client';
/**
 * Lazy rate options for one costing query. Nothing is requested until request() is called (the Rate
 * sources tab, the row drawer and the re-pick what-ifs call it). A query change or unmount aborts the
 * request in flight. retest() forgets the capability verdict and the cache, then loads again.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CostQuery } from '../query/schema';
import { fetchRateOptions, fetchRateOptionsByFilter, clearRatesCache, UNAVAILABLE_NOTE, type RatesResult } from './options';
import { getRatesCapability, resetRatesCapability } from './capability';
import type { RateOptionRow } from './fields';

const warning = (f?: { count: number; first: string }) => (f ? `${f.count} step(s) of the rate-option load failed (${f.first}); the FGs in them have no C-MAP / Consumption rates. Use Test again to retry.` : '');

export type RatesStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface RatesState {
  status: RatesStatus;
  rows: RateOptionRow[] | null;
  mode: 'direct' | 'expand' | null;
  note: string;
  request: () => void;
  retest: () => void;
}

/** Progress of a batched load: steps done / total and how many failed. */
export interface RatesProgress { done: number; total: number; failed: number }

/** Lazy rate options for a BOM costing query (mode B). */
export function useRateOptions(query: CostQuery | null, system: string): RatesState {
  const key = query ? JSON.stringify(query) : '';
  return useLazyRates(key, system, (signal) => fetchRateOptions(query as CostQuery, { signal }));
}

/** Same for any CostLineSet filter (Production Plan Mode P). */
export function useRateOptionsByFilter(filter: string | null, system: string): RatesState {
  return useLazyRates(filter ?? '', system, (signal) => fetchRateOptionsByFilter(filter as string, { signal }));
}

export function useLazyRates(qKey: string, system: string, loader: (signal: AbortSignal, report?: (done: number, total: number) => void) => Promise<RatesResult>): RatesState {
  const [state, setState] = useState<Omit<RatesState, 'request' | 'retest'>>({ status: 'idle', rows: null, mode: null, note: '' });
  const ctl = useRef<AbortController | null>(null);
  const statusRef = useRef<RatesStatus>('idle');
  statusRef.current = state.status;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // A new query starts from scratch; a remembered "unavailable" is shown without a request.
  useEffect(() => {
    ctl.current?.abort();
    ctl.current = null;
    const known = system ? getRatesCapability(system) : null;
    setState(known?.state === 'unavailable' ? { status: 'unavailable', rows: null, mode: null, note: known.reason || UNAVAILABLE_NOTE } : { status: 'idle', rows: null, mode: null, note: '' });
    return () => ctl.current?.abort();
  }, [qKey, system]);

  const load = useCallback(() => {
    if (!qKey) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setState((s) => ({ ...s, status: 'loading', note: '' }));
    loaderRef.current(c.signal, (done, total) => { if (!c.signal.aborted) setState((s) => (s.status === 'loading' ? { ...s, note: `step ${Math.min(done + 1, total)} of ${total}` } : s)); })
      .then((r) => {
        if (c.signal.aborted) return;
        if ('unavailable' in r) setState({ status: 'unavailable', rows: null, mode: null, note: r.reason });
        else setState({ status: 'ready', rows: r.rows, mode: r.mode, note: warning((r as { failed?: { count: number; first: string } }).failed) });
      })
      .catch((e) => {
        if (c.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setState({ status: 'error', rows: null, mode: null, note: (e as Error)?.message || 'Could not load rate options.' });
      });
  }, [qKey]);

  const request = useCallback(() => {
    if (statusRef.current === 'idle' || statusRef.current === 'error') {
      statusRef.current = 'loading';
      load();
    }
  }, [load]);

  const retest = useCallback(() => {
    if (system) resetRatesCapability(system);
    clearRatesCache();
    load();
  }, [system, load]);

  return { ...state, request, retest };
}
