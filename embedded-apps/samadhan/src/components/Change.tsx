'use client';
import { useEffect, useState } from 'react';
import { Ban, Check, CheckCircle2, ChevronRight, CircleDashed, Clock, HelpCircle, Pencil, Play, Plus, Save, ShieldCheck, Trash2, Truck, XCircle } from 'lucide-react';
import { addTransport, cancelApproval, decideApproval, deleteTransport, saveChange, startApproval, ticketApprovals, updateTransport } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDate, fmtDateTime, relative } from '@/lib/format';
import type { Approval, ApprovalChain, ChangeDetails, Ticket, Transport } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';

/*
   v7 Phase 6 (master prompt §N 5): Transports (pipeline chips), Change planning (type, risk, window, freeze check,
   transports N/A, test evidence, access validity) and Approvals (stepper with Approve / Reject / Need info).
*/
const sel = cx('h-9 w-full', inputBase);
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Could not save.');
type Reload = () => Promise<void>;

// ---------- transports ----------
const PIPE = ['Created', 'Released', 'Imported to QAS', 'Tested OK in QAS', 'Approved for PRD', 'Imported to PRD'];
function Pipeline({ status }: { status: string }) {
  const failed = status.startsWith('Failed') || status === 'Reverted';
  const at = PIPE.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-0.5" aria-label={`Transport status: ${status}`}>
      {PIPE.map((p, i) => (
        <li key={p} className="flex items-center">
          <span title={p} className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold', failed ? 'bg-sunken text-faint' : i <= at ? (i === PIPE.length - 1 ? 'bg-good/15 text-good' : 'bg-accent/15 text-accent') : 'bg-sunken text-faint')}>
            {p.replace('Imported to ', '→ ').replace('Tested OK in QAS', 'QAS OK').replace('Approved for PRD', 'PRD OK')}
          </span>
          {i < PIPE.length - 1 && <ChevronRight size={10} className="text-faint" />}
        </li>
      ))}
      {failed && <li><Pill tone="bad">{status}</Pill></li>}
    </ol>
  );
}

