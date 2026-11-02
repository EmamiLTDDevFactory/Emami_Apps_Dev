'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, BookOpen, Calendar, Columns3, FileSpreadsheet, Headset, Inbox, Keyboard, LayoutDashboard, Menu, PieChart, PlusCircle, RefreshCw, Settings, ShieldX, SlidersHorizontal, Users, X, type LucideIcon } from 'lucide-react';
import { ApiError, getMe, getMeta, setAvailability, setUnauthorizedHandler, type TicketQuery } from '@/lib/api';
import { BASE_PATH } from '@/lib/config';
import { SetuContext, type NewTicketPreset, type Screen, type Setu } from '@/lib/context';
import { hasHubSession } from '@/lib/hub';
import type { AgentPrefs, Availability, BellEvent, Me, Meta } from '@/lib/types';
import MyPreferences from './MyPreferences';
import { useScreenHistory } from '@/lib/useScreenHistory';
import { Avatar, Button, cx } from './ui';
import Dashboard from './Dashboard';
import Tickets from './Tickets';
import TicketView from './TicketView';
import NewTicket from './NewTicket';
import dynamic from 'next/dynamic';
import { Skeleton as LoadingSkeleton } from './ui';
import Shortcuts from './Shortcuts';
import Bell from './Bell';
import GlobalSearch from './GlobalSearch';

// Loaded only when opened: keeps the first load small for agents who never open Admin or the report.
const loading = () => <LoadingSkeleton />;
const Board = dynamic(() => import('./Board'), { loading });
const Reports = dynamic(() => import('./Reports'), { loading });
const Admin = dynamic(() => import('./admin/Admin'), { loading });
const Helpdesk = dynamic(() => import('./Helpdesk'), { loading });
const Analytics = dynamic(() => import('./Analytics'), { loading });
const Contacts = dynamic(() => import('./Contacts'), { loading });
const Solutions = dynamic(() => import('./Solutions'), { loading });

type NavItem = { id: Screen; label: string; hint: string; icon: LucideIcon; show?: (s: { sup: boolean; admin: boolean }) => boolean };
const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', hint: "Today's queue and trends", icon: LayoutDashboard },
  { id: 'helpdesk', label: 'Helpdesk dashboard', hint: 'Region, status, type, source', icon: PieChart },
  { id: 'tickets', label: 'Tickets', hint: 'Views, filters, bulk actions', icon: Inbox },
  { id: 'board', label: 'Board', hint: 'Drag tickets between statuses', icon: Columns3 },
  { id: 'new', label: 'New ticket', hint: 'On behalf of a requester', icon: PlusCircle },
  { id: 'contacts', label: 'Contacts', hint: 'Requesters and companies', icon: Users },
  { id: 'solutions', label: 'Solutions', hint: 'Knowledge base articles', icon: BookOpen },
  { id: 'analytics', label: 'Analytics', hint: 'SLA, agents, CSAT, trends', icon: BarChart3, show: (s) => s.sup },
  { id: 'reports', label: 'Daily report', hint: 'Excel in the template order', icon: FileSpreadsheet, show: (s) => s.sup },
  { id: 'admin', label: 'Admin', hint: 'Agents, SLA, fields, templates', icon: Settings, show: (s) => s.admin },
];

const AVAIL_DOT: Record<Availability, string> = {
  AVAILABLE: 'bg-good', UNAVAILABLE: 'bg-bad', MEETING: 'bg-warn', BREAK: 'bg-warn', TRAINING: 'bg-accent', LUNCH: 'bg-warn',
};

type State =
  | { kind: 'checking' }
  | { kind: 'nohub' }
  | { kind: 'expired'; message: string }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; me: Me; meta: Meta; mailEnabled: boolean; whatsappEnabled: boolean; bellEvents: BellEvent[]; prefs: AgentPrefs };

/** ?ticket=<id> deep link (hub notifications and emails point there). */
function ticketFromUrl(): number | null {
  try {
    const v = new URLSearchParams(window.location.search).get('ticket');
    return v && /^\d+$/.test(v) ? Number(v) : null;
  } catch {
    return null;
  }
}

