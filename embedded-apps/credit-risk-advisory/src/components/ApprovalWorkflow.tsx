'use client';

import React, { useState } from 'react';
import { submitDecision } from '../lib/sapClient';
import { formatSlaMinutes, oldestSla, slaAgingBuckets } from '../lib/sla';
import { Bars } from './charts';
import { WorkTable, formatINR } from './WorkTable';
import type { Decision, DecisionOutcome, WorklistRow } from '../types';

/**
 * Approval Workflow — maker-checker pipeline KPIs, the credit operations queue and a slide-in
 * drawer for document-level evidence and decisions.
 */
export function ApprovalWorkflow({ worklist, onChanged }: { worklist: WorklistRow[]; onChanged?: () => void }): React.ReactElement {
  const [active, setActive] = useState<WorklistRow | null>(null);
  const [decision, setDecision] = useState<Decision>('APPROVE');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DecisionOutcome | null>(null);
  const [error, setError] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<string | null>(null);
  // Executed releases this session — real, growing count of decisions actually submitted through
  // this screen, not a static placeholder. Starts at 0 (nothing has been decided yet in a fresh
  // session) rather than an unexplained fixed number.
  const [executed, setExecuted] = useState<DecisionOutcome[]>([]);

  const slaBreaches = worklist.filter((w) => w.sla.toLowerCase().includes('breach')).length;
  const highRisk = worklist.filter((w) => w.risk === 'High' || w.risk === 'Critical').length;
  const oldest = oldestSla(worklist);
  const agingBuckets = slaAgingBuckets(worklist);
  const retryCount = executed.filter((r) => /retry/i.test(r.status) || /retry/i.test(r.execution)).length;

  function closeDrawer() {
    setActive(null);
    setResult(null);
    setError('');
    setEvidenceFile(null);
  }

  async function submit() {
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      const outcome = await submitDecision(active.customerId, decision, reason.trim(), active.amount);
      setResult(outcome);
      setExecuted((prev) => [...prev, outcome]);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi accent-blue">
          <div className="label">Pending Approval</div>
          <div className="value">{worklist.length}</div>
          <div className="sub">{formatINR(worklist.reduce((a, w) => a + w.amount, 0))}</div>
        </div>
        <div className="kpi accent-red">
          <div className="label">SLA Breaches</div>
          <div className="value">{slaBreaches}</div>
          <div className="sub">{oldest ? `Oldest: ${formatSlaMinutes(oldest.minutes)}${oldest.minutes >= 0 ? ' to breach' : ''}` : 'No documents queued'}</div>
        </div>
        <div className="kpi accent-amber">
          <div className="label">High / Critical</div>
          <div className="value">{highRisk}</div>
          <div className="sub">Required authority routing</div>
        </div>
        <div className="kpi accent-green">
          <div className="label">Executed This Session</div>
          <div className="value">{executed.length}</div>
          <div className="sub">{executed.length === 0 ? 'No decisions submitted yet' : `Reconciled: ${executed.length - retryCount} | Retry: ${retryCount}`}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>SLA Aging</h3>
          <span className="card-sub">Where every queued document stands against its decision SLA</span>
        </div>
        <Bars items={agingBuckets} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Approval Pipeline</h3>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="step">
            <b>1. Risk Analyst</b>
            <p>Maker review and evidence</p>
            <small>{worklist.length} pending</small>
          </div>
          <div className="arrow">→</div>
          <div className="step" style={{ background: '#fff6e7', borderColor: '#f3d9a4' }}>
            <b>2. Commercial Head</b>
            <p>Authority and exceptions</p>
            <small>{highRisk} pending</small>
          </div>
          <div className="arrow">→</div>
          <div className="step" style={{ background: '#f5edff', borderColor: '#e0d4f7' }}>
            <b>3. CFO / Delegate</b>
            <p>High value / critical risk</p>
            <small>{highRisk} pending</small>
          </div>
          <div className="arrow">→</div>
          <div className="step" style={{ background: '#e7f7ef', borderColor: '#bfe6cf' }}>
            <b>4. SAP Execution</b>
            <p>Revalidate, release, reconcile</p>
            <small>1 retry</small>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>Unified Credit Operations Queue</h3>
          <span className="card-sub">Select a row to open document-level evidence and recommendation</span>
        </div>
        <WorkTable rows={worklist} onRowClick={setActive} />
      </div>

      <div className={`overlay${active ? ' open' : ''}`} onClick={closeDrawer} />
      <aside className={`drawer${active ? ' open' : ''}`}>
        {active && (
          <>
            <div className="drawer-head">
              <div>
                <b>
                  {active.stage} {active.document}
                </b>
                <div className="sub">
                  {active.customerId} · {formatINR(active.amount)} · {active.sla}
                </div>
              </div>
              <button className="close" onClick={closeDrawer}>
                ×
              </button>
            </div>
            <div className="drawer-body">
              {result ? (
                <div className="success-box" style={{ marginTop: 10 }}>
                  <h3 style={{ margin: '0 0 8px', color: '#0c704b' }}>✓ {result.status}</h3>
                  <p>{result.execution}</p>
                  <div className="panel-row">
                    <span>Correlation ID</span>
                    <b>{result.correlationId}</b>
                  </div>
                  <div className="panel-row">
                    <span>Record</span>
                    <b>{result.recordId}</b>
                  </div>
                  <button className="btn dark" onClick={closeDrawer}>
                    Back to queue
                  </button>
                </div>
              ) : (
                <>
                  <div className="recommend">
                    <small>AI RECOMMENDATION</small>
                    <h2>{active.recommendation}</h2>
                    <p>
                      Risk: <b>{active.risk}</b> | Priority: <b>{active.priority}</b> | Amount: <b>{formatINR(active.amount)}</b>
                    </p>
                  </div>
                  <h3 style={{ marginTop: 14 }}>Proposed Conditions</h3>
                  <ul>
                    <li>On-demand SAP exposure refresh before approval</li>
                    <li>No self-approval</li>
                    <li>Mandatory override reason and attachment</li>
                    <li>Idempotency key generated at execution</li>
                  </ul>
                  <div className="field">
                    <span>Supporting evidence (optional)</span>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,image/*" className="input" onChange={(e) => setEvidenceFile(e.target.files?.[0]?.name ?? null)} />
                    {evidenceFile && <small style={{ color: '#64748b' }}>Attached: {evidenceFile} (kept with this decision record locally — this prototype has no document store on the SAP side yet)</small>}
                  </div>
                  <div className="field">
                    <span>Decision</span>
                    <select className="select" value={decision} onChange={(e) => setDecision(e.target.value as Decision)}>
                      <option value="APPROVE">Approve (full release)</option>
                      <option value="CONDITIONAL_RELEASE">Conditional Release</option>
                      <option value="REJECT">Reject</option>
                      <option value="REWORK">Request Rework</option>
                    </select>
                  </div>
                  <div className="field">
                    <span>Reason (min 10 characters)</span>
                    <textarea
                      className="textarea"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Financials reviewed and within credit policy limits."
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </div>
                  {error && <div className="error">{error}</div>}
                  <button className="btn primary" style={{ width: '100%' }} disabled={busy || reason.trim().length < 10} onClick={submit}>
                    {busy ? 'Submitting…' : 'Submit decision & release'}
                  </button>
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 10 }}>
                    Submitting records a decision with an idempotency key. SAP revalidation runs before any real release.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
