'use client';
/** One screen = one scope: the finished goods CURRENTLY SHOWN are priced in one go (batches of 50, merged), and every strip / cell of the screen reads from it. */
import { createContext, useContext, type ReactNode } from 'react';
import { usePriceContext, type PriceContextResult } from '@/lib/price-context/usePriceContext';

const EMPTY: PriceContextResult = { prices: new Map(), active: false, loading: false, error: null, messages: [] };
export const ScopeCtx = createContext<{ pc: PriceContextResult; plant?: string }>({ pc: EMPTY });
export const useScope = () => useContext(ScopeCtx);

export default function PriceScope({ materials, plants, children }: { materials: string[]; plants?: string[]; children: ReactNode }) {
  const pc = usePriceContext(materials);
  return <ScopeCtx.Provider value={{ pc, plant: plants?.length === 1 ? plants[0] : undefined }}>{children}</ScopeCtx.Provider>;
}
