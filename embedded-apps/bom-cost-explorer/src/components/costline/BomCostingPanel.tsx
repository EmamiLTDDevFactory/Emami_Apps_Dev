'use client';
/**
 * The BOM costing breakup of one finished good in one plant (CostLineSet, mode B): the same tree and columns as the BOM costing
 * tab, started on the "All costs" column preset when that feature is on. Used by the Plant production summary pop-up, the Standard
 * cost page and the Sales price page. It starts the moment it is shown (the person opened it); no request has a time limit and
 * leaving it aborts the call.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { Play } from 'lucide-react';
import BomTree, { type NodeAgg } from '../BomTree';
import { Button, Spinner, cx, inputCls } from '../ui';
import { fmtMs, fmtNum } from '@/lib/format';
import { buildTree, grandTotal, leafPrefix, nodeTotals } from '@/lib/cost/tree';
import { EMPTY_SIM, simulate } from '@/lib/cost/simulate';
import { defaultQuery } from '@/lib/query/schema';
import { ALL_COSTS_ENABLED } from '@/lib/sap/allCosts';
import { fetchCostLines, type CostLinesResult } from '@/lib/sap/service';
import type { PlantRow } from '@/lib/sap/fields';
import { api } from '@/lib/client/api';
import { dec } from '@/lib/wac/view';

/** Whole-number quantity to cost: the given quantity when it is at least 1, else 1. */
export const costQtyOf = (q: Decimal | string | number | null | undefined): string => {
  try { const d = new Decimal(q ?? 1); return d.isFinite() && d.gte(1) ? d.toDecimalPlaces(0).toFixed() : '1'; } catch { return '1'; }
};

export default function BomCostingPanel({ matnr, werks, uom, defaultQty, plants: given }: { matnr: string; werks: string; uom: string; defaultQty?: Decimal | string | number; plants?: PlantRow[] }) {
  const [qty, setQty] = useState(() => costQtyOf(defaultQty));
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error' | 'cancelled'; data?: CostLinesResult; error?: string; startedAt?: number }>({ status: 'idle' });
  const ctl = useRef<AbortController | null>(null);
  const [, tick] = useState(0);
  const [loaded, setLoaded] = useState<PlantRow[]>([]);
  useEffect(() => { if (!given) void api.plants().then((r) => setLoaded(r.plants)).catch(() => undefined); }, [given]);
  const plants = given ?? loaded;
  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => { if (state.status !== 'loading') return; const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, [state.status]);

  const load = (quantity: string) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setState({ status: 'loading', startedAt: Date.now() });
    const query = { ...defaultQuery('B'), materials: [matnr], plants: [werks], explQty: quantity.trim() || '1' };
    fetchCostLines(query, { signal: c.signal, noTimeout: true })
      .then((data) => { if (!c.signal.aborted) setState({ status: 'done', data }); })
      .catch((e: Error) => { if (c.signal.aborted || e.name === 'AbortError') setState({ status: 'cancelled' }); else setState({ status: 'error', error: e.message }); });
  };
  useEffect(() => { load(costQtyOf(defaultQty)); }, [matnr, werks]); // eslint-disable-line react-hooks/exhaustive-deps

  const plantNames = useMemo(() => Object.fromEntries(plants.map((p) => [p.Werks, p.Name1])), [plants]);
  const plantCurr = useMemo(() => { const m: Record<string, string> = Object.fromEntries(plants.map((p) => [p.Werks, p.Waers])); for (const x of state.data?.rows ?? []) m[x.Hwerks] ??= x.LocCurr; return m; }, [plants, state.data]);
  const tree = useMemo(() => (state.data && state.data.rows.length ? buildTree(state.data.rows, plantNames) : null), [state.data, plantNames]);
  const sim = useMemo(() => (tree ? simulate(tree.rows, EMPTY_SIM) : []), [tree]);
  const agg: NodeAgg | null = useMemo(() => (tree ? { inr: nodeTotals(tree, leafPrefix(tree, (i) => tree.rows[i].TotCostInr)), loc: nodeTotals(tree, leafPrefix(tree, (i) => tree.rows[i].TotCostLoc)), sim: null } : null), [tree]);
  const total = useMemo(() => (tree ? grandTotal(leafPrefix(tree, (i) => tree.rows[i].TotCostInr)) : null), [tree]);
  const q = dec(qty);

  return (
    <div className="flex min-h-[50vh] flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wide text-muted">Cost for quantity ({uom || 'unit'})
          <input className={cx(inputCls, 'w-40')} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity to cost" />
        </label>
        <Button size="sm" onClick={() => load(qty)} disabled={state.status === 'loading'}><Play size={13} /> Cost again</Button>
        {state.status === 'loading' && <span className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Costing in SAP… {fmtMs(Date.now() - (state.startedAt ?? Date.now()))} (no time limit)</span>}
        {state.status === 'done' && total && <span className="num text-sm"><b>{fmtNum(total, 2, 'INR')} INR</b> total for {qty} {uom}{q && q.gt(0) ? <> · {fmtNum(total.div(q), 4, 'INR')} INR per {uom || 'unit'}</> : null} <span className="text-xs text-muted">(SAP figures; {fmtMs(state.data!.ms)} in SAP)</span></span>}
      </div>
      <p className="text-xs text-muted">The same costing as the BOM costing tab ({matnr} in plant {werks}: current BOM and rates){ALL_COSTS_ENABLED ? ', on the "All costs" columns (change them with the column chooser)' : ''}.</p>
      {state.status === 'error' && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state.status === 'cancelled' && <p className="text-sm text-muted">Cancelled.</p>}
      {state.data?.messages.length ? <ul className="rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">{state.data.messages.map((m, i) => <li key={i}>{m.message}</li>)}</ul> : null}
      {state.status === 'done' && !tree && <p className="text-sm text-muted">SAP returned no BOM lines for this material and plant.</p>}
      {tree && agg && (
        <div className="h-[60vh] min-h-[320px] overflow-hidden rounded-xl border border-line">
          <BomTree tree={tree} sim={sim} simOn={false} agg={agg} plantCurr={plantCurr} onOpen={() => undefined} preset={ALL_COSTS_ENABLED ? 'All costs' : undefined} />
        </div>
      )}
    </div>
  );
}
