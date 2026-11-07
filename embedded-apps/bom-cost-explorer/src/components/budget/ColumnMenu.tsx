'use client';
/** Column chooser: every column can be shown or hidden, one by one or a whole group, with Show all / Hide all / Reset. The choice is kept in this browser (per `store` name). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../ui';

export interface ColChoice { key: string; label: string; group: string }

/** Remembered choice: only keys that still exist; null when nothing valid is stored (storage may be blocked). */
export function loadChoice(store: string, valid: readonly string[]): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(store);
    if (!raw) return null;
    const ok = new Set(valid);
    const keys = (JSON.parse(raw) as unknown[]).filter((k): k is string => typeof k === 'string' && ok.has(k));
    return keys.length ? new Set(keys) : null;
  } catch { return null; }
}
export function saveChoice(store: string, keys: ReadonlySet<string>): void { try { window.localStorage.setItem(store, JSON.stringify(Array.from(keys))); } catch { /* private mode */ } }

export default function ColumnMenu({ cols, groups, visible, onChange, defaults, store, align = 'right' }: {
  cols: ColChoice[]; groups: Record<string, string>; visible: ReadonlySet<string>; onChange: (next: Set<string>) => void; defaults: readonly string[]; store?: string; align?: 'left' | 'right';
}) {
  const [q, setQ] = useState('');
  const byGroup = useMemo(() => {
    const m = new Map<string, ColChoice[]>();
    for (const c of cols) { if (!m.has(c.group)) m.set(c.group, []); m.get(c.group)!.push(c); }
    return Array.from(m.entries());
  }, [cols]);
  const set = (next: Set<string>) => { if (!next.size && cols.length) next.add(cols[0].key); onChange(next); if (store) saveChoice(store, next); };
  const toggle = (k: string) => { const n = new Set(visible); if (n.has(k)) n.delete(k); else n.add(k); set(n); };
  const toggleGroup = (list: ColChoice[], on: boolean) => { const n = new Set(visible); for (const c of list) { if (on) n.add(c.key); else n.delete(c.key); } set(n); };
  const text = q.trim().toLowerCase();
  const shownCount = cols.filter((c) => visible.has(c.key)).length;
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-xl border border-line bg-panel px-3 py-1.5 text-sm font-semibold hover:bg-sunken">Columns ({shownCount} of {cols.length})</summary>
      <div className={cx('absolute z-30 mt-1 w-80 max-w-[90vw] rounded-xl border border-line bg-panel p-2 shadow-pop', align === 'right' ? 'right-0' : 'left-0')}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <input aria-label="Find a column" placeholder="Find a column…" className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1 text-sm" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-sunken" onClick={() => set(new Set(cols.map((c) => c.key)))}>Show all</button>
          <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-sunken" onClick={() => set(new Set())}>Hide all</button>
          <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-sunken" onClick={() => set(new Set(defaults))}>Reset</button>
        </div>
        <div className="scroll-thin max-h-[55vh] overflow-y-auto">
          {byGroup.map(([g, list]) => {
            const shown = text ? list.filter((c) => c.label.toLowerCase().includes(text)) : list;
            if (!shown.length) return null;
            return <Group key={g} label={groups[g] ?? g} list={shown} visible={visible} open={!!text} onToggle={toggle} onGroup={(on) => toggleGroup(shown, on)} />;
          })}
        </div>
      </div>
    </details>
  );
}

function Group({ label, list, visible, open, onToggle, onGroup }: { label: string; list: ColChoice[]; visible: ReadonlySet<string>; open: boolean; onToggle: (k: string) => void; onGroup: (on: boolean) => void }) {
  const on = list.filter((c) => visible.has(c.key)).length;
  const all = on === list.length;
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (box.current) box.current.indeterminate = on > 0 && !all; }, [on, all]);
  return (
    <details open={open} className="rounded-lg">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold hover:bg-sunken">
        <input ref={box} type="checkbox" aria-label={`Show or hide every ${label} column`} checked={all} onChange={(e) => onGroup(e.target.checked)} onClick={(e) => e.stopPropagation()} />
        <span className="flex-1">{label}</span><span className="text-2xs font-semibold text-faint">{on}/{list.length}</span>
      </summary>
      <div className="pb-1 pl-6">
        {list.map((c) => <label key={c.key} className="flex items-center gap-2 px-2 py-0.5 text-sm"><input type="checkbox" checked={visible.has(c.key)} onChange={() => onToggle(c.key)} /> {c.label}</label>)}
      </div>
    </details>
  );
}
