'use client';

import React from 'react';
import { AreaChart } from './charts';

/**
 * Policy & Exceptions — prototype-style KPI cards, credit policy rules, rule evaluation
 * precedence and the exception trend chart.
 */
export function PolicyExceptions(): JSX.Element {
  const policies: Array<[string, string, string]> = [
    ['Exposure cap 115% of credit limit', 'Enforced', 'low'],
    ['Average payment delay > 45 days blocks release', 'Enforced', 'low'],
    ['Overdue > 30% of outstanding requires CFO', 'Enforced', 'medium'],
    ['Release above ₹50,00,000 needs SAP revalidation', 'Under review', 'medium'],
    ['Return rate > 8% triggers routing to manual review', 'Draft', 'high'],
  ];

  // Occurrences (last 90 days) makes the "Repeated Overrides" KPI below traceable to real
  // accounts instead of being an unexplained total — sorted so the most recurrent exception
  // surfaces first, since that's the one most likely to need a policy fix rather than another
  // one-off override.
  type ExceptionRow = [string, string, string, string, string, number];
  const exceptions: ExceptionRow[] = (
    [
      ['D000126 · Metro Retail Partners', 'Exposure 124%', 'CFO approval', 'Breached SLA 3h', 'high', 5],
      ['D000245 · Eastern Trade Distributors', 'Delay 18 days', 'Commercial head', 'Within SLA', 'medium', 2],
      ['D000443 · Rural Reach Enterprise', 'Return rate 3.8%', 'Commercial head', 'Within SLA', 'medium', 1],
    ] as ExceptionRow[]
  ).sort((a, b) => b[5] - a[5]);
  const repeatOffenders = exceptions.filter((r) => r[5] > 1).length;

  const kpis: Array<{ label: string; value: string; detail: string; accent: string }> = [
    { label: 'Expired Active Rules', value: '12', detail: 'May affect 44 customers', accent: 'red' },
    { label: 'Overlapping Rules', value: '7', detail: '3 high-severity conflicts', accent: 'amber' },
    { label: 'Payment-Term Mismatch', value: '18', detail: '₹1.24 Cr documents', accent: 'purple' },
    { label: 'Repeat Offender Accounts', value: String(repeatOffenders), detail: `Of ${exceptions.length} open exceptions, tripped more than once`, accent: 'blue' },
  ];

  const precedence = [
    'Hard stop: inactive/missing credit master or prohibited condition',
    'Exact customer + sales area + plant + order type + validity',
    'Material-specific rule',
    'CRS SKU group rule using ZSKUGRCODECRS',
    'Configured wildcard / default policy',
    'Conflict routes to manual review; no silent override',
  ];

  const exceptionTrend = { labels: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'], actual: [23, 27, 25, 31, 38, 45] };

  return (
    <>
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`kpi accent-${k.accent}`}>
            <div className="label">{k.label}</div>
            <div className="value">{k.value}</div>
            <div className="sub">{k.detail}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Active Credit Policy Rules</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Policy rule</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {policies.map(([rule, status, cls]) => (
                <tr key={rule}>
                  <td>{rule}</td>
                  <td>
                    <span className={`badge ${cls}`}>{status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>Open Exceptions</h3>
          <span className="card-sub">Require documented override reason</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Exception</th>
                <th>Authority</th>
                <th>SLA</th>
                <th>Risk</th>
                <th>Occurrences (90d)</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((r) => (
                <tr key={r[0]} className="clickable">
                  <td>{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>{r[3]}</td>
                  <td>
                    <span className={`badge ${r[4]}`}>{r[4]}</span>
                  </td>
                  <td>
                    {r[5]}
                    {r[5] > 1 && <span className="badge medium" style={{ marginLeft: 6 }}>Repeat</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Rule Evaluation Precedence</h3>
          <ol style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
            {precedence.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </div>
        <div className="card">
          <h3>Exception Trend</h3>
          <AreaChart labels={exceptionTrend.labels} actual={exceptionTrend.actual} />
        </div>
      </div>
    </>
  );
}
