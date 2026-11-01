'use client';
/**
 * "Pick by Brand -> Product -> SKU -> Material". Levels from SAP's HierVHSet (lib/client/hier.ts), materials
 * from MaterialVHSet filtered by the chosen levels (or a 2+ character search). Every level lists everything until a
 * higher level is chosen; choosing one reloads the lower lists and clears a lower choice they no longer have. Chosen materials become the chips of the material field (`values`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { cx, inputCls } from './ui';
import type { MaterialRow } from '@/lib/sap/fields';
import { HIER_MATERIALS_MAX, hasMaterialCriteria, keepValid, loadBrands, loadHierMaterials, loadLevel, optionLabel, pickLevel, problemText, type HierOption, type HierPick, type HierProblem } from '@/lib/client/hier';
import { sapConfig } from '@/lib/sap/config';

const ROW_H = 34;
const one = (v: string) => (v ? [v] : []);

const NO_WERKS: string[] = [];

/** A searchable single-choice list: type to narrow by description or code, pick one, or choose "All". */
function LevelCombo({ label, opts, value, disabled, onPick }: { label: string; opts: HierOption[] | null; value: string; disabled: boolean; onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const chosen = (opts ?? []).find((o) => o.code === value);
  const needle = text.trim().toLowerCase();
  const shown = (opts ?? []).filter((o) => !needle || o.code.toLowerCase().includes(needle) || (o.descr ?? '').toLowerCase().includes(needle));
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) { setOpen(false); setText(''); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const choose = (code: string) => { onPick(code); setOpen(false); setText(''); };
  const off = !opts || disabled;
  return (
    <div ref={boxRef} className="relative flex min-w-0 flex-1 flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
      <label>
        {label}
        <input
          aria-label={label} role="combobox" aria-expanded={open} autoComplete="off" disabled={off}
          className={cx(inputCls, 'mt-1 w-full normal-case tracking-normal')}
          placeholder={opts ? (chosen ? optionLabel(chosen) : `All (${opts.length}) - type to search`) : 'Loading…'}
          value={open ? text : chosen ? optionLabel(chosen) : ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setText(''); } else if (e.key === 'Enter' && shown.length === 1) { e.preventDefault(); choose(shown[0].code); } }}
        />
      </label>
      {open && !off && (
        <ul role="listbox" aria-label={`${label} options`} className="scroll-thin absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-line bg-panel py-1 text-sm normal-case tracking-normal text-ink shadow-lg">
          <li role="option" aria-selected={!value} className="cursor-pointer px-2.5 py-1.5 text-muted hover:bg-accent/5" onMouseDown={(e) => { e.preventDefault(); choose(''); }}>All ({opts?.length ?? 0})</li>
          {shown.map((o) => (
            <li key={o.code} role="option" aria-selected={o.code === value} className={cx('cursor-pointer px-2.5 py-1.5 hover:bg-accent/5', o.code === value && 'bg-accent/10 font-semibold')} onMouseDown={(e) => { e.preventDefault(); choose(o.code); }}>{optionLabel(o)}</li>
          ))}
          {!shown.length && <li className="px-2.5 py-1.5 text-xs text-muted">No match</li>}
        </ul>
      )}
    </div>
  );
}

