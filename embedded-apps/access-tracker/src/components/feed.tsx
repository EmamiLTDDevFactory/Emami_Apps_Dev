'use client';
import { Minus, Pencil, Plus } from 'lucide-react';
import type { AccessChange } from '@/lib/api';
import { CHANGE_LABEL, changeTone, describeChange, fmtDateTime, fmtTime, relative } from '@/lib/format';
import { nameFromEmail } from '@/lib/hub';
import { cx } from './ui';

const TONE = { good: 'bg-good/10 text-good ring-good/25', bad: 'bg-bad/10 text-bad ring-bad/25', accent: 'bg-accent/10 text-accent ring-accent/25' };
const ICON = { good: Plus, bad: Minus, accent: Pencil };

/** One audit row: grant/revoke/edit icon, who it happened to, what changed, who did it, when. */
export function ChangeRow({ c, onPerson, showTarget = true, timeOnly }: { c: AccessChange; onPerson?: (email: string) => void; showTarget?: boolean; timeOnly?: boolean }) {
  const tone = changeTone(c);
  const Icon = ICON[tone];
  return (
    <li className="flex gap-3 py-2.5">
      <span className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1', TONE[tone])} aria-label={tone === 'good' ? 'Grant' : tone === 'bad' ? 'Revoke' : 'Change'}>
        <Icon size={13} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug">
          {showTarget && (
            <>
              <button type="button" className="font-semibold text-ink hover:text-accent hover:underline" onClick={() => onPerson?.(c.targetEmail)}>{nameFromEmail(c.targetEmail)}</button>
              <span className="text-muted"> · </span>
            </>
          )}
          <span>{describeChange(c)}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted">
          <span className="rounded bg-sunken px-1 font-semibold">{CHANGE_LABEL[c.changeType]}</span>
          <span>by {c.changedBy ? nameFromEmail(c.changedBy) : 'System'}</span>
        </div>
      </div>
      <time className="num shrink-0 text-right text-2xs text-muted" dateTime={c.occurredAt} title={fmtDateTime(c.occurredAt)}>
        {timeOnly ? fmtTime(c.occurredAt) : relative(c.occurredAt)}
      </time>
    </li>
  );
}
