'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { YMD } from '@/lib/format';
import type { FailureItem, Tone } from '@/lib/types';

const VARIANT = {
  primary: 'border-plum bg-plum text-white hover:bg-plum-deep',
  secondary: 'border-sap-line bg-white text-sap-ink hover:bg-sap-head',
  danger: 'border-red-300 bg-white text-red-700 hover:bg-red-50',
  success: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
} as const;

export function Button({ variant = 'secondary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT }) {
  return <button type="button" className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`} {...rest} />;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-sap-line bg-white px-3 py-2" role="toolbar">{children}</div>;
}

export function TextField({ id, label, value, onChange, placeholder, error, width = 'w-32', disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string; width?: string; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex items-center gap-1.5 text-xs text-sap-muted">
      <span className="font-semibold">{label}</span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} disabled={disabled} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : undefined}
        className={`h-7 rounded border bg-white px-2 font-mono text-xs text-sap-ink focus:outline-none focus:ring-2 focus:ring-plum/25 ${error ? 'border-red-500' : 'border-sap-line focus:border-plum'} ${width}`} />
      {error && <span id={`${id}-err`} className="text-2xs text-red-600">{error}</span>}
    </label>
  );
}

export function TabPanelHeader({ title, hint, count }: { title: string; hint: string; count?: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 px-3 pt-3">
      <h2 className="text-sm font-semibold text-sap-ink">{title}{count !== undefined && <span className="ml-2 rounded-full bg-sap-head px-2 py-0.5 text-2xs font-semibold text-sap-muted">{count} row(s)</span>}</h2>
      <p className="text-xs text-sap-muted">{hint}</p>
    </div>
  );
}

/** A list that could not be loaded: what happened in plain words, a retry, and SAP's own text for the SAP team. */
export function LoadError({ error, onRetry, busy }: { error: { message: string; sapSide?: boolean; detail?: string; status?: number } | null; onRetry: () => void; busy?: boolean }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-3 flex flex-wrap items-start gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
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
