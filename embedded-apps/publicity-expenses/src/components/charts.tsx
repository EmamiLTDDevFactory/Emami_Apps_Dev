'use client';
/**
 * Small SVG / CSS charts in the hub style (no chart library). Series colours come from the validated --s1..--s8 tokens
 * in fixed order; text always uses ink / muted tokens. Every chart has a hover tooltip with the exact values, so the two
 * lighter series colours (under 3:1 on white) are never the only way to read a value.
 */
import { useState, type ReactNode } from 'react';
import { cx } from './ui';

export const SERIES = ['rgb(var(--s1))', 'rgb(var(--s2))', 'rgb(var(--s3))', 'rgb(var(--s4))', 'rgb(var(--s5))', 'rgb(var(--s6))', 'rgb(var(--s7))'];
export const OTHER = 'rgb(var(--s8))';
export const CLASS_COLOR: Record<string, string> = { ATL: SERIES[0], BTL: SERIES[1], OTHER: SERIES[2], UNMAPPED: OTHER };

export function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-20 max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-lg bg-plum-deep px-2.5 py-1.5 text-2xs text-white shadow-pop" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}

type Hover = { i: number; x: number; y: number } | null;
const at = (e: React.MouseEvent, box: HTMLElement | null) => {
  const r = box?.getBoundingClientRect();
  return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
};

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className={cx('h-2.5 w-2.5 rounded-sm', it.dashed && 'border border-dashed border-muted bg-transparent')} style={it.dashed ? undefined : { background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export interface BarRow { key: string; label: string; value: number; compare?: number; detail?: ReactNode; color?: string }

/**
 * Ranked horizontal bars. `compare` draws a thin tick (e.g. PY or budget) on the same scale. Value text at the end.
 */
export function BarList({ rows, fmt, onPick, max: maxRows = 12, compareLabel, valueLabel = 'CY' }: {
  rows: BarRow[]; fmt: (v: number) => string; onPick?: (key: string) => void; max?: number; compareLabel?: string; valueLabel?: string;
}) {
  const [hover, setHover] = useState<Hover>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const shown = rows.slice(0, maxRows);
  const max = Math.max(1, ...shown.map((r) => Math.max(r.value, r.compare ?? 0)));
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
              className={cx('grid w-full grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 rounded-lg px-1.5 py-1 text-left transition sm:grid-cols-[minmax(0,11rem)_1fr_auto] sm:gap-3', onPick && 'hover:bg-sunken', hover?.i === i && 'bg-sunken')}
            >
              <span className="truncate text-xs font-medium text-ink" title={r.label}>{r.label}</span>
              <span className="relative h-3">
                <span className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-500" style={{ width: r.value > 0 ? `${Math.max(1, (r.value / max) * 100)}%` : 0, background: r.color ?? SERIES[0], opacity: hover && hover.i !== i ? 0.45 : 1 }} />
                {r.compare !== undefined && r.compare > 0 && (
                  <span aria-hidden className="absolute -inset-y-0.5 w-0.5 rounded bg-ink/70" style={{ left: `calc(${Math.min(100, (r.compare / max) * 100)}% - 1px)` }} />
                )}
              </span>
              <span className="num min-w-[3.5rem] text-right text-xs font-bold text-ink">{fmt(r.value)}</span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > maxRows && <p className="mt-2 px-1.5 text-2xs text-faint">+ {rows.length - maxRows} more</p>}
      {hover && shown[hover.i] && (
        <Tip x={hover.x} y={hover.y}>
          <div className="font-bold">{shown[hover.i].label}</div>
          <div className="num">{valueLabel} {fmt(shown[hover.i].value)}</div>
          {shown[hover.i].compare !== undefined && <div className="num text-white/80">{compareLabel} {fmt(shown[hover.i].compare ?? 0)}</div>}
          {shown[hover.i].detail && <div className="text-white/70">{shown[hover.i].detail}</div>}
        </Tip>
      )}
    </div>
  );
}

