'use client';

import { useState } from 'react';
import { EvalResult, rulesApi } from '@/lib/admin/rulesApi';
import { IconPlus, IconTrash } from '../../icons';
import { ErrorBox } from './parts';

interface Kv { id: number; field: string; value: string }
let seq = 3;

/** Try the rules: give the values of a request and see which defaults the engine would set (runtime op EvaluateRules, nothing is saved) */
export default function RuleTester({ app }: { app: string }) {
  const [kv, setKv] = useState<Kv[]>([{ id: 1, field: 'MTART', value: '' }, { id: 2, field: 'WERKS', value: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [res, setRes] = useState<{ sets: number; results: EvalResult[] } | null>(null);

  const patch = (id: number, p: Partial<Kv>) => setKv((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await rulesApi.evaluate(app, kv.filter((x) => x.field.trim()).map((x) => ({ field: x.field.trim(), value: x.value.trim() })));
      setRes({ sets: r.setsEvaluated, results: r.results });
    } catch (e) { setError(e); setRes(null); } finally { setBusy(false); }
  };

  return (
    <details className="card rl-tester">
      <summary><strong>Try the rules</strong> <span className="muted">what would a request with these values get?</span></summary>
      <p className="muted">Enter the values of a request (for example MTART = FERT, WERKS = UB01). The rules of all screens of this application are checked, nothing is saved.</p>
      <div className="rl-kv">
        {kv.map((x) => (
          <div className="rl-kvrow" key={x.id}>
            <input value={x.field} aria-label="Field name" placeholder="Field, e.g. MTART" maxLength={30} onChange={(e) => patch(x.id, { field: e.target.value.toUpperCase() })} />
            <input value={x.value} aria-label={`Value of ${x.field || 'field'}`} placeholder="Value" maxLength={40} onChange={(e) => patch(x.id, { value: e.target.value })} />
            <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" aria-label="Remove this value" onClick={() => setKv((a) => a.filter((y) => y.id !== x.id))}><IconTrash size={14} /></button>
          </div>
        ))}
      </div>
      <div className="form-actions rl-foot">
        <button type="button" className="btn btn-sm" onClick={() => setKv((a) => [...a, { id: seq++, field: '', value: '' }])}><IconPlus size={14} /> Add value</button>
        <span className="rl-spacer" />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={run}>{busy ? 'Checking…' : 'Check rules'}</button>
      </div>
      <ErrorBox error={error} />
      {res && (res.results.length === 0
        ? <div className="empty"><p>No rule sets a default for these values ({res.sets} rule sets checked).</p></div>
        : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Field</th><th>Default value</th><th>Rule set</th><th>Rule</th><th /></tr></thead>
              <tbody>
                {res.results.map((r) => (
                  <tr key={`${r.ruleSetId}-${r.field}`}>
                    <td><span className="pill">{r.field}</span></td>
                    <td>{r.value || <span className="muted">(empty)</span>}</td>
                    <td>{r.ruleSetId} · {r.ruleSetDesc}</td>
                    <td>{r.ruleId}</td>
                    <td>{r.conflict && <span className="badge badge-warn" title="Another rule set gives this field a different value">Conflict</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </details>
  );
}
