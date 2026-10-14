'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Calendar, FilePlus2, History, LayoutDashboard, List, Menu, RefreshCw, ShieldX, User, X, type LucideIcon } from 'lucide-react';
import { ApiError, getMe, type Me } from '@/lib/api';
import { BASE_PATH } from '@/lib/config';
import { ROLE_LABEL, canSeeAudit } from '@/lib/labels';
import { getHubEmail, hasHubSession, nameFromEmail } from '@/lib/hub';
import { useScreenHistory } from '@/lib/useScreenHistory';
import { Button, cx } from './ui';
import Dashboard from './Dashboard';
import ChangeList from './ChangeList';
import ChangeForm from './ChangeForm';
import ChangeDetail from './ChangeDetail';
import AuditView from './AuditView';

export type View = 'dashboard' | 'changes' | 'new' | 'audit';
/** Opens a change request; the list/dashboard/form all navigate through this. */
export type OpenChange = (id: number) => void;

type State = { kind: 'checking' } | { kind: 'nohub' } | { kind: 'denied'; message: string } | { kind: 'error'; message: string } | { kind: 'ready'; me: Me };

export default function App() {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [view, setView] = useState<View>('dashboard');
  const [changeId, setChangeId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [today, setToday] = useState('');
  // Bumped by Refresh and after any write, so every view re-fetches.
  const [rev, setRev] = useState(0);
  const { back } = useScreenHistory(state.kind === 'ready' ? { view, changeId } : null, (s) => {
    setView(s.view);
    setChangeId(s.changeId);
  });

  const boot = useCallback(async () => {
    setState({ kind: 'checking' });
    try {
      setState({ kind: 'ready', me: await getMe() });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('Something went wrong.', 0);
      if (err.status === 401 || err.status === 403) setState({ kind: 'denied', message: err.message });
      else setState({ kind: 'error', message: err.message });
    }
  }, []);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
    if (!hasHubSession()) return setState({ kind: 'nohub' });
    boot();
  }, [boot]);

  if (state.kind === 'checking') {
    return <div className="grid h-screen place-items-center bg-bg"><div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent border-t-transparent" /></div>;
  }
  if (state.kind !== 'ready') {
    const copy = {
      nohub: { title: 'Sign in to Emami Apps first', body: 'Open the IT Change Control Board from the Emami Apps hub - your sign-in comes from there.' },
      denied: { title: 'No access yet', body: state.kind === 'denied' ? state.message : '' },
      error: { title: 'Could not open the Change Control Board', body: state.kind === 'error' ? state.message : '' },
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
              <Button variant="primary" className="mt-5" onClick={boot}><RefreshCw size={14} /> Try again</Button>
            ) : (
              <a href="/" className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Go to Emami Apps</a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { me } = state;
  const nav: { id: View; label: string; hint: string; icon: LucideIcon }[] = [
    { id: 'dashboard', label: 'Dashboard', hint: 'Your queue and the change schedule', icon: LayoutDashboard },
    { id: 'changes', label: 'Change requests', hint: 'Search and filter every change', icon: List },
    { id: 'new', label: 'Raise a change', hint: 'Standard, normal or emergency', icon: FilePlus2 },
    ...(canSeeAudit(me.role) ? [{ id: 'audit' as View, label: 'Audit trail', hint: 'Every action, append-only', icon: History }] : []),
  ];
  const go = (v: View) => {
    setView(v);
    setChangeId(null);
    setMenu(false);
  };
  const open: OpenChange = (id) => setChangeId(id);
  const refresh = () => setRev((r) => r + 1);
  const active = changeId ? null : view;

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
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={active === n.id ? 'page' : undefined}
              onClick={() => go(n.id)}
              className={cx('flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', active === n.id ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken')}
            >
              <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', active === n.id ? 'bg-gradient-to-br from-accent to-accent-deep text-white' : 'bg-sunken text-accent')}><n.icon size={16} /></span>
              <span><span className="block text-sm font-bold">{n.label}</span><span className="block text-[11px] text-muted">{n.hint}</span></span>
            </button>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11px] leading-snug text-faint">
          Your role here: <span className="font-bold text-ink">{ROLE_LABEL[me.role]}</span>. Roles are granted in the hub&apos;s Manage Access screen.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
        <div className="flex bg-plum">
          <button type="button" onClick={back} className="flex items-center gap-1.5 border-r border-white/20 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back</button>
          <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back to Emami Apps</a>
        </div>
        <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-2.5">
          <button type="button" className="p-1 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <h1 className="text-[15px] font-extrabold">IT Change Control Board</h1>
          <div className="flex-1" />
          <Button size="sm" onClick={refresh} aria-label="Refresh data">
            <RefreshCw size={13} /> <span className="hidden sm:inline">Refresh</span>
          </Button>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 sm:flex" title={me.email}>
            <User size={13} className="text-accent" />
            <span className="text-[11.5px] font-bold">{me.name || nameFromEmail(me.email || getHubEmail())}</span>
            <span className="text-[11px] text-muted">· {ROLE_LABEL[me.role]}</span>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 md:flex"><Calendar size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{today}</span></div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 lg:p-5">
          <div className="mx-auto max-w-7xl">
            {changeId ? (
              <ChangeDetail key={`${changeId}:${rev}`} id={changeId} me={me} onChanged={refresh} />
            ) : (
              <>
                {view === 'dashboard' && <Dashboard key={rev} me={me} onOpen={open} onNew={() => go('new')} onList={() => go('changes')} />}
                {view === 'changes' && <ChangeList key={rev} onOpen={open} onNew={() => go('new')} />}
                {view === 'new' && <ChangeForm onCreated={(id) => { setView('changes'); setChangeId(id); }} />}
                {view === 'audit' && <AuditView key={rev} onOpen={open} />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
