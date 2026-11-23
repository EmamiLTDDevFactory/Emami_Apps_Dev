'use client';
/**
 * The selection of every Margin screen: materials, plants, price source (the latest sales order
 * with the Sales price selection), live or snapshot, freight and price date. It loads nothing by itself: the sales-area / filter lists load on their
 * own buttons. `extra` carries the fields of one screen (what-if inputs, grouping, days ...). The URL keeps the selection (see lib/margin/selection).
 */
import { useHierNames } from '@/lib/client/useHierNames';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Play, RefreshCw, Square } from 'lucide-react';
import { MaterialHierarchyPicker, MaterialPicker, PlantPicker } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import { SalesFiltersEditor } from '../so/SalesFilters';
import { Button, Field, Toggle, cx, inputCls } from '../ui';
import { MAX_MATERIALS } from '@/lib/query/schema';
import { fmtMs } from '@/lib/format';
import { ensure, peek, subscribe, type WacEntry } from '@/lib/wac/cache';
import { fetchSo } from '@/lib/so/service';
import { SO_MAX_MATERIALS, buildSoFilter } from '@/lib/so/filter';
import { neverCountedAuarts, segmentOptions } from '@/lib/so/view';
import type { SalesFiltersValue } from '@/lib/so/presets';
import type { SoAreaRow, SoCondRow, SoFilterRow } from '@/lib/so/types';
import { parseMarginSearch, marginSearch, type MarginSel } from '@/lib/margin/selection';

