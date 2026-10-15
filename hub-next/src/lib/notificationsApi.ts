// Emami Apps notifications (backend/notifications.js, served at /api/me/notifications): one inbox per
// person across every app — e.g. change-request milestones from the Change Control Board & CR Tracker.
import { authFetch } from './authFetch';

const ACCESS_API_URL =
  process.env.NEXT_PUBLIC_ACCESS_API_URL || process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

export type HubNotification = {
  id: number;
  appId: string;
  appName: string;
  kind: 'info' | 'good' | 'bad' | 'action' | string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

export async function fetchNotifications(): Promise<{ items: HubNotification[]; unread: number } | null> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/me/notifications?limit=40`);
    const data = await res.json();
    if (!res.ok || !data?.success) return null;
    return { items: data.items, unread: data.unread };
  } catch {
    return null;
  }
}

export async function markNotificationsRead(body: { ids: number[] } | { all: true }): Promise<void> {
  try {
    await authFetch(`${ACCESS_API_URL}/me/notifications/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // best effort; the next poll shows the real state
  }
}
