'use client';

import { CircleAlert, Download, Menu, RefreshCw } from 'lucide-react';

interface DataQuality {
  label: string;
  tone: 'green' | 'amber' | 'red';
}

interface Props {
  onRefresh: () => void;
  onExport: () => void;
  onMenu: () => void;
  busy: boolean;
  isWideScreen: boolean;
  lastLoadedAt?: Date;
  dataQuality?: DataQuality;
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Topbar({ onRefresh, onExport, onMenu, busy, isWideScreen, lastLoadedAt, dataQuality }: Props) {
  return (
    <header>
      <div className="topbar-left">
        {!isWideScreen && (
          <button className="nav-burger" onClick={onMenu} aria-label="Open navigation">
            <Menu size={20} />
          </button>
        )}
        <div>
          <h1>Cash Flow Forecast AI Agent</h1>
          <p>
            Responsive Next.js application with SAP Gateway OData V2 integration
            {lastLoadedAt && ` · Updated ${formatClock(lastLoadedAt)}`}
          </p>
        </div>
      </div>
      <div className="topbar-actions">
        {dataQuality && (
          <span className={`dq-badge dq-${dataQuality.tone}`} title={dataQuality.label}>
            <CircleAlert size={13} /> {dataQuality.label}
          </span>
        )}
        <button className="btn ghost" onClick={onExport}>
          <Download size={15} /> Export CSV
        </button>
        <button className="btn" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh
        </button>
      </div>
    </header>
  );
}
