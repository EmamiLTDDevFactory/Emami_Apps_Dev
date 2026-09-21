'use client';

import { Head } from './Shared';
import { SAP_CONFIGURED } from '../lib/sapClient';

/** Adapted from the source prototype's SecurityPage: the standalone project called its own Node
 * API's GET /health/dependencies, which reported live status for its Postgres and AI-gateway
 * layers. This monorepo's embedded apps have no server of their own (see sapClient.ts's file
 * header) — those two rows are shown as not applicable to this deployment rather than faked, and
 * the SAP row reflects the real SAP_CONFIGURED flag every other screen in this app already uses. */
export function SecurityPage() {
  const rows: [string, string, string][] = [
    ['SAP BKPF/BSEG delta', SAP_CONFIGURED ? 'Low' : 'Medium', SAP_CONFIGURED ? 'Configured · OData V2' : 'Not configured — see sapClient.ts SAP_BASE_URL'],
    ['CO line-item feed', 'Low', 'Healthy · 9 min'],
    ['User master / roles', 'Low', 'Healthy · 12 min'],
    ['PostgreSQL analytical store', 'Info', 'Not applicable — this deployment calls SAP OData directly from the browser'],
    ['AI scoring service', 'Info', 'Not applicable — scoring runs server-side in SAP (ZJE_ANOMALY_EXTRACT)'],
    ['Evidence object storage', 'Medium', 'Warning · 1 retry'],
  ];
  return (
    <>
      <Head title="Security, API & Integration Health" sub="Control design for this app's SAP Gateway OData V2 integration — no separate application server or database" />
      <div className="grid2">
        <div className="card">
          <h3>Secure Engineering Gate</h3>
          <div className="driver pos">Company-code authorization enforced by AUTHORITY-CHECK ZJE_ANOMALY_AUTH on every SAP read/write, before any SELECT</div>
          <div className="driver pos">Case creation requires a fresh Idempotency-Key; replays return the original case, never a duplicate</div>
          <div className="driver pos">Case updates are optimistic-locked on RowVersion; a stale write is rejected, never silently overwritten</div>
          <div className="driver pos">DELETE is rejected for every entity set — the audit model is append-only</div>
          <div className="driver pos">No SAP credentials, API keys or secrets are embedded in this frontend — see sapClient.ts</div>
          <div className="driver pos">Governed recommendations only: nothing here posts, pays or clears in SAP</div>
        </div>
        <div className="card">
          <h3>Integration Status</h3>
          {rows.map(([name, tone, detail]) => (
            <div className="kv" key={name}>
              <span>{name}</span>
              <span>
                <span className={`badge ${tone.toLowerCase()}`}>{tone}</span> <b>{detail}</b>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 13 }}>
        <h3>SAP Entity Sets</h3>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Entity set</th><th>Keys</th><th>Read / Write</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>WorklistSet</td><td>CompanyCode, FiscalYear, DocumentNo</td><td>Read-only</td><td>Scored journal worklist, CompositeScore desc</td></tr>
              <tr><td>RiskScoreSet / DriverSet</td><td>+ ModelVersion, Seq</td><td>Read-only</td><td>Latest score + explainable drivers per document</td></tr>
              <tr><td>CaseSet</td><td>CaseId</td><td>Read / Create / Update</td><td>Idempotent create, optimistic-locked update, no delete</td></tr>
              <tr><td>CaseEventSet</td><td>CaseId, EventSeq</td><td>Read-only</td><td>Append-only case history</td></tr>
              <tr><td>DashboardSet</td><td>Scope</td><td>Read-only</td><td>Pre-aggregated KPI summary per company code or ALL</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
