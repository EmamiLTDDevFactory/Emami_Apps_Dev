'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconBell, IconX } from './icons';
import { isSapTimeout, parseDataArray, runAction } from '@/lib/api';
import { formatDate, formatTime, trimLeadingZeros, type CascadeNotification } from '@/lib/types';

type Props = {
  onNavigateToPendingCorrection: () => void;
};

/** Fired by the tabs after a reject or a resubmit, so the bell does not wait for the next 60-second poll. */
export const NOTIFICATIONS_CHANGED = 'cascade:notifications-changed';
const POLL_MS = 60_000;
/** After SAP times out, no polling for this long: each timed-out call holds an SAP work process for 30-45 s. */
const BACKOFF_MS = 10 * 60_000;

/**
 * Rejection notifications: a bell with the unread count, polled every 60 seconds (GET_NOTIFICATIONS), and a panel that
 * slides in from the right (no overlay - the page stays usable). Mark as read removes the card locally.
 */
export default function NotificationBell({ onNavigateToPendingCorrection }: Props) {
  const [items, setItems] = useState<CascadeNotification[]>([]);
  const [firstLoad, setFirstLoad] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState<string | 'all' | null>(null);
  const pausedUntil = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (!manual && Date.now() < pausedUntil.current) return;
    try {
      const r = await runAction('GET_NOTIFICATIONS', {});
      // A failed answer without data keeps the notifications already shown (it does not mean "none").
      if (r.failed > 0 && !r.data) {
        if (isSapTimeout(r.message) || /did not (return|confirm)/.test(r.message)) pausedUntil.current = Date.now() + BACKOFF_MS;
        setError(r.message || 'SAP could not return the notifications.');
        return;
      }
      setItems(parseDataArray<CascadeNotification>(r));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the notifications.');
    } finally {
      setFirstLoad(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, POLL_MS);
    const onChanged = () => { void load(true); };
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => { clearInterval(t); window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const markRead = async (ids: string[], which: string | 'all') => {
    setMarking(which);
    try {
      await runAction('MARK_NOTIF_READ', { NOTIF_IDS: ids });
      setItems((cur) => (which === 'all' ? [] : cur.filter((n) => !ids.includes(n.NOTIF_ID))));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark the notification as read.');
    } finally {
      setMarking(null);
    }
  };

  const count = items.length;
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${count} unread`} aria-expanded={open} aria-controls="notif-panel"
        className="relative grid h-9 w-9 place-items-center rounded-full bg-white/70 text-plum ring-1 ring-white transition hover:bg-white">
        <IconBell size={22} />
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_#fff]">{count > 99 ? '99+' : count}</span>}
      </button>
      {/* On document.body: the glass header (backdrop-filter) would otherwise confine the fixed panel to the header. */}
      {open && createPortal(
        <aside id="notif-panel" aria-label="Rejection notifications" className="glass-strong fade-up fixed inset-y-0 right-0 z-40 w-[400px] max-w-full overflow-y-auto shadow-[-12px_0_40px_-12px_rgba(36,30,61,0.35)]">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-plum/10 bg-white/90 px-4 py-3 backdrop-blur">
            <h2 className="flex-1 font-display text-sm font-semibold text-sap-ink">Rejection Notifications</h2>
            {count > 0 && <button type="button" onClick={() => void markRead(items.map((n) => n.NOTIF_ID), 'all')} disabled={marking !== null} className="text-sm font-semibold text-plum hover:underline disabled:opacity-50">{marking === 'all' ? 'Marking...' : 'Mark all as read'}</button>}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-full p-1.5 text-sap-muted hover:bg-sap-head hover:text-sap-ink"><IconX size={16} /></button>
          </div>
          {error && <p role="alert" className="mx-4 mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{error}</p>}
          {firstLoad ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Loading...</p>
          ) : !count ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No new notifications.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.NOTIF_ID} className="border-b border-plum/10 p-3">
                  <p className="text-xs text-slate-500">Material {trimLeadingZeros(n.MATNR)} · Customer {trimLeadingZeros(n.KUNNR)} · Sales Org. {n.VKORG}</p>
                  <p className="text-xs text-slate-500">{formatDate(n.VALIDFROM)} to {formatDate(n.VALIDTO)}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-sap-ink">Reason: {n.REJECT_REASON}</p>
                  <p className="mt-0.5 text-xs text-slate-400">Rejected by {n.REJECTED_BY} on {formatDate(n.REJECT_DATE)} at {formatTime(n.REJECT_TIME)}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => { onNavigateToPendingCorrection(); setOpen(false); }} className="rounded border border-plum/30 bg-white px-2 py-0.5 text-xs font-semibold text-plum hover:bg-violet-50">Go to Pending Correction</button>
                    <button type="button" onClick={() => void markRead([n.NOTIF_ID], n.NOTIF_ID)} disabled={marking !== null} className="rounded border border-sap-line bg-white px-2 py-0.5 text-xs font-semibold text-sap-ink hover:bg-sap-head disabled:opacity-50">{marking === n.NOTIF_ID ? 'Marking...' : 'Mark as read'}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>,
        document.body,
      )}
    </>
  );
}
