'use client';
import { createContext, useContext } from 'react';
import type { Unit } from './format';
import type { AppConfig, Filters, Meta, SummaryRow } from './types';

export type View = 'overview' | 'report' | 'brands' | 'media' | 'budget' | 'costcentres';

export interface Ctx {
  config: AppConfig;
  meta: Meta | null;
  /** All summary rows of the period (company filter applied), before the dimension filters. */
  all: SummaryRow[];
  /** Company codes in the data. */
  companies: string[];
  /** Rows after every filter. */
  rows: SummaryRow[];
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  unit: Unit;
  setUnit: (u: Unit) => void;
  fmt: (inr: number) => string;
  go: (v: View, f?: Partial<Filters>) => void;
  reload: () => void;
}

export const AppContext = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside AppContext');
  return c;
}
