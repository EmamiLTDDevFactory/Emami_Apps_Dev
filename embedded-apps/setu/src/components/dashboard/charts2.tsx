'use client';
/**
 * Dashboard chart primitives (pure SVG / CSS, no chart library).
 *
 * Colour roles, mapped onto the app's Tailwind tokens:
 * - one series            -> accent
 * - categorical (sources) -> CAT, fixed order, validated (adjacent CVD dE >= 9.1, normal-vision >= 19.6 on #fff);
 *                            slots 3-5 sit below 3:1 on white, so every categorical chart carries a value legend.
 * - created vs resolved   -> CAT[1] orange / CAT[2] aqua (validated pair)
 * - severity              -> Fatal bad / Serious amber / Normal accent. The app's own `warn` token is almost the same
 *                            colour as `bad` (dE 6 normal vision, 2 deutan), so stacked severity marks use amber instead.
 * - magnitude (heat grid) -> accent, light -> dark
 * - status (gauges)       -> good / warn / bad, always with an icon + word.
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { fmtNum } from '@/lib/format';
import type { Severity } from '@/lib/types';
import { cx } from '../ui';

export const ACCENT = 'rgb(var(--accent))';
export const SURFACE = 'rgb(var(--panel))';
export const GRID = 'rgb(var(--line))';
export const CAT = ['rgb(var(--accent))', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#2a78d6'];
export const OTHER = 'rgb(var(--faint) / 0.55)';
export const CREATED = '#eb6834';
export const RESOLVED = '#1baf7a';
export const SEVERITIES: Severity[] = ['FATAL', 'SERIOUS', 'NORMAL'];
export const SEV_COLOR: Record<Severity, string> = { FATAL: 'rgb(var(--bad))', SERIOUS: '#eda100', NORMAL: 'rgb(var(--accent))' };
/** Same, as Tailwind classes (literal strings so the JIT keeps them). */
export const SEV_CLASS: Record<Severity, string> = { FATAL: 'bg-bad', SERIOUS: 'bg-[#eda100]', NORMAL: 'bg-accent' };

