'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type ComponentType } from 'react';
import { api } from '@/lib/api';
import { DEMO_EMAIL } from '@/lib/demo';
import type { Track } from '@/lib/types';
import { IconChart, IconClipboard, IconMenu, IconMessage, IconUser, IconX } from './icons';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const NAV: Array<{ track: Track; label: string; hint: string; icon: ComponentType<{ size?: number }> }> = [
  { track: 'audit', label: 'Audit observations', hint: 'Internal audit workpapers', icon: IconClipboard },
  { track: 'mis', label: 'MIS observations', hint: 'MSD-MIS issues', icon: IconChart },
];

/** The hub's own sign-in name (read only), like every sibling app: "first.last@..." -> "First Last". */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  return local.split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || email;
}

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return wide;
}

function NavItems({ active }: { active: Track | null }) {
  return (
    <div className="nav-group">
      <p className="nav-group-label">My observations</p>
      {NAV.map((n) => {
        const on = active === n.track;
        const I = n.icon;
        return (
          <div key={n.track} className={`nav-item${on ? ' active' : ''}`}>
            <span className="nav-ico"><I size={16} /></span>
            <span className="nav-text">
              <Link href={`/?track=${n.track}`} className="nav-label" aria-current={on ? 'page' : undefined}>{n.label}</Link>
              <span className="nav-hint">{n.hint}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NavWithParams() {
  const q = useSearchParams();
  return <NavItems active={q.get('track') === 'mis' ? 'mis' : 'audit'} />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const wide = useIsWide();
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'demo' | 'live' | ''>('');
  useEffect(() => {
    setMode(api.mode);
    if (api.mode === 'demo') { setEmail(DEMO_EMAIL); return; }
    try { setEmail(window.localStorage.getItem('emami_apps_user_email') || ''); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const drawer = !wide;

  return (
    <div className="aurora shell">
      <div className="grain" aria-hidden="true" />
      <a className="skip" href="#main">Skip to content</a>
      {drawer && menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside className={`pane glass${drawer ? ' drawer' : ''}${drawer && menuOpen ? ' open' : ''}`} aria-label="Sections" {...(drawer && !menuOpen ? { inert: true } : {})}>
        {drawer && <button type="button" className="pane-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><IconX size={18} /></button>}
        <div className="pane-logo">
          <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={150} height={124} />
          </a>
        </div>
        <nav className="pane-nav" aria-label="Main">
          <Suspense fallback={<NavItems active={null} />}><NavWithParams /></Suspense>
        </nav>
        <p className="pane-foot">{mode === 'demo' ? 'Demo mode: sample data in this browser, nothing is sent to SAP.' : mode === 'live' ? 'Connected to SAP through Emami Apps.' : ''}</p>
      </aside>

      <div className="content">
        <div className="topbar glass-dark">
          {drawer && <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}><IconMenu size={20} /></button>}
          <span className="topbar-app"><IconMessage size={14} /> Internal audit</span>
          <span className="spacer" />
          {mode && <span className="badge">{mode === 'demo' ? 'DEMO' : 'SAP'}</span>}
        </div>
        <header className="pagehead glass">
          <p className="brandtitle"><span className="text-gradient">Auditee Response</span></p>
          <span className="spacer" />
          {email && (
            <span className="chip userchip" title={email}>
              <span className="avatar"><IconUser size={11} /></span>
              <span className="uname">{nameFromEmail(email)}</span>
            </span>
          )}
        </header>
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
