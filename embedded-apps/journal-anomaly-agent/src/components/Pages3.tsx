'use client';

import { Head, Kpi, Kpis, Tabs } from './Shared';
import type { PageState } from './Shared';

export function CloseGuardPage({ state }: { state: PageState }) {
  return (
    <>
      <Head title="Period-End Close Guard" sub="Pre-close readiness, top-side adjustments, late postings, accruals, reversals and approval SLA">
        <Tabs labels={['Pre-Close', 'Close Day', 'Post-Close']} />
      </Head>
      <div className="funnel">
        <div className="step">Population<b>18,426</b></div>
        <span>›</span>
        <div className="step">Auto-cleared<b>17,931</b></div>
        <span>›</span>
        <div className="step">Flagged<b>495</b></div>
        <span>›</span>
        <div className="step">High/Critical<b>47</b></div>
        <span>›</span>
        <div className="step">Open Cases<b>12</b></div>
      </div>
      <div className="grid2" style={{ marginTop: 13 }}>
        <div className="card">
          <h3>Close Risk by Hour</h3>
          <div className="heat">
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} style={{ background: i > 13 ? '#dc2626' : i > 9 ? '#d97706' : '#059669' }} onClick={() => state.toast(`${String(i + 6).padStart(2, '0')}:00 — posting-hour detail`)}>
                {String(i + 6).padStart(2, '0')}:00
                <br />
                {i > 13 ? 18 + i : 3 + i}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="recommend">
            <small>PERIOD-CLOSE ADVISORY</small>
            <h2>Review 9 entries before soft close</h2>
            <p>Estimated review effort: 3.2 hours. Highest exposure is in provisions, trade schemes and inventory adjustments.</p>
          </div>
          <div className="checkgrid" style={{ marginTop: 12 }}>
            <label className="check"><input type="checkbox" defaultChecked /> Block unapproved critical entries</label>
            <label className="check"><input type="checkbox" defaultChecked /> Notify controllers</label>
            <label className="check"><input type="checkbox" /> Auto-create audit cases</label>
            <label className="check"><input type="checkbox" defaultChecked /> Require reversal date</label>
          </div>
        </div>
      </div>
    </>
  );
}

export function IntegrationsPage() {
  return (
    <>
      <Head title="Integrated Process Risk" sub="Trace journal anomalies back to MM, SD, AA, CO and product/channel profitability in FMCG operations" />
      <Kpis>
        <Kpi label="Trade Scheme Accrual" value="₹3.1 Cr" sub="11 unusual adjustments" tone="amber" />
        <Kpi label="Inventory Revaluation" value="₹2.4 Cr" sub="6 entries near close" tone="red" />
        <Kpi label="Freight / C&F Provision" value="₹1.2 Cr" sub="Rare cost-center mix" tone="violet" />
        <Kpi label="Intercompany" value="₹4.7 Cr" sub="3 unmatched counterparts" tone="cyan" />
      </Kpis>
      <div className="card" style={{ marginTop: 13 }}>
        <h3>Cross-Module Traceability</h3>
        <div className="funnel">
          <div className="step">Source Process<b>SD Rebate</b></div>
          <span>›</span>
          <div className="step">Reference<b>Settlement</b></div>
          <span>›</span>
          <div className="step">FI Document<b>1900008472</b></div>
          <span>›</span>
          <div className="step">CO Object<b>Brand/Channel</b></div>
          <span>›</span>
          <div className="step">P&amp;L Impact<b>₹2.50 Cr</b></div>
        </div>
      </div>
    </>
  );
}
