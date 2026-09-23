'use client';

import type { CompanyCodeOption, FilterDraft } from '../types';

interface Props {
  draft: FilterDraft;
  setDraft: (d: FilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
  companyCodeOptions: CompanyCodeOption[];
}

export function FiltersBar({ draft, setDraft, onApply, onReset, companyCodeOptions }: Props) {
  return (
    <div className="filters">
      <label>
        Company Code
        <select className="sel" value={draft.companyCode} onChange={(e) => setDraft({ ...draft, companyCode: e.target.value })}>
          {companyCodeOptions.map((c) => (
            <option key={c.key} value={c.key === 'ALL' ? '' : c.key}>
              {c.text}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fiscal Year
        <select className="sel" defaultValue="2026">
          <option>2026</option>
          <option>2025</option>
        </select>
      </label>
      <label>
        Period
        <select className="sel" value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value })}>
          <option value="">All Periods</option>
          <option value="9">Sep 2026</option>
          <option value="8">Aug 2026</option>
        </select>
      </label>
      <label>
        Ledger
        <select className="sel" defaultValue="">
          <option value="">All Ledgers</option>
          <option>0L Leading</option>
          <option>Local GAAP</option>
        </select>
      </label>
      <label>
        Entry Type
        <select className="sel" defaultValue="">
          <option value="">All Entries</option>
          <option>Manual</option>
          <option>Automated</option>
          <option>Top-side</option>
          <option>Intercompany</option>
        </select>
      </label>
      <label>
        Risk
        <select className="sel" value={draft.risk} onChange={(e) => setDraft({ ...draft, risk: e.target.value })}>
          <option value="">All Risks</option>
          <option>Critical</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
      </label>
      <label>
        Amount ≥<input className="inp" defaultValue="₹ 0" style={{ width: 90 }} />
      </label>
      <label>
        Options
        <span>
          <input type="checkbox" defaultChecked /> Include CO context
        </span>
      </label>
      <div className="spacer" />
      <button className="btn dark" onClick={onApply}>Apply</button>
      <button className="btn" onClick={onReset}>Reset</button>
    </div>
  );
}
