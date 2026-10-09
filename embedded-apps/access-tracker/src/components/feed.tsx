'use client';
import { Minus, Pencil, Plus } from 'lucide-react';
import type { AccessChange } from '@/lib/api';
import { CHANGE_LABEL, changeTone, describeChange, fmtDateTime, fmtTime, relative } from '@/lib/format';
import { appName } from '@/lib/apps';
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

/** Old/new value as shown in the table: status flags read as Active/Inactive, blanks as a dash. */
function valueLabel(c: AccessChange, v: string | null): string {
  if (v == null || v === '') return '—';
  if (c.changeType === 'ACTIVE_STATUS') return v === 'true' ? 'Active' : 'Inactive';
  return v;
}

const TONE_TEXT = { good: 'text-good', bad: 'text-bad', accent: 'text-accent' };

/** Short verb for the table's Change column - says what happened, not just which field. */
function actionLabel(c: AccessChange): string {
  if (c.changeType === 'APP_ROLE') return !c.oldValue ? 'App granted' : !c.newValue ? 'App revoked' : 'Role changed';
  if (c.changeType === 'ACTIVE_STATUS') return c.newValue === 'true' ? 'Activated' : 'Deactivated';
  if (c.changeType === 'ACCESS_LEVEL') return 'Level changed';
  if (c.changeType === 'MOBILE_SET') return 'Mobile updated';
  return CHANGE_LABEL[c.changeType];
}

/** The same audit rows as a scannable table: when, who, what, before -> after, by whom. */
export function ChangeTable({ changes, onPerson }: { changes: AccessChange[]; onPerson?: (email: string) => void }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[860px] text-left">
        <thead className="border-b border-line bg-sunken/60 text-2xs font-bold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5">When</th>
            <th className="px-3 py-2.5">User</th>
            <th className="px-3 py-2.5">Change</th>
            <th className="px-3 py-2.5">App</th>
            <th className="px-3 py-2.5">Before</th>
            <th className="px-3 py-2.5">After</th>
            <th className="px-4 py-2.5">Changed by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line text-xs">
          {changes.map((c) => {
            const tone = changeTone(c);
            const Icon = ICON[tone];
            return (
              <tr key={c.id} className="align-middle transition hover:bg-sunken/60">
                <td className="num whitespace-nowrap px-4 py-2.5" title={fmtDateTime(c.occurredAt)}>
                  <div className="font-semibold text-ink">{relative(c.occurredAt)}</div>
                  <div className="text-2xs text-muted">{fmtDateTime(c.occurredAt)}</div>
                </td>
                <td className="max-w-[200px] px-3 py-2.5">
                  <button type="button" className="block max-w-full truncate text-left font-semibold text-ink hover:text-accent hover:underline" onClick={() => onPerson?.(c.targetEmail)}>{nameFromEmail(c.targetEmail)}</button>
                  <div className="truncate text-2xs text-muted">{c.targetEmail}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className={cx('inline-flex items-center gap-1.5 font-semibold', TONE_TEXT[tone])}>
                    <Icon size={12} strokeWidth={2.5} aria-hidden />
                    {actionLabel(c)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{c.appId ? appName(c.appId) : <span className="text-faint">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{valueLabel(c, c.oldValue)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{valueLabel(c, c.newValue)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{c.changedBy ? nameFromEmail(c.changedBy) : 'System'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
