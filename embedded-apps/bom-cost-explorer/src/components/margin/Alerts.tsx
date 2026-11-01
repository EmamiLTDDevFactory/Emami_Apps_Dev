'use client';
/**
 * Alerts (CogmAlertSet): the rules E1..E9 that fired, sorted by impact (largest first). Filter by rule (a SAP filter), plant, hierarchy, brand (in the
 * selection) and severity (on the rows). Scope F = a finished good, scope C = a component and the number of finished goods. A row opens the Board for
 * that material and plant; the Board never runs from the URL. Nothing loads before Run; no time limit; Stop ends.
 */
import { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import MarginFrame, { usePlantsState } from './MarginFrame';
import MarginSelection, { useMarginSel } from './MarginSelection';
import AlertsTable, { SeverityBadge } from './alerts/AlertsTable';
import WacMessages from '../wac/WacMessages';
import { Button, Empty, Spinner, cx } from '../ui';
import { fmtMs } from '@/lib/format';
import { useElapsed, useMarginRun } from '@/lib/margin/run';
import { toMarginQuery } from '@/lib/margin/selection';
import { RULES, SEVERITIES, SEVERITY_WORD, countBySeverity, filterBySeverity, sortByImpact } from '@/lib/margin/alertView';
import { downloadAlerts } from '@/lib/margin/alertExport';
import { buildMarginFilter } from '@/lib/margin/filter';
import type { Severity } from '@/lib/margin/types';
import { loadSapConfig } from '@/lib/sap/config';

function Pills<T extends string>({ label, items, value, onChange, render }: { label: string; items: readonly T[]; value: T[]; onChange: (v: T[]) => void; render?: (i: T) => React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1"><legend className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => {
          const on = value.includes(i);
          return <button key={i} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i])} className={cx('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold', on ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{on && <span aria-hidden>✓</span>}{render ? render(i) : i}</button>;
        })}
      </div>
    </fieldset>
  );
}

function Screen({ email }: { email: string }) {
  const { state: plantsState } = usePlantsState(true);
  const [sel, onChange] = useMarginSel();
  const [rules, setRules] = useState<string[]>([]);
  const [sev, setSev] = useState<Exclude<Severity, ''>[]>([]);
  const [errors, setErrors] = useState<Partial<Record<'materials' | 'plants' | 'areas' | 'other', string>>>({});
  const [runAt, setRunAt] = useState<Date | null>(null);
  const { state, run, stop, resume, refresh } = useMarginRun('ALERT');
  const elapsed = useElapsed(state.running);
  const system = useMemo(() => { if (typeof window === 'undefined') return ''; const c = loadSapConfig(); return c.ok ? c.config.system : ''; }, []);

  const start = () => {
    const e: typeof errors = {};
    if (!sel.materials.length && !sel.plants.length && !sel.prodha.trim() && !sel.brand.trim()) e.other = 'Pick plants, finished goods, a product hierarchy or a brand so SAP knows where to look.';
    if (sel.priceSrc === 'O' && !sel.vkorg.length) e.areas = 'Pick at least one sales organisation (load the sales areas first).';
    setErrors(e);
    if (Object.keys(e).length) return;
    const q = { ...toMarginQuery(sel), rule: rules };
    try { buildMarginFilter(q, 'ALERT'); } catch (err) { setErrors({ other: (err as Error).message }); return; }
    setRunAt(new Date());
    run(q);
  };

  const sorted = useMemo(() => sortByImpact(filterBySeverity(state.rows, sev)), [state.rows, sev]);
  const counts = useMemo(() => countBySeverity(state.rows), [state.rows]);
  const doExport = async () => {
    if (!state.q || !sorted.length) return;
    const q = state.q;
    await downloadAlerts(sorted, [
      ['Report', 'Alerts of the cost simulator, largest impact first (impact in INR per year: positive = loss, negative = saving)'], ['SAP system', system], ['Run at', runAt?.toLocaleString('en-IN') ?? ''],
      ['Plants', (q.plants ?? []).join(', ') || 'all'], ['Finished goods', (q.materials ?? []).join(', ') || 'all'], ['Product hierarchy', q.prodha || 'all'], ['Brand', q.brand || 'all'],
      ['Rules', (q.rule ?? []).join(', ') || 'all'], ['Severity shown', sev.length ? sev.map((s) => SEVERITY_WORD[s]).join(', ') : 'all'], ['Rows', String(sorted.length)],
    ]);
  };

  const extra = (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
      <Pills label="Rules (empty = all)" items={RULES} value={rules as (typeof RULES)[number][]} onChange={(v) => setRules(v)} />
      <Pills label="Severity shown (empty = all)" items={SEVERITIES} value={sev} onChange={setSev} render={(s) => SEVERITY_WORD[s]} />
    </div>
  );

  return (
    <>
      <MarginSelection sel={sel} onChange={onChange} plantsState={plantsState} email={email} errors={errors} extra={extra} onRun={start} onStop={stop} onRefresh={refresh} running={state.running} elapsed={elapsed} canRefresh={!!state.q} runLabel="Show alerts"
        noMaterialsHint="Optional here: leave empty to look at everything in the plants. A live run takes 25 at a time." />
      {state.q && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-live="polite">
          {state.running && <Spinner className="h-3.5 w-3.5" />}
          {state.total > 1 && <span>Batch <b>{Math.min(state.doneCount + (state.running ? 1 : 0), state.total)} of {state.total}</b></span>}
          {state.running && <span>{fmtMs(elapsed)} (live costing: about 10-15 s per 25 finished goods)</span>}
          <span>{sorted.length} alert{sorted.length === 1 ? '' : 's'}{sev.length ? ` shown of ${state.rows.length}` : ''}</span>
          {state.rows.length > 0 && SEVERITIES.map((s) => <span key={s} className="inline-flex items-center gap-1"><SeverityBadge s={s} /> {counts[s]}</span>)}
        </p>
      )}
      {state.stopped && !state.running && <p className="flex items-center gap-2 text-sm text-muted">The run was stopped; what was loaded is shown. <Button size="sm" onClick={resume}>Continue the remaining batches</Button></p>}
      {state.error && !state.running && <Button size="sm" onClick={resume}>Try the failed batch again</Button>}
      <WacMessages messages={state.messages} error={state.error} />
      {sorted.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void doExport()} title="Excel: the alerts as shown and the parameters"><FileSpreadsheet size={14} /> Excel</Button>
            <span className="text-xs text-faint">Sorted by impact, largest first. Impact in INR per year: positive = loss, negative = saving.</span>
          </div>
          <AlertsTable rows={sorted} />
        </>
      )}
      {state.q && !state.running && !state.error && !state.stopped && state.doneCount === state.total && sorted.length === 0 && (
        <Empty title={state.rows.length ? 'No alert with this severity' : 'No alerts'}>{state.rows.length ? 'Clear the severity filter to see all.' : 'SAP found no rule that fired for this selection (see the messages above, if any).'}</Empty>
      )}
      {!state.q && <Empty title="Nothing loaded yet">Pick the plants (and, if you like, finished goods, hierarchy, brand or rules), then press Show alerts.</Empty>}
    </>
  );
}

export default function Alerts() {
  return (
    <MarginFrame active="margin-alerts" title="Alerts" subtitle="Where cost or price moved against the rules E1 to E9, largest annual impact first. A component alert shows how many finished goods it touches. SAP decides what fires.">
      {(c) => <Screen email={c.email} />}
    </MarginFrame>
  );
}
