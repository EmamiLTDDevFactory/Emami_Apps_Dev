'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardPaste, ExternalLink, Link2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { addExternalRef, deleteExternalRef, saveSap, searchRefMasters, updateExternalRef, type ExternalRefInput } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime } from '@/lib/format';
import { parseSapText } from '@/lib/sapParse';
import type { ExternalRef, SapDetails } from '@/lib/types';
import { Button, Card, Field, Modal, Notice, Pill, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';

/*
   v7 Phase 4 (master prompt §N 4-5): SAP details (form + card), the "Paste error / dump text" helper, reference-master
   typeahead (system -> client, T-codes, Fiori apps) and external references (SAP for Me cases, vendor tickets) with ageing.
*/

const sel = cx('h-9 w-full', inputBase);
export type SapForm = Partial<SapDetails> & { sapNotes?: string[] | string };

/** Text box with suggestions from a reference master (Admin > SAP & Infra masters). */
function MasterInput({ kind, value, onChange, parent, label, placeholder }: { kind: string; value: string; onChange: (v: string) => void; parent?: string; label: string; placeholder?: string }) {
  const [items, setItems] = useState<{ code: string; description: string | null }[]>([]);
  const id = `ref-${kind}`;
  useEffect(() => {
    const t = setTimeout(() => { searchRefMasters(kind, value, parent).then(setItems).catch(() => setItems([])); }, 250);
    return () => clearTimeout(t);
  }, [kind, value, parent]);
  return (
    <>
      <input className={inputCls} list={id} value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>{items.map((x) => <option key={x.code} value={x.code}>{x.description ?? ''}</option>)}</datalist>
    </>
  );
}

/** The SAP details form (New ticket and the edit view of the card). Main fields first, the rest under "More". */
export function SapFields({ value, onChange, compact = false }: { value: SapForm; onChange: (v: SapForm) => void; compact?: boolean }) {
  const { meta } = useSamadhan();
  const L = meta.sapLists;
  const [more, setMore] = useState(false);
  const set = (k: keyof SapForm, v: unknown) => onChange({ ...value, [k]: v });
  const s = (k: keyof SapForm) => (value[k] as string | null | undefined) ?? '';
  const grid = cx('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-3');
  return (
    <div className="space-y-3" data-testid="sap-fields">
      <div className={grid}>
        <Field label="Environment"><select className={sel} value={s('environment')} onChange={(e) => set('environment', e.target.value || null)}><option value="">—</option>{L?.environment.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="System (SID)"><MasterInput kind="SAP_SYSTEM" label="System" value={s('sapSystem')} onChange={(v) => set('sapSystem', v.toUpperCase())} placeholder="e.g. ECP" /></Field>
        <Field label="Client"><MasterInput kind="SAP_CLIENT" label="Client" value={s('sapClient')} parent={s('sapSystem') || undefined} onChange={(v) => set('sapClient', v)} placeholder="e.g. 300" /></Field>
        <Field label="T-code"><MasterInput kind="TCODE" label="T-code" value={s('tcode')} onChange={(v) => set('tcode', v.toUpperCase())} placeholder="e.g. VA01" /></Field>
        <Field label="Message class / no."><div className="flex gap-1.5"><input className={inputCls} aria-label="Message class" value={s('errorMessageClass')} onChange={(e) => set('errorMessageClass', e.target.value.toUpperCase())} placeholder="V1" /><input className={cx(inputCls, 'w-20')} aria-label="Message number" value={s('errorMessageNo')} onChange={(e) => set('errorMessageNo', e.target.value)} placeholder="801" /></div></Field>
        <Field label="Users affected"><input className={inputCls} type="number" min={0} value={value.usersAffected ?? ''} onChange={(e) => set('usersAffected', e.target.value === '' ? null : Number(e.target.value))} /></Field>
      </div>
      <Field label="Error text"><textarea rows={2} className={textareaCls} value={s('errorText')} onChange={(e) => set('errorText', e.target.value)} /></Field>
      <button type="button" className="text-2xs font-bold text-accent hover:underline" onClick={() => setMore((m) => !m)}>{more ? 'Fewer SAP fields' : 'More SAP fields (Fiori app, program, dump, IDoc, org data, workaround, SAP Notes ...)'}</button>
      {more && (
        <div className={grid}>
          <Field label="Landscape"><select className={sel} value={s('landscape')} onChange={(e) => set('landscape', e.target.value || null)}><option value="">—</option>{L?.landscape.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Fiori app ID"><MasterInput kind="FIORI_APP" label="Fiori app" value={s('fioriAppId')} onChange={(v) => set('fioriAppId', v)} /></Field>
          <Field label="Program"><input className={inputCls} value={s('programName')} onChange={(e) => set('programName', e.target.value.toUpperCase())} /></Field>
          <Field label="Short dump (ST22)"><input className={inputCls} value={s('shortDumpId')} onChange={(e) => set('shortDumpId', e.target.value)} /></Field>
          <Field label="IDoc number" hint="16 digits"><input className={inputCls} value={s('idocNumber')} onChange={(e) => set('idocNumber', e.target.value)} /></Field>
          <Field label="IDoc message type"><input className={inputCls} value={s('idocMessageType')} onChange={(e) => set('idocMessageType', e.target.value)} /></Field>
          <Field label="Batch job"><MasterInput kind="BATCH_JOB" label="Batch job" value={s('batchJob')} onChange={(v) => set('batchJob', v)} /></Field>
          <Field label="Company code"><MasterInput kind="COMPANY_CODE" label="Company code" value={s('companyCode')} onChange={(v) => set('companyCode', v)} /></Field>
          <Field label="Plant"><MasterInput kind="PLANT" label="Plant" value={s('plant')} onChange={(v) => set('plant', v)} /></Field>
          <Field label="Sales org"><MasterInput kind="SALES_ORG" label="Sales org" value={s('salesOrg')} onChange={(v) => set('salesOrg', v)} /></Field>
          <Field label="Purchasing org"><MasterInput kind="PURCH_ORG" label="Purchasing org" value={s('purchOrg')} onChange={(v) => set('purchOrg', v)} /></Field>
          <Field label="RISE owner"><select className={sel} value={s('riseOwner')} onChange={(e) => set('riseOwner', e.target.value || null)}><option value="">—</option>{L?.riseOwner.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="SAP Notes" hint="Numbers only, comma separated"><input className={inputCls} value={Array.isArray(value.sapNotes) ? value.sapNotes.join(', ') : s('sapNotes')} onChange={(e) => set('sapNotes', e.target.value)} /></Field>
          <Field label="SAP component"><input className={inputCls} value={s('sapComponent')} onChange={(e) => set('sapComponent', e.target.value.toUpperCase())} placeholder="e.g. SD-BIL" /></Field>
          <Field label="Business process"><input className={inputCls} value={s('businessProcess')} onChange={(e) => set('businessProcess', e.target.value)} /></Field>
          <Field label="Steps to reproduce" className={compact ? '' : 'sm:col-span-3'}><textarea rows={2} className={textareaCls} value={s('stepsToReproduce')} onChange={(e) => set('stepsToReproduce', e.target.value)} /></Field>
          <Field label="Workaround" className={compact ? '' : 'sm:col-span-3'}><textarea rows={2} className={textareaCls} value={s('workaroundText')} onChange={(e) => set('workaroundText', e.target.value)} /></Field>
        </div>
      )}
    </div>
  );
}

/** "Paste error / dump text": proposes values from an SAP error or ST22 dump; the agent applies them. */
export function PasteParser({ onApply }: { onApply: (fields: SapForm, extra: { transports: string[]; httpStatus: string | null }) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseSapText(text), [text]);
  const entries = Object.entries(parsed.fields).filter(([, v]) => v !== null && v !== undefined && v !== '');
  const LABEL: Record<string, string> = { errorMessageClass: 'Message class', errorMessageNo: 'Message no.', tcode: 'T-code', shortDumpId: 'Short dump', programName: 'Program', idocNumber: 'IDoc', sapNotes: 'SAP Notes', sapSystem: 'System', sapClient: 'Client', errorText: 'Error text' };
  return (
    <>
      <Button size="sm" type="button" onClick={() => setOpen(true)}><ClipboardPaste size={13} /> Paste error / dump text</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Paste an SAP error or ST22 dump" width={720}>
        <div className="space-y-3 p-4">
          <textarea autoFocus rows={8} className={textareaCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the error message, the ST22 header or any text with T-codes, transports, IDocs or SAP Notes" aria-label="Error or dump text" />
          {text.trim() && (
            <div className="rounded-xl border border-line bg-sunken p-3 text-xs" data-testid="paste-result">
              <div className="mb-1 font-bold">Found</div>
              {entries.length === 0 && !parsed.transports.length && <div className="text-muted">Nothing recognised - the text is kept as the error text if you apply.</div>}
              <ul className="space-y-0.5">
                {entries.map(([k, v]) => <li key={k}><span className="text-muted">{LABEL[k] ?? k}:</span> <b>{Array.isArray(v) ? v.join(', ') : String(v)}</b></li>)}
                {parsed.transports.length > 0 && <li><span className="text-muted">Transports:</span> <b>{parsed.transports.join(', ')}</b></li>}
                {parsed.httpStatus && <li><span className="text-muted">HTTP status:</span> <b>{parsed.httpStatus}</b></li>}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!text.trim()} onClick={() => { onApply(parsed.fields, { transports: parsed.transports, httpStatus: parsed.httpStatus }); setOpen(false); setText(''); }}>Use these values</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Ticket sidebar card: SAP details read-only, Edit opens the form. */
export function SapCard({ ticketId, sap, reload }: { ticketId: number; sap: SapDetails | null | undefined; reload: () => Promise<void> }) {
  const { can } = useSamadhan();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SapForm>(sap ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(sap ?? {}); }, [sap]);
  const save = async () => {
    setBusy(true);
    setError('');
    try { await saveSap(ticketId, form); setEditing(false); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  const rows: [string, string | null | undefined][] = sap ? [
    ['Environment', sap.environment], ['System / client', [sap.sapSystem, sap.sapClient].filter(Boolean).join(' / ')], ['T-code', sap.tcode], ['Fiori app', sap.fioriAppId],
    ['Message', sap.errorMessageClass ? `${sap.errorMessageClass} ${sap.errorMessageNo ?? ''}` : null], ['Short dump', sap.shortDumpId], ['Program', sap.programName],
    ['IDoc', sap.idocNumber ? `${sap.idocNumber}${sap.idocMessageType ? ` (${sap.idocMessageType})` : ''}` : null], ['Org', [sap.companyCode, sap.plant, sap.salesOrg, sap.purchOrg].filter(Boolean).join(' · ')],
    ['Users affected', sap.usersAffected != null ? String(sap.usersAffected) : null], ['SAP Notes', (sap.sapNotes ?? []).join(', ')], ['RISE owner', sap.riseOwner],
  ] : [];
  return (
    <Card title="SAP details" sub={sap?.updatedAt ? `Updated ${fmtDateTime(sap.updatedAt)}` : 'System, client, T-code, error'} actions={can('ticket.edit') && !editing && <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</Button>}>
      <div data-testid="sap-card">
        {editing ? (
          <div className="space-y-3">
            <PasteParser onApply={(f) => setForm((x) => ({ ...x, ...f }))} />
            <SapFields value={form} onChange={setForm} compact />
            {error && <Notice onClose={() => setError('')}>{error}</Notice>}
            <div className="flex gap-2"><Button variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : <Save size={13} />} Save</Button><Button onClick={() => { setEditing(false); setForm(sap ?? {}); }}>Cancel</Button></div>
          </div>
        ) : rows.filter(([, v]) => v).length === 0 ? (
          <p className="text-2xs text-muted">No SAP details yet.</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {rows.filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words font-semibold">{v}</dd></Fragment>)}
            {sap?.errorText && <><dt className="text-muted">Error</dt><dd className="min-w-0 break-words">{sap.errorText}</dd></>}
          </dl>
        )}
      </div>
    </Card>
  );
}

/** External references (SAP for Me cases, vendor tickets ...) with ageing; "No update for 2+ business days" is highlighted. */
export function ExternalRefsCard({ ticketId, refs, reload }: { ticketId: number; refs: ExternalRef[]; reload: () => Promise<void> }) {
  const { meta, can } = useSamadhan();
  const L = meta.sapLists;
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ExternalRefInput>({ system: L?.externalSystem[0] ?? '', ref: '', priority: '', url: '', justification: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); await reload(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return false; } finally { setBusy(false); }
  };
  const add = async () => {
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v)) as ExternalRefInput;
    if (await run(() => addExternalRef(ticketId, body))) { setAdding(false); setForm({ system: L?.externalSystem[0] ?? '', ref: '' }); }
  };
  const manage = can('externalRef.manage');
  return (
    <Card title="External references" sub="SAP for Me cases, vendor and partner tickets" actions={manage && !adding && <Button size="sm" onClick={() => setAdding(true)}><Plus size={13} /> Add</Button>}>
      <div className="space-y-2" data-testid="external-refs">
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        {refs.length === 0 && !adding && <p className="text-2xs text-muted">None yet. Add the SAP case or vendor ticket number when the issue goes outside.</p>}
        {refs.map((r) => {
          const stale = r.ageDays >= 2 && !['Closed', 'Confirmed'].includes(r.status ?? '');
          return (
            <div key={r.id} className={cx('rounded-lg border px-2.5 py-2 text-xs', stale ? 'border-warn/40 bg-warn/5' : 'border-line')}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Link2 size={13} className="text-accent" />
                <b>{r.system}</b> <span className="font-mono">{r.ref}</span>
                {r.priority && <Pill tone={r.priority === 'Very High' ? 'bad' : r.priority === 'High' ? 'warn' : 'neutral'}>{r.priority}</Pill>}
                {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent" aria-label={`Open ${r.ref}`}><ExternalLink size={12} /></a>}
                <span className="ml-auto flex items-center gap-1 text-2xs text-muted">{stale && <AlertTriangle size={12} className="text-warn" />}{r.ageDays === 0 ? 'updated today' : `no update for ${r.ageDays} day${r.ageDays === 1 ? '' : 's'}`}</span>
              </div>
              {manage && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <select aria-label={`Status of ${r.ref}`} className={cx('h-7 flex-1 text-2xs', inputBase)} value={r.status ?? ''} disabled={busy} onChange={(e) => run(() => updateExternalRef(ticketId, r.id, { status: e.target.value }))}>
                    <option value="">Status…</option>{L?.externalStatus.map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <button type="button" aria-label={`Remove ${r.ref}`} className="text-muted hover:text-bad" disabled={busy} onClick={() => window.confirm(`Remove ${r.system} ${r.ref}?`) && run(() => deleteExternalRef(ticketId, r.id))}><Trash2 size={13} /></button>
                </div>
              )}
            </div>
          );
        })}
        {adding && (
          <div className="space-y-2 rounded-lg border border-accent/30 p-2.5">
            <Field label="System"><select className={sel} value={form.system ?? ''} onChange={(e) => setForm({ ...form, system: e.target.value })}>{L?.externalSystem.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Reference number" required><input className={inputCls} value={form.ref ?? ''} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="e.g. 000123/2026" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Priority"><select className={sel} value={form.priority ?? ''} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="">—</option>{L?.sapCasePriority.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Link"><input className={inputCls} value={form.url ?? ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></Field>
            </div>
            {form.priority === 'Very High' && <Field label="Justification" hint="Very High outside Production needs a reason"><input className={inputCls} value={form.justification ?? ''} onChange={(e) => setForm({ ...form, justification: e.target.value })} /></Field>}
            <div className="flex gap-2"><Button size="sm" variant="primary" disabled={busy || !form.ref?.trim()} onClick={add}>Add reference</Button><Button size="sm" onClick={() => setAdding(false)}>Cancel</Button></div>
          </div>
        )}
      </div>
    </Card>
  );
}
