'use client';

import type { Kpi } from '../types';
import { ICONS } from './IconRegistry';

/** `onSelect` turns the card into a drill-down trigger (e.g. "At-Risk Receivables" filters Cash
 * Flow Line Items down to that KPI's rows and scrolls there) — see page.tsx's `DRILLABLE_KPI_KEYS`
 * for which KPIs get this. Cards without it stay plain, non-interactive metric tiles. */
export default function KpiCard({ kpi, onSelect }: { kpi: Kpi; onSelect?: () => void }) {
  const Icon = ICONS[kpi.icon];
  const body = (
    <>
      <span className="metric-icon">
        <Icon size={20} strokeWidth={2.1} aria-hidden />
      </span>
      <small>{kpi.label}</small>
      <strong>{kpi.value}</strong>
      <span className="metric-note">{kpi.note}</span>
      {onSelect && <span className="metric-drill">View line items →</span>}
    </>
  );

  if (onSelect) {
    return (
      <button type="button" className={`metric metric-clickable tone-${kpi.tone ?? 'blue'}`} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return <article className={`metric tone-${kpi.tone ?? 'blue'}`}>{body}</article>;
}
