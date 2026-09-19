import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import { apiImportList, apiImportRun, apiImportDelete, apiMasterData, getCurrentUserEmail, isDevTrackerAdmin } from '../shared/api.js';
import { activeValues } from '../shared/masterData.js';
import { FIELDS, FIELD_LABELS } from '../shared/constants.js';
import { ROUTES } from '../shared/routes.js';
import {
  InfoIcon, FileExcelIcon, DownloadIcon, UploadCloudIcon, RefreshIcon,
  CheckIcon, EyeIcon, MoreIcon, TrashIcon,
} from '../shared/icons.jsx';

const DROPDOWN_CATEGORIES = ['status', 'area', 'priority', 'impact', 'complexity', 'devFactory', 'reasonCategory'];

// Builds the downloadable template: one sheet with the exact 28 columns the New Item form
// uses (so a filled row round-trips through rowsFromSheet() below with nothing lost), plus a
// second reference sheet listing each dropdown field's currently-active values — SheetJS's
// free build can't write real in-cell dropdown validation, so this is the closest equivalent
// that still requires no extra library.
function buildTemplateWorkbook(masterData) {
  const header = FIELDS.map((f) => FIELD_LABELS[f] || f);
  const sheet = XLSX.utils.aoa_to_sheet([header]);
  sheet['!cols'] = header.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'New Items');

  const refRows = [['Field', 'Allowed Values']];
  DROPDOWN_CATEGORIES.forEach((cat) => {
    refRows.push([FIELD_LABELS[cat] || cat, activeValues(masterData, cat).join(', ')]);
  });
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 24 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Dropdown Values');
  return wb;
}

function downloadTemplate(masterData) {
  XLSX.writeFile(buildTemplateWorkbook(masterData), 'DevTracker_Import_Template.xlsx');
}

// Reverse of FIELD_LABELS, so an uploaded sheet's human-readable header row ("Module",
// "Business Impact", …) maps back to the FIELDS keys the API expects.
const LABEL_TO_FIELD = Object.fromEntries(FIELDS.map((f) => [(FIELD_LABELS[f] || f).trim(), f]));

