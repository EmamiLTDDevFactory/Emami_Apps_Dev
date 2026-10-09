'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, History, LayoutGrid } from 'lucide-react';
import { ApiError, getHistory, getUserActivity, getUserAppStats, type AccessChange, type OpenStat, type UserActivity } from '@/lib/api';
import { appName } from '@/lib/apps';
import { fmtDate, fmtDateTime, fmtNum, relative, timeSpentLabel } from '@/lib/format';
import { nameFromEmail } from '@/lib/hub';
import type { Data } from './App';
import { BarList } from './charts';
import { ChangeRow } from './feed';
import { Avatar, Card, Drawer, Empty, LevelBadge, Pill, Skeleton, StatusBadge, cx } from './ui';
import { SessionList, SignInList } from './ActivityDetail';

export default function UserDrawer({ email, data, onClose }: { email: string | null; data: Data; onClose: () => void }) {
  const user = data.roster.find((u) => u.email === email);
  const [usage, setUsage] = useState<(OpenStat & { appId: string })[] | null>(null);
  const [history, setHistory] = useState<AccessChange[] | null>(null);
  const [error, setError] = useState('');
  // Sign-in / session drill-down: fetched on first open of either, then reused.
  const [detail, setDetail] = useState<'logins' | 'sessions' | null>(null);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [activityError, setActivityError] = useState('');
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (!email) return;
    setUsage(null);
    setHistory(null);
    setError('');
    setDetail(null);
    setActivity(null);
    setActivityError('');
    getUserAppStats(email).then(setUsage, (e: Error) => setError(e.message));
    getHistory(email).then(setHistory, (e: Error) => setError(e.message));
  }, [email]);

  if (!email) return null;

  const toggle = (d: 'logins' | 'sessions') => {
    const next = detail === d ? null : d;
    setDetail(next);
    if (next && !activity && !activityLoading) {
      setActivityLoading(true);
      setActivityError('');
      getUserActivity(email)
        .then(setActivity, (e: unknown) =>
          setActivityError(
            e instanceof ApiError && e.status === 404
              ? 'Sign-in and session details need the latest hub backend (the /admin/user/:email/activity route). Deploy the backend and try again.'
              : e instanceof Error ? e.message : 'Could not load sign-in activity.',
          ),
        )
        .finally(() => setActivityLoading(false));
    }
  };
  const name = user?.usage.name || nameFromEmail(email);

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <Avatar email={email} name={user?.usage.name} size={48} />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold">{name}</div>
            <div className="truncate text-xs text-muted">{email}</div>
            {user && <div className="mt-1 flex flex-wrap items-center gap-2"><LevelBadge level={user.accessLevel} /><StatusBadge active={user.isActive} /></div>}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {!user && <p className="rounded-xl border border-warn/40 bg-warn/[0.06] p-3 text-sm">This person is no longer an authorized user. Their past changes are shown below.</p>}

        {user && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Last sign-in', value: relative(user.usage.lastLogin), title: fmtDateTime(user.usage.lastLogin) },
              { label: 'Sign-ins', value: fmtNum(user.usage.logins), open: 'logins' as const, title: 'Show every sign-in with date and time' },
              { label: 'Sessions', value: fmtNum(user.usage.sessionsTotal), open: 'sessions' as const, title: 'Show every session with the apps opened in it' },
              { label: 'Time spent', value: timeSpentLabel(user.usage.timeSpent), title: 'Total recorded session time' },
            ].map((s) =>
              s.open ? (
                <button
                  key={s.label}
                  type="button"
                  title={s.title}
                  aria-expanded={detail === s.open}
                  onClick={() => toggle(s.open)}
                  className={cx('group rounded-xl border bg-panel px-3 py-2.5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover', detail === s.open ? 'border-accent ring-2 ring-accent/20' : 'border-line hover:border-accent/40')}
                >
                  <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wide text-muted">
                    {s.label}
                    <ChevronDown size={13} className={cx('transition', detail === s.open ? 'rotate-180 text-accent' : 'text-faint group-hover:text-accent')} />
                  </div>
                  <div className="num mt-0.5 text-[15px] font-extrabold">{s.value}</div>
                </button>
              ) : (
              <div key={s.label} className="rounded-xl border border-line bg-panel px-3 py-2.5 shadow-card" title={s.title}>
                <div className="text-2xs font-bold uppercase tracking-wide text-muted">{s.label}</div>
                <div className="num mt-0.5 text-[15px] font-extrabold">{s.value}</div>
              </div>
              ),
            )}
          </div>
        )}

        {user && detail && (
          activityError ? (
            <p className="rounded-xl border border-warn/40 bg-warn/[0.06] p-3 text-sm">{activityError}</p>
          ) : !activity ? (
            <Card><Skeleton rows={6} /></Card>
          ) : (
            <>
              {activity.truncated && <p className="text-2xs text-faint">Showing the most recent activity only.</p>}
              {detail === 'logins' ? <SignInList activity={activity} email={email} /> : <SessionList activity={activity} email={email} />}
            </>
          )
        )}

        {user && (
          <Card title="App access" sub={`${user.apps.length} app${user.apps.length === 1 ? '' : 's'} granted`} bodyClass="p-0">
            {user.apps.length ? (
              <ul className="divide-y divide-line">
                {[...user.apps].sort((a, b) => appName(a.appId).localeCompare(appName(b.appId))).map((g) => {
                  const u = usage?.find((x) => x.appId === g.appId);
                  return (
                    <li key={g.appId} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{appName(g.appId)}</div>
                        <div className="text-2xs text-muted">{usage ? (u ? `${fmtNum(u.opens)} opens · last ${relative(u.lastOpened)}` : 'Never opened') : ' '}</div>
                      </div>
                      <Pill tone={g.role === 'User' || g.role === 'Depot' ? 'neutral' : 'accent'}>{g.role}{g.depot ? ` · ${g.depot}` : ''}</Pill>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty icon={LayoutGrid} title="No apps granted" />
            )}
          </Card>
        )}

        <Card title="App opens" sub="Every app this person has opened, including ones since revoked">
          {error ? <p className="text-sm text-bad">{error}</p> : !usage ? <Skeleton rows={4} /> : usage.length ? (
            <BarList rows={usage.map((a) => ({ key: a.appId, label: appName(a.appId), value: a.opens, detail: `First ${fmtDate(a.firstOpened)} · last ${fmtDate(a.lastOpened)}` }))} unit="opens" />
          ) : (
            <Empty title="No apps opened yet" />
          )}
        </Card>

        <Card title="Access history" sub="Changes made to this person's access" bodyClass="px-4 py-1">
          {!history ? <div className="py-3"><Skeleton rows={4} /></div> : history.length ? (
            <ul className="divide-y divide-line">{history.map((c) => <ChangeRow key={c.id} c={c} showTarget={false} />)}</ul>
          ) : (
            <Empty icon={History} title="No recorded changes" />
          )}
        </Card>
      </div>
    </Drawer>
  );
}
