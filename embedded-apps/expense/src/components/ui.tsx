'use client';

// The app's compact UI kit, adapted from payment-tracking's own (same structure every Next.js
// sibling embedded app uses) with this app's own brand color (#005A9E blue, taken directly from
// the current Expo app's styling) instead of payment-tracking's rust/ledger accent.

import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, X, type LucideIcon } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------------------------------------------------------------- layout ---------------- */

export function PageHeader({ eyebrow, title, subtitle, icon: Icon, actions }: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brandLight to-brand text-white shadow-lift">
            <Icon size={17} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="text-2xs font-bold uppercase tracking-[0.12em] text-brand">{eyebrow}</p>}
          <h1 className="truncate text-[17px] font-extrabold leading-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-inkSoft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, accent, padded = true }: { children: React.ReactNode; className?: string; accent?: boolean; padded?: boolean }) {
  return <div className={cx(accent ? 'card-accent' : 'card', padded && 'p-3', className)}>{children}</div>;
}

export function CardTitle({ icon: Icon, title, hint, actions }: { icon?: LucideIcon; title: React.ReactNode; hint?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {Icon && <Icon size={14} className="shrink-0 text-brand" />}
        <h3 className="truncate text-sm font-bold text-ink">{title}</h3>
        {hint && <span className="truncate text-xs text-inkSoft">{hint}</span>}
      </div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- buttons --------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const BUTTON_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger', success: 'btn-success',
};

export function Button({ variant = 'secondary', size, icon: Icon, loading, children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm';
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <button type="button" className={cx(BUTTON_CLASS[variant], size === 'sm' && 'btn-sm', className)} disabled={rest.disabled || loading} {...rest}>
      {loading ? <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 12 : 14} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, onClick, className, disabled }: { icon: LucideIcon; label: string; onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cx('inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg text-inkSoft transition-colors hover:bg-appBg hover:text-ink disabled:opacity-40', className)}>
      <Icon size={15} />
    </button>
  );
}

/* ---------------------------------------------------------------- chips ----------------- */

export type Tone = 'neutral' | 'brand' | 'green' | 'red' | 'amber' | 'blue';
const TONE: Record<Tone, string> = {
  neutral: 'bg-appBg text-inkSoft',
  brand: 'bg-brand/10 text-brand',
  green: 'bg-greenBg text-green',
  red: 'bg-redBg text-red',
  amber: 'bg-amberBg text-amber',
  blue: 'bg-blueBg text-blue',
};

export function Chip({ tone = 'neutral', icon: Icon, children, className, style, onClick }: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) {
  const content = (
    <>
      {Icon && <Icon size={10} />}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx('chip', TONE[tone], 'cursor-pointer transition-opacity hover:opacity-80', className)} style={style}>
        {content}
      </button>
    );
  }
  return (
    <span className={cx('chip', TONE[tone], className)} style={style}>
      {content}
    </span>
  );
}

/** Segmented tabs, e.g. Pending / History. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-white p-0.5" role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={cx('flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors', on ? 'bg-brand text-white shadow-sm' : 'text-inkSoft hover:text-ink')}>
            {o.label}
            {o.count != null && <span className={cx('rounded-full px-1.5 text-2xs font-bold', on ? 'bg-white/20' : 'bg-appBg')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- form ------------------ */

export function Field({ label, hint, error, required, children, className }: { label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      {label && <span className="label">{label}{required && <span className="text-red"> *</span>}</span>}
      {children}
      {error ? <p className="mt-0.5 text-xs font-semibold text-red">{error}</p> : hint ? <p className="mt-0.5 text-xs text-inkSoft">{hint}</p> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />;
});

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input', className)} rows={rest.rows ?? 3} {...rest} />;
}

