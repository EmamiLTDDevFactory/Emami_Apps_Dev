'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import HubGate from '../components/HubGate';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { KpiGrid } from '../components/KpiGrid';
import { WorkTable, formatINR } from '../components/WorkTable';
import { Customer360 } from '../components/Customer360';
import { ApprovalWorkflow } from '../components/ApprovalWorkflow';
import { PortfolioAnalytics } from '../components/PortfolioAnalytics';
import { PolicyExceptions } from '../components/PolicyExceptions';
import { AgentMonitoring } from '../components/AgentMonitoring';
import { IntegrationHealth } from '../components/IntegrationHealth';
import { KpiDrawer } from '../components/KpiDrawer';
import { useIsWideScreen } from '../lib/useIsWideScreen';
import { loadDashboard } from '../lib/sapClient';
import type { Customer, DashboardPayload, Kpi, WorklistRow } from '../types';

const WORKLIST_KPIS: Array<{ label: string; value: string; detail: string; accent: string }> = [
  { label: 'Blocked Orders', value: '56', detail: '₹6.48 Cr | 9 breached SLA', accent: 'red' },
  { label: 'Blocked Deliveries', value: '31', detail: '₹3.27 Cr | 6 urgent', accent: 'amber' },
  { label: 'Pending PGI', value: '19', detail: '₹1.82 Cr | >24h: 7', accent: 'purple' },
  { label: 'Open Billing', value: '24', detail: '₹2.14 Cr | >24h: 5', accent: 'blue' },
];

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

function isHighRisk(r: WorklistRow) {
  return r.risk === 'High' || r.risk === 'Critical';
}

