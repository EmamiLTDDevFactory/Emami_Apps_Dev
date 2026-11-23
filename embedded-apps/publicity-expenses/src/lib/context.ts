'use client';
import { createContext, useContext } from 'react';
import type { Unit } from './format';
import type { Period } from './api';
import type { AppConfig, Filters, Me, Meta, SummaryRow } from './types';

export type View = 'overview' | 'report' | 'brands' | 'media' | 'budget' | 'costcentres' | 'settings';

export interface Ctx {
  me: Me;
  /** fy / period / company / exclusions switch for API calls. */
  q: Period;
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
  /** Settings changed (rules, budget, mapping): read config and data again. */
  refreshAll: () => void;
}

export const AppContext = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside AppContext');
  return c;
}
