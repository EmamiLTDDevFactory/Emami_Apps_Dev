'use client';
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Row, Tone } from '@/lib/types';

const VARIANT = { primary: 'btn-primary', secondary: 'btn-secondary', danger: 'btn-danger', success: 'btn-success' } as const;
export function Button({ variant = 'secondary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT }) {
  return <button type="button" className={`btn ${VARIANT[variant]} ${className}`} {...rest} />;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl bg-sap-head/70 px-3 py-2 ring-1 ring-sap-line" role="toolbar">{children}</div>;
}

export function Header({ title, hint, right }: { title: string; hint: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base font-bold tracking-tight text-sap-ink">{title}</h2>
        <p className="text-xs text-sap-muted">{hint}</p>
      </div>
      {right}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wide text-sap-muted">
      <span>{label}</span>
      {children}
      {hint && <span className="font-normal normal-case tracking-normal">{hint}</span>}
    </label>
  );
}

export function Input({ value, onChange, className = 'w-36', ...rest }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; type?: string; disabled?: boolean; 'aria-label'?: string; list?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={`field text-sap-ink ${className}`} {...rest} />;
}

export function Select({ value, onChange, options, className = 'w-40', disabled, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; disabled?: boolean; label?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`field text-sap-ink ${className}`} disabled={disabled} aria-label={label}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const KPI_TONE = { plum: 'from-indigo-500 to-violet-500', green: 'from-emerald-500 to-teal-500', red: 'from-rose-500 to-red-500', amber: 'from-amber-400 to-orange-500', slate: 'from-slate-400 to-slate-500' } as const;
export function Kpi({ label, value, sub, tone = 'plum', onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof KPI_TONE; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`glass relative overflow-hidden rounded-2xl px-4 py-3 text-left ${onClick ? 'transition hover:-translate-y-0.5 hover:shadow-glow' : ''}`}>
      <span className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${KPI_TONE[tone]}`} aria-hidden="true" />
      <p className="text-2xs font-bold uppercase tracking-wider text-sap-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-sap-ink">{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-sap-muted">{sub}</p>}
    </Tag>
  );
}

export function Chip({ children, cls = 'bg-plum-soft text-plum ring-plum/20', title }: { children: ReactNode; cls?: string; title?: string }) {
  return <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-bold ring-1 ${cls}`}>{children}</span>;
}

export const TONE_CHIP: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  mute: 'bg-gray-100 text-gray-600 ring-gray-200',
};

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-3 flex flex-wrap items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
      <p className="min-w-0 flex-1">{error}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={`mb-3 rounded-2xl border px-4 py-2.5 text-xs ${tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-indigo-100 bg-indigo-50/60 text-indigo-900'}`}>{children}</div>;
}

export interface Col {
  key: string;
  label: string;
  num?: boolean;
  render?: (r: Row) => ReactNode;
  /** value used for sorting / searching when render is set */
  value?: (r: Row) => string | number;
}

/** Sortable, searchable table with optional selection. */
export function Table({ cols, rows, rowKey, loading, empty = 'Nothing to show.', selected, onToggle, onToggleAll, selectable, maxHeight = '62vh', search = true, onRowClick, activeKey }: {
  cols: Col[]; rows: Row[]; rowKey: (r: Row) => string; loading?: boolean; empty?: string;
  selected?: Set<string>; onToggle?: (k: string) => void; onToggleAll?: (keys: string[], on: boolean) => void; selectable?: (r: Row) => boolean;
  maxHeight?: string; search?: boolean; onRowClick?: (r: Row) => void; activeKey?: string;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const val = (c: Col, r: Row) => (c.value ? c.value(r) : r[c.key]);
  const shown = useMemo(() => {
    let out = rows;
    const t = q.trim().toLowerCase();
    if (t) out = out.filter((r) => cols.some((c) => String(val(c, r) ?? '').toLowerCase().includes(t)));
    if (sort) {
      const c = cols.find((x) => x.key === sort.key);
      if (c) out = [...out].sort((a, b) => {
        const x = val(c, a), y = val(c, b);
        const nx = Number(x), ny = Number(y);
        const cmp = c.num && Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : String(x ?? '').localeCompare(String(y ?? ''));
        return cmp * sort.dir;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort, cols]);
  const selectableKeys = selected ? shown.filter((r) => !selectable || selectable(r)).map(rowKey) : [];
  const allOn = selectableKeys.length > 0 && selectableKeys.every((k) => selected!.has(k));
  const th = 'sticky top-0 z-10 whitespace-nowrap px-2.5 py-2 text-left text-2xs font-bold uppercase tracking-wider';
  const td = 'whitespace-nowrap border-b border-sap-line/70 px-2.5 py-1.5';

  return (
    <div>
      {search && rows.length > 8 && (
        <div className="mb-2 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in this list" aria-label="Search in this list" className="field w-64" />
          <span className="text-2xs text-sap-muted">{shown.length.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')}</span>
        </div>
      )}
      {loading && !rows.length ? (
        <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-sap-line" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-5 animate-pulse rounded bg-sap-head" />)}
        </div>
      ) : !rows.length ? (
        <div className="rounded-2xl border border-dashed border-sap-line bg-white px-4 py-10 text-center text-sm text-sap-muted">{empty}</div>
      ) : (
        <div className="scroll-glass overflow-auto rounded-2xl bg-white ring-1 ring-sap-line" style={{ maxHeight }}>
          <table className="glass-table min-w-full border-separate border-spacing-0 text-xs text-sap-ink">
            <thead>
              <tr>
                {selected && (
                  <th className={`${th} w-8`}><input type="checkbox" className="h-3.5 w-3.5 accent-plum" checked={allOn} onChange={() => onToggleAll?.(selectableKeys, !allOn)} aria-label="Select all" /></th>
                )}
                {cols.map((c) => (
                  <th key={c.key} className={`${th} ${c.num ? 'text-right' : ''}`} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                    <button type="button" className="uppercase" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                      {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const k = rowKey(r);
                const can = !selectable || selectable(r);
                return (
                  <tr key={`${k}#${i}`} onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={`${activeKey === k ? '!bg-indigo-100' : selected?.has(k) ? 'bg-indigo-50' : i % 2 ? 'bg-sap-row' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}>
                    {selected && (
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="h-3.5 w-3.5 accent-plum" disabled={!can} checked={selected.has(k)} onChange={() => onToggle?.(k)} aria-label={`Select ${k}`} />
                      </td>
                    )}
                    {cols.map((c) => <td key={c.key} className={`${td} ${c.num ? 'text-right tabular-nums' : ''}`}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Selection state for a Table. */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return {
    selected,
    toggle: (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }),
    toggleAll: (keys: string[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const k of keys) if (on) n.add(k); else n.delete(k); return n; }),
    clear: () => setSelected(new Set()),
  };
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/35 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`glass-strong fade-up flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl ${wide ? 'max-w-4xl' : 'max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-sap-line bg-sap-head px-5 py-3">
          <h2 className="flex-1 font-display text-sm font-bold text-sap-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded px-2 text-sap-muted hover:text-sap-ink" aria-label="Close">✕</button>
        </div>
        <div className="scroll-glass min-h-0 flex-1 overflow-auto px-5 py-4 text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-sap-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** What every screen gets from the shell. */
export interface ScreenProps {
  active: boolean;
  canWrite: boolean;
  notify: (text: string, tone: Tone) => void;
  go: (screen: string, arg?: string | number) => void;
  /** set by go(screen, arg): e.g. the PO id to open */
  arg?: string | number;
}

export type { Tone };
