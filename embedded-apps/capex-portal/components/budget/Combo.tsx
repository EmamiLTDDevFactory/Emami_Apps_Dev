'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Option } from './logic';

/**
 * Searchable single-select. Typing matches the option's KEY and its TEXT, anywhere in the string, case-insensitive
 * (log #8 / #117: a plain ComboBox only matched the displayed text, so plant code "A021" found nothing).
 */
export default function Combo({ options, value, onChange, placeholder = 'Select', allLabel, disabled, invalid, id }: {
  options: Option[]; value: string; onChange: (key: string) => void; placeholder?: string;
  /** when set, a first entry with this label clears the value (filters) */
  allLabel?: string; disabled?: boolean; invalid?: boolean; id?: string;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.key === value);
  const label = selected ? `${selected.key} - ${selected.text}` : '';

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.key.toLowerCase().includes(q) || o.text.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const rows: Option[] = useMemo(() => (allLabel !== undefined && !query.trim() ? [{ key: '', text: allLabel }, ...matches] : matches), [allLabel, matches, query]);

  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const pick = (o: Option) => { onChange(o.key); setOpen(false); setQuery(''); };

  return (
    <div ref={root} className="relative">
      <input
        id={id} role="combobox" aria-expanded={open} aria-controls={`${uid}-list`} aria-autocomplete="list" disabled={disabled}
        className={`field w-full ${invalid ? 'border-red-400' : ''}`} autoComplete="off"
        placeholder={allLabel !== undefined && !selected ? allLabel : placeholder}
        value={open ? query : label}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rows.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { if (open && rows[active]) { e.preventDefault(); pick(rows[active]); } }
          else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); setQuery(''); }
        }}
      />
      {open && (
        <ul id={`${uid}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full min-w-[14rem] overflow-auto rounded-lg border border-sap-line bg-white py-1 text-[12px] shadow-card">
          {rows.length === 0 && <li className="px-3 py-2 text-sap-muted">No match</li>}
          {rows.map((o, i) => (
            <li key={o.key || '__all'} role="option" aria-selected={o.key === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-plum-soft' : ''} ${o.key === value ? 'font-bold text-plum' : ''}`}>
              {o.key ? <><span className="font-semibold">{o.key}</span> - {o.text}</> : <span className="text-sap-muted">{o.text}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
