'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { FORM, staticFieldControl } from '@/lib/form';
import type { FieldControl, Message, RequestData, RequestView, Row, Scalar } from '@/lib/types';
import { MessagePanel } from './MessagePanel';
import { StatusChip } from './StatusChip';
import { Timeline } from './Timeline';
import { ViewForm } from './ViewForm';
import { ViewGrid } from './ViewGrid';

type Dlg = 'approve' | 'sendback' | 'reject' | 'forward' | null;

function targetKey(t?: string): string | undefined {
  if (!t) return undefined;
  const m = /^([A-Za-z]+)(?:\[(\d+)\])?\/(.+)$/.exec(t);
  return m ? `${m[1]}.${m[3]}${m[2] ? `#${Number(m[2])}` : ''}` : undefined;
}

export function RequestEditor({ initial }: { initial: RequestView }) {
  const router = useRouter();
  const [req, setReq] = useState(initial);
  const [data, setData] = useState<RequestData>(initial.data);
  const [messages, setMessages] = useState<Message[]>([]);
  const [fc, setFc] = useState<FieldControl | null>(null);
  const [active, setActive] = useState<string>(initial.data.views[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [info, setInfo] = useState('');
  const [dlg, setDlg] = useState<Dlg>(null);
  const [comment, setComment] = useState('');
  const [agent, setAgent] = useState('');
  const dlgRef = useRef<HTMLDialogElement>(null);

  const mtart = String(data.single['Material']?.['MTART'] ?? '');
  const al = req.allowed;
  const readOnly = !al.edit;

  useEffect(() => {
    let live = true;
    api.fieldControl(mtart, req.level).then((r) => live && setFc(r)).catch(() => live && setFc(staticFieldControl(mtart)));
    return () => { live = false; };
  }, [mtart, req.level]);

  useEffect(() => { const d = dlgRef.current; if (!d) return; if (dlg && !d.open) d.showModal(); if (!dlg && d.open) d.close(); }, [dlg]);

  const views = useMemo(() => FORM.views.filter((v) => data.views.includes(v.id)), [data.views]);
  useEffect(() => { if (views.length && !views.some((v) => v.id === active)) setActive(views[0].id); }, [views, active]);

  const byField = useMemo(() => {
    const m: Record<string, Message> = {};
    for (const x of messages) { const k = targetKey(x.target); if (k && !m[k]) m[k] = x; }
    return m;
  }, [messages]);
  const viewHasMsg = useCallback((vid: string) => {
    const v = FORM.views.find((x) => x.id === vid);
    return !!v && v.fields.some((f) => byField[f] || Object.keys(byField).some((k) => k.startsWith(`${f}#`)));
  }, [byField]);

  const setCell = (entity: string, name: string, v: Scalar) => {
    setData((d) => ({ ...d, single: { ...d.single, [entity]: { ...(d.single[entity] ?? {}), [name]: v } } }));
    setDirty(true);
  };
  const setRows = (entity: string, rows: Row[]) => { setData((d) => ({ ...d, multi: { ...d.multi, [entity]: rows } })); setDirty(true); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setInfo('');
    try { await fn(); } catch (e) {
      if (e instanceof ApiError) { setMessages(e.messages.length ? e.messages : [{ code: String(e.status), message: e.message, severity: 'E' }]); } else setInfo(e instanceof Error ? e.message : 'Unexpected error');
    } finally { setBusy(false); }
  };

  const pick = (m: Message) => {
    const k = targetKey(m.target);
    const field = k?.split('#')[0];
    const v = views.find((x) => field && x.fields.includes(field));
    if (v) setActive(v.id);
    setTimeout(() => document.querySelector(`[data-field="${field}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  };

  const validate = () => run(async () => {
    const r = await api.validate(req.header.transId, data);
    setMessages(r.messages); setInfo(r.messages.length ? '' : 'No errors found.');
  });
  const saveDraft = () => run(async () => {
    const r = await api.save(req.header.transId, data);
    setReq(r.request); setData(r.request.data); setMessages(r.messages); setDirty(false); setInfo('Saved.');
  });
  const submit = () => run(async () => {
    const r = await api.submit(req.header.transId, data);
    setReq(r.request); setData(r.request.data); setMessages(r.messages); setDirty(false); setInfo('Submitted for review.');
  });
  const act = (a: 'approve' | 'sendback' | 'reject' | 'forward') => run(async () => {
    const r = await api.act(req.header.transId, a, { comment, agent, data: al.edit && dirty ? data : undefined });
    setReq(r.request); setData(r.request.data); setMessages(r.messages); setDirty(false); setDlg(null); setComment(''); setAgent('');
    setInfo(a === 'approve' ? 'Approved.' : a === 'sendback' ? 'Sent back.' : a === 'reject' ? 'Rejected.' : 'Forwarded.');
  });
  const remove = () => { if (!confirm('Delete this draft? This cannot be undone.')) return; void run(async () => { await api.remove(req.header.transId); router.push('/requests'); }); };

  const view = views.find((v) => v.id === active);
  const controls = (fc ?? {})[active] ?? [];

  return (
    <>
      <div className="card">
        <div className="row">
          <div className="grow">
            <h1>Request {req.header.transId} <StatusChip status={req.header.status} /></h1>
            <div className="muted">
              {req.header.description || 'No description'} · material type {mtart || '-'} · initiator {req.header.initiator}
              {req.header.objValue ? ` · material ${req.header.objValue}` : ''} · level {req.level}
            </div>
          </div>
          <div className="row">
            {al.validate && <button onClick={validate} disabled={busy}>Validate</button>}
            {al.saveDraft && <button onClick={saveDraft} disabled={busy}>Save draft</button>}
            {al.submit && <button className="primary" onClick={submit} disabled={busy}>Submit</button>}
            {al.approve && <button className="primary" onClick={() => setDlg('approve')} disabled={busy}>Approve</button>}
            {al.sendBack && <button onClick={() => setDlg('sendback')} disabled={busy}>Send back</button>}
            {al.forward && <button onClick={() => setDlg('forward')} disabled={busy}>Forward</button>}
            {al.reject && <button className="danger" onClick={() => setDlg('reject')} disabled={busy}>Reject</button>}
            {al.deleteDraft && <button className="danger" onClick={remove} disabled={busy}>Delete draft</button>}
          </div>
        </div>
        {info && <p className="muted" role="status">{info}</p>}
        {dirty && <p className="notice">You have unsaved changes.</p>}
      </div>

      <div className="layout">
        <div>
          <div className="card">
            <div className="tabs" role="tablist">
              {views.map((v) => (
                <button key={v.id} role="tab" aria-selected={v.id === active} className={v.id === active ? 'on' : ''} onClick={() => setActive(v.id)}>
                  {v.title}{viewHasMsg(v.id) && <span className="dot" aria-label="has errors">●</span>}
                </button>
              ))}
            </div>
            {!view && <p className="muted">No tabs selected for this request.</p>}
            {view && !fc && <p className="muted">Loading field settings...</p>}
            {view && fc && (view.multi
              ? <ViewGrid controls={controls} rows={data.multi[view.entity] ?? []} readOnly={readOnly} messages={byField} onChange={(rows) => setRows(view.entity, rows)} />
              : <ViewForm controls={controls} row={data.single[view.entity] ?? {}} readOnly={readOnly} messages={byField} onChange={(n, v) => setCell(view.entity, n, v)} />)}
          </div>
        </div>
        <div>
          <MessagePanel messages={messages} onPick={pick} />
          <div className="card"><h2>History</h2><Timeline items={req.history} /></div>
          <div className="card muted">
            Routing: type {req.header.genType || '-'}, group {req.header.genField || '-'}, business {req.header.genField2 || '-'}, plant {req.header.genField3 || '-'}
            {req.header.workItemId ? ` · work item ${req.header.workItemId}` : ''}
          </div>
        </div>
      </div>

      <dialog ref={dlgRef} onClose={() => setDlg(null)}>
        <h2>{dlg === 'approve' ? 'Approve request' : dlg === 'sendback' ? 'Send back to initiator' : dlg === 'reject' ? 'Reject request' : 'Forward request'}</h2>
        {dlg === 'forward' && <div className="field"><label className="lbl" htmlFor="agent">Forward to (user)</label><input id="agent" value={agent} onChange={(e) => setAgent(e.target.value)} /></div>}
        <div className="field"><label className="lbl" htmlFor="cmt">Comment</label><textarea id="cmt" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        <div className="row"><button onClick={() => setDlg(null)}>Cancel</button><button className={dlg === 'reject' ? 'danger' : 'primary'} disabled={busy || (dlg === 'forward' && !agent)} onClick={() => dlg && act(dlg)}>Confirm</button></div>
      </dialog>
    </>
  );
}