/** 1,284 / 12.9K - for axis ticks. */
export const fmtCompact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K` : fmtNum(n));
export const pctOrDash = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);

/** Clean integer ticks from 0 to just above max (3-4 of them). */
export function niceTicks(max: number, count = 3): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10);
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** Width of an element, kept current with a ResizeObserver. */
export function useWidth<E extends HTMLElement = HTMLDivElement>(): [(el: E | null) => void, number, E | null] {
  const [el, setEl] = useState<E | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return;
    setW(Math.floor(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setW(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w, el];
}

/** Enter / Space on a non-button mark (SVG path, grid cell) acts as a click. */
export function pressable(onPick?: () => void, label?: string) {
  if (!onPick) return { 'aria-label': label };
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: onPick,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); }
    },
  };
}

// ---------- tooltip ----------

type TipPos<T> = { item: T; x: number; y: number } | null;

/**
 * One tooltip per chart box. `bind(item)` gives a mark pointer + focus handlers, so keyboard focus shows the same
 * readout as hover. The tooltip is clamped inside the box.
 */
export function useTip<T>() {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<TipPos<T>>(null);
  const clear = () => setTip(null);
  const bind = (item: T) => ({
    onMouseMove: (e: React.MouseEvent) => {
      const r = box?.getBoundingClientRect();
      setTip({ item, x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) });
    },
    onMouseLeave: clear,
    onFocus: (e: React.FocusEvent<Element>) => {
      const r = box?.getBoundingClientRect();
      const m = e.currentTarget.getBoundingClientRect();
      setTip({ item, x: m.left + m.width / 2 - (r?.left ?? 0), y: m.top - (r?.top ?? 0) });
    },
    onBlur: clear,
  });
  return { box, setBox, tip, setTip, bind, clear };
}

export function Tip({ x, y, box, children }: { x: number; y: number; box: HTMLElement | null; children: ReactNode }) {
  const w = box?.clientWidth ?? 0;
  const left = w ? Math.min(Math.max(x, 70), Math.max(70, w - 70)) : x;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-20 min-w-[7rem] -translate-x-1/2 -translate-y-full rounded-lg bg-plum-deep px-2.5 py-1.5 text-2xs text-white shadow-pop"
      style={{ left, top: y - 10 }}
    >
      {children}
    </div>
  );
}

/** Tooltip row: value first (strong), series name after, keyed by a short line in the series colour. */
export function TipRow({ color, label, value }: { color?: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {color && <span aria-hidden className="h-[3px] w-3 rounded-full" style={{ background: color }} />}
      <span className="num font-bold">{value}</span>
      <span className="text-white/70">{label}</span>
    </div>
  );
}

// ---------- legend ----------

export function Legend({ items, className }: { items: { label: string; color: string; shape?: 'rect' | 'line' }[]; className?: string }) {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted', className)}>
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={i.shape === 'line' ? 'h-[2px] w-3.5 rounded-full' : 'h-2.5 w-2.5 rounded-[3px]'} style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

// ---------- ring gauge ----------

export type Health = 'good' | 'warn' | 'bad' | 'none';
export const health = (v: number | null | undefined): Health => (v === null || v === undefined ? 'none' : v >= 90 ? 'good' : v >= 75 ? 'warn' : 'bad');
export const HEALTH_COLOR: Record<Health, string> = { good: 'rgb(var(--good))', warn: 'rgb(var(--warn))', bad: 'rgb(var(--bad))', none: 'rgb(var(--faint))' };
export const HEALTH_TRACK: Record<Health, string> = { good: 'rgb(var(--good) / 0.14)', warn: 'rgb(var(--warn) / 0.14)', bad: 'rgb(var(--bad) / 0.14)', none: 'rgb(var(--line))' };

/** Ring meter for a percentage: fill carries the health colour, the track is a light step of the same hue. */
export function RingGauge({ value, size = 92, stroke = 9, label }: { value: number | null; size?: number; stroke?: number; label: string }) {
  const h = health(value);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${pctOrDash(value)}`}>
        <title>{`${label}: ${pctOrDash(value)}`}</title>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={HEALTH_TRACK[h]} strokeWidth={stroke} />
        {value !== null && v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={HEALTH_COLOR[h]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700"
          />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-extrabold tracking-tight">
        {value === null ? <span className="text-faint">—</span> : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

// ---------- donut ----------

export interface Slice { key: string; label: string; value: number; color: string; onPick?: () => void }

/** Part-to-whole for <= 6 slices, 2px surface gaps between segments, total in the middle. */
export function Donut({ slices, size = 150, thickness = 20, centre, unit }: { slices: Slice[]; size?: number; thickness?: number; centre: ReactNode; unit: string }) {
  const t = useTip<Slice>();
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = size / 2;
  const r0 = R - thickness;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 2 : 0; // px of surface between segments
  let a = -Math.PI / 2;
  const arcs = slices.filter((s) => s.value > 0).map((s) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const start = a;
    a += sweep;
    return { s, start, end: a };
  });
  const pt = (rad: number, ang: number) => [R + rad * Math.cos(ang), R + rad * Math.sin(ang)];
  const path = (start: number, end: number) => {
    // Trim each end by half the gap (as an angle at each radius) so the gap stays a constant 2px wide.
    const so = gap / 2 / R, si = gap / 2 / r0;
    const full = end - start >= Math.PI * 2 - 1e-6;
    if (full) {
      return `M ${R} ${R - R} A ${R} ${R} 0 1 1 ${R - 0.01} ${R - R} Z M ${R} ${R - r0} A ${r0} ${r0} 0 1 0 ${R + 0.01} ${R - r0} Z`;
    }
    const [x1, y1] = pt(R, start + so), [x2, y2] = pt(R, end - so);
    const [x3, y3] = pt(r0, end - si), [x4, y4] = pt(r0, start + si);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r0} ${r0} 0 ${large} 0 ${x4} ${y4} Z`;
  };
  return (
    <div ref={t.setBox} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="group" aria-label={`${fmtNum(total)} ${unit}`} fillRule="evenodd">
        {total === 0 && <circle cx={R} cy={R} r={R - thickness / 2} fill="none" stroke={GRID} strokeWidth={thickness} />}
        {arcs.map(({ s, start, end }) => (
          <path
            key={s.key}
            d={path(start, end)}
            fill={s.color}
            className={cx('outline-none motion-safe:transition-opacity', s.onPick && 'cursor-pointer', t.tip && t.tip.item.key !== s.key && 'opacity-40')}
            {...pressable(s.onPick, `${s.label}: ${fmtNum(s.value)} ${unit}`)}
            {...t.bind(s)}
          >
            <title>{`${s.label}: ${fmtNum(s.value)} ${unit}`}</title>
          </path>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{centre}</div>
      {t.tip && (
        <Tip x={t.tip.x} y={t.tip.y} box={t.box}>
          <div className="font-bold">{t.tip.item.label}</div>
          <TipRow value={fmtNum(t.tip.item.value)} label={`${unit} · ${total ? Math.round((t.tip.item.value * 100) / total) : 0}%`} />
        </Tip>
      )}
    </div>
  );
}

// ---------- treemap ----------

export interface Rect { x: number; y: number; w: number; h: number }

/** Squarified treemap layout (Bruls et al.) of positive values into a W x H box, biggest first. */
export function squarify<T extends { value: number }>(items: T[], W: number, H: number): (T & Rect)[] {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  if (!total || W <= 0 || H <= 0) return [];
  const scale = (W * H) / total;
  const nodes = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value).map((item) => ({ item, area: item.value * scale }));
  const out: (T & Rect)[] = [];
  let x = 0, y = 0, w = W, h = H;
  const sum = (r: typeof nodes) => r.reduce((s, n) => s + n.area, 0);
  const worst = (r: typeof nodes, side: number) => {
    const s = sum(r);
    const max = Math.max(...r.map((n) => n.area));
    const min = Math.min(...r.map((n) => n.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const place = (r: typeof nodes) => {
    const s = sum(r);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const n of r) { const nh = n.area / cw; out.push({ ...n.item, x, y: cy, w: cw, h: nh }); cy += nh; }
      x += cw; w -= cw;
    } else {
      const rh = s / w;
      let cx0 = x;
      for (const n of r) { const nw = n.area / rh; out.push({ ...n.item, x: cx0, y, w: nw, h: rh }); cx0 += nw; }
      y += rh; h -= rh;
    }
  };
  let row: typeof nodes = [];
  for (const n of nodes) {
    const side = Math.min(w, h);
    if (row.length === 0 || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else { place(row); row = [n]; }
  }
  if (row.length) place(row);
  return out;
}

// ---------- heat scale ----------

/** Five-step accent ramp (light -> dark); label ink flips to white on the two darkest steps. */
export const HEAT = [0.08, 0.2, 0.36, 0.58, 0.82];
export function heatStep(n: number, max: number): number {
  if (n <= 0 || max <= 0) return -1;
  return Math.min(HEAT.length - 1, Math.floor((n / max) * HEAT.length - 1e-9));
}

/** Small "fewer -> more" key for a sequential scale. */
export function HeatKey({ max }: { max: number }) {
  return (
    <div className="flex items-center gap-1.5 text-2xs text-muted" aria-hidden>
      <span>Fewer</span>
      {HEAT.map((a) => <span key={a} className="h-2.5 w-4 rounded-[3px]" style={{ background: `rgb(var(--accent) / ${a})` }} />)}
      <span>More{max > 0 ? ` (${fmtNum(max)})` : ''}</span>
    </div>
  );
}

/** Rounded-top column path (square at the baseline). */
export function colPath(x: number, y: number, w: number, h: number, r = 2) {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M ${x} ${y + h} V ${y + rr} Q ${x} ${y} ${x + rr} ${y} H ${x + w - rr} Q ${x + w} ${y} ${x + w} ${y + rr} V ${y + h} Z`;
}

/** Segmented control for a small set of choices (period pickers). */
export function Segmented<T extends string | number>({ value, options, onChange, label, format }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string; format?: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-sunken p-0.5 ring-1 ring-inset ring-line">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={cx('num rounded-md px-2 py-1 text-2xs font-bold transition-colors', o === value ? 'bg-panel text-accent shadow-card ring-1 ring-line' : 'text-muted hover:text-ink')}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}
