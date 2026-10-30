'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, Inbox, RefreshCw, Search, X } from 'lucide-react';
import { getCounts, listTickets, type TicketQuery } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { ACTIVITY_LABEL, fmtDateTime, fmtNum, relative, SEVERITY_EDGE } from '@/lib/format';
import type { Counts, TicketRow } from '@/lib/types';
import { ActivityLine, PriorityPill, SeverityPill, SlaBadge, StatusPill } from './badges';
import { Button, Card, Empty, MultiSelect, Notice, Select, Skeleton, cx, inputCls } from './ui';

const VIEWS: { id: string; label: string; count?: keyof Counts }[] = [
  { id: 'mine', label: 'Mine', count: 'mine' },
  { id: 'unassigned', label: 'Unassigned', count: 'unassigned' },
  { id: 'open', label: 'Open', count: 'open' },
  { id: 'pending', label: 'Pending', count: 'pending' },
  { id: 'overdue', label: 'Overdue', count: 'overdue' },
  { id: 'resolved', label: 'Resolved' },
  { id: '', label: 'All', count: 'all' },
];

const FILTER_KEYS: (keyof TicketQuery)[] = ['statusId', 'priority', 'severity', 'groupId', 'agentId', 'source', 'type', 'activity', 'due', 'tag', 'from', 'to', 'category'];
type ListKey = 'statusId' | 'priority' | 'severity' | 'groupId' | 'agentId' | 'source' | 'type' | 'activity';

