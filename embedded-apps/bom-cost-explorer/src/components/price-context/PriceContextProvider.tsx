'use client';
/** Holds the price context (URL ?pc= + session storage). Admin only: for anyone else the context stays inert (off, nothing requested). Saving never requests anything. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PriceContextCtx, type PcApi } from '@/lib/price-context/context';
import { DEFAULT_PC, loadPc, savePc, type PriceContextState } from '@/lib/price-context/state';
import { fetchIsAdmin } from '@/lib/client/hubAccess';

export default function PriceContextProvider({ email, children }: { email: string; children: ReactNode }) {
  const [admin, setAdmin] = useState(false);
  const [state, setState] = useState<PriceContextState>(DEFAULT_PC);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (email) void fetchIsAdmin(email).then(setAdmin); }, [email]);
  useEffect(() => { setState(loadPc()); setLoaded(true); }, []);
  useEffect(() => { if (loaded && admin) savePc(state); }, [state, loaded, admin]);
  const set = useCallback((p: Partial<PriceContextState>) => setState((s) => ({ ...s, ...p })), []);
  const replace = useCallback((s: PriceContextState) => setState(s), []);
  const api = useMemo<PcApi>(() => ({ state: admin && loaded ? state : DEFAULT_PC, set, replace, admin, email }), [admin, loaded, state, set, replace, email]);
  return <PriceContextCtx.Provider value={api}>{children}</PriceContextCtx.Provider>;
}
