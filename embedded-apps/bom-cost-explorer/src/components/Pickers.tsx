'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MaterialRow } from '@/lib/sap/fields';
import MaterialCascadePicker from './MaterialCascadePicker';
import type { PlantsState } from './FilterPanel';
import { api } from '@/lib/client/api';
import { cx, inputCls } from './ui';

/** "a, b c\nd" -> ['A','B','C','D'] (deduplicated, upper-cased). */
export const splitList = (s: string) => Array.from(new Set(s.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)));

interface Option { value: string; label: string; sub?: string }

/** Multi-select chips with type-ahead (combobox pattern), paste a list to add many. */
function ChipInput({
  id, values, onChange, options, loading, onQuery, placeholder, max, single, invalid, describe, emptyText, onOpen, footer,
}: {
  id: string; values: string[]; onChange: (v: string[]) => void; options: Option[]; loading?: boolean; onQuery?: (q: string) => void;
  placeholder?: string; max?: number; single?: boolean; invalid?: boolean; describe?: (v: string) => string | undefined;
  /** shown in the open list when there is nothing to pick (and not loading) */
  emptyText?: string;
  onOpen?: () => void;
  footer?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => options.filter((o) => !values.includes(o.value)).slice(0, 100), [options, values]);

  const add = (vals: string[]) => {
    const next = single ? vals.slice(-1) : Array.from(new Set([...values, ...vals]));
    onChange(max ? next.slice(0, max) : next);
    setText('');
    onQuery?.('');
    setActive(0);
    setOpen(false); // reopened by typing or ArrowDown; must not cover the next field
  };

  return (
    <div className={cx('relative rounded-xl border bg-panel px-1.5 py-1 transition', invalid ? 'border-bad' : 'border-line focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15')}>
      <div className="flex flex-wrap items-center gap-1">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent" title={describe?.(v)}>
            <span className="font-mono">{v}</span>
            {describe?.(v) && <span className="max-w-[140px] truncate font-normal text-ink/70">{describe(v)}</span>}
            <button type="button" className="text-accent/60 hover:text-bad" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>✕</button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
          className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-faint"
          placeholder={values.length ? '' : placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onQuery?.(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => { setOpen(true); onOpen?.(); }}
          onClick={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (/[\s,;]/.test(t.trim())) {
              e.preventDefault();
              add(splitList(t));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
              if (open && shown[active] && text) { e.preventDefault(); add([shown[active].value]); }
              else if (text.trim()) { e.preventDefault(); add(splitList(text)); }
            } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
      </div>
      {open && (shown.length > 0 || loading || emptyText) && (
        <ul id={listId} role="listbox" className="scroll-thin absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 animate-slideUp overflow-auto rounded-xl border border-line bg-panel py-1 shadow-cardHover">
          {loading && <li className="px-3 py-2 text-xs font-semibold text-muted">Loading from SAP…</li>}
          {!loading && shown.length === 0 && emptyText && <li className="px-3 py-2 text-xs text-muted">{emptyText}</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); add([o.value]); inputRef.current?.focus(); }}
              onMouseEnter={() => setActive(i)}
              className={cx('mx-1 flex cursor-pointer items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-sm', i === active && 'bg-accent/10')}
            >
              <span className="font-mono text-xs font-bold text-accent">{o.value}</span>
              <span className="truncate">{o.label}</span>
              {o.sub && <span className="ml-auto shrink-0 text-2xs text-faint">{o.sub}</span>}
            </li>
          ))}
          {footer && !loading && shown.length > 0 && <li className="px-3 pb-1 pt-1.5 text-[11px] text-faint">{footer}</li>}
        </ul>
      )}
    </div>
  );
}

/** `types` (optional) keeps only materials of these material types in the search results (for example the freight analysis: ROH, PKGN, VERP);
 * `known` (optional) receives every material the search has shown so far, so a screen can read the description / type of a picked code. */
