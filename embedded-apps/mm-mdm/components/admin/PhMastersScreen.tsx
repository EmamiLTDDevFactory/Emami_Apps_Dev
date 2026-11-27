'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminSession } from '@/lib/admin/adminApi';
import { PhMaster, fetchMasters, setMasterStatus } from '@/lib/phApi';
import { ErrorState, LoadingState } from '../ui';
import { IconRefresh, IconSearch } from '../icons';
import { ConfirmDialog } from './wf/parts';

const LEVELS = [
  { level: 3, label: 'Product' },
  { level: 4, label: 'SKU' },
  { level: 5, label: 'Variant' },
  { level: 6, label: 'Scheme' },
] as const;
const SEG = [2, 4, 4, 3, 3, 2];

/** "02 · 0011" for the path above a master (banner, brand, ...) */
function under(parent: string) {
  const out: string[] = [];
  let at = 0;
  for (const n of SEG) { if (at >= parent.length) break; out.push(parent.slice(at, at + n)); at += n; }
  return out.join(' · ');
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Hierarchy masters maintenance: every Product, SKU, Variant and Scheme of the SAP product hierarchy (T179) with a status.
 * Active (default) masters appear in the F4 helps of Product Hierarchy Creation; deactive ones do not and cannot be used in a new request.
 */
export default function PhMastersScreen() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [level, setLevel] = useState<number>(3);
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<PhMaster[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { active: boolean; prodhs: string[] }>(null);
  const [done, setDone] = useState('');

  useEffect(() => { getAdminSession().then((s) => setIsAdmin(!!s.isAdmin)).catch((e: Error) => { setIsAdmin(false); setError(e.message); }); }, []);

  const load = useCallback(async (lvl: number, c: string, t: string, st: string) => {
    setState('loading'); setError(''); setSel(new Set());
    try {
      const r = await fetchMasters(lvl, { code: c.trim().replace(/\s/g, ''), text: t.trim().toUpperCase().replace(/\*/g, '*'), status: st });
      setRows(r.rows); setState('ready');
    } catch (e) { setError((e as Error).message); setState('error'); }
  }, []);

  useEffect(() => { if (isAdmin) void load(level, code, text, status); }, [isAdmin, level]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const r = rows || [];
    return { all: r.length, active: r.filter((x) => x.active).length, off: r.filter((x) => !x.active).length };
  }, [rows]);

  const names = LEVELS.find((l) => l.level === level)!.label;
  const allShown = !!rows && rows.length > 0 && rows.every((r) => sel.has(r.prodh));
  const toggleAll = () => setSel(allShown ? new Set() : new Set((rows || []).map((r) => r.prodh)));
  const toggle = (p: string) => setSel((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  async function apply(active: boolean, prodhs: string[]) {
    setBusy(true); setDone('');
    try {
      const r = await setMasterStatus(level, prodhs, active);
      setDone(`${r.updated} ${names.toLowerCase()} master${r.updated === 1 ? '' : 's'} ${active ? 'activated' : 'deactivated'}.`);
      setConfirm(null);
      await load(level, code, text, status);
    } catch (e) { setConfirm(null); setError((e as Error).message); setState('error'); } finally { setBusy(false); }
  }

  if (isAdmin === null) return <section className="card"><LoadingState text="Checking your access…" /></section>;
  if (!isAdmin) return <section className="card"><ErrorState title="Hierarchy masters maintenance" message={error || 'Only an Emami Apps admin of Material master may maintain the hierarchy masters.'} /></section>;

  return (
    <div className="wf-page">
      <section className="card wf-head">
        <div className="tabs" role="tablist" aria-label="Master level">
          {LEVELS.map((l) => (
            <button key={l.level} type="button" role="tab" aria-selected={level === l.level} className={`tab ${level === l.level ? 'on active' : ''}`}
              onClick={() => { setLevel(l.level); setDone(''); }}>{l.label}</button>
          ))}
        </div>
        <form className="wf-form" onSubmit={(e) => { e.preventDefault(); void load(level, code, text, status); }}>
          <div className="wf-form-fields">
            <label className="wf-frow"><span className="field-label">{names} code</span>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={4} inputMode="numeric" placeholder="any" aria-label={`${names} code`} /></label>
            <label className="wf-frow"><span className="field-label">Description</span>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="any, * allowed" aria-label="Description" /></label>
            <label className="wf-frow"><span className="field-label">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">All</option><option value="active">Active</option><option value="inactive">Deactive</option>
              </select></label>
          </div>
          <div className="wf-form-btns">
            <button type="submit" className="btn btn-primary btn-sm"><IconSearch size={14} /> Search</button>
            <button type="button" className="btn btn-sm" onClick={() => { setCode(''); setText(''); setStatus(''); void load(level, '', '', ''); }}><IconRefresh size={14} /> Reset</button>
            <span className="wf-form-sep" />
            <button type="button" className="btn btn-sm" disabled={!sel.size || busy} onClick={() => setConfirm({ active: true, prodhs: [...sel] })}>Activate selected ({sel.size})</button>
            <button type="button" className="btn btn-sm btn-danger-ghost" disabled={!sel.size || busy} onClick={() => setConfirm({ active: false, prodhs: [...sel] })}>Deactivate selected ({sel.size})</button>
          </div>
        </form>
      </section>

      {done && <p className="alert alert-info wf-ok" role="status">{done}</p>}

      <section className="card wf-pane">
        <div className="wf-pane-bar" style={{ cursor: 'default' }}>
          <h2>{names} masters</h2>
          <span className="muted">{state === 'ready' ? `${counts.all} found · ${counts.active} active · ${counts.off} deactive` : ''}</span>
        </div>
        {state === 'loading' && <LoadingState text={`Reading the ${names.toLowerCase()} masters from SAP…`} />}
        {state === 'error' && <ErrorState title="Could not load the masters" message={error} onRetry={() => void load(level, code, text, status)} />}
        {state === 'ready' && rows && rows.length === 0 && <div className="empty"><p>No {names.toLowerCase()} master matches.</p></div>}
        {state === 'ready' && rows && rows.length > 0 && (
          <div className="wf-list-scroll" style={{ maxHeight: 'calc(100vh - 360px)' }}>
            <table className="wf-grid wf-list-grid">
              <thead><tr>
                <th className="wf-c-chk"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label="Select all shown" /></th>
                <th>{names} code</th><th>Description</th><th>Under (banner · brand …)</th><th>Status</th><th>Changed by</th><th>Changed on</th><th />
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.prodh} className={`${sel.has(r.prodh) ? 'wf-sel' : ''} ${r.active ? '' : 'wf-off'}`}>
                    <td className="wf-c-chk"><input type="checkbox" checked={sel.has(r.prodh)} onChange={() => toggle(r.prodh)} aria-label={`Select ${r.code} ${r.text}`} /></td>
                    <td><span className="mono">{r.code}</span></td>
                    <td>{r.text || <span className="muted">-</span>}</td>
                    <td className="muted">{under(r.parent)}</td>
                    <td>{r.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-warn">Deactive</span>}</td>
                    <td className="muted">{r.changedBy}</td>
                    <td className="muted">{when(r.changedAt)}</td>
                    <td className="wf-c-end">
                      <button type="button" className={`btn btn-sm ${r.active ? 'btn-danger-ghost' : ''}`} disabled={busy}
                        onClick={() => (r.active ? setConfirm({ active: false, prodhs: [r.prodh] }) : void apply(true, [r.prodh]))}>
                        {r.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirm && (
        <ConfirmDialog title={confirm.active ? `Activate ${confirm.prodhs.length} ${names.toLowerCase()} master(s)?` : `Deactivate ${confirm.prodhs.length} ${names.toLowerCase()} master(s)?`}
          confirmText={confirm.active ? 'Activate' : 'Deactivate'} danger={!confirm.active} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void apply(confirm.active, confirm.prodhs)}>
          {confirm.active
            ? <p>They will appear in the value help of Product Hierarchy Creation again.</p>
            : <p>They will no longer be offered in the value help of Product Hierarchy Creation and a new request cannot use them. Requests already raised are not changed.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
