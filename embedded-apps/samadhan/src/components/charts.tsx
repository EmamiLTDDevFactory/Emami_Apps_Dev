'use client';
import { useState, type ReactNode } from 'react';
import { fmtNum } from '@/lib/format';
import { cx } from './ui';

/** Hover card that follows the pointer inside a `relative` chart box (same as access-tracker). */
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
  detail?: string;
}

/** Ranked horizontal bars - one series, brand indigo, value at the end. Clicking calls onPick when given. */
export function BarList({ rows, unit, onPick, max: maxRows = 12, color }: { rows: BarRow[]; unit: string; onPick?: (key: string) => void; max?: number; color?: (key: string) => string }) {
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
              className={cx('grid w-full grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1 text-left transition', onPick && 'hover:bg-sunken', hover?.i === i && 'bg-sunken')}
            >
              <span className="truncate text-xs font-medium text-ink" title={r.label}>{r.label}</span>
              <span className="h-2.5 rounded-r bg-transparent">
                <span className={cx('block h-full rounded-r-[4px] transition-[width] duration-500', color ? color(r.key) : 'bg-accent')} style={{ width: r.value ? `${Math.max(2, (r.value / max) * 100)}%` : 0, opacity: hover && hover.i !== i ? 0.45 : 1 }} />
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

/** Tickets received per hour: today (indigo) against yesterday (muted), hours after "now" faded. */
export function HourChart({ hours, hourNow }: { hours: { hour: number; today: number; yesterday: number }[]; hourNow: number }) {
  const [hover, setHover] = useState<Hover>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const max = Math.max(1, ...hours.flatMap((h) => [h.today, h.yesterday]));
  const H = 140;
  return (
    <div>
      <div ref={setBox} className="relative" onMouseLeave={() => setHover(null)}>
        <div className="flex items-end gap-[3px]" style={{ height: H }}>
          {hours.map((h, i) => (
            <div
              key={h.hour}
              className={cx('flex h-full flex-1 items-end justify-center gap-px rounded-t', hover?.i === i && 'bg-sunken')}
              onMouseMove={(e) => setHover({ i, ...at(e, box) })}
            >
              <span className="w-1/2 rounded-t-[3px] bg-line" style={{ height: `${(h.yesterday / max) * 100}%`, minHeight: h.yesterday ? 2 : 0 }} />
              <span className={cx('w-1/2 rounded-t-[3px] bg-accent', h.hour > hourNow && 'opacity-30')} style={{ height: `${(h.today / max) * 100}%`, minHeight: h.today ? 2 : 0 }} />
            </div>
          ))}
        </div>
        {hover && hours[hover.i] && (
          <Tip x={hover.x} y={hover.y}>
            <div className="font-bold">{String(hours[hover.i].hour).padStart(2, '0')}:00 - {String(hours[hover.i].hour).padStart(2, '0')}:59</div>
            <div className="num">Today {hours[hover.i].today} · Yesterday {hours[hover.i].yesterday}</div>
          </Tip>
        )}
      </div>
      <div className="mt-1 flex justify-between text-2xs text-faint">
        {[0, 6, 12, 18, 23].map((h) => <span key={h} className="num">{String(h).padStart(2, '0')}:00</span>)}
      </div>
      <div className="mt-2 flex gap-4 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" /> Today</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-line" /> Yesterday</span>
      </div>
    </div>
  );
}
