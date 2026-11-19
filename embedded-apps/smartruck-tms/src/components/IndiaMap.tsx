'use client';

import React from 'react';
import type { Loc, Shipment } from '../lib/types';

// Coarse India outline (lon,lat) — schematic only, enough to place cities and moving vehicles.
const OUTLINE: [number, number][] = [
  [68.2, 23.7], [70.0, 20.9], [72.8, 21.0], [72.9, 18.5], [73.9, 15.5], [74.9, 12.9], [76.3, 9.3], [77.5, 8.1], [78.9, 9.2], [80.2, 13.1], [80.2, 15.6],
  [82.3, 16.9], [84.8, 19.2], [86.9, 21.4], [88.9, 21.7], [89.1, 26.0], [92.0, 25.3], [94.8, 27.0], [97.2, 28.2], [95.3, 29.3], [92.0, 27.8],
  [88.9, 27.5], [84.0, 28.7], [81.0, 30.2], [79.0, 31.4], [78.8, 34.5], [75.5, 36.8], [74.0, 34.5], [74.6, 32.4], [75.5, 30.9], [73.2, 29.5], [71.2, 27.8], [70.2, 25.7],
];
const W = 640, Hh = 640, minLon = 67, maxLon = 98, minLat = 7, maxLat = 37.5;
export const project = (lat: number, lon: number): [number, number] => [((lon - minLon) / (maxLon - minLon)) * W, Hh - ((lat - minLat) / (maxLat - minLat)) * Hh];

export default function IndiaMap({ locs, shipments, selected, onSelect, showRoutes = true }: {
  locs: Loc[]; shipments: Shipment[]; selected?: string; onSelect?: (sin: string) => void; showRoutes?: boolean;
}) {
  const L = (id: string) => locs.find((l) => l.id === id)!;
  shipments = shipments.filter((s) => locs.some((l) => l.id === s.fromLocId) && locs.some((l) => l.id === s.toLocId));
  const path = OUTLINE.map(([lo, la], i) => `${i ? 'L' : 'M'}${project(la, lo).join(' ')}`).join(' ') + 'Z';
  const color = (s: Shipment) => s.anomaly ? '#C0392B' : s.delayH > 8 ? '#B45309' : s.delayH > 0 ? '#E0A100' : '#1F7A4D';
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="h-full w-full rounded-xl bg-[#EAF1F8]" role="img" aria-label="Live fleet map">
      <path d={path} fill="#F6F4FD" stroke="#C9C3EA" strokeWidth="2" />
      {locs.map((l) => { const [x, y] = project(l.lat, l.lon); return <g key={l.id}><circle cx={x} cy={y} r="3.5" fill="#6B7280" /><text x={x + 6} y={y + 3} style={{ fontSize: 10 }} className="fill-inkSoft font-semibold">{l.city}</text></g>; })}
      {showRoutes && shipments.map((s) => { const a = project(L(s.fromLocId).lat, L(s.fromLocId).lon), b = project(L(s.toLocId).lat, L(s.toLocId).lon);
        return <line key={`r${s.sin}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={selected === s.sin ? '#4F3FD6' : '#B8B2DE'} strokeWidth={selected === s.sin ? 2.5 : 1} strokeDasharray="4 4" opacity={selected && selected !== s.sin ? 0.25 : 0.7} />; })}
      {shipments.map((s) => {
        const a = L(s.fromLocId), b = L(s.toLocId);
        const [x, y] = s.pos ? project(s.pos.lat, s.pos.lon) : project(a.lat + (b.lat - a.lat) * s.progress, a.lon + (b.lon - a.lon) * s.progress);
        const sel = selected === s.sin;
        return (
          <g key={s.sin} onClick={() => onSelect?.(s.sin)} style={{ cursor: 'pointer' }}>
            {sel && <circle cx={x} cy={y} r="14" fill="#4F3FD6" opacity="0.18"><animate attributeName="r" values="8;16;8" dur="1.6s" repeatCount="indefinite" /></circle>}
            <circle cx={x} cy={y} r={sel ? 7 : 5} fill={color(s)} stroke="#fff" strokeWidth="2"><title>{`${s.sin} · ${s.vehicleNo} · ${s.driver}`}</title></circle>
          </g>
        );
      })}
    </svg>
  );
}
