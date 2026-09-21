'use client';

import { Menu } from 'lucide-react';
import type { WorklistEntry } from '../types';
import { doExport } from '../lib/exportCsv';

export function TopBar({ freshMinutes, hasError, items, toast, onMenu, isWideScreen, exportType, setExportType, onRefresh }: {
  freshMinutes: number | null;
  hasError: boolean;
  items: WorklistEntry[];
  toast: (m: string) => void;
  onMenu: () => void;
  isWideScreen: boolean;
  exportType: string;
  setExportType: (v: string) => void;
  onRefresh: () => void;
}) {
  return (
    <header className="top">
      <div className="topbar-left">
        {!isWideScreen && (
          <button className="btn mobile" onClick={onMenu} aria-label="Open navigation">
            ☰
          </button>
        )}
        <div className="title">
          <h1>Journal Entry &amp; GL Anomaly Agent</h1>
          <p>SAP ECC 6.0 EHP8 on HANA · FI/CO/MM/SD/AA integration · Continuous controls monitoring</p>
        </div>
      </div>
      <div className="actions">
        {!hasError && freshMinutes !== null && <span className="fresh">Data {freshMinutes} min old</span>}
        <button className="btn" onClick={onRefresh}>↻ Refresh</button>
        <select className="sel" value={exportType} onChange={(e) => setExportType(e.target.value)}>
          <option>CSV</option>
          <option>Excel</option>
          <option>PDF</option>
        </select>
        <button className="btn primary" onClick={() => doExport(exportType, items, toast)}>Export</button>
      </div>
    </header>
  );
}
