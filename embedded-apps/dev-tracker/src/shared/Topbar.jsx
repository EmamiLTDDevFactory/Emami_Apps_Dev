import React, { useEffect, useRef, useState } from 'react';
import { ROUTES } from './routes.js';
import { backToEmamiApps } from './Sidebar.jsx';
import { clearHubSessionAndRedirect } from './AccountBar.jsx';
import { initialsHome } from './utils.js';
import { SearchIcon, BellIcon, PlusIcon } from './icons.jsx';

/** Slim header for pages that put identity/search up top instead of in the sidebar
 * (currently just Home — see Sidebar's `identityInTopbar`). Search is real: Enter hands
 * the query to Dashboard's own search filter via the `aiSearch` param it already reads
 * for the AI handoff, rather than searching anything itself. `notifications` is the
 * caller's real, already-filtered list (see Home.jsx) — each entry already carries its
 * own display `meta` string, so this component only renders and reports back actions. */
// `onSearch` / `onCreate` let the project workspace handle both in place; every other page falls
// back to handing off to the workspace by URL (?aiSearch= / ?action=new).
export default function Topbar({ email, name, roleLabel, notifications = [], onMarkAllRead, onClear, onSearch, onCreate }) {
  const [query, setQuery] = useState('');
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const userRef = useRef(null);
  const displayName = name || email || '';
  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    if (!notifOpen && !userOpen) return undefined;
    function onDocMouseDown(e) {
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (userOpen && userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [notifOpen, userOpen]);

  function submitSearch() {
    const q = query.trim();
    if (!q) return;
    if (onSearch) { onSearch(q); return; }
    window.location.href = `${ROUTES.dashboard}?aiSearch=${encodeURIComponent(q)}#list`;
  }

  function create() {
    if (onCreate) onCreate();
    else window.location.href = `${ROUTES.dashboard}?action=new`;
  }

  return (
    <div className="topbar">
      <button type="button" className="topbar-hub" onClick={backToEmamiApps} title="Back to Emami Apps">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        <span>Emami Apps</span>
      </button>
      <div className="topbar-search">
        <SearchIcon size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
          placeholder="Search issues by key, title, owner, keyword…"
        />
        <span className="topbar-kbd">Ctrl K</span>
      </div>

      <div className="topbar-side">
        <button type="button" className="topbar-create" onClick={create} title="Create issue">
          <PlusIcon size={14} /> Create
        </button>
        <div className="topbar-notif" ref={notifRef}>
          <button type="button" className="topbar-bell" title="Notifications" onClick={() => setNotifOpen((o) => !o)}>
            <BellIcon size={18} />
            {unreadCount > 0 && <span className="topbar-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {notifOpen && (
            <div className="topbar-notif-panel">
              <div className="topbar-notif-head">
                <span>Notifications</span>
                <div className="topbar-notif-actions">
                  <button onClick={onMarkAllRead} disabled={!unreadCount}>Mark all read</button>
                  <button onClick={onClear} disabled={!notifications.length}>Clear</button>
                </div>
              </div>
              <div className="topbar-notif-list">
                {notifications.map((n) => (
                  <div className={`topbar-notif-row${n.unread ? ' is-unread' : ''}`} key={n.id}>
                    {n.unread && <span className="topbar-notif-dot" />}
                    <div className="topbar-notif-text">
                      <div>{n.text}</div>
                      <div className="topbar-notif-time">{n.meta}</div>
                    </div>
                  </div>
                ))}
                {!notifications.length && <div className="topbar-notif-empty">No notifications on your assignments right now.</div>}
              </div>
            </div>
          )}
        </div>

        <div className="topbar-user" ref={userRef}>
          <button type="button" className="topbar-user-btn" onClick={() => setUserOpen((o) => !o)}>
            <div className="avatar mono topbar-avatar">{initialsHome(displayName)}</div>
            <div className="topbar-user-text">
              <div className="topbar-user-name">{displayName}</div>
              {roleLabel && <div className="topbar-user-role">{roleLabel}</div>}
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="topbar-chevron">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {userOpen && (
            <div className="topbar-menu">
              <button onClick={clearHubSessionAndRedirect}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
