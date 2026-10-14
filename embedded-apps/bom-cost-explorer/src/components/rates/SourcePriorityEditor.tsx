'use client';
/**
 * Rate source priority editor (BOM costing and plan breakup filter panels): all five sources, a checkbox
 * each, drag (or Alt + arrow / the arrows) to reorder, and the presets "Report default" (no MARKT) and
 * "All sources". The checked sources in this order are what SAP gets as Prio.
 */
import { useEffect, useState } from 'react';
import { cx } from '../ui';
import { PRIO_PRESETS, prioFromItems, prioItems, presetMatches, type PrioItem } from '@/lib/rates/priority';

export default function SourcePriorityEditor({ value, onChange, compact = false }: { value: string[]; onChange: (v: string[]) => void; compact?: boolean }) {
  const [items, setItems] = useState<PrioItem[]>(() => prioItems(value));
  const [drag, setDrag] = useState<number | null>(null);
  // Follow outside changes (preset, loaded scenario) without losing the order of unchecked sources.
  useEffect(() => {
    if (prioFromItems(items).join(',') !== value.join(',')) setItems(prioItems(value, items.map((i) => i.source)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.join(',')]);

  const commit = (next: PrioItem[]) => {
    if (!next.some((i) => i.on)) return; // SAP needs at least one source
    setItems(next);
    onChange(prioFromItems(next));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    commit(next);
  };
  const toggle = (i: number) => commit(items.map((it, j) => (j === i ? { ...it, on: !it.on } : it)));
  let rank = 0;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1" role="group" aria-label="Priority presets">
        {PRIO_PRESETS.map((p) => (
          <button key={p.id} type="button" aria-pressed={presetMatches(value, p.prio)} onClick={() => commit(prioItems(p.prio))}
            className={cx('rounded-full border px-2 py-0.5 text-2xs font-semibold', presetMatches(value, p.prio) ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink hover:border-accent/50')}>
            {p.label}
          </button>
        ))}
      </div>
      <ol className="space-y-1" aria-label="Rate source priority">
        {items.map((it, i) => {
          const n = it.on ? ++rank : 0;
          return (
            <li
              key={it.source}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
              onKeyDown={(e) => {
                if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
                if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
              }}
              tabIndex={0}
              aria-label={`${it.source}${it.on ? `, priority ${n}` : ', not used'}. Alt+Up or Alt+Down to move`}
              className={cx('flex cursor-grab items-center gap-2 rounded-xl border border-line bg-panel px-2.5 text-xs shadow-card transition hover:border-accent/40', compact ? 'py-1' : 'py-1.5', drag === i && 'opacity-50', !it.on && 'opacity-60')}
            >
              <span className="w-3 text-faint" aria-hidden>⋮⋮</span>
              <input type="checkbox" checked={it.on} onChange={() => toggle(i)} aria-label={`Use ${it.source}`} className="h-3.5 w-3.5 accent-[rgb(var(--accent))]" />
              <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold', it.on ? 'bg-accent/10 text-accent' : 'bg-sunken text-faint')}>{it.on ? n : '–'}</span>
              <span className="h-2 w-2 rounded-sm" style={{ background: `var(--src-${it.source.toLowerCase()})` }} aria-hidden />
              <span className={cx('font-semibold', !it.on && 'line-through decoration-faint')}>{it.source}</span>
              <span className="ml-auto flex gap-0.5">
                <button type="button" className="px-1 text-faint hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${it.source} up`}>▲</button>
                <button type="button" className="px-1 text-faint hover:text-ink disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${it.source} down`}>▼</button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
