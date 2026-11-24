'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { assetClassDesc, filterAssetClasses, type AssetClassOption } from './procureLogic';

/** Client-side "load more" (Fiori growing tables: log #99; the backend ignores $top). */
export function useGrowing<T>(rows: T[], step = 20, resetKey = '') {
  const [shown, setShown] = useState(step);
  useEffect(() => { setShown(step); }, [resetKey, step]);
  return {
    visible: useMemo(() => rows.slice(0, shown), [rows, shown]),
    more: () => setShown((n) => n + step),
    hasMore: rows.length > shown,
    total: rows.length,
    shown: Math.min(shown, rows.length),
  };
}

export function LoadMore({ g }: { g: { hasMore: boolean; more: () => void; total: number; shown: number } }) {
  if (g.total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-sap-line px-3 py-2 text-[11px] text-sap-muted">
      <span>{g.shown} of {g.total}</span>
      {g.hasMore && <Button onClick={g.more}>Load more</Button>}
    </div>
  );
}

/** Plant dropdown; the option text starts with the code so typing the code jumps to it (log #8). */
export function PlantSelect({ value, onChange, plants, allLabel = 'All', id }: { value: string; onChange: (v: string) => void; plants: { code: string; name: string }[]; allLabel?: string; id?: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel && <option value="">{allLabel}</option>}
      {plants.map((p) => <option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
    </Select>
  );
}

/** Label/value row for read-only detail grids. */
export function KV({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-40 shrink-0 text-[11px] font-bold text-sap-muted">{k}</dt>
      <dd className="min-w-0 break-words text-[12px] text-sap-ink">{children}</dd>
    </div>
  );
}

/** Select-OR-type box (log #54/#92): pick a ValueHelp row or type any code; search matches code or text. */
export function AssetClassCombo({ value, onChange, onPick, options, max }: { value: string; onChange: (code: string) => void; onPick: (opt: AssetClassOption) => void; options: AssetClassOption[]; max: number }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const shown = filterAssetClasses(options, query).slice(0, 50);
  const current = options.find((o) => o.key === value);
  return (
    <div ref={box} className="relative">
      <Input
        value={open ? query : current ? `${current.key} - ${assetClassDesc(current)}` : value}
        maxLength={open ? 60 : undefined}
        placeholder="Pick from the list or type a code"
        onFocus={() => { setQuery(''); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value.trim().split(/\s+/)[0].slice(0, max)); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setOpen(false); }}
        className="w-full"
        aria-label="Asset class"
        role="combobox" aria-expanded={open}
      />
      {open && shown.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-sap-line bg-white py-1 text-[12px] shadow-pop">
          {shown.map((o) => (
            <li key={o.key} role="option" aria-selected={o.key === value} className="cursor-pointer px-3 py-1.5 hover:bg-[#EEF1FB]"
              onMouseDown={(e) => { e.preventDefault(); onPick(o); setOpen(false); }}>
              <b>{o.key}</b> <span className="text-sap-muted">{assetClassDesc(o)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
