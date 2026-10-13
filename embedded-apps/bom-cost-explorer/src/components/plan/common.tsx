'use client';
/** Small pieces shared by the Production Plan screens. */
import type { ReactNode } from 'react';
import { AlertTriangle, Lock, Play, Square } from 'lucide-react';
import { Button, Field, Segmented, Spinner, Toggle, cx, inputCls } from '../ui';
import { MaterialPicker } from '../Pickers';
import type { PlanCostQuery } from '@/lib/plan/requests';
import type { PlanWorkspace } from '@/lib/plan/workspace';
import { fmtMs } from '@/lib/format';

export function ErrorNote({ error, children }: { error: string; children?: ReactNode }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/[0.06] px-3 py-2 text-sm">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
      <div className="min-w-0">
        <p className="break-words">{error}</p>
        {children}
      </div>
    </div>
  );
}

/** Errors of a plan cost run get a hint for the SAP 30-row limit. */
export function CostError({ error }: { error: string }) {
  return <ErrorNote error={error}>{isRowLimitError(error) && <p className="mt-1 text-xs text-muted">SAP takes at most 30 plan rows per request. Choose fewer plants above (or filter by material) and run again.</p>}</ErrorNote>;
}

/** SAP's "maximum 30 plan rows per request" answer (never retried automatically). */
export const isRowLimitError = (error: string) => /maximum.*per request|at most 30|30 plan rows|too many/i.test(error);

/** Plant chips of the plan (top of the detail page); toggling updates the URL (?werks=). */
export function PlantChips({ ws }: { ws: Pick<PlanWorkspace, 'plants' | 'setPlants' | 'planPlants' | 'plantsError'> }) {
  const all = ws.planPlants;
  if (all === null) return <div className="flex items-center gap-2 text-xs text-muted"><Spinner className="h-3.5 w-3.5" /> Loading the plants of this plan…</div>;
  const toggle = (w: string) => ws.setPlants(ws.plants.includes(w) ? ws.plants.filter((x) => x !== w) : [...ws.plants, w]);
  const known = new Set(all.map((p) => p.werks));
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Plants">
      <span className="mr-1 text-xs font-bold text-muted">Plants</span>
      {all.map((p) => {
        const on = ws.plants.includes(p.werks);
        return (
          <button key={p.werks} type="button" aria-pressed={on} onClick={() => toggle(p.werks)} title={`${p.rows} material${p.rows === 1 ? '' : 's'}`}
            className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold transition', on ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink hover:border-accent/60')}>
            <span className="font-mono">{p.werks}</span>{p.name && <span className={cx('ml-1 font-normal', on ? 'text-white/85' : 'text-muted')}>{p.name}</span>}
          </button>
        );
      })}
      {ws.plants.filter((w) => !known.has(w)).map((w) => (
        <button key={w} type="button" aria-pressed onClick={() => toggle(w)} className="rounded-full border border-warn bg-warn/10 px-2.5 py-1 text-xs font-semibold" title="Not a plant of this plan">{w} ✕</button>
      ))}
      {all.length > 1 && (ws.plants.length ? <button type="button" className="ml-1 text-xs font-semibold text-accent hover:underline" onClick={() => ws.setPlants([])}>Clear</button>
        : <button type="button" className="ml-1 text-xs font-semibold text-accent hover:underline" onClick={() => ws.setPlants(all.map((p) => p.werks))}>All</button>)}
      {ws.plantsError && <span className="text-xs text-bad" title={ws.plantsError}>Plants could not be read from SAP</span>}
    </div>
  );
}

/** Shown by the heavy tabs instead of calling SAP when the plan has several plants and none is chosen. */
export function SelectPlants({ ws }: { ws: Pick<PlanWorkspace, 'plants' | 'setPlants' | 'planPlants' | 'plantsError'> }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel px-6 py-12 text-center shadow-card">
      <p className="font-semibold">Select one or more plants</p>
      <p className="max-w-md text-sm text-muted">This plan has several plants. Choose the plants to work on; SAP takes at most 30 plan rows per request.</p>
      <PlantChips ws={ws} />
    </div>
  );
}

export function RoleNote({ ws }: { ws: Pick<PlanWorkspace, 'canWrite' | 'role'> }) {
  if (ws.canWrite) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-sunken/60 px-3 py-2 text-xs text-muted">
      <Lock size={13} />
      {ws.role ? `Your Manage Access role for BOM Simulator is "${ws.role}". ` : 'Checking your role… '}
      Uploading and editing plans needs the Planner (or Admin) role. You can still view everything.
    </div>
  );
}


/** Filters for the Mode P runs (Breakup, Requirement, Scenarios). */
export function PlanQueryBar({ query, onChange, onRun, onCancel, running, ms, runLabel = 'Run in SAP', extra }: { query: PlanCostQuery; onChange: (q: PlanCostQuery) => void; onRun: (q: PlanCostQuery) => void; onCancel?: () => void; running: boolean; ms?: number; runLabel?: string; extra?: ReactNode }) {
  const set = (p: Partial<PlanCostQuery>) => onChange({ ...query, ...p });
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-panel p-3 shadow-card md:grid-cols-[1.6fr_auto]">
      <Field label="Materials" hint={`Empty = every material of the plan${query.plants.length ? ` in ${query.plants.join(', ')}` : ''} · plants are chosen at the top of the page`}>
        {(id) => <MaterialPicker id={id} values={query.materials} onChange={(v) => set({ materials: v })} max={30} />}
      </Field>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted">Material types</span>
        <Segmented<PlanCostQuery['mtartFilter']> size="sm" label="Material types" value={query.mtartFilter} onChange={(v) => set({ mtartFilter: v })} options={[{ value: 'A', label: 'All' }, { value: 'P', label: 'Packing' }, { value: 'R', label: 'RM + WIP' }]} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-2">
        <Toggle label="All BOMs" checked={query.allBoms} onChange={(v) => set({ allBoms: v })} />
        <Toggle label="Scrap" checked={query.scrap} onChange={(v) => set({ scrap: v })} />
        <Toggle label="Fallback (BOM of last producing plant)" checked={query.fallback} onChange={(v) => set({ fallback: v })} />
        <label className="flex items-center gap-2 text-sm">
          Base plant
          <input className={cx(inputCls, '!h-8 !w-24')} value={query.basePlant} maxLength={4} onChange={(e) => set({ basePlant: e.target.value.toUpperCase() })} />
        </label>
        {extra}
        <div className="ml-auto flex items-center gap-2">
          {ms ? <span className="text-2xs text-faint">last run {fmtMs(ms)}</span> : null}
          {running && onCancel && <Button size="sm" variant="ghost" onClick={onCancel}><Square size={13} /> Cancel</Button>}
          <Button variant="primary" size="sm" disabled={running} onClick={() => onRun(query)}>
            {running ? <Spinner className="h-3.5 w-3.5" /> : <Play size={13} />} {runLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const thCls = 'whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-faint';
export const thNum = 'whitespace-nowrap px-2 py-1.5 text-right text-[11px] font-bold uppercase tracking-wide text-faint';
export const tdCls = 'whitespace-nowrap px-2 py-1';
export const tdNum = 'num whitespace-nowrap px-2 py-1 text-right';
