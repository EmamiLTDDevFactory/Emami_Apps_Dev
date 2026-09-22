'use client';

import { X } from 'lucide-react';

// next/link's `href` and next/navigation's router both auto-prepend next.config.js's basePath —
// so hrefs throughout this app are written WITHOUT it. Plain <img> tags get no such help, so this
// is the one place that constant is spelled out, matching every sibling embedded app's own
// Sidebar/Shell (e.g. cashflow-forecast/src/components/Sidebar.tsx).
const BASE_PATH = '/apps/journal-anomaly-agent';

export interface NavGroup {
  title: string;
  items: { id: string; label: string; count?: number }[];
}

export const NAV: NavGroup[] = [
  {
    title: 'Risk Intelligence',
    items: [
      { id: 'exec', label: 'Executive Command Center' },
      { id: 'workbench', label: 'Anomaly Workbench', count: 47 },
      { id: 'explorer', label: 'Journal Entry Explorer' },
      { id: 'patterns', label: 'Pattern Intelligence' },
      { id: 'close', label: 'Period-End Close Guard' },
      { id: 'integrations', label: 'Integrated Process Risk' },
    ],
  },
  {
    title: 'Investigation & Assurance',
    items: [
      { id: 'cases', label: 'Case Management', count: 12 },
      { id: 'evidence', label: 'Audit Evidence Center' },
      { id: 'model', label: 'AI Explainability & Governance' },
      { id: 'security', label: 'Security & Integration Health' },
    ],
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isWideScreen: boolean;
  activePage: string;
  onNavigate: (id: string) => void;
  live: boolean;
}

/** Same white-sidebar-with-the-Emami-Apps-logo look every sibling embedded app uses — permanent/
 * docked on a wide viewport, an overlay drawer with a backdrop and close button below the hub's
 * own mobile breakpoint. Unlike cashflow-forecast (a single continuously-scrolling dashboard with
 * anchor-link nav), this app is genuinely tabbed — each item swaps the visible section — matching
 * the source prototype's own actual navigation model. */
export default function Sidebar({ isOpen, onClose, isWideScreen, activePage, onNavigate, live }: Props) {
  const paneClassName = isWideScreen ? 'sidebar' : `sidebar overlay${isOpen ? ' open' : ''}`;

  return (
    <aside className={paneClassName} aria-label="Primary navigation">
      <div className="sidebar-head">
        {!isWideScreen && (
          <button className="nav-close" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" className="sidebar-logo" />
      </div>
      <nav className="nav">
        {NAV.map((g) => (
          <div key={g.title}>
            <div className="n-title">{g.title}</div>
            {g.items.map((it) => (
              <button
                key={it.id}
                className={activePage === it.id ? 'active' : ''}
                onClick={() => {
                  onNavigate(it.id);
                  onClose();
                }}
              >
                {it.label}
                {it.count != null && <span className="count">{it.count}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="system">
        <span className="sys-row">{live ? 'SAP OData V2 live' : 'Demo data mode'}</span>
        SAP ECC 6.0 · EHP 8<br />
        SoH 2.0 · Gateway OData
      </div>
    </aside>
  );
}
