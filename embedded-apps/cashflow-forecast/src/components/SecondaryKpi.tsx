'use client';

import type { SecondaryKpi as T } from '../types';
import { ICONS } from './IconRegistry';

/** Compact KPI strip card (CCC, DSO, DPO, FX exposure). */
export default function SecondaryKpi({ kpi }: { kpi: T }) {
  const Icon = ICONS[kpi.icon];
  return (
    <article className={`mini tone-${kpi.tone ?? 'blue'}`}>
      <span className="mini-icon">
        <Icon size={16} strokeWidth={2.1} aria-hidden />
      </span>
      <div>
        <small>{kpi.label}</small>
        <strong>{kpi.value}</strong>
        <span className="mini-note">{kpi.note}</span>
      </div>
    </article>
  );
}
