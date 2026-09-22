import React, { useState } from 'react';
import { ROUTES } from './routes.js';
import { clearHubSessionAndRedirect } from './AccountBar.jsx';
import { initialsHome } from './utils.js';
import { HomeIcon, BoardIcon, DatabaseIcon, ShieldIcon, ClockIcon, UploadCloudIcon, SettingsIcon, LogOutIcon, StarIcon } from './icons.jsx';
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
  { key: 'myWork', label: 'My Work', href: () => ROUTES.myWork, icon: StarIcon },
  { key: 'masterData', label: 'Master Data', href: () => ROUTES.admin, icon: DatabaseIcon, adminOnly: true },
  { key: 'qaSupport', label: 'QA Support', href: () => ROUTES.qaSupport, icon: ShieldIcon },
  { key: 'importCenter', label: 'Import Center', href: () => ROUTES.importCenter, icon: UploadCloudIcon, adminOnly: true },
  { key: 'changeLog', label: 'Change Log', href: () => ROUTES.changeLog, icon: ClockIcon },
  { key: 'settings', label: 'Settings', href: () => ROUTES.settings, icon: SettingsIcon, trailing: true },
];

/** Left navigation shell for Dev Tracker — brand mark, section-grouped nav, and (on pages
 * that don't have their own Topbar) the signed-in user's identity + sign-out. `active` is
 * the current NAV key; `isAdmin` gates the Admin section (null while still checking —
 * nothing admin-only renders until it resolves true, so a non-admin never sees it flash).
 * Pass `identityInTopbar` on a page that renders <Topbar/> itself (currently just Home) so
 * the footer doesn't show a second, redundant avatar/sign-out. `subtitle` renders a small
 * heading under the brand mark (unused unless a page passes one). `visual` swaps the
 * decorative filler art + footer between the default light "trend" look, Dashboard's dark
 * "skyline" look, and Resource Utilization's light "roster" (workload bars) look — passing
 * nothing keeps every existing page pixel-identical. */
