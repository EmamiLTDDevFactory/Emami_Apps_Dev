'use client';

import { Download, Menu, RefreshCw } from 'lucide-react';

interface Props {
  onRefresh: () => void;
  onExport: () => void;
  onMenu: () => void;
  busy: boolean;
  isWideScreen: boolean;
}

export default function Topbar({ onRefresh, onExport, onMenu, busy, isWideScreen }: Props) {
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
          <p>Responsive Next.js application with SAP Gateway OData V2 integration</p>
        </div>
      </div>
      <div className="topbar-actions">
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
