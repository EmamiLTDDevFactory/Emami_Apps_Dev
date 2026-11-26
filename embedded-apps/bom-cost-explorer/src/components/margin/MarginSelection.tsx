'use client';
/**
 * The selection of every Margin screen: materials, plants, price source (the latest sales order
 * with the Sales price selection), live or snapshot, freight and price date. It loads nothing by itself: the sales-area / filter lists load on their
 * own buttons. `extra` carries the fields of one screen (what-if inputs, grouping, days ...). The URL keeps the selection (see lib/margin/selection).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Play, RefreshCw, Square } from 'lucide-react';
import { MaterialHierarchyPicker, MaterialPicker, PlantPicker } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import BomPlantsHint from '../BomPlantsHint';
import { Button, Field, Toggle, cx, inputCls } from '../ui';
import { fmtMs } from '@/lib/format';
import { parseMarginSearch, marginSearch, type MarginSel } from '@/lib/margin/selection';

/** No limit on the number of finished goods: a live run costs them 25 at a time, batch after batch. */
export const MARGIN_MAX_MATERIALS = 5000;

/** The selection state, mirrored in the URL (never starts a run). `keep` carries other screens' parameters. */
export function useMarginSel(keep: () => Record<string, string> = () => ({})): [MarginSel, (p: Partial<MarginSel>) => void] {
  const [sel, setSel] = useState<MarginSel>(() => parseMarginSearch(typeof window === 'undefined' ? '' : window.location.search));
  useEffect(() => {
    const k = keep();
    const extra = new URLSearchParams(window.location.search);
    const kept = Object.fromEntries(Object.keys(k).map((n) => [n, k[n]]));
    for (const n of ['mat', 'plants', 'mk', 'ch', 'prodha', 'brand', 'src', 'pd', 'frt', 'qty', 'ps', 'vk', 'vt', 'seg', 'days', 'a', 'ax', 'p', 'px', 'ku', 'kx', 'u', 'ux']) extra.delete(n);
    const s = marginSearch(sel, kept);
    if (s !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${s}`);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  return [sel, (p) => setSel((s) => ({ ...s, ...p }))];
}

export default function MarginSelection({ sel, onChange, plantsState, email, errors = {}, extra, onRun, onStop, onRefresh, running, elapsed, canRefresh, runLabel = 'Show', summary, noSource, noMaterialsHint }: {
  sel: MarginSel; onChange: (p: Partial<MarginSel>) => void; plantsState: PlantsState; email: string; errors?: Partial<Record<'materials' | 'plants' | 'areas' | 'other', string>>;
  extra?: ReactNode; onRun: () => void; onStop: () => void; onRefresh?: () => void; running: boolean; elapsed: number; canRefresh?: boolean; runLabel?: string;
  summary?: string; /** hide the live / snapshot choice (History reads stored snapshots only) */ noSource?: boolean; noMaterialsHint?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-line bg-panel shadow-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold">
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Selection
        <span className="ml-2 truncate text-xs font-normal text-muted">{summary ?? `${sel.materials.length || 'no'} material(s) · ${sel.plants.join(', ') || 'no plant'} · latest sales order · ${sel.source === 'L' ? 'live' : 'snapshot'}`}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Finished goods" hint={noMaterialsHint ?? 'Pick by Brand > Product > SKU, type a code or paste a list. No limit: a live run costs 25 at a time and goes on batch after batch.'} error={errors.materials}>
              {(id) => (<><MaterialPicker id={id} values={sel.materials} onChange={(materials) => onChange({ materials })} max={MARGIN_MAX_MATERIALS} invalid={!!errors.materials} /><MaterialHierarchyPicker values={sel.materials} onChange={(materials) => onChange({ materials })} max={MARGIN_MAX_MATERIALS} werks={sel.plants} /></>)}
            </Field>
            <Field label="Plants" hint="Only plants SAP lists for you can be used. The price is the latest sales order of the finished good." error={errors.plants}>
              {(id) => (<><PlantPicker id={id} values={sel.plants} onChange={(plants) => onChange({ plants })} state={plantsState} invalid={!!errors.plants} /><BomPlantsHint materials={sel.materials} selected={sel.plants} onPick={(plants) => onChange({ plants })} /></>)}
            </Field>
          </div>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
            <div className="flex max-w-xs flex-col gap-1"><span className="text-2xs font-bold uppercase tracking-wide text-muted">Prices</span>
              <p className="text-xs text-muted">Selling price and MRP of the latest sales order of the finished good (any sales organisation), with the costed RM / PM / perfume cost.</p>
            </div>
            {!noSource && (
              <fieldset className="flex flex-col gap-1"><legend className="text-2xs font-bold uppercase tracking-wide text-muted">Data</legend>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Live or snapshot">
                  {([['L', 'Live'], ['S', 'Snapshot']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={sel.source === k} onClick={() => onChange({ source: k })} className={cx('rounded-full border px-3 py-1 text-xs font-bold', sel.source === k ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{l}</button>)}
                </div>
                {sel.source === 'L' && <p className="max-w-xs text-xs text-warn">Live costing: about 10-15 s per 25 finished goods.</p>}
              </fieldset>
            )}
            <Toggle checked={sel.freight} onChange={(freight) => onChange({ freight })} label="Include freight" />
            <Field label="Price date (optional)">{(id) => <input id={id} type="date" className={cx(inputCls, 'w-40')} value={sel.priceDate} onChange={(e) => onChange({ priceDate: e.target.value })} />}</Field>
            <Field label="Explosion quantity (optional)">{(id) => <input id={id} inputMode="decimal" className={cx(inputCls, 'w-32')} placeholder="SAP default" value={sel.explQty} onChange={(e) => onChange({ explQty: e.target.value.replace(',', '.') })} />}</Field>
          </div>
          {extra}
          {errors.other && <p role="alert" className="text-xs text-bad">{errors.other}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {running ? <Button type="button" variant="ghost" onClick={onStop}><Square size={14} /> Stop ({fmtMs(elapsed)})</Button> : <Button type="button" variant="primary" onClick={onRun}><Play size={14} /> {runLabel}</Button>}
            {onRefresh && <Button type="button" onClick={onRefresh} disabled={!canRefresh || running} title="Read the same selection again from SAP (a result is kept until you refresh)"><RefreshCw size={14} /> Refresh</Button>}
            <span className="text-xs text-faint">Nothing loads until you press a button, also not from the URL. There is no time limit; Stop ends a run.</span>
          </div>
        </div>
      )}
    </div>
  );
}