function rowsFromSheet(worksheet) {
  const raw = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return raw
    .map((r) => {
      const out = {};
      for (const [label, val] of Object.entries(r)) {
        const key = LABEL_TO_FIELD[String(label).trim()];
        if (key) out[key] = typeof val === 'string' ? val.trim() : val;
      }
      return out;
    })
    .filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

function downloadErrorReport(log) {
  const errs = log.errors || [];
  const csv = [['Row', 'Reason'], ...errs.map((e) => [e.row, e.reason])]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${log.fileName.replace(/\.[^.]+$/, '')}_errors.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportCenter() {
  const [access, setAccess] = useState('checking'); // checking | allowed
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, [], [], profileName);

  const [masterData, setMasterData] = useState([]);
  const [imports, setImports] = useState([]);
  const [loadingImports, setLoadingImports] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [rowMenuId, setRowMenuId] = useState(null);
  const [viewLog, setViewLog] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!email) {
      window.location.href = '/';
      return;
    }
    isDevTrackerAdmin(email).then((ok) => {
      if (!ok) window.location.href = ROUTES.home;
      else setAccess('allowed');
    });
  }, [email]);

  async function reloadImports() {
    setLoadingImports(true);
    try {
      const rows = await apiImportList(email);
      setImports(rows || []);
    } catch {
      setImports([]);
    } finally {
      setLoadingImports(false);
    }
  }

  useEffect(() => {
    if (access !== 'allowed') return;
    apiMasterData(email).then((rows) => setMasterData(rows || []));
    reloadImports();
  }, [access]);

  if (access !== 'allowed') {
    return <div className="empty-state">Checking access…</div>;
  }

  async function handleFile(file) {
    setUploadError(null);
    if (!file) return;
    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.xlsx') && !nameLower.endsWith('.xls')) {
      setUploadError('Only .xlsx or .xls files are supported.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is larger than the 10MB limit.');
      return;
    }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = rowsFromSheet(sheet);
      if (!rows.length) {
        setUploadError('No data rows found in that file.');
        return;
      }
      await apiImportRun(file.name, rows, email);
      await reloadImports();
      setShowAll(false);
    } catch (e) {
      setUploadError(e.message || 'Failed to import file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteLog(log) {
    setRowMenuId(null);
    if (!window.confirm(`Remove "${log.fileName}" from import history? This won't undo the import itself.`)) return;
    try {
      await apiImportDelete(log.id, email);
      reloadImports();
    } catch (e) {
      window.alert(e.message || 'Failed to delete import log');
    }
  }

  const visibleImports = showAll ? imports : imports.slice(0, 5);

  return (
    <div className="app-shell">
      <Sidebar active="importCenter" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar visual="mountain" />
      <main className="shell-main">
        <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={visibleNotifications} onMarkAllRead={markAllRead} onClear={clear} />

        <div className="page-header-row">
          <div>
            <h1 className="page-title">Import Center</h1>
            <p className="page-header-sub">Import existing assignments into Dev Tracker.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.open('https://support.microsoft.com/office/xlsx-file-format', '_blank', 'noopener')}>
            <InfoIcon size={14} /> Import Guide
          </button>
        </div>

        <div className="import-grid">
          <div className="card import-card">
            <div className="import-card-head">
              <span className="import-step-badge">1</span>
              <div>
                <div className="import-card-title">Download Excel Format</div>
                <div className="import-card-sub">Get the latest template with the same fields as the New Item form.</div>
              </div>
            </div>
            <div className="import-download-body">
              <FileExcelIcon size={64} className="import-excel-icon" />
              <ul className="import-checklist">
                <li><CheckIcon size={13} /> Contains all fields used in New Item</li>
                <li><CheckIcon size={13} /> Pre-defined dropdown values <span className="import-muted">(where applicable)</span></li>
                <li><CheckIcon size={13} /> Correct column format and validation</li>
                <li><CheckIcon size={13} /> Just fill your data and upload</li>
              </ul>
            </div>
            <button type="button" className="btn btn-primary import-download-btn" onClick={() => downloadTemplate(masterData)}>
              <DownloadIcon size={14} /> Download Excel Format
            </button>
          </div>

          <div className="card import-card">
            <div className="import-card-head">
              <span className="import-step-badge">2</span>
              <div>
                <div className="import-card-title">Upload Completed File</div>
                <div className="import-card-sub">Upload your filled Excel file to validate and import.</div>
              </div>
            </div>
            <div
              className={`import-dropzone${dragOver ? ' drag-over' : ''}${uploading ? ' uploading' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <UploadCloudIcon size={34} />
              <div className="import-dropzone-title">{uploading ? 'Importing…' : 'Drop your Excel file here'}</div>
              {!uploading && (
                <>
                  <div className="import-dropzone-or">or</div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    Choose File
                  </button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
            <div className="import-dropzone-note">Supported format: .xlsx (Max size: 10MB)</div>
            {uploadError && <div className="import-error">{uploadError}</div>}
          </div>
        </div>

        <div className="card import-history-card">
          <div className="import-history-head">
            <div>
              <div className="import-card-title">Recent Imports</div>
              <div className="import-card-sub">View the status of your recent import activities.</div>
            </div>
            <div className="import-history-actions">
              <button type="button" className="row-action" title="Refresh" onClick={reloadImports}><RefreshIcon size={14} /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll((s) => !s)} disabled={imports.length <= 5}>
                {showAll ? 'Show less' : 'View All'}
              </button>
            </div>
          </div>

          <div className="table-view-wrap">
            <table className="table-view">
              <thead>
                <tr>
                  <th>#</th>
                  <th>File Name</th>
                  <th>Uploaded By</th>
                  <th>Uploaded On</th>
                  <th>Total Rows</th>
                  <th>Successful</th>
                  <th>Failed</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingImports && (
                  <tr><td colSpan={9} className="table-empty">Loading import history…</td></tr>
                )}
                {!loadingImports && visibleImports.map((log, i) => (
                  <tr key={log.id}>
                    <td className="mono">{i + 1}</td>
                    <td>{log.fileName}</td>
                    <td>{log.uploadedByName || log.uploadedByEmail || '—'}</td>
                    <td className="mono">{fmtDateTime(log.createdAt)}</td>
                    <td className="mono">{log.totalRows}</td>
                    <td className="mono import-success-count">{log.successful}</td>
                    <td className={`mono${log.failed > 0 ? ' import-fail-count' : ''}`}>{log.failed}</td>
                    <td><span className="priority-pill import-status-pill">{log.status}</span></td>
                    <td className="table-actions">
                      <button type="button" className="row-action" title="View details" onClick={() => setViewLog(log)}><EyeIcon size={14} /></button>
                      <button type="button" className="row-action" title="Download error report" disabled={!log.failed} onClick={() => downloadErrorReport(log)}><DownloadIcon size={14} /></button>
                      <div className="row-menu-wrap" onMouseLeave={() => setRowMenuId(null)}>
                        <button type="button" className="row-action" title="More" onClick={() => setRowMenuId((cur) => (cur === log.id ? null : log.id))}><MoreIcon size={14} /></button>
                        {rowMenuId === log.id && (
                          <div className="row-menu">
                            <button onClick={() => handleDeleteLog(log)}><TrashIcon size={12} /> Delete</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loadingImports && !imports.length && (
                  <tr><td colSpan={9} className="table-empty">No imports yet — upload a spreadsheet above to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {viewLog && (
          <div className="overlay" id="import-overlay" onMouseDown={(e) => e.target.id === 'import-overlay' && setViewLog(null)}>
            <div className="panel">
              <div className="panel-head">
                <h2>{viewLog.fileName}</h2>
                <button className="panel-close" onClick={() => setViewLog(null)} aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <div className="import-detail-summary">
                <div><span>{viewLog.totalRows}</span>Total Rows</div>
                <div><span className="import-success-count">{viewLog.successful}</span>Successful</div>
                <div><span className="import-fail-count">{viewLog.failed}</span>Failed</div>
              </div>
              {viewLog.failed > 0 ? (
                <div className="import-detail-errors">
                  {(viewLog.errors || []).map((e, i) => (
                    <div className="import-detail-error-row" key={i}>
                      <span className="mono">Row {e.row}</span>
                      <span>{e.reason}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Every row imported successfully.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
