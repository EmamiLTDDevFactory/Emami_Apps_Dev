'use client';

import type { Kpi } from '../types';
import { ICONS } from './IconRegistry';

export default function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = ICONS[kpi.icon];
  return (
    <article className={`metric tone-${kpi.tone ?? 'blue'}`}>
      <span className="metric-icon">
        <Icon size={20} strokeWidth={2.1} aria-hidden />
      </span>
      <small>{kpi.label}</small>
      <strong>{kpi.value}</strong>
      <span className="metric-note">{kpi.note}</span>
    </article>
  );
}
