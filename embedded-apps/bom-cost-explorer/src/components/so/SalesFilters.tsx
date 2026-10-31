'use client';
/**
 * Sales-area, segment, days and include / exclude lists (document type, item category, customer group, customers), plus the named
 * presets. Used by the Sales price page and (reused) by the price-context popover, so both behave and save the same way.
 * The component loads nothing by itself: the lists come in as props and the "Load ..." buttons call back.
 */
import { useEffect, useState } from 'react';
import { Ban, Check, Minus, Save, Trash2 } from 'lucide-react';
import { Button, Spinner, cx, inputCls } from '../ui';
import { fmtDate } from '@/lib/format';
import { nextToggle, setToggle, toggleState } from '@/lib/so/filter';
import { deletePreset, loadPresets, savePreset, type SalesFiltersValue, type SalesPreset } from '@/lib/so/presets';
import type { ListFilter, SoAreaRow, SoFilterRow, ToggleState } from '@/lib/so/types';
import { FILTER_KINDS, areaId, areaSelection, selectedAreaIds, valuesOfKind, type ListKey } from '@/lib/so/view';

export interface SalesFiltersEditorProps {
  areas: SoAreaRow[]; areasLoading?: boolean; areasError?: string | null; onLoadAreas?: () => void; canLoadAreas?: boolean;
  segments: { code: string; text: string }[];
  value: SalesFiltersValue;
  onChange: (patch: Partial<SalesFiltersValue>) => void;
  filterRows: SoFilterRow[] | null; filterLoading?: boolean; filterError?: string | null; onLoadFilters?: () => void; canLoadFilters?: boolean;
  /** document types of rules marked "never counted" (greyed) */
  neverCounted?: ReadonlySet<string>;
  /** presets are shown when an email is given; `materials` is saved with a preset when the caller has a material list */
  email?: string; materials?: string[]; onApplyPreset?: (p: SalesPreset) => void;
}

const STATE_WORD: Record<ToggleState, string> = { neutral: 'Any', in: 'Only', ex: 'Not' };

/** Neutral -> include -> exclude -> neutral. Icon and word as well as colour. */
export function TriToggle({ state, onChange, label }: { state: ToggleState; onChange: (s: ToggleState) => void; label: string }) {
  const Icon = state === 'in' ? Check : state === 'ex' ? Ban : Minus;
  return (
    <button type="button" onClick={() => onChange(nextToggle(state))} aria-label={`${label}: ${STATE_WORD[state]}. Press to change.`} title="Any, only this value, or not this value"
      className={cx('inline-flex h-7 w-[72px] items-center justify-center gap-1 rounded-lg border text-xs font-bold', state === 'in' ? 'border-good/50 bg-good/10 text-good' : state === 'ex' ? 'border-bad/50 bg-bad/10 text-bad' : 'border-line text-muted hover:bg-sunken')}>
      <Icon size={12} aria-hidden /> {STATE_WORD[state]}
    </button>
  );
}

