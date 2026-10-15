import { useCallback, useEffect, useState } from 'react';
import { ACCESS_API_BASE } from './constants.js';
import { relativeTime } from './utils.js';

// This app's slice of the person's Emami Apps notifications (backend/notifications.js) — CR milestones
// for the IT SPOC: decisions, developer assigned, ready for UAT, live, target date missed. The same items
// show in the Emami Apps hub's bell and, where configured, in Outlook. Polled once a minute.
const BASE = `${ACCESS_API_BASE}/me/notifications`;
const APP = 'dev-tracker';

function authHeaders() {
  try {
    const token = localStorage.getItem('emami_apps_session_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function useHubNotifications(email) {
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    if (!email) return;
    try {
      const res = await fetch(`${BASE}?app=${APP}&limit=30`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data?.success) setItems(data.items);
    } catch {
      // offline or an older server without notifications — the bell just shows the local alerts
    }
  }, [email]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const post = useCallback(async (body) => {
    try {
      await fetch(`${BASE}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
    } catch { /* best effort */ }
  }, []);

  const markRead = useCallback((id) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n)));
    post({ ids: [id] });
  }, [post]);

  const markAllRead = useCallback(() => {
    setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    post({ all: true, app: APP });
  }, [post]);

  // Shaped like the bell's local alerts ({ id, text, meta, unread }), plus the link to open.
  const list = items.map((n) => ({
    id: `hub-${n.id}`, hubId: n.id, text: n.body ? `${n.title} — ${n.body.split('\n')[0]}` : n.title,
    meta: relativeTime(n.createdAt), unread: !n.readAt, href: n.link, kind: n.kind,
  }));
  return { list, markRead, markAllRead };
}
