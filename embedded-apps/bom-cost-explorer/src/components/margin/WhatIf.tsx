'use client';
/**
 * What-if (CogmSimSet): the board selection plus a new MRP or selling price, a COGM change and a target; SAP returns before / after, the change of the
 * amount remaining after manufacturing cost, the annual change in INR and the prices that reach the target. Nothing loads before Run; no time limit; Stop ends.
 */
import { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import MarginFrame, { usePlantsState } from './MarginFrame';
import MarginSelection, { useMarginSel } from './MarginSelection';
import WhatIfTable from './whatif/WhatIfTable';
import WacMessages from '../wac/WacMessages';
import { Button, Empty, Field, Spinner, cx, inputCls } from '../ui';
import { fmtMs } from '@/lib/format';
import { useElapsed, useMarginRun } from '@/lib/margin/run';
import { liveSelectionErrors, toMarginQuery } from '@/lib/margin/selection';
import { SCENARIOS, SCENARIO_LABEL, type Scenario } from '@/lib/margin/types';
import { EMPTY_WHATIF, hasErrors, validateWhatIf, whatIfQuery, type WhatIfInputs } from '@/lib/margin/whatifView';
import { downloadWhatIf } from '@/lib/margin/whatifExport';
import { buildMarginFilter } from '@/lib/margin/filter';
import { loadSapConfig } from '@/lib/sap/config';

function Num({ id, label, hint, error, value, onChange, unit }: { id?: string; label: string; hint?: string; error?: string; value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(fid) => <div className="flex items-center gap-1"><input id={id ?? fid} inputMode="decimal" className={cx(inputCls, 'w-32')} value={value} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />{unit && <span className="text-xs text-muted">{unit}</span>}</div>}
    </Field>
  );
}

