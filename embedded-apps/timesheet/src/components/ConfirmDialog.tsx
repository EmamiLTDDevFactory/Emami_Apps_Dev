'use client';

import { useEffect } from 'react';

// A styled stand-in for window.confirm() - used where a plain browser confirm feels too
// throwaway for what's being confirmed (e.g. permanently deleting an employee and all their
// data). `danger` swaps the confirm button to red for destructive actions.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" aria-label="Close dialog" onClick={() => !busy && onCancel()} className="fixed inset-0 bg-plumDeep/50 backdrop-blur-sm" />
      <div role="alertdialog" aria-modal="true" aria-label={title} className="glass-panel relative w-full max-w-sm p-6">
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-inkSoft">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} autoFocus className={danger ? 'btn-danger' : 'btn-primary'}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