function syncUrl(ticketId: number | null) {
  try {
    const url = new URL(window.location.href);
    if (ticketId) url.searchParams.set('ticket', String(ticketId));
    else url.searchParams.delete('ticket');
    window.history.replaceState(null, '', url.toString());
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [preset, setPreset] = useState<{ n: number; q: TicketQuery }>({ n: 0, q: {} });
  const [newPreset, setNewPreset] = useState<{ n: number; p?: NewTicketPreset }>({ n: 0 });
  const [listIds, setListIds] = useState<number[]>([]);
  const [prefsOpen, setPrefsOpen] = useState<'notifications' | 'list' | null>(null);
  const [menu, setMenu] = useState(false);
  const [today, setToday] = useState('');
  const [availBusy, setAvailBusy] = useState(false);

  const { back } = useScreenHistory(state.kind === 'ready' ? { screen, ticketId } : null, (s) => {
    setScreen(s.screen);
    setTicketId(s.ticketId);
  });

  // Only once loaded: before that the ?ticket= deep link is still waiting to be read by load().
  const ready = state.kind === 'ready';
  useEffect(() => { if (ready) syncUrl(screen === 'ticket' ? ticketId : null); }, [ready, screen, ticketId]);

  const load = useCallback(async () => {
    setState({ kind: 'checking' });
    try {
      const [me, meta] = await Promise.all([getMe(), getMeta()]);
      setState({
        kind: 'ready', me: me.me, meta, mailEnabled: me.mailEnabled, whatsappEnabled: me.whatsappEnabled,
        bellEvents: me.bellEvents ?? ['requester_reply'], prefs: me.prefs ?? {},
      });
      const deep = ticketFromUrl();
      if (deep) {
        setTicketId(deep);
        setScreen('ticket');
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('Something went wrong.', 0);
      if (err.status === 401) setState({ kind: 'expired', message: err.message });
      else if (err.status === 403) setState({ kind: 'denied', message: err.message });
      else setState({ kind: 'error', message: err.message });
    }
  }, []);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }));
    setUnauthorizedHandler((message) => setState({ kind: 'expired', message }));
    if (!hasHubSession()) return setState({ kind: 'nohub' });
    load();
  }, [load]);

  const reloadMeta = useCallback(async () => {
    const meta = await getMeta();
    setState((s) => (s.kind === 'ready' ? { ...s, meta } : s));
  }, []);

  const ctx: Setu | null = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const sup = state.me.role === 'Supervisor' || state.me.role === 'Admin';
    return {
      me: state.me,
      meta: state.meta,
      mailEnabled: state.mailEnabled,
      whatsappEnabled: state.whatsappEnabled,
      reloadMeta,
      openTicket: (id: number) => { setTicketId(id); setScreen('ticket'); setMenu(false); },
      openList: (q: TicketQuery = {}) => { setPreset((p) => ({ n: p.n + 1, q })); setScreen('tickets'); setMenu(false); },
      go: (s: Screen) => { if (s === 'new') setNewPreset((p) => ({ n: p.n + 1 })); setScreen(s); setMenu(false); },
      newTicket: (p?: NewTicketPreset) => { setNewPreset((x) => ({ n: x.n + 1, p })); setScreen('new'); setMenu(false); },
      listIds,
      setListIds,
      isSupervisor: sup,
      isAdmin: state.me.role === 'Admin',
      prefs: state.prefs,
    };
  }, [state, reloadMeta, listIds]);

  if (state.kind === 'checking') {
    return <div className="grid h-screen place-items-center bg-bg"><div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent border-t-transparent" /></div>;
  }
  if (state.kind !== 'ready' || !ctx) {
    const copy = {
      nohub: { title: 'Sign in to Emami Apps first', body: 'Open Samadhan from the Emami Apps hub - your sign-in comes from there.' },
      expired: { title: 'Your session has expired', body: `${state.kind === 'expired' ? state.message : ''} Open Samadhan again from Emami Apps.` },
      denied: { title: 'No access to Samadhan', body: state.kind === 'denied' ? state.message : '' },
      error: { title: 'Could not load Samadhan', body: state.kind === 'error' ? state.message : '' },
    }[state.kind as 'nohub' | 'expired' | 'denied' | 'error'];
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <div className="grid flex-1 place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
            {state.kind === 'denied' ? (
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-bad/10 text-bad"><ShieldX size={26} /></span>
            ) : (
              <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="mx-auto block w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={140} height={116} className="mx-auto" />
              </a>
            )}
            <h1 className="mt-4 text-lg font-extrabold">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted">{copy.body}</p>
            {state.kind === 'error' ? (
              <Button variant="primary" className="mt-5" onClick={load}><RefreshCw size={14} /> Try again</Button>
            ) : (
              <a href="/" className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Go to Emami Apps</a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { me, meta } = state;
  const visibleNav = NAV.filter((n) => !n.show || n.show({ sup: ctx.isSupervisor, admin: ctx.isAdmin }));
  const activeNav = screen === 'ticket' ? 'tickets' : screen;

  const changeAvailability = async (v: Availability) => {
    setAvailBusy(true);
    try {
      await setAvailability(v);
      setState((s) => (s.kind === 'ready' ? { ...s, me: { ...s.me, availability: v } } : s));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not change your status.');
    } finally {
      setAvailBusy(false);
    }
  };

  return (
    <SetuContext.Provider value={ctx}>
      <div className="flex h-screen overflow-clip bg-plum">
        {menu && <div className="fixed inset-0 z-30 bg-plum-deep/50 backdrop-blur-sm lg:hidden" onClick={() => setMenu(false)} />}
        <aside className={cx('z-40 flex w-64 shrink-0 flex-col border-r border-line bg-panel transition-transform', 'fixed inset-y-0 left-0 lg:static', menu ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
          <div className="flex items-center justify-center border-b border-line px-4 pb-5 pt-5">
            <button type="button" className="absolute right-3 top-3 p-1 text-muted lg:hidden" onClick={() => setMenu(false)} aria-label="Close menu"><X size={18} /></button>
            <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
            </a>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Sections">
            {visibleNav.map((n) => (
              <button
                key={n.id}
                type="button"
                aria-current={activeNav === n.id ? 'page' : undefined}
                onClick={() => (n.id === 'tickets' ? ctx.openList({}) : ctx.go(n.id))}
                className={cx('flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', activeNav === n.id ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken')}
              >
                <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', activeNav === n.id ? 'bg-gradient-to-br from-accent to-accent-deep text-white' : 'bg-sunken text-accent')}><n.icon size={16} /></span>
                <span><span className="block text-sm font-bold">{n.label}</span><span className="block text-[11px] text-muted">{n.hint}</span></span>
              </button>
            ))}
          </nav>
          <div className="border-t border-line p-3">
            <div className="flex items-center gap-2.5 px-1">
              <Avatar email={me.email} name={me.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{me.name}</div>
                <div className="truncate text-2xs text-muted">{me.role}</div>
              </div>
            </div>
            <label className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-bg px-2.5 py-1.5">
              <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', AVAIL_DOT[me.availability])} />
              <span className="sr-only">My status</span>
              <select
                value={me.availability}
                disabled={availBusy}
                onChange={(e) => changeAvailability(e.target.value as Availability)}
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold focus:outline-none"
              >
                {Object.entries(meta.agentStatuses).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <p className="mt-2 px-1 text-[11px] leading-snug text-faint">Only agents who are Available get round-robin tickets.</p>
            <button type="button" onClick={() => setPrefsOpen('list')} className="mt-2 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-semibold text-muted hover:bg-sunken hover:text-ink"><SlidersHorizontal size={13} /> My preferences</button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
          <div className="flex bg-plum">
            <button type="button" onClick={back} className="flex items-center gap-1.5 border-r border-white/20 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back</button>
          </div>
          <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-2.5">
            <button type="button" className="p-1 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
            <Headset size={18} className="text-accent" />
            <h1 className="text-[15px] font-extrabold">Samadhan</h1>
            <span className="hidden text-2xs text-muted sm:inline">Emami Secondary Support</span>
            <div className="flex-1" />
            {!state.mailEnabled && (
              <span className="hidden rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] font-bold text-warn md:inline" title="SETU_MAIL_ENABLED is off on the server: replies are saved but no email is sent, and the mailbox is not read.">
                Mail off
              </span>
            )}
            <GlobalSearch />
            <Bell events={state.bellEvents} muted={state.prefs.bellMuted ?? []} onSettings={() => setPrefsOpen('notifications')} />
            <button type="button" onClick={() => window.dispatchEvent(new Event('setu:shortcuts'))} className="hidden h-8 items-center gap-1 rounded-lg border border-line px-2 text-2xs font-semibold text-muted hover:text-ink md:flex" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts"><Keyboard size={13} /> ?</button>
            <Button size="sm" variant="primary" onClick={() => ctx.go('new')}><PlusCircle size={14} /> <span className="hidden sm:inline">New ticket</span></Button>
            <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 md:flex"><Calendar size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{today}</span></div>
          </header>
          <main className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 lg:p-5">
            <div className="mx-auto max-w-7xl">
              {screen === 'dashboard' && <Dashboard />}
              {screen === 'tickets' && <Tickets key={preset.n} preset={preset.q} />}
              {screen === 'ticket' && ticketId && <TicketView key={ticketId} id={ticketId} />}
              {screen === 'new' && <NewTicket key={newPreset.n} preset={newPreset.p} />}
              {screen === 'helpdesk' && <Helpdesk />}
              {screen === 'contacts' && <Contacts />}
              {screen === 'solutions' && <Solutions />}
              {screen === 'analytics' && ctx.isSupervisor && <Analytics />}
              {screen === 'board' && <Board />}
              {screen === 'reports' && ctx.isSupervisor && <Reports />}
              {screen === 'admin' && ctx.isAdmin && <Admin />}
            </div>
            <Shortcuts />
            <MyPreferences
              open={prefsOpen !== null}
              start={prefsOpen ?? 'notifications'}
              onClose={() => setPrefsOpen(null)}
              prefs={state.prefs}
              events={state.bellEvents}
              onSaved={(p) => setState((s) => (s.kind === 'ready' ? { ...s, prefs: p } : s))}
            />
          </main>
        </div>
      </div>
    </SetuContext.Provider>
  );
}