function DashboardContent() {
  const isWideScreen = useIsWideScreen();
  const [navOpen, setNavOpen] = useState(false);
  const [page, setPage] = useState('executive');
  const [data, setData] = useState<DashboardPayload>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [orgFilter, setOrgFilter] = useState<'ALL' | 'EM01' | 'EM02'>('ALL');
  const [ccaFilter, setCcaFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('2026-08-01');
  const [toDate, setToDate] = useState('2026-08-28');
  const [stamp, setStamp] = useState('Last refresh: just now');
  const [activeKpi, setActiveKpi] = useState<Kpi | null>(null);

  const load = useCallback((org: 'ALL' | 'EM01' | 'EM02') => {
    setBusy(true);
    setError(undefined);
    loadDashboard({ org })
      .then((d) => {
        setData(d);
        setStamp(`Last refresh: ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
      })
      .catch((e: Error) => setError(e.message || 'Unexpected error'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load(orgFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgFilter]);

  const work = data?.worklist ?? [];
  const customers = data?.customers ?? [];

  /* Client-side filtering (same as the source prototype's filterbar) — org is applied server-side
     via loadDashboard, everything else reacts instantly regardless of backend mode. */
  const scopeRows = work.filter(
    (w) => (ccaFilter === 'ALL' || w.cca === ccaFilter) && (channelFilter === 'ALL' || w.channel === channelFilter) && (!w.date || (w.date >= fromDate && w.date <= toDate))
  );
  const filteredWork = riskFilter === 'ALL' ? scopeRows : scopeRows.filter((w) => (riskFilter === 'HIGH+' ? isHighRisk(w) : w.risk === riskFilter));
  const filteredCustomers = customers.filter((c: Customer) => (ccaFilter === 'ALL' || c.cca === ccaFilter) && (channelFilter === 'ALL' || c.channel === channelFilter));

  function exportCsv() {
    const headers = ['Priority', 'Stage', 'Document', 'Customer', 'Sales Org', 'CCA', 'Channel', 'Amount', 'Risk', 'Recommendation', 'SLA', 'Date'];
    const rows = filteredWork.map((w) => [w.priority, w.stage, w.document, w.customerId, w.org, w.cca, w.channel, w.amount, w.risk, w.recommendation, w.sla, w.date]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'Credit_Risk_Worklist.csv');
  }

  function exportExcel() {
    const headers = ['Priority', 'Stage', 'Document', 'Customer', 'Sales Org', 'CCA', 'Channel', 'Amount', 'Risk', 'Recommendation', 'SLA', 'Date'];
    const rows = filteredWork.map((w) => [w.priority, w.stage, w.document, w.customerId, w.org, w.cca, w.channel, w.amount, w.risk, w.recommendation, w.sla, w.date]);
    const esc = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const sheet = `<html><head><meta charset="utf-8"></head><body><table><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    download(new Blob([sheet], { type: 'application/vnd.ms-excel' }), 'Credit_Risk_Worklist.xls');
  }

  function doExport(type: string) {
    if (type === 'pdf') {
      window.print();
      return;
    }
    if (type === 'excel') {
      exportExcel();
      return;
    }
    exportCsv();
  }

  function resetFilters() {
    setOrgFilter('ALL');
    setCcaFilter('ALL');
    setChannelFilter('ALL');
    setRiskFilter('ALL');
    setFromDate('2026-08-01');
    setToDate('2026-08-28');
  }

  const highRiskCount = filteredWork.filter(isHighRisk).length;

  /** Selecting a KPI card both opens its drill-down drawer AND routes to the Operations Worklist
   * — the section that actually holds the underlying documents the drawer's table is drawn from.
   * Previously this only opened the drawer with the page left on whichever section was already
   * showing, which read as "clicking the card does nothing" when that section wasn't Worklist. */
  const handleKpiSelect = (k: Kpi) => {
    setActiveKpi(k);
    setPage('worklist');
  };

  if (!data && busy) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading Credit Risk Advisory…</div>
    );
  }
  if (!data && error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <p>Unable to load dashboard: {error}</p>
        <button className="btn primary" onClick={() => load(orgFilter)}>
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="layout">
      <Sidebar
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        isWideScreen={isWideScreen}
        page={page}
        onNavigate={setPage}
        worklistCount={filteredWork.length}
        highRiskCount={highRiskCount}
        live={data.live}
      />
      {!isWideScreen && navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <div className="main-column">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="back-to-hub">
          <ArrowLeft size={14} /> Back to Emami Apps
        </a>
        <Topbar onRefresh={() => load(orgFilter)} onExport={doExport} onMenu={() => setNavOpen(true)} busy={busy} isWideScreen={isWideScreen} stamp={stamp} />
        <div className="content">
          <div className="filterbar">
            <label>
              From date
              <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label>
              To date
              <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <label>
              Sales org
              <select className="select" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value as 'ALL' | 'EM01' | 'EM02')}>
                <option value="ALL">All</option>
                <option value="EM01">EM01 - Consumer Care</option>
                <option value="EM02">EM02 - Health Care</option>
              </select>
            </label>
            <label>
              Credit control area
              <select className="select" value={ccaFilter} onChange={(e) => setCcaFilter(e.target.value)}>
                <option value="ALL">All</option>
                <option value="5000">5000</option>
                <option value="5001">5001</option>
              </select>
            </label>
            <label>
              Channel
              <select className="select" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
                <option value="ALL">All</option>
                <option value="10">10 - General Trade</option>
                <option value="30">30 - Modern Trade</option>
                <option value="35">35 - Super Stockist</option>
                <option value="40">40 - Rural</option>
              </select>
            </label>
            <label>
              Risk band
              <select className="select" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                <option value="ALL">All</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
                <option value="HIGH+">High + Critical</option>
              </select>
            </label>
            <div className="spacer" />
            <button className="btn dark" onClick={() => load(orgFilter)}>
              Apply filters
            </button>
            <button className="btn" onClick={resetFilters}>
              Reset
            </button>
          </div>

          {page === 'executive' && (
            <section>
              <div className="notice">
                Prototype mode: values shown come from the bundled demo dataset until ZCREDIT_ADV_SRV is deployed. Selecting a KPI opens its underlying document/customer drill-down. Recommendations remain advisory and require human approval before SAP release.
              </div>
              <div className="section-head">
                <div>
                  <h2>Executive Credit Position</h2>
                  <p>Exposure, blocked process stages, overdue posture and decision queues</p>
                </div>
                <span className="fresh stamp">{stamp}</span>
              </div>
              <KpiGrid kpis={data.kpis} onSelect={handleKpiSelect} />
              <div className="section-head">
                <div>
                  <h2>Priority Decision Queue</h2>
                  <p>Ordered by SLA, risk and incremental exposure</p>
                </div>
              </div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Risk</th>
                        <th>SLA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWork.slice(0, 5).map((w) => (
                        <tr key={w.document}>
                          <td>{w.document}</td>
                          <td>{w.customerId}</td>
                          <td>{formatINR(w.amount)}</td>
                          <td>
                            <span className={`badge ${w.risk.toLowerCase()}`}>{w.risk}</span>
                          </td>
                          <td>{w.sla}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {page === 'worklist' && (
            <section>
              <div className="section-head">
                <div>
                  <h2>Operations Worklist</h2>
                  <p>Blocked orders, deliveries, PGI, billing and approvals</p>
                </div>
                <span className="fresh stamp">{stamp}</span>
              </div>
              <div className="kpis">
                {WORKLIST_KPIS.map((m) => (
                  <div key={m.label} className={`kpi accent-${m.accent}`}>
                    <div className="label">{m.label}</div>
                    <div className="value">{m.value}</div>
                    <div className="sub">{m.detail}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ marginTop: 14 }}>
                <div className="card-head">
                  <h3>Unified Credit Operations Queue</h3>
                  <span className="card-sub">{filteredWork.length} documents · filters applied</span>
                </div>
                <WorkTable rows={filteredWork} />
              </div>
            </section>
          )}

          {page === 'customer' && (
            <section>
              <div className="section-head">
                <div>
                  <h2>Customer 360</h2>
                  <p>Master, exposure, ageing, payment behavior and explainable recommendation</p>
                </div>
              </div>
              <Customer360 customers={filteredCustomers} />
            </section>
          )}

          {page === 'portfolio' && (
            <section>
              <div className="section-head">
                <div>
                  <h2>Portfolio Analytics</h2>
                  <p>Concentration, risk composition, channels, depots and segment drill-down</p>
                </div>
              </div>
              <PortfolioAnalytics customers={filteredCustomers} />
            </section>
          )}

          {page === 'workflow' && (
            <section>
              <div className="section-head">
                <div>
                  <h2>Approval Workflow</h2>
                  <p>Maker-checker, authority matrix, SLA, escalation and execution reconciliation</p>
                </div>
              </div>
              <ApprovalWorkflow worklist={filteredWork} onChanged={() => load(orgFilter)} />
            </section>
          )}

          {page === 'policy' && (
            <section>
              <div className="section-head">
                <div>
                  <h2>Policy &amp; Exceptions</h2>
                  <p>Credit policy rules, exception routing and documented overrides</p>
                </div>
              </div>
              <PolicyExceptions />
            </section>
          )}

          {page === 'agent' && (
            <section>
              <div className="section-head">
                <div>
                  <h2>Agent Monitoring</h2>
                  <p>Recommendation mix, confidence, governance and safety telemetry</p>
                </div>
              </div>
              <AgentMonitoring />
            </section>
          )}

          {page === 'integration' && (
            <section>
              <div className="section-head">
                <div>
                  <h2>Integration Health</h2>
                  <p>SAP ECC, DMS/SFA, staging, reconciliation and retry queues</p>
                </div>
              </div>
              <IntegrationHealth />
            </section>
          )}

          <p style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', padding: '14px 0 6px' }}>
            Credit Risk Advisory AI Agent · {data.live ? 'SAP OData V2' : 'Demo data'} · ECC 6.0 EHP8 · Advisory only · Read-only recommendation model
          </p>
        </div>
      </div>
      <KpiDrawer
        kpi={activeKpi}
        rows={scopeRows}
        filters={{ org: orgFilter, cca: ccaFilter, channel: channelFilter, from: fromDate, to: toDate }}
        stamp={stamp}
        onClose={() => setActiveKpi(null)}
      />
    </div>
  );
}

export default function CreditRiskAdvisoryPage() {
  return (
    <HubGate>
      <DashboardContent />
    </HubGate>
  );
}
