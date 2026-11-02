'use client';

import { Activity, BrainCircuit, Crosshair, Database, LayoutDashboard, Radar, Sparkles, Table, X, Zap, type LucideIcon } from 'lucide-react';

// next/link's `href` and next/navigation's router both auto-prepend next.config.js's basePath —
// so nav hrefs throughout this app are written WITHOUT it. Plain <img> tags get no such help, so
// this is the one place that constant is spelled out, matching every sibling embedded app's own
// Sidebar/Shell (e.g. fm-po-deviation/src/components/Shell.tsx).
const BASE_PATH = '/apps/cashflow-forecast';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { id: 'overview', label: 'Executive Overview', icon: LayoutDashboard },
  { id: 'forecast', label: 'Forecast', icon: Crosshair },
  { id: 'insights', label: 'AI Insights', icon: Sparkles },
  { id: 'risk', label: 'Risk Dashboard', icon: Radar },
  { id: 'explain', label: 'AI Explainability', icon: BrainCircuit },
  { id: 'actions', label: 'Action Center', icon: Zap },
  { id: 'lines', label: 'Line Items', icon: Table },
  { id: 'data', label: 'Data Health', icon: Activity },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isWideScreen: boolean;
  live: boolean;
}

/** Same white-sidebar-with-the-Emami-Apps-logo look every sibling embedded app uses (see
 * fm-po-deviation/src/components/Shell.tsx's NavPane) — permanent/docked on a wide viewport,
 * an overlay drawer with a backdrop and close button below the hub's own mobile breakpoint.
 * Nav items are same-page anchor links (this is a single-page dashboard, not a multi-route app),
 * so there's no "active route" to highlight — clicking one just scrolls to that section and, on
 * the overlay variant, closes the drawer. */
export default function Sidebar({ isOpen, onClose, isWideScreen, live }: Props) {
  const paneClassName = isWideScreen ? 'sidebar' : `sidebar overlay${isOpen ? ' open' : ''}`;

  return (
    <aside className={paneClassName} aria-label="Primary navigation">
      <div className="sidebar-head">
        {!isWideScreen && (
          <button className="nav-close" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        )}
        <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" className="sidebar-logo" />
        </a>
      </div>
      <nav>
        {NAV.map((n) => (
          <a key={n.id} href={`#${n.id}`} onClick={onClose}>
            <n.icon size={16} /> {n.label}
          </a>
        ))}
      </nav>
      <div className="system">
        <span className="sys-row">
          <Database size={13} /> {live ? 'SAP OData V2 live' : 'Demo data mode'}
        </span>
        SAP ECC 6.0 · EHP 8<br />
        SoH 2.0 · Gateway OData
      </div>
    </aside>
  );
}
