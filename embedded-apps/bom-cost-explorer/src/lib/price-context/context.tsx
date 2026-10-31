'use client';
import { createContext, useContext } from 'react';
import { DEFAULT_PC, type PriceContextState } from './state';

export interface PcApi { state: PriceContextState; set: (p: Partial<PriceContextState>) => void; replace: (s: PriceContextState) => void; admin: boolean; email?: string }
/** Outside a provider (flag off, or not an Admin) the context is inert: off, no sales area, nothing is ever requested. */
const INERT: PcApi = { state: DEFAULT_PC, set: () => {}, replace: () => {}, admin: false };
export const PriceContextCtx = createContext<PcApi>(INERT);
export const usePcApi = (): PcApi => useContext(PriceContextCtx);
