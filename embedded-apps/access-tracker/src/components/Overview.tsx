'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, History, LogIn, Rows3, Table2, MousePointerClick, UserCheck, UserX, Users } from 'lucide-react';
import { appName } from '@/lib/apps';
import { LEVELS, RECENCY, fmtNum, levelColor, recencyOf, type Recency } from '@/lib/format';
import type { Data, Go } from './App';
import { BarList, DayColumns, ShareBar } from './charts';
import { ChangeRow, ChangeTable } from './feed';
import { Card, Empty, Kpi, Tabs } from './ui';

const LAYOUT_KEY = 'access-tracker:recent-changes-layout';

export default function Overview({ data, onGo, onPerson, onApp }: { data: Data; onGo: Go; onPerson: (email: string) => void; onApp: (appId: string) => void }) {
  const { overview: o, roster, appStats, history } = data;
  // Feed or table for Recent access changes; remembered per browser (a convenience, so storage
  // failures just fall back to the feed).
  const [layout, setLayout] = useState<'feed' | 'table'>('feed');
  useEffect(() => {
    try {
      if (localStorage.getItem(LAYOUT_KEY) === 'table') setLayout('table');
    } catch {}
  }, []);
  const pickLayout = (l: 'feed' | 'table') => {
    setLayout(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {}
  };

  const usersPerApp = useMemo(() => {
    const m = new Map<string, { total: number; admins: number }>();
    for (const u of roster) for (const g of u.apps) {
      const e = m.get(g.appId) ?? { total: 0, admins: 0 };
      e.total++;
      if (g.role === 'Admin' || g.role === 'CQA') e.admins++;
      m.set(g.appId, e);
    }
    return [...m].map(([id, e]) => ({ key: id, label: appName(id), value: e.total, detail: `${e.admins} with an admin role` })).sort((a, b) => b.value - a.value);
  }, [roster]);

  const levels = LEVELS.map((l) => ({ key: l, label: l, value: roster.filter((u) => u.accessLevel === l).length, color: levelColor(l) }));

  const recency = useMemo(() => {
    const active = roster.filter((u) => u.isActive);
    return RECENCY.map((r) => ({ key: r.id, label: r.label, value: active.filter((u) => recencyOf(u.usage.lastLogin) === r.id).length }));
  }, [roster]);

  const days = useMemo(() => {
    const out: { date: string; label: string; value: number }[] = [];
    const counts = new Map<string, number>();
    for (const c of history) {
      const d = new Date(c.occurredAt);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      out.push({ date: k, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), value: counts.get(k) ?? 0 });
    }
    return out;
  }, [history]);

  const inactive = o.totalAuthorizedUsers - o.activeAuthorizedUsers;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '0%');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Access overview</h2>
        <p className="text-sm text-muted">Who can use Emami Apps, what they can open, and how much they use it.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi onClick={() => onGo('access')} icon={Users} label="Authorized users" value={fmtNum(o.totalAuthorizedUsers)} sub={`${fmtNum(o.activeAuthorizedUsers)} active · ${fmtNum(inactive)} inactive`} />
        <Kpi onClick={() => onGo('activity', { tab: 'users', buckets: ['today', 'week'] })} icon={UserCheck} tone="good" label="Signed in, last 7 days" value={fmtNum(o.activeLast7Days)} sub={`${pct(o.activeLast7Days, o.activeAuthorizedUsers)} of active users · ${fmtNum(o.activeLast30Days)} in 30 days`} />
        <Kpi onClick={() => onGo('activity', { tab: 'users', buckets: ['never'] })} icon={UserX} tone="warn" label="Never signed in" value={fmtNum(o.neverLoggedIn)} sub={`${pct(o.neverLoggedIn, o.activeAuthorizedUsers)} of active users have not used their access`} />
        <Kpi onClick={() => onGo('activity', { tab: 'apps' })} icon={MousePointerClick} label="App opens" value={fmtNum(o.totalAppOpens)} sub={`${fmtNum(o.totalLogins)} sign-ins · top: ${o.mostUsedApp ? appName(o.mostUsedApp.appId) : '—'}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Users with access, by app" sub="Granted in Manage Access - click a bar for that app's people, roles and usage">
          {usersPerApp.length ? <BarList rows={usersPerApp} unit="users" max={12} onPick={onApp} /> : <Empty title="No app grants yet" />}
        </Card>
        <div className="space-y-4">
          <Card title="Access level" sub="Who can manage access">
            <ShareBar segments={levels} unit="users" />
          </Card>
          <Card title="Last sign-in" sub="Active users only">
            <BarList rows={recency} unit="users" max={5} onPick={(b) => onGo('activity', { tab: 'users', buckets: [b as Recency] })} />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Access changes, last 30 days" sub="Adds, removals, level and app-role changes per day">
          <DayColumns days={days} unit="changes" />
        </Card>
        <Card title="Most opened apps" sub="All time, active users" actions={<button type="button" onClick={() => onGo('activity', { tab: 'apps' })} className="text-2xs font-bold text-accent hover:underline">Details</button>}>
          {appStats.length ? (
            <BarList rows={appStats.map((a) => ({ key: a.appId, label: appName(a.appId), value: a.opens, detail: `${fmtNum(a.uniqueUsers)} unique users` }))} unit="opens" max={6} onPick={onApp} />
          ) : (
            <Empty icon={LogIn} title="No app opens recorded yet" />
          )}
        </Card>
      </div>

      <Card
        title="Recent access changes"
        sub={`Latest ${Math.min(8, history.length)} of ${history.length}`}
        actions={
          <>
            <Tabs label="Show recent changes as" value={layout} onChange={pickLayout} tabs={[
              { id: 'feed', label: <span className="inline-flex items-center gap-1.5"><Rows3 size={13} /> Feed</span> },
              { id: 'table', label: <span className="inline-flex items-center gap-1.5"><Table2 size={13} /> Table</span> },
            ]} />
            <button type="button" onClick={() => onGo('changes')} className="ml-2 inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline">Full change log <ArrowRight size={12} /></button>
          </>
        }
        bodyClass={layout === 'table' && history.length ? 'p-0' : 'px-4 py-1'}
      >
        {history.length ? (
          layout === 'table' ? (
            <ChangeTable changes={history.slice(0, 8)} onPerson={onPerson} />
          ) : (
            <ul className="divide-y divide-line">{history.slice(0, 8).map((c) => <ChangeRow key={c.id} c={c} onPerson={onPerson} />)}</ul>
          )
        ) : (
          <Empty icon={History} title="No access changes recorded yet" />
        )}
      </Card>
    </div>
  );
}
