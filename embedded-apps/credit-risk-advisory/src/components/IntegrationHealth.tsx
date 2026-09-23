'use client';

import React from 'react';

/** Integration Health — SAP ECC/DMS/SFA interface status, freshness thresholds and the
 * failed/retry queue from the reference prototype. */
export function IntegrationHealth(): JSX.Element {
  const sources: Array<[string, boolean, string]> = [
    ['SAP ECC credit/exposure service', true, '5 min'],
    ['Blocked document delta', true, '7 min'],
    ['DMS secondary sales', false, '28 min'],
    ['SFA order synchronization', true, '12 min'],
    ['Operational staging', true, '3 min'],
    ['Release wrapper / retry', false, '1 failed'],
    ['Reconciliation service', true, '99.7%'],
  ];

  const retries = [
    ['CR-260828-0192', 'SAP Release Wrapper', '70004567', 'Lock conflict', '2', '05:24 PM'],
    ['CR-260828-0201', 'DMS Delta', 'DEP-KOL-07', 'Timeout', '1', '05:27 PM'],
  ];

  return (
    <>
      <div className="grid2">
        <div className="card">
          <h3>Source & Interface Status</h3>
          {sources.map(([name, healthy, meta]) => (
            <div key={name} className="health">
              <span>
                <i className="status-dot" style={{ background: healthy ? '#16875d' : '#d97706' }}></i>
                {name}
              </span>
              <b className={`badge ${healthy ? 'low' : 'medium'}`}>{healthy ? 'Healthy' : 'Warning'}</b>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Freshness Thresholds</h3>
          <div className="panel-row">
            <span>Operational queues</span>
            <b>Fresh ≤15m | Warning 15–30m | Stale &gt;30m</b>
          </div>
          <div className="panel-row">
            <span>Reference data</span>
            <b>Fresh ≤30m | Warning 30–60m</b>
          </div>
          <div className="panel-row">
            <span>On-demand check</span>
            <b>&lt;5 sec target</b>
          </div>
          <div className="panel-row">
            <span>Last reconciliation</span>
            <b>28-Aug-2026 05:10 PM</b>
          </div>
          <h3 style={{ marginTop: 16 }}>Failed / Retry Queue</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Correlation ID</th>
                  <th>Interface</th>
                  <th>Object</th>
                  <th>Error class</th>
                  <th>Attempts</th>
                  <th>Next retry</th>
                </tr>
              </thead>
              <tbody>
                {retries.map((r) => (
                  <tr key={r[0]}>
                    <td>{r[0]}</td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                    <td>{r[3]}</td>
                    <td>{r[4]}</td>
                    <td>{r[5]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
