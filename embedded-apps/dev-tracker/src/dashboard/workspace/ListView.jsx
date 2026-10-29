import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Avatar, PriorityIcon, StatusPicker, EpicLozenge, TypeAndKey } from './ui.jsx';
import { FIELDS, FIELD_LABELS, PRIORITY_RANK } from '../../shared/constants.js';
import { issueKey, points, fmtPoints, dueDate, typeOf, statusCategory, splitPeople } from '../../shared/pm.js';
import { fmtDate, isOverdue, relativeTime, daysBetween, todayStr } from '../../shared/utils.js';
import { CaretUpDownIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from '../../shared/icons.jsx';

const PAGE_SIZES = [25, 50, 100];
const COLUMNS = [
  { key: 'key', label: 'Key', sort: (a, b) => (a.issueNo ?? 0) - (b.issueNo ?? 0) },
  { key: 'summary', label: 'Summary', sort: (a, b) => (a.devList || '').localeCompare(b.devList || '') },
  { key: 'status', label: 'Status', sort: (a, b) => ['todo', 'inprogress', 'done'].indexOf(statusCategory(a.status)) - ['todo', 'inprogress', 'done'].indexOf(statusCategory(b.status)) || (a.status || '').localeCompare(b.status || '') },
  { key: 'assignee', label: 'Task Assigned to', sort: (a, b) => (a.developer || '~').localeCompare(b.developer || '~') },
  { key: 'priority', label: 'Priority', sort: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) },
  { key: 'epic', label: 'Epic', pm: true },
  { key: 'sprint', label: 'Sprint', pm: true },
  { key: 'points', label: 'Points', pm: true, sort: (a, b) => points(a) - points(b) },
  { key: 'module', label: 'Module', sort: (a, b) => (a.area || '').localeCompare(b.area || '') },
  { key: 'due', label: 'Due', sort: (a, b) => (dueDate(a) || '9999').localeCompare(dueDate(b) || '9999') },
  { key: 'updated', label: 'Updated', sort: (a, b) => new Date(a.updatedAt || a.createdAt || 0) - new Date(b.updatedAt || b.createdAt || 0) },
];

