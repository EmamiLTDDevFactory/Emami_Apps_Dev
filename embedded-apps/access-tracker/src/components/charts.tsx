'use client';
import { useState, type ReactNode } from 'react';
import { fmtNum } from '@/lib/format';
import { cx } from './ui';

/** Hover card that follows the pointer inside a `relative` chart box. */
function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-plum-deep px-2.5 py-1.5 text-2xs text-white shadow-pop" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}

type Hover = { i: number; x: number; y: number } | null;
const at = (e: React.MouseEvent, box: HTMLElement | null) => {
  const r = box?.getBoundingClientRect();
  return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
};

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Extra line for the hover card. */
  detail?: string;
}

/** Ranked horizontal bars - one series, one hue (brand indigo), value in ink at the bar's end.
 * The whole row is the hit target; clicking calls onPick when given. */
export function BarList({ rows, unit, onPick, max: maxRows = 10 }: { rows: BarRow[]; unit: string; onPick?: (key: string) => void; max?: number }) {
  const [hover, setHover] = useState<Hover>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const shown = rows.slice(0, maxRows);
  const max = Math.max(1, ...shown.map((r) => r.value));
  return (
    <div ref={setBox} className="relative" onMouseLeave={() => setHover(null)}>
      <ul className="space-y-1">
        {shown.map((r, i) => (
          <li key={r.key}>
            <button
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(r.key)}
              onMouseMove={(e) => setHover({ i, ...at(e, box) })}
              className={cx('grid w-full grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1 text-left transition', onPick && 'hover:bg-sunken', hover?.i === i && 'bg-sunken')}
            >
              <span className="truncate text-xs font-medium text-ink" title={r.label}>{r.label}</span>
              <span className="h-2.5 rounded-r bg-transparent">
                <span className="block h-full rounded-r-[4px] bg-accent transition-[width] duration-500" style={{ width: r.value ? `${Math.max(2, (r.value / max) * 100)}%` : 0, opacity: hover && hover.i !== i ? 0.45 : 1 }} />
              </span>
              <span className="num w-10 text-right text-xs font-bold text-ink">{fmtNum(r.value)}</span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > maxRows && <p className="mt-2 px-1.5 text-2xs text-faint">+ {rows.length - maxRows} more</p>}
      {hover && shown[hover.i] && (
        <Tip x={hover.x} y={hover.y}>
          <div className="font-bold">{shown[hover.i].label}</div>
          <div className="num">{fmtNum(shown[hover.i].value)} {unit}</div>
          {shown[hover.i].detail && <div className="text-white/70">{shown[hover.i].detail}</div>}
        </Tip>
      )}
    </div>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Part-to-whole as one stacked bar (2px surface gaps between fills) with a legend that always
 * carries the count and share, so identity never rests on colour alone. */
export function ShareBar({ segments, unit }: { segments: Segment[]; unit: string }) {
  const [hover, setHover] = useState<Hover>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div ref={setBox} className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px] bg-sunken">
        {visible.map((s, i) => (
          <div
            key={s.key}
            onMouseMove={(e) => setHover({ i, ...at(e, box) })}
            className="h-full transition-opacity"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color, opacity: hover && hover.i !== i ? 0.45 : 1 }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 text-ink">{s.label}</span>
            <span className="num font-bold">{fmtNum(s.value)}</span>
            <span className="num w-9 text-right text-muted">{pct(s.value)}%</span>
          </li>
        ))}
      </ul>
      {hover && visible[hover.i] && (
        <Tip x={hover.x} y={hover.y}>
          <div className="font-bold">{visible[hover.i].label}</div>
          <div className="num">{fmtNum(visible[hover.i].value)} {unit} · {pct(visible[hover.i].value)}%</div>
        </Tip>
      )}
    </div>
  );
}

/** Daily counts as thin columns on one baseline - a sparse audit feed reads better as columns than
 * as a line that implies values between days. */
export function DayColumns({ days, unit }: { days: { date: string; label: string; value: number }[]; unit: string }) {
  const [hover, setHover] = useState<Hover>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const max = Math.max(1, ...days.map((d) => d.value));
  const total = days.reduce((s, d) => s + d.value, 0);
  return (
    <div ref={setBox} className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex h-36 items-end gap-[2px] border-b border-line">
        {days.map((d, i) => (
          <div key={d.date} className="flex h-full flex-1 items-end" onMouseMove={(e) => setHover({ i, ...at(e, box) })}>
            <div
              className={cx('w-full rounded-t-[4px] transition-opacity', d.value ? 'bg-accent' : 'bg-line')}
              style={{ height: d.value ? `${Math.max(4, (d.value / max) * 100)}%` : 2, opacity: hover && hover.i !== i ? 0.45 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-faint">
        <span>{days[0]?.label}</span>
        <span className="num">{fmtNum(total)} {unit} in {days.length} days · peak {fmtNum(max === 1 && total === 0 ? 0 : max)}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
      {hover && days[hover.i] && (
        <Tip x={hover.x} y={hover.y}>
          <div className="font-bold">{days[hover.i].label}</div>
          <div className="num">{fmtNum(days[hover.i].value)} {unit}</div>
        </Tip>
      )}
    </div>
  );
}
