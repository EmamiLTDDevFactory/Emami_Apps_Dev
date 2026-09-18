import React, { useState } from 'react';
import { ROUTES } from './routes.js';
import { clearHubSessionAndRedirect } from './AccountBar.jsx';
import { initialsHome } from './utils.js';
import { HomeIcon, BoardIcon, DatabaseIcon, ShieldIcon, StarBadgeIcon, UploadCloudIcon, SettingsIcon, LogOutIcon } from './icons.jsx';
import emamiLogo from './assets/emami-apps-logo.png';

function backToEmamiApps() {
  window.location.href = '/';
}

// One flat nav list, matching the command-centre reference design — Home and Dashboard
// now have their own entries alongside the rest instead of being reachable only via the
// brand mark / Home's Dashboard tile.
const NAV = [
  { key: 'home', label: 'Home', href: () => ROUTES.home, icon: HomeIcon },
  { key: 'dashboard', label: 'Dashboard', href: () => ROUTES.dashboard, icon: BoardIcon },
  { key: 'masterData', label: 'Master Data', href: () => ROUTES.admin, icon: DatabaseIcon, adminOnly: true },
  { key: 'qaSupport', label: 'QA Support', href: () => ROUTES.qaSupport, icon: ShieldIcon },
  { key: 'importCenter', label: 'Import Center', href: () => ROUTES.importCenter, icon: UploadCloudIcon, adminOnly: true },
  { key: 'evaluation', label: 'Evaluation', href: () => ROUTES.evaluation, icon: StarBadgeIcon },
  { key: 'settings', label: 'Settings', href: () => ROUTES.settings, icon: SettingsIcon, trailing: true },
];

/** Left navigation shell for Dev Tracker — brand mark, section-grouped nav, and (on pages
 * that don't have their own Topbar) the signed-in user's identity + sign-out. `active` is
 * the current NAV key; `isAdmin` gates the Admin section (null while still checking —
 * nothing admin-only renders until it resolves true, so a non-admin never sees it flash).
 * Pass `identityInTopbar` on a page that renders <Topbar/> itself (currently just Home) so
 * the footer doesn't show a second, redundant avatar/sign-out. */
export default function Sidebar({ active, isAdmin, name, email, identityInTopbar = false }) {
  const [open, setOpen] = useState(false);
  const displayName = name || email || '';

  return (
    <aside className="sidebar">
      <a className="sidebar-brand" href={ROUTES.home} title="Emami Apps — Dev Tracker">
        <img src={emamiLogo} alt="Emami Apps" className="sidebar-logo" />
      </a>

      <nav className="sidebar-nav">
        {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
          const IconComp = item.icon;
          return (
            <a
              key={item.key}
              className={`sidebar-link${active === item.key ? ' active' : ''}${item.trailing ? ' sidebar-link-trailing' : ''}`}
              href={item.href()}
            >
              <IconComp size={16} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="sidebar-visual" aria-hidden="true">
        <svg className="sidebar-visual-art" viewBox="0 0 200 160" fill="none">
          <defs>
            <linearGradient id="sbWaveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.5" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="sbWaveGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {/* Rolling hills, back-to-front — a quiet backdrop for the trend line above it */}
          <path d="M0 112 C 30 92, 60 122, 92 102 C 124 82, 152 112, 200 92 L200 160 L0 160 Z" fill="url(#sbWaveGrad2)" />
          <path d="M0 130 C 34 106, 66 134, 100 114 C 134 94, 160 124, 200 106 L200 160 L0 160 Z" fill="url(#sbWaveGrad)" />

          {/* Rising delivery trend — up and to the right, capped with a little "lift" flourish */}
          <path d="M18 118 L58 96 L96 106 L134 70 L178 46" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
          <circle cx="18" cy="118" r="4.5" fill="var(--sb-bg-2)" stroke="var(--accent)" strokeWidth="2.4" />
          <circle cx="58" cy="96" r="4.5" fill="var(--sb-bg-2)" stroke="var(--accent)" strokeWidth="2.4" />
          <circle cx="96" cy="106" r="4.5" fill="var(--sb-bg-2)" stroke="var(--accent)" strokeWidth="2.4" />
          <circle cx="134" cy="70" r="4.5" fill="var(--sb-bg-2)" stroke="var(--accent)" strokeWidth="2.4" />
          <circle cx="178" cy="46" r="6" fill="var(--accent)" />
          <path d="M178 46 L169 42 M178 46 L183 37" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />

          {/* Floating accent particles for depth */}
          <circle cx="150" cy="28" r="4" fill="var(--accent)" opacity="0.35" />
          <circle cx="24" cy="42" r="3" fill="var(--accent)" opacity="0.3" />
          <circle cx="183" cy="76" r="2.5" fill="var(--accent)" opacity="0.4" />
        </svg>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-hub-link" onClick={backToEmamiApps}>
          <span aria-hidden="true">🏠</span><span>Back to Emami Apps</span>
        </button>
        {identityInTopbar ? (
          <div className="sidebar-version">Emami Apps · Dev Tracker</div>
        ) : (
          <div className="sidebar-user" onMouseLeave={() => setOpen(false)}>
            <div className="avatar mono sidebar-avatar">{initialsHome(displayName)}</div>
            <div className="sidebar-user-text">
              <div className="sidebar-user-name">{displayName}</div>
              {name && <div className="sidebar-user-email">{email}</div>}
            </div>
            <button type="button" className="sidebar-signout-toggle" title="Sign out" onClick={() => setOpen((o) => !o)}>
              <LogOutIcon size={15} />
            </button>
            {open && (
              <div className="sidebar-signout-menu">
                <button onClick={clearHubSessionAndRedirect}>Sign out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
