'use client';
/**
 * The BOM costing breakup of one finished good in one plant (CostLineSet, mode B): the same tree and columns as the BOM costing
 * tab, started on the "All costs" column preset when that feature is on. Used by the Plant production summary pop-up, the Standard
 * cost page and the Sales price page. It starts the moment it is shown (the person opened it); no request has a time limit and
 * leaving it aborts the call.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { Play, FlaskConical } from 'lucide-react';
import OriginBreakup from './OriginBreakup';
import { PriorityList } from '../Pickers';
import BomTree, { type NodeAgg } from '../BomTree';
import { Button, Spinner, cx, inputCls } from '../ui';
import { fmtMs, fmtNum } from '@/lib/format';
import { buildTree, grandTotal, leafPrefix, nodeTotals } from '@/lib/cost/tree';
import { EMPTY_SIM, isIdentity, simulate, type PickMode, type SimSettings } from '@/lib/cost/simulate';
import { originBreakup } from '@/lib/cost/originBreakup';
import { runScenarios, scenarios } from '@/lib/cost/priorityScenarios';
import { isLeafRow } from '@/lib/cost/tree';
import { sourceLabel } from '@/lib/rates/sourceLabel';
import { useRateOptions } from '@/lib/rates/useRateOptions';
import { attachRateOptions } from '@/lib/rates/options';
import { sapConfig } from '@/lib/sap/config';
import { RATE_SOURCES, type CostQuery } from '@/lib/query/schema';
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
  const [ranQuery, setRanQuery] = useState<CostQuery | null>(null);
  const [settings, setSettings] = useState<SimSettings>(EMPTY_SIM);
  const [simOpen, setSimOpen] = useState(false);
  const system = (() => { try { return sapConfig().system; } catch { return ''; } })();
  const rates = useRateOptions(simOpen ? ranQuery : null, system);
  useEffect(() => { if (simOpen) rates.request(); }, [simOpen, ranQuery]); // eslint-disable-line react-hooks/exhaustive-deps
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
    setSettings(EMPTY_SIM);
    const query = { ...defaultQuery('B'), materials: [matnr], plants: [werks], explQty: quantity.trim() || '1' };
    setRanQuery(query);
    fetchCostLines(query, { signal: c.signal, noTimeout: true })
      .then((data) => { if (!c.signal.aborted) setState({ status: 'done', data }); })
      .catch((e: Error) => { if (c.signal.aborted || e.name === 'AbortError') setState({ status: 'cancelled' }); else setState({ status: 'error', error: e.message }); });
  };
  useEffect(() => { load(costQtyOf(defaultQty)); }, [matnr, werks]); // eslint-disable-line react-hooks/exhaustive-deps

  const plantNames = useMemo(() => Object.fromEntries(plants.map((p) => [p.Werks, p.Name1])), [plants]);
  const plantCurr = useMemo(() => { const m: Record<string, string> = Object.fromEntries(plants.map((p) => [p.Werks, p.Waers])); for (const x of state.data?.rows ?? []) m[x.Hwerks] ??= x.LocCurr; return m; }, [plants, state.data]);
  const rateOptionsReady = simOpen && rates.status === 'ready' && !!rates.rows;
  const costRows = useMemo(() => (state.data ? (rateOptionsReady ? attachRateOptions(state.data.rows, rates.rows!) : state.data.rows) : []), [state.data, rateOptionsReady, rates.rows]);
  const tree = useMemo(() => (costRows.length ? buildTree(costRows, plantNames) : null), [costRows, plantNames]);
  const effective = useMemo(() => (rateOptionsReady || settings.pick === 'sap' ? settings : { ...settings, pick: 'sap' as PickMode }), [rateOptionsReady, settings]);
  const simOn = !!tree && !isIdentity(effective);
  const sim = useMemo(() => (tree ? simulate(tree.rows, effective) : []), [tree, effective]);
  const agg: NodeAgg | null = useMemo(() => (tree ? { inr: nodeTotals(tree, leafPrefix(tree, (i) => tree.rows[i].TotCostInr)), loc: nodeTotals(tree, leafPrefix(tree, (i) => tree.rows[i].TotCostLoc)), sim: simOn ? nodeTotals(tree, leafPrefix(tree, (i) => sim[i].total)) : null } : null), [tree, sim, simOn]);
  const origin = useMemo(() => (tree ? originBreakup(tree.rows.filter(isLeafRow).map((r) => ({ origin: r.CompOgrp, value: r.TotCostInr }))) : null), [tree]);
  const scen = useMemo(() => (tree && rateOptionsReady ? runScenarios(tree.rows, scenarios(settings.prio), costQtyOf(qty)) : null), [tree, rateOptionsReady, settings.prio, qty]);
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
      {tree && origin && <OriginBreakup slices={origin.slices} total={origin.total} curr="INR" unit={`total for ${qty} ${uom}`} note="Cost of the components added up by their origin group (CompOgrp of the BOM costing)." />}
      {tree && (
        <section className="rounded-xl border border-line bg-panel p-3" aria-label="Priority simulation">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={simOpen ? 'primary' : 'default'} onClick={() => setSimOpen((o) => !o)} aria-expanded={simOpen}><FlaskConical size={13} /> Priority simulation</Button>
            <span className="text-xs text-muted">Compare SAP&apos;s pick, C-MAP (MBEW), contract, info record, market and consumption side by side. Instant, no new costing.</span>
            {simOn && <Button size="sm" onClick={() => setSettings({ ...EMPTY_SIM, prio: settings.prio })}>Back to SAP selection</Button>}
          </div>
          {simOpen && rates.status === 'loading' && <p className="mt-2 flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the rate options of every line from SAP…</p>}
          {simOpen && (rates.status === 'unavailable' || rates.status === 'error') && <p className="mt-2 rounded-lg bg-sunken px-3 py-2 text-xs text-ink" role="note">{rates.note || 'Rate options are not available from SAP.'} <button type="button" className="font-semibold text-accent underline" onClick={rates.retest}>Test again</button></p>}
          {rateOptionsReady && scen && (
            <div className="mt-3 grid gap-4 lg:grid-cols-[320px_1fr]">
              <div>
                <p className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Your priority order</p>
                <PriorityList value={settings.prio} onChange={(v) => setSettings({ ...settings, pick: 'priority', prio: v as SimSettings['prio'] })} all={RATE_SOURCES} />
                <p className="mt-1 text-2xs text-muted">{settings.prio.map(sourceLabel).join(' > ')}. The first source that has a rate on a line is used; lines without it keep SAP&apos;s pick.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-2xs font-bold uppercase tracking-wide text-muted"><th className="py-1 text-left">Scenario</th><th className="py-1 text-right">Total (INR)</th><th className="py-1 text-right">Per {uom || 'unit'}</th><th className="py-1 text-right">vs SAP</th><th className="py-1 text-right">Re-picked lines</th><th className="py-1 text-right">No rate</th><th className="py-1"><span className="sr-only">Show</span></th></tr></thead>
                  <tbody>
                    {scen.map((x, i) => {
                      const sc = scenarios(settings.prio)[i];
                      const active = effective.pick === sc.settings.pick && JSON.stringify(effective.prio) === JSON.stringify(sc.settings.prio) || (sc.id === 'sap' && effective.pick === 'sap');
                      return (
                        <tr key={x.id} className={cx('border-t border-line/60', active && 'bg-sim/5')}>
                          <td className="py-1 font-semibold">{x.label}</td>
                          <td className="num py-1 text-right">{fmtNum(x.total, 2, 'INR')}</td>
                          <td className="num py-1 text-right">{x.perUnit ? fmtNum(x.perUnit, 4, 'INR') : 'n/a'}</td>
                          <td className={cx('num py-1 text-right', x.delta.gt(0) ? 'text-bad' : x.delta.lt(0) ? 'text-good' : 'text-muted')}>{i === 0 ? '–' : <>{x.delta.gt(0) ? '+' : ''}{fmtNum(x.delta, 2, 'INR')}{x.deltaPct ? ` (${x.deltaPct.gt(0) ? '+' : ''}${x.deltaPct.toFixed(2)} %)` : ''}</>}</td>
                          <td className="num py-1 text-right">{x.repicked}</td>
                          <td className="num py-1 text-right">{x.noRate}</td>
                          <td className="py-1 text-right"><Button size="sm" variant="ghost" onClick={() => setSettings({ ...EMPTY_SIM, ...sc.settings, prio: sc.id === 'prio' ? settings.prio : sc.settings.prio })}>Show in tree</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-1 text-2xs text-muted">Simulated figures are computed here from the rate options SAP returned; SAP&apos;s own total is the first row. {simOn ? 'The tree below shows the selected scenario in the Simulated INR column.' : ''}</p>
              </div>
            </div>
          )}
        </section>
      )}
      {tree && agg && (
        <div className="h-[60vh] min-h-[320px] overflow-hidden rounded-xl border border-line">
          <BomTree tree={tree} sim={sim} simOn={simOn} agg={agg} plantCurr={plantCurr} onOpen={() => undefined} preset={ALL_COSTS_ENABLED ? 'All costs' : undefined} />
        </div>
      )}
    </div>
  );
}
