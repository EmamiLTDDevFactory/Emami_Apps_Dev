'use client';

import { Activity, ClipboardCheck, Flag, Grid3x3, LayoutDashboard, Radar, RefreshCw, Sparkles, Table2, X } from 'lucide-react';

const BASE_PATH = '/apps/credit-risk-advisory';

export interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

export const COCKPIT: NavItem[] = [
  { id: 'executive', label: 'Executive Overview', icon: LayoutDashboard },
  { id: 'worklist', label: 'Operations Worklist', icon: Table2 },
  { id: 'customer', label: 'Customer 360', icon: Grid3x3 },
  { id: 'portfolio', label: 'Portfolio Analytics', icon: Radar },
];

export const GOVERNANCE: NavItem[] = [
  { id: 'workflow', label: 'Approval Workflow', icon: ClipboardCheck },
  { id: 'policy', label: 'Policy & Exceptions', icon: Flag },
  { id: 'agent', label: 'Agent Monitoring', icon: Sparkles },
  { id: 'integration', label: 'Integration Health', icon: RefreshCw },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isWideScreen: boolean;
  page: string;
  onNavigate: (id: string) => void;
  worklistCount: number;
  highRiskCount: number;
  live: boolean;
}

/** Same white-sidebar-with-the-Emami-Apps-logo look every sibling embedded app uses (see
 * cashflow-forecast/src/components/Sidebar.tsx and fm-po-deviation's Shell.tsx) — permanent/
 * docked on a wide viewport, an overlay drawer with a backdrop and close button below the hub's
 * own mobile breakpoint. Unlike cashflow-forecast (a single scrolling page with anchor-link nav),
 * this app is a true multi-section SPA — nav items switch `page` state, matching the source
 * prototype's own AppShell.tsx cockpit/governance grouping. */
export default function Sidebar({ isOpen, onClose, isWideScreen, page, onNavigate, worklistCount, highRiskCount, live }: Props) {
  const paneClassName = isWideScreen ? 'sidebar' : `sidebar overlay${isOpen ? ' open' : ''}`;

  function go(id: string) {
    onNavigate(id);
    onClose();
  }

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
      <div className="nav-title">Decision Cockpit</div>
      <nav>
        {COCKPIT.map((n) => (
          <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => go(n.id)}>
            <n.icon size={16} />
            <span>{n.label}</span>
            {n.id === 'worklist' && worklistCount > 0 && <span className="count">{worklistCount}</span>}
          </button>
        ))}
      </nav>
      <div className="nav-title">Control &amp; Governance</div>
      <nav>
        {GOVERNANCE.map((n) => (
          <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => go(n.id)}>
            <n.icon size={16} />
            <span>{n.label}</span>
            {n.id === 'workflow' && highRiskCount > 0 && <span className="count">{highRiskCount}</span>}
          </button>
        ))}
      </nav>
      <div className="system">
        <span className="sys-row">
          <Activity size={13} /> {live ? 'SAP OData V2 live' : 'Demo data mode'}
        </span>
        SAP ECC 6.0 · EHP 8
        <br />
        Advisory only · Human approval required
      </div>
    </aside>
  );
}
