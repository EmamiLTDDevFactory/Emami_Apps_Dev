'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell as BellIcon, BellOff, CheckCheck, Settings2, Trash2 } from 'lucide-react';
import { clearReadBell, getBell, markBellRead } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { BELL_EVENT_SHORT, fmtDateTime, relative } from '@/lib/format';
import type { BellEvent, BellItem } from '@/lib/types';
import { cx } from './ui';

const POLL_MS = 60_000;

/**
 * Header bell. What reaches it is set in Admin > Channels & bell (events and who sees each); each agent mutes events
 * in My preferences (gear). The list filters by unread and by event type; it polls every minute while the tab is visible.
 */
export default function Bell({ events, muted, onSettings }: { events: BellEvent[]; muted: BellEvent[]; onSettings: () => void }) {
  const { openTicket } = useSetu();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellItem[]>([]);
  const [more, setMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [byEvent, setByEvent] = useState<Partial<Record<BellEvent, number>>>({});
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [filter, setFilter] = useState<BellEvent[]>([]);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async (append = false, before?: number) => {
    try {
      const r = await getBell({ unread: onlyUnread, events: filter, before });
      setItems((list) => (append ? [...list, ...r.items] : r.items));
      setMore(r.more);
      setUnread(r.unread);
      setByEvent(r.unreadByEvent);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications.');
    }
  }, [onlyUnread, filter]);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const openItem = async (n: BellItem) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markBellRead({ ids: [n.id] }).catch(() => {});
    }
    openTicket(n.ticketId);
  };
  const readAll = async () => { await markBellRead({ all: true }).catch(() => {}); await load(); };
  const clearRead = async () => { await clearReadBell().catch(() => {}); await load(); };
  const toggleFilter = (e: BellEvent) => setFilter((f) => (f.includes(e) ? f.filter((x) => x !== e) : [...f, e]));

  const shown = events.filter((e) => !muted.includes(e));
  const allMuted = events.length > 0 && shown.length === 0;
  const chip = (active: boolean) => cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold transition', active ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink');
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-ink"
      >
        {allMuted ? <BellOff size={15} /> : <BellIcon size={15} />}
        {unread > 0 && <span className="num absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[380px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-panel shadow-pop">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="flex-1 text-[13px] font-bold">Notifications</span>
            {unread > 0 && <button type="button" onClick={readAll} className="inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline"><CheckCheck size={12} /> Mark all read</button>}
            <button type="button" onClick={clearRead} title="Remove notifications you have read" className="rounded-md p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Clear read notifications"><Trash2 size={13} /></button>
            <button type="button" onClick={() => { setOpen(false); onSettings(); }} aria-label="Notification settings" title="What I get notified about" className="rounded-md p-1 text-muted hover:bg-sunken hover:text-ink"><Settings2 size={14} /></button>
          </div>
          {events.length > 0 && (
            <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
              <button type="button" className={chip(!onlyUnread && !filter.length)} onClick={() => { setOnlyUnread(false); setFilter([]); }}>All</button>
              <button type="button" className={chip(onlyUnread)} onClick={() => setOnlyUnread((x) => !x)}>Unread{unread > 0 && <span className="num">{unread}</span>}</button>
              {shown.map((e) => (
                <button key={e} type="button" className={chip(filter.includes(e))} onClick={() => toggleFilter(e)} aria-pressed={filter.includes(e)}>
                  {BELL_EVENT_SHORT[e] ?? e}{byEvent[e] ? <span className="num rounded-full bg-bad/15 px-1 text-bad">{byEvent[e]}</span> : null}
                </button>
              ))}
            </div>
          )}
          {error && <p className="px-3 py-2 text-xs text-bad">{error}</p>}
          <ul className="scroll-thin max-h-[420px] overflow-y-auto">
            {events.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted">The bell is switched off by your Samadhan admin.</li>
            ) : items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted">{onlyUnread || filter.length ? 'Nothing matches these filters.' : 'Nothing yet. Updates on your tickets show up here.'}</li>
            ) : items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} className={cx('flex w-full gap-2.5 border-b border-line/60 px-3 py-2.5 text-left hover:bg-sunken', !n.readAt && 'bg-accent/[0.05]')}>
                  <span aria-hidden className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : n.event === 'sla_breach' || n.event === 'escalated' ? 'bg-bad' : 'bg-accent')} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-[13px]', !n.readAt && 'font-semibold')}>{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-2xs text-muted">{n.body}</span>}
                    <span className="block text-[11px] text-faint" title={fmtDateTime(n.createdAt)}>{BELL_EVENT_SHORT[n.event] ?? n.event} · {relative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
            {more && (
              <li><button type="button" onClick={() => load(true, items[items.length - 1]?.id)} className="w-full px-3 py-2 text-center text-2xs font-bold text-accent hover:bg-sunken">Load older</button></li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
