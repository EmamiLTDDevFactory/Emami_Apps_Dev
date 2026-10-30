'use client';
import { ChevronDown, ChevronRight, Play, RefreshCw, Square } from 'lucide-react';
import { MaterialHierarchyPicker, MaterialPicker, PlantPicker } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import { Button, Field, Toggle, cx, inputCls } from '../ui';
import { MAX_MATERIALS } from '@/lib/query/schema';
import { PRESET_LABEL, presetRange, type WacPreset } from '@/lib/wac/dates';
import { fmtMs } from '@/lib/format';

export interface WacForm { plants: string[]; preset: WacPreset; from: string; to: string; mat: string[]; prodha: string; cmp: boolean; varPct: string; varHigh: string }

const PRESETS: WacPreset[] = ['lastMonth', 'thisMonth', 'last7', 'last30', 'custom'];

export default function WacFilters({ form, onChange, plantsState, errors, open, onToggle, running, elapsed, onRun, onStop, onRefresh, canRefresh }: {
  form: WacForm; onChange: (p: Partial<WacForm>) => void; plantsState: PlantsState; errors: Partial<Record<'plants' | 'dates' | 'var', string>>;
  open: boolean; onToggle: () => void; running: boolean; elapsed: number; onRun: () => void; onStop: () => void; onRefresh: () => void; canRefresh: boolean;
}) {
  const setPreset = (p: WacPreset) => {
    const r = presetRange(p);
    onChange(r ? { preset: p, from: r.from, to: r.to } : { preset: p });
  };
  return (
    <div className="rounded-2xl border border-line bg-panel shadow-card">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold">
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Selection
        <span className="ml-2 truncate text-xs font-normal text-muted">{form.plants.join(', ') || 'no plant yet'} · {form.from} to {form.to}{form.cmp ? ' · with rate-source comparison' : ''}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Manufacturing units (plants)" hint="Required. Only plants SAP lists for you can be used." error={errors.plants}>
              {(id) => <PlantPicker id={id} values={form.plants} onChange={(plants) => onChange({ plants })} state={plantsState} invalid={!!errors.plants} />}
            </Field>
            <Field label="Period" error={errors.dates} hint="Both dates are required.">
              {(id) => (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Period preset">
                    {PRESETS.map((p) => (
                      <button key={p} type="button" role="radio" aria-checked={form.preset === p} onClick={() => setPreset(p)}
                        className={cx('rounded-full border px-3 py-1 text-xs font-bold', form.preset === p ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{PRESET_LABEL[p]}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input id={id} type="date" aria-label="From date" className={cx(inputCls, 'w-40')} value={form.from} onChange={(e) => onChange({ from: e.target.value, preset: 'custom' })} />
                    <span className="text-xs text-muted">to</span>
                    <input type="date" aria-label="To date" className={cx(inputCls, 'w-40')} value={form.to} onChange={(e) => onChange({ to: e.target.value, preset: 'custom' })} />
                  </div>
                </div>
              )}
            </Field>
            <Field label="Finished goods (optional)" hint={`Leave empty for every finished good produced. Up to ${MAX_MATERIALS} to pick.`}>
              {(id) => (
                <>
                  <MaterialPicker id={id} values={form.mat} onChange={(mat) => onChange({ mat })} max={MAX_MATERIALS} />
                  <MaterialHierarchyPicker values={form.mat} onChange={(mat) => onChange({ mat })} max={MAX_MATERIALS} werks={form.plants} />
                </>
              )}
            </Field>
            <Field label="Product hierarchy (optional)" hint="Prodha code(s), comma separated.">
              {(id) => <input id={id} className={inputCls} placeholder="e.g. 0101160653" value={form.prodha} onChange={(e) => onChange({ prodha: e.target.value })} />}
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1">
              <Toggle checked={form.cmp} onChange={(cmp) => onChange({ cmp })} label="Compare with rate sources" />
              {form.cmp && <p className="max-w-md text-xs text-warn">Live costing: about 10-15 s per 25 finished goods; limited to 25 finished goods.</p>}
            </div>
            {form.cmp && (
              <>
                <Field label="Amber from %" hint="Empty = SAP default (5)." error={errors.var}>
                  {(id) => <input id={id} inputMode="decimal" className={cx(inputCls, 'w-28')} placeholder="5" value={form.varPct} onChange={(e) => onChange({ varPct: e.target.value })} />}
                </Field>
                <Field label="Red from %" hint="Empty = SAP default (10).">
                  {(id) => <input id={id} inputMode="decimal" className={cx(inputCls, 'w-28')} placeholder="10" value={form.varHigh} onChange={(e) => onChange({ varHigh: e.target.value })} />}
                </Field>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <Button type="button" variant="ghost" onClick={onStop}><Square size={14} /> Stop ({fmtMs(elapsed)})</Button>
            ) : (
              <Button type="button" variant="primary" onClick={onRun}><Play size={14} /> Run</Button>
            )}
            <Button type="button" onClick={onRefresh} disabled={!canRefresh || running} title="Fetch the same selection again from SAP (a result is kept until you refresh)"><RefreshCw size={14} /> Refresh</Button>
            <span className="text-xs text-faint">Nothing loads until you press Run. There is no time limit; Stop ends a run.</span>
          </div>
        </div>
      )}
    </div>
  );
}
