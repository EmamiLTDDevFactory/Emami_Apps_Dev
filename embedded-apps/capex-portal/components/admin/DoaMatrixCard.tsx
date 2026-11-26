'use client';
import { useMemo, useState } from 'react';
import { Button, Card, Chip, DataTable, ErrorBox, Field, Input, Modal, Select, useAction, type Column } from '@/components/ui';
import { rangeLabel, saveDoa, validateDoa, type AdminDoa, type AdminStep, type AdminUser } from '@/lib/admin';
import CapexTypePicker from './CapexTypePicker';
import { DOC_TYPES, docTypeLabel, formatTotalSla } from './doaLogic';

const blank = (): AdminDoa => ({ doaid: '', capextype: '', doctype: 'CPE', amountFrom: 0, amountTo: 0, waers: 'INR', rangeText: '', active: true, validFrom: '', validTo: '', chain: [{ role: '', approver: '', slaDays: 2, mandatory: true, evalReq: false }] });

/** DOA Matrix: approval chains by capex type, amount range and document type. Edits go to SAP (ZCAPEX_DOA / ZCAPEX_DOACHN). */
export default function DoaMatrixCard({ rules, users, roles, capexTypes, loading, error, onRetry, onSaved }: {
  rules: AdminDoa[]; users: AdminUser[]; roles: string[]; capexTypes: { key: string; text: string }[]; loading: boolean; error: string; onRetry: () => void; onSaved: () => void;
}) {
  const [docType, setDocType] = useState('');
  const [capex, setCapex] = useState('');
  const [edit, setEdit] = useState<AdminDoa | null>(null);
  const [problem, setProblem] = useState('');
  const { busy, run } = useAction();
  const rows = useMemo(() => rules.filter((r) => (!docType || r.doctype === docType) && (!capex || r.capextype === capex)), [rules, docType, capex]);
  const typeText = (k: string) => capexTypes.find((t) => t.key === k)?.text || k;
  const nameOf = (id: string) => users.find((u) => u.userid === id)?.fullname || id;

  const open = (r: AdminDoa) => { setEdit({ ...r, chain: r.chain.map((s) => ({ ...s })) }); setProblem(''); };
  const patch = (p: Partial<AdminDoa>) => setEdit((e) => (e ? { ...e, ...p } : e));
  const step = (i: number, p: Partial<AdminStep>) => setEdit((e) => (e ? { ...e, chain: e.chain.map((s, j) => (j === i ? { ...s, ...p } : s)) } : e));
  const move = (i: number, d: number) => setEdit((e) => {
    if (!e || i + d < 0 || i + d >= e.chain.length) return e;
    const c = e.chain.slice(); [c[i], c[i + d]] = [c[i + d], c[i]]; return { ...e, chain: c };
  });
  const save = async () => {
    if (!edit) return;
    const msg = validateDoa(edit, rules);
    if (msg) { setProblem(msg); return; }
    const ok = await run(() => saveDoa(edit), 'DOA rule saved.');
    if (ok !== undefined) { setEdit(null); onSaved(); }
  };

  const cols: Column<AdminDoa>[] = [
    { key: 'id', header: 'Rule', width: '4rem', render: (r) => <span className="font-bold text-plum">{r.doaid}</span> },
    { key: 'capex', header: 'Capex Type', render: (r) => <span>{typeText(r.capextype)}<span className="ml-1 text-sap-muted">({r.capextype})</span></span> },
    { key: 'doc', header: 'Document Type', hideBelow: 'md', render: (r) => (r.doctype ? docTypeLabel(r.doctype) : <Chip tone="warning">Not set</Chip>) },
    { key: 'range', header: 'Amount Range', hideBelow: 'md', render: (r) => rangeLabel(r) },
    { key: 'status', header: 'Status', hideBelow: 'lg', render: (r) => <Chip tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</Chip> },
    { key: 'chain', header: 'Approval Chain', render: (r) => (
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {r.chain.map((s, i) => <li key={i} className="flex items-center gap-1"><span className="rounded border border-sap-line px-1.5 py-0.5" title={nameOf(s.approver)}>{s.role}</span>{i < r.chain.length - 1 && <span aria-hidden className="text-sap-muted">{'→'}</span>}</li>)}
        {!r.chain.length && <span className="text-sap-muted">No steps</span>}
      </ol>) },
    { key: 'sla', header: 'Total SLA', align: 'right', hideBelow: 'sm', render: (r) => formatTotalSla(r.chain) },
  ];
  return (
    <Card title="DOA Matrix" hint="Approval chains by capex type, amount range and document type. Click a rule to change it."
      actions={<Button variant="primary" onClick={() => open(blank())}>Add rule</Button>}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Document Type" className="w-44"><Select value={docType} onChange={(e) => setDocType(e.target.value)}><option value="">All</option>{DOC_TYPES.map((d) => <option key={d.key} value={d.key}>{d.text}</option>)}</Select></Field>
        <Field label="Capex Type" className="w-64"><CapexTypePicker options={capexTypes} value={capex} onChange={setCapex} allLabel="All" /></Field>
      </div>
      {error ? <ErrorBox message={error} onRetry={onRetry} /> : <DataTable columns={cols} rows={rows} rowKey={(r) => r.doaid} loading={loading && !rules.length} onRowClick={open} empty="No DOA rules match." />}
      <Modal open={!!edit} wide title={edit?.doaid ? `Edit rule ${edit.doaid}` : 'Add DOA rule'} onClose={() => setEdit(null)}
        footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Capex type" hint="* = every type"><Input list="capex-types" value={edit.capextype} onChange={(e) => patch({ capextype: e.target.value })} /><datalist id="capex-types">{['*', ...capexTypes.map((t) => t.key)].map((k) => <option key={k} value={k} />)}</datalist></Field>
              <Field label="Document type"><Select value={edit.doctype} onChange={(e) => patch({ doctype: e.target.value })}><option value="">Not set (the rule will not apply)</option>{DOC_TYPES.map((d) => <option key={d.key} value={d.key}>{d.text}</option>)}</Select></Field>
              <Field label="Amount from (INR)"><Input type="number" min={0} value={edit.amountFrom} onChange={(e) => patch({ amountFrom: Number(e.target.value) || 0 })} /></Field>
              <Field label="Amount up to (INR)" hint="Upper limit of the band"><Input type="number" min={0} value={edit.amountTo} onChange={(e) => patch({ amountTo: Number(e.target.value) || 0 })} /></Field>
              <Field label="Valid from"><Input type="date" value={edit.validFrom} onChange={(e) => patch({ validFrom: e.target.value })} /></Field>
              <Field label="Valid to" hint="Leave empty for no end date"><Input type="date" value={edit.validTo} onChange={(e) => patch({ validTo: e.target.value })} /></Field>
              <Field label="Range label" hint="Shown on screens; blank = generated"><Input maxLength={20} value={edit.rangeText} onChange={(e) => patch({ rangeText: e.target.value })} /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-[12px]"><input type="checkbox" checked={edit.active} onChange={(e) => patch({ active: e.target.checked })} /> Active (inactive rules are never used)</label>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between"><h3 className="text-[12px] font-extrabold">Approval steps (in order)</h3><Button onClick={() => patch({ chain: [...edit.chain, { role: '', approver: '', slaDays: 2, mandatory: true, evalReq: false }] })}>Add step</Button></div>
              <ol className="space-y-2">
                {edit.chain.map((s, i) => (
                  <li key={i} className="grid items-end gap-2 rounded-lg border border-sap-line p-2 sm:grid-cols-[2rem_1.3fr_1.3fr_5rem_auto]">
                    <span className="pb-2 text-[12px] font-extrabold text-sap-muted">{i + 1}</span>
                    <Field label="Role"><Input list="capex-chain-roles" value={s.role} onChange={(e) => step(i, { role: e.target.value })} /></Field>
                    <Field label="Approver"><Select value={s.approver} onChange={(e) => step(i, { approver: e.target.value })}><option value="">Resolved by role</option>{users.filter((u) => u.active || u.userid === s.approver).map((u) => <option key={u.userid} value={u.userid}>{u.fullname} ({u.userid})</option>)}</Select></Field>
                    <Field label="SLA days"><Input type="number" min={0} value={s.slaDays} onChange={(e) => step(i, { slaDays: Number(e.target.value) || 0 })} /></Field>
                    <div className="flex flex-wrap items-center gap-2 pb-1 text-[11px]">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={s.mandatory} onChange={(e) => step(i, { mandatory: e.target.checked })} />Mandatory</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={s.evalReq} onChange={(e) => step(i, { evalReq: e.target.checked })} />Evaluation</label>
                      <Button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>{'↑'}</Button>
                      <Button aria-label="Move down" disabled={i === edit.chain.length - 1} onClick={() => move(i, 1)}>{'↓'}</Button>
                      <Button variant="danger" aria-label="Remove step" onClick={() => patch({ chain: edit.chain.filter((_, j) => j !== i) })}>{'×'}</Button>
                    </div>
                  </li>
                ))}
              </ol>
              <datalist id="capex-chain-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
            </div>
            <p className="text-[11px] text-sap-muted">Changes apply to documents submitted from now on. Rules cannot be deleted: untick Active instead.</p>
            {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{problem}</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
}