export function Select({ value, onChange, options, className, ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cx('input cursor-pointer pr-7', className)} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** YYYY-MM-DD date input (same string format ClaimContext/the SAP payload expect). */
export function DateField({ value, onChange, label, min, max, disabled, className }: { value: string; onChange: (v: string) => void; label: string; min?: string; max?: string; disabled?: boolean; className?: string }) {
  return <input type="date" aria-label={label} value={value} min={min} max={max} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cx('input', className)} />;
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-1.5 text-sm text-ink', disabled && 'cursor-not-allowed opacity-50')}>
      <input type="checkbox" className="h-[14px] w-[14px] cursor-pointer rounded accent-brand" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Yes / No toggle pair (e.g. GSTIN Available). */
export function YesNo({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border bg-white p-0.5">
      {[true, false].map((v) => (
        <button key={String(v)} type="button" disabled={disabled} onClick={() => onChange(v)}
          className={cx('h-[30px] flex-1 rounded-md px-3 text-sm font-bold transition-colors disabled:opacity-50', value === v ? 'bg-brand text-white' : 'text-inkSoft hover:text-ink')}>
          {v ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- feedback -------------- */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx('animate-spin text-brand', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm text-inkSoft">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, children }: { icon?: LucideIcon; title: string; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl2 border border-dashed border-border bg-white/60 px-4 py-10 text-center">
      {Icon && <Icon size={24} className="text-inkFaint" />}
      <p className="text-sm font-bold text-ink">{title}</p>
      {hint && <p className="max-w-md text-xs text-inkSoft">{hint}</p>}
      {children}
    </div>
  );
}

export function Banner({ type, children, onClose }: { type: 'success' | 'error' | 'info' | 'warn'; children: React.ReactNode; onClose?: () => void }) {
  const s = {
    success: ['border-green/25 bg-greenBg text-green', CheckCircle2],
    error: ['border-red/25 bg-redBg text-red', AlertCircle],
    warn: ['border-amber/25 bg-amberBg text-amber', AlertCircle],
    info: ['border-blue/25 bg-blueBg text-blue', Info],
  } as const;
  const [cls, Icon] = s[type];
  return (
    <div className={cx('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium animate-slideUp', cls)} role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={15} className="mt-[1px] shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- modal ----------------- */

export function Modal({ open = true, title, subtitle, onClose, children, footer, size = 'md' }: {
  open?: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-6xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-[2px] animate-fadeIn" onClick={onClose}>
      <div role="dialog" aria-modal="true" className={cx('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-pop animate-slideUp', w)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-extrabold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-inkSoft">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-1.5 -mt-1" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-cream/50 px-4 py-2.5">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Styled replacement for the browser's native alert()/confirm(). One shared shape for both:
 * - Alert (info/success/error, single "OK" button): pass no `cancelLabel`.
 * - Confirm (Yes/No decision): pass `cancelLabel` and `onConfirm` — the dialog stays open and lets
 *   the caller decide when to close it (e.g. after an async action finishes), matching how the
 *   native confirm()'s callers used to gate on the boolean return value before proceeding.
 */
export type MessageModalState = {
  title: string;
  message: React.ReactNode;
  type?: 'info' | 'success' | 'error';
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
} | null;

export function MessageModal({ state, onClose }: { state: MessageModalState; onClose: () => void }) {
  if (!state) return null;
  const { title, message, type = 'info', onConfirm, confirmLabel = 'OK', cancelLabel } = state;
  const ICONS = { info: Info, success: CheckCircle2, error: AlertCircle } as const;
  const COLORS = { info: 'text-blue', success: 'text-green', error: 'text-red' } as const;
  const Icon = ICONS[type];
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          {cancelLabel && <Button variant="secondary" onClick={onClose}>{cancelLabel}</Button>}
          <Button variant={type === 'error' ? 'danger' : 'primary'} onClick={() => { onConfirm?.(); if (!cancelLabel) onClose(); }}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-2.5">
        <Icon size={20} className={cx('mt-0.5 shrink-0', COLORS[type])} />
        <p className="text-sm text-inkSoft">{message}</p>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- data display ---------- */

export function InfoField({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <p className="text-2xs font-bold uppercase tracking-[0.06em] text-inkFaint">{label}</p>
      <p className="mt-[1px] truncate text-sm font-semibold text-ink" title={typeof value === 'string' ? value : undefined}>{value || value === 0 ? value : '—'}</p>
    </div>
  );
}
