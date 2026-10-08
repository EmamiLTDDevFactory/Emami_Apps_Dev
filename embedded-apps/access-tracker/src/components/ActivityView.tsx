'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, LayoutGrid, Search } from 'lucide-react';
import { getAppUserStats, type OpenStat, type RosterUser } from '@/lib/api';
import { appName } from '@/lib/apps';
import { RECENCY, downloadCsv, fmtDate, fmtNum, recencyOf, relative, stamp, type Recency } from '@/lib/format';
import { nameFromEmail } from '@/lib/hub';
import type { Data } from './App';
import { BarList } from './charts';
import { Button, Card, Drawer, Empty, LevelBadge, Person, Skeleton, Tabs, cx, inputBase } from './ui';

type SortKey = 'name' | 'lastLogin' | 'logins' | 'sessions' | 'apps';
const COLS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'name', label: 'User' },
  { key: 'lastLogin', label: 'Last sign-in', right: true },
  { key: 'logins', label: 'Sign-ins', right: true },
  { key: 'sessions', label: 'Sessions', right: true },
  { key: 'apps', label: 'Apps opened', right: true },
];

const val = (u: RosterUser, k: SortKey): string | number => {
  switch (k) {
    case 'name': return (u.usage.name || nameFromEmail(u.email)).toLowerCase();
    case 'lastLogin': return u.usage.lastLogin ? Date.parse(u.usage.lastLogin) : 0;
    case 'logins': return u.usage.logins;
    case 'sessions': return u.usage.sessionsTotal;
    case 'apps': return u.usage.appsOpened;
  }
};

export default function ActivityView({ data, onPerson }: { data: Data; onPerson: (email: string) => void }) {
  const [tab, setTab] = useState<'users' | 'apps'>('users');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Sign-in activity</h2>
          <p className="text-sm text-muted">Who is actually using their access, and which apps get opened.</p>
        </div>
        <Tabs label="Activity view" value={tab} onChange={setTab} tabs={[{ id: 'users', label: 'By user' }, { id: 'apps', label: 'By app' }]} />
      </div>
      {tab === 'users' ? <ByUser data={data} onPerson={onPerson} /> : <ByApp data={data} onPerson={onPerson} />}
    </div>
  );
}

function ByUser({ data, onPerson }: { data: Data; onPerson: (email: string) => void }) {
  const active = useMemo(() => data.roster.filter((u) => u.isActive), [data.roster]);
  const [bucket, setBucket] = useState<Recency | ''>('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'lastLogin', desc: true });

  const buckets = RECENCY.map((r) => ({ ...r, value: active.filter((u) => recencyOf(u.usage.lastLogin) === r.id).length }));

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return active
      .filter((u) => !bucket || recencyOf(u.usage.lastLogin) === bucket)
      .filter((u) => !needle || u.email.includes(needle) || (u.usage.name || '').toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = val(a, sort.key), y = val(b, sort.key);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return sort.desc ? -c : c;
      });
  }, [active, bucket, q, sort]);

  const exportCsv = () =>
    downloadCsv(
      `emami-apps-sign-in-activity-${stamp()}.csv`,
      ['Name', 'Email', 'Access level', 'Last sign-in', 'Sign-ins', 'Sessions', 'Time spent', 'Apps opened', 'Most used app'],
      rows.map((u) => [u.usage.name || nameFromEmail(u.email), u.email, u.accessLevel, u.usage.lastLogin ?? 'Never', u.usage.logins, u.usage.sessionsTotal, u.usage.timeSpent, u.usage.appsOpened, u.usage.mostUsedApp ? appName(u.usage.mostUsedApp) : '']),
    );

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {buckets.map((b) => (
          <button
            key={b.id}
            type="button"
            aria-pressed={bucket === b.id}
            onClick={() => setBucket(bucket === b.id ? '' : b.id)}
            className={cx('rounded-2xl border bg-panel px-4 py-3 text-left shadow-card transition', bucket === b.id ? 'border-accent ring-2 ring-accent/20' : 'border-line hover:border-accent/40')}
          >
            <div className="text-2xs font-bold uppercase tracking-wide text-muted">{b.label}</div>
            <div className={cx('num mt-0.5 text-xl font-extrabold', b.id === 'never' && b.value > 0 && 'text-warn')}>{fmtNum(b.value)}</div>
            <div className="num text-2xs text-muted">{active.length ? Math.round((b.value / active.length) * 100) : 0}% of active users</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-2.5 shadow-card">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" className={cx('h-9 w-full pl-8', inputBase)} />
        </label>
        {bucket && <Button onClick={() => setBucket('')}>Clear: {RECENCY.find((r) => r.id === bucket)?.label}</Button>}
        <Button onClick={exportCsv} disabled={!rows.length}><Download size={14} /> Export</Button>
      </div>

      <Card bodyClass="p-0">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-line bg-sunken/60 text-2xs font-bold uppercase tracking-wide text-muted">
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} className={cx('px-4 py-2.5', c.right && 'text-right')} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                    <button type="button" className={cx('inline-flex items-center gap-1 uppercase hover:text-ink', sort.key === c.key && 'text-accent')} onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.key !== 'name' }))}>
                      {c.label}
                      {sort.key === c.key && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right">Time spent</th>
                <th className="px-4 py-2.5">Most used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.email} onClick={() => onPerson(u.email)} className="cursor-pointer transition hover:bg-sunken/70">
                  <td className="max-w-[260px] px-4 py-2.5"><Person email={u.email} name={u.usage.name} sub={<LevelBadge level={u.accessLevel} />} /></td>
                  <td className="num whitespace-nowrap px-4 py-2.5 text-right text-xs" title={fmtDate(u.usage.lastLogin)}>
                    <span className={cx(!u.usage.lastLogin && 'font-semibold text-warn')}>{relative(u.usage.lastLogin)}</span>
                  </td>
                  <td className="num px-4 py-2.5 text-right text-xs font-semibold">{fmtNum(u.usage.logins)}</td>
                  <td className="num px-4 py-2.5 text-right text-xs">{fmtNum(u.usage.sessionsTotal)}</td>
                  <td className="num px-4 py-2.5 text-right text-xs">{fmtNum(u.usage.appsOpened)}</td>
                  <td className="num whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted">{u.usage.timeSpent || '—'}</td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-xs">{u.usage.mostUsedApp ? appName(u.usage.mostUsedApp) : <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty title="No users in this view" />}
        </div>
      </Card>
    </>
  );
}