function Screen({ email }: { email: string }) {
  const { state: plantsState } = usePlantsState(true);
  const [sel, onChange] = useMarginSel();
  const [inp, setInp] = useState<WhatIfInputs>(EMPTY_WHATIF);
  const patch = (p: Partial<WhatIfInputs>) => setInp((i) => ({ ...i, ...p }));
  const [errors, setErrors] = useState<Partial<Record<'materials' | 'plants' | 'areas' | 'other', string>>>({});
  const [inErr, setInErr] = useState<ReturnType<typeof validateWhatIf>>({});
  const [runAt, setRunAt] = useState<Date | null>(null);
  const { state, run, stop, resume, refresh } = useMarginRun('SIM');
  const elapsed = useElapsed(state.running);
  const system = useMemo(() => { if (typeof window === 'undefined') return ''; const c = loadSapConfig(); return c.ok ? c.config.system : ''; }, []);

  const start = () => {
    const e: typeof errors = {};
    if (!sel.materials.length) e.materials = 'Pick at least one finished good.';
    if (liveSelectionErrors(sel).plants) e.plants = liveSelectionErrors(sel).plants;
    if (sel.priceSrc === 'O' && !sel.vkorg.length) e.areas = 'Pick at least one sales organisation (load the sales areas first).';
    const ie = validateWhatIf(inp);
    setErrors(e); setInErr(ie);
    if (Object.keys(e).length || hasErrors(ie)) return;
    const q = whatIfQuery(toMarginQuery(sel), inp);
    try { buildMarginFilter(q, 'SIM'); } catch (err) { setErrors({ other: (err as Error).message }); return; }
    setRunAt(new Date());
    run(q);
  };

  const rows = state.rows;
  const doExport = async () => {
    if (!state.q || !rows.length) return;
    const q = state.q;
    await downloadWhatIf(rows, [
      ['Report', 'What-if: before and after, as SAP computed them (amounts per selling unit, price currency)'], ['SAP system', system], ['Run at', runAt?.toLocaleString('en-IN') ?? ''],
      ['Finished goods', (q.materials ?? []).join(', ')], ['Plants', (q.plants ?? []).join(', ') || 'all'], ['Price source', 'latest sales order'], ['Data', (q.source ?? 'L') === 'L' ? 'live' : 'snapshot'],
      ['Base scenario', SCENARIO_LABEL[(q.scenario ?? 'STD') as Scenario]], ['New MRP', q.newMrp ?? ''], ['New selling price', q.newSp ?? ''], ['COGM change %', q.cogmDpct ?? ''], ['COGM change amount', q.cogmDabs ?? ''],
      ['Target ratio %', q.tgtRatio ?? ''], ['Target remaining amount', q.tgtRemain ?? ''], ['Annual change', 'positive = loss, negative = saving (INR)'], ['Rows', String(rows.length)],
    ]);
  };

  const extra = (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-3">
      <legend className="px-1 text-2xs font-bold uppercase tracking-wide text-muted">What if ...</legend>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <Num label="New MRP" hint="Or a new selling price, not both." error={inErr.newMrp} value={inp.newMrp} onChange={(v) => patch({ newMrp: v })} unit="price currency" />
        <Num label="New selling price" error={inErr.newSp} value={inp.newSp} onChange={(v) => patch({ newSp: v })} unit="price currency" />
        <Num label="COGM change" hint="In percent ..." error={inErr.cogmDpct} value={inp.cogmDpct} onChange={(v) => patch({ cogmDpct: v })} unit="%" />
        <Num label="COGM change" hint="... and / or an amount." error={inErr.cogmDabs} value={inp.cogmDabs} onChange={(v) => patch({ cogmDabs: v })} unit="per selling unit" />
        <Field label="Base scenario" hint="The cost the change starts from.">
          {(id) => <select id={id} className={cx(inputCls, 'w-40')} value={inp.scenario} onChange={(e) => patch({ scenario: e.target.value as Scenario })}>{SCENARIOS.map((s) => <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>)}</select>}
        </Field>
      </div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <Num label="Target ratio" hint="COGM as % of the selling price." error={inErr.tgtRatio} value={inp.tgtRatio} onChange={(v) => patch({ tgtRatio: v })} unit="%" />
        <Num label="Target remaining amount" hint="Amount remaining after manufacturing cost." error={inErr.tgtRemain} value={inp.tgtRemain} onChange={(v) => patch({ tgtRemain: v })} unit="per selling unit" />
      </div>
      {inErr.general && <p role="alert" className="text-xs text-bad">{inErr.general}</p>}
    </fieldset>
  );

  return (
    <>
      <MarginSelection sel={sel} onChange={onChange} plantsState={plantsState} email={email} errors={errors} extra={extra} onRun={start} onStop={stop} onRefresh={refresh} running={state.running} elapsed={elapsed} canRefresh={!!state.q} runLabel="Run what-if" />
      {state.q && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-live="polite">
          {state.running && <Spinner className="h-3.5 w-3.5" />}
          <span>{state.total > 1 ? <>Batch <b>{Math.min(state.doneCount + (state.running ? 1 : 0), state.total)} of {state.total}</b> (25 finished goods each)</> : state.running ? 'Reading from SAP…' : state.doneCount ? 'Done' : '—'}</span>
          {state.running && <span>{fmtMs(elapsed)} (live costing: about 10-15 s per 25 finished goods)</span>}
          {state.total > 1 && <progress className="h-1.5 w-40" max={state.total} value={state.doneCount} aria-label="Batches done" />}
          <span>{rows.length} row{rows.length === 1 ? '' : 's'}</span>
        </p>
      )}
      {state.stopped && !state.running && <p className="flex items-center gap-2 text-sm text-muted">The run was stopped; what was loaded is shown. <Button size="sm" onClick={resume}>Continue the remaining batches</Button></p>}
      {state.error && !state.running && <Button size="sm" onClick={resume}>Try the failed batch again</Button>}
      <WacMessages messages={state.messages} error={state.error} />
      {rows.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void doExport()} title="Excel: one sheet and the parameters"><FileSpreadsheet size={14} /> Excel</Button>
            <span className="text-xs text-faint">Amounts per selling unit in the price currency, as SAP computed them. Annual change in INR: positive = loss, negative = saving.</span>
          </div>
          <WhatIfTable rows={rows} />
        </>
      )}
      {state.q && !state.running && !state.error && !state.stopped && state.doneCount === state.total && rows.length === 0 && <Empty title="SAP returned no rows">Check the SAP messages above, or try other finished goods, plants or prices.</Empty>}
      {!state.q && <Empty title="Nothing loaded yet">Pick the finished goods and plants, give the new price or cost change or a target, then press Run what-if.</Empty>}
    </>
  );
}

export default function WhatIf() {
  return (
    <MarginFrame active="margin-whatif" title="What-if" subtitle="A new price or a change of cost, before and after: the amount remaining after manufacturing cost, the annual change in INR and the price that reaches your target. SAP computes every figure.">
      {(c) => <Screen email={c.email} />}
    </MarginFrame>
  );
}
