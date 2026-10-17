'use client';
import { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useSetu } from '@/lib/context';

const KEYS: { key: string; label: string }[] = [
  { key: '/', label: 'Search tickets' },
  { key: 'N', label: 'New ticket' },
  { key: 'D', label: 'Dashboard' },
  { key: 'T', label: 'Tickets' },
  { key: 'B', label: 'Board' },
  { key: '?', label: 'Show these shortcuts' },
  { key: 'Esc', label: 'Close this panel' },
];

const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
};

/** Single-key shortcuts for the main screens (ignored while typing in a field). */
export default function Shortcuts() {
  const { go } = useSetu();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const focusSearch = (tries = 0) => {
      const el = document.querySelector<HTMLInputElement>('input[aria-label="Search tickets"]');
      if (el) { el.focus(); el.select(); } else if (tries < 20) setTimeout(() => focusSearch(tries + 1), 50);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === '/') { e.preventDefault(); go('tickets'); focusSearch(); }
      else if (k === 'n') go('new');
      else if (k === 'd') go('dashboard');
      else if (k === 't') go('tickets');
      else if (k === 'b') go('board');
      else if (e.key === '?') setOpen((o) => !o);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('setu:shortcuts', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('setu:shortcuts', onOpen); };
  }, [go]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-plum-deep/40 p-4" onClick={() => setOpen(false)} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="w-full max-w-sm animate-slideUp rounded-2xl border border-line bg-panel p-4 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Keyboard size={16} className="text-accent" /> Keyboard shortcuts</h3>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-muted hover:bg-sunken"><X size={16} /></button>
        </div>
        <ul className="space-y-1.5">
          {KEYS.map((k) => (
            <li key={k.key} className="flex items-center justify-between text-[13px]">
              <span>{k.label}</span>
              <kbd className="num min-w-[2rem] rounded-md border border-line bg-sunken px-2 py-0.5 text-center text-xs font-bold">{k.key}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
