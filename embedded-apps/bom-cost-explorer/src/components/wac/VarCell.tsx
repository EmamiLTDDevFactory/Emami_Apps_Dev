'use client';
import { AlertTriangle, ArrowDown, ArrowUp, Check, CircleAlert, Minus } from 'lucide-react';
import { cx } from '../ui';
import { fmtVarPct, tone, toneWord, type Tone } from '@/lib/wac/view';
import type { WacFlag } from '@/lib/wac/types';

const CLS: Record<Tone, string> = { bad: 'text-bad', warn: 'text-warn', good: 'text-good', na: 'text-faint' };

/** A variance cell: the number with its sign, SAP's flag colour AND an icon + word (colour is never the only signal).
 * No value is "n/a" in grey, never green. `dir` is SAP's direction ('+' actual above the source, '-' below). */
export default function VarCell({ value, flag, dir, className }: { value: string; flag: WacFlag; dir?: '+' | '-' | ''; className?: string }) {
  const t = tone(value, flag);
  const Icon = t === 'bad' ? AlertTriangle : t === 'warn' ? CircleAlert : t === 'good' ? Check : Minus;
  const Arrow = dir === '+' ? ArrowUp : dir === '-' ? ArrowDown : null;
  return (
    <span className={cx('inline-flex items-center justify-end gap-1 whitespace-nowrap font-semibold', CLS[t], className)} title={t === 'na' ? 'No value from SAP for this source' : `${toneWord(t)} variance`}>
      <Icon size={12} aria-hidden />
      {Arrow && <Arrow size={11} aria-hidden />}
      <span className="num">{fmtVarPct(value)}</span>
      <span className="sr-only">{`, ${toneWord(t)}`}</span>
      {(t === 'bad' || t === 'warn') && <span aria-hidden className="rounded bg-current/10 px-1 text-[9px] font-extrabold">{flag}</span>}
    </span>
  );
}
