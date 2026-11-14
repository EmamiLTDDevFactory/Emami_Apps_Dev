'use client';
/** Rate options (C-MAP = MBEW, Consumption) of a plan run: loaded in the same steps as the costing, see fetchRateOptionsSteps. */
import { useMemo } from 'react';
import { useLazyRates, type RatesState } from '../rates/useRateOptions';
import { fetchRateOptionsSteps } from '../rates/options';
import { COSTING_TIMEOUT_MS } from '../sap/client';
import { costFilter } from './requests';
import type { PlanCostState } from './workspace';

export function usePlanRateOptions(cost: Pick<PlanCostState, 'status' | 'ranQuery' | 'calls' | 'at'>, system: string): RatesState {
  const filters = useMemo(() => {
    if (cost.status !== 'done' || !cost.ranQuery) return [];
    const q = cost.ranQuery;
    if (!cost.calls.length) return [costFilter(q)]; // a run made in one piece (no plant list)
    return cost.calls.map((c) => costFilter({ ...q, plants: c.werks ? [c.werks] : q.plants, materials: c.materials }));
  }, [cost.status, cost.ranQuery, cost.calls]);
  const key = filters.length ? `${cost.at}|${filters.length}|${filters[0]}` : '';
  return useLazyRates(key, system, (signal, report) => fetchRateOptionsSteps(filters, { signal, costing: true, timeoutMs: COSTING_TIMEOUT_MS }, report));
}
