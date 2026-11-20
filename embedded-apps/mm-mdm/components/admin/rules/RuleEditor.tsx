'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DuplicateRow, RuleItem, RuleScreen, rulesApi } from '@/lib/admin/rulesApi';
import { ErrorState, LoadingState } from '../../ui';
import { IconCopy, IconPlus, IconSave, IconTrash, IconUndo } from '../../icons';
import { ConfirmDialog, ErrorBox, OkBox, pad3, targetRow } from './parts';

interface Row { uid: number; ruleId: string; datele: string; value: string; ftype: 'I' | 'R'; condition: string; isDefault: boolean; desc: string }
type Confirm = null | { kind: 'set' } | { kind: 'rule'; ruleId: string };

let uidSeq = 1;
const toRow = (i: RuleItem): Row => ({ uid: uidSeq++, ruleId: i.ruleId, datele: i.datele, value: i.value, ftype: i.ftype === 'R' ? 'R' : 'I', condition: i.condition, isDefault: i.isDefault, desc: i.dateleDesc });
const blank = (ruleId: string, ftype: 'I' | 'R'): Row => ({ uid: uidSeq++, ruleId, datele: '', value: '', ftype, condition: '', isDefault: ftype === 'R', desc: '' });
const snapshot = (ptype: string, rows: Row[]) => JSON.stringify([ptype, rows.map(({ ruleId, datele, value, ftype, condition, isDefault }) => [ruleId, datele, value, ftype, condition, isDefault])]);

