'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MaterialHierarchyRow, MaterialRow } from '@/lib/sap/fields';
import { cascade, pickLevel, type HierarchyPick, type LevelOption } from '@/lib/client/hierarchy';
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

export function MaterialPicker({ id, values, onChange, max, invalid }: { id: string; values: string[]; onChange: (v: string[]) => void; max: number; invalid?: boolean }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const known = useRef(new Map<string, MaterialRow>());
  useEffect(() => {
    if (q.trim().length < 2) return setOpts([]);
    const c = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      api.materials(q, c.signal)
        .then((r) => {
          r.materials.forEach((m) => known.current.set(m.Matnr, m));
          setOpts(r.materials);
        })
        .catch(() => setOpts([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);
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

export { inputCls };

/** Why the Brand / Product / CRS browser can't load, in words for the person (null = it loaded). */
function hierarchyProblem(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Resource not found for the segment|Property .* not found/i.test(msg)) return 'SAP does not provide Brand / Product / CRS on the material list yet. Use the search above.';
  return `Could not load the brand list from SAP (${msg}). Use the search above.`;
}

/**
 * Brand -> Product -> CRS -> Material browser (MaterialVHSet's finished goods, cascaded in the browser,
 * see lib/client/hierarchy.ts). Loads only when opened. Picked materials go into the same list as the
 * search above (`values` / `onChange`), so nothing else about running a costing changes.
 */
export function MaterialHierarchyPicker({ values, onChange, max }: { values: string[]; onChange: (v: string[]) => void; max: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<MaterialHierarchyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<HierarchyPick>({ brand: '', product: '', crs: '' });
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open || rows || loading || error) return;
    setLoading(true);
    api.materialHierarchy()
      .then((r) => {
        setRows(r.materials);
        if (!r.materials.length) setError('SAP returned no finished goods to browse yet: the material list needs the Brand / Product / CRS fields and must answer a filter without a search term. Use the search above.');
      })
      .catch((e) => setError(hierarchyProblem(e)))
      .finally(() => setLoading(false));
  }, [open, rows, loading, error]);

  const levels = useMemo(() => (rows ? cascade(rows, pick) : null), [rows, pick]);
  const t = text.trim().toLowerCase();
  const shown = useMemo(() => (levels ? levels.materials.filter((m) => !t || m.Matnr.toLowerCase().includes(t) || m.Maktx.toLowerCase().includes(t)) : []), [levels, t]);
  const room = Math.max(0, max - values.length);
  const addable = shown.filter((m) => !values.includes(m.Matnr));

  const toggle = (matnr: string) => onChange(values.includes(matnr) ? values.filter((v) => v !== matnr) : [...values, matnr].slice(0, max));
  const addAll = () => onChange([...values, ...addable.slice(0, room).map((m) => m.Matnr)]);

  if (!open) {
    return (
      <button type="button" className="mt-1.5 text-xs font-semibold text-accent hover:underline" onClick={() => setOpen(true)}>
        Or pick by Brand → Product → CRS → Material
      </button>
    );
  }

  const level = (label: string, key: keyof HierarchyPick, opts: LevelOption[]) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
      {label}
      <select className={cx(inputCls, 'normal-case tracking-normal')} value={pick[key]} onChange={(e) => setPick(pickLevel(pick, key, e.target.value))}>
        <option value="">All ({opts.reduce((n, o) => n + o.count, 0)})</option>
        {opts.map((o) => (
          <option key={o.code} value={o.code}>{o.text ? `${o.text} · ${o.code}` : o.code} ({o.count})</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mt-2 rounded-xl border border-line bg-sunken/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-ink">Pick by Brand → Product → CRS → Material</span>
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setOpen(false)}>Close</button>
      </div>
      {loading && <p className="text-xs text-muted">Loading finished goods from SAP…</p>}
      {error && <p className="text-xs text-warn">{error}</p>}
      {levels && !error && (
        <>
          <div className="flex flex-col gap-2">
            {level('Brand', 'brand', levels.brands)}
            {level('Product', 'product', levels.products)}
            {level('CRS', 'crs', levels.crs)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input className={cx(inputCls, 'h-8')} placeholder={`Filter ${levels.materials.length} materials…`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Filter materials" />
            <button type="button" className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-50" disabled={!addable.length || !room} onClick={addAll} title={room < addable.length ? `Only ${room} more can be added (max ${max})` : undefined}>
              Add all {Math.min(addable.length, room)}
            </button>
          </div>
          <ul className="scroll-thin mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-panel">
            {shown.slice(0, 300).map((m) => {
              const on = values.includes(m.Matnr);
              return (
                <li key={m.Matnr}>
                  <label className={cx('flex cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-sm hover:bg-accent/5', on && 'bg-accent/10')}>
                    <input type="checkbox" checked={on} disabled={!on && !room} onChange={() => toggle(m.Matnr)} className="translate-y-0.5" />
                    <span className="font-mono text-xs font-bold text-accent">{m.Matnr}</span>
                    <span className="truncate">{m.Maktx}</span>
                    {m.Zskugroupcrs && <span className="ml-auto shrink-0 text-2xs text-faint">{m.Zskugroupcrs}</span>}
                  </label>
                </li>
              );
            })}
            {!shown.length && <li className="px-3 py-2 text-xs text-muted">No materials here.</li>}
            {shown.length > 300 && <li className="px-3 py-1.5 text-[11px] text-faint">Showing 300 of {shown.length} - narrow it down or filter.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
