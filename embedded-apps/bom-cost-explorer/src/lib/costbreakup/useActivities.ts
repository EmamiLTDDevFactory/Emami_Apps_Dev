'use client';
import { useEffect, useMemo, useState } from 'react';
import { activitiesPerUnit, fetchActivities, fetchActivitiesAuto, fiscalPeriod, type ActivityRow, type MatActivity } from './activity';

export interface ActivitiesState {
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  note: string;
  rows: ActivityRow[];
  period: { gjahr: string; poper: string };
  perUnit: Map<string, MatActivity>;
  /** true = every material is priced in the period of its latest cost estimate (as CK13N); false = one fixed period */
  auto: boolean;
}

const EMPTY = new Map<string, MatActivity>();

/** Routing activities (ActivityCostSet) of the FGs and their semi-finished components for the chosen fiscal period (default the current one: activity prices are SAP's plan prices of THAT period); loaded when the tab is shown. */
export function useActivities(plants: string[], mats: string[], active: boolean, chosen?: { gjahr: string; poper: string }): ActivitiesState {
  const autoMode = !chosen;
  const cur = useMemo(() => fiscalPeriod(), []);
  const period = chosen ?? cur;
  const [autoOk, setAutoOk] = useState(true);
  const key = `${[...new Set(plants)].sort().join(',')}|${[...new Set(mats)].sort().join(',')}|${autoMode ? 'AUTO' : period.gjahr + period.poper}`;
  const [st, setSt] = useState<{ key: string; status: ActivitiesState['status']; note: string; rows: ActivityRow[] }>({ key: '', status: 'idle', note: '', rows: [] });
  useEffect(() => {
    if (!active || !mats.length || st.key === key) return;
    const c = new AbortController();
    setSt({ key, status: 'loading', note: '', rows: [] });
    (autoMode ? fetchActivitiesAuto(plants, mats, { signal: c.signal }) : fetchActivities(plants, mats, period, { signal: c.signal }).then((f) => ({ ...f, auto: false })))
      .then((f) => { if (!c.signal.aborted) setAutoOk(f.auto); if (!c.signal.aborted) setSt({ key, status: f.status, note: f.note, rows: f.rows }); })
      .catch((e) => { if (!c.signal.aborted) setSt({ key, status: 'error', note: (e as Error).message, rows: [] }); });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);
  const perUnit = useMemo(() => (st.status === 'ready' ? activitiesPerUnit(st.rows, autoMode && autoOk ? undefined : period.poper) : EMPTY), [st.status, st.rows, period.poper, autoMode, autoOk]);
  return { status: st.key === key ? st.status : 'idle', note: st.note, rows: st.rows, period, perUnit, auto: autoMode && autoOk };
}