function KindTable({ title, rows, list, onList, never }: { title: string; rows: SoFilterRow[]; list: ListFilter; onList: (l: ListFilter) => void; never?: ReadonlySet<string> }) {
  if (!rows.length) return <div><h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</h4><p className="text-xs text-faint">No values in these orders.</p></div>;
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</h4>
      <div className="max-h-56 overflow-auto rounded-xl border border-line">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-sunken"><tr><th className="px-2 py-1 text-left">Value</th><th className="px-2 py-1 text-right">Lines</th><th className="px-2 py-1 text-right">Share</th><th className="px-2 py-1 text-left">Last</th><th className="px-2 py-1" /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const grey = !!never?.has(r.Code);
              return (
                <tr key={r.Code} className={cx('border-t border-line/60', grey && 'text-faint')}>
                  <td className="px-2 py-1"><span className="font-mono font-bold">{r.Code}</span> {r.Txt}{grey && <span className="ml-1 rounded bg-sunken px-1 text-[10px] font-bold uppercase" title="A rule marks this document type as never counted for the selling price">never counted</span>}</td>
                  <td className="num px-2 py-1 text-right">{r.NLines}</td>
                  <td className="num px-2 py-1 text-right">{r.SharePct ? `${Number(r.SharePct).toFixed(1)} %` : 'n/a'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.LastDate ? fmtDate(r.LastDate) : 'n/a'}</td>
                  <td className="px-2 py-1 text-right"><TriToggle label={`${title} ${r.Code}`} state={toggleState(list, r.Code)} onChange={(s) => onList(setToggle(list, r.Code, s))} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresetsBar({ email, materials, value, onApplyPreset }: { email: string; materials?: string[]; value: SalesFiltersValue; onApplyPreset?: (p: SalesPreset) => void }) {
  const [list, setList] = useState<SalesPreset[]>([]);
  const [name, setName] = useState('');
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => setList(loadPresets(email)), [email]);
  const save = () => {
    const r = savePreset(email, name, value, materials);
    if (r) { setList(r); setPick(name.trim()); setMsg(`Saved "${name.trim()}" in this browser.`); } else setMsg('Could not save: give it a name (browser storage may also be blocked).');
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-sunken/40 p-2.5">
      <label className="flex flex-col gap-0.5 text-xs font-semibold">Save this selection as<input className={cx(inputCls, 'w-44')} value={name} placeholder="Preset name" onChange={(e) => setName(e.target.value)} /></label>
      <Button size="sm" onClick={save} disabled={!name.trim()}><Save size={13} /> Save</Button>
      <label className="flex flex-col gap-0.5 text-xs font-semibold">Saved selections
        <select className={cx(inputCls, 'w-48')} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Saved selections">
          <option value="">{list.length ? 'Choose…' : 'None saved'}</option>
          {list.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <Button size="sm" disabled={!pick} onClick={() => { const p = list.find((x) => x.name === pick); if (p) onApplyPreset?.(p); }}>Apply</Button>
      <Button size="sm" variant="ghost" disabled={!pick} onClick={() => { setList(deletePreset(email, pick)); setPick(''); setMsg('Deleted.'); }} aria-label="Delete the chosen saved selection"><Trash2 size={13} /> Delete</Button>
      <span className="text-xs text-faint" role="status">{msg || 'Saved per user in this browser, not in SAP.'}</span>
    </div>
  );
}

export function SalesFiltersEditor(p: SalesFiltersEditorProps) {
  const { value, onChange } = p;
  const selected = selectedAreaIds(p.areas, value.vkorg, value.vtweg);
  const [kunnrDraft, setKunnrDraft] = useState(value.kunnr.ex.join(', '));
  useEffect(() => setKunnrDraft(value.kunnr.ex.join(', ')), [value.kunnr.ex]);
  const toggleArea = (id: string) => {
    const ids = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(areaSelection(p.areas, ids));
  };
  const setList = (k: ListKey) => (l: ListFilter) => onChange({ [k]: l } as Partial<SalesFiltersValue>);
  const commitKunnr = () => onChange({ kunnr: { in: value.kunnr.in, ex: Array.from(new Set(kunnrDraft.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))) } });

  return (
    <div className="flex flex-col gap-3">
      {p.email && <PresetsBar email={p.email} materials={p.materials} value={value} onApplyPreset={p.onApplyPreset} />}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <div className="mb-1 flex items-center gap-2"><h4 className="text-xs font-bold uppercase tracking-wide text-muted">Sales organisations and channels</h4>
            {p.onLoadAreas && <Button size="sm" onClick={p.onLoadAreas} disabled={!p.canLoadAreas || p.areasLoading}>{p.areasLoading ? <Spinner className="h-3.5 w-3.5" /> : null} Load sales areas</Button>}
          </div>
          {p.areasError && <p role="alert" className="text-xs text-bad">{p.areasError}</p>}
          {p.areas.length === 0 ? <p className="text-xs text-faint">{p.canLoadAreas ? 'Press "Load sales areas" to list where these materials were sold.' : 'Pick the materials first.'}</p> : (
            <div className="max-h-52 overflow-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-sunken"><tr><th className="px-2 py-1" /><th className="px-2 py-1 text-left">Sales organisation</th><th className="px-2 py-1 text-left">Channel</th><th className="px-2 py-1 text-left">Currency</th><th className="px-2 py-1 text-right">Orders</th><th className="px-2 py-1 text-left">Last order</th></tr></thead>
                <tbody>
                  {p.areas.map((a) => (
                    <tr key={areaId(a)} className="border-t border-line/60">
                      <td className="px-2 py-1"><input type="checkbox" checked={selected.includes(areaId(a))} onChange={() => toggleArea(areaId(a))} aria-label={`${a.Vkorg} ${a.OrgTxt}, channel ${a.Vtweg} ${a.ChnTxt}`} /></td>
                      <td className="px-2 py-1"><span className="font-mono font-bold">{a.Vkorg}</span> {a.OrgTxt}</td>
                      <td className="px-2 py-1"><span className="font-mono">{a.Vtweg}</span> {a.ChnTxt}</td><td className="px-2 py-1">{a.Curr || 'n/a'}</td>
                      <td className="num px-2 py-1 text-right">{a.NOrders}</td><td className="px-2 py-1 whitespace-nowrap">{a.LastDate ? fmtDate(a.LastDate) : 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-0.5 text-xs font-semibold">Segment
            <select className={inputCls} value={value.segment[0] ?? ''} onChange={(e) => onChange({ segment: e.target.value ? [e.target.value] : [] })} aria-label="Segment">
              <option value="">All segments</option>
              {p.segments.map((s) => <option key={s.code} value={s.code}>{s.code}{s.text ? ` - ${s.text}` : ''}</option>)}
            </select>
            {!p.segments.length && <span className="font-normal text-faint">The list comes with the sales areas.</span>}
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-semibold">Days back
            <input type="number" min={1} step={1} className={cx(inputCls, 'w-28')} value={value.days} onChange={(e) => { const n = Math.floor(Number(e.target.value)); if (Number.isFinite(n) && n >= 1) onChange({ days: n }); }} aria-label="Days back" />
          </label>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2"><h4 className="text-xs font-bold uppercase tracking-wide text-muted">Which orders count</h4>
          {p.onLoadFilters && <Button size="sm" onClick={p.onLoadFilters} disabled={!p.canLoadFilters || p.filterLoading}>{p.filterLoading ? <Spinner className="h-3.5 w-3.5" /> : null} Load filter lists</Button>}
          <span className="text-xs text-faint">Any = not filtered · Only = just this value · Not = leave this value out</span>
        </div>
        {p.filterError && <p role="alert" className="text-xs text-bad">{p.filterError}</p>}
        {p.filterRows ? (
          <div className="grid gap-3 xl:grid-cols-3">
            {FILTER_KINDS.map((k) => <KindTable key={k.kind} title={k.label} rows={valuesOfKind(p.filterRows!, k.kind)} list={value[k.key]} onList={setList(k.key)} never={k.key === 'auart' ? p.neverCounted : undefined} />)}
          </div>
        ) : <p className="text-xs text-faint">{p.canLoadFilters ? 'Press "Load filter lists" to see the document types, item categories and customer groups that occur.' : 'Pick the materials and a sales organisation first.'}</p>}
        <label className="mt-2 flex flex-col gap-0.5 text-xs font-semibold">Customers to leave out (codes, comma separated)
          <input className={cx(inputCls, 'max-w-xl')} value={kunnrDraft} placeholder="e.g. 1000123, 1000456" onChange={(e) => setKunnrDraft(e.target.value)} onBlur={commitKunnr} onKeyDown={(e) => { if (e.key === 'Enter') commitKunnr(); }} aria-label="Customers to leave out" />
        </label>
      </div>
    </div>
  );
}
export default SalesFiltersEditor;
