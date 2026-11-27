'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useState } from 'react';
import { useMdm } from '@/lib/store';
import { CRS_PATH, CRS_TCODE, DOMAINS, SETUP_PATH, SETUP_TCODE, resolveTcode } from '@/lib/tcodes';
import { DOMAIN_ICONS, IconChart, IconCheck, IconClock, IconHome, IconLayers, IconMenu, IconTree } from './icons';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

const ADMIN_LINKS = [
  { href: '/admin/dashboard', label: 'Tracking Details', tcode: 'MDM_DB', Icon: IconChart },
  { href: '/admin/worklist', label: 'Work Inbox', tcode: 'UWL', Icon: IconClock },
  { href: '/admin/workflow', label: 'Workflow maintenance', tcode: 'ROLE_MAIN', Icon: IconLayers },
  { href: '/admin/rules', label: 'Rules maintenance', tcode: 'MDM_CONFIG', Icon: IconTree },
  { href: '/admin/ph-masters', label: 'Hierarchy masters', tcode: 'MDM_PHM', Icon: IconCheck },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, sessionState, sessionError, retrySession, message, notify, clearMessage, waiting } = useMdm();
  const [cmd, setCmd] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  function runTcode(e: FormEvent) {
    e.preventDefault();
    const r = resolveTcode(cmd);
    if (r.home) router.push('/');
    else if (r.path) { router.push(r.path); clearMessage(); }
    else if (r.domain) {
      router.push(`/master/${r.domain.id}`);
      if (!r.domain.enabled) notify('warning', `${r.domain.tcode} (${r.domain.label}) is not available yet`);
      else clearMessage();
    } else notify('error', `Transaction ${r.code} does not exist`);
    setCmd('');
    setNavOpen(false);
  }

  const adminHit = ADMIN_LINKS.find((a) => pathname.startsWith(a.href));
  const domainHit = DOMAINS.find((d) => pathname.startsWith(`/master/${d.id}`));
  const pageTitle = adminHit ? adminHit.label : pathname.startsWith(CRS_PATH) ? 'CRS Product Grouping' : pathname.startsWith(SETUP_PATH) ? 'Product Hierarchy' : domainHit ? domainHit.label : 'Master Data';
  const pageSub = adminHit ? `Administration · ${adminHit.tcode}` : pathname.startsWith(CRS_PATH) ? CRS_TCODE : pathname.startsWith(SETUP_PATH) ? SETUP_TCODE : domainHit ? domainHit.tcode : 'Governance portal';
  const initials = user.name.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 3) || '?';
  const role = sessionState === 'loading' ? 'Signing in…' : sessionState === 'error' ? 'Not connected' : user.department || user.roles.join(', ') || 'Signed in';

  return (
    <div className="shell">
      <nav className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Master data objects">
        <div className="brand">
          <button type="button" className="nav-close" onClick={() => setNavOpen(false)} aria-label="Close menu">×</button>
          <a href="/" className="brand-logo" title="Back to Emami Apps" aria-label="Back to Emami Apps">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={150} height={124} />
          </a>
          <Link href="/" className="brand-text" onClick={() => setNavOpen(false)}>
            <span className="brand-name">Master Data</span>
            <span className="brand-sub">Governance portal</span>
          </Link>
        </div>

        <div className="nav-home">
          <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
            <span className="nav-icon"><IconHome /></span>
            <span className="nav-label">Home</span>
          </Link>
        </div>

        <div className="nav-scroll">
          <div className="nav-group">Master data objects</div>
          <Link href={SETUP_PATH} className={`nav-item ${pathname.startsWith(SETUP_PATH) ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
            <span className="nav-icon"><IconTree /></span>
            <span className="nav-label">Product Hierarchy</span>
            <span className="nav-tcode">{SETUP_TCODE}</span>
          </Link>
          <Link href={CRS_PATH} className={`nav-item ${pathname.startsWith(CRS_PATH) ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
            <span className="nav-icon"><IconLayers /></span>
            <span className="nav-label">CRS Product Grouping</span>
            <span className="nav-tcode">{CRS_TCODE}</span>
          </Link>
          {DOMAINS.map((d) => {
            const active = pathname.startsWith(`/master/${d.id}`);
            const Icon = DOMAIN_ICONS[d.id] ?? IconHome;
            return (
              <Link key={d.id} href={`/master/${d.id}`} className={`nav-item ${active ? 'active' : ''} ${d.enabled ? '' : 'nav-disabled'}`} onClick={() => setNavOpen(false)}>
                <span className="nav-icon"><Icon /></span>
                <span className="nav-label">{d.label}</span>
                <span className="nav-tcode">{d.tcode}</span>
                {d.id === 'material' && waiting > 0 && <span className="nav-count" aria-label={`${waiting} waiting`}>{waiting}</span>}
                {!d.enabled && <span className="nav-soon">Soon</span>}
              </Link>
            );
          })}
          <div className="nav-group">Administration</div>
          {ADMIN_LINKS.map((a) => (
            <Link key={a.href} href={a.href} className={`nav-item ${pathname.startsWith(a.href) ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
              <span className="nav-icon"><a.Icon /></span>
              <span className="nav-label">{a.label}</span>
              <span className="nav-tcode">{a.tcode}</span>
            </Link>
          ))}
        </div>

        <div className="nav-foot">
          <div className="user-card">
            <span className="avatar" aria-hidden>{initials}</span>
            <span className="user-text">
              <strong>{user.name || (sessionState === 'error' ? 'Unknown user' : '…')}</strong>
              <small>{role}</small>
            </span>
          </div>
        </div>
      </nav>
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}

      <div className="shell-main">
        <header className="topbar">
          <div aria-hidden className="banner-line" />
          <div className="banner">
            <button className="nav-toggle" onClick={() => setNavOpen((o) => !o)} aria-label="Toggle navigation" aria-expanded={navOpen}><IconMenu /></button>
            <div className="banner-title">
              <h1>{pageTitle}</h1>
              <p>{pageSub}</p>
            </div>
            <form className="tcode" onSubmit={runTcode} role="search">
              <label htmlFor="tcode-input" className="sr-only">Transaction code</label>
              <span className="tcode-prefix" aria-hidden>/n</span>
              <input
                id="tcode-input"
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                placeholder="T-code, e.g. ZMDM_M"
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="tcode-go" aria-label="Run transaction">Go</button>
            </form>
            <div className="topbar-right">
              <span className="user-chip" title={user.name}><span className="avatar avatar-top" aria-hidden>{initials}</span><span className="user-chip-name">{user.name}</span></span>
            </div>
          </div>
        </header>

        <main className="main">{children}</main>

        <footer className={`statusbar ${message ? `status-${message.type}` : sessionState === 'error' ? 'status-error' : ''}`} role="status" aria-live="polite">
          {message ? (
            <>
              <span className="status-icon" aria-hidden>{message.type === 'success' ? '✓' : message.type === 'error' ? '✕' : message.type === 'warning' ? '!' : 'i'}</span>
              <span className="status-text">{message.text}</span>
              <button className="status-close" onClick={clearMessage} aria-label="Dismiss message">×</button>
            </>
          ) : (
            sessionState === 'error' ? (
              <>
                <span className="status-icon" aria-hidden>✕</span>
                <span className="status-text">SAP is not reachable: {sessionError}</span>
                <button className="status-close" onClick={retrySession} aria-label="Try again" title="Try again">↻</button>
              </>
            ) : (
              <span className="status-text muted"><span className="status-dot" aria-hidden /> {sessionState === 'loading' ? 'Connecting to SAP…' : `Connected to SAP – signed in as ${user.name} (${role})`}</span>
            )
          )}
        </footer>
      </div>
    </div>
  );
}
