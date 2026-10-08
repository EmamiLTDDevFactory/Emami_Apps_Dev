'use client';
import { useCallback, useEffect, useState } from 'react';
import { Activity as ActivityIcon, ArrowLeft, Calendar, History, LayoutDashboard, Menu, RefreshCw, ShieldX, User, Users, X, type LucideIcon } from 'lucide-react';
import { ApiError, getAppStats, getHistory, getOverview, getRoster, type AccessChange, type AppStat, type Overview as OverviewData, type RosterUser } from '@/lib/api';
import { BASE_PATH } from '@/lib/config';
import { fmtTime } from '@/lib/format';
import { getHubEmail, hasHubSession, nameFromEmail } from '@/lib/hub';
import { Button, cx } from './ui';
import Overview from './Overview';
import AccessView from './AccessView';
import ChangeLog from './ChangeLog';
import ActivityView from './ActivityView';
import UserDrawer from './UserDrawer';

export interface Data {
  overview: OverviewData;
  roster: RosterUser[];
  appStats: AppStat[];
  history: AccessChange[];
  loadedAt: string;
}

export type View = 'overview' | 'access' | 'changes' | 'activity';
const NAV: { id: View; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', hint: 'Headline numbers and trends', icon: LayoutDashboard },
  { id: 'access', label: 'Who has access', hint: 'Users, levels and app roles', icon: Users },
  { id: 'changes', label: 'Change log', hint: 'Every grant and revoke', icon: History },
  { id: 'activity', label: 'Sign-in activity', hint: 'Last login, sessions, app use', icon: ActivityIcon },
];

type State = { kind: 'checking' } | { kind: 'nohub' } | { kind: 'loading' } | { kind: 'denied'; message: string } | { kind: 'error'; message: string } | { kind: 'ready'; data: Data };

export default function App() {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [refreshing, setRefreshing] = useState(false);
  const [email, setEmail] = useState('');
  const [view, setView] = useState<View>('overview');
  const [menu, setMenu] = useState(false);
  const [today, setToday] = useState('');
  const [person, setPerson] = useState<string | null>(null);

  const load = useCallback(async (initial: boolean) => {
    if (initial) setState({ kind: 'loading' });
    else setRefreshing(true);
    try {
      const [overview, roster, appStats, history] = await Promise.all([getOverview(), getRoster(), getAppStats(), getHistory()]);
      setState({ kind: 'ready', data: { overview, roster, appStats, history, loadedAt: new Date().toISOString() } });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('Something went wrong.', 0);
      if (err.status === 401 || err.status === 403) setState({ kind: 'denied', message: err.message });
      else if (initial) setState({ kind: 'error', message: err.message });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
    if (!hasHubSession()) return setState({ kind: 'nohub' });
    setEmail(getHubEmail());
    load(true);
  }, [load]);

  if (state.kind === 'checking' || state.kind === 'loading') {
    return <div className="grid h-screen place-items-center bg-bg"><div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent border-t-transparent" /></div>;
  }
  if (state.kind === 'nohub' || state.kind === 'denied' || state.kind === 'error') {
    const copy = {
      nohub: { title: 'Sign in to Emami Apps first', body: 'Open Access Tracker from the Emami Apps hub - your sign-in comes from there.' },
      denied: { title: 'Admins only', body: `${state.kind === 'denied' ? state.message : ''} Access Tracker shows who can use which app, so it opens only for Super Admins and Admins.` },
      error: { title: 'Could not load access data', body: state.kind === 'error' ? state.message : '' },
    }[state.kind];
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white"><ArrowLeft size={14} /> Back to Emami Apps</a>
        <div className="grid flex-1 place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
            {state.kind === 'denied' ? (
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-bad/10 text-bad"><ShieldX size={26} /></span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={140} height={116} className="mx-auto" />
            )}
            <h1 className="mt-4 text-lg font-extrabold">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted">{copy.body}</p>
            {state.kind === 'error' ? (
              <Button variant="primary" className="mt-5" onClick={() => load(true)}><RefreshCw size={14} /> Try again</Button>
            ) : (
              <a href="/" className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Go to Emami Apps</a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { data } = state;
  const go = (v: View) => {
    setView(v);
    setMenu(false);
  };

  return (
    <div className="flex h-screen overflow-clip bg-plum">
      {menu && <div className="fixed inset-0 z-30 bg-plum-deep/50 backdrop-blur-sm lg:hidden" onClick={() => setMenu(false)} />}
      <aside className={cx('z-40 flex w-64 shrink-0 flex-col border-r border-line bg-panel transition-transform', 'fixed inset-y-0 left-0 lg:static', menu ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <div className="flex items-center justify-center border-b border-line px-4 pb-5 pt-5">
          <button type="button" className="absolute right-3 top-3 p-1 text-muted lg:hidden" onClick={() => setMenu(false)} aria-label="Close menu"><X size={18} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Sections">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={view === n.id ? 'page' : undefined}
              onClick={() => go(n.id)}
              className={cx('flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', view === n.id ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken')}
            >
              <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', view === n.id ? 'bg-gradient-to-br from-accent to-accent-deep text-white' : 'bg-sunken text-accent')}><n.icon size={16} /></span>
              <span><span className="block text-sm font-bold">{n.label}</span><span className="block text-[11px] text-muted">{n.hint}</span></span>
            </button>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11px] leading-snug text-faint">
          Read-only. Access is granted and revoked in the hub&apos;s Manage Access screen; every change there shows up here.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
        <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back to Emami Apps</a>
        <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-2.5">
          <button type="button" className="p-1 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <h1 className="text-[15px] font-extrabold">Access Tracker</h1>
          <span className="hidden text-2xs text-muted sm:inline">Updated {fmtTime(data.loadedAt)}</span>
          <div className="flex-1" />
          <Button size="sm" onClick={() => load(false)} disabled={refreshing} aria-label="Refresh data">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Refresh</span>
          </Button>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 sm:flex" title={email}><User size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{nameFromEmail(email)}</span></div>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 md:flex"><Calendar size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{today}</span></div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 lg:p-5">
          <div className="mx-auto max-w-7xl">
            {view === 'overview' && <Overview data={data} onGo={go} onPerson={setPerson} />}
            {view === 'access' && <AccessView data={data} onPerson={setPerson} />}
            {view === 'changes' && <ChangeLog data={data} onPerson={setPerson} />}
            {view === 'activity' && <ActivityView data={data} onPerson={setPerson} />}
          </div>
        </main>
      </div>
      <UserDrawer email={person} data={data} onClose={() => setPerson(null)} />
    </div>
  );
}
