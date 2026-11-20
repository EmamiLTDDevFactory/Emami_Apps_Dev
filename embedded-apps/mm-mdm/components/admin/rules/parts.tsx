'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { AdminApiError } from '@/lib/admin/adminApi';
import { IconAlert, IconCheck } from '../../icons';

/** Confirmation pop-up (the old app asked "Do you want to continue ?" before every delete) */
export function ConfirmDialog({ title, children, confirmText, danger, busy, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmText: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="overlay overlay-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="rl-dlg-title">
        <h2 id="rl-dlg-title">{title}</h2>
        <div className="muted">{children}</div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" ref={ref} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/** What went wrong, in SAP's own words (one line per message) */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as Partial<AdminApiError> & Error;
  const lines = e.messages && e.messages.length ? e.messages.map((m) => m.message) : [e.message || 'Something went wrong.'];
  return (
    <div className="alert alert-error rl-msg" role="alert">
      <IconAlert size={16} />
      <div>{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
    </div>
  );
}

export function OkBox({ text }: { text: string }) {
  if (!text) return null;
  return <div className="alert alert-info rl-msg" role="status"><IconCheck size={16} /><div><p>{text}</p></div></div>;
}

/** Index of the row an SAP message points at ("items[3].datele" -> 3) */
export function targetRow(error: unknown): number {
  const e = error as Partial<AdminApiError> | null;
  const t = e?.messages?.find((m) => m.target && /^items\[\d+\]/.test(m.target))?.target;
  const m = t ? /^items\[(\d+)\]/.exec(t) : null;
  return m ? Number(m[1]) : -1;
}

export const pad3 = (n: number) => String(n).padStart(3, '0');
