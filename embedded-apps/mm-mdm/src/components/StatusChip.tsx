import { STATUS_TEXT, type StatusCode } from '@/lib/types';

export function StatusChip({ status }: { status: StatusCode }) {
  return <span className={`chip s${status}`}>{STATUS_TEXT[status] ?? status}</span>;
}
