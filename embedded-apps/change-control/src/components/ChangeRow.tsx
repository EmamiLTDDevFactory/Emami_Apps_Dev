'use client';
import type { Change } from '@/lib/api';
import { fmtDateTime } from '@/lib/labels';
import { RiskPill, StatusPill, TypePill } from './ui';

/** One change in a dashboard list: number + title on the left, type/risk/status on the right. */
export default function ChangeRow({ c, onOpen, schedule }: { c: Change; onOpen: (id: number) => void; schedule?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(c.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-sunken">
      <div className="min-w-0">
        <div className="font-mono text-2xs text-muted">{c.crNo}</div>
        <div className="truncate text-[13px] font-semibold">{c.title}</div>
        {schedule && (
          <div className="num text-2xs text-muted">
            {fmtDateTime(c.plannedStart)} → {fmtDateTime(c.plannedEnd)}
            {c.downtimeMinutes > 0 && <span className="ml-2 font-semibold text-warn">{c.downtimeMinutes} min downtime</span>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {!schedule && <TypePill type={c.changeType} />}
        {!schedule && <RiskPill risk={c.riskLevel} />}
        <StatusPill status={c.status} />
      </div>
    </button>
  );
}
