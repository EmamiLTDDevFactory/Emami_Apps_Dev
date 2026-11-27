'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Paperclip, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, Filter, Inbox, Merge, RefreshCw, RotateCcw, Search, ShieldAlert, Square, Trash2, X } from 'lucide-react';
import { bulkTickets, deleteView, exportColumns, exportTickets, getCounts, getViews, listTickets, saveView, type BulkAction, type TicketQuery } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { ACTIVITY_LABEL, fmtDateTime, fmtNum, relative, SEVERITY_EDGE } from '@/lib/format';
import type { Counts, Meta, SavedView, TicketRow } from '@/lib/types';
import { RECORD_CLASS_LABEL, availableApps, fieldsFor, multiDesk, refOf, statusesFor, workspaceByKey } from '@/lib/workspaces';
import { ActivityLine, PriorityPill, SeverityPill, SlaBadge, StatusPill } from './badges';
import { Button, Card, Empty, Field, Modal, MultiSelect, Notice, Select, Skeleton, cx, inputCls } from './ui';
import { ItsmBanner } from './Itsm';

// Quick tabs; every other built-in view (and saved views) is in the "More views" menu.
const QUICK: { id: string; label: string }[] = [
  { id: 'mine', label: 'Mine' }, { id: 'unassigned', label: 'Unassigned' }, { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Pending' }, { id: 'overdue', label: 'Overdue' }, { id: '', label: 'All' },
];
const MORE: { id: string; label: string }[] = [
  { id: 'my_overdue', label: 'My overdue tickets' }, { id: 'my_groups', label: 'Open in my groups' }, { id: 'urgent_high', label: 'Urgent and high priority' },
  { id: 'due_today', label: 'Due today' }, { id: 'today', label: 'Created today' }, { id: 'watching', label: "Tickets I'm watching" },
  { id: 'resolved', label: 'Resolved' }, { id: 'spam', label: 'Spam' }, { id: 'trash', label: 'Trash' },
  // v7 Phase 3 (§J): tickets the mail classification could not place with confidence.
  { id: 'needs_classification', label: 'Needs classification' },
];

/** Application options grouped by workspace ("SAP Support · SAP – SAP ECC (current)"), for filters and bulk. */
export function appOptions(meta: Meta, all = false) {
  const list = all ? (meta.applications ?? []) : availableApps(meta);
  const multi = new Set(list.map((a) => a.workspaceId)).size > 1;
  return list.map((a) => ({ value: String(a.id), label: `${multi ? `${meta.workspaces?.find((w) => w.id === a.workspaceId)?.shortCode ?? ''} · ` : ''}${a.code} – ${a.name}` }));
}
const VIEW_LABEL: Record<string, string> = Object.fromEntries([...QUICK, ...MORE].map((v) => [v.id, v.label]));

const FILTER_KEYS: (keyof TicketQuery)[] = ['statusId', 'priority', 'severity', 'groupId', 'agentId', 'source', 'type', 'category', 'region', 'state', 'depot', 'salesOrg',
  'l2Agent', 'asmName', 'activity', 'due', 'resDue', 'frDue', 'tag', 'created', 'from', 'to', 'requesterId', 'companyId', 'hasAttachments', 'applicationId', 'recordClass',
  'sapSystem', 'tcode', 'environment', 'externalSystem', 'confidential', 'layer', 'platform', 'hosting', 'majorIncident', 'problemId', 'hasOpenApproval', 'transportStatus', 'changeType', 'testCycle', 'phase', 'defectSeverity', 'retestStatus'];
type ListKey = 'statusId' | 'priority' | 'severity' | 'groupId' | 'agentId' | 'source' | 'type' | 'category' | 'region' | 'state' | 'depot' | 'salesOrg' | 'l2Agent' | 'asmName' | 'activity' | 'resDue' | 'frDue'
  | 'applicationId' | 'recordClass' | 'environment' | 'externalSystem' | 'layer' | 'platform' | 'hosting' | 'testCycle' | 'phase' | 'defectSeverity' | 'retestStatus';
const CREATED = [
  { value: '', label: 'Any time' }, { value: '30m', label: 'Last 30 minutes' }, { value: '1h', label: 'Last hour' }, { value: '4h', label: 'Last 4 hours' },
  { value: '12h', label: 'Last 12 hours' }, { value: '24h', label: 'Last 24 hours' }, { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Last 30 days' }, { value: '2months', label: 'Last 2 months' }, { value: '6months', label: 'Last 6 months' },
];
const DUE = [{ value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'next8h', label: 'Next 8 hours' }];
const SORTS = [
  { value: 'created', label: 'Newest first' }, { value: 'created_asc', label: 'Oldest first' }, { value: 'activity', label: 'Latest activity' },
  { value: 'updated', label: 'Recently updated' }, { value: 'due', label: 'Resolution due' }, { value: 'fr_due', label: 'First response due' },
  { value: 'priority', label: 'Priority' }, { value: 'status', label: 'Status' },
];
const EXPORT_PREF = 'samadhan.exportColumns';

export default function Tickets({ preset }: { preset: TicketQuery }) {
  const { me, meta, openTicket, can, setListIds, prefs, attachments, workspace } = useSamadhan();
  // v7 Phase 3: the workspace switcher narrows the list (the counts stay queue-wide, as the views are).
  const ws = workspaceByKey(meta, workspace);
  const hasApps = (meta.applications?.length ?? 0) > 0;
  // v7 Phase 4: SAP filters when the SAP / S/4 desks are on and the switcher shows them.
  const sapFilters = hasApps && !!meta.sapLists && (meta.workspaces ?? []).some((w) => (w.key === 'SAP' || w.key === 'S4_PROGRAM') && w.enabled !== false)
    && (!ws || ws.key === 'SAP' || ws.key === 'S4_PROGRAM');
  // v7 Phase 5: IT filters when the Digital Apps / Infra & IT desks are on and the switcher shows them.
  const itFilters = hasApps && !!meta.itLists && (meta.workspaces ?? []).some((w) => (w.key === 'DIGITAL_APPS' || w.key === 'INFRA_IT') && w.enabled !== false)
    && (!ws || ws.key === 'DIGITAL_APPS' || ws.key === 'INFRA_IT');
  // v7 permission keys (same people as the old Supervisor / Admin checks by default).
  const isAdmin = can('admin.general');
  const canExport = can('ticket.export');
  const canShareViews = can('views.share');
  const canPurge = can('ticket.purge');
  // Where the list opens and how long a page is: the agent's own choice, else the Admin default.
  const startView = prefs.listView ?? meta.options['list.defaultView'] ?? 'open';
  const pageSize = Number(prefs.pageSize || meta.options['list.pageSize']) || 50;
  const [query, setQuery] = useState<TicketQuery>({ view: preset.view ?? (Object.keys(preset).length ? '' : startView), sort: 'created', page: 1, ...preset });
  const [search, setSearch] = useState(preset.q ?? '');
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(FILTER_KEYS.some((k) => preset[k]));
  const [moreOpen, setMoreOpen] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<'save' | 'export' | 'merge' | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [list, c, v] = await Promise.all([listTickets({ ...query, ...(ws ? { workspaceId: String(ws.id) } : {}), pageSize }), getCounts(), getViews()]);
      setRows(list.items);
      setTotal(list.total);
      setCounts(c);
      setViews(v);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tickets.');
    } finally {
      setBusy(false);
    }
  }, [query, pageSize, ws]);

  useEffect(() => { load(); }, [load]);
  // A new page / view / filter starts with nothing selected.
  useEffect(() => { setPicked(new Set()); }, [query]);

  // Debounced search box.
  useEffect(() => {
    const id = setTimeout(() => setQuery((q) => (q.q ?? '') === search.trim() ? q : { ...q, q: search.trim() || undefined, page: 1 }), 350);
    return () => clearTimeout(id);
  }, [search]);

  const set = (patch: TicketQuery) => { setSavedId(null); setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 })); };
  const activeFilters = FILTER_KEYS.filter((k) => query[k]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const wsFields = useMemo(() => fieldsFor(meta, ws?.key), [meta, ws]);
  const choices = useCallback((key: string) => wsFields.fields.find((f) => f.key === key)?.choices ?? [], [wsFields]);
  const categories = useMemo(() => wsFields.tree.map((c) => c.value), [wsFields]);
  // Multi-option filters travel as comma-separated values ("4,5" = Resolved or Closed).
  const many = (k: ListKey) => (query[k] ? String(query[k]).split(',') : []);
  const setMany = (k: ListKey) => (v: string[]) => set({ [k]: v.join(',') || undefined });
  const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));

  const applySaved = (v: SavedView) => {
    setMoreOpen(false);
    setSearch(v.query.q ?? '');
    setQuery({ sort: 'created', ...v.query, page: 1 });
    setSavedId(v.id);
    setShowFilters(FILTER_KEYS.some((k) => v.query[k]));
  };
  const removeSaved = async (v: SavedView) => {
    if (!window.confirm(`Delete the view "${v.name}"${v.shared ? ' for everyone' : ''}?`)) return;
    try { await deleteView(v.id); if (savedId === v.id) setSavedId(null); load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the view.'); }
  };

  const view = query.view ?? '';
  const moreViews = MORE.filter((m) => m.id !== 'needs_classification' || hasApps);
  const title = savedId ? views.find((v) => v.id === savedId)?.name ?? 'Saved view' : VIEW_LABEL[view] ?? 'Tickets';
  const allPicked = !!rows?.length && rows.every((r) => picked.has(r.id));
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const open = (id: number) => { setListIds(rows?.map((r) => r.id) ?? []); openTicket(id); };

  const bulk = async (action: BulkAction, patch?: Record<string, unknown>, confirmText?: string) => {
    const ids = [...picked];
    if (!ids.length) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const r = await bulkTickets(ids, action, patch);
      setInfo(`${fmtNum(r.done.length)} ticket${r.done.length === 1 ? '' : 's'} updated.`);
      setError(r.failed.length ? `Not changed: ${r.failed.slice(0, 5).map((f) => `#${f.id} - ${f.error}`).join(' · ')}${r.failed.length > 5 ? ` and ${r.failed.length - 5} more` : ''}` : '');
      setPicked(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the tickets.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <ItsmBanner practice={['incident', 'request', 'problem', 'change']}>Every ticket is an incident, service request, problem or change (record class) and follows its ITSM lifecycle.</ItsmBanner>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          <div role="tablist" aria-label="Views" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
            {QUICK.map((v) => (
              <button
                key={v.id || 'all'}
                role="tab"
                type="button"
                aria-selected={!savedId && view === v.id}
                onClick={() => set({ view: v.id })}
                className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition', !savedId && view === v.id ? 'bg-panel text-accent shadow-card ring-1 ring-line' : 'text-muted hover:text-ink')}
              >
                {v.label}
                {counts && counts[v.id || 'all'] != null && <span className={cx('num rounded-md px-1.5 text-2xs', v.id === 'overdue' && counts.overdue ? 'bg-bad/15 text-bad' : 'bg-line/70 text-muted')}>{fmtNum(counts[v.id || 'all'] ?? 0)}</span>}
              </button>
            ))}
          </div>
          <div className="relative">
            <Button size="md" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className={cx(Boolean(savedId || moreViews.some((m) => m.id === view)) && 'text-accent')}>
              {savedId || moreViews.some((m) => m.id === view) ? title : 'More views'} <ChevronDown size={14} />
            </Button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
                <div className="absolute left-0 z-30 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-pop">
                  {moreViews.map((v) => (
                    <button key={v.id} type="button" onClick={() => { setMoreOpen(false); set({ view: v.id }); }} className={cx('flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-sunken', !savedId && view === v.id && 'text-accent')}>
                      <span className="flex items-center gap-2">{v.id === 'spam' ? <ShieldAlert size={13} /> : v.id === 'trash' ? <Trash2 size={13} /> : v.id === 'watching' ? <Eye size={13} /> : <Inbox size={13} />}{v.label}</span>
                      {counts?.[v.id] != null && <span className="num text-2xs text-muted">{fmtNum(counts[v.id] ?? 0)}</span>}
                    </button>
                  ))}
                  <div className="my-1.5 border-t border-line px-2.5 pt-2 text-2xs font-bold uppercase tracking-wide text-faint">Saved views</div>
                  {views.length === 0 && <p className="px-2.5 pb-1.5 text-2xs text-muted">None yet - set filters, then &quot;Save view&quot;.</p>}
                  {views.map((v) => (
                    <div key={v.id} className={cx('group flex items-center rounded-lg hover:bg-sunken', savedId === v.id && 'text-accent')}>
                      <button type="button" onClick={() => applySaved(v)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold">
                        <Bookmark size={13} className="shrink-0" />
                        <span className="truncate">{v.name}</span>
                        {v.shared && <span className="shrink-0 rounded bg-accent/10 px-1 text-[10px] text-accent" title={`Shared by ${v.ownerName}`}>shared</span>}
                        <span className="num ml-auto text-2xs text-muted">{counts?.[`saved:${v.id}`] != null ? fmtNum(counts[`saved:${v.id}`] ?? 0) : ''}</span>
                      </button>
                      {(v.ownerAgentId === me.id || isAdmin) && (
                        <button type="button" onClick={() => removeSaved(v)} className="px-2 text-faint opacity-0 hover:text-bad group-hover:opacity-100" aria-label={`Delete view ${v.name}`}><X size={13} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={hasApps ? 'MSFA-100123, subject, requester, DB code' : 'Ticket no., subject, requester, DB code, MR UID'} aria-label="Search tickets" className={cx(inputCls, 'w-72 max-w-full pl-8')} />
          </div>
          {hasApps && <div className="w-48" data-testid="app-filter"><MultiSelect label="Application" values={many('applicationId')} onChange={setMany('applicationId')} options={appOptions(meta, true)} /></div>}
          <Button size="md" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <Filter size={14} /> Filters{activeFilters.length > 0 && <span className="num rounded-md bg-accent/15 px-1.5 text-2xs text-accent">{activeFilters.length}</span>}
          </Button>
          <Button size="md" onClick={() => setDialog('save')} title="Save these filters as a view"><Bookmark size={14} /> <span className="hidden xl:inline">Save view</span></Button>
          {canExport && <Button size="md" onClick={() => setDialog('export')} title="Export the tickets in this list"><Download size={14} /> <span className="hidden xl:inline">Export</span></Button>}
          <Button size="md" onClick={load} disabled={busy} aria-label="Refresh"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></Button>
        </div>
      </div>

      {showFilters && (
        <Card bodyClass="p-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            <MultiSelect label="Status" values={many('statusId')} onChange={setMany('statusId')} options={statusesFor(meta, ws?.id).map((s) => ({ value: String(s.id), label: s.name }))} />
            <MultiSelect label="Priority" values={many('priority')} onChange={setMany('priority')} options={Object.entries(meta.priorities).reverse().map(([k, l]) => ({ value: k, label: l }))} />
            <MultiSelect label="Severity" values={many('severity')} onChange={setMany('severity')} options={[{ value: 'FATAL', label: 'Fatal' }, { value: 'SERIOUS', label: 'Serious' }, { value: 'NORMAL', label: 'Normal' }]} />
            <MultiSelect label="Group" values={many('groupId')} onChange={setMany('groupId')} options={[{ value: 'none', label: 'No group' }, ...meta.groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
            <MultiSelect label="Agent" values={many('agentId')} onChange={setMany('agentId')} options={[{ value: 'me', label: 'Me' }, { value: 'none', label: 'Unassigned' }, ...meta.agents.filter((a) => a.active).map((a) => ({ value: String(a.id), label: a.name }))]} />
            <MultiSelect label="Source" values={many('source')} onChange={setMany('source')} options={opts(meta.sources)} />
            <MultiSelect label="Type" values={many('type')} onChange={setMany('type')} options={opts(choices('type'))} />
            <MultiSelect label={ws?.categoryLabel ?? 'Category'} values={many('category')} onChange={setMany('category')} options={opts(categories)} />
            {hasApps && <MultiSelect label="Record class" values={many('recordClass')} onChange={setMany('recordClass')} options={(meta.recordClasses ?? []).map((c) => ({ value: c, label: RECORD_CLASS_LABEL[c] ?? c }))} />}
            {sapFilters && (
              <>
                <input aria-label="SAP system" placeholder="SAP system (e.g. ECP)" value={query.sapSystem ?? ''} onChange={(e) => set({ sapSystem: e.target.value.toUpperCase() || undefined })} className={inputCls} />
                <input aria-label="T-code" placeholder="T-code (e.g. VA01)" value={query.tcode ?? ''} onChange={(e) => set({ tcode: e.target.value.toUpperCase() || undefined })} className={inputCls} />
                <MultiSelect label="Environment" values={many('environment')} onChange={setMany('environment')} options={opts(meta.sapLists?.environment ?? [])} />
                <MultiSelect label="External case" values={many('externalSystem')} onChange={setMany('externalSystem')} options={opts(meta.sapLists?.externalSystem ?? [])} />
              </>
            )}
            {hasApps && !!meta.programLists && (meta.workspaces ?? []).some((w) => w.key === 'S4_PROGRAM' && w.available) && (!ws || ws.key === 'S4_PROGRAM') && (
              <>
                <MultiSelect label="Test cycle" values={many('testCycle')} onChange={setMany('testCycle')} options={opts(meta.programLists.testCycle)} />
                <MultiSelect label="Severity" values={many('defectSeverity')} onChange={setMany('defectSeverity')} options={opts(meta.programLists.defectSeverity)} />
                <MultiSelect label="Activate phase" values={many('phase')} onChange={setMany('phase')} options={opts(meta.programLists.activatePhase)} />
                <MultiSelect label="Retest" values={many('retestStatus')} onChange={setMany('retestStatus')} options={opts(meta.programLists.retestStatus)} />
              </>
            )}
            {itFilters && (
              <>
                <MultiSelect label="Layer" values={many('layer')} onChange={setMany('layer')} options={opts(meta.itLists?.layer ?? [])} />
                <MultiSelect label="Platform" values={many('platform')} onChange={setMany('platform')} options={opts(meta.itLists?.platform ?? [])} />
                <MultiSelect label="Hosting" values={many('hosting')} onChange={setMany('hosting')} options={opts(meta.itLists?.hosting ?? [])} />
              </>
            )}
            {hasApps && multiDesk(meta) && <Select label="Major incidents" value={query.majorIncident ?? ''} onChange={(v) => set({ majorIncident: v || undefined })} options={[{ value: '', label: 'Any ticket' }, { value: '1', label: 'Major incidents only' }]} />}
            {hasApps && multiDesk(meta) && <Select label="Approvals" value={query.hasOpenApproval ?? ''} onChange={(v) => set({ hasOpenApproval: v || undefined })} options={[{ value: '', label: 'Any approval state' }, { value: '1', label: 'Awaiting approval' }]} />}
            {can('ticket.viewConfidential') && <Select label="Confidential" value={query.confidential ?? ''} onChange={(v) => set({ confidential: v || undefined })} options={[{ value: '', label: 'All tickets' }, { value: '1', label: 'Confidential only' }]} />}
            <MultiSelect label="Region" values={many('region')} onChange={setMany('region')} options={opts(choices('region'))} />
            <MultiSelect label="State" values={many('state')} onChange={setMany('state')} options={opts(choices('state'))} />
            <MultiSelect label="Depot" values={many('depot')} onChange={setMany('depot')} options={opts(choices('depot'))} />
            <MultiSelect label="Sales Org" values={many('salesOrg')} onChange={setMany('salesOrg')} options={opts(choices('salesOrg'))} />
            <MultiSelect label="L2 Agent" values={many('l2Agent')} onChange={setMany('l2Agent')} options={opts(choices('l2Agent'))} />
            <MultiSelect label="ASM" values={many('asmName')} onChange={setMany('asmName')} options={opts(choices('asmName'))} align="right" />
            <MultiSelect label="Resolution due" values={many('resDue')} onChange={setMany('resDue')} options={DUE} />
            <MultiSelect label="First response due" values={many('frDue')} onChange={setMany('frDue')} options={DUE} />
            <MultiSelect label="Last activity" values={many('activity')} onChange={setMany('activity')} options={Object.entries(ACTIVITY_LABEL).map(([k, l]) => ({ value: k, label: l }))} align="right" />
            <Select label="Created" value={query.created ?? ''} onChange={(v) => set({ created: v || undefined })} options={CREATED} />
            {attachments?.enabled && <Select label="Attachments" value={query.hasAttachments ?? ''} onChange={(v) => set({ hasAttachments: v || undefined })} options={[{ value: '', label: 'Any attachments' }, { value: '1', label: 'Has attachments' }]} />}
            <input aria-label="Tag" placeholder="Tag" value={query.tag ?? ''} onChange={(e) => set({ tag: e.target.value })} className={inputCls} />
            <label className="flex items-center gap-1.5 text-2xs font-semibold text-muted">From<input type="date" value={query.from ?? ''} onChange={(e) => set({ from: e.target.value })} className={inputCls} /></label>
            <label className="flex items-center gap-1.5 text-2xs font-semibold text-muted">To<input type="date" value={query.to ?? ''} onChange={(e) => set({ to: e.target.value })} className={inputCls} /></label>
            <Select label="Sort" value={query.sort ?? 'created'} onChange={(v) => set({ sort: v })} options={SORTS} />
          </div>
          {activeFilters.length > 0 && (
            <button type="button" onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])))} className="mt-2 inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline">
              <X size={12} /> Clear filters
            </button>
          )}
        </Card>
      )}

      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {info && <Notice tone="good" onClose={() => setInfo('')}>{info}</Notice>}

      {picked.size > 0 && <BulkBar count={picked.size} view={view} busy={busy} onAction={bulk} onMerge={() => setDialog('merge')} isAdmin={canPurge} />}

      <Card bodyClass="p-0">
        {!rows ? (
          <div className="p-4"><Skeleton /></div>
        ) : rows.length === 0 ? (
          <Empty title="No tickets here" icon={Inbox}>{view === 'trash' ? 'The trash is empty.' : view === 'spam' ? 'No spam.' : 'Try another view, or clear the filters.'}</Empty>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-line px-4 py-1.5 text-2xs text-muted">
              <button type="button" onClick={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} className="flex items-center gap-1.5 font-semibold hover:text-ink" aria-label={allPicked ? 'Clear selection' : 'Select all on this page'}>
                {allPicked ? <CheckSquare size={15} className="text-accent" /> : <Square size={15} />} {allPicked ? 'Clear selection' : 'Select page'}
              </button>
              <span className="ml-auto font-semibold text-ink/70">{title}</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((t) => (
                <li key={t.id} className={cx('flex items-stretch border-l-4', SEVERITY_EDGE[t.severity], picked.has(t.id) && 'bg-accent/5')}>
                  <button type="button" onClick={() => toggle(t.id)} className="grid w-10 shrink-0 place-items-center text-muted hover:text-accent" aria-label={`Select ticket ${t.id}`} aria-pressed={picked.has(t.id)}>
                    {picked.has(t.id) ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                  </button>
                  <button type="button" onClick={() => open(t.id)} className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 py-3 pr-4 text-left transition hover:bg-sunken md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="num shrink-0 text-2xs font-bold text-muted" data-testid="ticket-ref">{refOf(meta, t)}</span>
                        <span className="truncate text-sm font-semibold">{t.subject}</span>
                        {(t.attachmentCount ?? 0) > 0 && <span className="flex shrink-0 items-center gap-0.5 text-2xs text-muted" title={`${t.attachmentCount} file(s)`} aria-label={`${t.attachmentCount} attachments`}><Paperclip size={12} />{t.attachmentCount}</span>}
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
          </>
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

      <SaveViewDialog open={dialog === 'save'} onClose={() => setDialog(null)} query={query} canShare={canShareViews} onSaved={(id) => { setDialog(null); setSavedId(id); setInfo('View saved - find it under More views.'); load(); }} />
      {canExport && <ExportDialog open={dialog === 'export'} onClose={() => setDialog(null)} query={query} total={total} title={title} />}
      <MergeDialog open={dialog === 'merge'} onClose={() => setDialog(null)} ids={[...picked]} rows={rows ?? []} onMerge={(primaryId) => { setDialog(null); bulk('merge', { primaryId }); }} />
    </div>
  );
}


function BulkBar({ count, view, busy, onAction, onMerge, isAdmin }: {
  count: number; view: string; busy: boolean; isAdmin: boolean;
  onAction: (a: BulkAction, patch?: Record<string, unknown>, confirm?: string) => void; onMerge: () => void;
}) {
  const { meta, can } = useSamadhan();
  const [tag, setTag] = useState('');
  const n = `${count} ticket${count === 1 ? '' : 's'}`;
  if (view === 'trash') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
        <span className="text-xs font-bold text-accent">{n} selected</span>
        <Button size="sm" disabled={busy} onClick={() => onAction('restore')}><RotateCcw size={13} /> Restore</Button>
        {isAdmin && <Button size="sm" variant="danger" disabled={busy} onClick={() => onAction('purge', undefined, `Delete ${n} for good? This cannot be undone.`)}><Trash2 size={13} /> Delete forever</Button>}
      </div>
    );
  }
  const pick = (label: string, options: { value: string; label: string }[], apply: (v: string) => void) => (
    <select aria-label={label} value="" disabled={busy} onChange={(e) => e.target.value && apply(e.target.value)} className="h-8 rounded-lg border border-line bg-panel px-2 text-xs font-semibold">
      <option value="">{label}…</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
      <span className="text-xs font-bold text-accent">{n} selected</span>
      {pick('Assign', [{ value: 'me', label: 'Me' }, { value: '', label: '' }, ...meta.agents.filter((a) => a.active).map((a) => ({ value: String(a.id), label: a.name }))].filter((o) => o.value !== ''), (v) => onAction('update', { agentId: v }))}
      {pick('Group', meta.groups.map((g) => ({ value: String(g.id), label: g.name })), (v) => onAction('update', { groupId: Number(v) }))}
      {pick('Status', meta.statuses.map((s) => ({ value: String(s.id), label: s.name })), (v) => onAction('update', { statusId: Number(v) }))}
      {pick('Priority', Object.entries(meta.priorities).reverse().map(([k, l]) => ({ value: k, label: l })), (v) => onAction('update', { priority: Number(v) }))}
      {(meta.applications?.length ?? 0) > 0 && can('ticket.changeApplication') && pick('Set application', appOptions(meta), (v) => onAction('update', { applicationId: Number(v) }))}
      <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (tag.trim()) { onAction('update', { addTag: tag.trim() }); setTag(''); } }}>
        <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add tag" aria-label="Add tag" className="h-8 w-24 rounded-lg border border-line bg-panel px-2 text-xs" />
      </form>
      <Button size="sm" disabled={busy} onClick={() => onAction('close', undefined, `Close ${n}? Required fields are checked for each ticket.`)}>Close</Button>
      <Button size="sm" disabled={busy || count < 2} onClick={onMerge} title="Merge into one ticket"><Merge size={13} /> Merge</Button>
      <Button size="sm" disabled={busy} onClick={() => onAction('watch')}><Eye size={13} /> Watch</Button>
      {view === 'spam'
        ? <Button size="sm" disabled={busy} onClick={() => onAction('unspam')}>Not spam</Button>
        : <Button size="sm" disabled={busy} onClick={() => onAction('spam', undefined, `Mark ${n} as spam? They leave every list except Spam.`)}><ShieldAlert size={13} /> Spam</Button>}
      <Button size="sm" variant="danger" disabled={busy} onClick={() => onAction('trash', undefined, `Move ${n} to the trash?`)}><Trash2 size={13} /> Trash</Button>
    </div>
  );
}

function SaveViewDialog({ open, onClose, query, canShare, onSaved }: { open: boolean; onClose: () => void; query: TicketQuery; canShare: boolean; onSaved: (id: number) => void }) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(''); setShared(false); setError(''); } }, [open]);
  const save = async () => {
    setBusy(true);
    try {
      const { page: _p, pageSize: _s, ...rest } = query;
      onSaved(await saveView({ name, shared, query: rest }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the view.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Save view">
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">Saves the current view, filters, search and sort under a name.</p>
        <Field label="Name" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} placeholder="e.g. Kolkata depot - sync issues" /></Field>
        {canShare && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with every agent</label>
        )}
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={save}>Save view</Button></div>
      </div>
    </Modal>
  );
}

function ExportDialog({ open, onClose, query, total, title }: { open: boolean; onClose: () => void; query: TicketQuery; total: number; title: string }) {
  const [all, setAll] = useState<string[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || all.length) return;
    exportColumns().then((c) => {
      setAll(c);
      let saved: string[] = [];
      try { saved = JSON.parse(localStorage.getItem(EXPORT_PREF) || '[]'); } catch { /* ignore */ }
      setCols(saved.filter((x) => c.includes(x)).length ? saved.filter((x) => c.includes(x)) : c);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the columns.'));
  }, [open, all.length]);
  const download = async () => {
    setBusy(true);
    setError('');
    try {
      try { localStorage.setItem(EXPORT_PREF, JSON.stringify(cols)); } catch { /* ignore */ }
      const { columns, rows } = await exportTickets(query, all.filter((c) => cols.includes(c)));
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
      XLSX.writeFile(wb, `Samadhan_Tickets_${new Date().toISOString().slice(0, 10)}.xlsx`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Export tickets" width={620}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">Exports the <b>{fmtNum(total)}</b> tickets in &quot;{title}&quot; with the current filters (up to 5,000) as an Excel file.</p>
        <div className="flex gap-3 text-2xs font-bold"><button type="button" className="text-accent hover:underline" onClick={() => setCols(all)}>Select all</button><button type="button" className="text-accent hover:underline" onClick={() => setCols([])}>Clear</button></div>
        <div className="grid max-h-80 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
          {all.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-sunken">
              <input type="checkbox" checked={cols.includes(c)} onChange={(e) => setCols((s) => (e.target.checked ? [...s, c] : s.filter((x) => x !== c)))} /> {c}
            </label>
          ))}
        </div>
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !cols.length || !total} onClick={download}><Download size={14} /> Download .xlsx</Button></div>
      </div>
    </Modal>
  );
}

function MergeDialog({ open, onClose, ids, rows, onMerge }: { open: boolean; onClose: () => void; ids: number[]; rows: TicketRow[]; onMerge: (primaryId: number) => void }) {
  const { meta } = useSamadhan();
  const [primary, setPrimary] = useState<number | null>(null);
  useEffect(() => { if (open) setPrimary(ids.length ? Math.min(...ids) : null); }, [open, ids]);
  const list = rows.filter((r) => ids.includes(r.id));
  return (
    <Modal open={open} onClose={onClose} title="Merge tickets">
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">Pick the primary ticket. The others are closed, and their conversations, calls, time logs and watchers move to it. Later email replies to them land on the primary ticket.</p>
        <div className="space-y-1">
          {list.map((r) => (
            <label key={r.id} className={cx('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', primary === r.id ? 'border-accent bg-accent/5' : 'border-line')}>
              <input type="radio" name="primary" checked={primary === r.id} onChange={() => setPrimary(r.id)} className="mt-1" />
              <span className="min-w-0"><span className="num text-2xs font-bold text-muted">{refOf(meta, r)}</span> <span className="font-semibold">{r.subject}</span><span className="block text-2xs text-muted">{r.requesterName} · {r.statusName}</span></span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!primary} onClick={() => primary && onMerge(primary)}><Merge size={14} /> Merge into {primary ? refOf(meta, rows.find((r) => r.id === primary) ?? { id: primary }) : ''}</Button></div>
      </div>
    </Modal>
  );
}
