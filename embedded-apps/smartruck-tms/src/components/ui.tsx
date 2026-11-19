'use client';

import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const fmtDT = (s: string | number) => new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtD = (s: string | number) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const TONES: Record<string, string> = {
  green: 'bg-greenBg text-green', red: 'bg-redBg text-red', amber: 'bg-amberBg text-amber', blue: 'bg-blueBg text-blue', teal: 'bg-tealBg text-teal', gray: 'bg-appBg text-inkSoft', violet: 'bg-rust/10 text-rust',
};
export function Pill({ tone = 'gray', children }: { tone?: keyof typeof TONES | string; children: React.ReactNode }) {
  return <span className={`pill ${TONES[tone] ?? TONES.gray}`}>{children}</span>;
}
export const statusTone = (s: string) => ({
  Completed: 'green', Fulfilled: 'green', Paid: 'green', Approved: 'green', Granted: 'green', Verified: 'green', Active: 'green', Awarded: 'green', Posted: 'green',
  'In Transit': 'blue', 'At Delivery': 'blue', 'At Pickup': 'teal', 'Towards Pickup': 'teal', Assigned: 'violet', Accepted: 'violet', Requested: 'amber', Open: 'amber', Pending: 'amber', Uploaded: 'blue',
  'Pending (Logistics)': 'amber', 'Pending (Finance)': 'amber', Billed: 'blue', 'Ready For Payment': 'teal', Draft: 'gray', Passive: 'amber',
  Cancelled: 'red', Rejected: 'red', Disapproved: 'red', Declined: 'red', Expired: 'red', 'Non-Tracking': 'red', 'No GPS': 'gray',
} as Record<string, string>)[s] ?? 'gray';
export const StatusPill = ({ s }: { s: string }) => <Pill tone={statusTone(s)}>{s}</Pill>;

export function Card({ title, right, children, className = '', pad = true }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><h3 className="section-title">{title}</h3>{right}</header>}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-extrabold text-ink">{title}</h1>{sub && <p className="hint mt-0.5">{sub}</p>}</div>
      <div className="flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}

export function Kpi({ label, value, sub, tone = 'violet', onClick }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; onClick?: () => void }) {
  const bar = { violet: 'bg-rust', green: 'bg-green', red: 'bg-red', amber: 'bg-amber', blue: 'bg-blue', teal: 'bg-teal' }[tone] ?? 'bg-rust';
  return (
    <button onClick={onClick} disabled={!onClick} className={`card relative overflow-hidden p-4 text-left ${onClick ? 'transition hover:shadow-cardHover' : 'cursor-default'}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="text-[11px] font-bold uppercase tracking-wide text-inkSoft">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-ink">{value}</div>
      {sub && <div className="hint mt-0.5">{sub}</div>}
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, counts }: { tabs: readonly T[]; value: T; onChange: (t: T) => void; counts?: Partial<Record<T, number>> }) {
  return (
    <div className="mb-3 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className={`whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-bold transition-colors ${value === t ? 'border-rust text-rust' : 'border-transparent text-inkSoft hover:text-ink'}`}>
          {t}{counts?.[t] !== undefined && <span className="ml-1.5 rounded-full bg-appBg px-1.5 py-0.5 text-[10px] text-inkSoft">{counts[t]}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plumDeep/50 p-3 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`flex max-h-[92vh] w-full flex-col rounded-2xl bg-white shadow-pop animate-slideUp ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5"><h3 className="text-base font-extrabold">{title}</h3><button onClick={onClose} aria-label="Close" className="text-inkSoft hover:text-ink"><X size={20} /></button></header>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="field-label">{label}</span>{children}</label>;
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-inkSoft">{k}</div><div className="mt-0.5 break-words text-sm font-semibold text-ink">{v || '—'}</div></div>;
}

export function RowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className="rounded-lg p-1.5 text-inkSoft hover:bg-appBg" aria-label="Actions"><MoreVertical size={16} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-pop">
            {items.map((it) => (
              <button key={it.label} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }} className={`block w-full px-3.5 py-2 text-left text-[13px] font-semibold hover:bg-appBg disabled:opacity-40 ${it.danger ? 'text-red' : 'text-ink'}`}>{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export interface Col<T> { h: string; r: (row: T) => React.ReactNode; w?: string; align?: 'right' }
export function Table<T>({ rows, cols, rowKey: key, onRow, page = 12, empty = 'Nothing to show', selectable }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; onRow?: (r: T) => void; page?: number; empty?: string;
  selectable?: { selected: string[]; onChange: (ids: string[]) => void };
}) {
  const [p, setP] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / page));
  const cur = Math.min(p, pages - 1);
  const slice = rows.slice(cur * page, cur * page + page);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-inkSoft">
            {selectable && <th className="w-8 px-3 py-2.5"><input type="checkbox" checked={slice.length > 0 && slice.every((r) => selectable.selected.includes(key(r)))} onChange={(e) => selectable.onChange(e.target.checked ? Array.from(new Set([...selectable.selected, ...slice.map(key)])) : selectable.selected.filter((x) => !slice.map(key).includes(x)))} /></th>}
            {cols.map((c) => <th key={c.h} className={`whitespace-nowrap px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`} style={{ width: c.w }}>{c.h}</th>)}
          </tr></thead>
          <tbody>
            {slice.map((r) => (
              <tr key={key(r)} onClick={() => onRow?.(r)} className={`border-b border-border/60 ${onRow ? 'cursor-pointer hover:bg-cream' : ''}`}>
                {selectable && <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectable.selected.includes(key(r))} onChange={(e) => selectable.onChange(e.target.checked ? [...selectable.selected, key(r)] : selectable.selected.filter((x) => x !== key(r)))} /></td>}
                {cols.map((c) => <td key={c.h} className={`px-3 py-2.5 align-top ${c.align === 'right' ? 'text-right' : ''}`}>{c.r(r)}</td>)}
              </tr>
            ))}
            {slice.length === 0 && <tr><td colSpan={cols.length + (selectable ? 1 : 0)} className="px-3 py-10 text-center text-inkSoft">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 text-xs text-inkSoft">
        <span>{rows.length.toLocaleString('en-IN')} rows</span>
        <div className="flex items-center gap-2">
          <button disabled={cur === 0} onClick={() => setP(cur - 1)} className="rounded-lg border border-border p-1 disabled:opacity-40"><ChevronLeft size={14} /></button>
          <span>Page {cur + 1} of {pages}</span>
          <button disabled={cur >= pages - 1} onClick={() => setP(cur + 1)} className="rounded-lg border border-border p-1 disabled:opacity-40"><ChevronRight size={14} /></button>
        </div>
      </div>
    </div>
  );
}

export function Timeline({ items }: { items: { at: string; actor: string; text: string }[] }) {
  return (
    <ol className="relative ml-2 border-l-2 border-border pl-5">
      {[...items].reverse().map((a, i) => (
        <li key={i} className="relative pb-4 last:pb-0"><span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-rust" />
          <div className="text-sm font-semibold text-ink">{a.text}</div><div className="hint">{a.actor} · {fmtDT(a.at)}</div></li>
      ))}
    </ol>
  );
}

export function ProgressSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${i <= current ? 'bg-rust text-white' : 'bg-appBg text-inkSoft'}`}>{s}</div>
          {i < steps.length - 1 && <div className={`h-0.5 w-3 shrink-0 ${i < current ? 'bg-rust' : 'bg-border'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}
