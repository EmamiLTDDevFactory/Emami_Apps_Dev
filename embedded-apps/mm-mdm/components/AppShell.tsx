'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useState } from 'react';
import { useMdm } from '@/lib/store';
import { DOMAINS, SETUP_PATH, SETUP_TCODE, resolveTcode } from '@/lib/tcodes';
import { USERS } from '@/lib/workflowConfig';
import { DOMAIN_ICONS, IconHome, IconMenu, IconRefresh, IconTree } from './icons';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUserId, message, notify, clearMessage, waiting, resetDemo } = useMdm();
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

  const initials = user.name.split(' ').map((p) => p[0]).join('');
  const role = user.level === null ? 'Initiator' : `Level ${user.level} · ${user.department}`;

  return (
    <div className="shell">
      <nav className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Master data objects">
        <Link href="/" className="brand" onClick={() => setNavOpen(false)}>
          <span className="brand-mark" aria-hidden>M</span>
          <span className="brand-text">
            <span className="brand-name">Master Data</span>
            <span className="brand-sub">Governance portal</span>
          </span>
        </Link>

        <div className="nav-scroll">
          <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
            <span className="nav-icon"><IconHome /></span>
            <span className="nav-label">Overview</span>
          </Link>
          <div className="nav-group">Master data objects</div>
          <Link href={SETUP_PATH} className={`nav-item ${pathname.startsWith(SETUP_PATH) ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
            <span className="nav-icon"><IconTree /></span>
            <span className="nav-label">Product Hierarchy &amp; CRS</span>
            <span className="nav-tcode">{SETUP_TCODE}</span>
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
        </div>

        <div className="nav-foot">
          <div className="user-card">
            <span className="avatar" aria-hidden>{initials}</span>
            <span className="user-text">
              <strong>{user.name}</strong>
              <small>{role}</small>
            </span>
          </div>
          <button className="nav-reset" onClick={resetDemo}><IconRefresh size={15} /> Reset demo data</button>
        </div>
      </nav>
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}

      <div className="shell-main">
        <header className="topbar">
          <button className="nav-toggle" onClick={() => setNavOpen((o) => !o)} aria-label="Toggle navigation" aria-expanded={navOpen}><IconMenu /></button>
          <form className="tcode" onSubmit={runTcode} role="search">
            <label htmlFor="tcode-input" className="sr-only">Transaction code</label>
            <span className="tcode-prefix" aria-hidden>/n</span>
            <input
              id="tcode-input"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="Enter t-code, e.g. ZMDM_M"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" className="tcode-go" aria-label="Run transaction">Go</button>
          </form>
          <div className="topbar-right">
            <label className="role-switch">
              <span className="role-switch-label">Acting as</span>
              <select value={user.id} onChange={(e) => setUserId(e.target.value)} aria-label="Signed in as (demo user switch)">
                <optgroup label="Initiator">
                  {USERS.filter((u) => u.level === null).map((u) => (
                    <option key={u.id} value={u.id}>{u.name} – Initiator</option>
                  ))}
                </optgroup>
                <optgroup label="Workflow levels">
                  {USERS.filter((u) => u.level !== null).map((u) => (
                    <option key={u.id} value={u.id}>L{u.level} {u.department} – {u.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <span className="avatar avatar-top" title={user.name}>{initials}</span>
          </div>
        </header>

        <main className="main">{children}</main>

        <footer className={`statusbar ${message ? `status-${message.type}` : ''}`} role="status" aria-live="polite">
          {message ? (
            <>
              <span className="status-icon" aria-hidden>{message.type === 'success' ? '✓' : message.type === 'error' ? '✕' : message.type === 'warning' ? '!' : 'i'}</span>
              <span className="status-text">{message.text}</span>
              <button className="status-close" onClick={clearMessage} aria-label="Dismiss message">×</button>
            </>
          ) : (
            <span className="status-text muted"><span className="status-dot" aria-hidden /> Ready – signed in as {user.name} ({role})</span>
          )}
        </footer>
      </div>
    </div>
  );
}
