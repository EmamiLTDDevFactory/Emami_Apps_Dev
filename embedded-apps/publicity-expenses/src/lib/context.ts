'use client';
import { createContext, useContext } from 'react';
import type { Unit } from './format';
import type { Period } from './api';
import type { AppConfig, Filters, Me, Meta, SummaryRow } from './types';

export type View = 'overview' | 'report' | 'brands' | 'media' | 'budget' | 'costcentres' | 'settings';

/** The period selection in words, for labels: cy = "YTD-Nov'26" / "Nov'26" / "Q2 FY'27" ..., py = the same periods a year earlier. */
export interface Selection { periods: number[]; latest: number; n: number; ytd: boolean; cy: string; py: string }

export interface Ctx {
  me: Me;
  /** fy / periods / companies / exclusions switch for API calls. */
  q: Period;
  sel: Selection;
  config: AppConfig;
  meta: Meta | null;
  /** All summary rows of the selection (periods and companies applied by the server), before the dimension filters. */
  all: SummaryRow[];
  /** Company codes to offer in the company filter (in the data + selected). */
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
