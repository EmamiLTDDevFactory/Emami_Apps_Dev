'use client';

import React, { useState } from 'react';
import { fetchCustomerDetail } from '../lib/sapClient';
import type { Customer, CustomerDetail } from '../types';

interface Props {
  customers: Customer[];
}

/**
 * Customer 360 — master picker, exposure waterfall and the deterministic-risk advisory with
 * explainable drivers (reference prototype layout). The source project ran its advisory through
 * a LangGraph node server-side; here it's src/lib/risk.ts's deterministicRisk/advise, called from
 * within fetchCustomerDetail (see sapClient.ts) so this component doesn't need to know whether
 * the score came from SAP's own RiskAdvisory function import or the local fallback.
 */
export function Customer360({ customers }: Props): React.ReactElement {
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    if (!id) return;
    setBusy(true);
    try {
      setSelected(await fetchCustomerDetail(id));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  const c = selected;

  return (
    <>
      <div className="card">
        <div className="filterbar" style={{ boxShadow: 'none', margin: 0, border: 0, padding: 0 }}>
          <label>
            Select customer
            <select className="select" value={c?.customer.id ?? customers[0]?.id ?? ''} onChange={(e) => void load(e.target.value)}>
              {customers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id} - {x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="spacer" />
          <button className="btn" disabled={busy} onClick={() => c && void load(c.customer.id)}>
            ↻ On-demand refresh
          </button>
        </div>
      </div>

      {c && (
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>{c.customer.name}</h3>
                <div className="card-sub">
                  {c.customer.org}/{c.customer.channel} · CCA {c.customer.cca} · {c.customer.depot}
                </div>
              </div>
              <span className={`badge ${bandCls(c.advisory.result.band)}`}>
                {c.advisory.result.band} · {c.advisory.result.score}/100
              </span>
            </div>
            <div className="panel-row">
              <span>Credit limit</span>
              <b>{fmt(c.customer.limit)}</b>
            </div>
            <div className="panel-row">
              <span>Outstanding</span>
              <b>{fmt(c.customer.outstanding)}</b>
            </div>
            <div className="panel-row">
              <span>Overdue</span>
              <b>{fmt(c.customer.overdue)}</b>
            </div>
            <div className="panel-row">
              <span>Average delay</span>
              <b>{c.customer.avgDelay} days</b>
            </div>
            <div className="panel-row">
              <span>On-time payment</span>
              <b>{c.customer.onTime}%</b>
            </div>
            <h3 style={{ marginTop: 14 }}>Exposure Composition</h3>
            <div className="waterfall">
              {(
                [
                  ['Outstanding', c.customer.outstanding, '#1769e0'],
                  ['Open Order', c.customer.openOrder, '#00a3c7'],
                  ['Delivery', c.customer.openDelivery, '#6d4fc2'],
                  ['PGI', c.customer.pgi, '#d97706'],
                  ['Billing', c.customer.billing, '#c9362b'],
                ] as const
              ).map(([label, val, color]) => (
                <div key={label} className="wf">
                  <i style={{ height: `${Math.max(8, (val / c.customer.limit) * 130)}px`, background: color, width: 48 }}></i>
                  <small>
                    {label}
                    <br />
                    {fmtShort(val)}
                  </small>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="recommend">
              <small>AI ADVISORY · Confidence {(c.advisory.confidence * 100).toFixed(0)}%</small>
              <h2>{c.advisory.result.recommendation}</h2>
              <p style={{ fontSize: 12, color: '#64748b' }}>{c.advisory.explanation}</p>
              {c.advisory.result.hardStops.length > 0 && (
                <ul className="hardstops">
                  {c.advisory.result.hardStops.map((hs) => (
                    <li key={hs}>{hs}</li>
                  ))}
                </ul>
              )}
              <p>
                Suggested releasable amount: <b>{fmt(Math.max(0, c.customer.limit - (c.customer.outstanding + c.customer.openOrder)))}</b>
              </p>
            </div>
            <h3 style={{ marginTop: 14 }}>Decision drivers</h3>
            <div className="driver pos">✓ Customer tenure {c.customer.tenure} years; on-time ratio {c.customer.onTime}%</div>
            <div className="driver pos">
              ✓ Secondary-sales momentum {c.customer.secondaryTrend >= 0 ? '+' : ''}
              {c.customer.secondaryTrend}%
            </div>
            <div className="driver neg">
              ! Utilization {(c.advisory.result.utilization * 100).toFixed(1)}%; overdue {fmt(c.customer.overdue)}
            </div>
            <div className="driver neg">
              ! Average payment delay {c.customer.avgDelay} days; returns {c.customer.returns}%
            </div>
            <button className="btn primary" style={{ width: '100%', marginTop: 12 }}>
              Approve within authority
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function fmt(v: number): string {
  return `₹${v.toLocaleString('en-IN')}`;
}
function fmtShort(v: number): string {
  return v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : fmt(v);
}
function bandCls(b: string): string {
  return b.toLowerCase() === 'low' ? 'low' : b.toLowerCase() === 'medium' ? 'medium' : b.toLowerCase() === 'high' ? 'high' : 'critical';
}
