'use client';

import { Table } from 'lucide-react';
import type { CashFlowLine } from '../types';

export default function CashLineTable({ lines }: { lines: CashFlowLine[] }) {
  return (
    <section className="card" id="lines">
      <div className="card-head">
        <h2>
          <Table size={18} /> Cash Flow Line Items
        </h2>
        <span className="chip">Top {lines.length} by due date · server-side paging</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Due</th>
              <th>Type</th>
              <th>Partner</th>
              <th>Company</th>
              <th>Level</th>
              <th>Probability</th>
              <th className="num">Amount (₹ Cr)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.dueDate}</td>
                <td>
                  <span className={`chip ${l.amount >= 0 ? 'in' : 'out'}`}>{l.type}</span>
                </td>
                <td>{l.partner}</td>
                <td className="mono">{l.companyCode}</td>
                <td>{l.planningLevel}</td>
                <td>
                  <div className="prob">
                    <div className="prob-bar">
                      <div className="prob-fill" style={{ width: `${l.probability}%` }} />
                    </div>
                    <span>{l.probability}%</span>
                  </div>
                </td>
                <td className={`num mono ${l.amount >= 0 ? 'pos' : 'neg'}`}>
                  {l.amount >= 0 ? '+' : ''}
                  {l.amount.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
