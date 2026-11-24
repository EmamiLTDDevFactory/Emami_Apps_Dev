'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Card, Chip, ErrorBox, Field, Modal, PageHeader, Spinner, TextArea, useAction } from '@/components/ui';
import { ApiError, fn, get, isOk, odataKey } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { QuotaItem } from '@/lib/entities';
import { fmtDate, fmtInrFull, orDash, statusLabel, statusTone } from '@/lib/format';
import { KV } from '@/components/procure/Bits';
import { isQuotaPending } from './quotaLogic';

export default function QuotaItemDetail() {
  const id = useSearchParams().get('id') ?? '';
  const { userId, cfgNum } = useSession();
  const { busy, run } = useAction();
  const [item, setItem] = useState<QuotaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [act, setAct] = useState<'' | 'approve' | 'reject'>('');
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!id) { setError('No quota item selected.'); setLoading(false); return; }
    try {
      const r = await get<QuotaItem>(`QuotaItemSet${odataKey(id)}`);
      if (!r) setError(`Record ${id} was not found.`); else { setItem(r); setError(''); }
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load the quota item.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error || !item) return <><PageHeader title="Quota Item" back={{ href: '/quota/', label: 'Unit Quota' }} /><ErrorBox message={error || 'Not found.'} /></>;

  const minChars = cfgNum('COMMENT_MIN_CHARS', 10);
  const needComment = act === 'reject';
  const canAct = isQuotaPending(item.Status) && item.CreatedBy !== userId; // SAP decides who may approve; the creator never sees the buttons
  const submit = async () => {
    if (needComment && comment.trim().length < minChars) { return; }
    const name = act === 'approve' ? 'ApproveQuota' : 'RejectQuota';
    const r = await run(async () => {
      const res = await fn(name, { QuotaId: item.Quotaid, Comment: comment.trim() });
      if (!isOk(res)) throw new Error(res.Message || 'The action failed.');
      return res;
    }, act === 'approve' ? 'Quota item approved.' : 'Quota item rejected.');
    if (r) { setNote(r.Message || ''); setAct(''); setComment(''); await load(); }
  };

  return (
    <>
      <PageHeader title={item.Quotaid} subtitle={`${item.Title} - ${item.PlantName} - ${item.Fiscalyear}`} back={{ href: '/quota/', label: 'Unit Quota' }}
        actions={canAct ? <><Button variant="danger" disabled={busy} onClick={() => setAct('reject')}>Reject</Button><Button variant="success" disabled={busy} onClick={() => setAct('approve')}>Approve</Button></> : undefined} />
      <div className="mb-3 flex flex-wrap items-center gap-3"><Chip tone={statusTone(item.Status)}>{statusLabel(item.Status)}</Chip><span className="text-[12px] text-sap-muted">Amount</span><b className="font-display text-lg">{fmtInrFull(item.Amount)}</b></div>
      {note && <div role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-800">{note}</div>}
      <Card title="Details">
        <dl className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
          <KV k="Plant">{item.PlantName}</KV>
          <KV k="Fiscal Year">{item.Fiscalyear}</KV>
          <KV k="Status">{statusLabel(item.Status)}</KV>
          <KV k="Current Approval Level">{orDash(item.CurrLevel)}</KV>
          <KV k="Created By">{item.CreatedByName}</KV>
          <KV k="Created On">{fmtDate(item.CreatedOn)}</KV>
          <KV k="Approved By">{orDash(item.ApprovedByName)}</KV>
          <KV k="Approved On">{fmtDate(item.ApprovedOn)}</KV>
        </dl>
        <div className="mt-3 text-[11px] font-bold text-sap-muted">Justification</div>
        <p className="whitespace-pre-wrap text-[12px]">{orDash(item.Justification)}</p>
      </Card>
      <Modal open={!!act} title={act === 'approve' ? 'Approve quota item' : 'Reject quota item'} onClose={() => setAct('')}
        footer={<><Button onClick={() => setAct('')}>Cancel</Button><Button variant={act === 'approve' ? 'success' : 'danger'} disabled={busy || (needComment && comment.trim().length < minChars)} onClick={submit}>{act === 'approve' ? 'Approve' : 'Reject'}</Button></>}>
        <Field label={needComment ? `Comment * (at least ${minChars} characters)` : 'Comment (optional)'}>
          <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