/** Monthly CY bars against PY bars (one axis, same unit). Months after the selected period are not drawn. */
export function TrendBars({ months, fmt, height = 180 }: { months: { label: string; cy: number; py: number }[]; fmt: (v: number) => string; height?: number }) {
  const [hover, setHover] = useState<Hover>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const max = Math.max(1, ...months.flatMap((m) => [m.cy, m.py]));
  const ticks = [0, 0.5, 1].map((f) => max * f);
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between pb-5 text-right text-[10px] text-faint" style={{ height }}>
          {[...ticks].reverse().map((t) => <span key={t} className="num">{t === 0 ? '0' : fmt(t)}</span>)}
        </div>
        <div ref={setBox} className="relative min-w-0 flex-1" onMouseLeave={() => setHover(null)}>
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <div className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: (height - 20) / 2 }} />
          <div className="flex items-end gap-1 border-b border-line sm:gap-2" style={{ height: height - 20 }}>
            {months.map((m, i) => (
              <div key={m.label} className={cx('flex h-full flex-1 items-end justify-center gap-[2px] rounded-t', hover?.i === i && 'bg-sunken')} onMouseMove={(e) => setHover({ i, ...at(e, box) })}>
                <span className="w-[42%] max-w-[18px] rounded-t-[4px] bg-line" style={{ height: `${(Math.max(0, m.py) / max) * 100}%` }} />
                <span className="w-[42%] max-w-[18px] rounded-t-[4px]" style={{ height: `${(Math.max(0, m.cy) / max) * 100}%`, background: SERIES[0] }} />
              </div>
            ))}
          </div>
          <div className="flex gap-1 pt-1 sm:gap-2">
            {months.map((m) => <span key={m.label} className="flex-1 text-center text-[10px] text-faint">{m.label.slice(0, 3)}</span>)}
          </div>
          {hover && months[hover.i] && (
            <Tip x={hover.x} y={hover.y}>
              <div className="font-bold">{months[hover.i].label}</div>
              <div className="num">CY {fmt(months[hover.i].cy)}</div>
              <div className="num text-white/80">PY {fmt(months[hover.i].py)}</div>
            </Tip>
          )}
        </div>
      </div>
      <div className="mt-2"><Legend items={[{ label: 'Current year', color: SERIES[0] }, { label: 'Previous year', color: 'rgb(var(--line))' }]} /></div>
    </div>
  );
}

