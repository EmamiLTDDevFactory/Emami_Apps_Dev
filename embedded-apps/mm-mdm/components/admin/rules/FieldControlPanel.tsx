'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeptOverride, FieldChange, FieldRow, FieldType, FieldView, UserDept, rulesApi } from '@/lib/admin/rulesApi';
import { ErrorState, LoadingState } from '../../ui';
import { IconRefresh, IconSave, IconTrash } from '../../icons';
import { ConfirmDialog, ErrorBox, OkBox } from './parts';

type Flags = { visible: boolean; required: boolean; displayOnly: boolean };
const PAGE = 120;

/**
 * Field control of a material type (SAP table /INOWITS/MDM_MCN). The highest version is the live one, so a change is published as a
 * new version (a copy of the live version with your changes). Older versions stay readable; the newest one can be removed again.
 */
export default function FieldControlPanel({ canEdit }: { canEdit: boolean }) {
  const [types, setTypes] = useState<FieldType[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [mtart, setMtart] = useState('');
  const [vrsn, setVrsn] = useState('');
  const [views, setViews] = useState<FieldView[]>([]);
  const [view, setView] = useState<string | null>(null);
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [rowsState, setRowsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [rowsError, setRowsError] = useState('');
  const [pending, setPending] = useState<Record<string, Flags>>({});
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [confirm, setConfirm] = useState<null | 'publish' | 'remove' | 'switch'>(null);
  const [switchTo, setSwitchTo] = useState<null | (() => void)>(null);
  const [ov, setOv] = useState<{ overrides: DeptOverride[]; userDepartments: UserDept[] } | null>(null);
  const [ovError, setOvError] = useState('');

  const type = types.find((t) => t.mtart === mtart);
  const active = type?.activeVersion ?? '';
  const isActive = !!type && vrsn === active;
  const nPending = Object.keys(pending).length;

  const loadTypes = useCallback(() => {
    setState('loading');
    rulesApi.fieldTypes().then((t) => { setTypes(t); setLoadError(''); setState('ready'); }).catch((e: Error) => { setLoadError(e.message); setState('error'); });
  }, []);
  useEffect(() => { loadTypes(); }, [loadTypes]);

  const loadViews = useCallback((mt: string, v: string) => {
    setViews([]); setView(null); setRows([]);
    rulesApi.fieldViews(mt, v).then((r) => setViews(r.views)).catch((e: Error) => { setRowsError(e.message); setRowsState('error'); });
  }, []);

  const loadRows = useCallback((mt: string, v: string, vw: string) => {
    setRowsState('loading'); setShown(PAGE);
    rulesApi.fieldRows(mt, v, vw === '' ? '(general)' : vw)
      .then((r) => { setRows(r.rows); setRowsError(''); setRowsState('idle'); })
      .catch((e: Error) => { setRowsError(e.message); setRowsState('error'); });
  }, []);

  const guard = (fn: () => void) => { if (nPending) { setSwitchTo(() => fn); setConfirm('switch'); } else fn(); };

  const pickType = (mt: string) => guard(() => {
    setMtart(mt); setPending({}); setOk(''); setError(null); setQ('');
    const t = types.find((x) => x.mtart === mt);
    setVrsn(t?.activeVersion ?? ''); setRowsError('');
    if (t) loadViews(mt, t.activeVersion); else { setViews([]); setView(null); setRows([]); }
  });
  const pickVersion = (v: string) => guard(() => { setVrsn(v); setPending({}); setOk(''); setRowsError(''); loadViews(mtart, v); });
  const pickView = (v: string) => { setView(v); setQ(''); loadRows(mtart, vrsn, v); };

  useEffect(() => {
    rulesApi.overrides().then(setOv).catch((e: Error) => setOvError(e.message));
  }, []);

  const flags = (r: FieldRow): Flags => pending[r.cnt] ?? { visible: r.visible, required: r.required, displayOnly: r.displayOnly };
  const setFlag = (r: FieldRow, k: keyof Flags, val: boolean) => {
    const next = { ...flags(r), [k]: val };
    setOk('');
    setPending((p) => {
      const copy = { ...p };
      if (next.visible === r.visible && next.required === r.required && next.displayOnly === r.displayOnly) delete copy[r.cnt]; else copy[r.cnt] = next;
      return copy;
    });
  };

  const filtered = useMemo(() => {
    const n = q.trim().toUpperCase();
    return n ? rows.filter((r) => r.field.includes(n) || r.text.toUpperCase().includes(n)) : rows;
  }, [rows, q]);

  const publish = async () => {
    setBusy('publish'); setError(null);
    try {
      const changes: FieldChange[] = Object.entries(pending).map(([cnt, f]) => ({ cnt, ...f }));
      const r = await rulesApi.publishField(mtart, changes);
      setConfirm(null); setPending({}); setOk(r.message);
      const t = await rulesApi.fieldTypes(); setTypes(t);
      setVrsn(r.newVersion); loadViews(mtart, r.newVersion);
    } catch (e) { setConfirm(null); setError(e); } finally { setBusy(''); }
  };
  const remove = async () => {
    setBusy('remove'); setError(null);
    try {
      const r = await rulesApi.deleteFieldVersion(mtart, vrsn);
      setConfirm(null); setPending({}); setOk(r.message);
      const t = await rulesApi.fieldTypes(); setTypes(t);
      const nt = t.find((x) => x.mtart === mtart);
      if (nt) { setVrsn(nt.activeVersion); loadViews(mtart, nt.activeVersion); }
    } catch (e) { setConfirm(null); setError(e); } finally { setBusy(''); }
  };

  if (state === 'loading') return <section className="card"><LoadingState /></section>;
  if (state === 'error') return <section className="card"><ErrorState message={loadError} onRetry={loadTypes} /></section>;

  return (
    <>
      <section className="card">
        <div className="grid-form rl-pick">
          <div className="field">
            <label className="field-label" htmlFor="fc-type">Material type</label>
            <select id="fc-type" value={mtart} onChange={(e) => pickType(e.target.value)}>
              <option value="">Select a material type…</option>
              {types.map((t) => <option key={t.mtart} value={t.mtart}>{t.mtart} · {t.text} (version {t.activeVersion} live)</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fc-ver">Version</label>
            <select id="fc-ver" value={vrsn} disabled={!type} onChange={(e) => pickVersion(e.target.value)}>
              {!type && <option value="">—</option>}
              {type?.versions.map((v) => <option key={v.vrsn} value={v.vrsn}>{v.vrsn}{v.vrsn === active ? ' (live)' : ''} · {v.rows} rows</option>)}
            </select>
            <small className="muted">The highest version is the one requests use.</small>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fc-view">Screen</label>
            <select id="fc-view" value={view ?? '__none'} disabled={!views.length} onChange={(e) => pickView(e.target.value === '__none' ? '' : e.target.value)}>
              <option value={'__none'} disabled>{views.length ? 'Select a screen…' : '—'}</option>
              {views.map((v) => <option key={v.view || '(general)'} value={v.view}>{v.label} ({v.fields} fields{v.headings ? `, ${v.headings} headings` : ''})</option>)}
            </select>
          </div>
        </div>
        {type && !isActive && <div className="alert alert-info rl-msg" role="status"><div><p>Version {vrsn} is an older version and is shown read only. Requests use version {active}.</p></div></div>}
      </section>

      {type && view !== null && (
        <section className="card card-flush">
          <div className="toolbar">
            <input className="search" type="search" value={q} aria-label="Filter fields" placeholder="Filter by field name or text" onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
            <span className="count muted">{filtered.length} of {rows.length} rows{nPending ? ` · ${nPending} changed` : ''}</span>
          </div>
          {rowsState === 'loading' && <LoadingState />}
          {rowsState === 'error' && <ErrorState message={rowsError} onRetry={() => loadRows(mtart, vrsn, view)} />}
          {rowsState === 'idle' && filtered.length === 0 && <div className="empty"><p>{rows.length ? 'No field matches the filter.' : 'This screen has no field control rows in this version.'}</p></div>}
          {rowsState === 'idle' && filtered.length > 0 && (
            <div className="table-wrap">
              <table className="table fc-table">
                <thead><tr><th>Field</th><th>Description</th><th className="rl-num">Visible</th><th className="rl-num">Required</th><th className="rl-num">Display only</th><th>Column</th></tr></thead>
                <tbody>
                  {filtered.slice(0, shown).map((r) => {
                    const f = flags(r);
                    const changed = !!pending[r.cnt];
                    const edit = canEdit && isActive && !r.heading;
                    return (
                      <tr key={r.cnt} className={changed ? 'fc-changed' : ''}>
                        <td data-label="Field"><span className="matno">{r.field}</span>{r.heading && <span className="pill"> heading</span>}</td>
                        <td data-label="Description" className="muted">{r.text}</td>
                        {(['visible', 'required', 'displayOnly'] as const).map((k) => (
                          <td key={k} className="rl-num" data-label={k === 'displayOnly' ? 'Display only' : k === 'visible' ? 'Visible' : 'Required'}>
                            <input type="checkbox" checked={f[k]} disabled={!edit} aria-label={`${r.field} ${k === 'displayOnly' ? 'display only' : k}`} onChange={(e) => setFlag(r, k, e.target.checked)} />
                          </td>
                        ))}
                        <td data-label="Column">{r.col === 'L' ? 'Left' : r.col === 'R' ? 'Right' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > shown && <div className="rl-more"><button type="button" className="btn btn-sm" onClick={() => setShown((s) => s + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</button></div>}
        </section>
      )}

      {type && (
        <section className="card">
          <ErrorBox error={error} />
          <OkBox text={ok} />
          <div className="form-actions rl-foot">
            {canEdit && isActive && type.versions.length > 1 && (
              <button type="button" className="btn btn-danger-ghost" disabled={!!busy} onClick={() => setConfirm('remove')}><IconTrash size={14} /> Remove version {vrsn}</button>
            )}
            <span className="rl-spacer" />
            <button type="button" className="btn" disabled={!!busy} onClick={() => { rulesApi.fieldTypes().then(setTypes).catch(() => undefined); if (view !== null) loadRows(mtart, vrsn, view); setPending({}); }}><IconRefresh size={14} /> Reload</button>
            {canEdit && <button type="button" className="btn btn-primary" disabled={!!busy || !isActive || nPending === 0} onClick={() => setConfirm('publish')}><IconSave size={14} /> Publish as version {active ? String(Number(active) + 1).padStart(3, '0') : ''}</button>}
          </div>
        </section>
      )}

      <details className="card rl-tester">
        <summary><strong>Department overrides</strong> <span className="muted">read only: fields allowed per department, level and material type</span></summary>
        {ovError && <ErrorState title="Could not read the overrides" message={ovError} />}
        {!ov && !ovError && <LoadingState />}
        {ov && (
          <>
            <p className="muted">When a user belongs to a department and an override exists for the request level and material type, only the listed fields are shown. These are maintained in SAP (table maintenance), not here.</p>
            {ov.overrides.length === 0 ? <div className="empty"><p>No overrides are maintained.</p></div> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Level</th><th>Department</th><th>Material type</th><th>Field</th><th>Required</th><th>Display only</th></tr></thead>
                <tbody>{ov.overrides.map((o, i) => <tr key={i}><td>{o.level}</td><td>{o.dept}</td><td>{o.mtart}</td><td>{o.field}</td><td>{o.required ? 'Yes' : 'No'}</td><td>{o.displayOnly ? 'Yes' : 'No'}</td></tr>)}</tbody>
              </table></div>
            )}
            <h3 className="rl-sub">Users and departments</h3>
            {ov.userDepartments.length === 0 ? <div className="empty"><p>No user is assigned to a department.</p></div> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>User</th><th>Department</th></tr></thead>
                <tbody>{ov.userDepartments.map((u) => <tr key={u.user}><td>{u.user}</td><td>{u.dept}</td></tr>)}</tbody>
              </table></div>
            )}
          </>
        )}
      </details>

      {confirm === 'publish' && (
        <ConfirmDialog title="Publish a new version?" confirmText="Publish" busy={busy === 'publish'} onCancel={() => setConfirm(null)} onConfirm={publish}>
          <p>This writes version {String(Number(active) + 1).padStart(3, '0')} of {mtart} with your {nPending} change{nPending === 1 ? '' : 's'}. New requests of this material type use it immediately. You can remove it again afterwards.</p>
        </ConfirmDialog>
      )}
      {confirm === 'remove' && (
        <ConfirmDialog title={`Remove version ${vrsn}?`} confirmText="Remove" danger busy={busy === 'remove'} onCancel={() => setConfirm(null)} onConfirm={remove}>
          <p>Version {vrsn} of {mtart} is deleted and the previous version becomes the live one again. Do you want to continue?</p>
        </ConfirmDialog>
      )}
      {confirm === 'switch' && (
        <ConfirmDialog title="Discard unsaved changes?" confirmText="Discard" danger onCancel={() => { setConfirm(null); setSwitchTo(null); }} onConfirm={() => { const fn = switchTo; setConfirm(null); setSwitchTo(null); fn?.(); }}>
          <p>You changed {nPending} field{nPending === 1 ? '' : 's'} and did not publish them. Discard the changes?</p>
        </ConfirmDialog>
      )}
    </>
  );
}
