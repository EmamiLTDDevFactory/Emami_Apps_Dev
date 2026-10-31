'use client';
/**
 * "Price context" control in the top bar (Admin only): a switch "Show MRP and selling price", the sales organisations, segment and days.
 * Stored in the URL (?pc=) and in session storage; changing anything here never requests prices by itself - the screens ask for the
 * finished goods they show only once the switch is on and a sales organisation is chosen. Opening the popover reads the sales-area list
 * and the rules (for the segment names) from SAP once.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tags, X } from 'lucide-react';
import { Toggle, cx } from '../ui';
import { SalesFiltersEditor } from '../so/SalesFilters';
import { usePcApi } from '@/lib/price-context/context';
import { ensure, peek, subscribe } from '@/lib/wac/cache';
import { fetchSo } from '@/lib/so/service';
import { DEFAULT_PC } from '@/lib/price-context/state';
import { listActive } from '@/lib/so/filter';
import type { SalesFiltersValue } from '@/lib/so/presets';
import type { SoAreaRow, SoCondRow, SoFilterRow } from '@/lib/so/types';

const useCached = <T,>(key: string) => {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  return peek<T>(key);
};

export default function PriceContextBar() {
  const { state, set, replace, admin, email } = usePcApi();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [open]);

  // Nothing is read from SAP until a button below is pressed (sales areas + rules, then the include / exclude lists).
  const areas = useCached<SoAreaRow>('pc|AREA|all');
  const conds = useCached<SoCondRow>('pc|COND|all');
  const filterKey = `pc|FILTER|${state.vkorg.join(',')}|${state.vtweg.join(',')}|${state.days}`;
  const filters = useCached<SoFilterRow>(filterKey);
  const loadAreas = () => {
    void ensure<SoAreaRow>('pc|AREA|all', 'pc-popover', 'AREA', (signal) => fetchSo('AREA', { daysBack: state.days }, { signal }));
    void ensure<SoCondRow>('pc|COND|all', 'pc-popover', 'COND', (signal) => fetchSo('COND', {}, { signal }));
  };
  const loadFilters = () => void ensure<SoFilterRow>(filterKey, 'pc-popover', 'FILTER', (signal) => fetchSo('FILTER', { vkorg: state.vkorg, vtweg: state.vtweg, daysBack: state.days }, { signal }));
  const segments = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conds?.data ?? []) if (!c.Excl && c.Segment) m.set(c.Segment, c.SegTxt || c.Segment);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([code, text]) => ({ code, text }));
  }, [conds]);
  const never = useMemo(() => new Set((conds?.data ?? []).filter((c) => c.Excl && c.Auart).map((c) => c.Auart)), [conds]);

  if (!admin) return null;
  const ready = state.on && state.vkorg.length > 0;
  const value: SalesFiltersValue = { vkorg: state.vkorg, vtweg: state.vtweg, segment: state.segment, days: state.days, auart: state.auart, pstyv: state.pstyv, kdgrp: state.kdgrp, kunnr: state.kunnr };
  const active = [state.auart, state.pstyv, state.kdgrp, state.kunnr].filter(listActive).length;
  return (
    <div ref={root} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}
        className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold', ready ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-panel text-ink hover:bg-sunken')}>
        <Tags size={14} aria-hidden /> Price context{ready && <span className="rounded-full bg-accent px-1.5 text-2xs font-bold text-white">on</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Price context" className="absolute right-0 top-9 z-40 max-h-[80vh] w-[min(860px,calc(100vw-24px))] overflow-auto rounded-xl border border-line bg-panel p-3 shadow-pop">
          <div className="flex items-start justify-between gap-2">
            <Toggle checked={state.on} onChange={(on) => set({ on })} label="Show MRP and selling price" />
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-muted hover:text-ink"><X size={16} /></button>
          </div>
          <p className="mb-2 mt-1 text-2xs text-muted">Next to the rate sources on each screen. Prices come from the latest sales order that has the selling-price condition (read-only, from SAP). Nothing loads until the switch is on and a sales organisation is chosen. The same lists and saved presets as the Sales price page.</p>
          <SalesFiltersEditor
            areas={areas?.data ?? []} areasLoading={areas?.status === 'loading'} areasError={areas?.status === 'error' ? areas.error : null} onLoadAreas={loadAreas} canLoadAreas
            segments={segments} value={value} onChange={(p) => set(p)}
            filterRows={filters?.status === 'done' ? filters.data : null} filterLoading={filters?.status === 'loading'} filterError={filters?.status === 'error' ? filters.error : null} onLoadFilters={loadFilters} canLoadFilters={state.vkorg.length > 0}
            neverCounted={never} email={email} onApplyPreset={(p) => replace({ ...state, ...p.value })}
          />
          <div className="mt-2 flex justify-between text-2xs"><span className="text-faint">{active ? `${active} include / exclude list${active === 1 ? '' : 's'} active. ` : ''}Stored in the address (?pc=) and for this browser session.</span><button type="button" className="font-bold text-accent underline" onClick={() => replace(DEFAULT_PC)}>Reset</button></div>
        </div>
      )}
    </div>
  );
}
