'use client';
/**
 * State shared by the tabs of one plan (/plan/view/?plan=): the plan, the breakup / summary query, the
 * planner role, and ONE Mode P costing result (Breakup & cost and Scenarios use the same run; nothing runs
 * until the person presses Run in SAP).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SapMessage } from '../sap/messages';
import { fetchPlanCostLines, type PlanResult } from './client';
import { defaultPlanCostQuery, type PlanCostQuery } from './requests';
import type { PlanCheck, PlanCostLine, PlanSummary, PlanWip } from './fields';
import { fetchAppRole } from '../client/hubAccess';

export interface PlanCostState {
  status: 'idle' | 'running' | 'done' | 'error';
  rows: PlanCostLine[];
  messages: SapMessage[];
  ms: number;
  error: string;
  ranQuery: PlanCostQuery | null;
  at: number;
}

export interface PlanWorkspace {
  plan: string;
  user: string;
  role: string;
  canWrite: boolean; // hub role Planner or Admin (SAP checks again)
  query: PlanCostQuery;
  setQuery: (q: PlanCostQuery) => void;
  cost: PlanCostState;
  runCost: (q?: PlanCostQuery) => Promise<void>;
  cancelCost: () => void;
  /** bumped after any write so tabs reload what they show */
  version: number;
  changed: () => void;
  /** what the Requirement / Checks / WIP tabs last loaded (kept across tab switches; used by the export) */
  loaded: PlanLoaded;
  setLoaded: (p: Partial<PlanLoaded>) => void;
}

export interface PlanLoaded {
  summary: PlanResult<PlanSummary> | null;
  checks: (PlanResult<PlanCheck> & { itemCheck: boolean }) | null;
  wip: PlanResult<PlanWip> | null;
}
const NOTHING: PlanLoaded = { summary: null, checks: null, wip: null };

const EMPTY: PlanCostState = { status: 'idle', rows: [], messages: [], ms: 0, error: '', ranQuery: null, at: 0 };
export const PLANNER_ROLES = ['Planner', 'Admin'];

export function usePlanWorkspace(plan: string, user: string): PlanWorkspace {
  const [query, setQuery] = useState<PlanCostQuery>(() => defaultPlanCostQuery(plan));
  const [cost, setCost] = useState<PlanCostState>(EMPTY);
  const [role, setRole] = useState('');
  const [version, setVersion] = useState(0);
  const [loaded, setLoadedState] = useState<PlanLoaded>(NOTHING);
  const setLoaded = useCallback((p: Partial<PlanLoaded>) => setLoadedState((s) => ({ ...s, ...p })), []);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(defaultPlanCostQuery(plan));
    setCost(EMPTY);
    setLoadedState(NOTHING);
  }, [plan]);
  useEffect(() => {
    if (user) void fetchAppRole(user).then(setRole);
  }, [user]);

  const runCost = useCallback(async (q?: PlanCostQuery) => {
    const run = q ?? query;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setCost((s) => ({ ...s, status: 'running', error: '' }));
    try {
      const r = await fetchPlanCostLines(run, { signal: c.signal });
      if (!c.signal.aborted) setCost({ status: 'done', rows: r.rows, messages: r.messages, ms: r.ms, error: '', ranQuery: run, at: Date.now() });
    } catch (e) {
      if (c.signal.aborted) return;
      setCost((s) => ({ ...s, status: 'error', error: (e as Error).message }));
    }
  }, [query]);
  const cancelCost = useCallback(() => {
    ctl.current?.abort();
    setCost((s) => ({ ...s, status: s.rows.length ? 'done' : 'idle' }));
  }, []);
  useEffect(() => () => ctl.current?.abort(), []);

  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    setLoadedState(NOTHING); // quantities changed: requirement / checks / WIP are stale
  }, []);
  return { plan, user, role, canWrite: PLANNER_ROLES.includes(role), query, setQuery, cost, runCost, cancelCost, version, changed, loaded, setLoaded };
}
