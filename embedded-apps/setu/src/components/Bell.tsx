'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell as BellIcon, BellOff, CheckCheck, Settings2 } from 'lucide-react';
import { getBell, markBellRead, savePrefs } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { BELL_EVENT_LABEL, fmtDateTime, relative } from '@/lib/format';
import type { BellEvent, BellItem } from '@/lib/types';
import { cx } from './ui';

const POLL_MS = 60_000;

/**
 * Header bell. What reaches it is set in Admin > System (by default only replies from requesters); each agent can
 * mute any of those events for themselves here. Polls every minute while the tab is visible.
 */
export default function Bell({ events, muted: initialMuted }: { events: BellEvent[]; muted: BellEvent[] }) {
  const { openTicket } = useSetu();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [items, setItems] = useState<BellItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState<BellEvent[]>(initialMuted);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await getBell();
      setItems(r.items);
      setUnread(r.unread);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications.');
    }
  }, []);

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

  const readAll = async () => {
    await markBellRead({ all: true }).catch(() => {});
    await load();
  };

  const toggleMute = async (e: BellEvent) => {
    const next = muted.includes(e) ? muted.filter((x) => x !== e) : [...muted, e];
    setMuted(next);
    try {
      await savePrefs({ bellMuted: next });
    } catch (err) {
      setMuted(muted);
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  };

  const allMuted = events.length > 0 && events.every((e) => muted.includes(e));
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSettings(false); if (!open) load(); }}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-ink"
      >
        {allMuted ? <BellOff size={15} /> : <BellIcon size={15} />}
        {unread > 0 && <span className="num absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-panel shadow-pop">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="flex-1 text-[13px] font-bold">Notifications</span>
            {unread > 0 && <button type="button" onClick={readAll} className="inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline"><CheckCheck size={12} /> Mark all read</button>}
            <button type="button" onClick={() => setSettings((x) => !x)} aria-label="Notification settings" aria-expanded={settings} className={cx('rounded-md p-1 hover:bg-sunken', settings ? 'text-accent' : 'text-muted')}><Settings2 size={14} /></button>
          </div>
          {settings && (
            <div className="border-b border-line bg-sunken/60 px-3 py-2.5">
              <div className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted">Show me</div>
              {events.length === 0 ? (
                <p className="text-xs text-muted">The bell is switched off by your Samadhan admin.</p>
              ) : events.map((e) => (
                <label key={e} className="flex items-center gap-2 py-0.5 text-xs">
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={!muted.includes(e)} onChange={() => toggleMute(e)} />
                  {BELL_EVENT_LABEL[e] ?? e}
                </label>
              ))}
              <p className="mt-1.5 text-[11px] leading-snug text-faint">Your admin chooses which events can reach the bell; you can turn any of them off for yourself.</p>
            </div>
          )}
          {error && <p className="px-3 py-2 text-xs text-bad">{error}</p>}
          <ul className="scroll-thin max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted">Nothing yet. Replies from requesters on your tickets show up here.</li>
            ) : items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} className={cx('flex w-full gap-2.5 border-b border-line/60 px-3 py-2.5 text-left hover:bg-sunken', !n.readAt && 'bg-accent/[0.05]')}>
                  <span aria-hidden className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-[13px]', !n.readAt && 'font-semibold')}>{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-2xs text-muted">{n.body}</span>}
                    <span className="block text-[11px] text-faint" title={fmtDateTime(n.createdAt)}>{relative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
