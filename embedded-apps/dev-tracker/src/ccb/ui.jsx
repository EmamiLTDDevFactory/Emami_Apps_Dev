import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import { getCurrentUserEmail } from '../shared/api.js';
import { AlertIcon, CheckIcon, XIcon, ShieldIcon, RefreshIcon, SearchIcon } from '../shared/icons.jsx';
import { Avatar } from '../dashboard/workspace/ui.jsx';
import { ccbApi, searchDirectory } from './api.js';
import { PROCESS_STEPS, processState, ROLE_META } from './model.js';

export { Avatar };

/** Sidebar + Topbar frame shared by every CCB page. */
export function CcbShell({ active, onCreate, children }) {
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, [], [], profileName);
  useEffect(() => { if (!email) window.location.href = '/'; }, [email]);
  if (!email) return null;
  return (
    <div className="app-shell">
      <Sidebar active={active} isAdmin={isAdmin} email={email} name={profileName} identityInTopbar />
      <main className="shell-main ccb">
        <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={visibleNotifications} onMarkAllRead={markAllRead} onClear={clear} onCreate={onCreate} />
        {children}
      </main>
    </div>
  );
}

/** The caller's CCB identity and permissions. */
export function useCcbMe() {
  const [state, setState] = useState({ loading: true, me: null, error: null });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    ccbApi.me()
      .then((d) => setState({ loading: false, me: d.me, error: null }))
      .catch((e) => setState({ loading: false, me: null, error: e }));
  }, []);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

export function PageHeader({ eyebrow, title, sub, children }) {
  return (
    <div className="ccb-head">
      <div className="ccb-head-text">
        {eyebrow && <div className="ccb-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-header-sub">{sub}</p>}
      </div>
      {children && <div className="ccb-head-actions">{children}</div>}
    </div>
  );
}

export function Pill({ tone = 'gray', children, title, strong = false }) {
  return <span className={`ccb-pill tone-${tone}${strong ? ' is-strong' : ''}`} title={title}>{children}</span>;
}

/** IT landscape of a request: SAP / Non-SAP, or the older IT area it was logged under. */
export function LandscapePill({ system }) {
  if (!system) return null;
  const tone = system === 'SAP' ? 'blue' : system === 'Non-SAP' ? 'teal' : 'gray';
  return <Pill tone={tone} strong title={system === 'SAP' || system === 'Non-SAP' ? 'IT landscape' : 'Logged under an earlier IT area'}>{system}</Pill>;
}

/** Workbench / Customizing (SAP requests). */
export function ChangeTypePills({ types }) {
  return (types || []).map((t) => <Pill key={t} tone={t === 'Workbench' ? 'purple' : 'amber'} title="SAP change type">{t}</Pill>);
}

/** The landscape plus the areas affected, for detail views. */
export function LandscapeAreas({ system, modules, changeTypes }) {
  return (
    <span className="ccb-landscape-line">
      <LandscapePill system={system} />
      <ChangeTypePills types={changeTypes} />
      {(modules || []).map((m) => <span key={m} className="ccb-landscape-area">{m}</span>)}
    </span>
  );
}

export function Meta({ meta, value, strong }) {
  const m = meta[value];
  if (!m) return null;
  return <Pill tone={m.tone} strong={strong}>{m.label}</Pill>;
}

export function ScopePill({ category, categories }) {
  const c = categories[category];
  if (!c) return null;
  return (
    <span className={`ccb-scope ${c.inScope ? 'in' : 'out'}`} title={c.inScope ? 'Within CCB scope' : 'Outside CCB scope'}>
      <span className="ccb-scope-dot" />{c.label}
    </span>
  );
}

export function RoleBadge({ role }) {
  return <Pill tone={ROLE_META[role]?.tone || 'gray'}>{role}</Pill>;
}

export function Button({ variant = 'ghost', size, icon: Icon, children, busy, ...props }) {
  return (
    <button type="button" className={`ccb-btn ${variant}${size === 'sm' ? ' sm' : ''}`} disabled={busy || props.disabled} {...props}>
      {busy ? <span className="ccb-spin" /> : Icon ? <Icon size={size === 'sm' ? 13 : 15} /> : null}
      {children}
    </button>
  );
}

