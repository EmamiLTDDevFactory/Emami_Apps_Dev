'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DragEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMdm } from '@/lib/store';
import {
  PhRequest, PhTask, fetchRequests, fetchTasks, phAllCached, phAllLoading, phApprove, phAssignCostCenter, phError, phFieldsOf, phInitiate, phLive, phLoad, phLoadAll,
  phReject, phReset, phSendBack, phSubscribe, phTick, phValidate,
} from '@/lib/phApi';
import { BUSINESS_VERTICALS, Opt, PH_LENGTH, PH_LEVELS, getHierarchyOptions, helpText, phSegLen } from '@/lib/valueHelps';
import {
  CRS_CODE_LEN, CRS_UNITS, CrsFile, CrsHelp, createCrs, createHierarchy, crsGroupingKey, crsOptions, listCrs, listHierarchies,
} from '@/lib/setupData';
import { CRS_PATH, CRS_TCODE, SETUP_PATH, SETUP_TCODE } from '@/lib/tcodes';
import { fmtAgo } from '@/lib/format';
import { ValueHelpDialog, ValueHelpField } from '../ValueHelp';
import CrsLive from './CrsLive';
import { IconArrowRight, IconBox, IconCheck, IconFile, IconGrid, IconRefresh, IconSparkle, IconTrash, IconTree, IconUpload } from '../icons';

type Mode = 'hierarchy' | 'crs';
const DESC_MAX = 40;

