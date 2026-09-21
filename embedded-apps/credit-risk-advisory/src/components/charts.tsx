'use client';

import React from 'react';

/** Donut chart — prototype-style: 22px stroke, 150px, percentage center label. */
export function Donut({ slices }: { slices: Array<{ label: string; value: number; color: string }> }) {
  const total = slices.reduce((s, sl) => s + Math.max(0, sl.value), 0) || 1;
  const r = (150 - 22) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices
    .filter((sl) => sl.value > 0)
    .map((sl) => {
      const len = (Math.max(0, sl.value) / total) * c;
      const arc = (
        <circle
          key={sl.label}
          cx={75}
          cy={75}
          r={r}
          fill="none"
          stroke={sl.color}
          strokeWidth={22}
          strokeDasharray={`${len} ${c - len}`}
          strokeDashoffset={-offset}
          transform={`rotate(-90 ${75} ${75})`}
        />
      );
      offset += len;
      return arc;
    });

  const pct = Math.round((1 - Math.max(0, slices.find((s) => s.label === 'Low')?.value ?? 0) / total) * 100);

  return (
    <div className="center">
      <svg className="chart chart-donut" width="150" height="150" viewBox="0 0 150 150">
        {arcs}
        <text x={75} y={75} dy="0.35em" fontSize="14" fontWeight="700" fill="#172033">
          {pct}%
        </text>
      </svg>
    </div>
  );
}

/** Horizontal bar chart — prototype-style: viewBox 0 0 580 250, axis at y=205, grid lines at 40+i*55. */
export function Bars({
  items,
  color,
}: {
  items: Array<{ label: string; value: number; color?: string }>;
  color?: string;
}) {
  const max = Math.max(...items.map((it) => it.value), 1) * 1.15;
  const totalWidth = 420;
  const n = items.length;
  const barWidth = Math.min(55, totalWidth / n);
  const xStep = 520 / n;

  const bars = items.map((it, i) => {
    const h = (175 * it.value) / max;
    const x = 48 + i * xStep;
    const y = 205 - h;
    const fill = it.color ?? color ?? '#1769e0';
    return (
      <g key={it.label} style={{ cursor: 'pointer' }}>
        <rect x={x} y={y} width={barWidth} height={h} rx={5} fill={fill}>
          <title>{`${it.label}: ${it.value}`}</title>
        </rect>
        <text x={x + barWidth / 2} y={y - 7} textAnchor="middle" fontSize="10" fill="#617083">
          {it.value}
        </text>
        <text x={x + barWidth / 2} y={225} textAnchor="middle" fontSize="9" fill="#617083">
          {it.label}
        </text>
      </g>
    );
  });

  return (
    <svg className="chart" viewBox="0 0 580 250">
      <line className="axis" x1="35" y1="205" x2="560" y2="205" />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} className="grid" x1="35" y1={40 + i * 55} x2="560" y2={40 + i * 55} />
      ))}
      {bars}
    </svg>
  );
}

/** Line/area chart — prototype-style: viewBox 0 0 570 250, grid at 45+i*50, actual + optional target. */
export function AreaChart({
  actual,
  target,
  labels,
}: {
  actual: number[];
  target?: number[];
  labels: string[];
}) {
  const all = actual.concat(target ?? []);
  const min = Math.min(...all) - 3;
  const max = Math.max(...all) + 3;
  const n = actual.length;
  const pts = (v: number[]) => v.map((val, i) => `${45 + (i * 500) / (n - 1 || 1)},${205 - ((val - min) * 160) / (max - min)}`).join(' ');

  const actualPts = pts(actual);
  const targetPts = target ? pts(target) : undefined;

  const circles = actual.map((_, i) => {
    const x = 45 + (i * 500) / (n - 1 || 1);
    const y = 205 - ((actual[i] - min) * 160) / (max - min);
    return (
      <g key={i}>
        <circle cx={x} cy={y} r="4" fill="#16875d">
          <title>{`${labels[i]}: ${actual[i]}%`}</title>
        </circle>
        <text x={x} y={228} textAnchor="middle" fontSize="9" fill="#617083">
          {labels[i]}
        </text>
      </g>
    );
  });

  return (
    <svg className="chart" viewBox="0 0 570 250">
      {[0, 1, 2, 3].map((i) => (
        <line key={i} className="grid" x1="35" y1={45 + i * 50} x2="550" y2={45 + i * 50} />
      ))}
      <polyline points={actualPts} fill="none" stroke="#16875d" strokeWidth="3" />
      {targetPts && <polyline points={targetPts} fill="none" stroke="#1769e0" strokeWidth="2" strokeDasharray="6 4" />}
      {circles}
    </svg>
  );
}

/** Grid heatmap — prototype-style: dynamic opacity based on value. */
export function Heatmap({ cells }: { cells: Array<{ label: string; value: number; note?: string }> }) {
  const max = Math.max(...cells.map((c) => c.value), 1);
  return (
    <div className="grid3 heat-grid">
      {cells.map((cell) => {
        const opacity = (cell.value / max) * 0.9 + 0.08;
        return (
          <div key={cell.label} className="heat" style={{ background: `rgba(199,54,43,${opacity.toFixed(2)})` }} title={`${cell.label}: ${cell.value}`}>
            <b>{cell.label}</b>
            <small>{cell.note ?? cell.value}</small>
          </div>
        );
      })}
    </div>
  );
}
