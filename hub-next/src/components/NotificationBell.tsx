'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { colors, fonts, fontWeights, radii, shadows } from '../theme/tokens';
import { fetchNotifications, markNotificationsRead, type HubNotification } from '../lib/notificationsApi';

const KIND_COLOR: Record<string, string> = { good: colors.green, bad: '#C2362B', action: colors.uat, info: colors.rust };
const POLL_MS = 60_000;

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** Hub-wide notifications bell: updates from every app (e.g. change-request milestones), newest first. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HubNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const data = await fetchNotifications();
    if (data) { setItems(data.items); setUnread(data.unread); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const openItem = (n: HubNotification) => {
    if (!n.readAt) {
      markNotificationsRead({ ids: [n.id] });
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.link) window.location.href = n.link;
  };

  const markAll = () => {
    markNotificationsRead({ all: true });
    setItems((list) => list.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ position: 'relative', padding: 6, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={20} color={open ? colors.rust : colors.inkSoft} />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute', top: 1, right: 0, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9,
              backgroundColor: '#C2362B', color: colors.white, fontSize: 10, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold,
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${colors.white}`,
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: -8, width: 'min(380px, calc(100vw - 24px))', maxHeight: 460,
            display: 'flex', flexDirection: 'column', backgroundColor: colors.white, border: `1px solid ${colors.border}`,
            borderRadius: radii.lg, boxShadow: shadows.lg, zIndex: 60, overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 14, color: colors.ink }}>Notifications</span>
            <button
              type="button"
              onClick={markAll}
              disabled={!unread}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: unread ? 'pointer' : 'default', color: unread ? colors.rust : colors.inkSoft, fontSize: 12, fontFamily: fonts.sansRegular }}
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <div style={{ overflowY: 'auto' }}>
            {items.length === 0 && (
              <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>
                You are all caught up.
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px 11px 12px', border: 'none',
                  borderBottom: `1px solid ${colors.border}`, borderLeft: `3px solid ${KIND_COLOR[n.kind] || colors.rust}`,
                  backgroundColor: n.readAt ? colors.white : `${colors.rust}0d`, cursor: n.link ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.appName}</span>
                  <span style={{ flexShrink: 0 }}>{timeAgo(n.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: colors.ink, fontFamily: n.readAt ? fonts.sansRegular : fonts.sansBold, fontWeight: n.readAt ? 400 : fontWeights.sansBold, marginTop: 2 }}>
                  {n.title}
                </div>
                {n.body && (
                  <div style={{ fontSize: 12, color: colors.inkSoft, fontFamily: fonts.sansRegular, marginTop: 2, whiteSpace: 'pre-line', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {n.body}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
