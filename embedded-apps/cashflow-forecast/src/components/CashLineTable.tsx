'use client';

import { useMemo, useState } from 'react';
import { Search, Table, X } from 'lucide-react';
import type { CashFlowLine } from '../types';

export type LineFocus = { mode: 'all' } | { mode: 'atRisk' } | { mode: 'partner'; partner: string };

/** Below this probability a line is treated as "at risk" for the KPI-card drill-down (see
 * page.tsx) — a heuristic, not a value SAP sends; documented here since it's the one place that
 * threshold is applied. */
export const AT_RISK_PROBABILITY_THRESHOLD = 75;

interface Props {
  lines: CashFlowLine[];
  focus: LineFocus;
  onClearFocus: () => void;
}

export default function CashLineTable({ lines, focus, onClearFocus }: Props) {
  const [search, setSearch] = useState('');

  const focused = useMemo(() => {
    if (focus.mode === 'atRisk') return lines.filter((l) => l.probability < AT_RISK_PROBABILITY_THRESHOLD);
    if (focus.mode === 'partner') return lines.filter((l) => l.partner === focus.partner);
    return lines;
  }, [lines, focus]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return focused;
    return focused.filter((l) => l.partner.toLowerCase().includes(q) || l.type.toLowerCase().includes(q));
  }, [focused, search]);

  const focusLabel = focus.mode === 'atRisk'
    ? `At risk (probability < ${AT_RISK_PROBABILITY_THRESHOLD}%)`
    : focus.mode === 'partner'
      ? focus.partner
      : null;

  return (
    <section className="card" id="lines">
      <div className="card-head">
        <h2>
          <Table size={18} /> Cash Flow Line Items
        </h2>
        <span className="chip">Top {visible.length} by due date · server-side paging</span>
      </div>
      <div className="line-toolbar">
        {focusLabel && (
          <span className="chip filter-chip">
            Filtered: {focusLabel}
            <button type="button" onClick={onClearFocus} aria-label="Clear filter">
              <X size={12} />
            </button>
          </span>
        )}
        <label className="line-search">
          <Search size={13} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search partner or type…"
            aria-label="Search cash flow line items"
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Due</th>
              <th>Type</th>
              <th>Partner</th>
              <th>Company</th>
              <th>Level</th>
              <th>Probability</th>
              <th className="num">Amount (₹ Cr)</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">No line items match this filter.</td>
              </tr>
            )}
            {visible.map((l) => (
              <tr key={l.id}>
                <td>{l.dueDate}</td>
                <td>
                  <span className={`chip ${l.amount >= 0 ? 'in' : 'out'}`}>{l.type}</span>
                </td>
                <td>{l.partner}</td>
                <td className="mono">{l.companyCode}</td>
                <td>{l.planningLevel}</td>
                <td>
                  <div className="prob">
                    <div className="prob-bar">
                      <div className="prob-fill" style={{ width: `${l.probability}%` }} />
                    </div>
                    <span>{l.probability}%</span>
                  </div>
                </td>
                <td className={`num mono ${l.amount >= 0 ? 'pos' : 'neg'}`}>
                  {l.amount >= 0 ? '+' : ''}
                  {l.amount.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
