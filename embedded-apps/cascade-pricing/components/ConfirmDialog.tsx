'use client';
import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Yes', cancelLabel = 'No', onConfirm, onCancel }: ConfirmDialogProps) {
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    noRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" className="w-full max-w-sm rounded-md border border-sap-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="border-b border-sap-line bg-sap-head px-4 py-2 text-sm font-semibold text-sap-ink">{title}</h2>
        <p id="confirm-msg" className="px-4 py-4 text-sm text-sap-ink">{message}</p>
        <div className="flex justify-end gap-2 border-t border-sap-line px-4 py-2.5">
          <button ref={noRef} type="button" onClick={onCancel} className="rounded border border-sap-line bg-white px-3 py-1 text-xs font-semibold text-sap-ink hover:bg-sap-head">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
