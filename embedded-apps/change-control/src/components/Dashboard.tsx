'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, FilePlus2, Gavel, Inbox, Timer, type LucideIcon } from 'lucide-react';
import { getDashboard, type Dashboard as Data, type Me } from '@/lib/api';
import { FLOW, STATUS_LABEL } from '@/lib/labels';
import { Button, Card, Empty, Kpi, Skeleton } from './ui';
import ChangeRow from './ChangeRow';

export default function Dashboard({ me, onOpen, onNew, onList }: { me: Me; onOpen: (id: number) => void; onNew: () => void; onList: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Card><Empty title="Could not load the dashboard" icon={AlertTriangle}>{error}</Empty></Card>;
  if (!data) return <Card><Skeleton rows={10} /></Card>;

  const n = (s: keyof Data['counts']) => data.counts[s] ?? 0;
  const total = Object.values(data.counts).reduce((a, b) => a + (b ?? 0), 0);
  const first = (me.name || '').split(' ')[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">{first ? `Welcome, ${first}` : 'Welcome'}</h2>
          <p className="text-sm text-muted">{total} change requests on record</p>
        </div>
        <Button variant="primary" onClick={onNew}><FilePlus2 size={15} /> Raise a change</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Awaiting review" value={n('submitted')} icon={Inbox} onClick={onList} />
        <Kpi label="In CAB review" value={n('cab_review')} icon={Gavel} tone="warn" onClick={onList} />
        <Kpi label="Approved / in progress" value={n('approved') + n('implementing')} icon={ClipboardList} tone="good" onClick={onList} />
        <Kpi label="Avg. time to decision" value={data.avgDecisionHours != null ? `${data.avgDecisionHours} h` : '—'} sub="Submit to CAB decision" icon={Timer} />
        <Kpi label="Implementation success" value={data.successRate != null ? `${data.successRate}%` : '—'} sub="Of changes with a recorded outcome" icon={CheckCircle2} tone="good" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.queue && (
          <List title="Needs your action" sub="Changes waiting on your role - never your own" empty="Nothing is waiting on you." icon={Inbox}>
            {data.queue.map((c) => <ChangeRow key={c.id} c={c} onOpen={onOpen} />)}
          </List>
        )}
        <List title="My open changes" sub="Changes you raised that are not finished" empty="You have no open change requests." icon={ClipboardList}>
          {data.mine.map((c) => <ChangeRow key={c.id} c={c} onOpen={onOpen} />)}
        </List>
        <List title="Change schedule" sub="Upcoming windows for changes in CAB review or approved" empty="No upcoming change windows." icon={Timer}>
          {data.upcoming.map((c) => <ChangeRow key={c.id} c={c} onOpen={onOpen} schedule />)}
        </List>
        <Card title="Pipeline" sub="Every change by stage">
          <div className="space-y-2">
            {[...FLOW, 'rejected' as const, 'cancelled' as const].map((s) => (
              <div key={s} className="flex items-center gap-3 text-[13px]">
                <span className="w-28 text-muted">{STATUS_LABEL[s]}</span>
                <div className="h-2 flex-1 rounded-full bg-sunken">
                  <div className="h-2 rounded-full bg-gradient-to-r from-accent to-accent-deep" style={{ width: total ? `${(n(s) / total) * 100}%` : 0 }} />
                </div>
                <span className="num w-6 text-right font-semibold">{n(s)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function List({ title, sub, empty, icon, children }: { title: string; sub: string; empty: string; icon: LucideIcon; children: React.ReactNode[] }) {
  return (
    <Card title={title} sub={sub} bodyClass="p-0">
      {children.length ? <div className="divide-y divide-line">{children}</div> : <Empty title={empty} icon={icon} />}
    </Card>
  );
}