export default function Tickets({ preset }: { preset: TicketQuery }) {
  const { meta, openTicket } = useSetu();
  const [query, setQuery] = useState<TicketQuery>({ view: preset.view ?? (Object.keys(preset).length ? '' : 'open'), sort: 'created', page: 1, ...preset });
  const [search, setSearch] = useState(preset.q ?? '');
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(FILTER_KEYS.some((k) => preset[k]));
  const pageSize = 50;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [list, c] = await Promise.all([listTickets({ ...query, pageSize }), getCounts()]);
      setRows(list.items);
      setTotal(list.total);
      setCounts(c);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tickets.');
    } finally {
      setBusy(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  // Debounced search box.
  useEffect(() => {
    const id = setTimeout(() => setQuery((q) => (q.q ?? '') === search.trim() ? q : { ...q, q: search.trim() || undefined, page: 1 }), 350);
    return () => clearTimeout(id);
  }, [search]);

  const set = (patch: TicketQuery) => setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }));
  const activeFilters = FILTER_KEYS.filter((k) => query[k]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const types = useMemo(() => meta.fields.find((f) => f.key === 'type')?.choices ?? [], [meta.fields]);
  const opt = (label: string) => [{ value: '', label }];
  // Multi-option filters travel as comma-separated values ("4,5" = Resolved or Closed).
  const many = (k: ListKey) => (query[k] ? String(query[k]).split(',') : []);
  const setMany = (k: ListKey) => (v: string[]) => set({ [k]: v.join(',') || undefined });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Views" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
          {VIEWS.map((v) => (
            <button
              key={v.id || 'all'}
              role="tab"
              type="button"
              aria-selected={(query.view ?? '') === v.id}
              onClick={() => set({ view: v.id })}
              className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition', (query.view ?? '') === v.id ? 'bg-panel text-accent shadow-card ring-1 ring-line' : 'text-muted hover:text-ink')}
            >
              {v.label}
              {v.count && counts && <span className={cx('num rounded-md px-1.5 text-2xs', v.id === 'overdue' && counts.overdue ? 'bg-bad/15 text-bad' : 'bg-line/70 text-muted')}>{fmtNum(counts[v.count])}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticket no., subject, requester, DB code" aria-label="Search tickets" className={cx(inputCls, 'w-72 pl-8')} />
          </div>
          <Button size="md" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <Filter size={14} /> Filters{activeFilters.length > 0 && <span className="num rounded-md bg-accent/15 px-1.5 text-2xs text-accent">{activeFilters.length}</span>}
          </Button>
          <Button size="md" onClick={load} disabled={busy} aria-label="Refresh"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></Button>
        </div>
      </div>

      {showFilters && (
        <Card bodyClass="p-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            <MultiSelect label="Status" values={many('statusId')} onChange={setMany('statusId')} options={meta.statuses.map((s) => ({ value: String(s.id), label: s.name }))} />
            <MultiSelect label="Priority" values={many('priority')} onChange={setMany('priority')} options={Object.entries(meta.priorities).reverse().map(([k, l]) => ({ value: k, label: l }))} />
            <MultiSelect label="Severity" values={many('severity')} onChange={setMany('severity')} options={[{ value: 'FATAL', label: 'Fatal' }, { value: 'SERIOUS', label: 'Serious' }, { value: 'NORMAL', label: 'Normal' }]} />
            <MultiSelect label="Group" values={many('groupId')} onChange={setMany('groupId')} options={meta.groups.map((g) => ({ value: String(g.id), label: g.name }))} />
            <MultiSelect label="Agent" values={many('agentId')} onChange={setMany('agentId')} options={[{ value: 'none', label: 'Unassigned' }, ...meta.agents.filter((a) => a.active).map((a) => ({ value: String(a.id), label: a.name }))]} />
            <MultiSelect label="Source" values={many('source')} onChange={setMany('source')} options={meta.sources.map((s) => ({ value: s, label: s }))} />
            <MultiSelect label="Type" values={many('type')} onChange={setMany('type')} options={types.map((s) => ({ value: s, label: s }))} />
            <MultiSelect label="Last activity" values={many('activity')} onChange={setMany('activity')} options={Object.entries(ACTIVITY_LABEL).map(([k, l]) => ({ value: k, label: l }))} align="right" />
            <Select label="Resolution due" value={query.due ?? ''} onChange={(v) => set({ due: v })} options={[...opt('Any due time'), { value: '15', label: 'Due in 15 min' }, { value: '60', label: 'Due in 1 hour' }, { value: '240', label: 'Due in 4 hours' }]} />
            <input aria-label="Tag" placeholder="Tag" value={query.tag ?? ''} onChange={(e) => set({ tag: e.target.value })} className={inputCls} />
            <label className="flex items-center gap-1.5 text-2xs font-semibold text-muted">From<input type="date" value={query.from ?? ''} onChange={(e) => set({ from: e.target.value })} className={inputCls} /></label>
            <label className="flex items-center gap-1.5 text-2xs font-semibold text-muted">To<input type="date" value={query.to ?? ''} onChange={(e) => set({ to: e.target.value })} className={inputCls} /></label>
            <Select label="Sort" value={query.sort ?? 'created'} onChange={(v) => set({ sort: v })} options={[{ value: 'created', label: 'Newest first' }, { value: 'activity', label: 'Latest activity' }, { value: 'updated', label: 'Recently updated' }, { value: 'due', label: 'Resolution due' }, { value: 'priority', label: 'Priority' }]} />
          </div>
          {activeFilters.length > 0 && (
            <button type="button" onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])))} className="mt-2 inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline">
              <X size={12} /> Clear filters
            </button>
          )}
        </Card>
      )}

      {error && <Notice onClose={() => setError('')}>{error}</Notice>}

      <Card bodyClass="p-0">
        {!rows ? (
          <div className="p-4"><Skeleton /></div>
        ) : rows.length === 0 ? (
          <Empty title="No tickets here" icon={Inbox}>Try another view, or clear the filters.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => openTicket(t.id)} className={cx('grid w-full grid-cols-1 gap-1.5 border-l-4 px-4 py-3 text-left transition hover:bg-sunken md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4', SEVERITY_EDGE[t.severity])}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="num text-2xs font-bold text-muted">#{t.id}</span>
                      <span className="truncate text-sm font-semibold">{t.subject}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted">
                      <span className="font-medium text-ink/80">{t.requesterName}</span>
                      {t.distributorCode && <span>· DB {t.distributorCode}</span>}
                      <span>· {t.source}</span>
                      <span title={fmtDateTime(t.createdAt)}>· {relative(t.createdAt)}</span>
                      {t.category && <span className="truncate">· {t.category}{t.function ? ` → ${t.function}` : ''}</span>}
                      {t.tags.map((tag) => <span key={tag} className="rounded bg-sunken px-1">{tag}</span>)}
                    </div>
                    <ActivityLine t={t} className="mt-1" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <SeverityPill severity={t.severity} />
                    <PriorityPill priority={t.priority} />
                    <StatusPill t={t} />
                    <span className="w-28 truncate text-2xs text-muted" title={t.groupName ?? ''}>{t.agentName ?? <em className="text-warn">Unassigned</em>}{t.groupName && <span className="block truncate text-faint">{t.groupName}</span>}</span>
                    <SlaBadge t={t} className="w-32 justify-end" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {rows && total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-2xs text-muted">
            <span className="num">{fmtNum((query.page! - 1) * pageSize + 1)}–{fmtNum(Math.min(total, query.page! * pageSize))} of {fmtNum(total)}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" disabled={query.page! <= 1} onClick={() => set({ page: query.page! - 1 })} aria-label="Previous page"><ChevronLeft size={14} /></Button>
              <span className="num">Page {query.page} of {pages}</span>
              <Button size="sm" variant="ghost" disabled={query.page! >= pages} onClick={() => set({ page: query.page! + 1 })} aria-label="Next page"><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
