'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Yes / No dialog: focus starts on No, Escape closes it, Tab stays inside while it is open. */
export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  const noRef = useRef<HTMLButtonElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    noRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
      if (e.key !== 'Tab') return;
      const order = [noRef.current, yesRef.current].filter((x): x is HTMLButtonElement => !!x);
      const i = order.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); before?.focus(); };
  }, [open, onCancel]);
  if (!open) return null;
  // On document.body: the glass panels (backdrop-filter) would otherwise confine a fixed overlay to the panel.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/35 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" className="glass-strong fade-up w-full max-w-sm overflow-hidden rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="border-b border-plum/10 bg-gradient-to-r from-violet-50/90 to-teal-50/70 px-5 py-3 font-display text-sm font-bold text-sap-ink">{title}</h2>
        <p id="confirm-msg" className="px-5 py-4 text-sm text-sap-ink">{message}</p>
        <div className="flex justify-end gap-2 border-t border-plum/10 px-5 py-3">
          <button ref={noRef} type="button" onClick={onCancel} className="btn btn-secondary">No</button>
          <button ref={yesRef} type="button" onClick={onConfirm} className="btn bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-[0_6px_18px_-6px_rgba(225,29,72,0.6)]">Yes</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
