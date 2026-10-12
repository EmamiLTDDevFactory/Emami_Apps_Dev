'use client';
/**
 * Lazy rate options for one costing query. Nothing is requested until request() is called (the Rate
 * sources tab, the row drawer and the re-pick what-ifs call it). A query change or unmount aborts the
 * request in flight. retest() forgets the capability verdict and the cache, then loads again.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CostQuery } from '../query/schema';
import { fetchRateOptions, clearRatesCache, UNAVAILABLE_NOTE } from './options';
import { getRatesCapability, resetRatesCapability } from './capability';
import type { RateOptionRow } from './fields';

export type RatesStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface RatesState {
  status: RatesStatus;
  rows: RateOptionRow[] | null;
  mode: 'direct' | 'expand' | null;
  note: string;
  request: () => void;
  retest: () => void;
}

export function useRateOptions(query: CostQuery | null, system: string): RatesState {
  const [state, setState] = useState<Omit<RatesState, 'request' | 'retest'>>({ status: 'idle', rows: null, mode: null, note: '' });
  const ctl = useRef<AbortController | null>(null);
  const statusRef = useRef<RatesStatus>('idle');
  statusRef.current = state.status;
  const qKey = query ? JSON.stringify(query) : '';

  // A new query starts from scratch; a remembered "unavailable" is shown without a request.
  useEffect(() => {
    ctl.current?.abort();
    ctl.current = null;
    const known = system ? getRatesCapability(system) : null;
    setState(known?.state === 'unavailable' ? { status: 'unavailable', rows: null, mode: null, note: known.reason || UNAVAILABLE_NOTE } : { status: 'idle', rows: null, mode: null, note: '' });
    return () => ctl.current?.abort();
  }, [qKey, system]);

  const load = useCallback(() => {
    if (!query) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setState((s) => ({ ...s, status: 'loading', note: '' }));
    fetchRateOptions(query, { signal: c.signal })
      .then((r) => {
        if (c.signal.aborted) return;
        if ('unavailable' in r) setState({ status: 'unavailable', rows: null, mode: null, note: r.reason });
        else setState({ status: 'ready', rows: r.rows, mode: r.mode, note: '' });
      })
      .catch((e) => {
        if (c.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setState({ status: 'error', rows: null, mode: null, note: (e as Error)?.message || 'Could not load rate options.' });
      });
    // qKey stands for query
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
