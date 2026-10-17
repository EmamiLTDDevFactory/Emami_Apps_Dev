'use client';
import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, AlertTriangle, CheckCircle2, Hourglass, Inbox, PauseCircle, RefreshCw, Timer, User, UserX } from 'lucide-react';
import { getDashboard } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { fmtMins, fmtNum, fmtTime } from '@/lib/format';
import type { Dashboard as Data, Severity } from '@/lib/types';
import { BarList, HourChart } from './charts';
import { DashboardInsights } from './Insights';
import { Button, Card, Kpi, Notice, Pill, Skeleton } from './ui';

const SEV_BAR: Record<string, string> = { FATAL: 'bg-bad', SERIOUS: 'bg-warn', NORMAL: 'bg-accent' };

export default function Dashboard() {
  const { openList, meta, me } = useSetu();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await getDashboard());
      setLoadedAt(new Date().toISOString());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh every minute while the tab is visible; catch up at once when the agent comes back to it.
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  if (!data) return error ? <Notice>{error}</Notice> : <Card><Skeleton /></Card>;
  const { counts, trends } = data;
  const diff = trends.receivedToday - trends.receivedYesterday;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Good to see you, {me.name.split(' ')[0]}</h2>
          <p className="text-sm text-muted">Live queue for Emami Secondary Support{loadedAt && ` · updated ${fmtTime(loadedAt)}`}</p>
        </div>
        <Button size="sm" onClick={load} disabled={busy}><RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh</Button>
      </div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Open" value={fmtNum(counts.open)} icon={Inbox} onClick={() => openList({ view: 'open' })} />
        <Kpi label="Unassigned" value={fmtNum(counts.unassigned)} icon={UserX} tone={counts.unassigned ? 'warn' : 'good'} onClick={() => openList({ view: 'unassigned' })} />
        <Kpi label="Overdue" value={fmtNum(counts.overdue)} icon={AlertTriangle} tone={counts.overdue ? 'bad' : 'good'} onClick={() => openList({ view: 'overdue' })} />
        <Kpi label="Due in 4 h" value={fmtNum(counts.dueSoon)} icon={AlarmClock} tone="warn" onClick={() => openList({ view: 'open', due: '240', sort: 'due' })} />
        <Kpi label="On hold" value={fmtNum(counts.onHold)} sub="SLA paused" icon={PauseCircle} onClick={() => openList({ view: 'open', statusId: meta.statuses.filter((s) => s.pausesSla && !s.isResolved).map((s) => s.id).join(',') })} />
        <Kpi label="Mine" value={fmtNum(counts.mine)} icon={User} onClick={() => openList({ view: 'mine' })} />
      </div>

      <DashboardInsights />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Today's trends" sub="Tickets received per hour, IST">
          <HourChart hours={trends.hours} hourNow={trends.hourNow} />
        </Card>
        <div className="grid gap-3">
          <Kpi
            label="Received today"
            value={fmtNum(trends.receivedToday)}
            sub={`${diff === 0 ? 'Same as' : `${Math.abs(diff)} ${diff > 0 ? 'more than' : 'fewer than'}`} yesterday (${trends.receivedYesterday})`}
            icon={Inbox}
          />
          <Kpi label="Resolved today" value={fmtNum(trends.resolvedToday)} icon={CheckCircle2} tone="good" />
          <Kpi label="Avg first response" value={fmtMins(trends.avgFirstResponseMins)} sub="Business hours, today" icon={Timer} />
          <Kpi
            label="Resolved within SLA"
            value={trends.resolutionWithinSlaPct === null ? '—' : `${trends.resolutionWithinSlaPct}%`}
            sub="Of tickets resolved today"
            icon={Hourglass}
            tone={trends.resolutionWithinSlaPct === null || trends.resolutionWithinSlaPct >= 90 ? 'good' : trends.resolutionWithinSlaPct >= 75 ? 'warn' : 'bad'}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Open by status" sub="Click a status to see its tickets">
          <BarList
            unit="tickets"
            rows={data.byStatus.filter((s) => s.n > 0 || !meta.statuses.find((x) => x.id === s.id)?.isResolved).map((s) => ({ key: String(s.id), label: s.name, value: s.n }))}
            onPick={(k) => openList({ statusId: k })}
          />
        </Card>
        <Card title="Open by severity" sub="From the Category → Function matrix">
          <BarList
            unit="open tickets"
            rows={(['FATAL', 'SERIOUS', 'NORMAL'] as Severity[]).map((s) => ({ key: s, label: s[0] + s.slice(1).toLowerCase(), value: data.bySeverity[s] }))}
            color={(k) => SEV_BAR[k]}
            onPick={(k) => openList({ view: 'open', severity: k })}
          />
        </Card>
        <Card title="Agent load" sub="Open tickets per agent and current status">
          {data.byAgent.length === 0 ? (
            <p className="text-sm text-muted">No agents yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.byAgent.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => openList({ agentId: String(a.id), view: 'open' })} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-sunken">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{a.name}</span>
                    <Pill tone={a.availability === 'AVAILABLE' ? 'good' : a.availability === 'UNAVAILABLE' ? 'bad' : 'warn'}>{meta.agentStatuses[a.availability]}</Pill>
                    <span className="num w-8 text-right text-xs font-bold">{a.open}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
