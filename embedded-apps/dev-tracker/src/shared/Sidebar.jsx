import React, { useState } from 'react';
import { ROUTES } from './routes.js';
import { clearHubSessionAndRedirect } from './AccountBar.jsx';
import { initialsHome } from './utils.js';
import { DatabaseIcon, ShieldIcon, StarBadgeIcon, UploadCloudIcon, LogOutIcon } from './icons.jsx';
import emamiLogo from './assets/emami-apps-logo.png';

function backToEmamiApps() {
  window.location.href = '/';
}

// No Workspace section — Home and Dashboard are reachable via the brand mark and the
// Dashboard major tile on Home, so they don't need their own nav entries too.
const NAV = [
  { key: 'masterData', label: 'Master Data', href: () => ROUTES.admin, icon: DatabaseIcon, section: 'admin', adminOnly: true },
  { key: 'importCenter', label: 'Import Center', href: () => ROUTES.importCenter, icon: UploadCloudIcon, section: 'admin', adminOnly: true },
  { key: 'evaluation', label: 'Evaluation', href: () => ROUTES.evaluation, icon: StarBadgeIcon, section: 'personal' },
  { key: 'qaSupport', label: 'QA Support', href: () => ROUTES.qaSupport, icon: ShieldIcon, section: 'trailing' },
];

const SECTIONS = [
  { key: 'admin', label: 'Admin' },
  { key: 'personal', label: 'Personal' },
  { key: 'trailing' }, // no label — just a divider before Settings, matching the reference
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
        {SECTIONS.map((section) => {
          const items = NAV.filter((n) => n.section === section.key && (!n.adminOnly || isAdmin));
          if (!items.length) return null;
          return (
            <div className={`sidebar-section${section.label ? '' : ' sidebar-section-divider'}`} key={section.key}>
              {section.label && <div className="sidebar-section-label">{section.label}</div>}
              {items.map((item) => {
                const IconComp = item.icon;
                return (
                  <a key={item.key} className={`sidebar-link${active === item.key ? ' active' : ''}`} href={item.href()}>
                    <IconComp size={16} />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-visual" aria-hidden="true">
        <svg className="sidebar-visual-art" viewBox="0 0 200 160" fill="none">
          <defs>
            <linearGradient id="sbCardGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          {/* Back cards — a loose stack, suggesting a queue of tracked items */}
          <rect x="26" y="66" width="112" height="72" rx="13" fill="url(#sbCardGrad)" opacity="0.22" transform="rotate(-9 82 102)" />
          <rect x="50" y="52" width="112" height="76" rx="13" fill="url(#sbCardGrad)" opacity="0.35" transform="rotate(5 106 90)" />
          {/* Front card */}
          <rect x="38" y="40" width="118" height="86" rx="15" fill="var(--sb-bg-2)" stroke="var(--accent)" strokeWidth="2.4" />
          {/* Checklist rows */}
          <circle cx="58" cy="61" r="6.5" fill="url(#sbCardGrad)" />
          <path d="M54.5 61 L57 63.7 L62.5 57.5" stroke="var(--sb-bg-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="71" y="57" width="62" height="7.5" rx="3.75" fill="var(--accent)" opacity="0.55" />

          <circle cx="58" cy="83" r="6.5" fill="url(#sbCardGrad)" />
          <path d="M54.5 83 L57 85.7 L62.5 79.5" stroke="var(--sb-bg-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="71" y="79" width="46" height="7.5" rx="3.75" fill="var(--accent)" opacity="0.55" />

          <circle cx="58" cy="105" r="6.5" fill="none" stroke="var(--accent)" strokeWidth="2.4" opacity="0.6" />
          <rect x="71" y="101" width="54" height="7.5" rx="3.75" fill="var(--accent)" opacity="0.3" />

          {/* Floating accent particles for depth */}
          <circle cx="168" cy="46" r="5" fill="var(--accent)" opacity="0.5" />
          <circle cx="180" cy="70" r="3" fill="var(--accent)" opacity="0.35" />
          <circle cx="24" cy="48" r="3.5" fill="var(--accent)" opacity="0.3" />
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
