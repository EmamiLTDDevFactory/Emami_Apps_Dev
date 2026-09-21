'use client';

import { useEffect, useState } from 'react';
import type { CaseRecord, CaseStatus } from '../types';
import { fetchCases, updateCase } from '../lib/sapClient';
import { Head, Kpi, Kpis } from './Shared';

const STATUS_OPTIONS: CaseStatus[] = ['OPEN', 'IN_REVIEW', 'PENDING_APPROVAL', 'CLOSED'];

export function CaseList({ toast }: { toast: (m: string) => void }) {
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, CaseStatus>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchCases(status || undefined)
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

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
        <Kpi label="Open Critical" value="5" sub="2 SLA breaches" tone="red" />
        <Kpi label="Awaiting Evidence" value="12" sub="Average age 1.8 days" tone="amber" />
        <Kpi label="Closed This Period" value="38" sub="27 valid business reasons" tone="green" />
        <Kpi label="Audit Finding Conversion" value="8.3%" sub="Down 2.1 pp" tone="cyan" />
      </Kpis>
      <div className="card" style={{ marginTop: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Case Queue</h3>
          <div className="rowactions">
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
                {items.map((c) => {
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
                {items.length === 0 && (
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
