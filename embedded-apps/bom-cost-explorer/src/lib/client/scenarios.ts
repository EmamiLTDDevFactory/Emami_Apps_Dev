'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CostQuery } from '../query/schema';
import { costQuerySchema } from '../query/schema';
import type { SimSettings } from '../cost/simulate';
import { EMPTY_SIM } from '../cost/simulate';
import type { CostResult } from './api';
import { idb, ls } from './storage';

export const MAX_SCENARIOS = 5;

export interface Scenario {
  id: string;
  name: string;
  query: CostQuery;
  sim: SimSettings;
  baseline: boolean;
  createdAt: number;
  updatedAt: number;
  /** summary of the last SAP run; the rows themselves are in IndexedDB */
  lastRun?: { at: number; ms: number; rows: number; totalInr: string };
  /** what changed vs the scenario it was derived from (SAP-side what-if) */
  note?: string;
}

export type ScenarioResult = CostResult & { at: number };

const key = (user: string) => `bce:scenarios:${user}`;
const resKey = (id: string) => `scenario:${id}`;
export const newId = () => Math.random().toString(36).slice(2, 10);

export function useScenarios(user: string) {
  const [list, setList] = useState<Scenario[]>([]);
  // The ref is the source of truth so add() can return the created scenario synchronously.
  const ref = useRef<Scenario[]>([]);
  useEffect(() => {
    ref.current = ls.get<Scenario[]>(key(user), []);
    setList(ref.current);
  }, [user]);
  const save = useCallback(
    (next: Scenario[] | ((prev: Scenario[]) => Scenario[])) => {
      const v = typeof next === 'function' ? next(ref.current) : next;
      ref.current = v;
      ls.set(key(user), v);
      setList(v);
    },
    [user],
  );

  const add = useCallback(
    (s: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt' | 'baseline'> & { baseline?: boolean }): Scenario | null => {
      if (ref.current.length >= MAX_SCENARIOS) return null;
      const created: Scenario = { ...s, id: newId(), baseline: s.baseline ?? ref.current.length === 0, createdAt: Date.now(), updatedAt: Date.now() };
      save([...ref.current, created]);
      return created;
    },
    [save],
  );
  const update = useCallback((id: string, patch: Partial<Scenario>) => save((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s))), [save]);
  const remove = useCallback(
    (id: string) => {
      void idb.del(resKey(id));
      save((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length && !next.some((s) => s.baseline)) next[0] = { ...next[0], baseline: true };
        return next;
      });
    },
    [save],
  );
  const setBaseline = useCallback((id: string) => save((prev) => prev.map((s) => ({ ...s, baseline: s.id === id }))), [save]);
  return { list, save, add, update, remove, setBaseline };
}

export const scenarioResults = {
  get: (id: string) => idb.get<ScenarioResult>(resKey(id)),
  set: (id: string, r: ScenarioResult) => idb.set(resKey(id), r),
};

/** Export definitions (not the SAP results - those are re-run on import). */
export function exportScenarios(list: Scenario[]): string {
  return JSON.stringify({ app: 'bom-cost-explorer', version: 1, scenarios: list.map(({ lastRun: _lr, ...s }) => s) }, null, 2);
}

export function importScenarios(json: string): Scenario[] {
  const data = JSON.parse(json) as { scenarios?: Partial<Scenario>[] };
  if (!Array.isArray(data.scenarios)) throw new Error('Not a scenario export file.');
  return data.scenarios.slice(0, MAX_SCENARIOS).map((s, i) => {
    const q = costQuerySchema.innerType().safeParse(s.query);
    if (!q.success) throw new Error(`Scenario ${i + 1} has an invalid query.`);
    return {
      id: newId(),
      name: String(s.name || `Imported ${i + 1}`).slice(0, 60),
      query: q.data as CostQuery,
      sim: { ...EMPTY_SIM, ...(s.sim ?? {}) },
      baseline: !!s.baseline,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      note: s.note,
    };
  });
}