export default function Sidebar({ active, isAdmin, name, email, identityInTopbar = false, subtitle, visual = 'trend' }) {
  const [open, setOpen] = useState(false);
  const displayName = name || email || '';

  return (
    <aside className={`sidebar${visual === 'skyline' ? ' sidebar-skyline' : ''}${visual === 'mountain' ? ' sidebar-mountain' : ''}${visual === 'forest' ? ' sidebar-forest' : ''}`}>
      <a className="sidebar-brand" href={ROUTES.home} title="Emami Apps — Dev Tracker">
        <img src={emamiLogo} alt="Emami Apps" className="sidebar-logo" />
      </a>
      {subtitle && <div className="sidebar-subtitle">{subtitle}</div>}

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

      {visual === 'skyline' ? (
        <div className="sidebar-visual sidebar-visual-skyline" aria-hidden="true">
          <svg className="sidebar-skyline-art" viewBox="0 0 200 130" preserveAspectRatio="xMidYMax slice" fill="none">
            <rect x="4" y="46" width="20" height="84" fill="oklch(30% 0.05 255)" />
            <rect x="28" y="30" width="18" height="100" fill="oklch(34% 0.055 255)" />
            <rect x="50" y="58" width="16" height="72" fill="oklch(28% 0.048 255)" />
            <rect x="70" y="14" width="22" height="116" fill="oklch(36% 0.06 255)" />
            <rect x="96" y="42" width="16" height="88" fill="oklch(30% 0.05 255)" />
            <rect x="116" y="64" width="20" height="66" fill="oklch(28% 0.048 255)" />
            <rect x="140" y="24" width="18" height="106" fill="oklch(34% 0.055 255)" />
            <rect x="162" y="50" width="16" height="80" fill="oklch(30% 0.05 255)" />
            <rect x="182" y="70" width="14" height="60" fill="oklch(28% 0.048 255)" />
            {[[8,54],[8,70],[8,86],[32,38],[32,54],[32,70],[32,86],[32,102],[74,22],[74,38],[74,54],[74,70],[74,86],[74,102],[100,50],[100,66],[100,82],[120,72],[120,88],[144,32],[144,48],[144,64],[144,80],[144,96],[166,58],[166,74],[166,90],[186,78],[186,94]].map(([x,y],i) => (
              <rect key={i} x={x} y={y} width="4" height="5" fill="oklch(76% 0.13 85)" opacity={0.35 + (i % 3) * 0.2} />
            ))}
          </svg>
          <div className="sidebar-skyline-tagline">
            <span>Deliver Today</span>
            <span>A Brighter Tomorrow</span>
            <span className="sidebar-skyline-rule" />
          </div>
        </div>
      ) : visual === 'mountain' ? (
        <div className="sidebar-visual sidebar-visual-mountain" aria-hidden="true">
          <svg className="sidebar-mountain-art" viewBox="0 0 200 130" preserveAspectRatio="xMidYMax slice" fill="none">
            <circle cx="156" cy="22" r="9" fill="oklch(90% 0.03 90)" opacity="0.85" />
            {[[18,20],[42,13],[104,9],[172,15],[188,38],[70,18]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r="1.3" fill="oklch(92% 0.02 90)" opacity={0.4 + (i % 3) * 0.18} />
            ))}
            <path d="M0 122 L32 68 L52 94 L80 42 L110 98 L138 60 L166 100 L200 80 L200 130 L0 130 Z" fill="oklch(38% 0.06 245)" />
            <path d="M16 80 L32 68 L44 84 Z" fill="oklch(94% 0.01 245)" opacity="0.92" />
            <path d="M68 60 L80 42 L90 62 Z" fill="oklch(94% 0.01 245)" opacity="0.92" />
            <path d="M126 76 L138 60 L148 78 Z" fill="oklch(94% 0.01 245)" opacity="0.92" />
            <path d="M0 130 L38 102 L74 124 L116 94 L158 118 L200 102 L200 130 Z" fill="oklch(26% 0.05 248)" />
          </svg>
          <div className="sidebar-mountain-tagline">
            <span>People</span>
            <span>Process</span>
            <span>Progress</span>
            <span className="sidebar-mountain-rule" />
          </div>
        </div>
      ) : visual === 'forest' ? (
        <div className="sidebar-visual sidebar-visual-forest" aria-hidden="true">
          <svg className="sidebar-forest-art" viewBox="0 0 200 150" preserveAspectRatio="xMidYMax slice" fill="none">
            <path d="M0 96 L40 34 L70 70 L100 20 L140 78 L200 40 L200 150 L0 150 Z" fill="oklch(52% 0.06 235)" opacity="0.55" />
            {[[16,90],[16,78],[16,66],[168,86],[168,74],[182,96]].map(([x,y],i) => (
              <path key={i} d={`M${x} ${y+22} L${x+7} ${y} L${x+14} ${y+22} Z M${x} ${y+14} L${x+7} ${y-8} L${x+14} ${y+14} Z`} fill="oklch(30% 0.05 165)" opacity={0.7 + (i % 2) * 0.2} />
            ))}
            <path d="M0 118 L36 62 L64 98 L98 46 L132 104 L166 58 L200 88 L200 150 L0 150 Z" fill="oklch(24% 0.05 220)" />
            <path d="M18 98 L36 62 L50 92 Z" fill="oklch(94% 0.01 220)" opacity="0.85" />
            <path d="M82 76 L98 46 L110 82 Z" fill="oklch(94% 0.01 220)" opacity="0.85" />
            <path d="M150 86 L166 58 L178 88 Z" fill="oklch(94% 0.01 220)" opacity="0.85" />
          </svg>
          <div className="sidebar-forest-tagline">
            <span>Better</span>
            <span>Processes</span>
            <span>Brighter Delivery</span>
            <span className="sidebar-forest-rule" />
          </div>
        </div>
      ) : visual === 'roster' ? (
        <div className="sidebar-visual" aria-hidden="true">
          <svg className="sidebar-visual-art" viewBox="0 0 200 150" fill="none">
            <defs>
              <linearGradient id="sbBarGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="var(--st-teal)" stopOpacity="0.9" />
                <stop offset="1" stopColor="var(--st-teal)" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            {/* Workload bars, longest to shortest — a quiet nod to this page's own allocation
                bars, each capped with a little avatar dot instead of the trend art's line. */}
            <circle cx="14" cy="26" r="6" fill="var(--sb-bg-2)" stroke="var(--st-teal)" strokeWidth="2.4" />
            <rect x="28" y="22" width="150" height="8" rx="4" fill="url(#sbBarGrad)" />
            <circle cx="14" cy="58" r="6" fill="var(--sb-bg-2)" stroke="var(--st-teal)" strokeWidth="2.4" />
            <rect x="28" y="54" width="118" height="8" rx="4" fill="url(#sbBarGrad)" opacity="0.85" />
            <circle cx="14" cy="90" r="6" fill="var(--sb-bg-2)" stroke="var(--st-teal)" strokeWidth="2.4" />
            <rect x="28" y="86" width="94" height="8" rx="4" fill="url(#sbBarGrad)" opacity="0.7" />
            <circle cx="14" cy="122" r="6" fill="var(--sb-bg-2)" stroke="var(--st-teal)" strokeWidth="2.4" />
            <rect x="28" y="118" width="60" height="8" rx="4" fill="url(#sbBarGrad)" opacity="0.55" />

            {/* Floating accent particles for depth, matching the trend art's convention */}
            <circle cx="182" cy="18" r="4" fill="var(--st-teal)" opacity="0.3" />
            <circle cx="190" cy="70" r="3" fill="var(--st-teal)" opacity="0.35" />
            <circle cx="176" cy="112" r="2.5" fill="var(--st-teal)" opacity="0.4" />
          </svg>
        </div>
      ) : (
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
      )}

      <div className="sidebar-footer">
        {visual !== 'skyline' && visual !== 'mountain' && visual !== 'forest' && (
          <button type="button" className="sidebar-hub-link" onClick={backToEmamiApps}>
            <span aria-hidden="true">🏠</span><span>Back to Emami Apps</span>
          </button>
        )}
        {identityInTopbar ? (
          <div className="sidebar-version">{visual === 'skyline' || visual === 'mountain' || visual === 'forest' ? 'v1.0.0' : 'Emami Apps · Dev Tracker'}</div>
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