export default function MaterialCascadePicker({ values, onChange, max, werks: werksProp = NO_WERKS, onClose, pick: pickProp, onPickChange, autoFill = false }: { values: string[]; onChange: (v: string[]) => void; max: number; werks?: string[]; onClose?: () => void; pick?: HierPick; onPickChange?: (p: HierPick) => void; autoFill?: boolean }) {
  // A stable plant list: a new array on every render would re-run the SAP calls in a loop.
  const werksKey = werksProp.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const werks = useMemo(() => werksProp, [werksKey]);
  const system = useMemo(() => { try { return sapConfig().system; } catch { return ''; } }, []);
  const [ownPick, setOwnPick] = useState<HierPick>({ brand: '', product: '', sku: '' });
  // Optional controlled pick (plant-wide costing narrows its list by it); uncontrolled = as before.
  const pick = pickProp ?? ownPick;
  const setPick = (p: HierPick) => (onPickChange ? onPickChange(p) : setOwnPick(p));
  const [brands, setBrands] = useState<HierOption[] | null>(null);
  const [products, setProducts] = useState<HierOption[] | null>(null);
  const [skus, setSkus] = useState<HierOption[] | null>(null);
  const [problem, setProblem] = useState<HierProblem | null>(null);
  const [levelError, setLevelError] = useState('');
  const [fgOnly, setFgOnly] = useState(true);
  const [q, setQ] = useState('');
  const [mats, setMats] = useState<{ rows: MaterialRow[]; capped: boolean } | null>(null);
  const [matsLoading, setMatsLoading] = useState(false);
  const [matsError, setMatsError] = useState('');

  const loadB = useCallback((force = false) => {
    setBrands(null);
    setProblem(null);
    void loadBrands({ werks }, { force }).then((r) => { setBrands(r.brands); setProblem(r.problem); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [werks.join(',')]);
  useEffect(() => { loadB(); }, [loadB]);

  // Product list follows the brand; SKU follows brand + product. Nothing chosen above = all (no filter).
  useEffect(() => {
    if (problem && problem.kind !== 'empty') return;
    const c = new AbortController();
    setLevelError('');
    setProducts(null);
    loadLevel('P', { brand: one(pick.brand), werks }, { signal: c.signal }).then(setProducts).catch((e) => { if (!c.signal.aborted) setLevelError((e as Error).message); });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick.brand, problem?.kind, werks.join(',')]);
  useEffect(() => {
    if (problem && problem.kind !== 'empty') return;
    const c = new AbortController();
    setSkus(null);
    loadLevel('C', { brand: one(pick.brand), product: one(pick.product), werks }, { signal: c.signal }).then(setSkus).catch((e) => { if (!c.signal.aborted) setLevelError((e as Error).message); });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick.brand, pick.product, problem?.kind, werks.join(',')]);

  // Materials: only with a chosen level or a 2+ character search (never otherwise - SAP answers empty by design).
  // A lower choice the reloaded list no longer has is cleared.
  useEffect(() => {
    const next = keepValid(pick, products, skus);
    if (next !== pick) setPick(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, skus]);
  const criteria = useMemo(() => ({ brand: one(pick.brand), product: one(pick.product), sku: one(pick.sku), mtart: fgOnly ? 'FERT' : '', q, werks }), [pick, fgOnly, q, werks]);
  const ready = hasMaterialCriteria(criteria);
  useEffect(() => {
    if (!ready) { setMats(null); return; }
    const c = new AbortController();
    const t = setTimeout(() => {
      setMatsLoading(true);
      setMatsError('');
      loadHierMaterials(criteria, { signal: c.signal })
        .then((r) => setMats(r))
        .catch((e) => { if (!c.signal.aborted) setMatsError((e as Error).message); })
        .finally(() => { if (!c.signal.aborted) setMatsLoading(false); });
    }, q.trim() ? 300 : 0);
    return () => { clearTimeout(t); c.abort(); };
  }, [criteria, ready, q]);

  const rows = mats?.rows ?? [];
  // Screens that run on a material list (Standard cost, Sales price, Margin ...): choosing a Brand / Product / SKU puts its materials in the list
  // by itself, like the BOM costing tab runs on the chosen level; materials added by hand stay, and a changed choice replaces only the automatic ones.
  const auto = useRef<Set<string>>(new Set());
  const levelChosen = !!(pick.brand || pick.product || pick.sku);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  useEffect(() => {
    if (!autoFill || matsLoading) return;
    const manual = valuesRef.current.filter((x) => !auto.current.has(x));
    const want = levelChosen && mats && !q.trim() ? mats.rows.map((m) => m.Matnr).filter((x) => !manual.includes(x)).slice(0, Math.max(0, max - manual.length)) : [];
    if (levelChosen && !mats) return;
    if (max === 1 && want.length !== 1) { if (auto.current.size) { onChange(manual); auto.current = new Set(); } return; }
    const next = [...manual, ...want];
    auto.current = new Set(want);
    if (next.join(',') !== valuesRef.current.join(',')) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFill, mats, matsLoading, levelChosen, q, max]);
  const room = Math.max(0, max - values.length);
  const addable = rows.filter((m) => !values.includes(m.Matnr));
  const toggle = (matnr: string) => onChange(values.includes(matnr) ? values.filter((v) => v !== matnr) : [...values, matnr].slice(0, max));
  const selectAll = () => onChange([...values, ...addable.slice(0, room).map((m) => m.Matnr)]);
  const clearShown = () => onChange(values.filter((v) => !rows.some((m) => m.Matnr === v)));

  const scrollRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });

  const blocking = problem && problem.kind !== 'empty';
  const level = (label: string, key: keyof HierPick, opts: HierOption[] | null) => (
    <LevelCombo label={label} opts={opts} value={pick[key]} disabled={!!blocking} onPick={(code) => setPick(pickLevel(pick, key, code))} />
  );

  return (
    <div className="mt-2 rounded-xl border border-line bg-sunken/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-ink">Pick by Brand → Product → SKU → Material {system && <span className="ml-1 rounded bg-accent/10 px-1.5 py-px text-2xs font-bold text-accent" title="SAP system the lists come from">SAP {system}</span>}</span>
        {onClose && <button type="button" className="text-xs text-muted hover:text-ink" onClick={onClose}>Close</button>}
      </div>

      {problem && (
        <div role="status" className={cx('mb-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs', problem.kind === 'empty' ? 'border-line bg-panel text-muted' : 'border-warn/40 bg-warn/[0.07]')}>
          <AlertTriangle size={14} className="mt-px shrink-0 text-warn" />
          <span className="min-w-0 flex-1">{problemText(problem)}</span>
          <button type="button" className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline" onClick={() => loadB(true)}><RefreshCw size={12} /> Re-test</button>
        </div>
      )}

      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        {level('Brand', 'brand', blocking ? [] : brands)}
        {level('Product', 'product', blocking ? [] : products)}
        {level('SKU', 'sku', blocking ? [] : skus)}
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
          Material
          <input aria-label="Search materials" className={cx(inputCls, 'normal-case tracking-normal')} placeholder="Search number or text (2+ characters)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {levelError && <p className="mt-1 text-xs text-bad">{levelError}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={fgOnly} onChange={(e) => setFgOnly(e.target.checked)} /> Finished goods only (FERT)</label>
        {mats && <span className="text-muted">{rows.length.toLocaleString('en-IN')} material{rows.length === 1 ? '' : 's'}</span>}
        {mats?.capped && <span className="font-semibold text-warn">{HIER_MATERIALS_MAX} shown - narrow the selection</span>}
        <span className="ml-auto flex gap-1.5">
          <button type="button" className="rounded-lg border border-line bg-panel px-2.5 py-1 font-semibold text-accent hover:bg-accent/10 disabled:opacity-50" disabled={!addable.length || !room} onClick={selectAll} title={room < addable.length ? `Only ${room} more can be added (max ${max})` : undefined}>
            Select all ({Math.min(addable.length, room)})
          </button>
          <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 font-semibold text-muted hover:text-ink disabled:opacity-50" disabled={!rows.some((m) => values.includes(m.Matnr))} onClick={clearShown}><X size={12} /> Clear</button>
        </span>
      </div>

      <div ref={scrollRef} className="scroll-thin mt-2 h-56 overflow-auto rounded-lg border border-line bg-panel" role="listbox" aria-label="Materials" aria-multiselectable>
        {!ready ? (
          <p className="px-3 py-2 text-xs text-muted">Choose a brand, product or SKU, or type 2+ characters to search.</p>
        ) : matsLoading && !mats ? (
          <p className="px-3 py-2 text-xs text-muted">Loading materials from SAP…</p>
        ) : matsError ? (
          <p className="px-3 py-2 text-xs text-bad">{problemText({ kind: 'error', system, message: matsError })}</p>
        ) : !rows.length ? (
          <p className="px-3 py-2 text-xs text-muted">No materials for this selection.</p>
        ) : (
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map((vi) => {
              const m = rows[vi.index];
              const on = values.includes(m.Matnr);
              return (
                <label key={m.Matnr} role="option" aria-selected={on} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ROW_H, transform: `translateY(${vi.start}px)` }}
                  className={cx('flex cursor-pointer items-center gap-2 px-2.5 text-sm hover:bg-accent/5', on && 'bg-accent/10')}>
                  <input type="checkbox" checked={on} disabled={!on && !room} onChange={() => toggle(m.Matnr)} />
                  <span className="shrink-0 font-mono text-xs font-bold text-accent">{m.Matnr}</span>
                  <span className="min-w-0 truncate">{m.Maktx}</span>
                  <span className="ml-auto shrink-0 text-2xs text-faint">{m.Mtart} · {m.Meins}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