function ByApp({ data, onPerson }: { data: Data; onPerson: (email: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const granted = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of data.roster) for (const g of u.apps) m.set(g.appId, (m.get(g.appId) ?? 0) + 1);
    return m;
  }, [data.roster]);

  const exportCsv = () =>
    downloadCsv(
      `emami-apps-app-usage-${stamp()}.csv`,
      ['App', 'Users granted', 'Unique users opened', 'Total opens', 'First opened', 'Last opened'],
      data.appStats.map((a) => [appName(a.appId), granted.get(a.appId) ?? 0, a.uniqueUsers, a.opens, fmtDate(a.firstOpened), fmtDate(a.lastOpened)]),
    );

  if (!data.appStats.length) return <Card><Empty icon={LayoutGrid} title="No app opens recorded yet" /></Card>;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2" title="Opens by app" sub="Click a bar for the people behind it">
          <BarList rows={data.appStats.map((a) => ({ key: a.appId, label: appName(a.appId), value: a.opens, detail: `${fmtNum(a.uniqueUsers)} unique users` }))} unit="opens" max={14} onPick={setOpen} />
        </Card>
        <Card className="lg:col-span-3" title="Adoption" sub="Users who opened the app vs users granted it" actions={<Button size="sm" onClick={exportCsv}><Download size={13} /> Export</Button>} bodyClass="p-0">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead className="border-b border-line bg-sunken/60 text-2xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">App</th>
                  <th className="px-3 py-2.5">Adoption</th>
                  <th className="px-3 py-2.5 text-right">Opens</th>
                  <th className="px-4 py-2.5 text-right">Last opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.appStats.map((a) => {
                  const g = granted.get(a.appId) ?? 0;
                  const pct = g ? Math.min(100, Math.round((a.uniqueUsers / g) * 100)) : null;
                  return (
                    <tr key={a.appId} onClick={() => setOpen(a.appId)} className="cursor-pointer transition hover:bg-sunken/70">
                      <td className="px-4 py-2.5 text-[13px] font-semibold">{appName(a.appId)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-24 overflow-hidden rounded bg-sunken"><span className="block h-full rounded-r-[4px] bg-accent" style={{ width: `${pct ?? 0}%` }} /></span>
                          <span className="num whitespace-nowrap text-2xs text-muted">{fmtNum(a.uniqueUsers)} / {g ? fmtNum(g) : '—'}{pct != null && ` · ${pct}%`}</span>
                        </div>
                      </td>
                      <td className="num px-3 py-2.5 text-right text-xs font-semibold">{fmtNum(a.opens)}</td>
                      <td className="num whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted">{relative(a.lastOpened)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <AppDrawer appId={open} onClose={() => setOpen(null)} onPerson={(e) => { setOpen(null); onPerson(e); }} />
    </>
  );
}

function AppDrawer({ appId, onClose, onPerson }: { appId: string | null; onClose: () => void; onPerson: (email: string) => void }) {
  const [users, setUsers] = useState<(OpenStat & { email: string })[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!appId) return;
    setUsers(null);
    setError('');
    getAppUserStats(appId).then(setUsers, (e: Error) => setError(e.message));
  }, [appId]);

  return (
    <Drawer open={Boolean(appId)} onClose={onClose} title={<div><div className="text-2xs font-bold uppercase tracking-wide text-muted">App usage</div><div className="text-lg font-extrabold">{appName(appId)}</div></div>} width={520}>
      {error ? <p className="text-sm text-bad">{error}</p> : !users ? <Skeleton rows={6} /> : !users.length ? <Empty title="Nobody has opened this app yet" /> : (
        <Card bodyClass="p-0">
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.email}>
                <button type="button" onClick={() => onPerson(u.email)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken/70">
                  <div className="min-w-0 flex-1"><Person email={u.email} sub={`First ${fmtDate(u.firstOpened)} · last ${relative(u.lastOpened)}`} /></div>
                  <span className="num text-sm font-bold">{fmtNum(u.opens)}</span>
                  <span className="text-2xs text-muted">opens</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Drawer>
  );
}
