'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fn } from '@/lib/api';
import { useList } from '@/lib/useData';
import { fmtDateTime } from '@/lib/format';
import { useAction } from '@/components/ui';
import type { Notification1 } from '@/lib/entities';

/**
 * Header bell: unread count + dropdown of Notification1Set rows (newest first). Clicking a row marks it read
 * (function import MarkNotificationsRead { NotifId }) and opens its Route. Mount it in the Shell header next to the user chips.
 */
export default function NotificationBell() {
  const router = useRouter();
  const { rows, reload } = useList<Notification1>('Notification1Set', { $orderby: 'SentTs desc', $top: 30 });
  const [open, setOpen] = useState(false);
  const { busy, run } = useAction();
  const box = useRef<HTMLDivElement>(null);
  const unread = rows.filter((n) => n.IsRead !== 'X');

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const markRead = (id: string) => run(async () => { await fn('MarkNotificationsRead', { NotifId: id }); reload(); });
  const openItem = async (n: Notification1) => {
    if (n.IsRead !== 'X') await markRead(n.Notifid);
    setOpen(false);
    if (n.Route) router.push(n.Route.startsWith('/') ? n.Route : `/${n.Route}`);
  };

  return (
    <div ref={box} className="relative">
      <button type="button" aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`} aria-expanded={open} className="btn btn-secondary relative" onClick={() => { setOpen((o) => !o); if (!open) reload(); }}>
        {'🔔'}
        {unread.length > 0 && <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      {open && (
        <div className="glass absolute right-0 z-40 mt-2 max-h-[70vh] w-[min(92vw,22rem)] overflow-y-auto rounded-xl shadow-pop">
          <div className="flex items-center justify-between border-b border-sap-line px-3 py-2 text-[12px] font-extrabold">
            Notifications
            {unread.length > 0 && <button type="button" disabled={busy} className="text-[11px] font-bold text-plum" onClick={() => run(async () => { for (const n of unread) await fn('MarkNotificationsRead', { NotifId: n.Notifid }); reload(); })}>Mark all read</button>}
          </div>
          {rows.length === 0 && <div className="py-6 text-center text-[12px] text-sap-muted">No notifications.</div>}
          {rows.map((n) => (
            <button key={n.Notifid} type="button" onClick={() => openItem(n)} className={`block w-full border-b border-sap-line px-3 py-2 text-left hover:bg-[#EEF0FB] ${n.IsRead === 'X' ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-1.5 text-[12px] font-bold">{n.IsRead !== 'X' && <i className="h-2 w-2 rounded-full bg-plum" />}{n.Title}</div>
              <div className="text-[11.5px] text-sap-ink">{n.Message}</div>
              <div className="text-[10.5px] text-sap-muted">{fmtDateTime(n.SentTs)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
