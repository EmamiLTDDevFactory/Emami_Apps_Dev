'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Building2, LayoutDashboard, ListChecks, Radio, Smile, Users, Zap } from 'lucide-react';
import { admin } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { SEVERITY_LABEL } from '@/lib/format';
import { DASHBOARD_WIDGETS, type DashboardWidget, type Severity, type UiOptions } from '@/lib/types';
import { Button, Card, Field, Notice, Skeleton, cx, inputBase, inputCls, textareaCls } from '../ui';
import { checkboxCls, useAction, useLoad } from './shared';

const VIEWS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' }, { value: 'mine', label: 'Mine' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'pending', label: 'Pending' },
  { value: 'overdue', label: 'Overdue' }, { value: 'my_overdue', label: 'My overdue' }, { value: 'my_groups', label: 'Open in my groups' },
  { value: 'urgent_high', label: 'Urgent and high' }, { value: 'due_today', label: 'Due today' }, { value: 'today', label: 'Created today' },
  { value: 'watching', label: "I'm watching" }, { value: 'resolved', label: 'Resolved' }, { value: '', label: 'All tickets' },
];

const WIDGET_LABEL: Record<DashboardWidget, string> = {
  kpis: 'Headline numbers', insights: 'AI insights', trends: 'Trends', sla: 'SLA performance', backlog: 'Backlog over time', ageing: 'Ageing',
  risk: 'At-risk tickets', byStatus: 'By status', bySeverity: 'By severity', agentLoad: 'Agent load', leaderboard: 'Agent leaderboard',
  regionStatus: 'Region × status', categories: 'Top categories', sources: 'By source', byGroup: 'By group', todos: 'My to-dos', csat: 'Customer satisfaction',
  recent: 'Recent tickets',
};

const SEVERITIES: Severity[] = ['FATAL', 'SERIOUS', 'NORMAL'];
const RATING_KEYS = ['3', '2', '1'] as const;
const RATING_HINT: Record<(typeof RATING_KEYS)[number], string> = { '3': 'Best (3)', '2': 'Middle (2)', '1': 'Worst (1)' };
const DEFAULT_INTRO = 'Raise a support ticket with the Emami Secondary Helpdesk, or check the status of one you raised.';

interface Draft {
  'general.helpdeskName': string;
  'general.supportEmail': string;
  'general.supportPhone': string;
  'portal.intro': string;
  'csat.question': string;
  'csat.labels': Record<'1' | '2' | '3', string>;
  'export.maxRows': string;
  'list.defaultView': string;
  'list.pageSize': number;
  'severity.priority': Record<Severity, number>;
  'sources.extra': string;
  'presence.enabled': boolean;
  'dashboard.widgets': DashboardWidget[];
}

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

/** Stored setting when present, else the effective value the server sends in meta.options (which carries the defaults). */
function toDraft(s: Record<string, unknown>, o: UiOptions): Draft {
  const labels = (s['csat.labels'] && typeof s['csat.labels'] === 'object' ? s['csat.labels'] : o['csat.labels']) as Partial<Record<string, unknown>>;
  const sev = (s['severity.priority'] && typeof s['severity.priority'] === 'object' ? s['severity.priority'] : o['severity.priority']) as Partial<Record<string, unknown>>;
  const widgets = Array.isArray(s['dashboard.widgets']) ? (s['dashboard.widgets'] as unknown[]) : o['dashboard.widgets'];
  const extra = Array.isArray(s['sources.extra']) ? (s['sources.extra'] as unknown[]).map(String) : [];
  return {
    'general.helpdeskName': str(s['general.helpdeskName'], o['general.helpdeskName'] ?? ''),
    'general.supportEmail': str(s['general.supportEmail'], o['general.supportEmail'] ?? ''),
    'general.supportPhone': str(s['general.supportPhone'], o['general.supportPhone'] ?? ''),
    'portal.intro': str(s['portal.intro'], DEFAULT_INTRO),
    'csat.question': str(s['csat.question'], o['csat.question'] ?? ''),
    'csat.labels': { '3': String(labels?.['3'] ?? ''), '2': String(labels?.['2'] ?? ''), '1': String(labels?.['1'] ?? '') },
    'export.maxRows': String(s['export.maxRows'] ?? o['export.maxRows'] ?? 5000),
    'list.defaultView': str(s['list.defaultView'], o['list.defaultView'] ?? 'open'),
    'list.pageSize': Number(s['list.pageSize'] ?? o['list.pageSize'] ?? 50),
    'severity.priority': { FATAL: Number(sev?.FATAL ?? 4), SERIOUS: Number(sev?.SERIOUS ?? 3), NORMAL: Number(sev?.NORMAL ?? 1) },
    'sources.extra': extra.join(', '),
    'presence.enabled': typeof s['presence.enabled'] === 'boolean' ? s['presence.enabled'] : o['presence.enabled'] !== false,
    'dashboard.widgets': (widgets ?? []).filter((w): w is DashboardWidget => (DASHBOARD_WIDGETS as readonly unknown[]).includes(w)),
  };
}

