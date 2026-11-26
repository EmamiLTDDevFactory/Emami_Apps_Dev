'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/* Shared UI kit. Built on the classes in app/globals.css (glass, btn, field, chip, glass-table). Keep screens thin: use these. */

export function Button({ variant = 'secondary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'success' | 'danger' }) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...rest} />;
}

export function Card({ title, hint, actions, children, className = '' }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-xl ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-sap-line px-4 py-2.5">
          <div>
            {title && <h2 className="text-[13px] font-extrabold text-sap-ink">{title}</h2>}
            {hint && <p className="text-[11px] text-sap-muted">{hint}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  // The shell's banner already names the screen; this is the in-page heading row with the screen's actions (brand hairline underneath).
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {back && <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${back.href}`} className="mb-0.5 inline-block text-[11px] font-semibold text-plum hover:underline">{'←'} {back.label}</a>}
          <h2 className="font-display text-[17px] font-extrabold leading-tight text-sap-ink">{title}</h2>
          {subtitle && <p className="text-[12px] text-sap-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div aria-hidden className="brand-hairline mt-2 h-[2px] rounded-full" />
    </div>
  );
}

export function Field({ label, hint, error, children, className = '' }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-bold text-sap-muted">{label}</span>
      {children}
      {error ? <span className="text-[11px] font-semibold text-red-600">{error}</span> : hint ? <span className="text-[10.5px] text-sap-muted">{hint}</span> : null}
    </label>
  );
}
export const Input = ({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={`field ${className}`} {...p} />;
export const Select = ({ className = '', ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={`field ${className}`} {...p} />;
export const TextArea = ({ className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={`field h-auto min-h-[4.5rem] py-1.5 ${className}`} {...p} />;

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
const TONES: Record<Tone, string> = {
  neutral: 'bg-[#EEF0FB] text-sap-ink border-[#DDE2F5]',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
};
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${TONES[tone]}`}>{children}</span>;
}

export function Kpi({ label, value, foot, tone = 'neutral', onClick }: { label: string; value: ReactNode; foot?: ReactNode; tone?: Tone; onClick?: () => void }) {
  const bar = { neutral: 'border-l-[#4338CA]', info: 'border-l-blue-500', success: 'border-l-emerald-500', warning: 'border-l-amber-500', error: 'border-l-red-500' }[tone];
  return (
    <div onClick={onClick} className={`glass rounded-xl border-l-4 ${bar} px-4 py-3 ${onClick ? 'cursor-pointer transition hover:-translate-y-0.5' : ''}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-sap-muted">{label}</div>
      <div className="mt-0.5 font-display text-xl font-extrabold text-sap-ink">{value}</div>
      {foot && <div className="mt-0.5 text-[11px] text-sap-muted">{foot}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div role="status" className="flex items-center gap-2 py-6 text-[12px] text-sap-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-sap-line border-t-plum" />{label}…</div>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">
      {message}{onRetry && <button type="button" onClick={onRetry} className="ml-3 font-bold underline">Try again</button>}
    </div>
  );
}
export const Empty = ({ children }: { children: ReactNode }) => <div className="py-8 text-center text-[12px] text-sap-muted">{children}</div>;

export interface Column<T> { key: string; header: ReactNode; render?: (row: T) => ReactNode; width?: string; align?: 'left' | 'right' | 'center'; hideBelow?: 'sm' | 'md' | 'lg' }
export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty = 'Nothing to show.', loading, footer }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode; loading?: boolean; footer?: ReactNode }) {
  if (loading) return <Spinner />;
  const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
  return (
    <div className="scroll-glass overflow-x-auto">
      <table className="glass-table w-full min-w-[640px] border-separate border-spacing-0 text-[12px]">
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ width: c.width }} className={`px-3 py-2 text-${c.align ?? 'left'} text-[11px] font-bold ${c.hideBelow ? hide[c.hideBelow] : ''}`}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length}><Empty>{empty}</Empty></td></tr>}
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`border-b border-sap-line ${onRowClick ? 'cursor-pointer' : ''}`}>
              {columns.map((c) => <td key={c.key} className={`border-b border-sap-line px-3 py-2 align-middle text-${c.align ?? 'left'} ${c.hideBelow ? hide[c.hideBelow] : ''}`}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {footer}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12164A]/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className={`glass fade-up max-h-[90vh] w-full overflow-y-auto rounded-2xl shadow-pop ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <header className="flex items-center justify-between border-b border-sap-line px-5 py-3"><h2 className="font-display text-[14px] font-extrabold">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="text-lg text-sap-muted hover:text-sap-ink">{'×'}</button></header>
        <div className="p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-sap-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: ReactNode; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="mb-3 flex flex-wrap gap-1 border-b border-sap-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} type="button" onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3 py-2 text-[12px] font-bold ${value === t.id ? 'border-plum text-plum' : 'border-transparent text-sap-muted hover:text-sap-ink'}`}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-[#EEF0FB] px-1.5 py-0.5 text-[10px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---- toasts ---- */
interface Toast { id: number; tone: Tone; text: string }
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = ++seq.current;
    setItems((l) => [...l, { id, tone, text }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), tone === 'error' ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,24rem)] flex-col gap-2">
        {items.map((t) => <div key={t.id} className={`pointer-events-auto rounded-lg border px-3.5 py-2.5 text-[12px] font-semibold shadow-card ${TONES[t.tone]}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/** Run an async action once at a time; shows SAP's own message on failure. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(work: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    try { const r = await work(); if (ok) toast(ok, 'success'); return r; }
    catch (e) { toast(e instanceof Error ? e.message : 'Something went wrong.', 'error'); return undefined; }
    finally { setBusy(false); }
  }, [busy, toast]);
  return { busy, run };
}
