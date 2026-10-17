'use client';
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronRight, X, type LucideIcon } from 'lucide-react';
import { nameFromEmail } from '@/lib/hub';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// Explicit class map: Tailwind purges dynamically built class names.
const BTN: Record<string, string> = {
  primary: 'bg-gradient-to-br from-accent to-accent-deep text-accent-ink border-transparent shadow-sm hover:shadow-md',
  secondary: 'bg-panel text-ink border-line hover:bg-sunken',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-sunken',
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

export function Card({ title, sub, actions, children, className, bodyClass }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-panel shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            {sub && <p className="text-2xs text-muted">{sub}</p>}
          </div>
          <div className="flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={cx('p-4', bodyClass)}>{children}</div>
    </section>
  );
}

export function Pill({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'; title?: string }) {
  const t = { neutral: 'bg-sunken text-muted', good: 'bg-good/15 text-good', warn: 'bg-warn/15 text-warn', bad: 'bg-bad/15 text-bad', accent: 'bg-accent/15 text-accent' }[tone];
  return <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px text-2xs font-semibold', t)}>{children}</span>;
}

// Initials avatar; hue picked from the email so a person keeps one colour everywhere.
const AVATAR = ['#4F3FD6', '#2a78d6', '#1f7a4d', '#b45309', '#c2185b', '#0e7490', '#7c3aed', '#be123c'];
export function Avatar({ email, name, size = 32 }: { email: string; name?: string | null; size?: number }) {
  const label = name || nameFromEmail(email);
  // Words that start with a letter or digit only, so "Animesh (Admin)" gives "AA", not "A(".
  const initials = label.split(/\s+/).map((p) => p.replace(/^[^\p{L}\p{N}]+/u, '')).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR[h % AVATAR.length] }}>
      {initials || '?'}
    </span>
  );
}

export function Person({ email, name, sub }: { email: string; name?: string | null; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar email={email} name={name} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold">{name || nameFromEmail(email)}</div>
        <div className="truncate text-2xs text-muted">{sub ?? email}</div>
      </div>
    </div>
  );
}

export function Kpi({ label, value, sub, icon: Icon, tone = 'accent', onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone?: 'accent' | 'good' | 'warn' | 'bad'; onClick?: () => void }) {
  const t = { accent: 'bg-accent/10 text-accent', good: 'bg-good/10 text-good', warn: 'bg-warn/10 text-warn', bad: 'bg-bad/10 text-bad' }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cx('group relative flex w-full items-start gap-3 rounded-2xl border border-line bg-panel p-4 text-left shadow-card transition', onClick && 'hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-cardHover')}
    >
      {onClick && <ChevronRight size={16} aria-hidden className="absolute right-3 top-3 text-faint transition group-hover:translate-x-0.5 group-hover:text-accent" />}
      <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', t)}><Icon size={19} /></span>
      <div className="min-w-0">
        <div className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</div>
        <div className="num mt-0.5 text-2xl font-extrabold tracking-tight">{value}</div>
        {sub && <div className="num mt-0.5 truncate text-2xs text-muted">{sub}</div>}
      </div>
    </Tag>
  );
}

export const inputBase = 'rounded-xl border border-line bg-panel px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15';
export const inputCls = `h-9 w-full ${inputBase}`;

export function Select({ value, onChange, options, label, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cx('h-9', inputBase, 'pr-8', className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-6 rounded" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
      ))}
    </div>
  );
}

export function Empty({ title, children, icon: Icon }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon && <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-faint"><Icon size={22} /></span>}
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Side drawer with Esc to close and focus moved in/back. */
export function Drawer({ open, onClose, title, children, width = 640 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[data-drawer]');
      if (e.key === 'Escape' && dialogs[dialogs.length - 1]?.contains(ref.current)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div data-drawer className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'}>
      <div className="absolute inset-0 bg-plum-deep/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative flex h-full w-full animate-slideIn flex-col border-l border-line bg-bg shadow-2xl outline-none" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-3 border-b border-line bg-panel px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X size={16} /></Button>
        </div>
        <div className="scroll-thin flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition', value === t.id ? 'bg-panel text-accent shadow-card ring-1 ring-line' : 'text-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const textareaCls = `w-full py-2 ${inputBase}`;

/** Label + control + optional hint, used by every form. */
export function Field({ label, required, hint, children, className }: { label: ReactNode; required?: boolean; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-2xs font-bold uppercase tracking-wide text-muted">
        {label}{required && <span className="text-bad"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-faint">{hint}</span>}
    </label>
  );
}

/** Inline banner for an error or a confirmation. */
export function Notice({ tone = 'bad', children, onClose }: { tone?: 'bad' | 'good' | 'warn'; children: ReactNode; onClose?: () => void }) {
  const t = { bad: 'border-bad/30 bg-bad/10 text-bad', good: 'border-good/30 bg-good/10 text-good', warn: 'border-warn/30 bg-warn/10 text-warn' }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium', t)}>
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>}
    </div>
  );
}

/** Centered dialog (Esc / backdrop closes). */
export function Modal({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-plum-deep/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full animate-slideUp flex-col rounded-2xl border border-line bg-panel shadow-pop" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-bold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X size={16} /></Button>
        </div>
        <div className="scroll-thin overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}

/** Small plain table shell with sticky header. */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx('scroll-thin overflow-x-auto', className)}>
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-2xs uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-bold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
