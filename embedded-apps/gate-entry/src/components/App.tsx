'use client';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Calendar, ClipboardList, Database, LogOut as OutIcon, Menu, PlusSquare, User, X, type LucideIcon } from 'lucide-react';
import { BASE_PATH, SAP_SERVICE, SAP_SYSTEM } from '@/lib/config';
import { getHubEmail, hasHubSession, nameFromEmail } from '@/lib/hub';
import { searchAsn } from '@/lib/gate';
import { GateError } from '@/lib/sap';
import { cx } from './ui';
import NewEntry from './NewEntry';
import Entries from './Entries';

type View = 'new' | 'entries' | 'out';
const NAV: { id: View; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'new', label: 'New gate entry', hint: 'Truck in, against PO or ASN', icon: PlusSquare },
  { id: 'entries', label: 'Gate entries', hint: 'Search, display, print, cancel', icon: ClipboardList },
  { id: 'out', label: 'Truck out', hint: 'Record the out time', icon: OutIcon },
];

export default function App() {
  const [state, setState] = useState<'checking' | 'ready' | 'nohub'>('checking');
  const [email, setEmail] = useState('');
  const [view, setView] = useState<View>('new');
  const [menu, setMenu] = useState(false);
  const [today, setToday] = useState('');
  const [service, setService] = useState<'ok' | 'missing' | 'down' | 'unknown'>('unknown');
  const [openReq, setOpenReq] = useState<string | null>(null);

  const probe = useCallback(() => {
    // One cheap read tells whether ZGATE_ENTRY_SRV exists on the gateway yet.
    searchAsn('0000000000')
      .then(() => setService('ok'))
      .catch((e) => setService(e instanceof GateError && e.code === 'SERVICE_MISSING' ? 'missing' : e instanceof GateError && e.code === 'SAP_UNAVAILABLE' ? 'down' : 'ok'));
  }, []);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
    if (!hasHubSession()) return setState('nohub');
    setEmail(getHubEmail());
    setState('ready');
    probe();
  }, [probe]);

  const showEntry = (reqNo: string) => {
    setOpenReq(reqNo);
    setView('entries');
  };

  if (state === 'checking') return <div className="grid h-screen place-items-center bg-bg"><div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent border-t-transparent" /></div>;
  if (state === 'nohub') {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white"><ArrowLeft size={14} /> Back to Emami Apps</a>
        <div className="grid flex-1 place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={140} height={116} className="mx-auto" />
            <h1 className="mt-4 text-lg font-extrabold">Sign in to Emami Apps first</h1>
            <p className="mt-1 text-sm text-muted">Open Gate Entry from the Emami Apps hub - your sign-in comes from there.</p>
            <a href="/" className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Go to Emami Apps</a>
          </div>
        </div>
      </div>
    );
  }

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
              onClick={() => { setView(n.id); setMenu(false); setOpenReq(null); }}
              className={cx('flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', view === n.id ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken')}
            >
              <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', view === n.id ? 'bg-gradient-to-br from-accent to-accent-deep text-white' : 'bg-sunken text-accent')}><n.icon size={16} /></span>
              <span><span className="block text-sm font-bold">{n.label}</span><span className="block text-[11px] text-muted">{n.hint}</span></span>
            </button>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11px] leading-snug text-faint">
          Entries are saved in SAP under your name. Plant authorisation, quantities and invoice checks are decided by SAP.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
        <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back to Emami Apps</a>
        <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-2.5">
          <button type="button" className="p-1 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <h1 className="text-[15px] font-extrabold">Gate Entry</h1>
          <span className={cx('hidden items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ring-1 sm:inline-flex', service === 'ok' ? 'bg-good/10 text-good ring-good/30' : service === 'unknown' ? 'bg-sunken text-muted ring-line' : 'bg-warn/10 text-warn ring-warn/30')} title={`${SAP_SERVICE} on ${SAP_SYSTEM}`}>
            <Database size={11} /> SAP {SAP_SYSTEM}
          </span>
          <div className="flex-1" />
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 sm:flex" title={email}><User size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{nameFromEmail(email)}</span></div>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 md:flex"><Calendar size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{today}</span></div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 lg:p-5">
          <div className="mx-auto max-w-6xl">
            {service === 'missing' && (
              <section className="mb-3 flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/[0.06] p-4 shadow-card" role="alert">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
                <div className="text-sm">
                  <p className="font-extrabold">The SAP service {SAP_SERVICE} is not available on {SAP_SYSTEM} yet.</p>
                  <p className="mt-0.5 text-xs text-muted">The screens work, but nothing can be loaded or saved until the SAP side (class ZCL_GATE_ENTRY_BL and the SEGW service) is activated and registered in /IWFND/MAINT_SERVICE.</p>
                </div>
              </section>
            )}
            {service === 'down' && (
              <section className="mb-3 flex items-start gap-3 rounded-2xl border border-bad/40 bg-bad/[0.05] p-4 text-sm shadow-card" role="alert">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-bad" /> SAP is not reachable right now. Check the network and reload.
              </section>
            )}
            {view === 'new' && <NewEntry onOpenEntry={showEntry} />}
            {view === 'entries' && <Entries mode="all" openReq={openReq} onCloseReq={() => setOpenReq(null)} />}
            {view === 'out' && <Entries mode="out" openReq={openReq} onCloseReq={() => setOpenReq(null)} />}
          </div>
        </main>
      </div>
    </div>
  );
}