export default function HierarchyCrs({ only }: { only?: Mode }) {
  const params = useSearchParams();
  const router = useRouter();
  const mode: Mode = only ?? (params.get('mode') === 'crs' ? 'crs' : 'hierarchy');
  // Bumped after every create so the lists (kept outside React) are read again
  const [version, setVersion] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const modes: { id: Mode; title: string; sub: string; icon: JSX.Element; steps: string[] }[] = [
    {
      id: 'hierarchy', title: 'Product Hierarchy Creation', sub: 'Build the 18-digit PRDHA code level by level',
      icon: <IconTree size={22} />, steps: ['Banner', 'Brand', 'Product', 'SKU', 'Variant', 'Scheme'],
    },
    {
      id: 'crs', title: 'CRS Product Grouping', sub: 'Group CRS products by product group, SKU group and size',
      icon: <IconGrid size={22} />, steps: ['CRS product', 'Group', 'SKU group', 'Size'],
    },
  ];

  return (
    <div className="page">
      <div className="page-top">
        <div className="page-title">
          <span className="page-icon" aria-hidden><IconTree size={22} /></span>
          <div>
            <span className="tcode-chip">{mode === 'crs' ? CRS_TCODE : SETUP_TCODE}</span>
            <h1>{mode === 'crs' ? 'CRS Product Grouping' : 'Product Hierarchy'}</h1>
          </div>
        </div>
        <p className="muted su-lead">
          Set up the product hierarchy and CRS grouping before you create the material. New hierarchy codes are available in the
          {' '}<Link href="/master/material/new" className="su-link">new material request</Link> right after you submit them.
        </p>
      </div>

      {!only && <div className="su-modes" role="radiogroup" aria-label="What do you want to create?">
        {modes.map((m) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`su-mode ${on ? 'on' : ''}`}
              onClick={() => router.replace(m.id === 'crs' ? CRS_PATH : SETUP_PATH, { scroll: false })}
            >
              <span className="su-mode-icon" aria-hidden>{m.icon}</span>
              <span className="su-mode-text">
                <strong>{m.title}</strong>
                <small>{m.sub}</small>
                <span className="su-mode-steps" aria-hidden>
                  {m.steps.map((s, i) => (
                    <span key={s}>{s}{i < m.steps.length - 1 && <span className="su-chev">›</span>}</span>
                  ))}
                </span>
              </span>
              <span className="su-mode-check" aria-hidden>{on && <IconCheck size={13} />}</span>
            </button>
          );
        })}
      </div>}

      {mode === 'hierarchy'
        ? <HierarchyForm key="ph" version={version} mounted={mounted} onCreated={() => setVersion((v) => v + 1)} />
        : mounted && phLive()
          ? <CrsLive key="crs-live" />
          : <CrsForm key="crs" version={version} mounted={mounted} onCreated={() => setVersion((v) => v + 1)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared: SAP-style form banner and code + description row             */
/* ------------------------------------------------------------------ */

function FormBanner({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="su-banner">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
    </div>
  );
}

interface CodeRowProps {
  id: string;
  label: string;
  tech?: string;
  code: string;
  text: string;
  options: Opt[];
  len: number;
  numeric?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  error?: string;
  /** Suggested next free code (shown while the field is empty) */
  suggest?: string;
  /** F4 list independent of what is chosen above (value = full path); picking fills the levels above as well */
  helpOptions?: Opt[];
  helpLoading?: boolean;
  onHelp?: () => void;
  onPickFull?: (path: string, label: string) => void;
  onChange: (code: string, text: string) => void;
}

/** Code with F4 help + description. An existing code fills its description; a new code asks for one. */
function CodeRow({ id, label, tech, code, text, options, len, numeric, disabled, disabledHint, error, suggest, helpOptions, helpLoading, onHelp, onPickFull, onChange }: CodeRowProps) {
  const [raw, setRaw] = useState(code);
  const [open, setOpen] = useState(false);
  useEffect(() => setRaw(code), [code]);

  const hit = options.find((o) => o.value === code);
  const state = !code ? 'empty' : hit ? 'existing' : 'new';

  function commit(v: string) {
    let c = v.trim().toUpperCase();
    if (numeric && /^\d+$/.test(c)) c = c.padStart(len, '0');
    setRaw(c);
    if (c === code) return;
    const h = options.find((o) => o.value === c);
    onChange(c, h ? h.label : '');
  }

  return (
    <div className={`su-row ${disabled ? 'su-row-off' : ''} ${error ? 'field-error' : ''} field`}>
      <label htmlFor={id} className="su-label">
        {label}
        {tech && <span className="tech">{tech}</span>}
      </label>
      <div className="su-inputs">
        <div className="vh-input su-code">
          <input
            id={id}
            value={raw}
            disabled={disabled}
            maxLength={len}
            inputMode={numeric ? 'numeric' : undefined}
            placeholder={numeric ? '0'.repeat(len) : `${len} chars`}
            onChange={(e) => setRaw(numeric ? e.target.value.replace(/\D/g, '') : e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'F4') { e.preventDefault(); onHelp?.(); setOpen(true); }
              if (e.key === 'Enter') { e.preventDefault(); commit(raw); }
            }}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!error}
          />
          <button type="button" className="vh-btn" onClick={() => { onHelp?.(); setOpen(true); }} disabled={helpOptions ? false : disabled || options.length === 0} aria-label={`Search ${label} (F4)`} title="Existing values (F4)">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="4" width="9" height="9" rx="1" /><path d="M4 4V1.5A.5.5 0 0 1 4.5 1h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H10" /></svg>
          </button>
        </div>
        {state === 'new' ? (
          <input
            className="su-desc su-desc-new"
            value={text}
            maxLength={DESC_MAX}
            placeholder={`Description of the new ${label.toLowerCase()}`}
            onChange={(e) => onChange(code, e.target.value)}
            aria-label={`${label} description`}
          />
        ) : (
          <span className={`su-desc ${state === 'empty' ? 'su-desc-empty' : ''}`} aria-live="polite">{hit?.label ?? ''}</span>
        )}
        <span className={`su-state su-state-${state}`}>
          {state === 'existing' ? 'Existing' : state === 'new' ? 'New' : ''}
        </span>
      </div>
      {disabled && disabledHint ? (
        <small className="muted su-msg">{disabledHint}</small>
      ) : error ? (
        <small className="err su-msg">{error}</small>
      ) : state === 'empty' && suggest ? (
        <small className="su-msg">
          <button type="button" className="su-suggest" onClick={() => onChange(suggest, '')}>
            <IconSparkle size={12} /> Use next free code <span className="mono">{suggest}</span>
          </button>
        </small>
      ) : null}
      {open && (
        <ValueHelpDialog
          title={label}
          options={helpOptions ?? options}
          loading={helpLoading}
          current={code}
          currentLabel={helpOptions ? text : undefined}
          onPick={(v, l) => { setOpen(false); if (helpOptions && onPickFull) onPickFull(v, l); else onChange(v, options.find((o) => o.value === v)?.label ?? l); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

interface DescRowProps {
  id: string; label: string; code: string; text: string; options: Opt[]; disabled?: boolean; disabledHint?: string; error?: string;
  helpOptions: Opt[]; helpLoading?: boolean; onHelp: () => void; onPickFull: (path: string, label: string) => void;
  onChange: (code: string, text: string) => void;
}

/** Product / SKU / Variant / Scheme: the requester types the description, SAP gives the code after the final approver (an existing node can still be picked with F4) */
function DescRow({ id, label, code, text, options, disabled, disabledHint, error, helpOptions, helpLoading, onHelp, onPickFull, onChange }: DescRowProps) {
  const [open, setOpen] = useState(false);
  const existing = !!code;
  void options;
  return (
    <div className={`su-row ${disabled ? 'su-row-off' : ''} ${error ? 'field-error' : ''} field`}>
      <label htmlFor={id} className="su-label">{label}</label>
      <div className="su-inputs">
        <div className="vh-input su-desc-wide">
          <input
            id={id}
            value={text}
            disabled={disabled || existing}
            maxLength={DESC_MAX}
            placeholder={`Description of the new ${label.toLowerCase()}`}
            onChange={(e) => onChange('', e.target.value)}
            aria-invalid={!!error}
            autoComplete="off"
          />
          <button type="button" className="vh-btn" onClick={() => { onHelp(); setOpen(true); }} aria-label={`Pick an existing ${label} (F4)`} title="Pick an existing value (F4)">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="4" width="9" height="9" rx="1" /><path d="M4 4V1.5A.5.5 0 0 1 4.5 1h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H10" /></svg>
          </button>
        </div>
        {existing ? (
          <>
            <span className="su-state su-state-existing">Existing {code}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('', '')}>Create new instead</button>
          </>
        ) : text.trim() ? (
          <span className="su-state su-state-new" title="SAP generates the code when the final approver approves">New · code after final approval</span>
        ) : null}
      </div>
      {disabled && disabledHint ? <small className="muted su-msg">{disabledHint}</small> : error ? <small className="err su-msg">{error}</small> : null}
      {open && (
        <ValueHelpDialog title={label} options={helpOptions} loading={helpLoading} current={code} currentLabel={text}
          onPick={(v, l) => { setOpen(false); onPickFull(v, l); }} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function nextFree(options: Opt[], len: number, prefix = ''): string {
  const nums = options.map((o) => Number(o.value.slice(prefix.length))).filter((x) => Number.isFinite(x));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + String(n).padStart(len - prefix.length, '0');
}

/* ------------------------------------------------------------------ */
/* Product hierarchy creation                                           */
/* ------------------------------------------------------------------ */

interface Lvl { code: string; text: string }
const emptyLevels = (): Lvl[] => PH_LEVELS.map(() => ({ code: '', text: '' }));

function HierarchyForm({ version, mounted, onCreated }: { version: number; mounted: boolean; onCreated: () => void }) {
  const { user, notify } = useMdm();
  const [levels, setLevels] = useState<Lvl[]>(emptyLevels);
  const [tried, setTried] = useState(false);
  const [last, setLast] = useState('');

  const codes = levels.map((l) => l.code);
  const phVer = useSyncExternalStore(phSubscribe, phTick, phTick);
  // Live: load each level's values from SAP once the levels above are filled in
  useEffect(() => {
    if (!phLive()) return;
    for (let i = 0; i < PH_LEVELS.length; i++) {
      if (i > 0 && !(codes[i - 1].length === phSegLen(i - 1))) break;
      phLoad(i, codes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes.join('|')]);
  const loadErrors = phLive() ? PH_LEVELS.map((_, i) => phError(i, codes)).filter(Boolean) : [];
  // Options per level, given the codes above (a new parent has no existing children)
  const opts = useMemo(() => PH_LEVELS.map((_, i) => (codes.slice(0, i).every((c, j) => c.length === phSegLen(j)) ? getHierarchyOptions(i, codes) : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codes.join('|'), version, phVer]);

  const LAST_CODED = 1; // Banner and Brand are chosen by code; Product to Scheme get their code from SAP after the final approver
  const allOpts = useMemo(() => PH_LEVELS.map((_, i) => phAllCached(i) ?? []), [phVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = levels.map((l, i) => {
    const filledAbove = levels.slice(0, i).every((x, j) => (j <= LAST_CODED
      ? new RegExp(`^\\d{${phSegLen(j)}}$`).test(x.code) && !/^0+$/.test(x.code)
      : !!x.code || !!x.text.trim()));
    const isNew = i <= LAST_CODED ? !!l.code && !opts[i].some((o) => o.value === l.code) : !l.code;
    let error = '';
    if (filledAbove) {
      if (i > LAST_CODED) {
        if (!l.code && !l.text.trim()) error = `Enter the ${PH_LEVELS[i].toLowerCase()} description`;
      } else if (!l.code) error = `Enter the ${PH_LEVELS[i].toLowerCase()} code`;
      else if (!new RegExp(`^\\d{${phSegLen(i)}}$`).test(l.code) || /^0+$/.test(l.code)) error = `Use a ${phSegLen(i)}-digit code from ${'1'.padStart(phSegLen(i), '0')} to ${'9'.repeat(phSegLen(i))}`;
      else if (isNew && !l.text.trim()) error = `Describe the new ${PH_LEVELS[i].toLowerCase()}`;
    }
    const shownText = l.text || (i > LAST_CODED && l.code ? opts[i].find((o) => o.value === l.code)?.label ?? '' : '');
    if (!filledAbove) error = `Fill the ${PH_LEVELS[i - 1].toLowerCase()} first`;
    return { ...l, text: shownText, enabled: filledAbove, isNew, error };
  });

  const complete = rows.every((r) => r.enabled && !r.error);
  const anyNew = rows.some((r) => r.isNew);
  const pending = rows.some((r) => !r.code);
  const code = complete && !pending ? codes.join('') : '';

  function set(i: number, c: string, t: string) {
    // Changing a level clears every level below it
    setLevels((ls) => ls.map((l, j) => (j === i ? { code: c, text: t } : j > i && ls[i].code !== c ? { code: '', text: '' } : l)));
  }

  const [busy, setBusy] = useState(false);
  const [liveError, setLiveError] = useState('');

  async function submitLive() {
    setLiveError(''); setBusy(true);
    try {
      const f = phFieldsOf(rows.map((r) => ({ code: r.code, text: r.isNew ? r.text.trim() : r.text })));
      await phValidate(f, 'I');
      const res = await phInitiate(f);
      notify('success', res.message || 'Product hierarchy request raised');
      setLast(`${res.transactionId.replace(/^0+/, '')} (waiting for approval)`);
      setLevels(emptyLevels()); setTried(false); phReset(); onCreated();
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : 'The request could not be submitted.');
    } finally { setBusy(false); }
  }

  function submit() {
    setTried(true);
    if (!complete) { notify('error', 'Fill every level of the product hierarchy'); return; }
    if (phLive()) { void submitLive(); return; }
    const filled: string[] = [];
    const rec = createHierarchy(rows.map((r, i) => {
      const c = r.code || nextFree(getHierarchyOptions(i, filled.concat(Array(PH_LEVELS.length - filled.length).fill(''))), phSegLen(i));
      filled.push(c);
      return { code: c, text: r.isNew ? r.text.trim() : r.text, isNew: r.isNew };
    }), user.name);
    notify('success', `Product hierarchy ${rec.code} created (${rec.newLevels.length} new node${rec.newLevels.length === 1 ? '' : 's'})`);
    setLast(rec.code);
    setLevels(emptyLevels());
    setTried(false);
    onCreated();
  }

  const recent = mounted ? listHierarchies().slice(0, 6) : [];

  return (
    <div className="su-layout">
      <section className="card su-card" aria-labelledby="ph-form-title">
        <FormBanner title="MDM Product Hierarchy Creation" sub="Choose the banner and brand, then describe the product, SKU, variant and scheme – SAP generates their codes after the final approver." />
        <h3 id="ph-form-title" className="sr-only">Product hierarchy levels</h3>
        {loadErrors.length > 0 && <p className="err su-msg" role="alert">{loadErrors[0]}</p>}
        {liveError && <p className="err su-msg" role="alert" style={{ whiteSpace: 'pre-line' }}>{liveError}</p>}
        <div className="su-rows">
          {rows.map((r, i) => (i > LAST_CODED ? (
            <DescRow
              key={PH_LEVELS[i]}
              id={`ph-${i}`}
              label={PH_LEVELS[i]}
              code={r.code}
              text={r.text}
              options={r.enabled ? opts[i] : []}
              helpOptions={allOpts[i]}
              helpLoading={phAllLoading(i)}
              onHelp={() => { void phLoadAll(i); }}
              onPickFull={(c, t) => set(i, c, t)}
              error={tried ? r.error : ''}
              onChange={(c, t) => set(i, c, t)}
            />
          ) : (
            <CodeRow
              key={PH_LEVELS[i]}
              id={`ph-${i}`}
              label={PH_LEVELS[i]}
              code={r.code}
              text={r.text}
              options={r.enabled ? opts[i] : []}
              len={phSegLen(i)}
              numeric
              error={tried ? r.error : r.code && r.error && !r.error.startsWith('Describe') ? r.error : ''}
              suggest={mounted && r.enabled ? nextFree(opts[i], phSegLen(i)) : undefined}
              helpOptions={allOpts[i]}
              helpLoading={phAllLoading(i)}
              onHelp={() => { void phLoadAll(i); }}
              onPickFull={(c, t) => set(i, c, t)}
              onChange={(c, t) => set(i, c, t)}
            />
          )))}
          <div className="su-row field">
            <span className="su-label">Product hierarchy<span className="tech">PRDHA</span></span>
            <div className="su-inputs">
              <div className="ph-code su-ph-code" aria-live="polite" aria-label={`Product hierarchy ${codes.join('')}`}>
                {PH_LEVELS.map((name, i) => (
                  <span key={name} className={rows[i].code && !(rows[i].error && rows[i].code) ? 'ph-seg-on' : 'ph-seg-off'} title={name}>
                    {rows[i].code || (i > LAST_CODED && rows[i].text.trim() ? '…' : '·'.repeat(phSegLen(i)))}
                  </span>
                ))}
                <span className="ph-len">{codes.join('').length}/{PH_LENGTH}</span>
              </div>
            </div>
            {pending && complete && <small className="su-msg muted">The codes of Product, SKU, Variant and Scheme are generated by SAP after the final approver approves.</small>}
          </div>
        </div>
        <div className="su-actions">
          <button type="button" className="btn btn-ghost" onClick={() => { setLevels(emptyLevels()); setTried(false); }}><IconRefresh size={15} /> Clear</button>
          <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={busy}><IconCheck size={16} /> {busy ? 'Submitting…' : 'Submit'}</button>
        </div>
      </section>

      <aside className="su-side">
        <div className="card su-preview">
          <h4>Preview</h4>
          <ol className="su-tree">
            {rows.map((r, i) => (
              <li key={PH_LEVELS[i]} className={`su-node ${r.code ? 'on' : ''} ${r.isNew ? 'new' : ''}`} style={{ ['--d' as string]: i }}>
                <span className="su-node-dot" aria-hidden />
                <span className="su-node-text">
                  <small>{PH_LEVELS[i]}</small>
                  <strong>{r.code || r.text.trim() ? (r.text || (r.isNew ? 'New – add a description' : '')) : '—'}</strong>
                </span>
                {r.code ? <span className="mono su-node-code">{r.code}</span> : i > LAST_CODED && r.text.trim() ? <span className="su-tag" title="Generated after the final approver">code pending</span> : null}
                {r.isNew && <span className="su-tag">New</span>}
              </li>
            ))}
          </ol>
        </div>

        {phLive() && <PhInbox version={version} onChanged={() => { phReset(); onCreated(); }} />}

        {last && (
          <div className="card su-done">
            <span className="su-done-icon" aria-hidden><IconCheck size={18} /></span>
            <div>
              <strong>Hierarchy created</strong>
              <span className="mono">{last}</span>
              <Link href="/master/material/new" className="su-link">Create a material with it <IconArrowRight size={13} /></Link>
            </div>
          </div>
        )}

        <div className="card su-recent">
          <h4>Recently created</h4>
          {recent.length === 0 ? (
            <p className="muted small">No hierarchies created yet.</p>
          ) : (
            <ul>
              {recent.map((h) => (
                <li key={h.code + h.at}>
                  <span className="mono su-recent-code">{h.code}</span>
                  <span className="su-recent-text">{h.texts.slice(1, 4).join(' › ')}</span>
                  <small className="muted">{h.by} · {fmtAgo(h.at)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live: waiting for me (approve, assign cost centre, reject, send back) */
/* ------------------------------------------------------------------ */

function PhInbox({ version, onChanged }: { version: number; onChanged: () => void }) {
  const { notify } = useMdm();
  const [tasks, setTasks] = useState<PhTask[]>([]);
  const [reqs, setReqs] = useState<PhRequest[]>([]);
  const [cost, setCost] = useState<Record<string, string>>({});
  const [acting, setActing] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    fetchTasks().then(setTasks).catch((e: Error) => setError(e.message));
    fetchRequests({ top: 50 }).then(setReqs).catch(() => undefined);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [version]);

  async function run(t: PhTask, what: 'approve' | 'cost' | 'reject' | 'back') {
    const r = reqs.find((x) => x.transactionId === t.transactionId);
    setActing(t.wiId); setError('');
    try {
      let res: PhRequest;
      if (what === 'approve') {
        if (!r) throw new Error('The request details are not loaded yet. Refresh and try again.');
        res = await phApprove(t.wiId, phFieldsOf([
          { code: r.banner, text: r.bannerDesc }, { code: r.brand, text: r.brandDesc }, { code: r.product, text: r.productDesc },
          { code: r.sku, text: r.skuDesc }, { code: r.variant, text: r.variantDesc }, { code: r.scheme, text: r.schemeDesc }]));
      } else if (what === 'cost') {
        const cc = (cost[t.wiId] || '').trim().toUpperCase();
        if (!cc) throw new Error('Enter the cost centre first.');
        res = await phAssignCostCenter(t.wiId, cc);
      } else res = what === 'reject' ? await phReject(t.wiId) : await phSendBack(t.wiId);
      notify('success', res.message || 'Done');
      load(); onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally { setActing(''); }
  }

  return (
    <div className="card su-recent">
      <h4>Waiting for my action {tasks.length > 0 && <span className="su-tag">{tasks.length}</span>}</h4>
      {error && <p className="err small" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
      {tasks.length === 0 ? <p className="muted small">Nothing is waiting for you.</p> : (
        <ul>
          {tasks.map((t) => {
            const r = reqs.find((x) => x.transactionId === t.transactionId);
            return (
              <li key={t.wiId}>
                <span className="mono su-recent-code">{t.transactionId.replace(/^0+/, '')}</span>
                <span className="su-recent-text">{r ? [r.bannerDesc, r.brandDesc, r.productDesc, r.skuDesc].filter(Boolean).join(' › ') : t.text}</span>
                <small className="muted">{t.mode === 'C' ? 'Assign cost centre' : 'Approve'} · {t.initiator}</small>
                {t.mode === 'C' ? (
                  <span className="su-actions" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 6 }}>
                    <input aria-label="Cost centre" placeholder="BEH0000000" maxLength={10} value={cost[t.wiId] ?? ''} style={{ width: 130 }}
                      onChange={(e) => setCost((c) => ({ ...c, [t.wiId]: e.target.value }))} />
                    <button type="button" className="btn btn-primary btn-sm" disabled={acting === t.wiId} onClick={() => run(t, 'cost')}>Assign</button>
                  </span>
                ) : (
                  <span className="su-actions" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 6 }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={acting === t.wiId} onClick={() => run(t, 'approve')}>Approve</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={acting === t.wiId} onClick={() => run(t, 'back')}>Send back</button>
                    <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" disabled={acting === t.wiId} onClick={() => run(t, 'reject')}>Reject</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CRS product grouping                                                 */
/* ------------------------------------------------------------------ */

const CRS_FIELDS: { key: CrsHelp; label: string; prefix: string }[] = [
  { key: 'products', label: 'CRS Products', prefix: 'CP' },
  { key: 'productGroups', label: 'CRS Products Group', prefix: 'PG' },
  { key: 'skuGroups', label: 'CRS SKU Group', prefix: 'SG' },
];

type CrsCodes = Record<CrsHelp, Lvl>;
const emptyCrs = (): CrsCodes => ({ products: { code: '', text: '' }, productGroups: { code: '', text: '' }, skuGroups: { code: '', text: '' } });

function CrsForm({ version, mounted, onCreated }: { version: number; mounted: boolean; onCreated: () => void }) {
  const { user, notify } = useMdm();
  const [codes, setCodes] = useState<CrsCodes>(emptyCrs);
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState('');
  const [vertical, setVertical] = useState('');
  const [files, setFiles] = useState<CrsFile[]>([]);
  const [comments, setComments] = useState('');
  const [tried, setTried] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => ({ products: crsOptions('products'), productGroups: crsOptions('productGroups'), skuGroups: crsOptions('skuGroups') }), [version, mounted]);

  const sizeNum = Number(size);
  const grouping = crsGroupingKey(codes.products.code, codes.productGroups.code, codes.skuGroups.code, sizeNum, unit);

  const errors: Record<string, string> = {};
  CRS_FIELDS.forEach((f) => {
    const v = codes[f.key];
    const isNew = !!v.code && !options[f.key].some((o) => o.value === v.code);
    if (!v.code) errors[f.key] = `Enter the ${f.label.toLowerCase()}`;
    else if (v.code.length !== CRS_CODE_LEN[f.key]) errors[f.key] = `Use ${CRS_CODE_LEN[f.key]} characters`;
    else if (isNew && !v.text.trim()) errors[f.key] = 'Describe the new code';
  });
  if (!(sizeNum > 0)) errors.size = 'Enter a size greater than 0';
  if (!unit) errors.unit = 'Choose a unit';
  if (!vertical) errors.vertical = 'Choose a business vertical';
  const ok = Object.keys(errors).length === 0;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const add = Array.from(list).map((f) => ({ name: f.name, size: f.size }));
    setFiles((cur) => [...cur, ...add.filter((a) => !cur.some((c) => c.name === a.name))]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  }

  function reset() {
    setCodes(emptyCrs()); setSize(''); setUnit(''); setVertical(''); setFiles([]); setComments(''); setTried(false);
  }

  function submit() {
    setTried(true);
    if (!ok) { notify('error', 'Complete the highlighted fields'); return; }
    const newCodes: Partial<Record<CrsHelp, Opt>> = {};
    CRS_FIELDS.forEach((f) => {
      const v = codes[f.key];
      if (!options[f.key].some((o) => o.value === v.code)) newCodes[f.key] = { value: v.code, label: v.text.trim() };
    });
    const res = createCrs({
      crsProduct: codes.products.code, crsProductText: codes.products.text.trim().toUpperCase(),
      productGroup: codes.productGroups.code, productGroupText: codes.productGroups.text.trim().toUpperCase(),
      skuGroup: codes.skuGroups.code, skuGroupText: codes.skuGroups.text.trim().toUpperCase(),
      skuSize: sizeNum, unit, businessVertical: vertical, files, comments: comments.trim(), by: user.name,
    }, newCodes);
    if (typeof res === 'string') { notify('error', res); return; }
    notify('success', `CRS grouping ${res.grouping} created`);
    reset();
    onCreated();
  }

  const recent = mounted ? listCrs().slice(0, 6) : [];
  const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

  return (
    <div className="su-layout">
      <section className="card su-card" aria-labelledby="crs-form-title">
        <FormBanner title="CRS Product Group Creation" sub="Choose existing CRS codes with F4 or enter new ones, then size, unit and business vertical." />
        <h3 id="crs-form-title" className="sr-only">CRS grouping</h3>
        <div className="su-rows">
          {CRS_FIELDS.map((f) => (
            <CodeRow
              key={f.key}
              id={`crs-${f.key}`}
              label={f.label}
              code={codes[f.key].code}
              text={codes[f.key].text}
              options={options[f.key]}
              len={CRS_CODE_LEN[f.key]}
              error={tried ? errors[f.key] : ''}
              suggest={mounted ? nextFree(options[f.key], CRS_CODE_LEN[f.key], f.prefix) : undefined}
              onChange={(c, t) => setCodes((cur) => ({ ...cur, [f.key]: { code: c, text: t } }))}
            />
          ))}

          <div className={`su-row field ${tried && (errors.size || errors.unit) ? 'field-error' : ''}`}>
            <label htmlFor="crs-size" className="su-label">SKU size<span className="tech">SKUSIZE</span></label>
            <div className="su-inputs su-size">
              <div className="su-size-box">
                <input id="crs-size" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={size} onChange={(e) => setSize(e.target.value)} />
                <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
                  <option value="">Unit</option>
                  {CRS_UNITS.map((u) => <option key={u.value} value={u.value}>{u.value} – {u.label}</option>)}
                </select>
              </div>
            </div>
            {tried && (errors.size || errors.unit) && <small className="err su-msg">{errors.size || errors.unit}</small>}
          </div>

          <div className="su-row field">
            <span className="su-label">CRS grouping</span>
            <div className="su-inputs">
              <span className={`su-key ${grouping ? 'on' : ''}`} aria-live="polite">{grouping || 'Filled in from the fields above'}</span>
            </div>
          </div>

          <div className="su-row-vh">
            <ValueHelpField
              id="crs-vertical"
              label="Business vertical"
              value={vertical}
              options={BUSINESS_VERTICALS}
              onChange={setVertical}
              error={tried ? errors.vertical : undefined}
            />
          </div>
        </div>

        <div className="su-extra">
          <div>
            <span className="field-label">Attachments <span className="optional">optional</span></span>
            <div
              className={`su-drop ${drag ? 'drag' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
            >
              <span className="su-drop-icon" aria-hidden><IconUpload size={20} /></span>
              <span>
                <strong>Drop files here</strong> or{' '}
                <button type="button" className="su-link su-link-btn" onClick={() => fileRef.current?.click()}>browse</button>
              </span>
              <small className="muted">Artwork, spec sheets, approvals</small>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {files.length > 0 && (
              <ul className="su-files">
                {files.map((f) => (
                  <li key={f.name}>
                    <span className="su-file-icon" aria-hidden><IconFile size={15} /></span>
                    <span className="su-file-name" title={f.name}>{f.name}</span>
                    <small className="muted">{fmtSize(f.size)}</small>
                    <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => setFiles((cur) => cur.filter((x) => x.name !== f.name))} aria-label={`Delete ${f.name}`}>
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="field">
            <span className="field-label">Comments <span className="optional">optional</span></span>
            <textarea rows={5} value={comments} maxLength={1000} onChange={(e) => setComments(e.target.value)} placeholder="Anything the reviewer should know" />
            <small className="muted">{comments.length}/1000</small>
          </label>
        </div>

        <div className="su-actions">
          <button type="button" className="btn btn-ghost" onClick={reset}><IconRefresh size={15} /> Clear</button>
          <button type="button" className="btn btn-primary btn-lg" onClick={submit}><IconCheck size={16} /> Submit</button>
        </div>
      </section>

      <aside className="su-side">
        <div className="card su-preview">
          <h4>Summary</h4>
          <dl className="su-summary">
            {CRS_FIELDS.map((f) => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  {codes[f.key].code ? <><span className="mono">{codes[f.key].code}</span> {codes[f.key].text}</> : <span className="muted">—</span>}
                  {codes[f.key].code && !options[f.key].some((o) => o.value === codes[f.key].code) && <span className="su-tag">New</span>}
                </dd>
              </div>
            ))}
            <div><dt>Size</dt><dd>{sizeNum > 0 ? `${sizeNum.toFixed(2)} ${unit}` : <span className="muted">—</span>}</dd></div>
            <div><dt>Business vertical</dt><dd>{vertical ? `${vertical} ${helpText('businessVertical', vertical)}` : <span className="muted">—</span>}</dd></div>
            <div><dt>Attachments</dt><dd>{files.length || <span className="muted">None</span>}</dd></div>
          </dl>
        </div>

        <div className="card su-recent">
          <h4>Recently created</h4>
          {recent.length === 0 ? (
            <p className="muted small">No CRS groupings created yet.</p>
          ) : (
            <ul>
              {recent.map((c) => (
                <li key={c.grouping}>
                  <span className="mono su-recent-code">{c.grouping}</span>
                  <span className="su-recent-text">{options.products.find((o) => o.value === c.crsProduct)?.label ?? c.crsProductText}</span>
                  <small className="muted">{c.by} · {fmtAgo(c.at)}{c.files.length ? ` · ${c.files.length} file${c.files.length > 1 ? 's' : ''}` : ''}</small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link href="/master/material" className="card su-next">
          <span className="su-mode-icon" aria-hidden><IconBox size={18} /></span>
          <span><strong>Next: Material Master</strong><small className="muted">Create the material with this set-up</small></span>
          <IconArrowRight size={16} />
        </Link>
      </aside>
    </div>
  );
}
