import { cx } from '../ui';
import { SRC_META, STATUS_META, statusOf } from '@/lib/pkg/rules';

export function StatusChip({ status }: { status: string }) {
  const m = STATUS_META[statusOf(status)];
  return <span className={cx('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-2xs font-bold ring-1', m.cls)}>{m.label}</span>;
}

export const SrcChip = ({ src }: { src: string }) =>
  src ? <span className={cx('inline-flex rounded-md px-1.5 py-0.5 text-2xs font-bold tracking-wide', SRC_META[src] ?? 'bg-sunken text-ink')}>{src}</span> : <span className="text-faint">—</span>;
