'use client';

import React from 'react';
import { Donut } from './charts';

/** Agent Monitoring — recommendation mix, governance signals and safety telemetry from the
 * reference prototype. */
export function AgentMonitoring(): JSX.Element {
  const outcomeSlices = [
    { label: 'Release', value: 46, color: '#16875d' },
    { label: 'Conditional', value: 28, color: '#d97706' },
    { label: 'Escalated', value: 17, color: '#c9362b' },
    { label: 'Manual', value: 9, color: '#6d4fc2' },
  ];

  const governance = [
    ['Rule drift', 'Low', 'low'],
    ['Payment behavior PSI', '0.07', ''],
    ['False-positive review', '6.2%', ''],
    ['Grounding coverage', '94.8%', 'low'],
    ['Prompt-injection blocks', '11', ''],
  ] as const;

  return (
    <>
      <div className="kpis">
        <div className="kpi accent-blue">
          <div className="label">Recommendations Issued</div>
          <div className="value">1,284</div>
          <div className="sub">Aug 2026 to date</div>
        </div>
        <div className="kpi accent-green">
          <div className="label">Auto-Release Rate</div>
          <div className="value">82%</div>
          <div className="sub">+3.1 pp vs prior period</div>
        </div>
        <div className="kpi accent-amber">
          <div className="label">Override Rate</div>
          <div className="value">8%</div>
          <div className="sub">Mandatory reasons captured</div>
        </div>
        <div className="kpi accent-purple">
          <div className="label">Low Confidence</div>
          <div className="value">6.4%</div>
          <div className="sub">Routed to manual review</div>
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Outcome & Recommendation Mix</h3>
          <Donut slices={outcomeSlices} />
          <div className="legend" style={{ marginTop: 8 }}>
            {outcomeSlices.map((s) => (
              <span key={s.label}>
                <i className="dot" style={{ background: s.color }}></i>
                {s.label} {s.value}%
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Governance Signals</h3>
          {governance.map(([label, value, cls]) => (
            <div key={label} className="health">
              <span>{label}</span>
              <b className={cls ? `badge ${cls}` : ''}>{value}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
