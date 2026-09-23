import type { WorklistRow } from '../types';

// ---------------------------------------------------------------------------
// SLA aging — derived client-side from WorklistRow.sla, a free-text field the source prototype's
// own mock data already wrote as "Breached 3h" or "1h 20m" (see src/data/mock.ts). There's no
// separate numeric SLA-minutes field on WorklistSet in the OData contract, so this parses the same
// display string every screen already renders rather than inventing a new SAP field — same
// "compute a real derived metric from what's actually on the wire" posture as src/lib/risk.ts.
// ---------------------------------------------------------------------------

/** Negative = already breached by that many minutes; positive = minutes remaining before breach. */
export function parseSlaMinutes(sla: string): number {
  const breached = /breach/i.test(sla);
  const h = Number(sla.match(/(\d+)\s*h/i)?.[1] ?? 0);
  const m = Number(sla.match(/(\d+)\s*m/i)?.[1] ?? 0);
  const total = h * 60 + m;
  return breached ? -total : total;
}

export function formatSlaMinutes(mins: number): string {
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const label = `${h}h${m ? ` ${m}m` : ''}`;
  return mins < 0 ? `Breached ${label}` : label;
}

/** The oldest (most overdue, or — if nothing has breached yet — soonest to breach) row, or null
 * for an empty worklist. */
export function oldestSla(rows: WorklistRow[]): { row: WorklistRow; minutes: number } | null {
  if (rows.length === 0) return null;
  let best = rows[0];
  let bestMinutes = parseSlaMinutes(best.sla);
  for (const r of rows.slice(1)) {
    const mins = parseSlaMinutes(r.sla);
    if (mins < bestMinutes) {
      best = r;
      bestMinutes = mins;
    }
  }
  return { row: best, minutes: bestMinutes };
}

export interface SlaAgingBucket {
  label: string;
  value: number;
  color: string;
}

/** Buckets the worklist into Breached / <2h / 2-6h / >6h — the aging distribution behind the
 * Approval Workflow's "SLA Breaches" KPI, so that number is traceable to a real shape instead of
 * a single unexplained total. */
export function slaAgingBuckets(rows: WorklistRow[]): SlaAgingBucket[] {
  let breached = 0;
  let under2h = 0;
  let from2to6h = 0;
  let over6h = 0;
  rows.forEach((r) => {
    const mins = parseSlaMinutes(r.sla);
    if (mins < 0) breached += 1;
    else if (mins <= 120) under2h += 1;
    else if (mins <= 360) from2to6h += 1;
    else over6h += 1;
  });
  return [
    { label: 'Breached', value: breached, color: '#c9362b' },
    { label: '< 2h', value: under2h, color: '#d97706' },
    { label: '2-6h', value: from2to6h, color: '#1769e0' },
    { label: '> 6h', value: over6h, color: '#16875d' },
  ];
}
