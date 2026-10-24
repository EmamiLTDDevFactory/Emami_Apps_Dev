'use client';
/**
 * Scenarios tab. A scenario = SAP what-ifs (SAP runs Mode P again with them) + client what-ifs (applied in the
 * browser, marked "simulated"). Compared with the baseline run of the Breakup & cost tab per month, per plan
 * material and per component. Definitions in localStorage "plan:scenarios"; results only in memory.
 */
import { useEffect, useMemo, useState } from 'react';
import { Copy, Play, Plus, Trash2, X } from 'lucide-react';
import { CostError, tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, Field, Segmented, SimTag, Spinner, Stat, cx, inputBase, inputCls } from '../ui';
import { PriorityList } from '../Pickers';
import { fetchPlanCostLines } from '@/lib/plan/client';
import { compare, emptyClientWhatIf, hasSapWhatIf, isClientIdentity, lineKey, loadScenarios, newScenario, saveScenarios, scenarioQuery, type PlanClientWhatIf, type PlanSapWhatIf, type PlanScenario } from '@/lib/plan/scenarios';
import { FISCAL_MONTHS, type PlanCostLine } from '@/lib/plan/fields';
import type { PlanWorkspace } from '@/lib/plan/workspace';
import { DEFAULT_PRIO } from '@/lib/query/schema';
import { isLeafRow } from '@/lib/cost/tree';
import { fmtCompactInr, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { ZERO, pctChange } from '@/lib/cost/decimal';
import { sourceLabel } from '@/lib/rates/sourceLabel';

const SOURCES = ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'];
const numIn = (v: string, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

interface Result { rows: PlanCostLine[]; sapRun: boolean; ms: number; at: number; key: string }

export default function ScenariosTab({ ws }: { ws: PlanWorkspace }) {
  const [list, setList] = useState<PlanScenario[]>([]);
  const [activeId, setActiveId] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const l = loadScenarios(ws.plan);
    setList(l);
    setActiveId(l[0]?.id ?? '');
    setResult(null);
  }, [ws.plan]);
  const persist = (l: PlanScenario[]) => { setList(l); saveScenarios(ws.plan, l); };
  const active = list.find((s) => s.id === activeId) ?? null;
  const update = (p: Partial<PlanScenario>) => active && persist(list.map((s) => (s.id === active.id ? { ...s, ...p, updated: new Date().toISOString() } : s)));
  const setSap = (p: Partial<PlanSapWhatIf>) => active && update({ sap: { ...active.sap, ...p } });
  const setClient = (p: Partial<PlanClientWhatIf>) => active && update({ client: { ...active.client, ...p } });

  const base = ws.cost.rows;
  const baseQuery = ws.cost.ranQuery ?? ws.query;
  const sapKey = active ? JSON.stringify(scenarioQuery(baseQuery, active.sap)) : '';
  const scenRows = active && hasSapWhatIf(active.sap) ? (result?.key === sapKey ? result.rows : null) : base;

  async function runSap() {
    if (!active) return;
    setRunning(true);
    setError('');
    try {
      const r = await fetchPlanCostLines(scenarioQuery(baseQuery, active.sap));
      setResult({ rows: r.rows, sapRun: true, ms: r.ms, at: Date.now(), key: sapKey });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const cmp = useMemo(() => (active && scenRows ? compare(base, scenRows, active.client) : null), [active, scenRows, base]);
  const simulated = active ? !isClientIdentity(active.client) : false;
  const currencies = useMemo(() => [...new Set(base.filter((l) => isLeafRow(l) && l.SelCurr && l.SelCurr !== 'INR').map((l) => l.SelCurr))].sort(), [base]);
  const leaves = useMemo(() => base.filter(isLeafRow), [base]);

  if (ws.cost.status !== 'done' && !base.length) {
    return (
      <Card>
        <Empty title="Run the baseline first" icon="▦">
          Scenarios compare against the SAP run of the Breakup &amp; cost tab.
          <div className="mt-3"><Button variant="primary" disabled={ws.cost.status === 'running'} onClick={() => void ws.runCost()}>{ws.cost.status === 'running' ? <Spinner className="h-3.5 w-3.5" /> : <Play size={14} />} Run baseline in SAP</Button></div>
          {ws.cost.error && <div className="mt-3 text-left"><CostError error={ws.cost.error} /></div>}
        </Empty>
      </Card>
    );
  }

  const totalBase = cmp ? cmp.months.base.reduce((a, v) => a.plus(v), ZERO) : null;
  const totalScen = cmp ? cmp.months.scen.reduce((a, v) => a.plus(v), ZERO) : null;

  return (
    <div className="grid gap-3 xl:grid-cols-[300px_1fr]">
      <Card title="Scenarios" actions={<Button size="sm" onClick={() => { const s = newScenario(`Scenario ${list.length + 1}`); persist([...list, s]); setActiveId(s.id); }}><Plus size={14} /> New</Button>}>
        {!list.length ? <p className="text-sm text-muted">No scenarios for this plan yet.</p> : (
          <ul className="space-y-1">
            {list.map((s) => (
              <li key={s.id} className={cx('flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm', s.id === activeId ? 'bg-accent/10 font-semibold' : 'hover:bg-sunken')}>
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveId(s.id)}>{s.name}</button>
                <Button size="sm" variant="ghost" aria-label="Copy scenario" onClick={() => { const c = { ...structuredClone(s), id: newScenario('').id, name: `${s.name} (copy)` }; persist([...list, c]); setActiveId(c.id); }}><Copy size={12} /></Button>
                <Button size="sm" variant="ghost" aria-label="Delete scenario" onClick={() => { const l = list.filter((x) => x.id !== s.id); persist(l); if (activeId === s.id) setActiveId(l[0]?.id ?? ''); }}><Trash2 size={12} /></Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-2xs text-faint">Saved in this browser (plan:scenarios). Baseline: the last Breakup &amp; cost run{ws.cost.ranQuery?.plants.length ? ` (plants ${ws.cost.ranQuery.plants.join(', ')})` : ''}.</p>
      </Card>

      {!active ? <Card><Empty title="Create a scenario">Press New to start a what-if on this plan.</Empty></Card> : (
        <div className="flex min-w-0 flex-col gap-3">
          <Card title={<input aria-label="Scenario name" className={cx(inputBase, 'h-8 w-72 font-bold')} value={active.name} onChange={(e) => update({ name: e.target.value })} />} actions={<Button size="sm" variant="ghost" onClick={() => update({ sap: {}, client: emptyClientWhatIf() })}><X size={13} /> Reset</Button>}>
            <div className="grid gap-4 lg:grid-cols-2">
              <section>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">SAP what-ifs <span className="font-normal normal-case">(SAP runs again)</span></h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-bold text-muted">Fallback</p>
                    <Segmented<string> size="sm" label="Fallback" value={active.sap.fallback === undefined ? '' : active.sap.fallback ? 'on' : 'off'} onChange={(v) => setSap({ fallback: v === '' ? undefined : v === 'on' })} options={[{ value: '', label: 'As plan' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-bold text-muted">Material types</p>
                    <Segmented<string> size="sm" label="Material types" value={active.sap.mtartFilter ?? ''} onChange={(v) => setSap({ mtartFilter: (v || undefined) as PlanSapWhatIf['mtartFilter'] })} options={[{ value: '', label: 'As plan' }, { value: 'A', label: 'All' }, { value: 'P', label: 'Pack' }, { value: 'R', label: 'RM+WIP' }]} />
                  </div>
                  <Field label="Donor plant" hint="Take rates from this plant">{(id) => <input id={id} className={inputCls} maxLength={4} value={active.sap.donorPlant ?? ''} onChange={(e) => setSap({ donorPlant: e.target.value.toUpperCase() || undefined })} />}</Field>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-muted"><input type="checkbox" checked={!!active.sap.prio} onChange={(e) => setSap({ prio: e.target.checked ? DEFAULT_PRIO.join(',') : undefined })} /> Own rate priority</label>
                    {active.sap.prio && <div className="mt-1"><PriorityList value={active.sap.prio.split(',')} onChange={(v) => setSap({ prio: v.join(',') })} all={DEFAULT_PRIO} /></div>}
                  </div>
                </div>
                {hasSapWhatIf(active.sap) && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="primary" size="sm" disabled={running} onClick={() => void runSap()}>{running ? <Spinner className="h-3.5 w-3.5" /> : <Play size={13} />} Run scenario in SAP</Button>
                    {result?.key === sapKey ? <span className="text-2xs text-good">SAP result current</span> : <span className="text-2xs text-warn">SAP what-ifs changed: run again</span>}
                  </div>
                )}
                {error && <div className="mt-2"><CostError error={error} /></div>}
              </section>

              <section>
                <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">Client what-ifs <SimTag /></h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Quantity × (all months)">{(id) => <input id={id} type="number" step="0.05" min="0" className={inputCls} value={active.client.overallMult} onChange={(e) => setClient({ overallMult: numIn(e.target.value, 1) })} />}</Field>
                  <Field label="Freight %">{(id) => <input id={id} type="number" className={inputCls} value={active.client.frtPct} onChange={(e) => setClient({ frtPct: numIn(e.target.value) })} />}</Field>
                </div>
                <p className="mb-1 mt-3 text-xs font-bold text-muted">Quantity × per month</p>
                <div className="grid grid-cols-6 gap-1">
                  {FISCAL_MONTHS.map((m, i) => (
                    <label key={m} className="text-2xs text-muted">{m}
                      <input type="number" step="0.05" min="0" className={cx(inputBase, 'h-7 w-full px-1 text-right text-xs', active.client.monthMult[i] !== 1 && 'border-sim')} value={active.client.monthMult[i]} onChange={(e) => { const mm = [...active.client.monthMult]; mm[i] = numIn(e.target.value, 1); setClient({ monthMult: mm }); }} />
                    </label>
                  ))}
                </div>
                <p className="mb-1 mt-3 text-xs font-bold text-muted">Rate % by source</p>
                <div className="grid grid-cols-5 gap-1">
                  {SOURCES.map((s) => (
                    <label key={s} className="text-2xs text-muted">{sourceLabel(s)}
                      <input type="number" className={cx(inputBase, 'h-7 w-full px-1 text-right text-xs')} value={active.client.srcPct[s] ?? 0} onChange={(e) => setClient({ srcPct: { ...active.client.srcPct, [s]: numIn(e.target.value) } })} />
                    </label>
                  ))}
                </div>
                {currencies.length > 0 && (
                  <>
                    <p className="mb-1 mt-3 text-xs font-bold text-muted">FX shock % (purchase currency)</p>
                    <div className="grid grid-cols-5 gap-1">
                      {currencies.map((c) => (
                        <label key={c} className="text-2xs text-muted">{c}
                          <input type="number" className={cx(inputBase, 'h-7 w-full px-1 text-right text-xs')} value={active.client.fxPct[c] ?? 0} onChange={(e) => setClient({ fxPct: { ...active.client.fxPct, [c]: numIn(e.target.value) } })} />
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section>
                <div className="mb-1 flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Shift quantity between months</h4>
                  <Button size="sm" variant="ghost" onClick={() => setClient({ shifts: [...active.client.shifts, { from: 0, to: 1, pct: 10 }] })}><Plus size={12} /> Add</Button>
                </div>
                {active.client.shifts.map((s, n) => (
                  <div key={n} className="mb-1 flex items-center gap-1.5 text-xs">
                    Move <input type="number" className={cx(inputBase, 'h-7 w-16 px-1 text-right text-xs')} value={s.pct} onChange={(e) => setClient({ shifts: active.client.shifts.map((x, i) => (i === n ? { ...x, pct: numIn(e.target.value) } : x)) })} /> % of
                    <select className={cx(inputBase, 'h-7 px-1 text-xs')} value={s.from} onChange={(e) => setClient({ shifts: active.client.shifts.map((x, i) => (i === n ? { ...x, from: Number(e.target.value) } : x)) })}>{FISCAL_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
                    to
                    <select className={cx(inputBase, 'h-7 px-1 text-xs')} value={s.to} onChange={(e) => setClient({ shifts: active.client.shifts.map((x, i) => (i === n ? { ...x, to: Number(e.target.value) } : x)) })}>{FISCAL_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
                    <Button size="sm" variant="ghost" aria-label="Remove shift" onClick={() => setClient({ shifts: active.client.shifts.filter((_, i) => i !== n) })}><X size={12} /></Button>
                  </div>
                ))}
              </section>
              <RateOverrides leaves={leaves} value={active.client.rateOverride} onChange={(rateOverride) => setClient({ rateOverride })} />
            </div>
          </Card>

          {!scenRows ? (
            <Card><Empty title="SAP what-ifs not run yet">Press <b>Run scenario in SAP</b>; the client what-ifs are applied on top of that result.</Empty></Card>
          ) : cmp && totalBase && totalScen ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Baseline (SAP)" value={fmtCompactInr(Number(totalBase.toFixed(2)))} sub={`${fmtNum(totalBase, 2)} INR`} />
                <Stat label="Scenario" sim={simulated} value={fmtCompactInr(Number(totalScen.toFixed(2)))} sub={`${fmtNum(totalScen, 2)} INR${hasSapWhatIf(active.sap) ? ' · SAP re-run' : ''}`} />
                <Stat label="Difference" value={fmtSigned(totalScen.minus(totalBase), 0)} sub={fmtPct(pctChange(totalBase, totalScen))} tone={totalScen.gt(totalBase) ? 'bad' : totalScen.lt(totalBase) ? 'good' : undefined} sim={simulated} />
              </div>
              <Card title={<span className="flex items-center gap-2">Per month (INR) {simulated && <SimTag />}</span>} bodyClass="p-0">
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr><th className={thCls} />{FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}</tr></thead>
                    <tbody>
                      <tr className="border-t border-line/60"><td className={tdCls}>Baseline (SAP)</td>{cmp.months.base.map((v, i) => <td key={i} className={tdNum}>{fmtCompactInr(Number(v.toFixed(2)))}</td>)}</tr>
                      <tr className="border-t border-line/60"><td className={tdCls}>Scenario</td>{cmp.months.scen.map((v, i) => <td key={i} className={cx(tdNum, simulated && 'sim-val')}>{fmtCompactInr(Number(v.toFixed(2)))}</td>)}</tr>
                      <tr className="border-t border-line/60 font-semibold"><td className={tdCls}>Difference</td>{cmp.months.scen.map((v, i) => { const d = v.minus(cmp.months.base[i]); return <td key={i} className={cx(tdNum, d.gt(0) && 'text-bad', d.lt(0) && 'text-good')}>{d.isZero() ? '—' : fmtSigned(d, 0)}</td>; })}</tr>
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="grid gap-3 2xl:grid-cols-2">
                <CompareTable title="Per plan material" rows={cmp.headers} simulated={simulated} />
                <CompareTable title="Per component (top 100 by change)" rows={cmp.components.slice(0, 100)} simulated={simulated} />
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CompareTable({ title, rows, simulated }: { title: string; rows: ReturnType<typeof compare>['headers']; simulated: boolean }) {
  return (
    <Card title={title} bodyClass="p-0">
      <div className="scroll-thin max-h-[50vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-panel"><tr><th className={thCls}>Material</th><th className={thNum}>Baseline INR</th><th className={thNum}>Scenario INR</th><th className={thNum}>Difference</th><th className={thNum}>%</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line/50">
                <td className={tdCls}><span className="font-mono font-semibold">{r.label}</span> <span className="text-muted">{r.sub}</span></td>
                <td className={tdNum}>{fmtNum(r.baseTotal, 0)}</td>
                <td className={cx(tdNum, simulated && 'sim-val')}>{fmtNum(r.scenTotal, 0)}</td>
                <td className={cx(tdNum, r.delta.gt(0) && 'text-bad', r.delta.lt(0) && 'text-good')}>{r.delta.isZero() ? '—' : fmtSigned(r.delta, 0)}</td>
                <td className={tdNum}>{r.delta.isZero() ? '' : fmtPct(pctChange(r.baseTotal, r.scenTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RateOverrides({ leaves, value, onChange }: { leaves: PlanCostLine[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [pick, setPick] = useState('');
  const [rate, setRate] = useState('');
  const byKey = useMemo(() => new Map(leaves.map((l) => [lineKey(l), l])), [leaves]);
  return (
    <section>
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Rate override per row (rate/pc INR)</h4>
      <div className="flex items-center gap-1.5">
        <select aria-label="Component row" className={cx(inputBase, 'h-7 min-w-0 flex-1 px-1 text-xs')} value={pick} onChange={(e) => { setPick(e.target.value); const l = byKey.get(e.target.value); if (l) setRate(l.SelRatePcInr); }}>
          <option value="">Choose a component…</option>
          {[...byKey].slice(0, 2000).map(([k, l]) => <option key={k} value={k}>{l.Idnrk} · {l.Hwerks} · {l.Headmat} ({fmtNum(l.SelRatePcInr, 4)})</option>)}
        </select>
        <input aria-label="Rate per piece INR" type="number" className={cx(inputBase, 'h-7 w-24 px-1 text-right text-xs')} value={rate} onChange={(e) => setRate(e.target.value)} />
        <Button size="sm" disabled={!pick || rate === '' || !Number.isFinite(Number(rate))} onClick={() => { onChange({ ...value, [pick]: String(Number(rate)) }); setPick(''); setRate(''); }}>Set</Button>
      </div>
      <ul className="mt-1 space-y-0.5 text-xs">
        {Object.entries(value).map(([k, v]) => {
          const l = byKey.get(k);
          return (
            <li key={k} className="flex items-center gap-2">
              <span className="font-mono">{l?.Idnrk ?? k}</span><span className="text-muted">{l ? `${l.Hwerks} · SAP ${fmtNum(l.SelRatePcInr, 4)}` : ''}</span>
              <span className="num ml-auto font-semibold text-sim">{fmtNum(v, 4)}</span>
              <Button size="sm" variant="ghost" aria-label="Remove override" onClick={() => { const n = { ...value }; delete n[k]; onChange(n); }}><X size={12} /></Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
