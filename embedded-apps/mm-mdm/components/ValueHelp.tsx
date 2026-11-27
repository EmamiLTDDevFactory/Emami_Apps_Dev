'use client';

import { KeyboardEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Opt, PH_LENGTH, PH_LEVELS, decodeHierarchy, getHierarchyOptions, phSegLen, splitHierarchy } from '@/lib/valueHelps';
import { phError, phLive, phLoad, phLoadCode, phSubscribe, phTick } from '@/lib/phApi';

/* ------------------------------------------------------------------ */
/* Value help field: code input + F4 pop-up + description               */
/* ------------------------------------------------------------------ */

interface ValueHelpFieldProps {
  id: string;
  label: string;
  tech?: string;
  required?: boolean;
  value: string;
  options: Opt[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown under the field while it is disabled, e.g. "Choose a plant first" */
  disabledHint?: string;
  error?: string;
  /** Returns a reason when a value exists but may not be chosen */
  blockedReason?: (value: string) => string | undefined;
}

export function ValueHelpField({ id, label, tech, required, value, options, onChange, disabled, disabledHint, error, blockedReason }: ValueHelpFieldProps) {
  const [text, setText] = useState(value);
  const [localError, setLocalError] = useState('');
  const [open, setOpen] = useState(false);

  // Keep the typed text when an invalid entry clears the stored value
  const keepText = useRef(false);
  useEffect(() => {
    if (keepText.current) { keepText.current = false; return; }
    setText(value);
    setLocalError('');
  }, [value]);

  const selected = options.find((x) => x.value === value);

  function commit(raw: string) {
    const code = raw.trim().toUpperCase();
    setText(code);
    if (!code) {
      setLocalError('');
      if (value) onChange('');
      return;
    }
    const hit = options.find((x) => x.value.toUpperCase() === code);
    if (!hit) {
      setLocalError(`Value ${code} does not exist. Press F4 or use the search button.`);
      if (value) { keepText.current = true; onChange(''); }
      return;
    }
    const blocked = blockedReason?.(hit.value);
    if (blocked) {
      setLocalError(`${hit.value}: ${blocked}`);
      if (value) { keepText.current = true; onChange(''); }
      return;
    }
    setLocalError('');
    if (hit.value !== value) onChange(hit.value);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'F4') {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(text);
    }
  }

  const msg = localError || error;

  return (
    <div className={`field vh-field ${msg ? 'field-error' : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="req">*</span>}
        {tech && <span className="tech">{tech}</span>}
      </label>
      <div className="vh-row">
        <div className="vh-input">
          <input
            id={id}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value.toUpperCase())}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!msg}
            aria-describedby={`${id}-desc`}
          />
          <button type="button" className="vh-btn" onClick={() => setOpen(true)} disabled={disabled} aria-label={`Search ${label} (F4)`} title="Value help (F4)">
            <VhIcon />
          </button>
        </div>
        <span id={`${id}-desc`} className="vh-desc">{selected?.label ?? ''}</span>
      </div>
      {disabled && disabledHint ? <small className="muted">{disabledHint}</small> : msg ? <small className="err">{msg}</small> : null}
      {open && (
        <ValueHelpDialog
          title={label}
          options={options}
          current={value}
          blockedReason={blockedReason}
          onPick={(v) => { setOpen(false); setLocalError(''); onChange(v); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function VhIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1" y="4" width="9" height="9" rx="1" />
      <path d="M4 4V1.5A.5.5 0 0 1 4.5 1h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H10" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Value help dialog ("Select: Material Type")                          */
/* ------------------------------------------------------------------ */

export function ValueHelpDialog({ title, options, current, blockedReason, loading, onPick, onClose }: {
  title: string;
  options: Opt[];
  current: string;
  blockedReason?: (value: string) => string | undefined;
  loading?: boolean;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => first.current?.focus(), []);

  const rows = useMemo(() => {
    const c = code.trim().toUpperCase();
    const d = desc.trim().toUpperCase();
    // as SAP: "*" is a wildcard (whole value must match the pattern), without it the text may appear anywhere
    const match = (v: string, q: string) => {
      if (!q) return true;
      const t = v.toUpperCase();
      if (!q.includes('*')) return t.includes(q);
      return new RegExp(`^${q.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(t);
    };
    return options.filter((x) => match(x.value, c) && match(x.label, d));
  }, [options, code, desc]);

