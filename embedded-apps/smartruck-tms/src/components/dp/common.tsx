'use client';
import React from 'react';
import type { DpSession } from '../../lib/dp';

export interface SProps { s: DpSession; bump: () => void; toast: (m: string, kind?: 'ok' | 'err') => void }
const n0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }), n1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const f0 = (x: number | null | undefined) => (x == null || !isFinite(x) ? '' : n0.format(x));
export const f1 = (x: number | null | undefined) => (x == null || !isFinite(x) ? '' : n1.format(x));

export const STATUS_CLS: Record<string, string> = {
  full: 'bg-greenBg text-green', 'part-load': 'bg-amberBg text-amber', 'part-critical': 'bg-redBg text-red', PTL: 'bg-redBg text-red', held: 'bg-appBg text-inkSoft',
};
export const Chip = ({ status, children }: { status?: string; children: React.ReactNode }) => <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLS[status ?? ''] ?? 'bg-appBg text-inkSoft'}`}>{children}</span>;

export function Seg<T extends string | number>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return <span className="inline-flex overflow-hidden rounded-xl border border-border">{options.map(([k, n]) => <button key={String(k)} onClick={() => onChange(k)} className={`px-3 py-1.5 text-xs font-bold ${value === k ? 'bg-rust text-white' : 'bg-white text-inkSoft hover:bg-appBg'}`}>{n}</button>)}</span>;
}
export const siteOptions = (s: DpSession, list: number[], blank?: string) => <>{blank !== undefined && <option value="">{blank}</option>}{list.map((i) => <option key={i} value={i}>{s.sName(i)}</option>)}</>;
export const Th = ({ children, n }: { children?: React.ReactNode; n?: boolean }) => <th className={`sticky top-0 z-10 whitespace-nowrap border-b border-border bg-cream px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-inkSoft ${n ? 'text-right' : 'text-left'}`}>{children}</th>;
export const Td = ({ children, n, className = '', ...r }: { children?: React.ReactNode; n?: boolean; className?: string } & React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...r} className={`border-b border-border/60 px-2.5 py-1.5 align-top text-[13px] ${n ? 'text-right tabular-nums' : ''} ${className}`}>{children}</td>;
export const TableWrap = ({ children, max = '66vh' }: { children: React.ReactNode; max?: string }) => <div className="card overflow-auto" style={{ maxHeight: max }}><table className="w-full border-collapse">{children}</table></div>;
export const Bar = ({ children }: { children: React.ReactNode }) => <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-inkSoft">{children}</div>;
export const small = 'rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-rust';
