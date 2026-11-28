'use client';

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { filterOptions } from '../lib/labels';

export interface ComboOption { value: string; label: string; keywords?: string; hint?: string; disabled?: boolean }

/**
 * Searchable dropdown, one component for every long list (transporter, lane, customer, vehicle type, location ...).
 * Type to filter (every word must match the label or keywords, case-insensitively), Up/Down/Enter/Escape from the keyboard, "No match" when nothing fits,
 * clear button, same look as the app's inputs. The list is drawn in a portal so a table's overflow never clips it. `value` / `onChange` carry the same ids a plain
 * <select> did, so callers post exactly what they posted before.
 */
export default function Combobox({ value, onChange, options, placeholder = 'Select…', clearable = true, disabled, className = '', ariaLabel, id, minWidth }: {
  value: string; onChange: (v: string) => void; options: ComboOption[]; placeholder?: string; clearable?: boolean; disabled?: boolean; className?: string; ariaLabel?: string; id?: string; minWidth?: number;
}) {
  const uid = useId(); const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<string | null>(null);          // null = not editing: show the selected label
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; up: boolean; maxH: number } | null>(null);
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => filterOptions(options, q ?? '') as ComboOption[], [options, q]);

  const place = () => {
    const el = inputRef.current; if (!el) return;
    const r = el.getBoundingClientRect(), below = window.innerHeight - r.bottom, up = below < 220 && r.top > below;
    const width = Math.min(Math.max(r.width, minWidth ?? 0), window.innerWidth - 16), left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));   // stay inside a narrow (mobile) screen
    setRect({ left, top: up ? r.top : r.bottom, width, up, maxH: Math.max(140, Math.min(320, (up ? r.top : below) - 12)) });
  };
  useLayoutEffect(() => { if (open) place(); }, [open, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const on = () => place();
    window.addEventListener('scroll', on, true); window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActive(0); }, [q, open]);
  useEffect(() => { if (open) document.getElementById(`${uid}-o${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, uid]);

  const close = () => { setOpen(false); setQ(null); };
  const choose = (o?: ComboOption) => { if (!o || o.disabled) return; onChange(o.value); close(); };
  const move = (d: number) => { if (!shown.length) return; let i = active; for (let n = 0; n < shown.length; n++) { i = (i + d + shown.length) % shown.length; if (!shown[i].disabled) break; } setActive(i); };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (!open) setOpen(true); else move(-1); }
    else if (e.key === 'Enter') { if (open) { e.preventDefault(); choose(shown[active]); } }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
    else if (e.key === 'Tab') close();
  };

  return (
    <div className={`relative ${className}`} style={minWidth ? { minWidth } : undefined}>
      <input
        ref={inputRef} id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-haspopup="listbox" aria-label={ariaLabel}
        aria-activedescendant={open && shown[active] ? `${uid}-o${active}` : undefined} autoComplete="off" disabled={disabled}
        className="input w-full !pr-14" placeholder={placeholder} value={q ?? selected?.label ?? ''}
        onFocus={(e) => { setOpen(true); e.target.select(); }} onClick={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={onKey} onBlur={close}
      />
      {clearable && value && !disabled && <button type="button" tabIndex={-1} aria-label="Clear selection" className="absolute right-7 top-1/2 -translate-y-1/2 rounded px-1 text-base leading-none text-inkSoft hover:text-ink" onMouseDown={(e) => { e.preventDefault(); onChange(''); close(); inputRef.current?.focus(); }}>×</button>}
      <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-inkSoft">▾</span>
      {open && rect && typeof document !== 'undefined' && createPortal(
        <ul id={listId} role="listbox" aria-label={ariaLabel} onMouseDown={(e) => e.preventDefault()}
          style={{ position: 'fixed', left: rect.left, width: rect.width, maxHeight: rect.maxH, ...(rect.up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }) }}
          className="z-[100] overflow-y-auto rounded-xl border border-border bg-white py-1 text-sm shadow-pop">
          {shown.length === 0 && <li role="presentation" className="px-3 py-3 text-inkSoft">No match</li>}
          {shown.map((o, i) => (
            <li key={o.value || `_${i}`} id={`${uid}-o${i}`} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
              className={`cursor-pointer px-3 py-2.5 sm:py-1.5 ${i === active ? 'bg-cream' : ''} ${o.value === value ? 'font-extrabold text-rust' : ''} ${o.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
              {o.label}{o.hint ? <span className="ml-2 text-xs font-semibold text-inkSoft">{o.hint}</span> : null}
            </li>))}
        </ul>, document.body)}
    </div>
  );
}