export function TransportsCard({ ticketId, transports, reload }: { ticketId: number; transports: Transport[]; reload: Reload }) {
  const { meta, can } = useSamadhan();
  const L = meta.changeLists;
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ trNumber: '', description: '', trType: 'Workbench' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const manage = can('transport.manage');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); await reload(); return true; } catch (e) { setError(errText(e)); return false; } finally { setBusy(false); }
  };
  return (
    <Card title="Transports" sub={transports.length ? `${transports.filter((t) => t.status === 'Imported to PRD').length} of ${transports.length} in PRD` : 'Workbench / customizing requests of this change'}
      actions={manage && !adding && <Button size="sm" aria-label="New transport" onClick={() => setAdding(true)}><Plus size={13} /> Add</Button>}>
      <div className="space-y-2" data-testid="transports">
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        {!transports.length && !adding && <p className="text-2xs text-muted">No transports yet.</p>}
        {transports.map((t) => (
          <div key={t.id} className="rounded-lg border border-line px-2.5 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <Truck size={13} className="text-accent" /><b className="font-mono">{t.trNumber}</b>
              {t.trType && <span className="text-2xs text-muted">{t.trType}</span>}
              {t.returnCode !== null && <Pill tone={t.returnCode >= 8 ? 'bad' : t.returnCode === 4 ? 'warn' : 'good'}>RC {t.returnCode}</Pill>}
              {manage && <button type="button" aria-label={`Remove ${t.trNumber}`} className="ml-auto text-muted hover:text-bad" disabled={busy} onClick={() => window.confirm(`Remove ${t.trNumber}?`) && run(() => deleteTransport(ticketId, t.id))}><Trash2 size={13} /></button>}
            </div>
            {t.description && <div className="mt-0.5 text-2xs text-muted">{t.description}</div>}
            <div className="mt-1.5"><Pipeline status={t.status} /></div>
            <div className="mt-1 text-[10px] text-faint">
              {[t.testedOkBy && `QAS OK by ${t.testedOkBy}`, t.approvedForPrdBy && `PRD sign-off ${t.approvedForPrdBy}`, t.importedPrdAt && `in PRD ${fmtDateTime(t.importedPrdAt)}`].filter(Boolean).join(' · ')}
            </div>
            {manage && (
              <div className="mt-1.5 flex gap-1.5">
                <select aria-label={`Status of ${t.trNumber}`} className={cx('h-7 flex-1 text-2xs', inputBase)} value={t.status} disabled={busy} onChange={(e) => run(() => updateTransport(ticketId, t.id, { status: e.target.value }))}>
                  {(L?.trStatuses ?? []).map((s) => <option key={s}>{s}</option>)}
                </select>
                <input aria-label={`Return code of ${t.trNumber}`} placeholder="RC" className={cx('h-7 w-14 text-2xs', inputBase)} defaultValue={t.returnCode ?? ''} disabled={busy}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(t.returnCode ?? '')) run(() => updateTransport(ticketId, t.id, { returnCode: v === '' ? null : Number(v) })); }} />
              </div>
            )}
          </div>
        ))}
        {adding && (
          <div className="space-y-2 rounded-lg border border-accent/30 p-2.5">
            <Field label="Transport number" required hint="SID + K9 + 5 digits, e.g. ECDK900123"><input className={cx(inputCls, 'font-mono')} value={form.trNumber} onChange={(e) => setForm({ ...form, trNumber: e.target.value.toUpperCase() })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type"><select className={sel} value={form.trType} onChange={(e) => setForm({ ...form, trType: e.target.value })}>{(L?.trTypes ?? []).map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Description"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabled={busy || !form.trNumber.trim()} onClick={async () => { if (await run(() => addTransport(ticketId, form))) { setAdding(false); setForm({ trNumber: '', description: '', trType: 'Workbench' }); } }}>Add transport</Button>
              <Button size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------- change planning ----------
const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export function ChangeCard({ ticket, change, reload }: { ticket: Ticket; change: ChangeDetails | null | undefined; reload: Reload }) {
  const { meta, can } = useSamadhan();
  const L = meta.changeLists;
  const isChange = ticket.recordClass === 'CHANGE';
  const isAccess = ticket.recordClass === 'ACCESS_REQUEST';
  const blank: Partial<ChangeDetails> = { changeType: null, changeRisk: null, plannedStart: null, plannedEnd: null, transportsNa: false, testEvidence: null, implementationPlan: null, backoutPlan: null, accessValidTo: null };
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ChangeDetails>>(change ?? blank);
  const [freeze, setFreeze] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(change ?? blank); }, [change]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = isChange
        ? { changeType: form.changeType, changeRisk: form.changeRisk, transportsNa: form.transportsNa, testEvidence: form.testEvidence, implementationPlan: form.implementationPlan, backoutPlan: form.backoutPlan,
          ...(String(form.plannedStart ?? '') !== String(change?.plannedStart ?? '') || String(form.plannedEnd ?? '') !== String(change?.plannedEnd ?? '') ? { plannedStart: form.plannedStart, plannedEnd: form.plannedEnd } : {}) }
        : { accessValidTo: form.accessValidTo };
      if (freeze && reason.trim()) body.freezeReason = reason.trim();
      await saveChange(ticket.id, body);
      setEditing(false);
      setFreeze(null);
      setReason('');
      await reload();
    } catch (e) {
      const m = errText(e);
      if (/freeze/i.test(m)) setFreeze(m); else setError(m);
    } finally { setBusy(false); }
  };
  const c = change;
  return (
    <Card title={isAccess ? 'Access' : 'Change plan'} sub={isAccess ? 'Validity - a revoke to-do is created on resolve' : c?.plannedStart ? `${fmtDateTime(c.plannedStart)}${c.plannedEnd ? ` → ${fmtDateTime(c.plannedEnd)}` : ''}` : 'Type, risk, window, evidence'}
      actions={can('ticket.edit') && !editing && <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</Button>}>
      <div data-testid="change-card">
        {editing ? (
          <div className="space-y-3">
            {isChange && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Change type"><select className={sel} value={form.changeType ?? ''} onChange={(e) => setForm({ ...form, changeType: e.target.value || null })}><option value="">—</option>{(L?.changeTypes ?? []).map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label="Risk"><select className={sel} value={form.changeRisk ?? ''} onChange={(e) => setForm({ ...form, changeRisk: e.target.value || null })}><option value="">—</option>{(L?.changeRisks ?? []).map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label="Planned start"><input type="datetime-local" className={inputCls} value={toLocal(form.plannedStart)} disabled={!can('change.schedule')} onChange={(e) => setForm({ ...form, plannedStart: fromLocal(e.target.value) })} /></Field>
                  <Field label="Planned end"><input type="datetime-local" className={inputCls} value={toLocal(form.plannedEnd)} disabled={!can('change.schedule')} onChange={(e) => setForm({ ...form, plannedEnd: fromLocal(e.target.value) })} /></Field>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={!!form.transportsNa} onChange={(e) => setForm({ ...form, transportsNa: e.target.checked })} /> Transports not applicable</label>
                <Field label="Test evidence" hint="Who tested what, where; or attach the evidence and say so here"><textarea rows={2} className={textareaCls} value={form.testEvidence ?? ''} onChange={(e) => setForm({ ...form, testEvidence: e.target.value })} /></Field>
                <Field label="Implementation plan"><textarea rows={2} className={textareaCls} value={form.implementationPlan ?? ''} onChange={(e) => setForm({ ...form, implementationPlan: e.target.value })} /></Field>
                <Field label="Back-out plan"><textarea rows={2} className={textareaCls} value={form.backoutPlan ?? ''} onChange={(e) => setForm({ ...form, backoutPlan: e.target.value })} /></Field>
              </>
            )}
            {isAccess && <Field label="Access valid until"><input type="date" className={inputCls} value={form.accessValidTo ? String(form.accessValidTo).slice(0, 10) : ''} onChange={(e) => setForm({ ...form, accessValidTo: e.target.value ? new Date(`${e.target.value}T23:59:00`).toISOString() : null })} /></Field>}
            {freeze && (
              <div className="space-y-2" data-testid="freeze-warning">
                <Notice tone="warn">{freeze}</Notice>
                {can('change.freezeOverride') && <Field label="Reason to schedule inside the freeze" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
              </div>
            )}
            {error && <Notice onClose={() => setError('')}>{error}</Notice>}
            <div className="flex gap-2"><Button variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : <Save size={13} />} Save</Button><Button onClick={() => { setEditing(false); setFreeze(null); setForm(change ?? blank); }}>Cancel</Button></div>
          </div>
        ) : !c ? (
          <p className="text-2xs text-muted">{isAccess ? 'No validity set.' : 'Not planned yet.'}</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {isChange && <><dt className="text-muted">Type / risk</dt><dd className="font-semibold">{[c.changeType, c.changeRisk && `${c.changeRisk} risk`].filter(Boolean).join(' · ') || '—'}</dd></>}
            {isChange && c.transportsNa && <><dt className="text-muted">Transports</dt><dd className="font-semibold">Not applicable</dd></>}
            {isChange && c.testEvidence && <><dt className="text-muted">Evidence</dt><dd className="break-words">{c.testEvidence}</dd></>}
            {isChange && c.freezeOverrideReason && <><dt className="text-muted">Freeze override</dt><dd className="break-words text-warn">{c.freezeOverrideReason}</dd></>}
            {c.accessValidTo && <><dt className="text-muted">Valid until</dt><dd className="font-semibold">{fmtDate(c.accessValidTo)}</dd></>}
          </dl>
        )}
      </div>
    </Card>
  );
}

