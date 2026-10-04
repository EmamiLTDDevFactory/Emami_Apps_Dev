'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlantRow } from '@/lib/sap/fields';
import { costQuerySchema, MODE_LABEL, RATE_SOURCES, type CostQuery } from '@/lib/query/schema';
import { api } from '@/lib/client/api';
import { exportScenarios, importScenarios, MAX_SCENARIOS, scenarioResults, type Scenario, type ScenarioResult, useScenarios } from '@/lib/client/scenarios';
import { EMPTY_SIM, isIdentity, simulate, baseSimRow, type SimSettings } from '@/lib/cost/simulate';
import { diffScenarios } from '@/lib/cost/analytics';
import { isLeafRow } from '@/lib/cost/tree';
import { D, ZERO, sum } from '@/lib/cost/decimal';
import { fmtMs, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { PriorityList } from './Pickers';
import { Button, Card, cx, Empty, inputBase, inputCls, Modal, Pill, SimTag } from './ui';
import { Waterfall } from './charts';

type WhatIf = 'explQty' | 'prio' | 'donorPlant' | 'stdFrt' | 'inclFrt' | 'lookback' | 'asofDate' | 'plants' | 'maxLevel' | 'budgetYr';
const WHAT_IF_LABEL: Record<WhatIf, string> = {
  explQty: 'Quantity (ExplQty)', prio: 'Rate priority order', donorPlant: 'Donor plant', stdFrt: 'Actual vs standard freight',
  inclFrt: 'With / without freight', lookback: 'Rate look-back days', asofDate: 'As-of date', plants: 'Different plants',
  maxLevel: 'BOM level limit', budgetYr: 'Budget year',
};

const leafTotal = (r: ScenarioResult) => sum(r.rows.filter(isLeafRow).map((x) => D(x.TotCostInr)));

/** SAP-side what-if: copy the base query with ONE parameter changed. */
function applyWhatIf(q: CostQuery, p: WhatIf, v: string | boolean | string[]): { query: CostQuery; note: string } {
  const n = { ...q };
  let note = '';
  switch (p) {
    case 'explQty': n.explQty = String(v); note = `ExplQty ${q.explQty} → ${v}`; break;
    case 'prio': n.prio = v as CostQuery['prio']; note = `Priority ${(v as string[]).join('>')}`; break;
    case 'donorPlant': n.donorPlant = String(v); note = `Donor plant ${q.donorPlant || '—'} → ${v || '—'}`; break;
    case 'stdFrt': n.stdFrt = !!v; note = v ? 'Standard freight' : 'Actual freight'; break;
    case 'inclFrt': n.inclFrt = !!v; note = v ? 'With freight' : 'Without freight'; break;
    case 'lookback': n.lookback = Number(v); note = `Look-back ${q.lookback} → ${v} days`; break;
    case 'asofDate': n.useAsof = !!v; n.asofDate = String(v); note = `As of ${v}`; break;
    case 'plants':
      if (q.mode === 'C') n.compPlants = v as string[];
      else n.plants = v as string[];
      note = `Plants ${(v as string[]).join(', ')}`;
      break;
    case 'maxLevel': n.maxLevel = Number(v); note = `Max level ${Number(v) || 'all'}`; break;
    case 'budgetYr': n.inclBudget = true; n.budgetYr = Number(v); note = `Budget year ${v}`; break;
  }
  return { query: n, note };
}

export default function Scenarios({
  store, workspace, onLoad, plants, groupCurr, autoRun, onAutoRunDone,
}: {
  store: ReturnType<typeof useScenarios>; workspace: { query: CostQuery; sim: SimSettings; result: ScenarioResult | null }; onLoad: (s: Scenario, r: ScenarioResult | null) => void;
  plants: PlantRow[]; groupCurr: string; autoRun: string[]; onAutoRunDone: () => void;
}) {
  const { list, add, update, remove, setBaseline, save } = store;
  const [results, setResults] = useState<Record<string, ScenarioResult | undefined>>({});
  const [running, setRunning] = useState<{ id: string; started: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const ctl = useRef<AbortController | null>(null);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [withSim, setWithSim] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, ScenarioResult | undefined> = {};
      for (const s of list) out[s.id] = await scenarioResults.get(s.id);
      if (alive) setResults(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map((s) => s.id).join(',')]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const runOne = useCallback(async (s: Scenario) => {
    const c = new AbortController();
    ctl.current = c;
    setRunning({ id: s.id, started: Date.now() });
    setErrors((e) => ({ ...e, [s.id]: '' }));
    try {
      const r = await api.cost(s.query, c.signal);
      const res: ScenarioResult = { ...r, at: Date.now() };
      await scenarioResults.set(s.id, res);
      setResults((x) => ({ ...x, [s.id]: res }));
      update(s.id, { lastRun: { at: res.at, ms: r.ms, rows: r.rows.length, totalInr: leafTotal(res).toFixed(2) } });
      return true;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErrors((x) => ({ ...x, [s.id]: (e as Error).message }));
      return false;
    } finally {
      setRunning(null);
      ctl.current = null;
    }
  }, [update]);

  // Scenarios created elsewhere (Simulator "Verify in SAP") are run here one after another.
  useEffect(() => {
    if (!autoRun.length || running) return;
    const ids = autoRun;
    onAutoRunDone();
    (async () => {
      for (const id of ids) {
        const sc = store.list.find((x) => x.id === id);
        if (!sc || !(await runOne(sc))) break;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  const runAll = async () => {
    for (const s of list) {
      if (ctl.current?.signal.aborted) break;
      const ok = await runOne(s);
      if (!ok && !errors[s.id]) break; // cancelled
    }
  };

  const saveWorkspace = async () => {
    const s = add({ name: `Scenario ${list.length + 1}`, query: workspace.query, sim: workspace.sim });
    if (s && workspace.result) {
      await scenarioResults.set(s.id, workspace.result);
      setResults((x) => ({ ...x, [s.id]: workspace.result! }));
      update(s.id, { lastRun: { at: workspace.result.at, ms: workspace.result.ms, rows: workspace.result.rows.length, totalInr: leafTotal(workspace.result).toFixed(2) } });
    }
  };

  const baseline = list.find((s) => s.baseline) ?? list[0];
  const valsFor = useCallback(
    (s: Scenario) => {
      const r = results[s.id];
      if (!r) return null;
      return { rows: r.rows, vals: withSim && !isIdentity(s.sim) ? simulate(r.rows, s.sim) : r.rows.map(baseSimRow) };
    },
    [results, withSim],
  );
  const totals = useMemo(() => {
    const o: Record<string, ReturnType<typeof D> | null> = {};
    for (const s of list) {
      const v = valsFor(s);
      o[s.id] = v ? v.rows.reduce((a, r, i) => (isLeafRow(r) ? a.plus(v.vals[i].total) : a), ZERO) : null;
    }
    return o;
  }, [list, valsFor]);

  const others = list.filter((s) => s.id !== baseline?.id && results[s.id]);
  const target = others.find((s) => s.id === focusId) ?? others[0];
  const diff = useMemo(() => {
    if (!baseline || !target) return null;
    const a = valsFor(baseline);
    const b = valsFor(target);
    return a && b ? diffScenarios(a, b) : null;
  }, [baseline, target, valsFor]);

  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="scroll-thin h-full space-y-3 overflow-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={list.length >= MAX_SCENARIOS} onClick={saveWorkspace} title="Save the current query, its result and the client what-ifs">Save current as scenario</Button>
        <Button disabled={list.length >= MAX_SCENARIOS || !list.length} onClick={() => setWhatIfOpen(true)}>New SAP what-if…</Button>
        <Button disabled={!list.length || !!running} onClick={runAll}>Run all in SAP</Button>
        {running && <Button variant="danger" onClick={() => ctl.current?.abort()}>Cancel ({fmtMs(now - running.started)})</Button>}
        <span className="mx-1 h-4 w-px bg-line" />
        <Button size="sm" disabled={!list.length} onClick={() => { const b = new Blob([exportScenarios(list)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'bom-cost-scenarios.json'; a.click(); }}>Export JSON</Button>
        <Button size="sm" onClick={() => fileRef.current?.click()}>Import JSON</Button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const imported = importScenarios(await f.text());
            save((prev) => [...prev, ...imported].slice(0, MAX_SCENARIOS).map((s, i, arr) => ({ ...s, baseline: arr.some((x) => x.baseline) ? s.baseline && arr.findIndex((x) => x.baseline) === i : i === 0 })));
          } catch (err) {
            alert((err as Error).message);
          }
          e.target.value = '';
        }} />
        <span className="ml-auto text-2xs text-faint">{list.length}/{MAX_SCENARIOS} scenarios · definitions in this browser, results cached locally</span>
      </div>

      {list.length === 0 ? (
        <Empty title="No scenarios yet" icon="⇄">Run a query, adjust what-ifs, then <strong>Save current as scenario</strong>. Make a second one by changing ONE parameter (SAP what-if) and compare them here.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          {list.map((s) => {
            const t = totals[s.id];
            const bt = baseline ? totals[baseline.id] : null;
            const d = t && bt && s.id !== baseline?.id ? t.minus(bt) : null;
            return (
              <div key={s.id} className={cx('flex flex-col rounded-lg border bg-panel p-3', s.baseline ? 'border-accent' : 'border-line')}>
                <div className="flex items-start gap-1">
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline" onClick={() => setRename({ id: s.id, name: s.name })} title="Rename">{s.name}</button>
                  {s.baseline ? <Pill tone="accent">baseline</Pill> : <button type="button" className="text-2xs text-faint hover:text-accent" onClick={() => setBaseline(s.id)}>set baseline</button>}
                </div>
                <div className="mt-0.5 text-2xs text-muted">{s.query.mode} {MODE_LABEL[s.query.mode]} · {s.query.materials.length} mat · {(s.query.mode === 'C' ? s.query.compPlants : s.query.plants).join(', ')} · qty {s.query.explQty}</div>
                {s.note && <div className="mt-0.5 text-2xs text-accent">{s.note}</div>}
                {!isIdentity(s.sim) && <div className="mt-0.5 flex items-center gap-1 text-2xs text-sim"><SimTag /> client what-ifs ({Object.keys(s.sim.overrides).length} overrides)</div>}
                <div className="num mt-2 text-lg font-semibold">
                  {t ? <span className={cx(withSim && !isIdentity(s.sim) && 'sim-val')}>{fmtNum(t, 2)}</span> : <span className="text-sm font-normal text-faint">not run</span>} {t && <span className="text-2xs font-normal text-faint">{groupCurr}</span>}
                </div>
                {d && <div className={cx('num text-xs', d.gt(0) ? 'text-bad' : d.lt(0) ? 'text-good' : 'text-muted')}>{fmtSigned(d)} ({fmtPct(bt && !bt.isZero() ? d.div(bt).times(100) : null)}) vs baseline</div>}
                {s.lastRun && <div className="text-2xs text-faint">run {new Date(s.lastRun.at).toLocaleString('en-IN')} · {fmtMs(s.lastRun.ms)}</div>}
                {errors[s.id] && <p className="mt-1 text-2xs text-bad" role="alert">{errors[s.id]}</p>}
                {running?.id === s.id && <div className="mt-1 h-1 overflow-hidden rounded bg-sunken"><div className="indeterminate h-full w-1/3 bg-accent" /></div>}
                <div className="mt-auto flex flex-wrap gap-1 pt-2">
                  <Button size="sm" disabled={!!running} onClick={() => runOne(s)}>Run</Button>
                  <Button size="sm" onClick={() => onLoad(s, results[s.id] ?? null)} title="Open in the workspace to view or edit">Open</Button>
                  <Button size="sm" disabled={list.length >= MAX_SCENARIOS} onClick={async () => { const c = add({ name: `${s.name} (copy)`, query: s.query, sim: s.sim, note: s.note }); const r = results[s.id]; if (c && r) { await scenarioResults.set(c.id, r); setResults((x) => ({ ...x, [c.id]: r })); } }}>Duplicate</Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Delete "${s.name}"?`) && remove(s.id)} aria-label={`Delete ${s.name}`}>Delete</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {baseline && others.length > 0 && diff && target && (
        <Card
          title={<span>Compare <strong>{target.name}</strong> vs baseline <strong>{baseline.name}</strong></span>}
          actions={
            <>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={withSim} onChange={(e) => setWithSim(e.target.checked)} /> include client what-ifs</label>
              <select className={cx(inputBase, 'h-7 w-auto text-xs')} value={target.id} onChange={(e) => setFocusId(e.target.value)} aria-label="Scenario to compare">
                {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <div>
              <table className="mb-3 w-full text-sm">
                <thead className="text-2xs uppercase tracking-wide text-faint"><tr><th className="text-left font-medium">Scenario</th><th className="text-right font-medium">Total {groupCurr}</th><th className="text-right font-medium">Δ vs baseline</th><th className="text-right font-medium">Δ %</th></tr></thead>
                <tbody>
                  {list.filter((s) => totals[s.id]).map((s) => {
                    const t = totals[s.id]!;
                    const b = totals[baseline.id]!;
                    const d = t.minus(b);
                    return (
                      <tr key={s.id} className="border-t border-line/60">
                        <td className="py-1">{s.name} {s.baseline && <Pill tone="accent">baseline</Pill>}</td>
                        <td className="num text-right">{fmtNum(t, 2)}</td>
                        <td className={cx('num text-right', d.gt(0) ? 'text-bad' : d.lt(0) ? 'text-good' : '')}>{s.baseline ? '—' : fmtSigned(d)}</td>
                        <td className="num text-right">{s.baseline ? '—' : fmtPct(b.isZero() ? null : d.div(b).times(100))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">What explains the difference</h4>
              <Waterfall
                data={[
                  { label: 'Baseline', value: Number(diff.base.toFixed(2)), kind: 'total' },
                  ...diff.waterfall.filter((w) => !w.value.abs().lt(0.005)).map((w) => ({ label: w.label, value: Number(w.value.toFixed(2)), kind: 'step' as const })),
                  { label: target.name.slice(0, 14), value: Number(diff.other.toFixed(2)), kind: 'total' },
                ]}
              />
              <p className="text-2xs text-faint">Effects are computed per plant × header × component and add up exactly to the delta. The axis starts near the smaller total. Red = cost up, blue = cost down.</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
                {diff.waterfall.map((w) => (
                  <li key={w.label} className="flex justify-between border-t border-line/60 py-0.5"><span>{w.label}</span><span className={cx('num', w.value.gt(0) ? 'text-bad' : w.value.lt(0) ? 'text-good' : 'text-faint')}>{fmtSigned(w.value)}</span></li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <div>
                <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Per header</h4>
                <div className="scroll-thin max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {diff.byHeader.map((h) => (
                        <tr key={h.head} className="border-t border-line/60">
                          <td className="py-1 font-mono">{h.head}</td>
                          <td className="num text-right">{fmtNum(h.base, 2)}</td>
                          <td className="num text-right">{fmtNum(h.other, 2)}</td>
                          <td className={cx('num text-right', h.delta.gt(0) ? 'text-bad' : h.delta.lt(0) ? 'text-good' : 'text-faint')}>{fmtSigned(h.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Components whose cost changed most</h4>
                <div className="scroll-thin max-h-80 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-panel text-faint"><tr><th className="text-left font-medium">Plant</th><th className="text-left font-medium">Component</th><th className="text-right font-medium">Baseline</th><th className="text-right font-medium">Scenario</th><th className="text-right font-medium">Δ</th><th className="text-right font-medium">Δ %</th></tr></thead>
                    <tbody>
                      {diff.byComponent.slice(0, 100).map((c) => (
                        <tr key={c.key} className="border-t border-line/60">
                          <td className="py-1 font-mono">{c.plant}</td>
                          <td className="max-w-[220px] truncate" title={`${c.head} › ${c.label}`}>{c.label}</td>
                          <td className="num text-right">{fmtNum(c.base, 2)}</td>
                          <td className="num text-right">{fmtNum(c.other, 2)}</td>
                          <td className={cx('num text-right', c.delta.gt(0) ? 'text-bad' : 'text-good')}>{fmtSigned(c.delta)}</td>
                          <td className="num text-right">{fmtPct(c.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
      {list.length >= 2 && others.length === 0 && <p className="text-sm text-muted">Run the scenarios to compare them.</p>}

      <WhatIfModal
        open={whatIfOpen}
        onClose={() => setWhatIfOpen(false)}
        list={list}
        plants={plants}
        onCreate={async (baseId, p, v) => {
          const b = list.find((s) => s.id === baseId)!;
          const { query, note } = applyWhatIf(b.query, p, v);
          const parsed = costQuerySchema.safeParse(query);
          if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Invalid query';
          const s = add({ name: `${b.name}: ${WHAT_IF_LABEL[p]}`.slice(0, 60), query: parsed.data, sim: b.sim, note });
          setWhatIfOpen(false);
          if (s) void runOne(s);
          return null;
        }}
      />
      <Modal open={!!rename} onClose={() => setRename(null)} title="Rename scenario" footer={<><Button onClick={() => setRename(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (rename) update(rename.id, { name: rename.name.trim().slice(0, 60) || 'Scenario' }); setRename(null); }}>Save</Button></>}>
        <input autoFocus className={inputCls} value={rename?.name ?? ''} onChange={(e) => setRename((r) => (r ? { ...r, name: e.target.value } : r))} aria-label="Scenario name" />
      </Modal>
    </div>
  );
}

function WhatIfModal({ open, onClose, list, plants, onCreate }: { open: boolean; onClose: () => void; list: Scenario[]; plants: PlantRow[]; onCreate: (baseId: string, p: WhatIf, v: string | boolean | string[]) => Promise<string | null> }) {
  const [baseId, setBaseId] = useState('');
  const [p, setP] = useState<WhatIf>('explQty');
  const [val, setVal] = useState<string>('');
  const [bool, setBool] = useState(true);
  const [prio, setPrio] = useState<string[]>([...RATE_SOURCES]);
  const [pl, setPl] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const base = list.find((s) => s.id === baseId) ?? list.find((s) => s.baseline) ?? list[0];
  useEffect(() => {
    if (!open || !base) return;
    setBaseId(base.id);
    setPrio(base.query.prio);
    setPl(base.query.mode === 'C' ? base.query.compPlants : base.query.plants);
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!base) return null;
  const value = p === 'prio' ? prio : p === 'plants' ? pl : p === 'stdFrt' || p === 'inclFrt' ? bool : val;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New SAP what-if (one parameter changed)"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={async () => setErr((await onCreate(base.id, p, value)) ?? '')}>Create & run in SAP</Button></>}
    >
      <div className="space-y-3 text-sm">
        <label className="flex flex-col gap-1 text-xs text-muted">Based on
          <select className={inputCls} value={base.id} onChange={(e) => setBaseId(e.target.value)}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">Change
          <select className={inputCls} value={p} onChange={(e) => { setP(e.target.value as WhatIf); setVal(''); }}>
            {(Object.keys(WHAT_IF_LABEL) as WhatIf[]).filter((k) => base.query.mode === 'B' || !['maxLevel', 'budgetYr'].includes(k)).map((k) => <option key={k} value={k}>{WHAT_IF_LABEL[k]}</option>)}
          </select>
        </label>
        {p === 'prio' && <PriorityList value={prio} onChange={setPrio} all={RATE_SOURCES} />}
        {p === 'plants' && (
          <div className="flex flex-wrap gap-1">
            {plants.map((x) => (
              <label key={x.Werks} className={cx('cursor-pointer rounded border px-2 py-0.5 text-xs', pl.includes(x.Werks) ? 'border-accent bg-accent/10' : 'border-line')}>
                <input type="checkbox" className="sr-only" checked={pl.includes(x.Werks)} onChange={(e) => setPl(e.target.checked ? [...pl, x.Werks] : pl.filter((y) => y !== x.Werks))} />
                {x.Werks} {x.Name1}
              </label>
            ))}
          </div>
        )}
        {(p === 'stdFrt' || p === 'inclFrt') && (
          <div className="flex gap-2">
            <Button variant={bool ? 'primary' : 'secondary'} onClick={() => setBool(true)}>{p === 'stdFrt' ? 'Standard freight' : 'With freight'}</Button>
            <Button variant={!bool ? 'primary' : 'secondary'} onClick={() => setBool(false)}>{p === 'stdFrt' ? 'Actual freight' : 'Without freight'}</Button>
          </div>
        )}
        {p === 'donorPlant' && (
          <select className={inputCls} value={val} onChange={(e) => setVal(e.target.value)} aria-label="Donor plant">
            <option value="">— none —</option>
            {plants.map((x) => <option key={x.Werks} value={x.Werks}>{x.Werks} {x.Name1}</option>)}
          </select>
        )}
        {['explQty', 'lookback', 'maxLevel', 'budgetYr'].includes(p) && (
          <input className={inputCls} inputMode="decimal" aria-label="New value" placeholder={String(base.query[p as keyof CostQuery] ?? '')} value={val} onChange={(e) => setVal(e.target.value)} />
        )}
        {p === 'asofDate' && <input type="date" className={inputCls} aria-label="As-of date" value={val} onChange={(e) => setVal(e.target.value)} />}
        {err && <p className="text-xs text-bad" role="alert">{err}</p>}
        <p className="text-2xs text-faint">The new scenario keeps every other parameter (and the base's client what-ifs) and is run in SAP straight away.</p>
      </div>
    </Modal>
  );
}

export { EMPTY_SIM };
