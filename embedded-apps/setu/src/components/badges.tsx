'use client';
import { useEffect, useState } from 'react';
import { Clock, Pause } from 'lucide-react';
import { PRIORITY_LABEL, PRIORITY_TONE, SEVERITY_LABEL, SEVERITY_TONE, slaState } from '@/lib/format';
import type { Severity, TicketRow } from '@/lib/types';
import { Pill, cx } from './ui';

export const SeverityPill = ({ severity }: { severity: Severity }) => <Pill tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Pill>;

export const PriorityPill = ({ priority }: { priority: number }) => <Pill tone={PRIORITY_TONE[priority] ?? 'neutral'}>{PRIORITY_LABEL[priority] ?? priority}</Pill>;

export function StatusPill({ t }: { t: Pick<TicketRow, 'statusName' | 'isResolved' | 'isClosed' | 'pausesSla'> }) {
  const tone = t.isClosed ? 'neutral' : t.isResolved ? 'good' : t.pausesSla ? 'warn' : 'accent';
  return <Pill tone={tone}>{t.statusName}</Pill>;
}

// One clock for every countdown on the page (a list of 50 tickets used to start 50 timers).
const listeners = new Set<(now: number) => void>();
let clock: ReturnType<typeof setInterval> | null = null;
function subscribe(fn: (now: number) => void) {
  listeners.add(fn);
  if (!clock) clock = setInterval(() => { const n = Date.now(); listeners.forEach((l) => l(n)); }, 30_000);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && clock) { clearInterval(clock); clock = null; }
  };
}

/** Live SLA countdown (re-renders every 30 s from the shared clock). */
export function SlaBadge({ t, className }: { t: Parameters<typeof slaState>[0]; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(setNow), []);
  const s = slaState(t, now);
  const tone = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', neutral: 'text-muted' }[s.tone];
  return (
    <span title={s.title} className={cx('num inline-flex items-center gap-1 whitespace-nowrap text-2xs font-bold', tone, className)}>
      {s.label === 'Paused' ? <Pause size={11} /> : <Clock size={11} />}
      {s.label}
    </span>
  );
}
