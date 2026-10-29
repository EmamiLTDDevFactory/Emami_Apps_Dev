import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import { apiActivityLog, apiMasterData, getCurrentUserEmail } from '../shared/api.js';
import { activeValues } from '../shared/masterData.js';
import { FIELD_LABELS } from '../shared/constants.js';
import { initialsHome } from '../shared/utils.js';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '../shared/icons.jsx';

const PAGE_SIZES = [15, 25, 50, 100];

// Sentinel field name item_history uses for a row's creation (see backend/devTracker.js's
// POST /items) — every other field name is one of FIELDS and has a FIELD_LABELS entry.
function fieldLabel(field) {
  return field === '__created__' ? 'Created' : FIELD_LABELS[field] || field;
}
function fieldTone(field) {
  return field === '__created__'
    ? { bg: 'var(--st-green-soft)', fg: 'var(--st-green)' }
    : { bg: 'var(--accent-soft)', fg: 'var(--accent)' };
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

// Same "1 … 4 5 6 … 12" page-number list as Dashboard's own table pager.
function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

export default function ChangeLog() {
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, [], [], profileName);

  const [rows, setRows] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [changedBy, setChangedBy] = useState('');
  const [fieldFilter, setFieldFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    if (!email) {
      window.location.href = '/';
      return;
    }
  }, [email]);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    Promise.all([apiActivityLog(email), apiMasterData(email)])
      .then(([logRows, mdRows]) => {
        if (cancelled) return;
        setRows(logRows || []);
        setMasterData(mdRows || []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [email]);

  const changedByOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.changedByUsername).filter(Boolean))).sort(),
    [rows]
  );
  const fieldOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.field))).sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b))),
    [rows]
  );
  const areaOptions = useMemo(() => activeValues(masterData, 'area'), [masterData]);
  const statusOptions = useMemo(() => activeValues(masterData, 'status'), [masterData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (changedBy && r.changedByUsername !== changedBy) return false;
      if (fieldFilter && r.field !== fieldFilter) return false;
      if (areaFilter && r.area !== areaFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (dateStart && r.changedAt.slice(0, 10) < dateStart) return false;
      if (dateEnd && r.changedAt.slice(0, 10) > dateEnd) return false;
      if (q) {
        const haystack = `${r.devList} ${r.oldValue || ''} ${r.newValue || ''} ${r.changedByUsername || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, changedBy, fieldFilter, areaFilter, statusFilter, dateStart, dateEnd]);

  useEffect(() => { setPage(1); }, [search, changedBy, fieldFilter, areaFilter, statusFilter, dateStart, dateEnd, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = useMemo(() => filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize), [filtered, pageSafe, pageSize]);

  function clearFilters() {
    setSearch(''); setChangedBy(''); setFieldFilter(''); setAreaFilter(''); setStatusFilter(''); setDateStart(''); setDateEnd('');
  }
  const filtersActive = !!(search || changedBy || fieldFilter || areaFilter || statusFilter || dateStart || dateEnd);

  if (!email) return null;

  return (
    <div className="app-shell">
      <Sidebar active="changeLog" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar />
      <main className="shell-main">
        <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={visibleNotifications} onMarkAllRead={markAllRead} onClear={clear} />

        <div className="page-header-row">
          <div>
            <h1 className="page-title">Change Log</h1>
            <p className="page-header-sub">Every change made to Dev Tracker items, by every user and admin.</p>
          </div>
        </div>

        <div className="cl-filters-row">
          <div className="cl-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.2" y2="16.2" /></svg>
            <input type="text" placeholder="Search by item, value, or who changed it…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={changedBy} onChange={(e) => setChangedBy(e.target.value)}>
            <option value="">All Users</option>
            {changedByOptions.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)}>
            <option value="">All Changes</option>
            {fieldOptions.map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
          </select>
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="">All Modules</option>
            {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="date-range">
            <CalendarIcon size={14} />
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} aria-label="From date" />
            <span className="date-range-arrow">&rarr;</span>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} aria-label="To date" />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters} disabled={!filtersActive}>Clear</button>
        </div>

        <div className="card">
          <div className="table-view-wrap">
            <table className="table-view">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Changed By</th>
                  <th>Item</th>
                  <th>Change</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="table-empty">Loading change log…</td></tr>
                )}
                {!loading && pageRows.map((r) => {
                  const tone = fieldTone(r.field);
                  return (
                    <tr key={r.id}>
                      <td className="mono cl-time">
                        <div>{fmtDateTime(r.changedAt)}</div>
                      </td>
                      <td>
                        <div className="cl-who">
                          <div className="avatar mono" style={{ width: 22, height: 22, fontSize: 9 }}>{initialsHome(r.changedByUsername)}</div>
                          <span>{r.changedByUsername || 'Someone'}</span>
                        </div>
                      </td>
                      <td className="cl-item">{r.devList}</td>
                      <td>
                        <span className="cl-field-pill" style={{ background: tone.bg, color: tone.fg }}>{fieldLabel(r.field)}</span>
                      </td>
                      <td className="cl-change">
                        {r.field === '__created__' ? (
                          <span className="cl-change-new">{r.newValue || '—'}</span>
                        ) : (
                          <>
                            <span className="cl-change-old">{r.oldValue || '—'}</span>
                            <span className="cl-change-arrow">&rarr;</span>
                            <span className="cl-change-new">{r.newValue || '—'}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && !pageRows.length && (
                  <tr><td colSpan={5} className="table-empty">No changes match the current filters.</td></tr>
                )}
              </tbody>
            </table>
            {filtered.length > 0 && (
              <div className="table-pagination">
                <span className="table-pagination-summary">
                  Showing {(pageSafe - 1) * pageSize + 1} - {Math.min(pageSafe * pageSize, filtered.length)} of {filtered.length} changes
                </span>
                <div className="pager-controls">
                  <button type="button" disabled={pageSafe === 1} onClick={() => setPage(pageSafe - 1)}><ChevronLeftIcon size={14} /></button>
                  {pageList(pageSafe, totalPages).map((p, i) => p === '…' ? (
                    <span key={`e${i}`} className="pager-ellipsis">…</span>
                  ) : (
                    <button type="button" key={p} className={p === pageSafe ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>
                  ))}
                  <button type="button" disabled={pageSafe === totalPages} onClick={() => setPage(pageSafe + 1)}><ChevronRightIcon size={14} /></button>
                </div>
                <div className="page-size">
                  Show
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  per page
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
