'use client';
import { useEffect, useMemo, useState } from 'react';
import { actualsPerPiece, fetchProcOrders, monthsAgo, type FgActual, type ProcOrderRow } from './procOrder';

export interface ProcOrdersState {
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  note: string;
  rows: ProcOrderRow[];
  actuals: Map<string, FgActual>;
}

const EMPTY = new Map<string, FgActual>();

/** Process-order actuals of the costed FGs (plants x FGs, the last `months` months); loaded when the tab is shown. */
export function useProcOrders(plants: string[], fgs: string[], months: number, active: boolean): ProcOrdersState {
  const key = `${[...new Set(plants)].sort().join(',')}|${[...new Set(fgs)].sort().join(',')}|${months}`;
  const [st, setSt] = useState<{ key: string; status: ProcOrdersState['status']; note: string; rows: ProcOrderRow[] }>({ key: '', status: 'idle', note: '', rows: [] });
  useEffect(() => {
    if (!active || !fgs.length || st.key === key) return;
    const c = new AbortController();
    setSt({ key, status: 'loading', note: '', rows: [] });
    fetchProcOrders(plants, fgs, monthsAgo(months), { signal: c.signal })
      .then((f) => { if (!c.signal.aborted) setSt({ key, status: f.status, note: f.note, rows: f.rows }); })
      .catch((e) => { if (!c.signal.aborted) setSt({ key, status: 'error', note: (e as Error).message, rows: [] }); });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);
  const actuals = useMemo(() => (st.status === 'ready' ? actualsPerPiece(st.rows) : EMPTY), [st.status, st.rows]);
  return { status: st.key === key ? st.status : 'idle', note: st.note, rows: st.rows, actuals };
}