export function Card({ title, sub, actions, children, className = '', pad = true }) {
  return (
    <section className={`ccb-card ${className}`}>
      {(title || actions) && (
        <header className="ccb-card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {actions && <div className="ccb-card-actions">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'ccb-card-body' : ''}>{children}</div>
    </section>
  );
}

// `group` renders a <div> instead of a <label>, for fields made of several buttons (a <label>
// would forward clicks on its text to the first button).
export function Field({ label, hint, required, children, wide, group }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={`ccb-field${wide ? ' wide' : ''}`}>
      <span className="ccb-field-label">{label}{required && <em>*</em>}</span>
      {children}
      {hint && <span className="ccb-field-hint">{hint}</span>}
    </Tag>
  );
}

export function Modal({ title, sub, onClose, children, footer, width = 560 }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, textarea, select')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="ccb-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ccb-modal" style={{ maxWidth: width }} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <header className="ccb-modal-head">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="ccb-icon-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </header>
        <div className="ccb-modal-body">{children}</div>
        {footer && <footer className="ccb-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const show = useCallback((text, kind = 'ok') => setToast({ text, kind, at: Date.now() }), []);
  const node = toast && (
    <div className={`ccb-toast ${toast.kind}`} role="status">
      {toast.kind === 'error' ? <AlertIcon size={15} /> : <CheckIcon size={15} />}
      <span>{toast.text}</span>
    </div>
  );
  return [node, show];
}

export function Empty({ icon: Icon = ShieldIcon, title, children, action }) {
  return (
    <div className="ccb-empty">
      <span className="ccb-empty-icon"><Icon size={22} /></span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="ccb-loading"><span className="ccb-spin" /> {label}</div>;
}

/** Full-page message for missing access / load failures. */
export function Blocker({ error, onRetry }) {
  const denied = error?.status === 403;
  return (
    <div className="ccb-blocker">
      <span className={`ccb-blocker-icon${denied ? ' denied' : ''}`}>{denied ? <ShieldIcon size={26} /> : <AlertIcon size={26} />}</span>
      <h2>{denied ? 'No access yet' : error?.status === 401 ? 'Please sign in again' : 'Could not load the Change Control Board'}</h2>
      <p>{error?.message || 'Something went wrong.'}</p>
      {!denied && onRetry && <Button variant="primary" icon={RefreshIcon} onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function KpiTile({ label, value, sub, tone = 'indigo', icon: Icon, href, alert }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag className={`ccb-kpi tone-${tone}`} href={href}>
      <div className="ccb-kpi-top">
        <span className="ccb-kpi-icon">{Icon && <Icon size={16} />}</span>
        {alert && <span className="ccb-kpi-alert">{alert}</span>}
      </div>
      <div className="ccb-kpi-value">{value}</div>
      <div className="ccb-kpi-label">{label}</div>
      {sub && <div className="ccb-kpi-sub">{sub}</div>}
    </Tag>
  );
}

/** The nine-step CCB process for one request, with live state. */
export function ProcessStepper({ request, compact = false }) {
  const states = processState(request);
  return (
    <ol className={`ccb-stepper${compact ? ' compact' : ''}`}>
      {PROCESS_STEPS.map((step, i) => {
        const st = states[i];
        return (
          <li key={step.key} className={`ccb-step is-${st.state}`}>
            <span className="ccb-step-dot">
              {st.state === 'done' ? <CheckIcon size={12} /> : st.state === 'stopped' ? <XIcon size={11} /> : <span>{i + 1}</span>}
            </span>
            <div className="ccb-step-text">
              <div className="ccb-step-label">{step.label}</div>
              <div className="ccb-step-sub">{st.note || step.sub}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Person({ name, email, size = 22, sub }) {
  const label = name || email || '—';
  return (
    <span className="ccb-person">
      <Avatar name={label} size={size} />
      <span className="ccb-person-text">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </span>
    </span>
  );
}

export function DefinitionList({ rows }) {
  return (
    <dl className="ccb-dl">
      {rows.filter(Boolean).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v === null || v === undefined || v === '' ? <span className="ccb-muted">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="ccb-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className={value === t.key ? 'active' : ''} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined && <span className="ccb-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Prose({ children }) {
  if (!children) return <span className="ccb-muted">—</span>;
  return <div className="ccb-prose">{children}</div>;
}

/**
 * Type-ahead over the active Emami Apps user base (Admin Center), names from Entra ID. Typing searches live; picking a person calls
 * onChange({ name, email }). `value` is { name, email }; typing clears the email until a person is picked,
 * so a saved field always holds a directory person (name typed by hand only when the directory is unavailable).
 */
// `exclude(person)` hides people who must not be picked for this field (e.g. IT SPOCs).
export function DirectoryPicker({ value, onChange, placeholder = 'Search by name or email…', disabled, exclude }) {
  const [text, setText] = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle'); // idle | loading | done | error | off
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => { setText(value?.name || ''); }, [value?.name, value?.email]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    const q = text.trim();
    if (!open || q.length < 2 || (value?.email && q === value?.name)) { setResults([]); setState('idle'); return undefined; }
    const my = ++seq.current;
    setState('loading');
    const t = setTimeout(() => {
      searchDirectory(q)
        .then((d) => { if (my !== seq.current) return; setResults(exclude ? d.people.filter((p) => !exclude(p)) : d.people); setActive(0); setState(d.configured === false ? 'off' : 'done'); })
        .catch(() => { if (my === seq.current) { setResults([]); setState('error'); } });
    }, 250);
    return () => clearTimeout(t);
  }, [text, open, value?.email, value?.name]);

  const pick = (p) => { onChange({ name: p.name, email: p.email }); setText(p.name); setOpen(false); };

  return (
    <div className="ccb-picker" ref={boxRef}>
      <div className={`ccb-picker-input${value?.email ? ' is-picked' : ''}`}>
        {value?.email ? <Avatar name={value.name} size={22} /> : <SearchIcon size={14} />}
        <input
          className="ccb-input"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setText(e.target.value); setOpen(true); onChange({ name: e.target.value, email: '' }); }}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {value?.email && <span className="ccb-picker-mail">{value.email}</span>}
      </div>
      {open && text.trim().length >= 2 && !(value?.email && text === value.name) && (
        <div className="ccb-picker-menu" role="listbox">
          {state === 'loading' && <div className="ccb-picker-note"><span className="ccb-spin" /> Searching Emami Apps users…</div>}
          {state === 'error' && <div className="ccb-picker-note">User search is unavailable right now.</div>}
          {state === 'off' && <div className="ccb-picker-note">User search is not available on this server.</div>}
          {state === 'done' && !results.length && <div className="ccb-picker-note">No active Emami Apps user matches “{text.trim()}”.</div>}
          {state === 'done' && results.map((p, i) => (
            <button type="button" role="option" aria-selected={i === active} key={p.email} className={`ccb-picker-row${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              <Avatar name={p.name} size={28} />
              <span className="ccb-picker-text">
                <strong>{p.name}</strong>
                <small>{[p.jobTitle, p.department].filter(Boolean).join(' · ') || ' '}</small>
                <small className="ccb-mono">{p.email}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
