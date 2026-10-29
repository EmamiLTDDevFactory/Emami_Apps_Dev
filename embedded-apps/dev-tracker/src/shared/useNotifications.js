import { useMemo, useState } from 'react';
import { relativeTime, revisedTarget, daysBetween, todayStr, fmtDate } from './utils.js';
import { splitPeople } from './pm.js';

// Notification read/clear state has no backend of its own — the notifications themselves
// are computed fresh from real item (+ activity) data every load, but which ones a person
// has seen/dismissed is tracked as two id sets in localStorage, per email. IDs, not a
// timestamp cutoff, because a due-date reminder has no natural "changed at" to compare
// against — it's keyed to the item+target date instead.
function loadNotifState(email) {
  try {
    const raw = JSON.parse(localStorage.getItem(`devtracker_notif_${email}`));
    return { read: new Set(raw?.read || []), cleared: new Set(raw?.cleared || []) };
  } catch {
    return { read: new Set(), cleared: new Set() };
  }
}
function saveNotifState(email, state) {
  try {
    const cap = (set) => [...set].slice(-300); // don't grow the stored list forever
    localStorage.setItem(`devtracker_notif_${email}`, JSON.stringify({ read: cap(state.read), cleared: cap(state.cleared) }));
  } catch {
    /* ignore */
  }
}

// Personal notifications, two kinds, both real data — nothing fabricated:
//  1. Someone ELSE changed something on one of my assignments (needs the activity feed —
//     pages that don't load it pass [] and simply only ever get kind 2 below).
//  2. One of my active assignments has its revised target date within the next 2 days
//     (or already today) — a due-date reminder, not tied to any activity log entry.
function computeMyNotifications(items, activity, profileName) {
  if (!profileName) return [];
  const norm = (s) => (s || '').trim().toLowerCase();
  const myItems = items.filter((it) => splitPeople(it.developer).some((d) => norm(d) === norm(profileName)));
  const myTitles = new Set(myItems.map((it) => it.devList));

  const changesByOthers = activity
    .filter((a) => myTitles.has(a.devList) && norm(a.changedByUsername) !== norm(profileName))
    .map((a) => ({
      id: `activity-${a.changedAt}-${a.field}-${a.devList}`,
      text: `${a.changedByUsername || 'Someone'} updated ${a.field} on ${a.devList}`,
      time: a.changedAt,
      meta: relativeTime(a.changedAt),
    }));

  const today = todayStr();
  const dueSoon = myItems
    .filter((it) => !['Completed', 'Cancelled'].includes(it.status))
    .map((it) => {
      const rt = revisedTarget(it);
      if (!rt) return null;
      const daysLeft = daysBetween(today, rt);
      if (daysLeft < 0 || daysLeft > 2) return null;
      const when = daysLeft === 0 ? 'due today' : daysLeft === 1 ? 'due tomorrow' : `due in ${daysLeft} days`;
      return {
        id: `due-${it.id}-${rt}`,
        text: `${it.devList} is ${when}`,
        time: it.updatedAt || it.createdAt || new Date().toISOString(),
        meta: `Target ${fmtDate(rt, { withYear: false })}`,
      };
    })
    .filter(Boolean);

  return [...dueSoon, ...changesByOthers].sort((a, b) => new Date(b.time) - new Date(a.time));
}

/** Drives the Topbar's notification bell from real item (+ optional activity) data.
 * `activity` defaults to [] for pages that don't load the activity feed — they still get
 * real due-date reminders, just not the "someone else changed X" kind. */
export function useNotifications(email, items, activity, profileName) {
  const [notifState, setNotifState] = useState(() => loadNotifState(email));

  const myNotifications = useMemo(() => computeMyNotifications(items, activity, profileName), [items, activity, profileName]);
  const visibleNotifications = useMemo(
    () => myNotifications.filter((n) => !notifState.cleared.has(n.id)).map((n) => ({ ...n, unread: !notifState.read.has(n.id) })),
    [myNotifications, notifState]
  );

  function markAllRead() {
    const read = new Set(notifState.read);
    visibleNotifications.forEach((n) => read.add(n.id));
    const next = { read, cleared: notifState.cleared };
    setNotifState(next);
    saveNotifState(email, next);
  }
  function clear() {
    const cleared = new Set(notifState.cleared);
    visibleNotifications.forEach((n) => cleared.add(n.id));
    const next = { read: notifState.read, cleared };
    setNotifState(next);
    saveNotifState(email, next);
  }

  return { visibleNotifications, markAllRead, clear };
}
