'use client';

import { ArrowLeft, Activity, BrainCircuit, Crosshair, Database, LayoutDashboard, Radar, Sparkles, Table, WalletCards, X, Zap, type LucideIcon } from 'lucide-react';

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
  open: boolean;
  onClose: () => void;
  live: boolean;
}

export default function Sidebar({ open, onClose, live }: Props) {
  return (
    <aside className={open ? 'open' : ''} aria-label="Primary navigation">
      <button className="nav-close" onClick={onClose} aria-label="Close navigation">
        <X size={18} />
      </button>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="back-to-hub">
        <ArrowLeft size={13} /> Back to Emami Apps
      </a>
      <div className="brand">
        <WalletCards /> <span>CashFlow Intelligence</span>
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
