'use client';
import { AlarmClock, AlertTriangle, CalendarClock, CheckCircle2, Clock3, Hourglass, Inbox, PauseCircle, Timer, User, UserX, Users } from 'lucide-react';
import { useSamadhan } from '@/lib/context';
import { fmtMins, fmtNum, SEVERITY_LABEL } from '@/lib/format';
import type { Dashboard as Data } from '@/lib/types';
import { BarList, HourChart } from '../charts';
import { Kpi, Pill, cx } from '../ui';
import { SEVERITIES, SEV_CLASS, health } from './charts2';
import { EmptyLine, WCard } from './frame';

type P = { data: Data };

/** The queue counters; every tile opens the matching list. */
export function KpiRow({ data }: P) {
  const { openList, meta } = useSamadhan();
  const { counts } = data;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
      <Kpi label="Open" value={fmtNum(counts.open)} icon={Inbox} onClick={() => openList({ view: 'open' })} />
      <Kpi label="Unassigned" value={fmtNum(counts.unassigned)} icon={UserX} tone={counts.unassigned ? 'warn' : 'good'} onClick={() => openList({ view: 'unassigned' })} />
      <Kpi label="Overdue" value={fmtNum(counts.overdue)} icon={AlertTriangle} tone={counts.overdue ? 'bad' : 'good'} onClick={() => openList({ view: 'overdue' })} />
      <Kpi label="Due today" value={fmtNum(counts.dueToday)} icon={CalendarClock} tone={counts.dueToday ? 'warn' : 'good'} onClick={() => openList({ view: 'due_today', sort: 'due' })} />
      <Kpi label="Due in 4 h" value={fmtNum(counts.dueSoon)} icon={AlarmClock} tone="warn" onClick={() => openList({ view: 'open', due: '240', sort: 'due' })} />
      <Kpi
        label="On hold"
        value={fmtNum(counts.onHold)}
        sub="SLA paused"
        icon={PauseCircle}
        onClick={() => openList({ view: 'open', statusId: meta.statuses.filter((s) => s.pausesSla && !s.isResolved).map((s) => s.id).join(',') })}
      />
      <Kpi label="Mine" value={fmtNum(counts.mine)} icon={User} onClick={() => openList({ view: 'mine' })} />
    </div>
  );
}

function MiniStat({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: typeof Inbox; tone?: 'good' | 'warn' | 'bad' }) {
  const t = { good: 'text-good bg-good/10', warn: 'text-warn bg-warn/10', bad: 'text-bad bg-bad/10' };
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-sunken/70 p-3">
      <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', tone ? t[tone] : 'bg-accent/10 text-accent')}><Icon size={16} aria-hidden /></span>
      <div className="min-w-0">
        <div className="truncate text-2xs font-bold uppercase tracking-wide text-muted">{label}</div>
        <div className="mt-0.5 text-xl font-extrabold tracking-tight">{value}</div>
        {sub && <div className="truncate text-2xs text-muted" title={sub}>{sub}</div>}
      </div>
    </div>
  );
}

/** Arrivals per hour today against yesterday, with today's received / resolved / response / SLA figures beside it. */
export function TrendsWidget({ data }: P) {
  const { trends } = data;
  const diff = trends.receivedToday - trends.receivedYesterday;
  const sla = trends.resolutionWithinSlaPct;
  const h = health(sla);
  return (
    <WCard sub="Tickets received per hour, IST · today against yesterday">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <HourChart hours={trends.hours} hourNow={trends.hourNow} />
        <div className="grid grid-cols-2 content-start gap-2.5">
          <MiniStat
            label="Received today"
            value={fmtNum(trends.receivedToday)}
            sub={`${diff === 0 ? 'Same as' : `${fmtNum(Math.abs(diff))} ${diff > 0 ? 'more than' : 'fewer than'}`} yesterday (${fmtNum(trends.receivedYesterday)})`}
            icon={Inbox}
          />
          <MiniStat label="Resolved today" value={fmtNum(trends.resolvedToday)} icon={CheckCircle2} tone="good" />
          <MiniStat label="Avg first response" value={fmtMins(trends.avgFirstResponseMins)} sub="Business hours, today" icon={Timer} />
          <MiniStat
            label="Within SLA"
            value={sla === null ? '—' : `${Math.round(sla)}%`}
            sub={sla === null ? 'Nothing resolved yet' : `${h === 'good' ? 'Healthy' : h === 'warn' ? 'Watch' : 'At risk'} · resolved today`}
            icon={Hourglass}
            tone={h === 'none' ? undefined : h}
          />
        </div>
      </div>
    </WCard>
  );
}

export function ByStatusWidget({ data }: P) {
  const { openList, meta } = useSamadhan();
  const rows = data.byStatus.filter((s) => s.n > 0 || !meta.statuses.find((x) => x.id === s.id)?.isResolved).map((s) => ({ key: String(s.id), label: s.name, value: s.n }));
  return (
    <WCard sub="Click a status to see its tickets">
      {rows.length === 0 ? <EmptyLine>No tickets.</EmptyLine> : <BarList unit="tickets" rows={rows} onPick={(k) => openList({ statusId: k })} />}
    </WCard>
  );
}

export function BySeverityWidget({ data }: P) {
  const { openList } = useSamadhan();
  const total = SEVERITIES.reduce((s, k) => s + data.bySeverity[k], 0);
  return (
    <WCard sub="From the Category → Function matrix · click to open">
      <BarList
        unit="open tickets"
        rows={SEVERITIES.map((s) => ({ key: s, label: SEVERITY_LABEL[s], value: data.bySeverity[s], detail: total ? `${Math.round((data.bySeverity[s] * 100) / total)}% of open` : undefined }))}
        color={(k) => SEV_CLASS[k as keyof typeof SEV_CLASS]}
        onPick={(k) => openList({ view: 'open', severity: k })}
      />
      <p className="mt-3 text-2xs text-muted"><span className="num font-bold text-ink">{fmtNum(total)}</span> open tickets in all.</p>
    </WCard>
  );
}

const AVAIL_TONE = (a: string) => (a === 'AVAILABLE' ? 'good' : a === 'UNAVAILABLE' ? 'neutral' : 'warn') as 'good' | 'neutral' | 'warn';

export function AgentLoadWidget({ data }: P) {
  const { openList, meta } = useSamadhan();
  const max = Math.max(1, ...data.byAgent.map((a) => a.open));
  return (
    <WCard title={<span className="inline-flex items-center gap-1.5"><Users size={15} className="text-accent" /> Agent load</span>} sub="Open tickets per agent and current status">
      {data.byAgent.length === 0 ? <EmptyLine icon={<Clock3 size={20} className="text-faint" />}>No agents yet.</EmptyLine> : (
        <ul className="scroll-thin -mx-1 max-h-[300px] space-y-0.5 overflow-y-auto px-1">
          {data.byAgent.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => openList({ agentId: String(a.id), view: 'open' })} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-1.5 text-left hover:bg-sunken">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-semibold">{a.name}</span>
                  <Pill tone={AVAIL_TONE(a.availability)}>{meta.agentStatuses[a.availability] ?? a.availability}</Pill>
                </span>
                <span className="num w-8 text-right text-xs font-bold">{fmtNum(a.open)}</span>
                <span className="col-span-2 h-1.5">
                  <span className="block h-full rounded-r-[4px] bg-accent/70 motion-safe:transition-[width] motion-safe:duration-500" style={{ width: a.open ? `${Math.max(2, (a.open / max) * 100)}%` : 0 }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </WCard>
  );
}
