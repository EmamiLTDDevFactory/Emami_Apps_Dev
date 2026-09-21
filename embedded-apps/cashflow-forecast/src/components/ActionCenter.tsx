'use client';

import { Zap } from 'lucide-react';
import type { ActionItem } from '../types';

export default function ActionCenter({ actions, onCreate, busy }: { actions: ActionItem[]; onCreate: () => void; busy: boolean }) {
  return (
    <section className="card" id="actions">
      <div className="card-head">
        <h2>
          <Zap size={18} /> Action Center
        </h2>
        <button className="btn" onClick={onCreate} disabled={busy}>
          {busy ? 'Creating…' : 'Create mitigation action'}
        </button>
      </div>
      <p className="card-sub">Recommendations are governed work items. Nothing posts, pays or clears in SAP without workflow approval.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Action</th>
              <th>Amount</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.id}</td>
                <td>{a.title}</td>
                <td className="mono">₹{a.amount.toFixed(1)} Cr</td>
                <td>{a.owner}</td>
                <td>
                  <span className={`pill ${a.status === 'Approved' ? 'high' : 'medium'}`}>{a.status}</span>
                </td>
                <td>{a.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
