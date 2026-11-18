'use client';

import type { ReactNode } from 'react';

export const Spinner = ({ className = '' }: { className?: string }) => (
  <div className={`flex justify-center py-10 ${className}`}>
    <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
  </div>
);

/** Titled card, one per group of the Web Dynpro screen ("Request Details", "Employee Details", ...). */
export function Section({ title, note, right, children }: { title: string; note?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="glass-card mb-3 p-3 sm:p-4">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[13px] font-extrabold text-ink">{title}</h2>
        {note && <span className="text-[11.5px] font-semibold text-inkSoft">{note}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** Read-only value with its label. */
export function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="field-label">{label}</div>
      <div className="mt-0.5 break-words text-[13px] font-semibold text-ink">{value === '' || value === null || value === undefined ? '-' : value}</div>
    </div>
  );
}

/** Label + control (+ red border via `bad` on the control, message below is shown by the form banner). */
export function Field({ label, required, children, htmlFor }: { label: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-red">*</span>}
      </label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export const inputCls = (bad?: boolean) => `input ${bad ? '!border-red !ring-1 !ring-red' : ''} disabled:bg-appBg disabled:text-inkSoft`;
export const selectCls = (bad?: boolean) => `select ${bad ? '!border-red !ring-1 !ring-red' : ''} disabled:bg-appBg disabled:text-inkSoft`;

export const grid = 'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3';

/** Table with horizontal scroll on narrow screens. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-border bg-white">{children}</div>;
}
export const th = 'whitespace-nowrap px-2.5 py-2 text-left text-[10.5px] font-bold uppercase tracking-wide text-inkSoft';
export const td = 'px-2.5 py-1.5 text-[12.5px] text-ink';
export const tdNum = `${td} text-right tabular-nums`;

export function ConfirmDialog({
  title, message, confirmLabel, busy, onConfirm, onCancel,
}: { title: string; message: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plumDeep/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="glass-panel w-full max-w-sm p-4">
        <p className="text-[14px] font-extrabold text-ink">{title}</p>
        <p className="mt-1.5 text-[12.5px] text-inkSoft">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost !px-3 !py-1.5 text-[12.5px]">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn-danger !px-3 !py-1.5 text-[12.5px]">{busy ? 'Working...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