export function MaterialPicker({ id, values, onChange, max, invalid, types, known: knownOut }: { id: string; values: string[]; onChange: (v: string[]) => void; max: number; invalid?: boolean; types?: readonly string[]; known?: { current: Map<string, MaterialRow> } }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const own = useRef(new Map<string, MaterialRow>());
  const known = knownOut ?? own;
  const allowed = types ? new Set(types.map((t) => t.toUpperCase())) : null;
  useEffect(() => {
    if (q.trim().length < 2) return setOpts([]);
    const c = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      api.materials(q, c.signal)
        .then((r) => {
          const list = allowed ? r.materials.filter((m) => allowed.has(String(m.Mtart).trim().toUpperCase())) : r.materials;
          list.forEach((m) => known.current.set(m.Matnr, m));
          setOpts(list);
        })
        .catch(() => setOpts([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ChipInput
      id={id}
      values={values}
      onChange={onChange}
      onQuery={setQ}
      loading={loading}
      max={max}
      invalid={invalid}
      placeholder="Search material number or description…"
      emptyText={q.trim().length < 2 ? 'Type at least 2 characters to search SAP' : 'No material found in SAP'}
      options={opts.map((m) => ({ value: m.Matnr, label: m.Maktx, sub: `${m.Mtart} · ${m.Meins}` }))}
      describe={(v) => known.current.get(v)?.Maktx}
    />
  );
}

export function PlantPicker({ id, values, onChange, state, single, invalid, placeholder }: { id: string; values: string[]; onChange: (v: string[]) => void; state: PlantsState; single?: boolean; invalid?: boolean; placeholder?: string }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const { plants } = state;
  const opts = plants
    .filter((p) => !t || p.Werks.toLowerCase().includes(t) || p.Name1.toLowerCase().includes(t))
    .map((p) => ({ value: p.Werks, label: p.Name1, sub: `${p.Land1} · ${p.Waers}` }));
  const byId = new Map(plants.map((p) => [p.Werks, p]));
  return (
    <ChipInput
      id={id}
      values={values}
      onChange={(v) => onChange(v.map((x) => x.toUpperCase()))}
      onQuery={setQ}
      options={opts}
      loading={state.loading}
      // Opening the value help with nothing loaded (first load failed) asks SAP again.
      onOpen={() => { if (!plants.length && !state.loading) state.reload(); }}
      emptyText={state.error ? `Could not load plants: ${state.error}` : plants.length ? 'No plant matches' : 'No plants returned by SAP'}
      footer={opts.length > 100 ? `Showing 100 of ${opts.length} - type to narrow` : undefined}
      single={single}
      invalid={invalid}
      placeholder={placeholder ?? (single ? 'Pick one plant…' : 'Search plant code or name…')}
      describe={(v) => byId.get(v)?.Name1}
    />
  );
}

/** Reorderable list: drag and drop, or Alt+Arrow keys / the arrow buttons for keyboard users. */
export function PriorityList({ value, onChange, all }: { value: string[]; onChange: (v: string[]) => void; all: readonly string[] }) {
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  const missing = all.filter((s) => !value.includes(s));
  return (
    <div>
      <ol className="space-y-1" aria-label="Rate source priority">
        {value.map((s, i) => (
          <li
            key={s}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
            onKeyDown={(e) => {
              if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
              if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
            }}
            tabIndex={0}
            aria-label={`${i + 1}. ${s}. Alt+Up or Alt+Down to move`}
            className={cx('flex cursor-grab items-center gap-2 rounded-xl border border-line bg-panel px-2.5 py-1.5 text-xs shadow-card transition hover:border-accent/40', drag === i && 'opacity-50')}
          >
            <span className="w-4 text-faint" aria-hidden>⋮⋮</span>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/10 text-[10px] font-extrabold text-accent">{i + 1}</span>
            <span className="h-2 w-2 rounded-sm" style={{ background: `var(--src-${s.toLowerCase().replace('inforec', 'inforec')})` }} aria-hidden />
            <span className="font-semibold">{s}</span>
            <span className="ml-auto flex gap-0.5">
              <button type="button" className="px-1 text-faint hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${s} up`}>▲</button>
              <button type="button" className="px-1 text-faint hover:text-ink disabled:opacity-30" disabled={i === value.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${s} down`}>▼</button>
              {value.length > 1 && <button type="button" className="px-1 text-faint hover:text-bad" onClick={() => onChange(value.filter((x) => x !== s))} aria-label={`Remove ${s}`}>✕</button>}
            </span>
          </li>
        ))}
      </ol>
      {missing.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {missing.map((s) => (
            <button key={s} type="button" onClick={() => onChange([...value, s])} className="rounded-full border border-dashed border-accent/40 px-2 py-0.5 text-2xs font-semibold text-accent hover:bg-accent/10">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

import type { HierPick } from '@/lib/client/hier';
export { inputCls };


/**
 * Brand -> Product -> SKU -> Material browser. The lists come from SAP's grouped HierVHSet and MaterialVHSet
 * filtered by the chosen levels (components/MaterialCascadePicker.tsx, lib/client/hier.ts). Opens on demand;
 * picked materials go into the same list as the search above (`values` / `onChange`).
 */
export function MaterialHierarchyPicker({ values, onChange, max, werks, pick, onPickChange }: { values: string[]; onChange: (v: string[]) => void; max: number; werks?: string[]; pick?: HierPick; onPickChange?: (p: HierPick) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="mt-1.5 text-xs font-semibold text-accent hover:underline" onClick={() => setOpen(true)}>
        Or pick by Brand → Product → SKU → Material
      </button>
    );
  }
  return <MaterialCascadePicker values={values} onChange={onChange} max={max} werks={werks} onClose={() => setOpen(false)} pick={pick} onPickChange={onPickChange} autoFill={!onPickChange} />;
}
