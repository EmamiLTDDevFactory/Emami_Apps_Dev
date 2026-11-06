'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Modal confirmation on the native <dialog> (focus trap, Escape and backdrop handled by the browser). */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onCancel }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id={titleId}>{title}</h2>
      <div className="dlg-body">{children}</div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : confirmLabel}</button>
      </div>
    </dialog>
  );
}