const PAGE_CTX = 'margin-page';
const useEntry = <T,>(key: string | null): WacEntry<T> | undefined => useSyncExternalStore(subscribe, () => peek<T>(key), () => undefined);
const safe = (f: () => string): string | null => { try { return f(); } catch { return null; } };

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
  const hn = useHierNames();
  const order = sel.priceSrc === 'O';
  const mats = sel.materials.slice(0, SO_MAX_MATERIALS);
  const areaQ = useMemo(() => ({ materials: mats, daysBack: sel.days, onlyOrd: mats.length > 0 }), [mats.join(','), sel.days]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sales areas can be listed without finished goods too (every area the person may see): a Portfolio / Alerts run by plant, hierarchy or brand needs a sales organisation as well.
  const areaKey = order ? safe(() => `so|AREA|${buildSoFilter(areaQ, 'AREA')}`) : null;
  const areas = useEntry<SoAreaRow>(areaKey);
  const COND_KEY = 'so|COND|';
  const cond = useEntry<SoCondRow>(order ? COND_KEY : null);
  const listQ = useMemo(() => ({ materials: mats, vkorg: sel.vkorg, vtweg: sel.vtweg, segment: sel.segment ? [sel.segment] : [], daysBack: sel.days }), [mats.join(','), sel.vkorg.join(','), sel.vtweg.join(','), sel.segment, sel.days]); // eslint-disable-line react-hooks/exhaustive-deps
  const filterKey = order && mats.length && sel.vkorg.length ? safe(() => `so|FILTER|${buildSoFilter(listQ, 'FILTER')}`) : null;
  const filters = useEntry<SoFilterRow>(filterKey);
  const loadAreas = () => {
    if (!areaKey) return;
    void ensure<SoAreaRow>(areaKey, PAGE_CTX, 'AREA', (signal) => fetchSo('AREA', areaQ, { signal }));
    void ensure<SoCondRow>(COND_KEY, PAGE_CTX, 'COND', (signal) => fetchSo('COND', {}, { signal }));
  };
  // The sales organisation is required (prices come from the latest sales order), so its list is read as soon as the card shows; the button stays for a retry.
  useEffect(() => { if (areaKey && !areas) loadAreas(); }, [areaKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadFilters = () => { if (filterKey) void ensure<SoFilterRow>(filterKey, PAGE_CTX, 'FILTER', (signal) => fetchSo('FILTER', listQ, { signal })); };
  const value: SalesFiltersValue = { vkorg: sel.vkorg, vtweg: sel.vtweg, segment: sel.segment ? [sel.segment] : [], days: sel.days, auart: sel.auart, pstyv: sel.pstyv, kdgrp: sel.kdgrp, kunnr: sel.kunnr };
  const applyValue = (p: Partial<SalesFiltersValue>) => {
    const n: Partial<MarginSel> = {};
    if (p.vkorg) n.vkorg = p.vkorg; if (p.vtweg) n.vtweg = p.vtweg; if (p.segment) n.segment = p.segment[0] ?? ''; if (p.days !== undefined) n.days = p.days;
    if (p.auart) n.auart = p.auart; if (p.pstyv) n.pstyv = p.pstyv; if (p.kdgrp) n.kdgrp = p.kdgrp; if (p.kunnr) n.kunnr = p.kunnr;
    onChange(n);
  };
  const segments = useMemo(() => segmentOptions(cond?.data ?? []), [cond]);
  const never = useMemo(() => neverCountedAuarts(cond?.data ?? [], sel.vkorg), [cond, sel.vkorg]);

  return (
    <div className="rounded-2xl border border-line bg-panel shadow-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold">
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Selection
        <span className="ml-2 truncate text-xs font-normal text-muted">{summary ?? `${sel.materials.length || 'no'} material(s) · ${sel.plants.join(', ') || 'no plant'} · latest sales order · ${sel.source === 'L' ? 'live' : 'snapshot'}`}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Finished goods" hint={noMaterialsHint ?? `A live run takes 25 at a time (more are run in batches). Up to ${MAX_MATERIALS} to pick.`} error={errors.materials}>
              {(id) => (<><MaterialPicker id={id} values={sel.materials} onChange={(materials) => onChange({ materials })} max={MAX_MATERIALS} invalid={!!errors.materials} /><MaterialHierarchyPicker values={sel.materials} onChange={(materials) => onChange({ materials })} max={MAX_MATERIALS} werks={sel.plants} /></>)}
            </Field>
            <Field label="Plants" hint="Only plants SAP lists for you can be used." error={errors.plants}>
              {(id) => <PlantPicker id={id} values={sel.plants} onChange={(plants) => onChange({ plants })} state={plantsState} invalid={!!errors.plants} />}
            </Field>
            <Field label="Product hierarchy (optional)" hint="Type a code or a name; the list shows the descriptions.">{(id) => (<><input id={id} list={`${id}-prod`} className={inputCls} placeholder="e.g. 0101160653" value={sel.prodha} onChange={(e) => onChange({ prodha: e.target.value })} /><datalist id={`${id}-prod`}>{hn.productList.map((o) => <option key={o.code} value={o.code}>{o.descr}</option>)}</datalist></>)}</Field>
            <Field label="Brand (optional)" hint={sel.brand && hn.brand(sel.brand) !== sel.brand ? hn.brand(sel.brand) : 'Type a code or a name; the list shows the descriptions.'}>{(id) => (<><input id={id} list={`${id}-brand`} className={inputCls} value={sel.brand} onChange={(e) => onChange({ brand: e.target.value })} /><datalist id={`${id}-brand`}>{hn.brandList.map((o) => <option key={o.code} value={o.code}>{o.descr}</option>)}</datalist></>)}</Field>
          </div>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
            <div className="flex max-w-xs flex-col gap-1"><span className="text-2xs font-bold uppercase tracking-wide text-muted">Prices</span>
              <p className="text-xs text-muted">Selling price and MRP of the latest sales order, with the costed RM / PM / perfume cost. Uploaded prices are not used.</p>
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
          {order && (
            <SalesFiltersEditor areas={areas?.data ?? []} areasLoading={areas?.status === 'loading'} areasError={areas?.status === 'error' ? areas.error : errors.areas ?? null} onLoadAreas={loadAreas} canLoadAreas={!!areaKey}
              segments={segments} value={value} onChange={applyValue} filterRows={filters?.status === 'done' ? filters.data ?? [] : null} filterLoading={filters?.status === 'loading'} filterError={filters?.status === 'error' ? filters.error : null}
              onLoadFilters={loadFilters} canLoadFilters={!!filterKey} neverCounted={never} email={email} materials={sel.materials} />
          )}
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
