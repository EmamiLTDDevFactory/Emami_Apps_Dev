'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChangeLog, Detail, STATUS_CLS, dashChangeItems, dashChanges, dashDetail, fmtAge, fmtDur, fmtTs, levelLabel } from '@/lib/admin/dashApi';
import { ErrorState, LoadingState } from '../../ui';
import { IconCheck, IconClock, IconRefresh, IconX } from '../../icons';

const PHASE_TEXT: Record<string, string> = { done: 'done', pending: 'waiting now', rejected: 'rejected', todo: 'not reached' };
const STEP_CLS: Record<string, string> = { I: 'badge-info', C: 'badge-success', R: 'badge-error', S: 'badge-warn', F: 'badge-forward', D: 'badge-neutral' };

/** Drill-down of one T-ID: header, phase stepper, timeline of the steps with the waiting step on top of it, change log */
export default function DetailDrawer({ transId, onClose }: { transId: string; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'steps' | 'log'>('steps');
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    setState('loading');
    dashDetail(transId).then((x) => { setD(x); setState('ready'); }).catch((e: Error) => { setErr(e.message); setState('error'); });
  }, [transId]);
  useEffect(() => { load(); setTab('steps'); }, [load]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const r = d?.request;
  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer dd-drawer" role="dialog" aria-modal="true" aria-labelledby="dd-dt" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2 id="dd-dt"><span className="matno">{transId}</span> {r?.description || (r ? 'Request' : '')}</h2>
            {r && <p className="muted dd-dsub">{r.appId} · {r.appText}{r.objValue ? ` · SAP code ${r.objValue}` : ''}</p>}
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><IconX size={16} /></button>
        </div>
        <div className="drawer-body">
          {state === 'loading' && <LoadingState text="Reading the request from SAP…" />}
          {state === 'error' && <ErrorState message={err} onRetry={load} />}
          {state === 'ready' && d && r && (
            <>
              <dl className="kv">
                <div><dt>Status</dt><dd><span className={`badge ${STATUS_CLS[r.status] ?? 'badge-neutral'}`}>{r.statusText}</span></dd></div>
                <div><dt>Workflow</dt><dd>{r.wfState || 'none'}</dd></div>
                <div><dt>Initiator</dt><dd>{r.initiatorName || r.initiator}{r.initiatorName && r.initiatorName !== r.initiator && <span className="muted"> ({r.initiator})</span>}</dd></div>
                <div><dt>Created</dt><dd>{fmtTs(r.created)}</dd></div>
                <div><dt>Last action</dt><dd>{r.lastAction ? fmtTs(r.lastAction) : '—'}</dd></div>
                <div><dt>Turnaround (first to last step)</dt><dd>{r.tatSeconds > 0 ? fmtDur(r.tatSeconds) : '—'}</dd></div>
                <div><dt>Material type</dt><dd>{r.materialType || '—'}</dd></div>
                <div><dt>Plant</dt><dd>{r.plant || '—'}</dd></div>
                <div><dt>Duplicate flag</dt><dd>{r.duplicate ? 'Yes' : 'No'}</dd></div>
              </dl>

              {r.flags.length > 0 && (
                <div className="alert alert-warn" role="note">
                  <p><strong>Status and workflow do not agree.</strong> Shown for information only; this screen never changes a request.</p>
                  <ul className="dd-flaglist">{r.flags.map((f) => <li key={f}>{f.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
                </div>
              )}

              <ol className="dd-phases" aria-label="Phases">
                {d.phases.map((p) => (
                  <li key={p.type} className={`dd-phase dd-phase-${p.state}`}>
                    <span className="dd-phase-ic" aria-hidden>{p.state === 'done' ? <IconCheck size={14} /> : p.state === 'pending' ? <IconClock size={14} /> : p.state === 'rejected' ? <IconX size={14} /> : '·'}</span>
                    <span><strong>{p.type}</strong><small>{PHASE_TEXT[p.state] ?? p.state}</small></span>
                  </li>
                ))}
              </ol>

              <div className="dd-dactions">
                {r.route
                  ? <Link href={r.route} className="btn btn-primary btn-sm">Open request</Link>
                  : <span className="muted">This app opens in its own legacy screen, not in this application.</span>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={load}><IconRefresh size={14} /> Refresh</button>
              </div>

              <div className="tabs" role="tablist" aria-label="Request details">
                <button role="tab" aria-selected={tab === 'steps'} className={`tab ${tab === 'steps' ? 'active' : ''}`} onClick={() => setTab('steps')}>Steps</button>
                <button role="tab" aria-selected={tab === 'log'} className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>Change log</button>
              </div>

              {tab === 'steps' && (
                <>
                  <ol className="dd-timeline">
                    {d.steps.length === 0 && <li className="muted">No step has been logged yet.</li>}
                    {d.steps.map((s, i) => (
                      <li key={s.serial} className="dd-tl">
                        <span className="dd-tl-dot" aria-hidden />
                        <div className="dd-tl-main">
                          <div className="dd-tl-top">
                            <strong>{levelLabel(s.level)}</strong>
                            <span className="pill">{s.roleType}{s.dept ? ` · ${s.dept}` : ''}</span>
                            <span className={`badge ${STEP_CLS[s.status] ?? 'badge-neutral'}`}>{s.statusText}</span>
                          </div>
                          <div className="muted dd-tl-sub">
                            {s.userName || s.user} · {fmtTs(s.at)}{i > 0 && ` · ${s.stepSeconds > 0 ? `+${fmtDur(s.stepSeconds)} after the previous step` : 'same time as the previous step'}`}
                          </div>
                        </div>
                      </li>
                    ))}
                    {d.pending.length > 0 && (
                      <li className="dd-tl dd-tl-pending">
                        <span className="dd-tl-dot" aria-hidden />
                        <div className="dd-tl-main">
                          <div className="dd-tl-top">
                            <strong>{levelLabel(r.pendingLevel)}</strong>
                            <span className="pill pill-warn">{r.pendingType || 'Step'} · waiting now</span>
                            {r.stale && <span className="badge badge-neutral">stale</span>}
                          </div>
                          <ul className="dd-agentlist">
                            {d.pending.map((p) => (
                              <li key={`${p.wiId}-${p.agent}`}>
                                <span className="dd-chip">{p.agentName}{p.agent && p.agentName !== p.agent ? ` (${p.agent})` : ''}</span>
                                <span className="muted">{p.dept || p.task} · since {fmtTs(p.since)} · waiting {fmtAge(p.ageSeconds)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </li>
                    )}
                  </ol>
                  <p className="muted dd-note">{d.levelSource}</p>
                </>
              )}
              {tab === 'log' && <ChangeLogPanel transId={transId} />}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/** SAP change documents (CDHDR/CDPOS) of the posted object, read only */
function ChangeLogPanel({ transId }: { transId: string }) {
  const [log, setLog] = useState<ChangeLog | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [sel, setSel] = useState('');
  const [items, setItems] = useState<ChangeLog | null>(null);
  const [itemsState, setItemsState] = useState<'idle' | 'loading' | 'error'>('idle');

  const load = useCallback(() => {
    setState('loading');
    dashChanges(transId).then((x) => { setLog(x); setState('ready'); }).catch((e: Error) => { setErr(e.message); setState('error'); });
  }, [transId]);
  useEffect(() => { load(); }, [load]);

  function pick(nr: string) {
    setSel(nr); setItems(null); setItemsState('loading');
    dashChangeItems(transId, nr).then((x) => { setItems(x); setItemsState('idle'); }).catch(() => setItemsState('error'));
  }

  if (state === 'loading') return <LoadingState text="Reading change documents…" />;
  if (state === 'error') return <ErrorState message={err} onRetry={load} />;
  if (!log) return null;
  if (!log.supported || log.note) return <div className="empty"><p className="muted">{log.note || 'No change log.'}</p></div>;
  if (!log.headers.length) return <div className="empty"><p className="muted">SAP has no change document for {log.objectClass} {log.objectId.replace(/^0+/, '')}.</p></div>;
  return (
    <div className="dd-log">
      <p className="muted dd-note">{log.objectClass} {log.objectId.replace(/^0+/, '')}: {log.total} change document{log.total === 1 ? '' : 's'}{log.truncated ? ' (newest 200 shown)' : ''}. Select one to see the changed fields.</p>
      <div className="table-wrap">
        <table className="table table-click">
          <thead><tr><th>Changed</th><th>By</th><th>Transaction</th><th>Change no.</th></tr></thead>
          <tbody>
            {log.headers.map((h) => (
              <tr key={h.changeNr} className={sel === h.changeNr ? 'dd-sel' : ''} onClick={() => pick(h.changeNr)}>
                <td className="nowrap"><button type="button" className="dd-linkbtn" onClick={(e) => { e.stopPropagation(); pick(h.changeNr); }} aria-pressed={sel === h.changeNr}>{fmtTs(h.at)}</button></td>
                <td>{h.userName || h.user}</td><td>{h.tcode || '—'}</td><td className="matno">{h.changeNr.replace(/^0+/, '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {itemsState === 'loading' && <LoadingState text="Reading changed fields…" />}
      {itemsState === 'error' && <ErrorState message="The changed fields could not be read." onRetry={() => pick(sel)} />}
      {items && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Table</th><th>Field</th><th>Old</th><th>New</th><th>Type</th></tr></thead>
            <tbody>
              {items.items.map((c, i) => (
                <tr key={`${c.tabname}-${c.tabkey}-${c.fname}-${i}`}>
                  <td className="matno">{c.tabname}</td>
                  <td>{c.fieldText || c.fname}<small className="muted dd-fname"> {c.fname}</small></td>
                  <td>{c.valueOld || <span className="muted">—</span>}</td>
                  <td>{c.valueNew || <span className="muted">—</span>}</td>
                  <td>{{ I: 'Insert', U: 'Update', D: 'Delete', E: 'Delete (single)', J: 'Insert (single)' }[c.changeInd] ?? c.changeInd}</td>
                </tr>
              ))}
              {items.items.length === 0 && <tr><td colSpan={5} className="muted">No item.</td></tr>}
            </tbody>
          </table>
          {items.truncated && <p className="muted dd-note">First 500 of {items.total} items.</p>}
        </div>
      )}
    </div>
  );
}
