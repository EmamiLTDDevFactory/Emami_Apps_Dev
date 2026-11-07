'use client';
import { useMemo, useState } from 'react';
import { AppWindow, Search } from 'lucide-react';
import { useSamadhan } from '@/lib/context';
import type { Application } from '@/lib/types';
import { availableApps, workspaceById, wsTone } from '@/lib/workspaces';
import { cx, inputCls } from './ui';

/**
 * v7 Phase 3 (§H 7.3, §N 3a): "Which app or area?" - a searchable grid of the applications that can be picked now,
 * grouped by service desk, recently used first. Picking the application picks the desk (workspace).
 */
export default function ApplicationPicker({ value, onChange, allowInherit = false }: { value: number | null; onChange: (id: number | null) => void; allowInherit?: boolean }) {
  const { meta, prefs } = useSamadhan();
  const [q, setQ] = useState('');
  const apps = useMemo(() => availableApps(meta), [meta]);
  const recent = (prefs.recentApps ?? []).map((id) => apps.find((a) => a.id === id)).filter((a): a is Application => !!a).slice(0, 6);
  const term = q.trim().toLowerCase();
  const match = (a: Application) => !term || a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term) || a.aliases.some((x) => x.includes(term));
  const groups = useMemo(() => {
    const byWs = new Map<number, Application[]>();
    for (const a of apps) if (match(a)) { if (!byWs.has(a.workspaceId)) byWs.set(a.workspaceId, []); byWs.get(a.workspaceId)!.push(a); }
    return [...byWs.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, term]);
  const multi = new Set(apps.map((a) => a.workspaceId)).size > 1;
  const tile = (a: Application) => (
    <button key={a.id} type="button" role="radio" aria-checked={value === a.id} onClick={() => onChange(a.id)} title={a.description ?? a.name}
      className={cx('flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition', value === a.id ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'border-line bg-panel hover:border-accent/50')}>
      <span className={cx('grid h-7 w-10 shrink-0 place-items-center rounded-md border text-[10px] font-extrabold', wsTone(workspaceById(meta, a.workspaceId)))}>{a.code}</span>
      <span className="min-w-0 truncate text-xs font-semibold">{a.name}</span>
    </button>
  );
  if (!apps.length) return null;
  return (
    <div className="space-y-2" data-testid="application-picker">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className={cx(inputCls, 'pl-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps and areas (code, name or keyword)" aria-label="Search applications" />
      </div>
      <div role="radiogroup" aria-label="Application" className="space-y-2">
        {allowInherit && (
          <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)}
            className={cx('flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold', value === null ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'border-line')}>
            <AppWindow size={14} /> Same as the parent ticket
          </button>
        )}
        {!term && recent.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-faint">Recent</div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">{recent.map(tile)}</div>
          </div>
        )}
        {groups.map(([wsId, list]) => (
          <div key={wsId}>
            {multi && <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-faint">{workspaceById(meta, wsId)?.name}</div>}
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">{list.map(tile)}</div>
          </div>
        ))}
        {term && !groups.length && <p className="text-2xs text-muted">No application matches &quot;{q}&quot;.</p>}
      </div>
    </div>
  );
}
