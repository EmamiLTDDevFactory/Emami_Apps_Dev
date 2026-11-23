'use client';
/**
 * Mapping overrides: spend class (ATL / BTL / other) and GR Total MIS membership of each report-header group, a group for
 * report headers SAP sends that the built-in list does not know, and the media / activity bucket of any G/L account.
 */
import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Search } from 'lucide-react';
import { api, type ApiError } from '@/lib/api';
import { useApp } from '@/lib/context';
import { short } from '@/lib/format';
import type { Mapping, MappingInfo } from '@/lib/types';
import { Button, Card, Notice, Pill, Skeleton, cx, inputCls, inputBase } from '../ui';

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export default function Mappings() {
  const { q, refreshAll } = useApp();
  const [info, setInfo] = useState<MappingInfo | { error: string } | null>(null);
  const [draft, setDraft] = useState<Mapping | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    setInfo(null);
    api.mapping(q).then((i) => { setInfo(i); setDraft(JSON.parse(JSON.stringify(i.mapping))); }).catch((e: ApiError) => setInfo({ error: e.message }));
  }, [q]);

  const dirty = useMemo(() => !!info && !('error' in info) && !!draft && JSON.stringify(info.mapping) !== JSON.stringify(draft), [info, draft]);
  const gls = useMemo(() => {
    if (!info || 'error' in info) return [];
    const s = search.trim().toLowerCase();
    return info.gls.filter((g) => !s || g.gl.includes(s) || g.name.toLowerCase().includes(s) || g.header.toLowerCase().includes(s));
  }, [info, search]);

  if (!info || !draft) return <Card><Skeleton rows={10} /></Card>;
  if ('error' in info) return <Notice>{info.error}</Notice>;
  const loaded: MappingInfo = info;
  const defaults = loaded.config.defaults;
  const groupOf = (id: string) => ({ cls: draft.groups[id]?.cls ?? defaults.find((g) => g.id === id)!.cls, mis: draft.groups[id]?.mis ?? defaults.find((g) => g.id === id)!.mis });
  const setGroup = (id: string, patch: Partial<{ cls: string; mis: boolean }>) => setDraft({ ...draft, groups: { ...draft.groups, [id]: { ...groupOf(id), ...patch } } });
  const builtIn = new Set(defaults.flatMap((g) => (g.aliases ?? []).map(norm)));
  const unknownHeaders = info.headersSeen.filter((h) => !builtIn.has(norm(h.header)));

  async function save() {
    if (!draft) return;
    setBusy(true); setMsg(null);
    // Drop group entries equal to the default, so a later change of the default still applies.
    const groups = Object.fromEntries(Object.entries(draft.groups).filter(([id, o]) => { const d = defaults.find((g) => g.id === id); return d && (o.cls !== d.cls || o.mis !== d.mis); }));
    // Keep only real overrides (a bucket different from the built-in one).
    const glMedia = Object.fromEntries(Object.entries(draft.glMedia).filter(([gl, b]) => b && b !== loaded.gls.find((g) => g.gl === gl)?.defaultBucket));
    try {
      await api.saveMapping({ groups, aliases: draft.aliases, glMedia });
      setMsg({ tone: 'good', text: 'Mapping saved - every screen uses it now.' });
      const fresh = await api.mapping(q); setInfo(fresh); setDraft(JSON.parse(JSON.stringify(fresh.mapping)));
      refreshAll();
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(false); }
  }

  const saveBar = (
    <div className="flex items-center gap-2">
      {dirty && <span className="text-2xs font-semibold text-warn">Unsaved changes</span>}
      <Button size="sm" onClick={() => setDraft(JSON.parse(JSON.stringify(info.mapping)))} disabled={!dirty || busy}><RotateCcw size={13} /> Undo</Button>
      <Button size="sm" variant="primary" onClick={save} disabled={!dirty || busy}><Save size={13} /> {busy ? 'Saving…' : 'Save mapping'}</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <Card title="Report-header groups" sub="Spend class drives the ATL : BTL ratio and the media mix; GR Total MIS adds the ticked groups, GR Total LR adds them all" actions={saveBar} bodyClass="p-0">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-[12.5px]">
            <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-muted"><th className="px-3 py-2">Group</th><th className="px-3 py-2">Spend class</th><th className="px-3 py-2">In GR Total MIS</th><th className="px-3 py-2">Default</th></tr></thead>
            <tbody className="divide-y divide-line">
              {defaults.map((d) => {
                const g = groupOf(d.id); const changed = g.cls !== d.cls || g.mis !== d.mis;
                return (
                  <tr key={d.id}>
                    <td className="px-3 py-2 font-semibold">{d.label}{changed && <Pill tone="warn">changed</Pill>}</td>
                    <td className="px-3 py-2">
                      <div className="inline-flex rounded-lg bg-sunken p-0.5 ring-1 ring-inset ring-line" role="radiogroup" aria-label={`${d.label} spend class`}>
                        {info.config.classes.map((c) => (
                          <button key={c} type="button" role="radio" aria-checked={g.cls === c} onClick={() => setGroup(d.id, { cls: c })}
                            className={cx('rounded-md px-2.5 py-1 text-2xs font-bold', g.cls === c ? 'bg-panel text-accent shadow-card' : 'text-muted hover:text-ink')}>{c}</button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2"><input type="checkbox" checked={g.mis} onChange={(e) => setGroup(d.id, { mis: e.target.checked })} aria-label={`${d.label} in GR Total MIS`} /></td>
                    <td className="px-3 py-2 text-2xs text-muted">{d.cls}{d.mis ? ' · MIS' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Report headers from SAP" sub="ZREP_SEQ_MAP-RPTHDR values in the selected period. A header the app does not know shows as its own column until you map it to a group.">
        <ul className="divide-y divide-line">
          {info.headersSeen.map((h) => {
            const known = builtIn.has(norm(h.header));
            const alias = draft.aliases[norm(h.header)] ?? '';
            return (
              <li key={h.header} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                <span className="min-w-[10rem] font-semibold">{h.header || '(blank)'}</span>
                {known ? <Pill tone="good">built in → {defaults.find((d) => (d.aliases ?? []).map(norm).includes(norm(h.header)))?.label}</Pill> : (
                  <select aria-label={`Group for ${h.header}`} value={alias} onChange={(e) => { const a = { ...draft.aliases }; if (e.target.value) a[norm(h.header)] = e.target.value; else delete a[norm(h.header)]; setDraft({ ...draft, aliases: a }); }} className={cx('h-8 text-xs', inputBase)}>
                    <option value="">Own column (not mapped)</option>
                    {defaults.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                )}
                <span className="num ml-auto text-2xs text-muted">{short(h.cy)} CY</span>
              </li>
            );
          })}
        </ul>
        {unknownHeaders.length === 0 && <p className="mt-2 text-2xs text-muted">Every header in the data is mapped.</p>}
      </Card>

      <Card title={`Media / activity bucket by G/L · ${info.gls.length} accounts`} sub="Drives the media mix screen (TV, digital, print … / free issue, visibility, promotion …). Built-in: ATL accounts by number, others by keywords in the G/L name."
        actions={saveBar} bodyClass="p-0">
        <div className="border-b border-line p-2.5">
          <div className="relative max-w-sm"><Search size={14} className="absolute left-2.5 top-2.5 text-faint" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find G/L, name or header…" aria-label="Search G/L" className={cx(inputCls, 'pl-8')} /></div>
        </div>
        <div className="scroll-thin max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[40rem] text-left text-[12px]">
            <thead className="sticky top-0 bg-panel"><tr className="border-b border-line text-2xs uppercase tracking-wide text-muted"><th className="px-3 py-2">G/L</th><th className="px-3 py-2">Header</th><th className="px-3 py-2">Bucket</th><th className="px-3 py-2 text-right">CY YTD</th></tr></thead>
            <tbody className="divide-y divide-line">
              {gls.map((g) => {
                const v = draft.glMedia[g.gl] ?? g.defaultBucket;
                return (
                  <tr key={g.gl}>
                    <td className="px-3 py-1.5"><div className="font-semibold">{g.gl}</div><div className="max-w-[18rem] truncate text-2xs text-muted" title={g.name}>{g.name}</div></td>
                    <td className="px-3 py-1.5 text-2xs">{g.header}</td>
                    <td className="px-3 py-1.5">
                      <select aria-label={`Bucket for G/L ${g.gl}`} value={v} onChange={(e) => { const m = { ...draft.glMedia }; if (e.target.value === g.defaultBucket) delete m[g.gl]; else m[g.gl] = e.target.value; setDraft({ ...draft, glMedia: m }); }}
                        className={cx('h-8 text-xs', inputBase, v !== g.defaultBucket && 'border-warn/60 bg-warn/[0.06]')}>
                        {info.config.buckets.map((b) => <option key={b} value={b}>{b}{b === g.defaultBucket ? ' (default)' : ''}</option>)}
                      </select>
                    </td>
                    <td className="num px-3 py-1.5 text-right">{short(g.cy)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
