'use client';

import { Bars, Head, KV } from './Shared';

export function EvidencePage({ toast }: { toast: (m: string) => void }) {
  return (
    <>
      <Head title="Audit Evidence Center" sub="Reproducible population, model version, rule results, approvals, attachments and chain of custody">
        <button className="btn primary" onClick={() => toast('Evidence pack generated with manifest')}>Generate Evidence Pack</button>
      </Head>
      <div className="grid2">
        <div className="card">
          <h3>Evidence Pack Contents</h3>
          <div className="checkgrid">
            <label className="check"><input type="checkbox" defaultChecked /> Population completeness</label>
            <label className="check"><input type="checkbox" defaultChecked /> Risk-scoring results</label>
            <label className="check"><input type="checkbox" defaultChecked /> Rule &amp; model versions</label>
            <label className="check"><input type="checkbox" defaultChecked /> Reviewer decisions</label>
            <label className="check"><input type="checkbox" defaultChecked /> SAP document snapshots</label>
            <label className="check"><input type="checkbox" defaultChecked /> Hash manifest</label>
          </div>
        </div>
        <div className="card">
          <h3>Assurance Metrics</h3>
          <Bars items={[['Population reconciliation', 100, '#059669'], ['Evidence completeness', 96, '#0891b2'], ['Reviewer sign-off', 88, '#d97706'], ['Hash verification', 100, '#059669']]} />
        </div>
      </div>
    </>
  );
}

export function ModelPage({ toast }: { toast: (m: string) => void }) {
  // Built as raw `.kpi` divs (not the shared <Kpi> component) but the CSS class is the same one
  // that unconditionally shows a "Drill down ›" affordance and pointer cursor — so these looked
  // clickable and did nothing. Wired to a real explanation of each metric instead.
  return (
    <>
      <Head title="AI Explainability & Governance" sub="Model performance, drift, fairness, thresholds, human overrides and champion/challenger monitoring" />
      <div className="kpis">
        <div className="kpi green" onClick={() => toast('Precision @ Review Capacity: of everything the model flags within reviewer bandwidth, 88.6% are true findings.')}>
          <div className="lab">Precision @ Review Capacity</div>
          <div className="val">88.6%</div>
          <div className="sub">Stable vs prior period</div>
        </div>
        <div className="kpi cyan" onClick={() => toast('Recall on Known Findings: of past confirmed findings, 92.4% would have been flagged by the current model on back-test.')}>
          <div className="lab">Recall on Known Findings</div>
          <div className="val">92.4%</div>
          <div className="sub">Back-tested</div>
        </div>
        <div className="kpi amber" onClick={() => toast('False Positive Rate: 5.8% of flagged entries clear as no-issue on review, against a 7% governance target.')}>
          <div className="lab">False Positive Rate</div>
          <div className="val">5.8%</div>
          <div className="sub">Target below 7%</div>
        </div>
        <div className="kpi violet" onClick={() => toast('Feature Drift PSI: 0.08 population-stability index on scoring features — below the 0.1 review threshold, no retraining trigger.')}>
          <div className="lab">Feature Drift PSI</div>
          <div className="val">0.08</div>
          <div className="sub">Stable</div>
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 13 }}>
        <div className="card">
          <h3>Score Composition</h3>
          <div className="driver neg">Behavioral anomaly model · 35%</div>
          <div className="driver neg">Accounting control rules · 30%</div>
          <div className="driver neg">Value and materiality · 20%</div>
          <div className="driver neg">Network / sequence anomaly · 15%</div>
        </div>
        <div className="card">
          <h3>Governance Controls</h3>
          <KV rows={[['Model version', 'JE-HYBRID-3.2'], ['Last validated', '15-Aug-2026'], ['Champion / challenger', 'IForest+GBM / Autoencoder'], ['Threshold approval', 'CFO Controls Committee'], ['Next drift review', '30-Sep-2026']]} />
        </div>
      </div>
    </>
  );
}