/** One 100 % bar split into parts (e.g. ATL / BTL / Other), labels and shares underneath. */
export function SplitBar({ parts, fmt }: { parts: { label: string; value: number; color: string }[]; fmt: (v: number) => string }) {
  const [hover, setHover] = useState<Hover>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const pos = parts.filter((p) => p.value > 0);
  const sum = pos.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div ref={setBox} className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded-md">
        {pos.map((p, i) => (
          <span key={p.label} onMouseMove={(e) => setHover({ i, ...at(e, box) })} className="h-full first:rounded-l-md last:rounded-r-md" style={{ width: `${(p.value / sum) * 100}%`, background: p.color, opacity: hover && hover.i !== i ? 0.5 : 1 }} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pos.map((p) => (
          <div key={p.label} className="flex items-start gap-1.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <div className="min-w-0">
              <div className="truncate text-2xs font-semibold text-muted">{p.label}</div>
              <div className="num text-sm font-bold">{((p.value / sum) * 100).toFixed(1)}%<span className="ml-1 text-2xs font-medium text-muted">{fmt(p.value)}</span></div>
            </div>
          </div>
        ))}
      </div>
      {hover && pos[hover.i] && (
        <Tip x={hover.x} y={hover.y}><div className="font-bold">{pos[hover.i].label}</div><div className="num">{fmt(pos[hover.i].value)} · {((pos[hover.i].value / sum) * 100).toFixed(1)}%</div></Tip>
      )}
    </div>
  );
}

/** Horizontal 100 % stacked bars per row (e.g. media mix per brand), 2px gaps between segments. */
export function StackedRows({ rows, series, fmt }: {
  rows: { key: string; label: string; parts: Record<string, number> }[]; series: { key: string; label: string; color: string }[]; fmt: (v: number) => string;
}) {
  const [hover, setHover] = useState<{ r: number; s: number; x: number; y: number } | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setBox} className="relative" onMouseLeave={() => setHover(null)}>
      <ul className="space-y-1.5">
        {rows.map((row, ri) => {
          const sum = series.reduce((s, x) => s + Math.max(0, row.parts[x.key] || 0), 0) || 1;
          return (
            <li key={row.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-2 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-3">
              <span className="truncate text-xs font-medium" title={row.label}>{row.label}</span>
              <span className="flex h-3 gap-[2px] overflow-hidden rounded">
                {series.map((s, si) => {
                  const v = Math.max(0, row.parts[s.key] || 0);
                  if (!v) return null;
                  return <span key={s.key} onMouseMove={(e) => setHover({ r: ri, s: si, ...at(e, box) })} style={{ width: `${(v / sum) * 100}%`, background: s.color }} className="h-full" />;
                })}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3"><Legend items={series.map((s) => ({ label: s.label, color: s.color }))} /></div>
      {hover && rows[hover.r] && (() => {
        const row = rows[hover.r]; const s = series[hover.s];
        const sum = series.reduce((a, x) => a + Math.max(0, row.parts[x.key] || 0), 0) || 1;
        return <Tip x={hover.x} y={hover.y}><div className="font-bold">{row.label}</div><div className="num">{s.label}: {fmt(row.parts[s.key] || 0)} · {(((row.parts[s.key] || 0) / sum) * 100).toFixed(1)}%</div></Tip>;
      })()}
    </div>
  );
}

/** Pareto: share-of-spend bars with the cumulative share as a line, both in % (one axis). */
export function Pareto({ rows, fmt, height = 200, onPick }: { rows: { key: string; label: string; cy: number; cum: number }[]; fmt: (v: number) => string; height?: number; onPick?: (k: string) => void }) {
  const [hover, setHover] = useState<Hover>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const total = rows.reduce((s, r) => s + r.cy, 0) || 1;
  const shown = rows.slice(0, 20);
  const h = height - 24;
  const w = 100 / Math.max(1, shown.length);
  const points = shown.map((r, i) => `${(i + 0.5) * w},${h - (r.cum / 100) * h}`).join(' ');
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between pb-6 text-right text-[10px] text-faint" style={{ height }}>
        <span>100%</span><span>50%</span><span>0%</span>
      </div>
      <div ref={setBox} className="relative min-w-0 flex-1" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height: h }} role="img" aria-label="Share of spend by brand with cumulative share">
          <line x1="0" x2="100" y1={h * 0.2} y2={h * 0.2} stroke="rgb(var(--bad))" strokeDasharray="1.5 1.5" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2="100" y1={h / 2} y2={h / 2} stroke="rgb(var(--line))" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          {shown.map((r, i) => {
            const bh = (r.cy / total) * h;
            return <rect key={r.key} x={i * w + w * 0.18} width={w * 0.64} y={h - bh} height={bh} rx={0.6} fill={SERIES[0]} opacity={hover && hover.i !== i ? 0.45 : 1} />;
          })}
          <polyline points={points} fill="none" stroke="rgb(var(--s3))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {shown.map((r, i) => (
            <rect key={`hit${r.key}`} x={i * w} width={w} y={0} height={h} fill="transparent" onMouseMove={(e) => setHover({ i, ...at(e, box) })} onClick={() => onPick?.(r.key)} style={{ cursor: onPick ? 'pointer' : 'default' }} />
          ))}
        </svg>
        <div className="flex pt-1">
          {shown.map((r) => <span key={r.key} className="flex-1 truncate px-px text-center text-[9px] text-faint" title={r.label}>{r.label.split(' ')[0]}</span>)}
        </div>
        {hover && shown[hover.i] && (
          <Tip x={hover.x} y={hover.y}>
            <div className="font-bold">{shown[hover.i].label}</div>
            <div className="num">{fmt(shown[hover.i].cy)} · {((shown[hover.i].cy / total) * 100).toFixed(1)}% of spend</div>
            <div className="num text-white/80">Cumulative {shown[hover.i].cum.toFixed(1)}%</div>
          </Tip>
        )}
        <div className="mt-2"><Legend items={[{ label: 'Share of spend', color: SERIES[0] }, { label: 'Cumulative share', color: 'rgb(var(--s3))' }, { label: '80% line', color: 'rgb(var(--bad))' }]} /></div>
      </div>
    </div>
  );
}

/** Utilisation meter: actual against budget, 100 % marker, over-run in the warning colour. */
export function Meter({ value, budget, label }: { value: number; budget: number; label?: string }) {
  const p = budget ? (value / budget) * 100 : 0;
  const tone = p > 110 ? 'bg-bad' : p > 100 ? 'bg-warn' : 'bg-good';
  const scale = Math.max(120, p);
  return (
    <div title={label}>
      <div className="relative h-2.5 rounded-full bg-sunken">
        <span className={cx('absolute inset-y-0 left-0 rounded-full', tone)} style={{ width: `${Math.min(100, (p / scale) * 100)}%` }} />
        <span aria-hidden className="absolute -inset-y-1 w-0.5 rounded bg-ink/60" style={{ left: `${(100 / scale) * 100}%` }} />
      </div>
    </div>
  );
}
