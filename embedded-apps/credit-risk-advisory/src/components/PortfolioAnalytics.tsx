'use client';

import React from 'react';
import { Bars, Donut, Heatmap } from './charts';
import { riskBand } from '../lib/risk';
import type { Customer } from '../types';

/**
 * Portfolio Analytics — concentration, risk composition, channels and the depot risk heatmap
 * (reference prototype look). Risk band per customer comes from src/lib/risk.ts's
 * deterministicRisk (same formula the source project's server-side risk.ts used), not a
 * per-customer SAP round trip — this view needs a band for every customer in the filtered set at
 * once, not just the selected one Customer360 drills into.
 */
export function PortfolioAnalytics({ customers }: { customers: Customer[] }): JSX.Element {
  const total = customers.reduce((a, c) => a + c.outstanding, 0) || 1;

  // Concentration risk — same "share of total exposure" figure Top Concentrations already shows
  // per customer, just sorted and summed for the top 3, since an unordered list doesn't actually
  // tell you how concentrated the book is at a glance.
  const shareOf = (c: Customer) => (c.outstanding + c.openOrder) / total;
  const byShareDesc = [...customers].sort((a, b) => shareOf(b) - shareOf(a));
  const top3Share = byShareDesc.slice(0, 3).reduce((a, c) => a + shareOf(c), 0) * 100;
  const concentrationTone = top3Share >= 60 ? 'red' : top3Share >= 40 ? 'amber' : 'green';

  const riskSlices = [
    { label: 'Low', value: customers.filter((c) => riskBand(c) === 'Low').reduce((a, c) => a + c.outstanding, 0), color: '#16875d' },
    { label: 'Medium', value: customers.filter((c) => riskBand(c) === 'Medium').reduce((a, c) => a + c.outstanding, 0), color: '#d97706' },
    { label: 'High', value: customers.filter((c) => riskBand(c) === 'High').reduce((a, c) => a + c.outstanding, 0), color: '#c9362b' },
    { label: 'Critical', value: customers.filter((c) => riskBand(c) === 'Critical').reduce((a, c) => a + c.outstanding, 0), color: '#5d1520' },
  ];

  const channelBars = [
    { label: '10 GT', value: customers.filter((c) => c.channel === '10').reduce((a, c) => a + c.outstanding, 0), color: '#1769e0' },
    { label: '30 MT', value: customers.filter((c) => c.channel === '30').reduce((a, c) => a + c.outstanding, 0), color: '#00a3c7' },
    { label: '35 SS', value: customers.filter((c) => c.channel === '35').reduce((a, c) => a + c.outstanding, 0), color: '#6d4fc2' },
    { label: '40 Rural', value: customers.filter((c) => c.channel === '40').reduce((a, c) => a + c.outstanding, 0), color: '#d97706' },
  ];

  const depotCells = customers.map((c) => ({
    label: c.depot,
    value: c.outstanding,
    note: `${c.id} · ${(((c.outstanding + c.openOrder) / total) * 100).toFixed(1)}%`,
  }));

  return (
    <div className="grid3">
      <div className={`kpi accent-${concentrationTone}`} style={{ gridColumn: '1 / -1' }}>
        <div className="label">Top-3 Customer Concentration</div>
        <div className="value">{top3Share.toFixed(1)}%</div>
        <div className="sub">
          Share of total outstanding + open orders held by {byShareDesc.slice(0, 3).map((c) => c.name).join(', ') || 'no customers in scope'}
        </div>
      </div>
      <div className="card">
        <h3>Risk Band Distribution</h3>
        <Donut slices={riskSlices} />
        <div className="legend" style={{ marginTop: 8 }}>
          {riskSlices.map((s) => (
            <span key={s.label}>
              <i className="dot" style={{ background: s.color }}></i>
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>Exposure by Channel</h3>
        <Bars items={channelBars} />
      </div>
      <div className="card">
        <h3>Top Concentrations</h3>
        {byShareDesc.map((c) => (
          <div key={c.id} className="panel-row" style={{ gridTemplateColumns: '140px 1fr' }}>
            <span>{c.name}</span>
            <b>{(shareOf(c) * 100).toFixed(1)}%</b>
          </div>
        ))}
      </div>
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-head">
          <h3>Depot Risk Heatmap</h3>
          <span className="card-sub">Outstanding exposure by depot</span>
        </div>
        <Heatmap cells={depotCells} />
      </div>
    </div>
  );
}