// Jira's issue navigator: every matching issue as a sortable table, with the advanced SAP
// filters that don't fit the quick-filter bar, and Excel export of exactly what's on screen.
export default function ListView({ ws, items, filters, setFilters, onOpen, onError }) {
  const { options, statusOrder, byId, sprints, updateItem, pmReady } = ws;
  const [sort, setSort] = useState({ key: 'updated', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const cols = COLUMNS.filter((c) => !c.pm || pmReady);
  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col?.sort) return items;
    const arr = [...items].sort(col.sort);
    return sort.dir === 'desc' ? arr.reverse() : arr;
  }, [items, sort]);
  useEffect(() => { setPage(1); }, [items.length, pageSize, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(page, totalPages);
  const rows = sorted.slice((p - 1) * pageSize, p * pageSize);
  const sprintName = (id) => sprints.find((s) => String(s.id) === String(id))?.name || '';

  function exportRows() {
    const extra = pmReady ? ['Key', 'Issue Type', 'Epic', 'Sprint', 'Story Points', 'Labels', 'Reporter', 'Description'] : [];
    const header = [...extra, ...FIELDS.map((f) => FIELD_LABELS[f] || f)];
    const body = sorted.map((it) => [
      ...(pmReady ? [issueKey(it), typeOf(it), it.epicId ? byId.get(String(it.epicId))?.devList || '' : '', sprintName(it.sprintId), it.storyPoints ?? '', it.labels || '', it.reporter || '', it.description || ''] : []),
      ...FIELDS.map((f) => (it[f] == null ? '' : it[f])),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
    sheet['!cols'] = header.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Issues');
    XLSX.writeFile(wb, `dev-tracker-issues-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const sel = (key, label, opts) => (
    <label className="pm-field pm-field-compact"><span>{label}</span>
      <select value={filters[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">Any</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <div className="pm-list">
      <div className="pm-view-bar">
        <div className="pm-view-bar-left">
          <button type="button" className={`pm-filter-btn${showAdvanced ? ' is-on' : ''}`} onClick={() => setShowAdvanced((s) => !s)}>Advanced filters</button>
          <label className="pm-check-label"><input type="checkbox" checked={filters.overdueOnly} onChange={(e) => set({ overdueOnly: e.target.checked })} /> Overdue only</label>
          <span className="pm-muted">{sorted.length} issue{sorted.length === 1 ? '' : 's'}</span>
        </div>
        <div className="pm-view-bar-right">
          <button type="button" className="pm-btn pm-btn-subtle" onClick={exportRows}><DownloadIcon size={14} /> Export Excel</button>
        </div>
      </div>

      {showAdvanced && (
        <div className="pm-advanced">
          {sel('status', 'Status', statusOrder)}
          {sel('priority', 'Priority', options.priority || [])}
          {sel('impact', 'Business impact', options.impact || [])}
          {sel('complexity', 'Complexity', options.complexity || [])}
          {sel('devFactory', 'Dev Factory', options.devFactory || [])}
          {sel('reasonCategory', 'Delay reason', options.reasonCategory || [])}
          <label className="pm-field pm-field-compact"><span>Lifecycle</span>
            <select value={filters.lifecycle} onChange={(e) => set({ lifecycle: e.target.value })}>
              <option value="">Any</option><option value="active">Active</option><option value="completed">Completed</option>
            </select>
          </label>
          <label className="pm-field pm-field-compact"><span>Due from</span><input type="date" value={filters.dateStart} onChange={(e) => set({ dateStart: e.target.value })} /></label>
          <label className="pm-field pm-field-compact"><span>Due to</span><input type="date" value={filters.dateEnd} onChange={(e) => set({ dateEnd: e.target.value })} /></label>
        </div>
      )}

      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.sort ? 'is-sortable' : ''} onClick={() => c.sort && setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.label}{c.sort && <CaretUpDownIcon size={10} className={sort.key === c.key ? 'is-sorted' : ''} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const due = dueDate(it);
              const overdue = isOverdue(it);
              const epic = it.epicId ? byId.get(String(it.epicId)) : null;
              return (
                <tr key={it.id} onClick={() => onOpen(it)}>
                  {cols.map((c) => {
                    switch (c.key) {
                      case 'key': return <td key={c.key} className="pm-td-type"><TypeAndKey item={it} onOpen={onOpen} /></td>;
                      case 'summary': return <td key={c.key} className="pm-td-summary">{it.devList}</td>;
                      case 'status': return <td key={c.key} onClick={(e) => e.stopPropagation()}><StatusPicker status={it.status} statuses={statusOrder} size="sm" onChange={(s) => updateItem(it.id, { status: s }).catch((e) => onError(e.message))} /></td>;
                      case 'assignee': return <td key={c.key}><span className="pm-person-cell"><Avatar name={splitPeople(it.developer)[0]} size={22} /> {it.developer || <span className="pm-muted">Unassigned</span>}</span></td>;
                      case 'priority': return <td key={c.key}><PriorityIcon priority={it.priority} showLabel /></td>;
                      case 'epic': return <td key={c.key}>{epic ? <EpicLozenge epic={epic} /> : ''}</td>;
                      case 'sprint': return <td key={c.key} className="pm-td-muted">{sprintName(it.sprintId)}</td>;
                      case 'points': return <td key={c.key} className="pm-td-num">{points(it) ? fmtPoints(points(it)) : ''}</td>;
                      case 'module': return <td key={c.key}>{it.area || ''}</td>;
                      case 'due': return (
                        <td key={c.key} className={`pm-td-date${overdue ? ' is-overdue' : ''}`} title={due && !overdue ? `${daysBetween(todayStr(), due)} days left` : undefined}>
                          {due ? fmtDate(due) : ''}
                        </td>
                      );
                      case 'updated': return <td key={c.key} className="pm-td-muted">{relativeTime(it.updatedAt || it.createdAt)}</td>;
                      default: return <td key={c.key} />;
                    }
                  })}
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={cols.length} className="pm-empty">No issues match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="pm-pager">
          <span className="pm-muted">{(p - 1) * pageSize + 1}–{Math.min(p * pageSize, sorted.length)} of {sorted.length}</span>
          <div className="pm-pager-btns">
            <button type="button" className="pm-icon-btn" disabled={p === 1} onClick={() => setPage(p - 1)} aria-label="Previous page"><ChevronLeftIcon size={14} /></button>
            <span>Page {p} of {totalPages}</span>
            <button type="button" className="pm-icon-btn" disabled={p === totalPages} onClick={() => setPage(p + 1)} aria-label="Next page"><ChevronRightIcon size={14} /></button>
          </div>
          <label className="pm-inline-label">Per page
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n}>{n}</option>)}</select>
          </label>
        </div>
      )}
    </div>
  );
}
