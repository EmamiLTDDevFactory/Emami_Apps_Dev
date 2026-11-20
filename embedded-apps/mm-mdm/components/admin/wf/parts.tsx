'use client';

import { ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AdminApiError } from '@/lib/admin/adminApi';
import { WfItem, WfMsg, wfApi } from '@/lib/admin/wfApi';
import { IconAlert, IconCheck, IconSearch, IconX } from '../../icons';

/** Confirmation before something destructive or hard to undo (Escape cancels, focus starts on the confirm button) */
export function ConfirmDialog({ title, children, confirmText, danger, busy, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmText: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="overlay overlay-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog wf-dialog" role="alertdialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        <div className="wf-dialog-body">{children}</div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" ref={ref} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/** A dialog with its own body and actions (copy, mass copy) */
export function FormDialog({ title, children, onCancel, wide }: { title: string; children: ReactNode; onCancel: () => void; wide?: boolean }) {
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="overlay overlay-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={`dialog wf-dialog ${wide ? 'wf-dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** SAP's messages, as they came */
export function MessageBox({ error, messages, onPick }: { error?: unknown; messages?: WfMsg[]; onPick?: (target: string) => void }) {
  const list: WfMsg[] = [];
  if (error) {
    const e = error as Partial<AdminApiError> & Error;
    if (e.messages && e.messages.length) list.push(...e.messages); else list.push({ severity: 'E', message: e.message || 'Something went wrong.' });
  }
  if (messages) list.push(...messages);
  if (!list.length) return null;
  const hasErr = list.some((m) => m.severity === 'E');
  return (
    <div className={`alert ${hasErr ? 'alert-error' : 'alert-warn'} wf-msgs`} role={hasErr ? 'alert' : 'status'}>
      <ul>
        {list.map((m, i) => (
          <li key={i} className={m.severity === 'E' ? 'wf-msg-e' : 'wf-msg-w'}>
            <span className="wf-msg-sev">{m.severity === 'E' ? 'Error' : 'Warning'}</span>
            {m.target && onPick && m.target !== 'key' ? <button type="button" className="wf-link" onClick={() => onPick(m.target as string)}>{m.message}</button> : m.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OkBox({ children }: { children: ReactNode }) {
  return <div className="alert alert-info wf-ok" role="status"><IconCheck size={16} /> <span>{children}</span></div>;
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <p className="wf-errline" role="alert"><IconAlert size={14} /> {children}</p>;
}

/* ------------------------------------------------------------------ value help input ---- */

const listCache = new Map<string, WfItem[]>();
const cacheKey = (kind: string, appId: string) => `${kind}|${kind === 'VIEW' ? appId : ''}`;

/** Loads a whole (static) value list once and keeps it for the session */
export function useValueList(kind: string, appId: string, enabled = true) {
  const [items, setItems] = useState<WfItem[] | null>(() => (kind ? listCache.get(cacheKey(kind, appId)) || null : null));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!kind || !enabled) return;
    const k = cacheKey(kind, appId);
    const hit = listCache.get(k);
    if (hit) { setItems(hit); return; }
    let live = true;
    wfApi.valueHelp(kind, appId, '', 300).then((r) => { listCache.set(k, r); if (live) setItems(r); }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [kind, appId, enabled]);
  return { items, error };
}

/**
 * Field with an F4 list: a code input that suggests live values from SAP (users by id or name, other lists from their SAP tables).
 * Free text stays possible: SAP validates it on save.
 */
export function VhInput({ id, label, value, onChange, kind, appId = '', placeholder, disabled, hint, className, required, onPick, labelHidden }: {
  id: string; label: string; value: string; onChange: (v: string) => void; kind: string; appId?: string; placeholder?: string; disabled?: boolean;
  hint?: ReactNode; className?: string; required?: boolean; onPick?: (item: WfItem) => void; labelHidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<WfItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isUser = kind === 'USER';
  const { items: all } = useValueList(isUser ? '' : kind, appId, open && !isUser);
  const box = useRef<HTMLDivElement>(null);
  const lid = `${id}-list`;

  // users: ask SAP while typing
  useEffect(() => {
    if (!isUser || !open) return;
    const q = value.trim();
    if (q.length < 2) { setRemote([]); return; }
    setBusy(true);
    let live = true;
    const t = setTimeout(() => {
      wfApi.valueHelp('USER', appId, q, 25).then((r) => { if (live) { setRemote(r); setErr(''); } }).catch((e: Error) => { if (live) setErr(e.message); }).finally(() => { if (live) setBusy(false); });
    }, 260);
    return () => { live = false; clearTimeout(t); };
  }, [isUser, open, value, appId]);

  const shown = useMemo(() => {
    if (isUser) return remote;
    const q = value.trim().toUpperCase();
    const list = all || [];
    return (q ? list.filter((x) => x.key.toUpperCase().includes(q) || x.text.toUpperCase().includes(q)) : list).slice(0, 60);
  }, [isUser, remote, all, value]);

  useEffect(() => setActive(0), [shown]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);

  const pick = (it: WfItem) => { onChange(it.key); onPick?.(it); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'F4') { e.preventDefault(); setOpen(true); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className={`field wf-vh ${className || ''}`} ref={box}>
      <label htmlFor={id} className={labelHidden ? 'wf-sr' : 'field-label'}>{label}{required && <span className="req" aria-hidden> *</span>}</label>
      <div className="vh-row">
        <div className="vh-input">
          <input
            id={id} value={value} disabled={disabled} placeholder={placeholder} autoComplete="off" spellCheck={false}
            role="combobox" aria-expanded={open} aria-controls={lid} aria-autocomplete="list" aria-activedescendant={open && shown[active] ? `${id}-o${active}` : undefined}
            onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
            onFocus={() => { if (!isUser) setOpen(true); }}
            onKeyDown={onKey}
          />
          <button type="button" className="vh-btn" tabIndex={-1} aria-label={`Open the list of ${label}`} disabled={disabled} onClick={() => setOpen((o) => !o)}><IconSearch size={14} /></button>
        </div>
      </div>
      {open && (
        <ul className="wf-vh-list" id={lid} role="listbox" aria-label={label}>
          {isUser && value.trim().length < 2 && <li className="wf-vh-note">Type at least 2 letters of the user id or name</li>}
          {busy && <li className="wf-vh-note">Searching SAP users…</li>}
          {err && <li className="wf-vh-note wf-vh-err">{err}</li>}
          {!busy && !err && shown.length === 0 && (!isUser || value.trim().length >= 2) && <li className="wf-vh-note">{all === null && !isUser ? 'Loading from SAP…' : 'Nothing found - the value is kept as typed'}</li>}
          {shown.map((it, i) => (
            <li key={it.key} id={`${id}-o${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(it); }} onMouseEnter={() => setActive(i)}>
              <strong>{it.key}</strong><span>{it.text}</span>{it.extra && <small>{it.extra}</small>}
            </li>
          ))}
        </ul>
      )}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

export { IconX };
