'use client';

/**
 * CRS product grouping against the real SAP service (replaces Web Dynpro ZCRS_PRODUCT_GROUP).
 *
 * Rules taken from the Web Dynpro and the live data:
 *  - three levels: CRS product (9 digits) > CRS group (2-3 digits) > CRS SKU group (3 digits)
 *  - "new" = leave the code blank and give a description; SAP assigns the code when the approver approves
 *  - under a new parent every child is new as well
 *  - business vertical and one supporting document are required; size and unit belong to the SKU group
 *  - the request goes to the approver; the approver sees it in "Waiting for my approval"
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMdm } from '@/lib/store';
import {
  CrsRequest, CrsTask, CrsValueRow, CrsVertical, PhApiError, crsApprove, crsInitiate, crsReject, crsValidate,
  fetchCrsRequests, fetchCrsTasks, fetchCrsValues, fetchCrsVerticals,
} from '@/lib/phApi';
import { CRS_UNITS } from '@/lib/setupData';
import { fmtAgo } from '@/lib/format';
import { ValueHelpDialog } from '../ValueHelp';
import { IconCheck, IconFile, IconRefresh, IconTrash, IconUpload } from '../icons';

const DESC_MAX = 40;
const MAX_FILE = 3 * 1024 * 1024;

interface Lvl { code: string; text: string }
const none = (): Lvl => ({ code: '', text: '' });

/** SAP stores the date as YYYYMMDD and the time as HHMMSS */
function sapAgo(d: string, t: string): string {
  if (!/^\d{8}$/.test(d || '')) return '';
  const tt = /^\d{6}$/.test(t || '') ? t : '000000';
  return fmtAgo(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${tt.slice(0, 2)}:${tt.slice(2, 4)}:${tt.slice(4, 6)}`);
}

const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

interface RowProps {
  id: string; label: string; tech: string;
  value: Lvl; options: { value: string; label: string }[];
  /** the level above is new (or not chosen yet): nothing exists below it */
  forcedNew: boolean; forcedHint?: string;
  loading: boolean; error?: string;
  onChange: (v: Lvl) => void;
}

function LevelRow({ id, label, tech, value, options, forcedNew, forcedHint, loading, error, onChange }: RowProps) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(value.code);
  useEffect(() => setRaw(value.code), [value.code]);
  const hit = options.find((o) => o.value === value.code);
  const state = value.code ? (hit ? 'existing' : 'unknown') : value.text ? 'new' : 'empty';

  function commit(v: string) {
    const c = v.trim().toUpperCase();
    setRaw(c);
    if (c === value.code) return;
    const h = options.find((o) => o.value === c);
    onChange({ code: c, text: h ? h.label : '' });
  }

  return (
    <div className={`su-row field ${forcedNew ? 'su-row-off' : ''} ${error ? 'field-error' : ''}`}>
      <label htmlFor={id} className="su-label">{label}<span className="tech">{tech}</span></label>
      <div className="su-inputs">
        <div className="vh-input su-code">
          <input
            id={id}
            value={raw}
            disabled={forcedNew}
            maxLength={10}
            placeholder={forcedNew ? 'new' : 'code'}
            onChange={(e) => setRaw(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'F4') { e.preventDefault(); setOpen(true); }
              if (e.key === 'Enter') { e.preventDefault(); commit(raw); }
            }}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!error}
          />
          <button type="button" className="vh-btn" onClick={() => setOpen(true)} disabled={forcedNew || options.length === 0}
            aria-label={`Search ${label} (F4)`} title={options.length ? 'Existing values (F4)' : loading ? 'Loading…' : 'No existing values'}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="4" width="9" height="9" rx="1" /><path d="M4 4V1.5A.5.5 0 0 1 4.5 1h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H10" /></svg>
          </button>
        </div>
        {value.code ? (
          <span className="su-desc" aria-live="polite">{hit?.label ?? ''}</span>
        ) : (
          <input
            className="su-desc su-desc-new"
            value={value.text}
            maxLength={DESC_MAX}
            placeholder={`New – describe it`}
            onChange={(e) => onChange({ code: '', text: e.target.value })}
            aria-label={`${label} description`}
          />
        )}
        <span className={`su-state su-state-${state === 'existing' ? 'existing' : state === 'new' ? 'new' : 'empty'}`}>
          {state === 'existing' ? 'Existing' : state === 'new' ? 'New' : ''}
        </span>
      </div>
      {forcedNew && forcedHint ? <small className="muted su-msg">{forcedHint}</small>
        : error ? <small className="err su-msg">{error}</small>
        : state === 'unknown' ? <small className="err su-msg">{loading ? 'Checking…' : 'This code does not exist – clear it to create a new one'}</small>
        : null}
      {open && (
        <ValueHelpDialog
          title={label}
          options={options}
          current={value.code}
          onPick={(v) => { setOpen(false); onChange({ code: v, text: options.find((o) => o.value === v)?.label ?? '' }); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

const opt = (rows: CrsValueRow[]) => rows.map((r) => ({ value: r.code, label: r.text }));

export default function CrsLive() {
  const { notify } = useMdm();
  const [product, setProduct] = useState<Lvl>(none);
  const [group, setGroup] = useState<Lvl>(none);
  const [sku, setSku] = useState<Lvl>(none);
  const [vertical, setVertical] = useState('');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState('');
  const [comments, setComments] = useState('');
  const [file, setFile] = useState<{ name: string; type: string; size: number; data: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<CrsRequest | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [verticals, setVerticals] = useState<CrsVertical[]>([]);
  const [products, setProducts] = useState<CrsValueRow[]>([]);
  const [groups, setGroups] = useState<CrsValueRow[]>([]);
  const [skus, setSkus] = useState<CrsValueRow[]>([]);
  const [loading, setLoading] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [requests, setRequests] = useState<CrsRequest[]>([]);
  const [tasks, setTasks] = useState<CrsTask[]>([]);
  const [acting, setActing] = useState('');

  const track = useCallback(<T,>(p: Promise<T>) => {
    setLoading((n) => n + 1);
    return p.finally(() => setLoading((n) => n - 1));
  }, []);
  const fail = (e: unknown) => setLoadError(e instanceof Error ? e.message : 'The CRS service could not be read.');

  const refreshLists = useCallback(() => {
    track(fetchCrsRequests(15)).then(setRequests).catch(fail);
    track(fetchCrsTasks()).then(setTasks).catch(() => setTasks([]));
  }, [track]);

  useEffect(() => {
    track(fetchCrsVerticals()).then(setVerticals).catch(fail);
    track(fetchCrsValues(1)).then(setProducts).catch(fail);
    refreshLists();
  }, [track, refreshLists]);

  const productExists = !!product.code && products.some((p) => p.code === product.code);
  const groupExists = !!group.code && groups.some((g) => g.code === group.code);

  useEffect(() => {
    setGroups([]);
    if (!productExists) return;
    track(fetchCrsValues(2, product.code)).then(setGroups).catch(fail);
  }, [product.code, productExists, track]);

  useEffect(() => {
    setSkus([]);
    if (!productExists || !groupExists) return;
    track(fetchCrsValues(3, product.code, group.code)).then(setSkus).catch(fail);
  }, [product.code, group.code, productExists, groupExists, track]);

  // An existing SKU group brings its size and unit
  useEffect(() => {
    const hit = skus.find((s) => s.code === sku.code);
    if (hit) { setSize(hit.skuSize ? String(Number(hit.skuSize)) : ''); setUnit(hit.unit || ''); }
  }, [sku.code, skus]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const lvl = (k: string, v: Lvl, list: CrsValueRow[], parentOk: boolean, name: string) => {
      if (!v.code && !v.text.trim()) e[k] = `Enter the ${name} code or describe a new one`;
      else if (v.code && parentOk && list.length > 0 && !list.some((x) => x.code === v.code)) e[k] = `${name} ${v.code} does not exist`;
    };
    lvl('product', product, products, true, 'CRS product');
    lvl('group', group, groups, productExists, 'CRS group');
    lvl('sku', sku, skus, productExists && groupExists, 'CRS SKU group');
    if (!vertical) e.vertical = 'Choose a business vertical';
    if (!file) e.file = 'Upload the supporting document to proceed';
    if (size && !(Number(size) > 0)) e.size = 'Size must be greater than 0';
    if (size && !unit) e.size = 'Choose the unit of the size';
    return e;
  }, [product, group, sku, products, groups, skus, productExists, groupExists, vertical, file, size, unit]);

  const fields = () => ({
    crsProd: product.code, crsProdDesc: product.text.trim(), prdGrp: group.code, prdGrpDesc: group.text.trim(),
    skuGrp: sku.code, skuGrpDesc: sku.text.trim(), busVert: vertical, skuSize: size ? Number(size).toFixed(2) : '', unit: size ? unit : '',
    comments: comments.trim(),
  });

  async function pickFile(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (f.size > MAX_FILE) { notify('error', `The file is larger than ${fmtSize(MAX_FILE)}`); return; }
    setFile({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: toBase64(await f.arrayBuffer()) });
  }

  function reset() {
    setProduct(none()); setGroup(none()); setSku(none()); setVertical(''); setSize(''); setUnit(''); setComments('');
    setFile(null); setTried(false); setFormError('');
  }

  async function submit() {
    setTried(true); setFormError(''); setDone(null);
    if (Object.keys(errors).length) { notify('error', 'Complete the highlighted fields'); return; }
    setBusy(true);
    try {
      await crsValidate(fields(), 'I');
      const res = await crsInitiate({ ...fields(), flName: file!.name, flType: file!.type, flData: file!.data });
      setDone(res);
      notify('success', res.message || 'CRS request raised');
      reset();
      refreshLists();
    } catch (e) {
      setFormError(e instanceof PhApiError || e instanceof Error ? e.message : 'The request could not be submitted.');
    } finally { setBusy(false); }
  }

  async function act(kind: 'approve' | 'reject', t: CrsTask) {
    setActing(t.wiId);
    try {
      const req = requests.find((r) => r.transactionId === t.transactionId);
      const res = kind === 'approve'
        ? await crsApprove(t.wiId, { skuSize: req?.skuSize && Number(req.skuSize) > 0 ? req.skuSize : '', unit: req?.unit ?? '', comments: req?.comments ?? '' })
        : await crsReject(t.wiId);
      notify('success', res.message || (kind === 'approve' ? 'Approved' : 'Rejected'));
      refreshLists();
      if (kind === 'approve') fetchCrsValues(1).then(setProducts).catch(() => undefined);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'The action failed.');
    } finally { setActing(''); }
  }

  const err = (k: string) => (tried ? errors[k] : undefined);

  return (
    <div className="su-layout">
      <section className="card su-card" aria-labelledby="crs-live-title">
        <div className="su-banner">
          <div>
            <h2 id="crs-live-title">CRS Product Group Creation</h2>
            <p>Pick existing CRS codes with F4, or leave a code blank and describe a new one – SAP gives it a number when the request is approved.</p>
          </div>
        </div>
        {loadError && <p className="err su-msg" role="alert">{loadError}</p>}
        {formError && <p className="err su-msg" role="alert" style={{ whiteSpace: 'pre-line' }}>{formError}</p>}

        <div className="su-rows">
          <LevelRow id="crs-prod" label="CRS Products" tech="CRSPRD" value={product} options={opt(products)} forcedNew={false}
            loading={loading > 0} error={err('product')}
            onChange={(v) => { setProduct(v); setGroup(none()); setSku(none()); }} />
          <LevelRow id="crs-grp" label="CRS Products Group" tech="PRD_GRP" value={group} options={opt(groups)} forcedNew={!productExists && !!(product.code || product.text)}
            forcedHint="The CRS product is new, so its group is new as well" loading={loading > 0} error={err('group')}
            onChange={(v) => { setGroup(v); setSku(none()); }} />
          <LevelRow id="crs-sku" label="CRS SKU Group" tech="SKU_GRP" value={sku} options={opt(skus)}
            forcedNew={(!productExists && !!(product.code || product.text)) || (!groupExists && !!(group.code || group.text))}
            forcedHint="The CRS group is new, so its SKU group is new as well" loading={loading > 0} error={err('sku')}
            onChange={setSku} />

          <div className={`su-row field ${err('size') ? 'field-error' : ''}`}>
            <label htmlFor="crs-size" className="su-label">SKU size<span className="tech">ZSKUSIZE</span></label>
            <div className="su-inputs su-size">
              <div className="su-size-box">
                <input id="crs-size" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={size} onChange={(e) => setSize(e.target.value)} />
                <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
                  <option value="">Unit</option>
                  {CRS_UNITS.map((u) => <option key={u.value} value={u.value}>{u.value} – {u.label}</option>)}
                </select>
              </div>
            </div>
            {err('size') && <small className="err su-msg">{err('size')}</small>}
          </div>

          <div className={`su-row field ${err('vertical') ? 'field-error' : ''}`}>
            <label htmlFor="crs-vertical" className="su-label">Business vertical<span className="tech">ZBUSINESS</span></label>
            <div className="su-inputs">
              <select id="crs-vertical" value={vertical} onChange={(e) => setVertical(e.target.value)} aria-invalid={!!err('vertical')}>
                <option value="">Select…</option>
                {verticals.map((v) => <option key={v.code} value={v.code}>{v.code} – {v.text}</option>)}
              </select>
            </div>
            {err('vertical') && <small className="err su-msg">{err('vertical')}</small>}
          </div>
        </div>

        <div className="su-extra">
          <div>
            <span className="field-label">Supporting document <span className="optional" style={{ color: 'var(--err, #b3261e)' }}>required</span></span>
            <div className={`su-drop ${drag ? 'drag' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files); }}>
              <span className="su-drop-icon" aria-hidden><IconUpload size={20} /></span>
              <span><strong>Drop the file here</strong> or{' '}
                <button type="button" className="su-link su-link-btn" onClick={() => fileRef.current?.click()}>browse</button></span>
              <small className="muted">One file, up to {fmtSize(MAX_FILE)}</small>
              <input ref={fileRef} type="file" hidden onChange={(e) => { pickFile(e.target.files); e.target.value = ''; }} />
            </div>
            {err('file') && <small className="err su-msg">{err('file')}</small>}
            {file && (
              <ul className="su-files">
                <li>
                  <span className="su-file-icon" aria-hidden><IconFile size={15} /></span>
                  <span className="su-file-name" title={file.name}>{file.name}</span>
                  <small className="muted">{fmtSize(file.size)}</small>
                  <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => setFile(null)} aria-label={`Delete ${file.name}`}><IconTrash size={14} /></button>
                </li>
              </ul>
            )}
          </div>
          <label className="field">
            <span className="field-label">Comments <span className="optional">optional</span></span>
            <textarea rows={5} value={comments} maxLength={255} onChange={(e) => setComments(e.target.value)} placeholder="Anything the approver should know" />
            <small className="muted">{comments.length}/255</small>
          </label>
        </div>

        <div className="su-actions">
          <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}><IconRefresh size={15} /> Clear</button>
          <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={busy}><IconCheck size={16} /> {busy ? 'Submitting…' : 'Submit'}</button>
        </div>
      </section>

      <aside className="su-side">
        {done && (
          <div className="card su-done">
            <span className="su-done-icon" aria-hidden><IconCheck size={18} /></span>
            <div><strong>Request raised</strong><span className="mono">{done.transactionId.replace(/^0+/, '')}</span><small className="muted">{done.message}</small></div>
          </div>
        )}

        <div className="card su-recent">
          <h4>Waiting for my approval {tasks.length > 0 && <span className="su-tag">{tasks.length}</span>}</h4>
          {tasks.length === 0 ? <p className="muted small">Nothing is waiting for you.</p> : (
            <ul>
              {tasks.map((t) => {
                const r = requests.find((x) => x.transactionId === t.transactionId);
                return (
                  <li key={t.wiId}>
                    <span className="mono su-recent-code">{t.transactionId.replace(/^0+/, '')}</span>
                    <span className="su-recent-text">{r ? `${r.crsProdDesc} › ${r.prdGrpDesc} › ${r.skuGrpDesc}` : t.text}</span>
                    <small className="muted">{t.initiator}{r ? ` · ${sapAgo(r.createdOn, r.createdAt)}` : ''}</small>
                    <span className="su-actions" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 6 }}>
                      <button type="button" className="btn btn-primary btn-sm" disabled={acting === t.wiId} onClick={() => act('approve', t)}>Approve</button>
                      <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" disabled={acting === t.wiId} onClick={() => act('reject', t)}>Reject</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card su-recent">
          <h4>Recent requests</h4>
          {requests.length === 0 ? <p className="muted small">No requests yet.</p> : (
            <ul>
              {requests.slice(0, 8).map((r) => (
                <li key={r.transactionId}>
                  <span className="mono su-recent-code">{r.transactionId.replace(/^0+/, '')}</span>
                  <span className="su-recent-text">{r.crsProdDesc} › {r.prdGrpDesc} › {r.skuGrpDesc}</span>
                  <small className="muted">{r.step === 'C' ? `Created ${r.crsProd}/${r.prdGrp}/${r.skuGrp}` : 'Waiting for approval'} · {r.initiator} · {sapAgo(r.createdOn, r.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
