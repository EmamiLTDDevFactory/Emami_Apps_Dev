'use client';
/**
 * Add / edit an exclusion rule. Values are picked from the CDS results of the selected period (multi-select with search,
 * names, CY / PY amounts and which rule already covers a value); a pattern catches codes that may come later; the impact
 * is previewed before saving.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api, type ApiError } from '@/lib/api';
import { useApp } from '@/lib/context';
import { defaultPeriod, fyLabel, periodLabel, short, ytdLabel } from '@/lib/format';
import type { Candidate, Impact, Rule } from '@/lib/types';
import { Button, Drawer, Field, Notice, Pill, Select, Skeleton, Tabs, cx, inputCls, textareaCls } from '../ui';

const SHOW_MAX = 400;
type Show = 'all' | 'picked' | 'free';

export default function RuleEditor({ rule, onClose, onSaved }: { rule: Rule | null; onClose: () => void; onSaved: (r: Rule, isNew: boolean) => void }) {
  const { q, config, filters } = useApp();
  const [dimension, setDimension] = useState(rule?.dimension ?? 'GL');
  const [picked, setPicked] = useState<Set<string>>(new Set(rule?.values ?? []));
  const [pattern, setPattern] = useState(rule?.pattern ?? '');
  const [fromFy, setFromFy] = useState(String(rule?.fromFy ?? filters.fy));
  const [fromPeriod, setFromPeriod] = useState(String(rule?.fromPeriod ?? 1));
  const [toFy, setToFy] = useState(rule?.toFy ? String(rule.toFy) : '');
  const [toPeriod, setToPeriod] = useState(String(rule?.toPeriod ?? 12));
  const [reason, setReason] = useState(rule?.reason ?? '');
  const [active, setActive] = useState(rule?.active ?? true);
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [candErr, setCandErr] = useState('');
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [impact, setImpact] = useState<Impact | null | 'error'>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setCands(null); setCandErr('');
    api.candidates(q, dimension).then((c) => live && setCands(c)).catch((e: ApiError) => live && setCandErr(e.message));
    return () => { live = false; };
  }, [q, dimension]);

  // Impact preview, debounced.
  const values = useMemo(() => [...picked], [picked]);
  useEffect(() => {
    if (!values.length && !pattern.trim()) { setImpact(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api.previewRule(q, { dimension, values, pattern }).then((i) => live && setImpact(i)).catch(() => live && setImpact('error'));
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [q, dimension, values, pattern]);

  const byValue = useMemo(() => new Map((cands ?? []).map((c) => [c.value, c])), [cands]);
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (cands ?? []).filter((c) => {
      if (show === 'picked' && !picked.has(c.value)) return false;
      if (show === 'free' && c.ruleIds.some((id) => id !== rule?.id)) return false;
      return !s || c.value.toLowerCase().includes(s) || c.name.toLowerCase().includes(s) || c.info.toLowerCase().includes(s);
    });
  }, [cands, search, show, picked, rule?.id]);
  const visible = shown.slice(0, SHOW_MAX);
  const allShownPicked = visible.length > 0 && visible.every((c) => picked.has(c.value));
  const toggle = (v: string) => setPicked((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const toggleShown = () => setPicked((s) => { const n = new Set(s); for (const c of visible) { if (allShownPicked) n.delete(c.value); else n.add(c.value); } return n; });
  const pickedCy = values.reduce((s, v) => s + (byValue.get(v)?.cy ?? 0), 0);
  const notInData = values.filter((v) => cands && !byValue.has(v));

  async function save() {
    setErr(''); setSaving(true);
    const body = {
      dimension, values, pattern: pattern.trim(), fromFy: Number(fromFy), fromPeriod: Number(fromPeriod),
      toFy: toFy ? Number(toFy) : null, toPeriod: toFy ? Number(toPeriod) : null, reason: reason.trim(), active,
    };
    try {
      const saved = rule ? await api.updateRule(rule.id, body) : await api.createRule(body);
      onSaved(saved, !rule);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const cur = Number(defaultPeriod().fy);
  const years = [cur - 2, cur - 1, cur, cur + 1, cur + 2].map(String);
  const periods = (fy: string) => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `P${String(i + 1).padStart(2, '0')} · ${periodLabel(fy, i + 1)}` }));
  const dimLabel = config.dimensions.find((d) => d.id === dimension)?.label ?? dimension;

  return (
    <Drawer open onClose={onClose} width={900} title={<div><div className="text-2xs font-bold uppercase tracking-wide text-muted">Exclusion rule</div><div className="text-base font-extrabold">{rule ? `Edit rule #${rule.id}` : 'New rule'}</div></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[14rem_1fr]">
          <Field label="Exclude by">
            <Select label="Dimension" value={dimension} onChange={(v) => { setDimension(v); setPicked(new Set()); setSearch(''); setShow('all'); }} options={config.dimensions.map((d) => ({ value: d.id, label: d.label }))} className="w-full" />
          </Field>
          <Field label="Selected" hint={notInData.length ? `${notInData.length} picked value(s) have no postings in ${ytdLabel(filters.fy, filters.period)}: ${notInData.slice(0, 5).join(', ')}` : undefined}>
            <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-xl border border-line bg-sunken/50 px-2 py-1.5">
              {values.length === 0 && <span className="text-xs text-faint">Pick values below{pattern ? ' (or rely on the pattern)' : ''}</span>}
              {values.slice(0, 12).map((v) => (
                <button key={v} type="button" onClick={() => toggle(v)} className="rounded-md bg-accent/10 px-1.5 py-px text-2xs font-semibold text-accent hover:bg-bad/10 hover:text-bad" title="Remove">{v.replace(/^0+(?=\d)/, '')} ×</button>
              ))}
              {values.length > 12 && <Pill tone="accent">+{values.length - 12} more</Pill>}
              {values.length > 0 && <span className="ml-auto text-2xs text-muted">{values.length} · {short(pickedCy)} CY</span>}
            </div>
          </Field>
        </div>

        <div className="rounded-2xl border border-line bg-panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-2.5">
            <div className="relative min-w-[12rem] flex-1">
              <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Find ${dimLabel.toLowerCase()} by code, name or detail…`} aria-label="Search values" className={cx(inputCls, 'pl-8')} />
            </div>
            <Tabs<Show> label="Show" value={show} onChange={setShow} tabs={[{ id: 'all', label: 'All' }, { id: 'picked', label: `Selected (${values.length})` }, { id: 'free', label: 'Not yet excluded' }]} />
          </div>
          {candErr && <div className="p-3"><Notice>{candErr}</Notice></div>}
          {!cands && !candErr && <div className="p-3"><Skeleton rows={6} /></div>}
          {cands && (
            <div className="scroll-thin max-h-[22rem] overflow-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 z-10 bg-panel">
                  <tr className="border-b border-line text-2xs uppercase tracking-wide text-muted">
                    <th className="w-8 px-2 py-2"><input type="checkbox" checked={allShownPicked} onChange={toggleShown} aria-label="Select all shown" disabled={!visible.length} /></th>
                    <th className="px-2 py-2">{dimLabel}</th><th className="px-2 py-2">Details</th>
                    <th className="px-2 py-2 text-right">CY YTD</th><th className="px-2 py-2 text-right">PY YTD</th><th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((c) => {
                    const other = c.ruleIds.filter((id) => id !== rule?.id);
                    return (
                      <tr key={c.value} className={cx('cursor-pointer hover:bg-sunken', picked.has(c.value) && 'bg-accent/[0.05]')} onClick={() => toggle(c.value)}>
                        <td className="px-2 py-1.5"><input type="checkbox" checked={picked.has(c.value)} onChange={() => toggle(c.value)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${c.value}`} /></td>
                        <td className="px-2 py-1.5"><div className="font-semibold">{c.value.replace(/^0+(?=\d)/, '')}</div>{c.name && <div className="max-w-[16rem] truncate text-2xs text-muted" title={c.name}>{c.name}</div>}</td>
                        <td className="max-w-[14rem] truncate px-2 py-1.5 text-2xs text-muted" title={c.info}>{c.info}{c.lines ? ` · ${c.lines} lines` : ''}</td>
                        <td className="num px-2 py-1.5 text-right font-semibold">{short(c.cy)}</td>
                        <td className="num px-2 py-1.5 text-right text-muted">{short(c.py)}</td>
                        <td className="px-2 py-1.5">{other.length > 0 && <Pill tone="warn" title="Already excluded by these rules">rule #{other.join(', #')}</Pill>}</td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted">No values match.</td></tr>}
                </tbody>
              </table>
              {shown.length > SHOW_MAX && <p className="border-t border-line px-3 py-2 text-2xs text-muted">Showing {SHOW_MAX} of {shown.length} - narrow the search to see the rest.</p>}
            </div>
          )}
          <p className="border-t border-line px-3 py-2 text-2xs text-faint">Values with postings in {ytdLabel(filters.fy, filters.period)} or the same period last year, largest CY first.</p>
        </div>

        <Field label="Pattern (optional)" hint="For codes that may come later: a range 508000-508099, a wildcard EH19* or 5080??, several separated by commas. Leading zeros of numbers are ignored.">
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. 508000-508099, EH19*" className={inputCls} aria-label="Pattern" />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Effective from FY"><Select label="From fiscal year" value={fromFy} onChange={setFromFy} options={years.map((y) => ({ value: y, label: fyLabel(y) }))} className="w-full" /></Field>
          <Field label="From period"><Select label="From period" value={fromPeriod} onChange={setFromPeriod} options={periods(fromFy)} className="w-full" /></Field>
          <Field label="Until FY"><Select label="Until fiscal year" value={toFy} onChange={setToFy} options={[{ value: '', label: 'No end' }, ...years.map((y) => ({ value: y, label: fyLabel(y) }))]} className="w-full" /></Field>
          <Field label="Until period">{toFy ? <Select label="Until period" value={toPeriod} onChange={setToPeriod} options={periods(toFy)} className="w-full" /> : <div className="h-9 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-faint">–</div>}</Field>
        </div>
        <p className="-mt-2 text-2xs text-muted">The rule applies to reports whose selected period lies in this range, and then takes the item out of CY and PY alike (like-for-like).</p>

        <Field label="Reason" required hint="Shown in the report banner and the audit log.">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} className={textareaCls} aria-label="Reason" placeholder="e.g. Corporate brand campaign - reported under Corporate, not product A&P" />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Rule is on</label>

        <div className={cx('rounded-xl border px-3 py-2 text-[13px]', impact && impact !== 'error' && impact.cy ? 'border-accent/30 bg-accent/[0.05]' : 'border-line bg-sunken/50')}>
          {impact === null && <span className="text-muted">Pick values or give a pattern to see what the rule removes.</span>}
          {impact === 'error' && <span className="text-bad">Could not work out the impact.</span>}
          {impact && impact !== 'error' && (
            <span>In {ytdLabel(filters.fy, filters.period)} this rule on its own removes <b className="num">{short(impact.cy)}</b> CY and <b className="num">{short(impact.py)}</b> PY in {impact.lines} posting line{impact.lines === 1 ? '' : 's'}{impact.matched !== undefined ? ` (${impact.matched} code${impact.matched === 1 ? '' : 's'})` : ''}.</span>
          )}
        </div>

        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving || (!values.length && !pattern.trim()) || reason.trim().length < 3}>{saving ? 'Saving…' : rule ? 'Save rule' : 'Add rule'}</Button>
        </div>
      </div>
    </Drawer>
  );
}