  return (
    <div className="overlay overlay-center" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog vh-dialog" role="dialog" aria-modal="true" aria-labelledby="vh-title" onClick={(e) => e.stopPropagation()}>
        <div className="vh-dialog-head">
          <h2 id="vh-title">Select: {title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="vh-filters">
          <label className="field">
            <span className="field-label">{title}</span>
            <input ref={first} value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
          </label>
          <label className="field">
            <span className="field-label">Description</span>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
        </div>
        <h4>Items ({rows.length})</h4>
        <div className="vh-table-wrap">
          <table className="table vh-table">
            <thead>
              <tr><th aria-label="Select" /><th>{title}</th><th>Description</th></tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const blocked = blockedReason?.(x.value);
                return (
                  <tr
                    key={x.value}
                    className={`${x.value === current ? 'vh-current' : ''} ${blocked ? 'vh-blocked' : ''}`}
                    onClick={() => !blocked && onPick(x.value)}
                    title={blocked}
                  >
                    <td>
                      <input
                        type="radio"
                        name="vh-pick"
                        checked={x.value === current}
                        disabled={!!blocked}
                        onChange={() => onPick(x.value)}
                        aria-label={`${x.value} ${x.label}`}
                      />
                    </td>
                    <td className="matno">{x.value}</td>
                    <td>{x.label}{blocked && <small className="muted"> – {blocked}</small>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={3} className="empty">{loading ? 'Loading the values from SAP…' : 'No values match.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Product hierarchy: 18-character code + cascading pop-up              */
/* ------------------------------------------------------------------ */

export function ProductHierarchyField({ id, value, onChange, error, required }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  const [text, setText] = useState(value);
  const [localError, setLocalError] = useState('');
  const [open, setOpen] = useState(false);

  // Keep the typed text when an invalid entry clears the stored value
  const keepText = useRef(false);
  useEffect(() => {
    if (keepText.current) { keepText.current = false; return; }
    setText(value);
    setLocalError('');
  }, [value]);

  usePhTick();
  // Live: the level texts of the stored code come from SAP
  useEffect(() => { if (value && phLive()) phLoadCode(value); }, [value]);
  const decoded = value ? decodeHierarchy(value) : null;

  function commit(raw: string) {
    const code = raw.replace(/\s/g, '');
    setText(code);
    if (!code) {
      setLocalError('');
      if (value) onChange('');
      return;
    }
    if (!decodeHierarchy(code).valid) {
      setLocalError(`Enter a valid ${PH_LENGTH}-digit hierarchy, or use the search button`);
      if (value) { keepText.current = true; onChange(''); }
      return;
    }
    setLocalError('');
    if (code !== value) onChange(code);
  }

  const msg = localError || error;

  return (
    <div className={`field field-wide ${msg ? 'field-error' : ''}`}>
      <label htmlFor={id} className="field-label">
        Prod. hierarchy{required && <span className="req">*</span>}<span className="tech">PRDHA</span>
      </label>
      <div className="vh-row">
        <div className="vh-input vh-input-wide">
          <input
            id={id}
            className="mono"
            value={text}
            maxLength={PH_LENGTH}
            inputMode="numeric"
            onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'F4') { e.preventDefault(); setOpen(true); }
              if (e.key === 'Enter') { e.preventDefault(); commit(text); }
            }}
            placeholder={`${PH_LENGTH} digits`}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!msg}
          />
          <button type="button" className="vh-btn vh-btn-search" onClick={() => setOpen(true)} aria-label="Build product hierarchy" title="Build product hierarchy (F4)">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="7" cy="7" r="5" /><path d="M11 11l4 4" /></svg>
          </button>
        </div>
        {decoded?.valid && (
          <span className="ph-path">
            {decoded.parts.map((p) => <span key={p.level} title={`${p.level} ${p.code}`}>{p.text}</span>)}
          </span>
        )}
      </div>
      {msg && <small className="err">{msg}</small>}
      {open && (
        <ProductHierarchyDialog
          initial={value}
          onSelect={(code) => { setOpen(false); setLocalError(''); onChange(code); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ProductHierarchyDialog({ initial, onSelect, onClose }: { initial: string; onSelect: (code: string) => void; onClose: () => void }) {
  const [path, setPath] = useState<string[]>(() => (decodeHierarchy(initial).valid ? splitHierarchy(initial) : []));
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => first.current?.focus(), []);
  usePhTick();
  // Live: load the next level's values as soon as the levels above are chosen
  useEffect(() => {
    if (!phLive()) return;
    for (let i = 0; i <= path.length && i < PH_LEVELS.length; i++) phLoad(i, path);
  }, [path]);
  const loadError = phLive() ? phError(Math.min(path.length, PH_LEVELS.length - 1), path) : '';

  // The code grows by one level's digits with every level chosen
  const code = path.join('');
  const complete = path.length === PH_LEVELS.length;

  function pick(level: number, v: string) {
    // Changing a level clears every level below it
    setPath((p) => (v ? [...p.slice(0, level), v] : p.slice(0, level)));
  }

  return (
    <div className="overlay overlay-center" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog ph-dialog" role="dialog" aria-modal="true" aria-labelledby="ph-title" onClick={(e) => e.stopPropagation()}>
        <div className="vh-dialog-head">
          <h2 id="ph-title">Product hierarchy</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ph-form">
          {PH_LEVELS.map((name, i) => {
            const enabled = i <= path.length;
            const opts = enabled ? getHierarchyOptions(i, path) : [];
            return (
              <label key={name} className="ph-row">
                <span className="field-label">{name}</span>
                <select
                  ref={i === 0 ? first : undefined}
                  value={path[i] ?? ''}
                  disabled={!enabled}
                  onChange={(e) => pick(i, e.target.value)}
                >
                  <option value="">{enabled ? 'Choose…' : `Choose ${PH_LEVELS[i - 1].toLowerCase()} first`}</option>
                  {opts.map((o) => <option key={o.value} value={o.value}>{o.value} – {o.label}</option>)}
                </select>
              </label>
            );
          })}
          {loadError && <small className="err">{loadError}</small>}
          <div className="ph-row">
            <span className="field-label">Prod. hierarchy</span>
            <div className="ph-code" aria-live="polite">
              {PH_LEVELS.map((name, i) => (
                <span key={name} className={path[i] ? 'ph-seg-on' : 'ph-seg-off'} title={name}>{path[i] ?? '·'.repeat(phSegLen(i))}</span>
              ))}
              <span className="ph-len">{code.length}/{PH_LENGTH}</span>
            </div>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!complete} onClick={() => onSelect(code)}>Select</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Long text line with edit pencil                                      */
/* ------------------------------------------------------------------ */

export function LongTextField({ value, onChange, max, error }: { value: string; onChange: (v: string) => void; max: number; error?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <div className={`field field-wide ${error ? 'field-error' : ''}`}>
      <span className="field-label">Long text<span className="tech">TDLINE</span></span>
      <div className="vh-row">
        <div className="longtext-line" title={value}>{value || <span className="muted">No long text</span>}</div>
        <button type="button" className="vh-btn vh-btn-plain" onClick={() => { setDraft(value); setOpen(true); }} aria-label="Edit long text" title="Edit long text">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 2l3 3-8.5 8.5L2 14l.5-3.5z" /></svg>
        </button>
      </div>
      {error && <small className="err">{error}</small>}
      {open && (
        <div className="overlay overlay-center" onClick={() => setOpen(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="lt-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="lt-title">Material long text</h2>
            <label className="field">
              <span className="field-label">Text</span>
              <textarea rows={6} value={draft} maxLength={max} onChange={(e) => setDraft(e.target.value)} autoFocus />
              <small className="muted">{draft.length}/{max}</small>
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => { onChange(draft.trim()); setOpen(false); }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Re-renders the component whenever a hierarchy level finishes loading from SAP */
function usePhTick() {
  return useSyncExternalStore(phSubscribe, phTick, phTick);
}
