'use client';

import { useEffect, useState } from 'react';
import type { WorklistEntry } from '../types';
import { createCase } from '../lib/sapClient';

const CHECKLIST = [
  'Verify business justification and supporting document',
  'Validate preparer and approver authority',
  'Trace source process and CO assignment',
  'Assess reversal and subsequent activity',
];

interface SaveState {
  kind: 'ok' | 'error';
  text: string;
}

export function Drawer({ entry, onClose, toast }: { entry: WorklistEntry | null; onClose: () => void; toast: (m: string) => void }) {
  const [checks, setChecks] = useState<Set<string>>(new Set());
  const [disposition, setDisposition] = useState('');
  const [rationale, setRationale] = useState('');
  const [message, setMessage] = useState<SaveState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setChecks(new Set());
    setDisposition('');
    setRationale('');
    setMessage(null);
  }, [entry?.document]);

  if (!entry) return null;

  const onSave = async () => {
    if (rationale.trim().length < 10) {
      setMessage({ kind: 'error', text: 'Rationale must be at least 10 characters.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await createCase({
        document: entry.document,
        companyCode: entry.companyCode,
        fiscalYear: entry.fiscalYear ?? '2026',
        fiscalPeriod: entry.period,
        severity: entry.risk === 'Low' ? 'Medium' : entry.risk,
        rationale: rationale.trim(),
      });
      setMessage({ kind: 'ok', text: `Case ${res.id} created (${res.status}).` });
      toast('Case saved with audit trail');
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="drawer open">
      <div className="dhead">
        <div>
          <b>Journal Entry {entry.document}</b>
          <small>Company {entry.companyCode} · {entry.amount} · Risk {entry.score}</small>
        </div>
        <button className="close" onClick={onClose}>×</button>
      </div>
      <div className="dbody">
        <div className="recommend">
          <small>AI ADVISORY · HUMAN REVIEW REQUIRED</small>
          <h2>{entry.signal}</h2>
          <p>
            <span className={`badge ${entry.risk.toLowerCase()}`}>{entry.risk}</span> Composite score <b>{entry.score}/100</b>
          </p>
        </div>
        <h3>Investigation Checklist</h3>
        {CHECKLIST.map((x) => (
          <label className="check" key={x} style={{ display: 'block', margin: '7px 0' }}>
            <input
              type="checkbox"
              checked={checks.has(x)}
              onChange={() =>
                setChecks((prev) => {
                  const next = new Set(prev);
                  if (next.has(x)) next.delete(x);
                  else next.add(x);
                  return next;
                })
              }
            />{' '}
            {x}
          </label>
        ))}
        <h3>Disposition</h3>
        <select className="sel" style={{ width: '100%' }} value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="">Pending investigation</option>
          <option>Valid business reason</option>
          <option>Control deficiency</option>
          <option>Accounting error</option>
          <option>Suspected fraud: escalate</option>
        </select>
        <textarea
          className="inp"
          style={{ width: '100%', height: 75, marginTop: 9 }}
          placeholder="Mandatory reviewer rationale"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Decision'}
          </button>
          <button className="btn" onClick={() => toast('Evidence request logged for this entry')}>Request Evidence</button>
          <button className="btn" onClick={() => toast('Case escalated to controller approver')}>Escalate</button>
        </div>
        {message && <div className={message.kind === 'ok' ? 'okbox' : 'errbox'}>{message.text}</div>}
      </div>
    </aside>
  );
}
