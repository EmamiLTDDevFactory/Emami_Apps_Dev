'use client';

import type { Explanation, WorklistEntry } from '../types';
import { Head, KV } from './Shared';
import type { PageState } from './Shared';

/** Document-level forensic view for one journal entry — real drivers/score come from
 * RiskScoreSet+DriverSet via sapClient.ts's fetchExplanation (real SAP call, mock fallback),
 * unlike the source prototype which hardcoded this content for a single example document. Header/
 * line-item fields stay illustrative (HeaderSet/LineSet aren't wired here — see README) matching
 * the source's own static content for those. */
export function EntryExplorerPage({ state, entry, explanation }: { state: PageState; entry: WorklistEntry | null; explanation: Explanation | null }) {
  const shown = entry ?? state.items[0] ?? null;
  return (
    <>
      <Head title={shown ? `Journal Entry ${shown.document}` : 'Journal Entry Explorer'} sub="Document-level forensic view with debits, credits, provenance, approvals and linked business context">
        <button className="btn primary" onClick={() => shown && state.open(shown)}>Open Investigation Drawer</button>
      </Head>
      <div className="grid2">
        <div className="card">
          <div className="recommend">
            <small>COMPOSITE RISK {explanation?.score ?? shown?.score ?? '—'} · CONFIDENCE 91%</small>
            <h2>{shown ? `${shown.risk}: ${shown.signal}` : 'No entry selected'}</h2>
            <p>{shown ? `${shown.amount} posted by ${shown.userName} on GL pair ${shown.glPair}.` : 'Select an entry from the worklist to inspect it here.'}</p>
          </div>
          <h3 style={{ marginTop: 14 }}>Explainable risk drivers</h3>
          {(explanation?.drivers ?? []).map((d) => (
            <div key={d.code} className={`driver ${d.contribution >= 0 ? 'neg' : 'pos'}`}>
              {d.category} · {d.code} · {d.contribution >= 0 ? '+' : ''}{d.contribution} points
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Document Header</h3>
          <KV
            rows={[
              ['Company / Period', shown ? `${shown.companyCode} / ${shown.period ?? '—'}` : '—'],
              ['User / Timestamp', shown ? `${shown.userName} / ${shown.scoredAt ? new Date(shown.scoredAt).toLocaleTimeString() : '—'}` : '—'],
              ['GL Pair', shown?.glPair ?? '—'],
              ['Amount', shown?.amount ?? '—'],
              ['Fiscal Year', shown?.fiscalYear ?? '—'],
              ['Currency', 'INR'],
            ]}
          />
          <h3 style={{ marginTop: 14 }}>Source Provenance</h3>
          <div className="funnel">
            <div className="step">Manual Entry<b>SA</b></div>
            <span>›</span>
            <div className="step">SAP GUI<b>FB01</b></div>
            <span>›</span>
            <div className="step">FI-GL<b>BKPF/BSEG</b></div>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 13 }}>
        <h3>Debit / Credit Line Items</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>PK</th><th>GL</th><th>Description</th><th>Cost Center</th><th>Profit Center</th><th>Debit</th><th>Credit</th></tr></thead>
            <tbody>
              <tr><td>001</td><td>40</td><td>{shown?.glPair.split(' / ')[0] ?? '510100'}</td><td>Trade scheme expense</td><td>SALES-WEST</td><td>BRAND-NAV</td><td>{shown?.amount ?? '₹2.50 Cr'}</td><td></td></tr>
              <tr><td>002</td><td>50</td><td>{shown?.glPair.split(' / ')[1] ?? '299900'}</td><td>Other provisions</td><td></td><td>BRAND-NAV</td><td></td><td>{shown?.amount ?? '₹2.50 Cr'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function PatternsPage({ state }: { state: PageState }) {
  return (
    <>
      <Head title="Posting Pattern Intelligence" sub="Learned norms by user, peer group, GL pair, timing, document type, amount, reversal and source process" />
      <div className="grid3">
        <div className="card">
          <h3>Top Anomaly Typologies</h3>
          <div className="driver neg">After-hours · 82 · highest severity cluster</div>
          <div className="bar"><i style={{ width: '82%', background: '#dc2626' }} /></div>
          <div className="driver neg">Rare GL pair · 71</div>
          <div className="bar"><i style={{ width: '71%', background: '#d97706' }} /></div>
          <div className="driver neg">Round amount · 64</div>
          <div className="bar"><i style={{ width: '64%', background: '#7c3aed' }} /></div>
          <div className="driver neg">Fast reversal · 48</div>
          <div className="bar"><i style={{ width: '48%', background: '#0891b2' }} /></div>
          <div className="driver neg">User deviation · 39</div>
          <div className="bar"><i style={{ width: '39%', background: '#2563eb' }} /></div>
        </div>
        <div className="card">
          <h3>User Behavior Deviation</h3>
          <div className="driver neg">New GL account for user · 29 entries</div>
          <div className="driver neg">Weekend / holiday posting · 18 entries</div>
          <div className="driver neg">Volume burst above peer norm · 14 entries</div>
          <div className="driver pos">Consistent approver path · 96.8%</div>
        </div>
        <div className="card">
          <h3>Benford &amp; Round-Amount Signals</h3>
          <div className="driver neg">First-digit deviation · 2 GL accounts</div>
          <div className="driver neg">Exact lakh/crore amounts · 76 entries</div>
          <div className="driver pos">Population sufficiency check passed</div>
          <button className="btn" onClick={() => state.toast('Statistical detail — synthetic prototype data')}>View statistical detail</button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 13 }}>
        <h3>GL Pair Network: Rare and New Combinations</h3>
        <div className="heat">
          {(['Expense ↔ Provision', 'Inventory ↔ Price Diff', 'Revenue ↔ Other GL', 'Asset ↔ Clearing', 'COGS ↔ Accrual', 'Interco ↔ Suspense'] as string[]).map((x, i) => (
            <div key={x} style={{ background: i < 2 ? '#dc2626' : i < 4 ? '#d97706' : '#7c3aed' }} onClick={() => state.toast(`${x} — GL pair network detail`)}>
              {x}
              <br />
              {96 - i * 8}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
