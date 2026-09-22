import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getRecentApps } from '../lib/authApi';
import type { RecentEntry } from '../types';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}, ${time}`;
}

/**
 * The signed-in user's own real recently-opened apps (see GET /me/recent-apps), replacing what
 * used to be a hardcoded mock list — same {id, when} shape as before so Home/Recent's rendering
 * is unaffected, just backed by real data now. Empty until the fetch resolves (no stale/mock
 * fallback), and re-fetches whenever the signed-in email changes.
 */
export function useRecentApps(): RecentEntry[] {
  const { userEmail } = useAuth();
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    if (!userEmail) {
      setRecent([]);
      return;
    }
    let cancelled = false;
    getRecentApps(userEmail).then((apps) => {
      if (cancelled) return;
      setRecent(apps.map((a) => ({ id: a.appId, when: formatWhen(a.lastOpenedAt) })));
    });
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  return recent;
}
