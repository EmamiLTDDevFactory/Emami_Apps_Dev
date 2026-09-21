'use client';

import { Radar } from 'lucide-react';
import type { Risk } from '../types';

const severityClass: Record<Risk['severity'], string> = {
  Critical: 'critical',
  High: 'high',
  Medium: 'medium',
  Low: 'low',
};

export default function RiskPanel({ risks }: { risks: Risk[] }) {
  return (
    <section className="card" id="risk">
      <div className="card-head">
        <h2>
          <Radar size={18} /> Risk Dashboard
        </h2>
        <span className="chip">{risks.filter((r) => r.severity === 'Critical' || r.severity === 'High').length} open high-severity risks</span>
      </div>
      <div className="risk-grid">
        {risks.map((r) => (
          <article key={r.riskId} className="risk">
            <header>
              <h3>{r.category}</h3>
              <span className={`pill ${severityClass[r.severity]}`}>{r.severity}</span>
            </header>
            <p className="risk-alert">{r.alert}</p>
            <div className="score">
              <div className="score-bar">
                <div className={`score-fill ${severityClass[r.severity]}`} style={{ width: `${r.score}%` }} />
              </div>
              <span>Score {r.score}</span>
            </div>
            <p className="mitigation">
              <strong>Mitigation:</strong> {r.mitigation}
            </p>
            <footer>
              <span>Owner: {r.owner}</span>
              <span>Due: {r.due}</span>
              <span className={`status ${r.status.replace(' ', '-').toLowerCase()}`}>{r.status}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
