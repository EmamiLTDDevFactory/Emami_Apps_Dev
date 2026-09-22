'use client';

import type { WorklistRow } from '../types';

function riskBadge(risk: string): JSX.Element {
  const cls = risk.toLowerCase() === 'low' ? 'low' : risk.toLowerCase() === 'medium' ? 'medium' : risk.toLowerCase() === 'high' ? 'high' : 'critical';
  return <span className={`badge ${cls}`}>{risk}</span>;
}

export function formatINR(v: number): string {
  return `₹${v.toLocaleString('en-IN')}`;
}

/** Bordered, wrapped table with badge pills — reference prototype style. */
export function WorkTable({ rows, onRowClick }: { rows: WorklistRow[]; onRowClick?: (row: WorklistRow) => void }): JSX.Element {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Stage</th>
            <th>Document</th>
            <th>Customer</th>
            <th>Sales area</th>
            <th>Amount</th>
            <th>Risk</th>
            <th>Recommendation</th>
            <th>SLA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.document} className={onRowClick ? 'clickable' : ''} onClick={() => onRowClick?.(x)}>
              <td>{x.priority}</td>
              <td>{x.stage}</td>
              <td>{x.document}</td>
              <td>{x.customerId}</td>
              <td>
                {x.org}/{x.channel}
              </td>
              <td>{formatINR(x.amount)}</td>
              <td>{riskBadge(x.risk)}</td>
              <td>{x.recommendation}</td>
              <td>{x.sla}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
