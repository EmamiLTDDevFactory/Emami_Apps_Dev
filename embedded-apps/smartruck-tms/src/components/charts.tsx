'use client';

import React from 'react';

export const PALETTE = ['#4F3FD6', '#1F7A4D', '#B45309', '#1D6FA5', '#0F766E', '#C0392B', '#8B5CF6', '#64748B'];

export function Gauge({ value, label, color = '#4F3FD6', suffix = '%' }: { value: number; label: string; color?: string; suffix?: string }) {
  const v = Math.max(0, Math.min(100, value)); const R = 38, C = Math.PI * R;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 58" className="w-full max-w-[130px]">
        <path d="M12 50 A38 38 0 0 1 88 50" fill="none" stroke="#E6E3F5" strokeWidth="9" strokeLinecap="round" />
        <path d="M12 50 A38 38 0 0 1 88 50" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} />
        <text x="50" y="48" textAnchor="middle" className="fill-ink" style={{ fontSize: 17, fontWeight: 800 }}>{Math.round(value)}{suffix}</text>
      </svg>
      <div className="-mt-1 text-center text-[11px] font-bold text-inkSoft">{label}</div>
    </div>
  );
}

export function Bars({ data, height = 170, fmt = (n: number) => String(n), color = '#4F3FD6' }: { data: { label: string; value: number }[]; height?: number; fmt?: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value)); const w = 100 / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 100 ${height / 4}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height / 4 - 9);
        return (
          <g key={d.label}>
            <rect x={i * w + w * 0.2} y={height / 4 - 6 - h} width={w * 0.6} height={Math.max(0.3, h)} rx="0.8" fill={color} opacity={0.9}><title>{`${d.label}: ${fmt(d.value)}`}</title></rect>
            <text x={i * w + w / 2} y={height / 4 - 1.2} textAnchor="middle" style={{ fontSize: 2.6 }} className="fill-inkSoft">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1; let acc = 0; const R = 15.9;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-32 w-32 shrink-0 -rotate-90">
        <circle cx="21" cy="21" r={R} fill="none" stroke="#EEF0F4" strokeWidth="6" />
        {data.map((d, i) => { const pct = (d.value / total) * 100; const el = <circle key={d.label} cx="21" cy="21" r={R} fill="none" stroke={d.color ?? PALETTE[i % PALETTE.length]} strokeWidth="6" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acc}><title>{`${d.label}: ${d.value}`}</title></circle>; acc += pct; return el; })}
      </svg>
      <ul className="min-w-0 space-y-1 text-xs">
        {data.map((d, i) => <li key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} /><span className="truncate font-semibold text-ink">{d.label}</span><span className="text-inkSoft">{d.value}</span></li>)}
      </ul>
    </div>
  );
}

export function Funnel({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-xs font-bold text-inkSoft">{d.label}</div>
          <div className="h-5 flex-1 rounded-md bg-appBg"><div className="flex h-5 items-center justify-end rounded-md px-2 text-[11px] font-bold text-white" style={{ width: `${Math.max(6, (d.value / max) * 100)}%`, background: PALETTE[i % 2 === 0 ? 0 : 3], opacity: 1 - i * 0.05 }}>{d.value}</div></div>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = '#4F3FD6' }: { values: number[]; color?: string }) {
  const max = Math.max(...values), min = Math.min(...values); const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / (max - min || 1)) * 24}`).join(' ');
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></svg>;
}
