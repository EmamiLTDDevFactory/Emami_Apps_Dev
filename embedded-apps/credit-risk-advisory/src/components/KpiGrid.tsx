'use client';

import type { Kpi } from '../types';

const FALLBACK_ACCENTS = ['accent-blue', 'accent-red', 'accent-amber', 'accent-green'];

interface Props {
  kpis: Kpi[];
  onSelect?: (kpi: Kpi) => void;
}

/**
 * Executive KPI cards — 4-column grid with colored accent bars, a unique category badge and the
 * "View details ›" affordance from the reference prototype. Accent color comes from the data
 * (blue/red/amber/green/purple) with a fallback cycle.
 */
export function KpiGrid({ kpis, onSelect }: Props): JSX.Element {
  return (
    <div className="kpis">
      {kpis.map((k, i) => (
        <div key={k.label} className={`kpi kpi-clickable ${k.accent ? `accent-${k.accent}` : FALLBACK_ACCENTS[i % FALLBACK_ACCENTS.length]}`} onClick={() => onSelect?.(k)}>
          {k.badge && <span className="kpi-badge">{k.badge}</span>}
          <div className="label">{k.label}</div>
          <div className="value">{k.value}</div>
          <div className="sub">{k.detail}</div>
        </div>
      ))}
    </div>
  );
}
