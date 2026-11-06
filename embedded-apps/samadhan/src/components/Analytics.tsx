'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock, ArrowDown, ArrowUp, BarChart3, CheckCircle2, Download, Hourglass, Inbox, Lock, MessageSquare, Phone, PhoneIncoming,
  PhoneOutgoing, PhoneCall, RefreshCw, Repeat, Smile, Timer, Users, XCircle, Clock,
} from 'lucide-react';
import { getAnalytics, type TicketQuery } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime, fmtMins, fmtNum, istToday } from '@/lib/format';
import type { AgentPerformance, Analytics as Data, NameValue } from '@/lib/types';
import { BarList, type BarRow } from './charts';
import { Button, Card, cx, Empty, Kpi, Notice, Pill, Select, Skeleton, Tabs } from './ui';

type Tab = 'overview' | 'volume' | 'agents' | 'territory' | 'csat' | 'calls';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'volume', label: 'Volume' },
  { id: 'agents', label: 'Agents' },
  { id: 'territory', label: 'Territory & category' },
  { id: 'csat', label: 'Satisfaction' },
  { id: 'calls', label: 'Calls' },
];
const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];
const NONE = 'None';

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${fmtNum(Math.round(v * 10) / 10)}%`);
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(Math.round(v * 100) / 100));
/** Logged time as hours and minutes ("26h 05m"), never days - it is effort, not elapsed time. */
const fmtLogged = (mins: number) => {
  const m = Math.round(mins);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const slaTone = (v: number | null) => (v === null || v >= 90 ? 'good' : v >= 75 ? 'warn' : 'bad');
const dayLabel = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short' });
const rowsOf = (list: NameValue[]): BarRow[] => list.map((r) => ({ key: r.name, label: r.name, value: r.value }));

export default function Analytics() {
  const { can } = useSamadhan();
  if (!can('screen.analytics')) return <Card><Empty icon={Lock} title="Supervisors and admins only">Ask an admin if you need team analytics.</Empty></Card>;
  return <AnalyticsScreen />;
}

function AnalyticsScreen() {
  const { meta, openList, openTicket } = useSamadhan();
  const [days, setDays] = useState('30');
  const [groupId, setGroupId] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setBusy(true);
    try {
      const d = await getAnalytics({ days: Number(days), groupId: groupId ? Number(groupId) : undefined });
      if (n !== seq.current) return;
      setData(d);
      setError('');
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : 'Could not load analytics.');
    } finally {
      if (n === seq.current) setBusy(false);
    }
  }, [days, groupId]);

  useEffect(() => { load(); }, [load]);

  const drill = (q: TicketQuery) => {
    const base: TicketQuery = { view: '', from: istToday(-Number(days)) };
    if (groupId) base.groupId = groupId;
    openList({ ...base, ...q });
  };
  const pick = (make: (name: string) => TicketQuery) => (key: string) => { if (key !== NONE) drill(make(key)); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted">Team performance, volume, territory, satisfaction and calls. Times are business hours.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select label="Period" value={days} onChange={setDays} options={PERIODS} />
          <Select label="Group" value={groupId} onChange={setGroupId} options={[{ value: '', label: 'All groups' }, ...meta.groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
          <Button size="sm" onClick={load} disabled={busy}><RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh</Button>
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Analytics sections" />

      {error && data && <Notice onClose={() => setError('')}>{error}</Notice>}
      {!data ? (
        error ? <Notice>{error}</Notice> : <Card><Skeleton /></Card>
      ) : (
        <>
          {tab === 'overview' && <Overview data={data} />}
          {tab === 'volume' && <Volume data={data} />}
          {tab === 'agents' && <Agents agents={data.agents} days={data.days} />}
          {tab === 'territory' && (
            <div className="grid gap-4 md:grid-cols-2">
              <BarsCard title="By region" list={data.byRegion} onPick={pick((name) => ({ region: name }))} />
              <BarsCard title="By state" list={data.byState} onPick={pick((name) => ({ state: name }))} />
              <BarsCard title="By depot" list={data.byDepot} onPick={pick((name) => ({ depot: name }))} />
              <BarsCard title="By category" list={data.byCategory} onPick={pick((name) => ({ category: name }))} />
            </div>
          )}
          {tab === 'csat' && <Satisfaction csat={data.csat} openTicket={openTicket} />}
          {tab === 'calls' && <Calls calls={data.calls} />}
        </>
      )}
    </div>
  );
}

function BarsCard({ title, sub, list, onPick, unit = 'tickets' }: { title: string; sub?: string; list: NameValue[]; onPick?: (key: string) => void; unit?: string }) {
  return (
    <Card title={title} sub={sub ?? (onPick ? 'Created in the period - click a bar to open those tickets' : 'Created in the period')}>
      {list.length === 0 ? <p className="text-sm text-muted">Nothing in this period.</p> : <BarList rows={rowsOf(list)} unit={unit} onPick={onPick} />}
    </Card>
  );
}

// ---------- Overview ----------

function Overview({ data }: { data: Data }) {
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Created" value={fmtNum(t.created)} icon={Inbox} />
        <Kpi label="Resolved" value={fmtNum(t.resolved)} icon={CheckCircle2} tone="good" />
        <Kpi label="Unresolved" value={fmtNum(t.unresolved)} icon={Hourglass} tone={t.unresolved ? 'warn' : 'good'} />
        <Kpi label="Avg first response" value={fmtMins(t.avgFirstResponseMins)} sub="Business hours" icon={Timer} />
        <Kpi label="Avg resolution" value={fmtMins(t.avgResolutionMins)} sub="Business hours" icon={Clock} />
        <Kpi label="First-response SLA" value={pct(t.firstResponseSlaPct)} sub="Responded within SLA" icon={AlarmClock} tone={slaTone(t.firstResponseSlaPct)} />
        <Kpi label="Resolution SLA" value={pct(t.resolutionSlaPct)} sub="Resolved within SLA" icon={CheckCircle2} tone={slaTone(t.resolutionSlaPct)} />
        <Kpi label="Reopened" value={pct(t.reopenedPct)} sub="Of resolved tickets" icon={Repeat} tone={t.reopenedPct && t.reopenedPct > 10 ? 'warn' : 'accent'} />
        <Kpi label="Wrong ticket" value={pct(t.wrongTicketPct)} sub="Raised in error" icon={XCircle} tone={t.wrongTicketPct && t.wrongTicketPct > 10 ? 'warn' : 'accent'} />
        <Kpi label="Per agent per day" value={num(t.perAgentPerDay)} sub="Tickets created, per active agent" icon={Users} />
      </div>
      <Card title="Created vs resolved" sub="Tickets per day, IST">
        {data.trend.length === 0 ? <p className="text-sm text-muted">No tickets in this period.</p> : <TrendChart trend={data.trend} />}
      </Card>
    </div>
  );
}

/** Two bars per day: created (indigo) and resolved (green). Labels thin out so 90 days stays readable. */
function TrendChart({ trend }: { trend: Data['trend'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...trend.flatMap((d) => [d.created, d.resolved]));
  const step = Math.max(1, Math.ceil(trend.length / 8));
  const H = 160;
  const h = hover === null ? null : trend[hover];
  return (
    <div>
      <div className="mb-2 flex min-h-5 flex-wrap items-center gap-4 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" /> Created</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-good" /> Resolved</span>
        {h && <span className="num ml-auto font-semibold text-ink">{dayLabel(h.day)}: {fmtNum(h.created)} created · {fmtNum(h.resolved)} resolved</span>}
      </div>
      <div className="flex items-end gap-px" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {trend.map((d, i) => (
          <div
            key={d.day}
            title={`${dayLabel(d.day)}: ${d.created} created, ${d.resolved} resolved`}
            onMouseEnter={() => setHover(i)}
            className={cx('flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-t', hover === i && 'bg-sunken')}
          >
            <span className="w-1/2 rounded-t-[2px] bg-accent" style={{ height: `${(d.created / max) * 100}%`, minHeight: d.created ? 2 : 0 }} />
            <span className="w-1/2 rounded-t-[2px] bg-good" style={{ height: `${(d.resolved / max) * 100}%`, minHeight: d.resolved ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-px">
        {trend.map((d, i) => (
          <span key={d.day} className="num relative flex-1 text-2xs text-faint">
            {i % step === 0 && <span className="absolute left-0 whitespace-nowrap">{dayLabel(d.day)}</span>}
          </span>
        ))}
      </div>
      <div className="h-4" />
    </div>
  );
}

// ---------- Volume ----------

const HEAT_SHADES = [0, 0.2, 0.4, 0.6, 0.85];

function Volume({ data }: { data: Data }) {
  const max = Math.max(0, ...data.heat.flatMap((r) => r.hours));
  const shade = (n: number) => (n === 0 || max === 0 ? 0 : HEAT_SHADES[Math.min(4, Math.max(1, Math.ceil((n / max) * 4)))]);
  return (
    <div className="space-y-4">
      <Card title="When tickets arrive" sub="Tickets created by day of week and hour, IST">
        <div className="scroll-thin overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[2px]">
              <span />
              {Array.from({ length: 24 }, (_, hr) => (
                <span key={hr} className="num text-center text-2xs text-faint">{hr % 3 === 0 ? String(hr).padStart(2, '0') : ''}</span>
              ))}
              {data.heat.map((row) => (
                <div key={row.dow} className="contents">
                  <span className="pr-1 text-2xs font-semibold text-muted">{row.dow}</span>
                  {row.hours.map((n, hr) => (
                    <span
                      key={hr}
                      title={`${row.dow} ${String(hr).padStart(2, '0')}:00-${String(hr).padStart(2, '0')}:59: ${fmtNum(n)} ticket${n === 1 ? '' : 's'}`}
                      className="relative h-6 overflow-hidden rounded-[3px] bg-sunken"
                    >
                      <span className="absolute inset-0 bg-accent" style={{ opacity: shade(n) }} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-2xs text-muted">
          <span>Fewer</span>
          {HEAT_SHADES.map((o, i) => (
            <span key={i} className="relative h-3 w-5 overflow-hidden rounded-[3px] bg-sunken"><span className="absolute inset-0 bg-accent" style={{ opacity: o }} /></span>
          ))}
          <span>More</span>
          <span className="num ml-2 text-faint">busiest hour: {fmtNum(max)}</span>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <BarsCard title="By source" list={data.bySource} />
        <BarsCard title="By type" list={data.byType} />
        <BarsCard title="By priority" list={data.byPriority} />
        <BarsCard title="By severity" list={data.bySeverity} />
      </div>
    </div>
  );
}

// ---------- Agents ----------

type SortKey = keyof Pick<AgentPerformance, 'name' | 'assigned' | 'resolved' | 'open' | 'avgFirstResponseMins' | 'avgResolutionMins' | 'firstResponseSlaPct' | 'resolutionSlaPct' | 'csatPositivePct' | 'minutesLogged'>;
const COLS: { key: SortKey; label: string; show: (a: AgentPerformance) => string; csv: (a: AgentPerformance) => string }[] = [
  { key: 'name', label: 'Agent', show: (a) => a.name, csv: (a) => a.name },
  { key: 'assigned', label: 'Assigned', show: (a) => fmtNum(a.assigned), csv: (a) => String(a.assigned) },
  { key: 'resolved', label: 'Resolved', show: (a) => fmtNum(a.resolved), csv: (a) => String(a.resolved) },
  { key: 'open', label: 'Open', show: (a) => fmtNum(a.open), csv: (a) => String(a.open) },
  { key: 'avgFirstResponseMins', label: 'Avg first response', show: (a) => fmtMins(a.avgFirstResponseMins), csv: (a) => (a.avgFirstResponseMins === null ? '' : String(Math.round(a.avgFirstResponseMins))) },
  { key: 'avgResolutionMins', label: 'Avg resolution', show: (a) => fmtMins(a.avgResolutionMins), csv: (a) => (a.avgResolutionMins === null ? '' : String(Math.round(a.avgResolutionMins))) },
  { key: 'firstResponseSlaPct', label: 'FR SLA %', show: (a) => pct(a.firstResponseSlaPct), csv: (a) => (a.firstResponseSlaPct === null ? '' : String(a.firstResponseSlaPct)) },
  { key: 'resolutionSlaPct', label: 'Resolution SLA %', show: (a) => pct(a.resolutionSlaPct), csv: (a) => (a.resolutionSlaPct === null ? '' : String(a.resolutionSlaPct)) },
  { key: 'csatPositivePct', label: 'CSAT positive %', show: (a) => pct(a.csatPositivePct), csv: (a) => (a.csatPositivePct === null ? '' : String(a.csatPositivePct)) },
  { key: 'minutesLogged', label: 'Time logged', show: (a) => fmtLogged(a.minutesLogged), csv: (a) => String(a.minutesLogged) },
];
const CSV_HEAD = ['Agent', 'Active', 'Assigned', 'Resolved', 'Open', 'Avg first response (business mins)', 'Avg resolution (business mins)', 'FR SLA %', 'Resolution SLA %', 'CSAT positive %', 'CSAT responses', 'Minutes logged'];

/** One CSV cell: quoted, quotes doubled, and formula-looking text defused with a leading apostrophe. */
const csvCell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

function Agents({ agents, days }: { agents: AgentPerformance[]; days: number }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'resolved', desc: true });
  const sorted = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    return [...agents].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      // Missing values always sink to the bottom, whichever way the column is sorted.
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y) * dir;
      return ((x as number) - (y as number)) * dir;
    });
  }, [agents, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));

  const download = () => {
    const lines = [CSV_HEAD, ...sorted.map((a) => [a.name, a.active ? 'Yes' : 'No', ...COLS.slice(1, 9).map((c) => c.csv(a)), String(a.csatResponses), COLS[9].csv(a)])];
    const csv = '﻿' + lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Samadhan_Agent_Performance_${days}d.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Card
      title="Agent performance"
      sub="Tickets assigned in the period; times in business hours. Click a heading to sort."
      bodyClass="p-0"
      actions={<Button size="sm" onClick={download} disabled={agents.length === 0}><Download size={13} /> Download CSV</Button>}
    >
      {agents.length === 0 ? (
        <Empty icon={Users} title="No agent activity in this period" />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-muted">
                {COLS.map((c) => (
                  <th key={c.key} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={cx('whitespace-nowrap px-3 py-2 font-bold', c.key !== 'name' && 'text-right')}>
                    <button type="button" onClick={() => toggle(c.key)} className={cx('inline-flex items-center gap-1 uppercase hover:text-ink', sort.key === c.key && 'text-accent')}>
                      {c.label}
                      {sort.key === c.key && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((a) => (
                <tr key={a.id} className="hover:bg-sunken/60">
                  {COLS.map((c) => (
                    <td key={c.key} className={cx('whitespace-nowrap px-3 py-2', c.key === 'name' ? 'font-semibold' : 'num text-right')}>
                      {c.show(a)}
                      {c.key === 'name' && !a.active && <span className="ml-1.5"><Pill>Inactive</Pill></span>}
                      {c.key === 'csatPositivePct' && a.csatResponses > 0 && <span className="ml-1 text-2xs text-faint">({fmtNum(a.csatResponses)})</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- Satisfaction ----------

const RATING: Record<1 | 2 | 3, { label: string; tone: 'good' | 'warn' | 'bad'; bar: string }> = {
  3: { label: 'Extremely satisfied', tone: 'good', bar: 'bg-good' },
  2: { label: 'Neither satisfied nor dissatisfied', tone: 'warn', bar: 'bg-warn' },
  1: { label: 'Extremely dissatisfied', tone: 'bad', bar: 'bg-bad' },
};

function Satisfaction({ csat, openTicket }: { csat: Data['csat']; openTicket: (id: number) => void }) {
  if (csat.responses === 0) {
    return <Card><Empty icon={Smile} title="No survey responses yet">Surveys go out when tickets close.</Empty></Card>;
  }
  const share = (n: number) => (n / csat.responses) * 100;
  const parts: { rating: 1 | 2 | 3; n: number }[] = [{ rating: 3, n: csat.positive }, { rating: 2, n: csat.neutral }, { rating: 1, n: csat.negative }];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Responses" value={fmtNum(csat.responses)} icon={MessageSquare} />
        {parts.map((p) => (
          <Kpi
            key={p.rating}
            label={p.rating === 3 ? 'Positive' : p.rating === 2 ? 'Neutral' : 'Negative'}
            value={fmtNum(p.n)}
            sub={`${pct(share(p.n))} · ${RATING[p.rating].label}`}
            icon={Smile}
            tone={RATING[p.rating].tone}
          />
        ))}
      </div>
      <Card title="Rating split" sub="Share of survey responses">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-sunken">
          {parts.map((p) => p.n > 0 && (
            <span key={p.rating} className={cx('h-full', RATING[p.rating].bar)} style={{ width: `${share(p.n)}%` }} title={`${RATING[p.rating].label}: ${fmtNum(p.n)} (${pct(share(p.n))})`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-2xs text-muted">
          {parts.map((p) => (
            <span key={p.rating} className="inline-flex items-center gap-1.5">
              <span className={cx('h-2 w-2 rounded-sm', RATING[p.rating].bar)} /> {RATING[p.rating].label} <span className="num font-semibold text-ink">{pct(share(p.n))}</span>
            </span>
          ))}
        </div>
      </Card>
      <Card title="Recent comments" sub="What requesters wrote with their rating" bodyClass="p-2">
        {csat.comments.length === 0 ? (
          <p className="p-2 text-sm text-muted">No comments yet - requesters rated without writing anything.</p>
        ) : (
          <ul className="divide-y divide-line">
            {csat.comments.map((c, i) => (
              <li key={`${c.ticketId}-${i}`} className="space-y-1 px-2 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={RATING[c.rating].tone}>{RATING[c.rating].label}</Pill>
                  <button type="button" onClick={() => openTicket(c.ticketId)} className="num text-xs font-bold text-accent hover:underline">#{c.ticketId}</button>
                  <span className="text-2xs text-muted">{c.agentName ?? 'Unassigned'}</span>
                  <span className="ml-auto text-2xs text-faint">{fmtDateTime(c.createdAt)}</span>
                </div>
                <p className="whitespace-pre-line break-words text-[13px]">{c.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------- Calls ----------

function Calls({ calls }: { calls: Data['calls'] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Calls" value={fmtNum(calls.total)} icon={Phone} />
        <Kpi label="Outbound" value={fmtNum(calls.outbound)} icon={PhoneOutgoing} />
        <Kpi label="Inbound" value={fmtNum(calls.inbound)} icon={PhoneIncoming} />
        <Kpi label="Connected" value={fmtNum(calls.connected)} sub={calls.total ? `${pct((calls.connected / calls.total) * 100)} of calls` : undefined} icon={PhoneCall} tone="good" />
        <Kpi label="Avg length" value={calls.avgMins === null ? '—' : `${num(calls.avgMins)} min`} icon={Timer} />
      </div>
      <Card title="By outcome" sub="Calls logged on tickets in the period">
        {calls.byOutcome.length === 0 ? (
          <Empty icon={BarChart3} title="No calls logged in this period" />
        ) : (
          <BarList rows={rowsOf(calls.byOutcome)} unit="calls" />
        )}
      </Card>
    </div>
  );
}
