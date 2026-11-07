'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, HelpCircle, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { decideApproval, myApprovals } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime, relative } from '@/lib/format';
import type { MyApproval } from '@/lib/types';
import { PriorityPill } from './badges';
import { Button, Card, Notice, Skeleton, cx, textareaCls } from './ui';

/** v7 Phase 6 (§N 6 "My approvals"): every step waiting for me, decided in one place. */
export default function Approvals() {
  const { openTicket } = useSamadhan();
  const [items, setItems] = useState<MyApproval[] | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const load = useCallback(() => { myApprovals().then(setItems).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your approvals.')); }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4" data-testid="my-approvals">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">My approvals</h2>
          <p className="text-sm text-muted">Access requests, changes and transports waiting for your decision. You never see requests you raised or are implementing.</p>
        </div>
        <Button onClick={load} aria-label="Refresh"><RefreshCw size={14} /></Button>
      </div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {done && <Notice tone="good" onClose={() => setDone('')}>{done}</Notice>}
      {!items ? <Skeleton rows={4} /> : items.length === 0 ? (
        <Card bodyClass="p-8 text-center"><ShieldCheck size={28} className="mx-auto text-good" /><p className="mt-2 text-sm font-semibold">Nothing waiting for you.</p></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((a) => <ApprovalItem key={a.id} a={a} onOpen={() => openTicket(a.ticketId)} onDone={(m) => { setDone(m); load(); }} />)}
        </div>
      )}
    </div>
  );
}

function ApprovalItem({ a, onOpen, onDone }: { a: MyApproval; onOpen: () => void; onDone: (msg: string) => void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const overdue = a.dueAt && new Date(a.dueAt) < new Date();
  const decide = async (decision: string) => {
    setBusy(true);
    setError('');
    try { await decideApproval(a.ticketId, a.id, decision, comment); onDone(`${a.ref}: ${decision === 'Need info' ? 'asked for more information' : decision.toLowerCase()}.`); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  return (
    <Card bodyClass="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2 text-2xs text-muted">
        <button type="button" onClick={onOpen} className="num font-bold text-accent hover:underline">{a.ref}</button>
        <span>· {a.chainName ?? 'Approval'} · step {a.stepNo}: <b className="text-ink">{a.stepName}</b></span>
        <span className="ml-auto"><PriorityPill priority={a.priority} /></span>
      </div>
      <div className="text-sm font-bold leading-snug">{a.subject}</div>
      <div className="text-2xs text-muted">{a.requesterName ? `Requested by ${a.requesterName} · ` : ''}waiting {relative(a.createdAt)}{a.dueAt && <span className={cx(overdue && 'font-bold text-bad')}> · due {fmtDateTime(a.dueAt)}</span>}</div>
      {a.decision === 'Need info' && a.comment && <Notice tone="warn">Asked: {a.comment}</Notice>}
      <textarea rows={2} className={textareaCls} placeholder="Comment (needed to reject or ask for information)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label={`Comment for ${a.ref}`} />
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => decide('Approved')}><Check size={13} /> Approve</Button>
        <Button size="sm" disabled={busy || comment.trim().length < 3} onClick={() => decide('Rejected')}><XCircle size={13} /> Reject</Button>
        <Button size="sm" disabled={busy || comment.trim().length < 3} onClick={() => decide('Need info')}><HelpCircle size={13} /> Need info</Button>
        <Button size="sm" onClick={onOpen}>Open ticket</Button>
      </div>
    </Card>
  );
}
