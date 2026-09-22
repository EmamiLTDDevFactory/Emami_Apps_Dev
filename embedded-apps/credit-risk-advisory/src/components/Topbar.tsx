'use client';

import { Download, Menu, RefreshCw } from 'lucide-react';

interface Props {
  onRefresh: () => void;
  onExport: (type: string) => void;
  onMenu: () => void;
  busy: boolean;
  isWideScreen: boolean;
  stamp: string;
}

export default function Topbar({ onRefresh, onExport, onMenu, busy, isWideScreen, stamp }: Props) {
  return (
    <header>
      <div className="topbar-left">
        {!isWideScreen && (
          <button className="nav-burger" onClick={onMenu} aria-label="Open navigation">
            <Menu size={20} />
          </button>
        )}
        <div>
          <h1>Credit Risk Advisory AI Agent</h1>
          <p>SAP ECC 6.0 EHP8 · Advisory only · Human approval required before any SAP release</p>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="fresh hide-mobile">{stamp}</span>
        <button className="btn" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh
        </button>
        <select className="select hide-mobile" defaultValue="csv" onChange={(e) => onExport(e.target.value)} aria-label="Export format">
          <option value="csv">Export CSV</option>
          <option value="excel">Export Excel</option>
          <option value="pdf">Export PDF</option>
        </select>
        <button className="btn primary hide-mobile" onClick={() => onExport('csv')}>
          <Download size={14} /> Export
        </button>
      </div>
    </header>
  );
}
