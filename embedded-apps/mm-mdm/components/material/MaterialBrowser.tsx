'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { PostedMaterial, listPosted } from '@/lib/mmApi';
import { useValueHelp } from '@/lib/mmValueHelp';
import { ErrorState, LoadingState, StatCards } from '../ui';
import { IconBox, IconEdit, IconFilter, IconLayers, IconPlus, IconTag, IconX } from '../icons';

const TOP = 50;

/** Posted materials, read from SAP (GET /posted). Change (MX) and extension (ME) start here. */
export default function MaterialBrowser() {
  const types = useValueHelp('MTART');
  const [text, setText] = useState('');
  const [type, setType] = useState('');
  const [applied, setApplied] = useState({ text: '', type: '' });
  const [local, setLocal] = useState('');
  const [rows, setRows] = useState<PostedMaterial[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState('loading');
    listPosted({ text: applied.text, materialType: applied.type, top: TOP })
      .then((r) => { setRows(r); setError(''); setState('ready'); })
      .catch((e: Error) => { setError(e.message); setState('error'); });
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const s = local.trim().toLowerCase();
    return rows.filter((m) => !s || m.matnr.toLowerCase().includes(s) || m.description.toLowerCase().includes(s) || m.materialGroup.toLowerCase().includes(s));
  }, [rows, local]);
  const busyCount = rows.filter((m) => m.busy).length;
  const groups = new Set(rows.map((m) => m.materialGroup)).size;
  const filtered = !!(applied.text || applied.type || local);

  function search(e: FormEvent) {
    e.preventDefault();
    setApplied({ text: text.trim(), type });
  }

  return (
    <>
      <StatCards
        items={[
          { label: state === 'ready' ? `Materials listed (max ${TOP})` : 'Materials listed', value: rows.length, icon: <IconBox />, tone: 'blue' },
          { label: 'Material groups', value: groups, icon: <IconTag />, tone: 'amber' },
          { label: 'With an open request', value: busyCount, icon: <IconLayers />, tone: 'violet' },
        ]}
      />

      <section className="card card-flush">
        <form className="search-head" onSubmit={search} role="search">
          <input className="search-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Material description as in SAP (exact match)" aria-label="Description" maxLength={40} />
          <div className="search-selects">
            <span className="filter-icon" aria-hidden><IconFilter size={15} /></span>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Material type">
              <option value="">All material types</option>
              {types.options.map((t) => <option key={t.value} value={t.value}>{t.value}{t.label ? ` – ${t.label}` : ''}</option>)}
            </select>
            <button type="submit" className="btn btn-primary btn-sm">Search SAP</button>
            {filtered && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setText(''); setType(''); setLocal(''); setApplied({ text: '', type: '' }); }}><IconX size={14} /> Clear</button>}
          </div>
        </form>
        <div className="list-meta">
          <input className="search-input search-input-sm" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Filter the list below by number, description or group" aria-label="Filter list" />
          <Link href="/master/material/new" className="btn btn-primary btn-sm"><IconPlus size={14} /> New material request</Link>
        </div>

        {state === 'loading' && <LoadingState />}
        {state === 'error' && <ErrorState message={error} onRetry={load} />}
        {state === 'ready' && shown.length === 0 && (
          <div className="empty">
            <span className="empty-icon" aria-hidden><IconBox size={22} /></span>
            <p>No posted materials match these filters.</p>
          </div>
        )}
        {state === 'ready' && shown.length > 0 && (
          <div className="table-wrap">
            <table className="table req-table">
              <thead>
                <tr><th>Material</th><th>Type</th><th>Group</th><th>Unit</th><th>Open request</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.matnr}>
                    <td>
                      <div className="req-cell">
                        <span className="req-cell-icon mat-icon" aria-hidden><IconBox size={16} /></span>
                        <span className="req-cell-text">
                          <strong>{m.description}</strong>
                          <span className="matno muted">{m.matnr}</span>
                        </span>
                      </div>
                    </td>
                    <td><span className="pill">{m.materialType}</span></td>
                    <td>{m.materialGroup || <span className="muted">—</span>}</td>
                    <td>{m.unit}</td>
                    <td>{m.busy ? <span className="pill pill-warn">Change or extension open</span> : <span className="muted">—</span>}</td>
                    <td>
                      <div className="row-actions">
                        {m.busy ? (
                          <>
                            <button className="btn btn-sm" disabled title="A change or extension request is already open for this material"><IconEdit size={14} /> Change</button>
                            <button className="btn btn-sm" disabled title="A change or extension request is already open for this material"><IconLayers size={14} /> Extend</button>
                          </>
                        ) : (
                          <>
                            <Link className="btn btn-sm" href={`/master/material/change?matnr=${encodeURIComponent(m.matnr)}`}><IconEdit size={14} /> Change</Link>
                            <Link className="btn btn-sm" href={`/master/material/extend?matnr=${encodeURIComponent(m.matnr)}`}><IconLayers size={14} /> Extend</Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tab-note muted"><IconLayers size={13} /> Change (MX) and extension (ME) run through the same SAP approval workflow as creation.</p>
      </section>
    </>
  );
}
