'use client';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ValueHelpItem } from '@/lib/types';
import { filterItems, HELP_LIMIT } from '@/lib/valuehelp';

interface Props {
  /** id of the input; the visible <label htmlFor> points to it */
  id: string;
  value: string;
  onChange: (key: string) => void;
  items: ValueHelpItem[];
  loading?: boolean;
  error?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  /** shown while the list cannot be loaded yet (for example a parent field is empty) */
  disabledHint?: string;
  maxLength?: number;
  invalid?: boolean;
  describedBy?: string;
  inputMode?: 'numeric' | 'text';
  upper?: boolean;
}

/**
 * Combobox with a list (ARIA 1.2 pattern: input role=combobox, listbox popup, aria-activedescendant).
 * Type to search key and text; Arrow Down/Up open and move, Enter takes the active entry, Escape closes, Tab leaves.
 * Free text stays possible (SAP checks the value); picking an entry sets the key. The number of results is announced.
 */
export function Combobox({ id, value, onChange, items, loading, error, readOnly, disabled, disabledHint, maxLength, invalid, describedBy, inputMode, upper }: Props) {
  const listId = `${id}-list`;
  const hintId = `${id}-vh`;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // the list is filtered only once the person has typed
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const { shown, total } = useMemo(() => filterItems(items, typed ? value : ''), [items, typed, value]);
  const current = items.find((i) => i.key === value);
  const canOpen = !readOnly && !disabled;

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 220) });
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const on = () => place();
    window.addEventListener('scroll', on, true);
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on); };
  }, [open]);
  useEffect(() => { setActive(shown.length && typed ? 0 : -1); }, [shown, typed]);
  useEffect(() => { if (active >= 0) document.getElementById(`${uid}-o${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, uid]);

  const pick = (it: ValueHelpItem) => { onChange(it.key); setOpen(false); setTyped(false); };
  const show = open && canOpen;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!canOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(e.key === 'ArrowDown' ? 0 : shown.length - 1); return; }
      if (!shown.length) return;
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % shown.length : (a - 1 + shown.length) % shown.length));
    } else if (e.key === 'Home' && open && active >= 0 && e.ctrlKey) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && open && active >= 0 && e.ctrlKey) { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter' && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setTyped(false); }
  };

  const status = loading ? 'Loading the list' : error ? 'The list could not be loaded' : !open ? '' : !items.length ? 'No list available, type the value' : total === 0 ? 'No results' : `${total} result${total === 1 ? '' : 's'}${total > shown.length ? `, first ${shown.length} shown` : ''}`;

  return (
    <span className="combo">
      <input
        ref={inputRef} id={id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={listId} aria-haspopup="listbox"
        aria-activedescendant={show && active >= 0 ? `${uid}-o${active}` : undefined} aria-invalid={invalid ? true : undefined}
        aria-describedby={[describedBy, current && current.text !== current.key ? hintId : ''].filter(Boolean).join(' ') || undefined}
        autoComplete="off" value={value} readOnly={readOnly} disabled={disabled} maxLength={maxLength} inputMode={inputMode} placeholder={disabled ? disabledHint : undefined} title={disabled ? disabledHint : undefined}
        onChange={(e) => { onChange(upper ? e.target.value.toUpperCase() : e.target.value); setTyped(true); setOpen(true); }}
        onFocus={() => undefined}
        onClick={() => { if (canOpen) setOpen(true); }}
        onBlur={() => { setOpen(false); setTyped(false); }}
        onKeyDown={onKeyDown}
      />
      {current && current.text !== current.key && <span className="vh-text" id={hintId}>{current.text}</span>}
      <span className="sr-only" role="status" aria-live="polite">{status}</span>
      {loading && <span className="vh-note" aria-hidden="true">Loading…</span>}
      {show && pos && (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="combo-list" style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width }}>
          {shown.map((it, i) => (
            <li key={it.key} id={`${uid}-o${i}`} role="option" aria-selected={i === active || it.key === value} className={i === active ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(it); }} onMouseEnter={() => setActive(i)}>
              <b>{it.key}</b>{it.text && it.text !== it.key ? <span> {it.text}</span> : null}
            </li>
          ))}
          {!shown.length && <li className="empty" role="presentation">{loading ? 'Loading…' : !items.length ? 'No list available, type the value' : 'No results'}</li>}
          {total > HELP_LIMIT && <li className="empty" role="presentation">Showing the first {HELP_LIMIT} of {total}. Type more to narrow the list.</li>}
        </ul>
      )}
    </span>
  );
}

