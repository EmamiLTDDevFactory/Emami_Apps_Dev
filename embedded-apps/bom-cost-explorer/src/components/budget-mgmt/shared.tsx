'use client';
import type { ReactNode } from 'react';
import { cx } from '../ui';
import { STATUS_LABEL } from '@/lib/budgetMgmt/types';
import { SapError } from '@/lib/sap/client';

const CAT: Record<string, string> = { A: 'bg-good text-white', B: 'bg-warn text-white', C: 'bg-bad text-white' };
export function CatBadge({ cat }: { cat: string }) {
  return cat ? <span className={cx('inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-2xs font-extrabold', CAT[cat] ?? 'bg-sunken text-ink')}>{cat}</span> : <span className="text-faint">—</span>;
}

const STATUS: Record<string, string> = {
  D: 'bg-sunken text-muted ring-line', S: 'bg-accent/10 text-accent ring-accent/30', A: 'bg-good/10 text-good ring-good/30', R: 'bg-bad/10 text-bad ring-bad/30', V: 'bg-warn/10 text-warn ring-warn/30',
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={cx('inline-flex rounded-full px-2 py-0.5 text-2xs font-bold ring-1', STATUS[status] ?? STATUS.D)}>{STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? (status || '—')}</span>;
}

export const SourceChip = ({ src }: { src: string }) => (src ? <span className="inline-flex rounded-md bg-sunken px-1.5 py-0.5 text-2xs font-bold tracking-wide text-ink">{src}</span> : <span className="text-faint">—</span>);

/** SAP's own message for a SAP error, a plain retry text for a network failure. */
export const errorText = (e: unknown) => (e instanceof SapError ? (e.kind === 'network' ? 'Could not reach SAP — please retry' : e.message) : (e as Error).message || 'Something went wrong');

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{children}</div>;
}
export function OkBox({ children }: { children: ReactNode }) {
  return <div role="status" className="rounded-xl border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{children}</div>;
}

export function SkeletonRows({ cols }: { cols: number }) {
  return (
    <tbody aria-busy="true">
      {[0, 1, 2].map((i) => <tr key={i} className="border-b border-line/60">{Array.from({ length: cols }, (_, j) => <td key={j} className="px-2 py-2"><div className="h-3 animate-pulse rounded bg-sunken" /></td>)}</tr>)}
    </tbody>
  );
}

export const NO_RECORDS = 'No records found for the selection';
export const th = 'whitespace-nowrap border-b border-line px-2 py-1.5 text-left text-xs font-bold';
export const td = 'whitespace-nowrap px-2 py-1.5 text-xs';
