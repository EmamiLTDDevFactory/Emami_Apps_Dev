import React, { useEffect, useState } from 'react';
import { ROUTES } from './routes.js';
import { clearHubSessionAndRedirect } from './AccountBar.jsx';
import { initialsHome } from './utils.js';
import { HomeIcon, BoardIcon, DatabaseIcon, ShieldIcon, ClockIcon, UploadCloudIcon, SettingsIcon, LogOutIcon, StarIcon, ListIcon, TimelineIcon, TableIcon, BarChartIcon } from './icons.jsx';
import emamiLogo from './assets/emami-apps-logo.png';

function backToEmamiApps() {
  window.location.href = '/';
}

// One flat nav list. `color` is each row's own accent, the same per-item color coding the Emami
// Apps hub sidebar uses (hub-next/src/theme/tokens.ts navColors) — Home keeps the brand indigo.
// The project rows (Board … Issues) all open the same workspace page, switched by hash — Jira's
// project sidebar. `section` starts a labelled group above that row.
const NAV = [
  { key: 'home', label: 'Home', href: () => ROUTES.home, icon: HomeIcon, color: '#4F3FD6' },
  { key: 'board', label: 'Board', href: () => ROUTES.board, icon: BoardIcon, color: '#0EA5E9', section: 'SAP Development' },
  { key: 'backlog', label: 'Backlog', href: () => ROUTES.backlog, icon: ListIcon, color: '#2563EB' },
  { key: 'timeline', label: 'Timeline', href: () => ROUTES.timeline, icon: TimelineIcon, color: '#7C3AED' },
  { key: 'issues', label: 'Issues', href: () => ROUTES.issues, icon: TableIcon, color: '#0D9488' },
  { key: 'reports', label: 'Reports', href: () => ROUTES.reports, icon: BarChartIcon, color: '#16A34A' },
  { key: 'myWork', label: 'My Work', href: () => ROUTES.myWork, icon: StarIcon, color: '#DB2777', section: 'Workspace' },
  { key: 'masterData', label: 'Master Data', href: () => ROUTES.admin, icon: DatabaseIcon, color: '#9333EA', adminOnly: true },
  { key: 'qaSupport', label: 'QA Support', href: () => ROUTES.qaSupport, icon: ShieldIcon, color: '#16A34A' },
  { key: 'importCenter', label: 'Import Center', href: () => ROUTES.importCenter, icon: UploadCloudIcon, color: '#0891B2', adminOnly: true },
  { key: 'changeLog', label: 'Change Log', href: () => ROUTES.changeLog, icon: ClockIcon, color: '#EA580C' },
  { key: 'settings', label: 'Settings', href: () => ROUTES.settings, icon: SettingsIcon, color: '#F59E0B', trailing: true },
];

/** Left navigation for Dev Tracker, styled to match the Emami Apps hub's own sidebar (white
 * panel, color-coded icon chips, tinted active row with a left accent bar). Always a side pane:
 * permanently docked on wide screens, and below 900px an off-canvas drawer opened from a slim
 * top bar's menu button (sidebar.css) — never a horizontal strip.
 *
 * `active` is the current NAV key; `isAdmin` gates admin-only rows (null while still checking —
 * nothing admin-only renders until it resolves true, so a non-admin never sees it flash). Pass
 * `identityInTopbar` on a page that renders <Topbar/> itself so the footer doesn't show a second,
 * redundant avatar/sign-out. `subtitle` renders a small heading under the brand mark. */
export default function Sidebar({ active, isAdmin, name, email, identityInTopbar = false, subtitle }) {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const displayName = name || email || '';
  const activeItem = NAV.find((n) => n.key === active);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    // Stops the page behind the open drawer from scrolling on phones.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  return (
    <>
      <div className="sidebar-mobilebar">
        <button type="button" className="sidebar-menu-btn" aria-label="Open navigation menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <a className="sidebar-mobilebar-brand" href={ROUTES.home} title="Emami Apps — Dev Tracker">
          <img src={emamiLogo} alt="Emami Apps" />
          <span>Dev Tracker</span>
        </a>
        {activeItem && <span className="sidebar-mobilebar-page">{activeItem.label}</span>}
      </div>

      {drawerOpen && <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />}

      <aside className={`sidebar${drawerOpen ? ' is-open' : ''}`} aria-label="Dev Tracker navigation">
        <button type="button" className="sidebar-close-btn" aria-label="Close navigation menu" onClick={() => setDrawerOpen(false)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <a className="sidebar-brand" href={ROUTES.home} title="Emami Apps — Dev Tracker">
          <img src={emamiLogo} alt="Emami Apps" className="sidebar-logo" />
        </a>
        <div className="sidebar-app-name">Dev Tracker</div>
        {subtitle && <div className="sidebar-subtitle">{subtitle}</div>}

        <nav className="sidebar-nav">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
            const IconComp = item.icon;
            const isActive = active === item.key;
            return (
              <React.Fragment key={item.key}>
              {item.section && <div className="sidebar-section">{item.section}</div>}
              <a
                className={`sidebar-link${isActive ? ' active' : ''}${item.trailing ? ' sidebar-link-trailing' : ''}`}
                href={item.href()}
                style={{ '--item': item.color }}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setDrawerOpen(false)}
              >
                <span className="sidebar-link-chip"><IconComp size={15} strokeWidth={2.2} /></span>
                <span>{item.label}</span>
              </a>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-hub-link" onClick={backToEmamiApps}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            <span>Back to Emami Apps</span>
          </button>
          {!identityInTopbar && (
            <div className="sidebar-user" onMouseLeave={() => setSignOutOpen(false)}>
              <div className="avatar mono sidebar-avatar">{initialsHome(displayName)}</div>
              <div className="sidebar-user-text">
                <div className="sidebar-user-name">{displayName}</div>
                {name && <div className="sidebar-user-email">{email}</div>}
              </div>
              <button type="button" className="sidebar-signout-toggle" title="Sign out" onClick={() => setSignOutOpen((o) => !o)}>
                <LogOutIcon size={15} />
              </button>
              {signOutOpen && (
                <div className="sidebar-signout-menu">
                  <button onClick={clearHubSessionAndRedirect}>Sign out</button>
                </div>
              )}
            </div>
          )}
          <div className="sidebar-copyright">© {new Date().getFullYear()} Emami Limited</div>
        </div>
      </aside>
    </>
  );
}
