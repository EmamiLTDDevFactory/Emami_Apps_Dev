'use client';
/** Small pieces shared by the Production Plan screens. */
import { useState, type ReactNode } from 'react';
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
  return <ErrorNote error={error}>{/at most 30|30 plan rows|too many/i.test(error) && <p className="mt-1 text-xs text-muted">SAP costs at most 30 plan rows per request. Filter by plant or material and run again.</p>}</ErrorNote>;
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

const splitList = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);

/** Filters for the Mode P runs (Breakup, Requirement, Scenarios). */
export function PlanQueryBar({ query, onChange, onRun, onCancel, running, ms, runLabel = 'Run in SAP', extra }: { query: PlanCostQuery; onChange: (q: PlanCostQuery) => void; onRun: (q: PlanCostQuery) => void; onCancel?: () => void; running: boolean; ms?: number; runLabel?: string; extra?: ReactNode }) {
  const [plants, setPlants] = useState(query.plants.join(', '));
  const set = (p: Partial<PlanCostQuery>) => onChange({ ...query, ...p });
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-panel p-3 shadow-card md:grid-cols-[1fr_1.4fr_auto]">
      <Field label="Plants" hint="Empty = every plant of the plan">
        {(id) => <input id={id} className={inputCls} value={plants} placeholder="e.g. 1000, 1100" onChange={(e) => setPlants(e.target.value)} onBlur={() => set({ plants: splitList(plants) })} />}
      </Field>
      <Field label="Materials" hint="Empty = every material of the plan">
        {(id) => <MaterialPicker id={id} values={query.materials} onChange={(v) => set({ materials: v })} max={30} />}
      </Field>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted">Material types</span>
        <Segmented<PlanCostQuery['mtartFilter']> size="sm" label="Material types" value={query.mtartFilter} onChange={(v) => set({ mtartFilter: v })} options={[{ value: 'A', label: 'All' }, { value: 'P', label: 'Packing' }, { value: 'R', label: 'RM + WIP' }]} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-3">
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
          <Button variant="primary" size="sm" disabled={running} onClick={() => { const q = { ...query, plants: splitList(plants) }; onChange(q); onRun(q); }}>
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
