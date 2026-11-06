import type { Workpaper } from '@/lib/types';

/** Status chip of a workpaper: awaiting (warn), responded (info), closed (ok). */
export function StatusBadge({ wp }: { wp: Pick<Workpaper, 'status' | 'statusText'> }) {
  const cls = wp.status === 'Send to Auditee' ? 's04' : wp.status === 'Management Responded' ? 's02' : 's03';
  return <span className={`chip ${cls}`}>{wp.statusText || wp.status}</span>;
}
