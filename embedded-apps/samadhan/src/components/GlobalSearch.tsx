'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Inbox, Search, User } from 'lucide-react';
import { globalSearch } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import type { SearchResults } from '@/lib/types';
import { cx } from './ui';

/** Header search across tickets (number, subject, requester, DB code, MR UID), contacts and knowledge-base articles. */
export default function GlobalSearch() {
  const { openTicket, openList, go } = useSamadhan();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 && !/^#?\d+$/.test(term)) { setRes(null); return; }
    const id = setTimeout(() => { globalSearch(term).then((r) => { setRes(r); setOpen(true); }).catch(() => setRes(null)); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const done = () => { setOpen(false); setQ(''); };
  const empty = res && !res.tickets.length && !res.contacts.length && !res.articles.length;
  const row = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-sunken';
  return (
    <div ref={box} className="relative hidden md:block">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => res && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && q.trim()) { openList({ view: '', q: q.trim() }); done(); }
        }}
        placeholder="Search tickets, contacts, articles"
        aria-label="Search everything"
        className="h-8 w-56 rounded-lg border border-line bg-bg pl-8 pr-2 text-xs focus:border-accent focus:outline-none lg:w-72"
      />
      {open && res && (
        <div className="absolute right-0 z-40 mt-1 max-h-[70vh] w-[26rem] overflow-y-auto rounded-xl border border-line bg-panel py-1.5 shadow-pop">
          {empty && <p className="px-3 py-2 text-xs text-muted">Nothing found.</p>}
          {res.tickets.length > 0 && <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-faint">Tickets</p>}
          {res.tickets.map((t) => (
            <button key={`t${t.id}`} type="button" className={row} onClick={() => { openTicket(t.id); done(); }}>
              <Inbox size={13} className="shrink-0 text-accent" />
              <span className="num text-2xs font-bold text-muted">#{t.id}</span>
              <span className="min-w-0 flex-1 truncate">{t.subject}</span>
              <span className={cx('shrink-0 text-2xs', t.isResolved ? 'text-good' : 'text-muted')}>{t.statusName}</span>
            </button>
          ))}
          {res.contacts.length > 0 && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-faint">Contacts</p>}
          {res.contacts.map((c) => (
            <button key={`c${c.id}`} type="button" className={row} onClick={() => { openList({ view: '', requesterId: String(c.id) }); done(); }} title="Their tickets">
              <User size={13} className="shrink-0 text-accent" />
              <span className="font-semibold">{c.name}</span>
              <span className="min-w-0 flex-1 truncate text-2xs text-muted">{[c.email, c.mobile].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
          {res.articles.length > 0 && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-faint">Solutions</p>}
          {res.articles.map((a) => (
            <button key={`a${a.id}`} type="button" className={row} onClick={() => { go('solutions'); done(); }}>
              <BookOpen size={13} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">{a.title}</span>
              <span className="shrink-0 text-2xs text-muted">{a.category}</span>
            </button>
          ))}
          {!empty && <p className="border-t border-line px-3 pt-1.5 text-[11px] text-faint">Enter: show all matching tickets</p>}
        </div>
      )}
    </div>
  );
}
