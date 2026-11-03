'use client';
import { useT } from '@/i18n';
import type { StatusCode } from '@/lib/types';

export function StatusChip({ status }: { status: StatusCode }) {
  const t = useT();
  const text = t(`status.${status}` as 'status.00');
  return <span className={`chip s${status}`}>{text === `status.${status}` ? status : text}</span>;
}