// ---------- approvals ----------
const STATE_ICON = { Approved: CheckCircle2, Rejected: XCircle, Pending: Clock, Waiting: CircleDashed, Cancelled: Ban } as const;
const STATE_TONE = { Approved: 'text-good', Rejected: 'text-bad', Pending: 'text-warn', Waiting: 'text-faint', Cancelled: 'text-faint' } as const;

export function ApprovalStepper({ steps }: { steps: (Pick<Approval, 'stepNo' | 'stepName'> & { state: string } & Partial<Omit<Approval, 'state'>>)[] }) {
  return (
    <ol className="space-y-1.5" aria-label="Approval steps">
      {steps.map((s) => {
        const Icon = STATE_ICON[s.state as keyof typeof STATE_ICON] ?? CircleDashed;
        return (
          <li key={`${s.round ?? 1}-${s.stepNo}`} className="flex items-start gap-2 text-xs">
            <Icon size={15} className={cx('mt-0.5 shrink-0', STATE_TONE[s.state as keyof typeof STATE_TONE])} />
            <div className="min-w-0">
              <div className="font-semibold">{s.stepName} <span className="font-normal text-muted">· {s.state}{s.decision === 'Need info' ? ' (needs info)' : ''}</span></div>
              {(s.approverEmail || s.approverAgentName) && s.state !== 'Approved' && <div className="text-2xs text-muted">{s.approverAgentName ?? s.approverEmail}</div>}
              {s.decidedBy && <div className="text-2xs text-muted">{s.decision} by {s.decidedBy}{s.decidedAt ? ` · ${relative(s.decidedAt)}` : ''}</div>}
              {s.comment && <div className="text-2xs italic text-muted">“{s.comment}”</div>}
              {s.state === 'Pending' && s.dueAt && <div className={cx('text-2xs', new Date(s.dueAt) < new Date() ? 'font-bold text-bad' : 'text-faint')}>Due {fmtDateTime(s.dueAt)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ApprovalsCard({ ticket, approvals, reload }: { ticket: Ticket; approvals: Approval[]; reload: Reload }) {
  const { me, can } = useSamadhan();
  const [chains, setChains] = useState<ApprovalChain[]>([]);
  const [starting, setStarting] = useState(false);
  const [chainId, setChainId] = useState('');
  const [manager, setManager] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (starting && !chains.length) ticketApprovals(ticket.id).then((r) => setChains(r.chains)).catch(() => setChains([])); }, [starting, chains.length, ticket.id]);
  const lastRound = Math.max(0, ...approvals.map((a) => a.round));
  const current = approvals.filter((a) => a.round === lastRound);
  const running = current.some((a) => a.state === 'Pending' || a.state === 'Waiting');
  const pending = current.find((a) => a.state === 'Pending');
  const chain = chains.find((c) => String(c.id) === chainId);
  const named = pending && ((pending.approverAgentId && pending.approverAgentId === me.id) || (pending.approverEmail && pending.approverEmail === me.email.toLowerCase()));
  const mayDecide = pending && (can('approval.override') || named || (pending.approverType === 'approver' && can('approval.decide')));
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); setComment(''); await reload(); return true; } catch (e) { setError(errText(e)); return false; } finally { setBusy(false); }
  };
  const result = !running && current.length ? (current.some((a) => a.state === 'Rejected') ? 'Rejected' : current.every((a) => a.state === 'Approved') ? 'Approved' : 'Cancelled') : null;
  return (
    <Card title="Approvals" sub={current[0]?.chainName ?? 'Manager, role owner, CAB ...'}
      actions={!running && can('ticket.edit') && !starting && <Button size="sm" onClick={() => setStarting(true)}><Play size={13} /> {current.length ? 'Start again' : 'Start'}</Button>}>
      <div className="space-y-3" data-testid="approvals">
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        {result && <Pill tone={result === 'Approved' ? 'good' : result === 'Rejected' ? 'bad' : 'neutral'}>{result}</Pill>}
        {current.length > 0 ? <ApprovalStepper steps={current} /> : !starting && <p className="text-2xs text-muted">No approval needed so far. Access requests and changes usually need one.</p>}
        {pending && mayDecide && (
          <div className="space-y-2 rounded-lg border border-warn/30 bg-warn/5 p-2.5">
            <div className="text-2xs font-bold">Your decision as {pending.stepName}</div>
            <textarea rows={2} className={textareaCls} placeholder="Comment (needed to reject or ask for information)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Approval comment" />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => decideApproval(ticket.id, pending.id, 'Approved', comment))}><Check size={13} /> Approve</Button>
              <Button size="sm" disabled={busy || comment.trim().length < 3} onClick={() => run(() => decideApproval(ticket.id, pending.id, 'Rejected', comment))}><XCircle size={13} /> Reject</Button>
              <Button size="sm" disabled={busy || comment.trim().length < 3} onClick={() => run(() => decideApproval(ticket.id, pending.id, 'Need info', comment))}><HelpCircle size={13} /> Need info</Button>
            </div>
          </div>
        )}
        {running && can('ticket.edit') && <button type="button" className="text-2xs font-bold text-muted hover:text-bad" disabled={busy} onClick={() => window.confirm('Cancel the running approval?') && run(() => cancelApproval(ticket.id))}>Cancel approval</button>}
        {starting && (
          <div className="space-y-2 rounded-lg border border-accent/30 p-2.5">
            <Field label="Approval chain">
              <select className={sel} value={chainId} onChange={(e) => setChainId(e.target.value)}>
                <option value="">Pick a chain…</option>
                {chains.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.steps.map((s) => s.name).join(' → ')})</option>)}
              </select>
            </Field>
            {chain?.steps.some((s) => s.type === 'manager') && <Field label="Manager's email" required><input type="email" className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} /></Field>}
            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabled={busy || !chainId} onClick={async () => { if (await run(() => startApproval(ticket.id, Number(chainId), manager || undefined))) { setStarting(false); setManager(''); } }}><ShieldCheck size={13} /> Send for approval</Button>
              <Button size="sm" onClick={() => setStarting(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
