'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gavel, Menu, X, ArrowLeft, User, Calendar, ShieldCheck, Store, AlertTriangle } from 'lucide-react';
import { getHubEmail, nameFromEmail } from '../lib/hubEmailLogin';
import { goBack } from '../lib/goBack';
import { demoEnabled, demoLogin, hubLogin, type AppRole, type Session } from '../lib/api';

const WIDE_BREAKPOINT = 768; // matches the hub's own useIsWideScreen + every sibling embedded app

// next/link auto-prepends next.config.js's basePath; plain <img>/<a> tags don't, so it's spelled
// out here for the logo.
const BASE_PATH = '/apps/rate-auction';
const HUB_TOKEN_STORAGE_KEY = 'emami_apps_session_token';

const SessionContext = createContext<Session | null>(null);
export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside Shell');
  return s;
}

const ROLE_LABEL: Record<AppRole, string> = { admin: 'Admin console', vendor: 'Vendor room' };

function formatDateCompact(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function useIsWideScreen() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= WIDE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return wide;
}

function readHubToken(): string | null {
  try {
    return window.localStorage.getItem(HUB_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function NavPane({ isOpen, onClose, isWideScreen, role }: { isOpen: boolean; onClose: () => void; isWideScreen: boolean; role: AppRole }) {
  const paneClasses = isWideScreen
    ? 'relative w-64 shrink-0 border-r border-border bg-white'
    : `fixed inset-y-0 left-0 z-40 w-72 max-w-[80vw] bg-white shadow-pop transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;
  const Icon = role === 'admin' ? Gavel : Store;
  return (
    <>
      {!isWideScreen && isOpen && <div className="fixed inset-0 z-30 bg-plumDeep/50 backdrop-blur-sm" onClick={onClose} />}
      <aside className={paneClasses}>
        <div className="border-b border-border">
          {!isWideScreen && (
            <div className="flex justify-end px-3 pt-3">
              <button onClick={onClose} aria-label="Close menu" className="p-1 text-inkSoft hover:text-ink">
                <X size={20} />
              </button>
            </div>
          )}
          <a href="/" title="Back to Emami Apps" className={`flex items-center justify-center px-4 ${isWideScreen ? 'pt-5' : 'pt-1'} pb-5`} aria-label="Back to Emami Apps">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
          </a>
        </div>
        <nav className="p-3 flex flex-col gap-1">
          <Link href="/" onClick={() => { if (!isWideScreen) onClose(); }} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold bg-rust/10 text-rust">
            <Icon size={18} />
            <span className="flex-1">{role === 'admin' ? 'Live Auction' : 'Bidding Room'}</span>
          </Link>
        </nav>
      </aside>
    </>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-appBg p-4">{children}</div>;
}

/** Standalone/local only: shown when there's no hub session and the server has ALLOW_DEMO_LOGIN on. */
function DemoLogin({ onSession }: { onSession: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function go(role: AppRole, preset?: string) {
    setErr(null);
    try {
      onSession(await demoLogin(role, preset || email || (role === 'admin' ? 'purchase.admin@emamigroup.com' : 'vendor.one@example.com')));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <CenterMessage>
      <div className="card w-full max-w-md p-6 flex flex-col gap-3">
        <h1 className="text-lg font-extrabold text-ink">Rate Auction — local sign-in</h1>
        <p className="text-sm text-inkSoft">No Emami Apps session found, and this server allows demo sign-in. On the real site the role comes from Manage Access instead.</p>
        <input className="rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-rust" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary" onClick={() => go('admin')}>Sign in as admin</button>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={() => go('vendor', email || 'vendor.one@example.com')}>Vendor 1</button>
          <button className="btn-ghost" onClick={() => go('vendor', 'vendor.two@example.com')}>Vendor 2</button>
        </div>
        {err && <p className="text-sm font-semibold text-red">{err}</p>}
      </div>
    </CenterMessage>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const isWideScreen = useIsWideScreen();
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<'checking' | 'demo' | 'error' | 'ready'>('checking');
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [today] = useState(() => formatDateCompact(new Date()));

  useEffect(() => {
    const hubToken = readHubToken();
    if (hubToken && getHubEmail()) {
      hubLogin(hubToken)
        .then((s) => { setSession(s); setState('ready'); })
        .catch((e) => { setError(e.message); setState('error'); });
      return;
    }
    // No hub session: only a local server with demo sign-in enabled gets a picker; everywhere else
    // this app is only reachable through the hub, same as every sibling app.
    demoEnabled().then((on) => {
      if (on) setState('demo');
      else window.location.href = '/';
    });
  }, []);

  if (state === 'checking') {
    return (
      <CenterMessage>
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </CenterMessage>
    );
  }
  if (state === 'demo') return <DemoLogin onSession={(s) => { setSession(s); setState('ready'); }} />;
  if (state === 'error' || !session) {
    return (
      <CenterMessage>
        <div className="card w-full max-w-md p-6 text-center flex flex-col items-center gap-3">
          <AlertTriangle size={28} className="text-amber" />
          <h1 className="text-lg font-extrabold text-ink">Can&apos;t open Rate Auction</h1>
          <p className="text-sm text-inkSoft">{error}</p>
          <a href="/" className="btn-primary">Back to Emami Apps</a>
        </div>
      </CenterMessage>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      <div className="flex min-h-screen flex-col bg-plum">
        <div className="flex flex-1">
          <NavPane isOpen={menuOpen} onClose={() => setMenuOpen(false)} isWideScreen={isWideScreen} role={session.role} />
          <div className="flex min-w-0 flex-1 flex-col bg-appBg">
            <div className="flex flex-wrap bg-plum">
              <button type="button" onClick={goBack} className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plumDeep">
                <ArrowLeft size={14} />
                Back
              </button>
            </div>
            <header className="flex items-center gap-2.5 border-b border-border bg-white px-4 py-2.5">
              {!isWideScreen && (
                <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="p-1 text-ink">
                  <Menu size={22} />
                </button>
              )}
              <h1 className="truncate text-[15px] font-extrabold text-ink">Rate Auction</h1>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-rust/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rust">
                {session.role === 'admin' ? <ShieldCheck size={11} /> : <Store size={11} />}
                {ROLE_LABEL[session.role]}
              </span>
              <div className="flex-1" />
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-appBg px-2.5 py-1">
                <User size={13} className="text-rust" />
                <span className="max-w-[160px] truncate text-[11.5px] font-bold text-ink">{nameFromEmail(session.email)}</span>
              </div>
              <div className="hidden md:flex items-center gap-1.5 rounded-full border border-border bg-appBg px-2.5 py-1">
                <Calendar size={13} className="text-rust" />
                <span className="text-[11.5px] font-bold text-ink">{today}</span>
              </div>
            </header>
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
