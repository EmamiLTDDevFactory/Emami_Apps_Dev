'use client';
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { sourceLabel } from '@/lib/rates/sourceLabel';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// Explicit class map: Tailwind purges dynamically built class names.
const BTN: Record<string, string> = {
  primary: 'bg-gradient-to-br from-accent to-accent-deep text-accent-ink border-transparent shadow-sm hover:-translate-y-px hover:shadow-glow',
  secondary: 'bg-panel text-ink border-line hover:border-accent/40 hover:bg-sunken',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-sunken',
  danger: 'bg-panel text-bad border-bad/60 hover:bg-bad/10',
};
const SIZE: Record<string, string> = { sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg', md: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl' };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; size?: 'sm' | 'md' }>(
  function Button({ variant = 'secondary', size = 'md', className, ...p }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...p}
        className={cx('inline-flex items-center justify-center border font-semibold whitespace-nowrap transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none', BTN[variant], SIZE[size], className)}
      />
    );
  },
);

export function Card({ title, actions, children, className, bodyClass }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-panel shadow-card transition-shadow duration-300 hover:shadow-cardHover', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h3 className="text-sm font-bold">{title}</h3>
          <div className="flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={cx('p-3', bodyClass)}>{children}</div>
    </section>
  );
}

const SRC_VAR: Record<string, string> = { CONTRACT: 'contract', INFOREC: 'inforec', MARKT: 'markt', CONSUMP: 'consump', MBEW: 'mbew' };
export const sourceColorVar = (src: string) => `var(--src-${SRC_VAR[src] ?? 'none'})`;

/** Rate source badge: coloured swatch + text label (identity never by colour alone). */
export function SourceBadge({ source, sim }: { source: string; sim?: boolean }) {
  const label = source ? sourceLabel(source) : 'NO RATE';
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded px-1.5 py-px text-2xs font-semibold tracking-wide', sim && 'ring-1 ring-sim')}
      style={{ background: `color-mix(in srgb, ${sourceColorVar(source)} 16%, transparent)` }}
      title={sim ? `${label} (simulated pick)` : label}
    >
      <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: sourceColorVar(source) }} />
      {label}
    </span>
  );
}

export function SimTag({ className }: { className?: string }) {
  return <span className={cx('rounded bg-sim/15 px-1 text-[10px] font-bold uppercase tracking-wider text-sim', className)} title="Simulated in the browser - not an SAP figure">sim</span>;
}

export function Pill({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'sim'; title?: string }) {
  const t = { neutral: 'bg-sunken text-muted', good: 'bg-good/15 text-good', warn: 'bg-warn/15 text-warn', bad: 'bg-bad/15 text-bad', accent: 'bg-accent/15 text-accent', sim: 'bg-sim/15 text-sim' }[tone];
  return <span title={title} className={cx('inline-flex items-center rounded px-1.5 py-px text-2xs font-semibold', t)}>{children}</span>;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-bold text-muted">{label}</label>
      {children(id)}
      {error ? <p className="text-2xs text-bad" role="alert">{error}</p> : hint ? <p className="text-2xs text-faint">{hint}</p> : null}
    </div>
  );
}

/** Size-free input styling; inputCls adds the default size. Pass inputBase + your own h-/w- to
 * avoid two conflicting width classes. */
export const inputBase = 'rounded-xl border border-line bg-panel px-3 text-sm text-ink transition-colors placeholder:text-faint hover:border-accent/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15';
export const inputCls = `h-9 w-full ${inputBase}`;

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 shrink-0 rounded-full border transition', checked ? 'border-accent bg-gradient-to-r from-accent to-accent-deep shadow-glow' : 'border-line bg-line')}
      >
        <span className={cx('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode; badge?: ReactNode }[]; value: T; onChange: (t: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-panel p-1 shadow-card">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!d) return;
            const n = (i + d + tabs.length) % tabs.length;
            onChange(tabs[n].id);
            refs.current[n]?.focus();
          }}
          className={cx('flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-semibold transition', value === t.id ? 'bg-gradient-to-br from-accent to-accent-deep text-accent-ink shadow-sm' : 'text-muted hover:bg-sunken hover:text-ink')}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}

export function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-6 rounded" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
      ))}
    </div>
  );
}

export function Empty({ title, children, icon = '∅' }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex animate-pageIn flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div aria-hidden className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent/10 to-sim/10 text-2xl text-accent/70 shadow-card">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Side drawer with Esc to close and focus moved in/back. */
export function Drawer({ open, onClose, title, children, width = 720, trapFocus = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; /** keep Tab inside the drawer (default off: the other drawers behave as before) */ trapFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !trapFocus || !ref.current) return;
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!f.length) return e.preventDefault();
      const first = f[0];
      const last = f[f.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose, trapFocus]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end no-print" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'}>
      <div className="absolute inset-0 animate-fadeIn bg-plum-deep/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative flex h-full w-full animate-slideIn flex-col border-l border-line bg-panel shadow-2xl outline-none" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">{title}</div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
        </div>
        <div className="scroll-thin flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fadeIn bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative w-full max-w-lg animate-slideUp rounded-2xl border border-line bg-panel shadow-pop outline-none">
        <div className="border-b border-line px-4 py-3 text-sm font-bold">{title}</div>
        <div className="max-h-[70vh] overflow-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone, sim, title }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad'; sim?: boolean; title?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel px-4 py-3 shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-cardHover" title={title}>
      <span aria-hidden className="pointer-events-none absolute -right-7 -top-9 h-24 w-24 rounded-full bg-accent/[0.08] blur-2xl" />
      <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-muted">
        {label}
        {sim && <SimTag />}
      </div>
      <div className={cx('num mt-1 text-2xl font-extrabold tracking-tight', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad', sim && 'sim-val')}>{value}</div>
      {sub && <div className="num mt-0.5 text-2xs text-muted">{sub}</div>}
    </div>
  );
}

/** Segmented choice (radio group) - the selection card's stylised toggle. */
export function Segmented<T extends string | number | boolean>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; hint?: string }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 whitespace-nowrap rounded-lg font-semibold transition',
            size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-[13px]',
            value === o.value ? 'bg-panel text-accent shadow-card ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