/** One rule set: header (description) and its rules (Input rows = conditions, Output rows = the values that get defaulted) */
export default function RuleEditor({ app, screen, ruleSetId, canEdit, onDirty, onChanged, onDeleted }: {
  app: string; screen: RuleScreen; ruleSetId: string | null; canEdit: boolean;
  onDirty: (d: boolean) => void; onChanged: (id: string) => void; onDeleted: () => void;
}) {
  const isNew = ruleSetId === null;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(isNew ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState('');
  const [description, setDescription] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [ptype, setPtype] = useState('H');
  const [rows, setRows] = useState<Row[]>([]);
  const [baseHead, setBaseHead] = useState('');
  const [baseRules, setBaseRules] = useState(() => snapshot('H', []));
  const [baseCount, setBaseCount] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [dups, setDups] = useState<DuplicateRow[] | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [help, setHelp] = useState<{ datele: string; text: string }[]>([]);
  const descCache = useRef<Record<string, string>>({});
  const helpTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(() => {
    if (!ruleSetId) return;
    setState('loading');
    rulesApi.getSet(ruleSetId)
      .then((d) => {
        const r = d.items.map(toRow);
        const p = d.items[0]?.ptype || 'H';
        d.items.forEach((i) => { if (i.dateleDesc) descCache.current[i.datele] = i.dateleDesc; });
        setDescription(d.description); setFilterValue(d.filterValue); setPtype(p); setRows(r);
        setBaseHead(JSON.stringify([d.description, d.filterValue])); setBaseRules(snapshot(p, r)); setBaseCount(r.length);
        setError(null); setDups(null); setState('ready');
      })
      .catch((e: Error) => { setLoadError(e.message); setState('error'); });
  }, [ruleSetId]);
  useEffect(() => { load(); }, [load]);

  const headDirty = state === 'ready' && !isNew && JSON.stringify([description, filterValue]) !== baseHead;
  const rulesDirty = state === 'ready' && snapshot(ptype, rows) !== baseRules;
  const dirty = headDirty || rulesDirty || (isNew && (!!description || !!filterValue));
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const ruleIds = useMemo(() => Array.from(new Set(rows.map((r) => r.ruleId))).sort(), [rows]);
  const hasOr = rows.some((r) => r.condition === 'OR');
  const errRow = useMemo(() => targetRow(error), [error]);

  const patch = (uid: number, p: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...p } : r))); setOk(''); setDups(null); };
  const nextId = () => pad3(ruleIds.length ? Math.max(...ruleIds.map(Number)) + 1 : 1);

  const newRule = () => { const id = nextId(); setRows((rs) => [...rs, blank(id, 'I'), blank(id, 'R')]); setOk(''); };
  const copyRule = (ruleId: string) => { const id = nextId(); setRows((rs) => [...rs, ...rs.filter((r) => r.ruleId === ruleId).map((r) => ({ ...r, uid: uidSeq++, ruleId: id }))]); setOk(''); };
  const addRow = (ruleId: string, ftype: 'I' | 'R') => setRows((rs) => {
    const at = rs.map((r) => r.ruleId).lastIndexOf(ruleId);
    const next = [...rs]; next.splice(at + 1, 0, blank(ruleId, ftype)); return next;
  });
  const removeRow = (r: Row) => setRows((rs) => rs.filter((x) => x.uid !== r.uid));
  const removeRule = (ruleId: string) => setRows((rs) => rs.filter((x) => x.ruleId !== ruleId));

  const onFieldInput = (r: Row, v: string) => {
    patch(r.uid, { datele: v.toUpperCase(), desc: descCache.current[v.toUpperCase()] ?? '' });
    clearTimeout(helpTimer.current);
    const q = v.trim();
    if (q.length < 2 && !screen.screen) { setHelp([]); return; }
    helpTimer.current = setTimeout(() => {
      rulesApi.fieldHelp(app, screen.screen, q)
        .then((f) => { f.forEach((x) => { if (x.text) descCache.current[x.datele] = x.text; }); setHelp(f.map((x) => ({ datele: x.datele, text: x.text }))); })
        .catch(() => setHelp([]));
    }, 250);
  };
  const dateleDesc = (r: Row) => r.desc || descCache.current[r.datele] || '';

  const items = (): RuleItem[] => [...rows]
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
    .map((r) => ({ ruleId: r.ruleId, datele: r.datele.trim(), value: r.value, condition: r.condition, ftype: r.ftype, dateleDesc: r.desc, ptype, isDefault: r.isDefault }));

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what); setError(null); setOk('');
    try { await fn(); } catch (e) { setError(e); } finally { setBusy(''); }
  };

  const createSet = () => run('header', async () => {
    const r = await rulesApi.saveSet({ app, fgroup: screen.fgroup, description, filterValue });
    onDirty(false); onChanged(r.ruleSetId);
  });

  const save = () => run('rules', async () => {
    if (!ruleSetId) return;
    let msg = '';
    if (headDirty) { msg = (await rulesApi.saveSet({ ruleSetId, app, fgroup: screen.fgroup, description, filterValue })).message; setBaseHead(JSON.stringify([description, filterValue])); }
    if (rulesDirty) { msg = (await rulesApi.saveRules(ruleSetId, items())).message; }
    setOk(msg);
    load(); onChanged(ruleSetId);
  });

  const validate = () => run('validate', async () => {
    if (!ruleSetId) return;
    const r = await rulesApi.validate(ruleSetId, rows.length ? items() : undefined);
    setDups(r.duplicates); setOk(r.duplicates.length ? '' : r.message);
  });

  const doDelete = () => {
    const c = confirm; if (!c) return;
    run('delete', async () => {
      if (c.kind === 'set' && ruleSetId) { await rulesApi.deleteSet(ruleSetId); setConfirm(null); onDeleted(); return; }
      if (c.kind === 'rule' && ruleSetId) {
        const onlyOne = ruleIds.length === 1;
        if (onlyOne && baseCount > 0) {
          // the last rule of a stored set cannot be "saved away" (a save needs rows): delete it in SAP, as the old Delete did
          await rulesApi.deleteRule(ruleSetId, c.ruleId);
          setConfirm(null); setOk('Rule deleted successfully'); load(); onChanged(ruleSetId); return;
        }
        removeRule(c.ruleId); setConfirm(null);
      }
    });
  };

  if (state === 'loading') return <section className="card"><LoadingState text="Loading the rule set from SAP…" /></section>;
  if (state === 'error') return <section className="card"><ErrorState message={loadError} onRetry={load} /></section>;

  const ro = !canEdit;
  return (
    <section className="card rl-editor" aria-label={isNew ? 'New rule set' : `Rule set ${ruleSetId}`}>
      <div className="card-head">
        <h2>{isNew ? 'New rule set' : `Rule set ${ruleSetId}`} <span className="pill">{screen.screen}</span></h2>
        <p className="muted">{isNew ? 'A rule set sets one field. Give it a description and save it first; the rules can be added afterwards.' : 'A rule set sets one field. The first matching rule (lowest rule id) wins.'}</p>
      </div>

      <div className="grid-form">
        <div className="field field-wide">
          <label className="field-label" htmlFor="rl-desc">Rule set description<span className="req">*</span></label>
          <input id="rl-desc" value={description} maxLength={100} disabled={ro} onChange={(e) => { setDescription(e.target.value); setOk(''); }} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rl-filter">Data value filter</label>
          <input id="rl-filter" value={filterValue} maxLength={10} disabled={ro} onChange={(e) => setFilterValue(e.target.value.toUpperCase())} />
          <small className="muted">Informational only, the engine does not read it.</small>
        </div>
        {!isNew && (
          <div className="field">
            <label className="field-label" htmlFor="rl-ptype">Priority of the rules</label>
            <select id="rl-ptype" value={ptype} disabled={ro} onChange={(e) => { setPtype(e.target.value); setOk(''); }}>
              <option value="H">High</option><option value="M">Medium</option><option value="L">Low</option>
            </select>
            <small className="muted">Same for all rules of the set.</small>
          </div>
        )}
      </div>

      {isNew && (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" disabled={ro || !!busy || !description.trim()} onClick={createSet}><IconSave size={14} /> {busy === 'header' ? 'Saving…' : 'Create rule set'}</button>
        </div>
      )}

      {!isNew && (
        <>
          <div className="rl-rules-head">
            <h3>Rules</h3>
            {!ro && <button type="button" className="btn btn-sm" onClick={newRule}><IconPlus size={14} /> New rule</button>}
          </div>
          {rows.length === 0 && <div className="empty"><p>This rule set has no rules yet.</p></div>}
          {hasOr && <div className="alert alert-warn rl-msg" role="status"><div><p>Condition OR is saved, but material requests only apply rules where every input matches (AND).</p></div></div>}

          <datalist id="rl-fields">{help.map((h) => <option key={h.datele} value={h.datele}>{h.text}</option>)}</datalist>
          {ruleIds.map((rid) => (
            <fieldset key={rid} className="rl-rule">
              <legend>Rule {rid}</legend>
              <div className="rl-row rl-head" aria-hidden="true"><span>Field name</span><span>Value</span><span>Type</span><span>Condition</span><span>Default</span><span /></div>
              {rows.map((r, idx) => r.ruleId !== rid ? null : (
                <div key={r.uid} className={`rl-row ${r.ftype === 'R' ? 'rl-out' : ''} ${idx === errRow ? 'rl-err' : ''}`}>
                  <div className="rl-cell">
                    <label><span className="rl-lbl">Field name</span>
                      <input list="rl-fields" value={r.datele} maxLength={30} disabled={ro} autoComplete="off" spellCheck={false} placeholder="e.g. MTART" aria-label={`Rule ${rid} field name`}
                        onChange={(e) => onFieldInput(r, e.target.value)} />
                    </label>
                    {dateleDesc(r) && <small className="muted">{dateleDesc(r)}</small>}
                  </div>
                  <label className="rl-cell"><span className="rl-lbl">Value</span>
                    <input value={r.value} maxLength={40} disabled={ro} autoComplete="off" spellCheck={false} aria-label={`Rule ${rid} value`} placeholder={r.ftype === 'R' ? 'empty = clears the field' : ''}
                      onChange={(e) => patch(r.uid, { value: e.target.value })} />
                  </label>
                  <label className="rl-cell"><span className="rl-lbl">Type</span>
                    <select value={r.ftype} disabled={ro} aria-label={`Rule ${rid} function type`} onChange={(e) => patch(r.uid, { ftype: e.target.value as 'I' | 'R' })}>
                      <option value="I">Input</option><option value="R">Output</option>
                    </select>
                  </label>
                  <label className="rl-cell"><span className="rl-lbl">Condition</span>
                    <select value={r.condition} disabled={ro} aria-label={`Rule ${rid} condition`} onChange={(e) => patch(r.uid, { condition: e.target.value })}>
                      <option value="">—</option><option value="AND">AND</option><option value="OR">OR</option>
                    </select>
                  </label>
                  <label className="rl-cell rl-chk"><span className="rl-lbl">Default</span>
                    <input type="checkbox" checked={r.isDefault} disabled={ro || r.ftype !== 'R'} aria-label={`Rule ${rid} default`} title={r.ftype === 'R' ? 'Only outputs marked Default are applied' : 'Only outputs can be a default'} onChange={(e) => patch(r.uid, { isDefault: e.target.checked })} />
                  </label>
                  <div className="rl-cell rl-end">
                    {!ro && <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" aria-label={`Remove this row of rule ${rid}`} title="Remove row" onClick={() => removeRow(r)}><IconTrash size={14} /></button>}
                  </div>
                </div>
              ))}
              {!ro && (
                <div className="rl-rule-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRow(rid, 'I')}><IconPlus size={13} /> Input row</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRow(rid, 'R')}><IconPlus size={13} /> Output row</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyRule(rid)}><IconCopy size={13} /> Copy rule</button>
                  <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => setConfirm({ kind: 'rule', ruleId: rid })}><IconTrash size={13} /> Delete rule</button>
                </div>
              )}
            </fieldset>
          ))}

          {dups && dups.length > 0 && (
            <div className="alert alert-warn rl-msg" role="status">
              <div>
                <p><strong>Duplicate rules: another rule has the same inputs and sets the same field.</strong></p>
                <div className="table-wrap">
                  <table className="table rl-dups">
                    <thead><tr><th>Your rule</th><th>Duplicate of</th><th>Field</th><th>Value</th><th>Type</th></tr></thead>
                    <tbody>
                      {dups.map((d, i) => (
                        <tr key={i}><td>{d.ruleId}</td><td>{d.dupRuleSetId} / {d.dupRuleId}{d.ruleSetDesc ? ` (${d.ruleSetDesc})` : ''}</td><td>{d.datele}{d.dateleDesc ? ` · ${d.dateleDesc}` : ''}</td><td>{d.value || <span className="muted">(empty)</span>}</td><td>{d.ftype === 'R' ? 'Output' : 'Input'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <ErrorBox error={error} />
          <OkBox text={ok} />

          <div className="form-actions rl-foot">
            {!ro && <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirm({ kind: 'set' })} disabled={!!busy}><IconTrash size={14} /> Delete rule set</button>}
            <span className="rl-spacer" />
            <button type="button" className="btn" onClick={load} disabled={!!busy || !dirty}><IconUndo size={14} /> Reset</button>
            <button type="button" className="btn" onClick={validate} disabled={!!busy || rows.length === 0}>{busy === 'validate' ? 'Checking…' : 'Check duplicates'}</button>
            {!ro && <button type="button" className="btn btn-primary" onClick={save} disabled={!!busy || !dirty}><IconSave size={14} /> {busy === 'rules' ? 'Saving…' : 'Save'}</button>}
          </div>
        </>
      )}
      {isNew && <><ErrorBox error={error} /></>}

      {confirm && (
        <ConfirmDialog title={confirm.kind === 'set' ? 'Delete rule set?' : `Delete rule ${confirm.ruleId}?`} confirmText="Delete" danger busy={busy === 'delete'} onCancel={() => setConfirm(null)} onConfirm={doDelete}>
          {confirm.kind === 'set'
            ? <p>The selected rule set {ruleSetId} and all its rules are deleted in SAP immediately. Do you want to continue?</p>
            : <p>The selected rule is removed from this rule set{ruleIds.length === 1 ? ' and deleted in SAP immediately' : ' when you save'}. Do you want to continue?</p>}
        </ConfirmDialog>
      )}
    </section>
  );
}