/** Admin > General: helpdesk identity, survey wording, list and export defaults, severity → priority, sources, collaboration, dashboard. */
export function GeneralTab() {
  const { meta, reloadMeta } = useSamadhan();
  const { data, error, reload } = useLoad(admin.settings);
  const [base, setBase] = useState<Draft | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const act = useAction();
  useEffect(() => {
    if (!data) return;
    const x = toDraft(data, meta.options);
    setBase(x);
    setD(x);
    // meta.options is read once per load of the settings; a reloadMeta after saving is followed by a reload of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const changed = useMemo(() => {
    if (!d || !base) return [] as (keyof Draft)[];
    return (Object.keys(d) as (keyof Draft)[]).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(base[k]));
  }, [d, base]);

  if (error) return <Notice>{error}</Notice>;
  if (!d) return <Card><Skeleton /></Card>;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });

  const save = async () => {
    const body: Record<string, unknown> = {};
    for (const k of changed) body[k] = k === 'export.maxRows' ? Number(d[k]) : d[k];
    const ok = await act.run(() => admin.saveSettings(body), 'General settings saved.');
    if (ok) await Promise.all([reloadMeta(), reload()]);
  };

  const maxRows = Number(d['export.maxRows']);
  const maxRowsBad = !Number.isInteger(maxRows) || maxRows < 100 || maxRows > 5000;
  const widgets = d['dashboard.widgets'];
  const unused = DASHBOARD_WIDGETS.filter((w) => !widgets.includes(w));
  const move = (i: number, by: -1 | 1) => {
    const next = [...widgets];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set('dashboard.widgets', next);
  };
  const priorities = Object.entries(meta.priorities).sort((a, b) => Number(a[0]) - Number(b[0]));
  const title = (Icon: typeof Building2, text: string) => <span className="inline-flex items-center gap-2"><Icon size={15} className="text-accent" /> {text}</span>;
  const invalid = maxRowsBad || !d['general.helpdeskName'].trim() || !d['csat.question'].trim() || RATING_KEYS.some((k) => !d['csat.labels'][k].trim()) || widgets.length === 0;

  return (
    <div className="max-w-5xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={title(Building2, 'Helpdesk identity')} sub="Shown on the requester portal and in emails.">
          <div className="space-y-3">
            <Field label="Helpdesk name" required><input className={inputCls} maxLength={120} value={d['general.helpdeskName']} onChange={(e) => set('general.helpdeskName', e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Support email"><input type="email" className={inputCls} value={d['general.supportEmail']} onChange={(e) => set('general.supportEmail', e.target.value)} /></Field>
              <Field label="Support phone"><input className={inputCls} maxLength={40} value={d['general.supportPhone']} onChange={(e) => set('general.supportPhone', e.target.value)} /></Field>
            </div>
            <Field label="Portal introduction" hint={`Shown above the portal's forms. ${d['portal.intro'].length}/1000`}>
              <textarea rows={3} maxLength={1000} className={textareaCls} value={d['portal.intro']} onChange={(e) => set('portal.intro', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title={title(Smile, 'Customer satisfaction')} sub="The survey the requester gets when a ticket is closed.">
          <div className="space-y-3">
            <Field label="Question" required><textarea rows={2} maxLength={300} className={textareaCls} value={d['csat.question']} onChange={(e) => set('csat.question', e.target.value)} /></Field>
            {RATING_KEYS.map((k) => (
              <Field key={k} label={`Answer - ${RATING_HINT[k]}`} required>
                <input className={inputCls} maxLength={80} value={d['csat.labels'][k]} onChange={(e) => set('csat.labels', { ...d['csat.labels'], [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </Card>

        <Card title={title(ListChecks, 'Ticket list & export')} sub="Agents can still pick their own list view and page size.">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Default view">
                <select className={cx('h-9 w-full', inputBase)} value={d['list.defaultView']} onChange={(e) => set('list.defaultView', e.target.value)}>
                  {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Tickets per page">
                <select className={cx('h-9 w-full', inputBase)} value={d['list.pageSize']} onChange={(e) => set('list.pageSize', Number(e.target.value))}>
                  {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Most rows in one export" hint="100 to 5,000.">
              <input type="number" min={100} max={5000} step={100} className={cx(inputCls, 'w-32', maxRowsBad && 'border-bad')} value={d['export.maxRows']} onChange={(e) => set('export.maxRows', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title={title(Zap, 'Severity → priority')} sub="The priority a ticket gets from its severity (the severity matrix sets the severity).">
          <div className="space-y-2">
            {SEVERITIES.map((s) => (
              <div key={s} className="flex items-center gap-3">
                <span className="w-20 text-[13px] font-semibold">{SEVERITY_LABEL[s]}</span>
                <span className="text-faint">→</span>
                <select
                  aria-label={`Priority for ${SEVERITY_LABEL[s]}`}
                  className={cx('h-9 flex-1', inputBase)}
                  value={d['severity.priority'][s]}
                  onChange={(e) => set('severity.priority', { ...d['severity.priority'], [s]: Number(e.target.value) })}
                >
                  {(priorities.length ? priorities : [['1', 'Low'], ['2', 'Medium'], ['3', 'High'], ['4', 'Urgent']]).map(([v, l]) => <option key={v} value={Number(v)}>{v} - {l}</option>)}
                </select>
              </div>
            ))}
          </div>
        </Card>

        <Card title={title(Radio, 'Sources')} sub="Where a ticket came from.">
          <Field label="Extra ticket sources" hint={`Comma separated, up to 20. Built in: ${['Email', 'Phone', 'Portal', 'WhatsApp', 'Chat', 'Internal'].join(', ')}.`}>
            <input className={inputCls} placeholder="e.g. Field visit, Distributor meet" value={d['sources.extra']} onChange={(e) => set('sources.extra', e.target.value)} />
          </Field>
        </Card>

        <Card title={title(Users, 'Collaboration')}>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" className={cx(checkboxCls, 'mt-0.5')} checked={d['presence.enabled']} onChange={(e) => set('presence.enabled', e.target.checked)} />
            <span className="font-medium">Collision detection<span className="block text-2xs font-normal text-muted">Show who else is viewing or replying to a ticket, so two agents do not answer the same requester.</span></span>
          </label>
        </Card>
      </div>

      <Card title={title(LayoutDashboard, 'Default dashboard')} sub="Widgets, in order, for agents who have not arranged their own dashboard.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted">Shown ({widgets.length})</div>
            <ul className="space-y-1">
              {widgets.map((w, i) => (
                <li key={w} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1 text-[13px]">
                  <input type="checkbox" className={checkboxCls} checked aria-label={`Hide ${WIDGET_LABEL[w]}`} onChange={() => set('dashboard.widgets', widgets.filter((x) => x !== w))} />
                  <span className="num w-5 text-2xs text-faint">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{WIDGET_LABEL[w] ?? w}</span>
                  <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${WIDGET_LABEL[w]} up`}><ArrowUp size={13} /></Button>
                  <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === widgets.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${WIDGET_LABEL[w]} down`}><ArrowDown size={13} /></Button>
                </li>
              ))}
              {widgets.length === 0 && <li className="text-2xs text-bad">Keep at least one widget.</li>}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted">Hidden ({unused.length})</div>
            <ul className="space-y-1">
              {unused.map((w) => (
                <li key={w} className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] text-muted">
                  <input type="checkbox" className={checkboxCls} checked={false} aria-label={`Show ${WIDGET_LABEL[w]}`} onChange={() => set('dashboard.widgets', [...widgets, w])} />
                  <span className="min-w-0 flex-1 truncate">{WIDGET_LABEL[w] ?? w}</span>
                </li>
              ))}
              {unused.length === 0 && <li className="text-2xs text-faint">Every widget is shown.</li>}
            </ul>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-bg/90 px-1 py-2 backdrop-blur">
        <Button variant="primary" disabled={act.busy || changed.length === 0 || invalid} onClick={save}>Save general settings</Button>
        {changed.length > 0 && <Button disabled={act.busy} onClick={() => { setD(base); act.setMsg(null); }}>Discard changes</Button>}
        <span className="text-2xs text-muted">{changed.length ? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}` : 'No changes'}</span>
        {act.msg && <div className="w-full"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
      </div>
    </div>
  );
}
