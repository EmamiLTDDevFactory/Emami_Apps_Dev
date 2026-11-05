'use client';
import { useState, type KeyboardEvent } from 'react';
import { fmtNum } from '@/lib/format';
import type { Overview } from '@/lib/types';
import { ACCENT, CREATED, GRID, Legend, RESOLVED, SURFACE, Tip, TipRow, colPath, fmtCompact, niceTicks, useWidth } from './charts2';

type Day = Overview['backlog'][number];

export const fmtDay = (day: string, withWeekday = false) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withWeekday ? { weekday: 'short' } : {}) });

/**
 * Backlog trend as two panels on one shared time axis (never two y-scales on one plot):
 * open at day end (area + 2px line) above, created vs resolved per day (paired columns) below.
 * One crosshair spans both; the tooltip lists all three values. Arrow keys move it when the chart has focus.
 */
export function BacklogChart({ rows, onPickDay }: { rows: Day[]; onPickDay?: (day: string) => void }) {
  const [ref, w, boxEl] = useWidth<HTMLDivElement>();
  const [idx, setIdx] = useState<number | null>(null);
  const n = rows.length;
  const L = 34, R = 40, T = 8, H1 = 118, GAP = 26, H2 = 64, XB = 20;
  const top2 = T + H1 + GAP;
  const H = top2 + H2 + XB;
  const plotW = Math.max(0, w - L - R);
  const step = n ? plotW / n : 0;
  const cxAt = (i: number) => L + step * (i + 0.5);

  const t1 = niceTicks(Math.max(...rows.map((r) => r.open), 1), 3);
  const max1 = t1[t1.length - 1];
  const y1 = (v: number) => T + H1 - (v / max1) * H1;
  const t2 = niceTicks(Math.max(...rows.flatMap((r) => [r.created, r.resolved]), 1), 2);
  const max2 = t2[t2.length - 1];
  const y2 = (v: number) => top2 + H2 - (v / max2) * H2;

  const gap = step >= 9 ? 2 : 1;
  const bw = Math.max(1, Math.min(10, (step - gap - 2) / 2));
  const line = rows.map((r, i) => `${i ? 'L' : 'M'} ${cxAt(i)} ${y1(r.open)}`).join(' ');
  const area = n ? `${line} L ${cxAt(n - 1)} ${T + H1} L ${cxAt(0)} ${T + H1} Z` : '';
  const labelCount = w < 420 ? 3 : w < 700 ? 5 : 7;
  const labelIdx = n <= 1 ? [0] : Array.from(new Set(Array.from({ length: labelCount }, (_, k) => Math.round((k * (n - 1)) / (labelCount - 1)))));
  const last = rows[n - 1];

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const i = Math.floor((clientX - r.left - L) / (step || 1));
    setIdx(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (!n) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx((i) => Math.max(0, (i ?? n - 1) - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setIdx((i) => Math.min(n - 1, (i ?? n - 1) + 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setIdx(0); }
    else if (e.key === 'End') { e.preventDefault(); setIdx(n - 1); }
    else if ((e.key === 'Enter' || e.key === ' ') && idx !== null && onPickDay) { e.preventDefault(); onPickDay(rows[idx].day); }
  };
  const hov = idx !== null ? rows[idx] : null;
  const summary = n
    ? `Backlog from ${fmtDay(rows[0].day)} to ${fmtDay(last.day)}: ${fmtNum(rows[0].open)} open at the start, ${fmtNum(last.open)} now; ${fmtNum(rows.reduce((s, r) => s + r.created, 0))} created and ${fmtNum(rows.reduce((s, r) => s + r.resolved, 0))} resolved. Use the arrow keys to read each day.`
    : 'No data';

  return (
    <div>
      <div
        ref={ref}
        role="group"
        tabIndex={0}
        aria-label={summary}
        onKeyDown={onKey}
        onFocus={() => setIdx((i) => i ?? n - 1)}
        onBlur={() => setIdx(null)}
        className="relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        style={{ height: H }}
      >
        {w > 0 && n > 0 && (
          <svg width={w} height={H} aria-hidden className="block">
            {/* top panel grid + ticks */}
            {t1.map((v) => (
              <g key={`a${v}`}>
                <line x1={L} x2={w - R} y1={y1(v)} y2={y1(v)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={L - 6} y={y1(v)} dy="0.32em" textAnchor="end" className="num fill-faint text-[10px]">{fmtCompact(v)}</text>
              </g>
            ))}
            <path d={area} fill={ACCENT} fillOpacity={0.1} />
            <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* direct label at the line end */}
            <circle cx={cxAt(n - 1)} cy={y1(last.open)} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
            <text x={cxAt(n - 1) + 8} y={y1(last.open)} dy="0.32em" className="num fill-ink text-[11px] font-bold">{fmtCompact(last.open)}</text>

            {/* bottom panel */}
            <text x={L} y={top2 - 8} className="fill-muted text-[10px] font-semibold">Created vs resolved per day</text>
            {t2.map((v) => (
              <g key={`b${v}`}>
                <line x1={L} x2={w - R} y1={y2(v)} y2={y2(v)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={L - 6} y={y2(v)} dy="0.32em" textAnchor="end" className="num fill-faint text-[10px]">{fmtCompact(v)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const c = cxAt(i);
              return (
                <g key={r.day} opacity={idx !== null && idx !== i ? 0.55 : 1}>
                  <path d={colPath(c - gap / 2 - bw, y2(r.created), bw, top2 + H2 - y2(r.created), Math.min(3, bw / 2))} fill={CREATED} />
                  <path d={colPath(c + gap / 2, y2(r.resolved), bw, top2 + H2 - y2(r.resolved), Math.min(3, bw / 2))} fill={RESOLVED} />
                </g>
              );
            })}

            {/* x axis */}
            {labelIdx.map((i) => (
              <text key={i} x={cxAt(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="num fill-faint text-[10px]">
                {fmtDay(rows[i].day)}
              </text>
            ))}

            {/* crosshair */}
            {hov && idx !== null && (
              <g>
                <line x1={cxAt(idx)} x2={cxAt(idx)} y1={T} y2={top2 + H2} stroke="rgb(var(--muted))" strokeWidth={1} shapeRendering="crispEdges" />
                <circle cx={cxAt(idx)} cy={y1(hov.open)} r={4.5} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
              </g>
            )}
            {/* hit layer: the pointer only has to find the day */}
            <rect
              x={L}
              y={0}
              width={plotW}
              height={top2 + H2}
              fill="transparent"
              className={onPickDay ? 'cursor-pointer' : undefined}
              onMouseMove={(e) => pick(e.clientX, e.currentTarget.ownerSVGElement ?? e.currentTarget)}
              onMouseLeave={() => setIdx(null)}
              onClick={() => { if (idx !== null && onPickDay) onPickDay(rows[idx].day); }}
            />
          </svg>
        )}
        {hov && idx !== null && (
          <Tip x={cxAt(idx)} y={y1(hov.open)} box={boxEl}>
            <div className="mb-0.5 font-bold">{fmtDay(hov.day, true)}</div>
            <TipRow color={ACCENT} value={fmtNum(hov.open)} label="open at day end" />
            <TipRow color={CREATED} value={fmtNum(hov.created)} label="created" />
            <TipRow color={RESOLVED} value={fmtNum(hov.resolved)} label="resolved" />
          </Tip>
        )}
      </div>
      <Legend
        className="mt-2"
        items={[
          { label: 'Open at day end', color: ACCENT, shape: 'line' },
          { label: 'Created', color: CREATED },
          { label: 'Resolved', color: RESOLVED },
        ]}
      />
    </div>
  );
}

/** The same numbers as a table (the chart's accessible twin). */
export function BacklogTable({ rows }: { rows: Day[] }) {
  return (
    <div className="scroll-thin max-h-[268px] overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-panel">
          <tr className="text-left text-2xs uppercase tracking-wide text-muted">
            <th className="py-1.5 pr-3 font-bold">Day</th>
            <th className="px-2 py-1.5 text-right font-bold">Open</th>
            <th className="px-2 py-1.5 text-right font-bold">Created</th>
            <th className="py-1.5 pl-2 text-right font-bold">Resolved</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...rows].reverse().map((r) => (
            <tr key={r.day}>
              <td className="py-1 pr-3">{fmtDay(r.day, true)}</td>
              <td className="num px-2 py-1 text-right font-semibold">{fmtNum(r.open)}</td>
              <td className="num px-2 py-1 text-right">{fmtNum(r.created)}</td>
              <td className="num py-1 pl-2 text-right">{fmtNum(r.resolved)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
