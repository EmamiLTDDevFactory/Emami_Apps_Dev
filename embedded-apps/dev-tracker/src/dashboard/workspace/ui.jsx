import React, { useEffect, useRef, useState } from 'react';
import { ISSUE_TYPE_META, PRIORITY_META, CATEGORY_META, statusCategory, typeOf, issueKey } from '../../shared/pm.js';

// Small presentational pieces shared by every workspace view. Visual language follows Jira's:
// 16px colored issue-type squares, arrow priority icons, uppercase status lozenges, round avatars.

export function TypeIcon({ type, size = 16, title }) {
  const meta = ISSUE_TYPE_META[type] || ISSUE_TYPE_META.Task;
  const glyph = {
    Epic: <path d="M9.2 2.5 4.5 9h3.2l-1 4.5L11.5 7H8.3l.9-4.5Z" fill="#fff" />,
    Story: <path d="M5 3.5h6v9l-3-2.2-3 2.2v-9Z" fill="#fff" />,
    Task: <path d="m4.6 8.2 2.2 2.2 4.6-4.8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    Bug: <circle cx="8" cy="8" r="3.4" fill="#fff" />,
    'Sub-task': <><rect x="3.6" y="3.6" width="5" height="5" rx="1" fill="none" stroke="#fff" strokeWidth="1.4" /><rect x="7.4" y="7.4" width="5" height="5" rx="1" fill="#fff" /></>,
  }[meta.key];
  return (
    <svg className="pm-type-icon" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={title || meta.key}>
      <title>{title || meta.key}</title>
      <rect width="16" height="16" rx="3" fill={meta.color} />
      {glyph}
    </svg>
  );
}

export function PriorityIcon({ priority, size = 16, showLabel = false }) {
  const meta = PRIORITY_META[priority];
  if (!meta) return showLabel ? <span className="pm-muted">None</span> : null;
  const path = meta.dir === 'up'
    ? <><path d="M3 10.5 8 5.5l5 5" /><path d="M3 6.5 8 1.5l5 5" opacity=".55" /></>
    : meta.dir === 'down'
      ? <><path d="M3 5.5l5 5 5-5" /><path d="M3 9.5l5 5 5-5" opacity=".55" /></>
      : <><path d="M3 6h10" /><path d="M3 10h10" /></>;
  return (
    <span className="pm-priority" title={`${meta.label} priority`}>
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={meta.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

const AVATAR_COLORS = ['#0C66E4', '#6E5DC6', '#1F845A', '#C9372C', '#B65C02', '#0055CC', '#AE2E24', '#206A83', '#5E4DB2', '#943D73'];
export function colorFor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function initials(name) {
  const parts = String(name || '').replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
export function Avatar({ name, size = 24, ring = false, title }) {
  if (!name) {
    return (
      <span className="pm-avatar pm-avatar-empty" style={{ width: size, height: size }} title={title || 'Unassigned'}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
      </span>
    );
  }
  return (
    <span className={`pm-avatar${ring ? ' pm-avatar-ring' : ''}`} style={{ width: size, height: size, background: colorFor(name), fontSize: Math.max(9, size * 0.4) }} title={title || name}>
      {initials(name)}
    </span>
  );
}

export function StatusLozenge({ status, overdue = false }) {
  const cat = CATEGORY_META[statusCategory(status)];
  return (
    <span className="pm-lozenge" style={{ background: cat.bg, color: cat.fg }} title={overdue ? `${status} — overdue` : status}>
      {status || 'Not Started'}
    </span>
  );
}

const EPIC_COLORS = ['#6E5DC6', '#0055CC', '#1F845A', '#B65C02', '#AE2E24', '#206A83', '#943D73', '#5B7F24'];
export function epicColor(epic) {
  return EPIC_COLORS[(epic?.issueNo || 0) % EPIC_COLORS.length];
}
export function EpicLozenge({ epic, onClick }) {
  if (!epic) return null;
  const c = epicColor(epic);
  return (
    <span className="pm-epic-lozenge" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }} onClick={onClick} title={`Epic: ${epic.devList}`}>
      {epic.devList}
    </span>
  );
}

export function IssueKey({ item, onOpen }) {
  return (
    <a className="pm-key" href={`?issue=${issueKey(item)}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen?.(item); }}>
      {issueKey(item)}
    </a>
  );
}

export function TypeAndKey({ item, onOpen }) {
  return (
    <span className="pm-typekey">
      <TypeIcon type={typeOf(item)} />
      <IssueKey item={item} onOpen={onOpen} />
    </span>
  );
}

// Anchored dropdown that closes on outside click or Escape.
export function Popover({ open, onClose, children, align = 'left', className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.parentElement.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className={`pm-popover pm-popover-${align} ${className}`}>{children}</div>;
}

// Status "transition" button: the current status as a lozenge-styled button that opens the list
// of statuses grouped by category, like Jira's workflow dropdown on the issue view.
export function StatusPicker({ status, statuses, onChange, disabled, size = 'md' }) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORY_META[statusCategory(status)];
  const groups = ['todo', 'inprogress', 'done'].map((c) => ({ c, list: statuses.filter((s) => statusCategory(s) === c) })).filter((g) => g.list.length);
  return (
    <span className="pm-rel">
      <button
        type="button"
        className={`pm-status-btn pm-status-${size}`}
        style={{ background: cat.bg, color: cat.fg }}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={disabled}
      >
        {status || 'Not Started'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <Popover open={open} onClose={() => setOpen(false)}>
        {groups.map((g) => (
          <div key={g.c}>
            <div className="pm-pop-head">{CATEGORY_META[g.c].label}</div>
            {g.list.map((s) => (
              <button type="button" key={s} className={`pm-pop-item${s === status ? ' is-active' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen(false); if (s !== status) onChange(s); }}>
                <StatusLozenge status={s} />
              </button>
            ))}
          </div>
        ))}
      </Popover>
    </span>
  );
}

export function Modal({ title, onClose, children, footer, width = 560, className = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="pm-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`pm-modal ${className}`} style={{ width: `min(${width}px, calc(100vw - 32px))` }} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {title != null && (
          <div className="pm-modal-head">
            <h2>{title}</h2>
            <button type="button" className="pm-icon-btn" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}
        <div className="pm-modal-body">{children}</div>
        {footer && <div className="pm-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ done, inprogress = 0, total, height = 6 }) {
  if (!total) return <div className="pm-progress" style={{ height }} />;
  return (
    <div className="pm-progress" style={{ height }} title={`${done} of ${total} done`}>
      <span style={{ width: `${(done / total) * 100}%`, background: CATEGORY_META.done.bar }} />
      <span style={{ width: `${(inprogress / total) * 100}%`, background: CATEGORY_META.inprogress.bar }} />
    </div>
  );
}
