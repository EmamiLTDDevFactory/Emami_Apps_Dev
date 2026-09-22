'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CaseRecord, CaseStatus } from '../types';
import { fetchCases, updateCase } from '../lib/sapClient';
import { Head, Kpi, Kpis } from './Shared';

const STATUS_OPTIONS: CaseStatus[] = ['OPEN', 'IN_REVIEW', 'PENDING_APPROVAL', 'CLOSED'];
const STATUS_LABELS: Record<CaseStatus, string> = {
  OPEN: 'Open',
  IN_REVIEW: 'In Review',
  PENDING_APPROVAL: 'Pending Approval',
  CLOSED: 'Closed',
};

/** Every KPI here used to be a hardcoded string ("5", "12", "38", "8.3%") that never reflected
 * `items` — recomputed for real from whatever CaseSet actually returns (mock or live), so the
 * numbers stay honest regardless of dataset size or filter. */
function computeCaseKpis(items: CaseRecord[]) {
  const now = Date.now();
  const open = items.filter((c) => c.status !== 'CLOSED');
  const closed = items.filter((c) => c.status === 'CLOSED');
  const openCritical = open.filter((c) => c.severity === 'Critical');
  const overdue = open.filter((c) => c.dueAt && new Date(c.dueAt).getTime() < now);
  const overdueCritical = openCritical.filter((c) => c.dueAt && new Date(c.dueAt).getTime() < now);
  const avgAgeDays = open.length
    ? open.reduce((sum, c) => sum + (now - new Date(c.createdAt).getTime()) / 86_400_000, 0) / open.length
    : 0;
  const closedRatio = items.length ? (closed.length / items.length) * 100 : 0;
  return {
    openCriticalCount: openCritical.length,
    overdueCriticalCount: overdueCritical.length,
    overdueCount: overdue.length,
    avgAgeDays,
    closedCount: closed.length,
    closedRatio,
  };
}

type KpiFilter = 'all' | 'openCritical' | 'overdue' | 'closed';
const KPI_FILTER_LABEL: Record<KpiFilter, string> = {
  all: 'All cases',
  openCritical: 'Open Critical',
  overdue: 'Overdue (Past Due)',
  closed: 'Closed This Period',
};

export function CaseList({ toast }: { toast: (m: string) => void }) {
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, CaseStatus>>({});
  const [saving, setSaving] = useState<string | null>(null);
  // Every Kpi tile shares the `.kpi` CSS class, which always shows a "Drill down ›" affordance and
  // pointer cursor (see globals.css) whether or not it has a click handler — these four had none,
  // so they looked clickable and did nothing. Wired to a real filter on the Case Queue below.
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');

  const load = () => {
    setLoading(true);
    fetchCases(status || undefined)
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const k = useMemo(() => computeCaseKpis(items), [items]);
  const funnel = useMemo(
    () => STATUS_OPTIONS.map((s) => [STATUS_LABELS[s], items.filter((c) => c.status === s).length] as const),
    [items]
  );

  const visibleItems = useMemo(() => {
    const now = Date.now();
    switch (kpiFilter) {
      case 'openCritical':
        return items.filter((c) => c.status !== 'CLOSED' && c.severity === 'Critical');
      case 'overdue':
        return items.filter((c) => c.status !== 'CLOSED' && c.dueAt && new Date(c.dueAt).getTime() < now);
      case 'closed':
        return items.filter((c) => c.status === 'CLOSED');
      default:
        return items;
    }
  }, [items, kpiFilter]);

  const save = async (c: CaseRecord) => {
    const nextStatus = edits[c.id];
    if (!nextStatus) return;
    setSaving(c.id);
    setBanner(null);
    try {
      await updateCase(c.id, { status: nextStatus, rowVersion: c.rowVersion });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      toast('Case updated with audit trail');
      load();
    } catch (e) {
      setBanner((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <Head
        title="Investigation & Case Management"
        sub="Maker-checker workflow, ownership, evidence requests, comments, escalation and final disposition"
      />
      <Kpis>
        <Kpi label="Open Critical" value={String(k.openCriticalCount)} sub={`${k.overdueCriticalCount} SLA breach${k.overdueCriticalCount === 1 ? '' : 'es'}`} tone="red" onClick={() => setKpiFilter('openCritical')} />
        <Kpi label="Overdue (Past Due)" value={String(k.overdueCount)} sub="Open cases beyond due date" tone="amber" onClick={() => setKpiFilter('overdue')} />
        <Kpi label="Avg Case Age" value={`${k.avgAgeDays.toFixed(1)} days`} sub="Across open cases in this scope" tone="violet" onClick={() => toast(`Average age across ${items.filter((c) => c.status !== 'CLOSED').length} open cases in this scope — not a single filterable subset.`)} />
        <Kpi label="Closed This Period" value={String(k.closedCount)} sub={`${k.closedRatio.toFixed(0)}% of queue`} tone="green" onClick={() => setKpiFilter('closed')} />
      </Kpis>
      <div className="card" style={{ marginTop: 13 }}>
        <h3 style={{ marginTop: 0 }}>Case Status Funnel</h3>
        <div className="funnel">
          {funnel.map(([label, count], i) => (
            <Fragment key={label}>
              <div className="step">{label}<b>{count}</b></div>
              {i < funnel.length - 1 && <span>›</span>}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Case Queue</h3>
          <div className="rowactions">
            {kpiFilter !== 'all' && (
              <button className="btn" onClick={() => setKpiFilter('all')}>
                × Filtered: {KPI_FILTER_LABEL[kpiFilter]}
              </button>
            )}
            <select className="sel" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="btn" onClick={load}>↻ Refresh</button>
          </div>
        </div>
        {banner && <div className="errbox">{banner}</div>}
        {loading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case</th><th>Document</th><th>CoCd</th><th>Severity</th><th>Status</th><th>Assigned</th><th>Due</th><th>Ver</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((c) => {
                  const edited = edits[c.id];
                  return (
                    <tr key={c.id}>
                      <td className="muted">{c.id.slice(0, 8)}…</td>
                      <td>{c.document}</td>
                      <td>{c.companyCode}</td>
                      <td><span className={`badge ${c.severity.toLowerCase()}`}>{c.severity}</span></td>
                      <td>
                        <select
                          className="sel"
                          value={edited ?? c.status}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [c.id]: e.target.value as CaseStatus }))}
                        >
                          {Array.from(new Set([c.status, ...STATUS_OPTIONS])).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td>{c.assignedTo ?? '—'}</td>
                      <td>{c.dueAt ? new Date(c.dueAt).toLocaleDateString() : '—'}</td>
                      <td>{c.rowVersion}</td>
                      <td>
                        {edited ? (
                          <button className="btn primary" disabled={saving === c.id} onClick={() => save(c)}>
                            {saving === c.id ? '…' : 'Save'}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted">No cases match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
