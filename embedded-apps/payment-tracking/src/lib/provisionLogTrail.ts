import type { ProvisionLogRow } from './paymentTrackingApi';

/**
 * Submission History by PO line: ZProvisionLogSet has one entry per action, so a PO line item that moved through
 * several stages shows up several times. The screen lists the latest entry of each PO + line item and opens the full
 * audit trail of that line on click.
 */

export interface LogTrail {
  /** `${poNumber}|${poItemNo}` */
  key: string;
  /** the most recent entry: its status and details are what the list shows */
  latest: ProvisionLogRow;
  /** every entry of this PO line, newest first */
  entries: ProvisionLogRow[];
}

export const trailKey = (r: Pick<ProvisionLogRow, 'poNumber' | 'poItemNo'>) => `${r.poNumber}|${r.poItemNo}`;

/** Newest first: action date, then time, then the order SAP returned them in (later = newer). */
export function compareNewestFirst(a: ProvisionLogRow, b: ProvisionLogRow): number {
  return (b.actionDate || '').localeCompare(a.actionDate || '')
    || (b.actionTime || '').localeCompare(a.actionTime || '')
    || b.seq - a.seq;
}

/** One trail per PO + line item, ordered by their latest entry (newest first). */
export function groupLogTrails(rows: ProvisionLogRow[]): LogTrail[] {
  const byKey = new Map<string, ProvisionLogRow[]>();
  for (const r of rows) {
    const k = trailKey(r);
    const list = byKey.get(k);
    if (list) list.push(r); else byKey.set(k, [r]);
  }
  const trails = [...byKey.entries()].map(([key, list]) => {
    const entries = [...list].sort(compareNewestFirst);
    return { key, latest: entries[0], entries };
  });
  return trails.sort((a, b) => compareNewestFirst(a.latest, b.latest));
}
