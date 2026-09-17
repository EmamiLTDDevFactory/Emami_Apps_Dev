import React, { useState } from 'react';
import { ROUTES } from './routes.js';
import { clearHubSessionAndRedirect } from './AccountBar.jsx';
import { initialsHome } from './utils.js';
import { DatabaseIcon, ShieldIcon, StarBadgeIcon, UploadCloudIcon, SettingsIcon, LogOutIcon } from './icons.jsx';
import emamiLogo from './assets/emami-apps-logo.png';

function backToEmamiApps() {
  window.location.href = '/';
}

// No Workspace section — Home and Dashboard are reachable via the brand mark and the
// Dashboard major tile on Home, so they don't need their own nav entries too.
const NAV = [
  { key: 'masterData', label: 'Master Data', href: () => ROUTES.admin, icon: DatabaseIcon, section: 'admin', adminOnly: true },
  { key: 'qaSupport', label: 'QA Support', href: () => ROUTES.qaSupport, icon: ShieldIcon, section: 'admin', adminOnly: true },
  { key: 'importCenter', label: 'Import Center', href: () => ROUTES.importCenter, icon: UploadCloudIcon, section: 'admin', adminOnly: true },
  { key: 'evaluation', label: 'Evaluation', href: () => ROUTES.evaluation, icon: StarBadgeIcon, section: 'personal' },
  { key: 'settings', label: 'Settings', href: () => ROUTES.settings, icon: SettingsIcon, section: 'trailing' },
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
        <svg className="sidebar-visual-art" viewBox="0 0 200 150" fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="45" y="14" width="110" height="76" rx="7" />
          <rect x="56" y="25" width="88" height="54" rx="3" />
          <path d="M26 106 L174 106 L190 136 L10 136 Z" />
          <rect x="86" y="114" width="28" height="12" rx="3" />
          <g stroke="none" fill="var(--accent)">
            <rect x="38" y="118" width="11" height="7" rx="1.5" opacity="0.6" />
            <rect x="54" y="118" width="11" height="7" rx="1.5" opacity="0.6" />
            <rect x="135" y="118" width="11" height="7" rx="1.5" opacity="0.6" />
            <rect x="151" y="118" width="11" height="7" rx="1.5" opacity="0.6" />
          </g>
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
