'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { YMD } from '@/lib/format';
import type { FailureItem, Tone } from '@/lib/types';

const VARIANT = { primary: 'btn-primary', secondary: 'btn-secondary', danger: 'btn-danger', success: 'btn-success' } as const;

export function Button({ variant = 'secondary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT }) {
  return <button type="button" className={`btn ${VARIANT[variant]} ${className}`} {...rest} />;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white/55 px-3 py-2 ring-1 ring-white/80 shadow-[inset_0_1px_0_#fff]" role="toolbar">{children}</div>;
}

export function TextField({ id, label, value, onChange, placeholder, error, width = 'w-32', disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string; width?: string; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex items-center gap-1.5 text-xs text-sap-muted">
      <span className="font-semibold">{label}</span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} disabled={disabled} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : undefined}
        className={`field h-7 font-mono text-sap-ink ${error ? '!border-red-500' : ''} ${width}`} />
      {error && <span id={`${id}-err`} className="text-2xs text-red-600">{error}</span>}
    </label>
  );
}

export function TabPanelHeader({ title, hint, count }: { title: string; hint: string; count?: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
      <h2 className="font-display text-base font-bold tracking-tight text-sap-ink">{title}{count !== undefined && <span className="ml-2 inline-flex rounded-full bg-gradient-to-r from-plum/10 to-teal-500/10 px-2.5 py-0.5 align-middle font-sans text-2xs font-bold text-plum ring-1 ring-plum/15">{count.toLocaleString('en-IN')} row(s)</span>}</h2>
      <p className="text-xs text-sap-muted">{hint}</p>
    </div>
  );
}

/** A list that could not be loaded: what happened in plain words, a retry, and SAP's own text for the SAP team. */
export function LoadError({ error, onRetry, busy }: { error: { message: string; sapSide?: boolean; detail?: string; status?: number } | null; onRetry: () => void; busy?: boolean }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-3 flex flex-wrap items-start gap-3 rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50/95 to-rose-50/80 px-4 py-3 text-xs text-red-800 shadow-[0_8px_24px_-12px_rgba(220,38,38,0.35)] backdrop-blur">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{error.sapSide ? 'SAP error - the list could not be loaded' : 'The list could not be loaded'}</p>
        <p className="mt-0.5">{error.message}</p>
        {error.detail && <p className="mt-1 break-words font-mono text-2xs text-red-700/80">SAP message{error.status ? ` (HTTP ${error.status})` : ''}: {error.detail}</p>}
      </div>
      <Button onClick={onRetry} disabled={busy}>Try again</Button>
    </div>
  );
}

/** What every tab gets from the shell. */
export interface TabProps {
  active: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  showMessage: (text: string, tone: Tone) => void;
  setFailures: (items: FailureItem[]) => void;
  /** Top-bar validity (YYYYMMDD or blank). */
  vfrom: string;
  vto: string;
  /** SAP system the backend is connected to (NGQ, NGD, NWP) */
  system?: string;
}

/** '' when the date is blank or YYYYMMDD. */
export const dateError = (v: string) => (v && !YMD.test(v) ? 'YYYYMMDD' : '');

/** Send for Approval: both dates required and valid. Returns the message or ''. */
export function requiredDatesError(vfrom: string, vto: string): string {
  if (!vfrom || !vto) return 'Valid From and Valid To are required for Send for Approval.';
  if (dateError(vfrom) || dateError(vto)) return 'Valid From and Valid To must be dates in YYYYMMDD format.';
  if (vfrom > vto) return 'Valid From is after Valid To.';
  return '';
}

/** Approve / Approve Simulation: blank keeps the stored dates; filled must be valid. */
export function optionalDatesError(vfrom: string, vto: string): string {
  if (dateError(vfrom) || dateError(vto)) return 'Valid From and Valid To must be dates in YYYYMMDD format (or blank to keep the stored dates).';
  if (vfrom && vto && vfrom > vto) return 'Valid From is after Valid To.';
  return '';
}
