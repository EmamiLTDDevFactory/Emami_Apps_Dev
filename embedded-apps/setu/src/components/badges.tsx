'use client';
import { useEffect, useState } from 'react';
import { ArrowRightLeft, Clock, Forward, Lock, MessageCircleReply, Pause, Phone, Reply, Sparkles, UserCheck, type LucideIcon } from 'lucide-react';
import { ACTIVITY_LABEL, PRIORITY_LABEL, PRIORITY_TONE, SEVERITY_LABEL, SEVERITY_TONE, fmtDateTime, relative, slaState } from '@/lib/format';
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

const ACTIVITY_ICON: Record<string, LucideIcon> = {
  created: Sparkles, status: ArrowRightLeft, assigned: UserCheck, agent_reply: Reply, requester_reply: MessageCircleReply,
  note: Lock, forward: Forward, call: Phone,
};

/** "Requester replied · Ravi Kumar · 12 min ago" - what last happened on the ticket. A requester reply stands out. */
export function ActivityLine({ t, className }: { t: Pick<TicketRow, 'lastActivityAt' | 'lastActivityKind' | 'lastActivityBy' | 'lastActivityDetail'>; className?: string }) {
  if (!t.lastActivityKind || !t.lastActivityAt) return null;
  const Icon = ACTIVITY_ICON[t.lastActivityKind] ?? ArrowRightLeft;
  const waiting = t.lastActivityKind === 'requester_reply';
  return (
    <div className={cx('flex min-w-0 items-center gap-1.5 text-2xs', waiting ? 'font-semibold text-accent' : 'text-muted', className)} title={fmtDateTime(t.lastActivityAt)}>
      <Icon size={11} className="shrink-0" />
      <span className="truncate">
        {ACTIVITY_LABEL[t.lastActivityKind] ?? t.lastActivityKind}
        {t.lastActivityDetail && t.lastActivityKind !== 'created' ? `: ${t.lastActivityDetail}` : ''}
        {t.lastActivityBy ? ` · ${t.lastActivityBy}` : ''} · {relative(t.lastActivityAt)}
      </span>
    </div>
  );
}
