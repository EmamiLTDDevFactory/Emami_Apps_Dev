'use client';

import { useState } from 'react';
import { Head, Kpi, Kpis, Tabs } from './Shared';
import type { PageState } from './Shared';

/** Close-readiness controls — same four gates the source prototype hardcoded as `defaultChecked`
 * (a static, non-interactive checklist). Now a real controlled checklist: toggling one recomputes
 * the "Close Readiness" score below instead of the checkboxes being purely decorative. */
const CLOSE_CONTROLS = [
  { id: 'block', label: 'Block unapproved critical entries', on: true },
  { id: 'notify', label: 'Notify controllers', on: true },
  { id: 'cases', label: 'Auto-create audit cases', on: false },
  { id: 'reversal', label: 'Require reversal date', on: true },
];

export function CloseGuardPage({ state }: { state: PageState }) {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CLOSE_CONTROLS.map((c) => [c.id, c.on]))
  );
  const activeCount = Object.values(checked).filter(Boolean).length;
  const readiness = Math.round((activeCount / CLOSE_CONTROLS.length) * 100);
  const readinessTone = readiness === 100 ? '#059669' : readiness >= 50 ? '#d97706' : '#dc2626';

  return (
    <>
      <Head title="Period-End Close Guard" sub="Pre-close readiness, top-side adjustments, late postings, accruals, reversals and approval SLA">
        <Tabs
          labels={['Pre-Close', 'Close Day', 'Post-Close']}
          onSelect={(_, label) => state.toast(`${label} window selected — readiness controls and close-risk heatmap below reflect this scope.`)}
        />
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
          <div style={{ margin: '12px 0 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span>Close Readiness</span>
              <b>{readiness}% · {activeCount} of {CLOSE_CONTROLS.length} controls active</b>
            </div>
            <div className="bar">
              <i style={{ width: `${readiness}%`, background: readinessTone }} />
            </div>
          </div>
          <div className="checkgrid" style={{ marginTop: 12 }}>
            {CLOSE_CONTROLS.map((c) => (
              <label className="check" key={c.id}>
                <input
                  type="checkbox"
                  checked={checked[c.id]}
                  onChange={() => setChecked((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                />
                {' '}{c.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function IntegrationsPage({ toast }: { toast: (m: string) => void }) {
  return (
    <>
      <Head title="Integrated Process Risk" sub="Trace journal anomalies back to MM, SD, AA, CO and product/channel profitability in FMCG operations" />
      <Kpis>
        <Kpi label="Trade Scheme Accrual" value="₹3.1 Cr" sub="11 unusual adjustments" tone="amber" onClick={() => toast('Trade scheme accruals traced via SD rebate settlement (COOI/VBRK) — 11 adjustments outside the learned norm.')} />
        <Kpi label="Inventory Revaluation" value="₹2.4 Cr" sub="6 entries near close" tone="red" onClick={() => toast('Inventory revaluation entries traced via MM price-difference postings — 6 land near period close.')} />
        <Kpi label="Freight / C&F Provision" value="₹1.2 Cr" sub="Rare cost-center mix" tone="violet" onClick={() => toast('Freight/C&F provisions flagged for an uncommon cost-center combination versus this vendor\'s history.')} />
        <Kpi label="Intercompany" value="₹4.7 Cr" sub="3 unmatched counterparts" tone="cyan" onClick={() => toast('3 intercompany postings have no matching counterpart document in the paired company code.')} />
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
