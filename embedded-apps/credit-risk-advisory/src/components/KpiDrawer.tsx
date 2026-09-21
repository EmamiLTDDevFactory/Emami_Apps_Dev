'use client';

import type { Kpi, WorklistRow } from '../types';

/** Metric -> document stage mapping used for the drill-down table. */
const STAGES_BY_METRIC: Record<string, string[]> = {
  'Open Sales Orders': ['Sales Order'],
  'Blocked Orders': ['Sales Order'],
  'Open Deliveries': ['Delivery'],
  'Blocked Deliveries': ['Delivery'],
  'Pending PGI': ['PGI'],
  'Open Billing': ['Billing'],
};

/** Metrics whose drill-down is restricted to High/Critical exposure. */
const HIGH_RISK_ONLY = new Set(['Blocked Orders', 'Blocked Deliveries', 'Overdue Receivables', 'Disputed Receivables', 'High/Critical Customers']);

export interface DrawerFilters {
  org: string;
  cca: string;
  channel: string;
  from: string;
  to: string;
}

interface Props {
  kpi: Kpi | null;
  /** Worklist rows already narrowed by the global Sales org / CCA / channel / date filters. */
  rows: WorklistRow[];
  filters: DrawerFilters;
  stamp: string;
  onClose: () => void;
}

function riskBadge(risk: string): JSX.Element {
  const cls = risk.toLowerCase();
  return <span className={`badge ${cls}`}>{risk}</span>;
}

/**
 * Right-side drill-down drawer (prototype `#drawer`): opened by the "View details ›" affordance
 * on any KPI card. Shows the metric context and a full-width document table — no page navigation,
 * the active view stays exactly where it is.
 */
export function KpiDrawer({ kpi, rows, filters, stamp, onClose }: Props): JSX.Element | null {
  if (!kpi) return null;

  const stages = STAGES_BY_METRIC[kpi.label];
  let metricRows = rows;
  if (stages) metricRows = metricRows.filter((r) => stages.includes(r.stage));
  if (HIGH_RISK_ONLY.has(kpi.label)) {
    metricRows = metricRows.filter((r) => r.risk === 'High' || r.risk === 'Critical');
  }
  const totalAmount = metricRows.reduce((a, r) => a + r.amount, 0);

  return (
    <>
      <div className="overlay open" onClick={onClose} />
      <aside className="drawer open" aria-label={`${kpi.label} drill-down`}>
        <div className="drawer-head">
          <div>
            <b>
              {kpi.badge && (
                <span className="badge low" style={{ marginRight: 8 }}>
                  {kpi.badge}
                </span>
              )}
              {kpi.label}
            </b>
            <div className="sub">
              {kpi.value} · {kpi.detail} · Filtered drill-down · synthetic prototype data
            </div>
          </div>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="drawer-body">
          {metricRows.length === 0 ? (
            <div className="notice">
              No documents match <b>{kpi.label}</b> under the active filters. Adjust the filter bar or reset to see the underlying queue.
            </div>
          ) : (
            <>
              <div className="notice">Active filters are applied. The table lists every document contributing to this metric.</div>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>Stage</th>
                      <th>Document</th>
                      <th>Customer</th>
                      <th>Sales Org</th>
                      <th>CCA</th>
                      <th>Channel</th>
                      <th>Amount</th>
                      <th>Risk</th>
                      <th>Recommendation</th>
                      <th>SLA</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map((r) => (
                      <tr key={r.document}>
                        <td>{r.priority}</td>
                        <td>{r.stage}</td>
                        <td>{r.document}</td>
                        <td>{r.customerId}</td>
                        <td>{r.org}</td>
                        <td>{r.cca}</td>
                        <td>{r.channel}</td>
                        <td>₹{r.amount.toLocaleString('en-IN')}</td>
                        <td>{riskBadge(r.risk)}</td>
                        <td>{r.recommendation}</td>
                        <td>{r.sla}</td>
                        <td>{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel-row" style={{ marginTop: 12 }}>
                <span>Documents</span>
                <b>{metricRows.length}</b>
              </div>
              <div className="panel-row">
                <span>Total amount</span>
                <b>₹{totalAmount.toLocaleString('en-IN')}</b>
              </div>
            </>
          )}
          <h3 style={{ marginTop: 18 }}>Drill-down context</h3>
          <div className="panel-row">
            <span>Metric</span>
            <b>{kpi.label}</b>
          </div>
          <div className="panel-row">
            <span>Sales org</span>
            <b>{filters.org === 'ALL' ? 'All' : filters.org}</b>
          </div>
          <div className="panel-row">
            <span>Credit control area</span>
            <b>{filters.cca === 'ALL' ? 'All' : filters.cca}</b>
          </div>
          <div className="panel-row">
            <span>Channel</span>
            <b>{filters.channel === 'ALL' ? 'All' : filters.channel}</b>
          </div>
          <div className="panel-row">
            <span>Date range</span>
            <b>
              {filters.from} to {filters.to}
            </b>
          </div>
          <div className="panel-row">
            <span>Freshness</span>
            <b className="fresh">Operational data {stamp.includes('just now') ? 'just now' : '7 min old'}</b>
          </div>
        </div>
      </aside>
    </>
  );
}
