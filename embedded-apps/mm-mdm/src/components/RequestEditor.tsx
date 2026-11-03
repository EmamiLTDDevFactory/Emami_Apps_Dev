'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useT } from '@/i18n';
import { FORM, staticFieldControl } from '@/lib/form';
import type { FieldControl, Message, RequestData, RequestView, Row, Scalar } from '@/lib/types';
import { groupByTab, indexByField, parseTarget } from '@/lib/messages';
import { MessagePanel } from './MessagePanel';
import { UnsavedGuard } from './UnsavedGuard';
import { StatusChip } from './StatusChip';
import { RequestExtras } from './RequestExtras';
import { Timeline } from './Timeline';
import { ViewForm } from './ViewForm';
import { ViewGrid } from './ViewGrid';

type Dlg = 'approve' | 'sendback' | 'reject' | 'forward' | null;

export function RequestEditor({ initial }: { initial: RequestView }) {
  const t = useT();
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

  // Tab order = the order of the Web Dynpro app: FORM.views keeps the order of the dictionary extract the form definition was
  // generated from (and SAP's GetFieldControl lists the tabs in the same order). Only the tabs selected for the request show.
  const views = useMemo(() => FORM.views.filter((v) => data.views.includes(v.id)), [data.views]);
  useEffect(() => { if (views.length && !views.some((v) => v.id === active)) setActive(views[0].id); }, [views, active]);

  const byField = useMemo(() => indexByField(messages), [messages]);
  const grouped = useMemo(() => groupByTab(messages, views.map((v) => ({ id: v.id, title: v.title, entity: v.entity, fields: v.fields }))), [messages, views]);
  const tabMsgs = useMemo(() => new Map(grouped.groups.map((g) => [g.tab.id, g])), [grouped]);

  const setCell = (entity: string, name: string, v: Scalar) => {
    setData((d) => ({ ...d, single: { ...d.single, [entity]: { ...(d.single[entity] ?? {}), [name]: v } } }));
    setDirty(true);
  };
  const setRows = (entity: string, rows: Row[], structural = false) => {
    setData((d) => ({ ...d, multi: { ...d.multi, [entity]: rows } }));
    setDirty(true);
    // messages of this grid name rows by number; after rows were added, removed or copied they would point to the wrong row
    if (structural) setMessages((m) => m.filter((x) => parseTarget(x.target)?.entity !== entity));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setInfo('');
    try { await fn(); } catch (e) {
      if (e instanceof ApiError) { setMessages(e.messages.length ? e.messages : [{ code: String(e.status), message: e.message, severity: 'E' }]); } else setInfo(e instanceof Error ? e.message : t('common.unexpected'));
    } finally { setBusy(false); }
  };

  const pick = (m: Message) => {
    const p = parseTarget(m.target);
    const tab = grouped.groups.find((g) => g.messages.includes(m))?.tab;
    if (tab) setActive(tab.id);
    if (!p) return;
    setTimeout(() => {
      const sel = `[data-field="${p.entity}.${p.field}"]${p.row !== undefined ? `[data-row="${p.row}"]` : ''}`;
      const box = document.querySelector(sel);
      box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    }, 60);
  };

  const validate = () => run(async () => {
    const r = await api.validate(req.header.transId, data);
    setMessages(r.messages); setInfo(r.messages.length ? '' : t('editor.noErrors'));
  });
  const saveDraft = () => run(async () => {
    const r = await api.save(req.header.transId, data);
    setReq(r.request); setData(r.request.data); setMessages(r.messages); setDirty(false); setInfo(t('editor.saved'));
  });
  const submit = () => run(async () => {
    const r = await api.submit(req.header.transId, data);
    setReq(r.request); setData(r.request.data); setMessages(r.messages); setDirty(false); setInfo(t('editor.submitted'));
  });
  const act = (a: 'approve' | 'sendback' | 'reject' | 'forward') => run(async () => {
    const r = await api.act(req.header.transId, a, { comment, agent, data: al.edit && dirty ? data : undefined });
    setReq(r.request); setData(r.request.data); setMessages(r.messages); setDirty(false); setDlg(null); setComment(''); setAgent('');
    setInfo(a === 'approve' ? t('editor.approved') : a === 'sendback' ? t('editor.sentBack') : a === 'reject' ? t('editor.rejected') : t('editor.forwarded'));
  });
  const remove = () => { if (!confirm(t('editor.deleteConfirm'))) return; void run(async () => { await api.remove(req.header.transId); router.push('/requests'); }); };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = views.findIndex((v) => v.id === active);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? views.length - 1 : -1;
    if (n < 0 || !views.length) return;
    e.preventDefault();
    const t = views[(n + views.length) % views.length];
    setActive(t.id);
    setTimeout(() => document.getElementById(`tab-${t.id}`)?.focus(), 0);
  };

  const view = views.find((v) => v.id === active);
  const controls = (fc ?? {})[active] ?? [];

  return (
    <>
      <UnsavedGuard when={dirty} />
      <div className="card actionbar">
        <div className="row">
          <div className="grow">
            <h1>{t('editor.request', { id: req.header.transId })} <StatusChip status={req.header.status} /></h1>
            <div className="muted">
              {req.header.description || t('editor.noDescription')} · {t('editor.typeLine', { type: mtart || '-' })} · {t('editor.initiator', { user: req.header.initiator })}
              {req.header.objValue ? ` · ${t('editor.material', { matnr: req.header.objValue })}` : ''} · {t('editor.level', { level: req.level })}
            </div>
          </div>
          <div className="row">
            {al.validate && <button onClick={validate} disabled={busy}>{t('editor.validate')}</button>}
            {al.saveDraft && <button onClick={saveDraft} disabled={busy}>{t('editor.saveDraft')}</button>}
            {al.submit && <button className="primary" onClick={submit} disabled={busy}>{t('editor.submit')}</button>}
            {al.approve && <button className="primary" onClick={() => setDlg('approve')} disabled={busy}>{t('editor.approve')}</button>}
            {al.sendBack && <button onClick={() => setDlg('sendback')} disabled={busy}>{t('editor.sendBack')}</button>}
            {al.forward && <button onClick={() => setDlg('forward')} disabled={busy}>{t('editor.forward')}</button>}
            {al.reject && <button className="danger" onClick={() => setDlg('reject')} disabled={busy}>{t('editor.reject')}</button>}
            {al.deleteDraft && <button className="danger" onClick={remove} disabled={busy}>{t('editor.deleteDraft')}</button>}
          </div>
        </div>
        <p className="muted" role="status" aria-live="polite">{info}</p>
        {dirty && <p className="notice">{t('editor.unsaved')}</p>}
      </div>

      <div className="layout">
        <div>
          <div className="card">
            <div className="tabs" role="tablist" aria-label={t('editor.tabs')} onKeyDown={onTabKey}>
              {views.map((v) => {
                const g = tabMsgs.get(v.id);
                return (
                  <button key={v.id} id={`tab-${v.id}`} role="tab" type="button" aria-selected={v.id === active} aria-controls="tabpanel" tabIndex={v.id === active ? 0 : -1}
                    className={v.id === active ? 'on' : ''} onClick={() => setActive(v.id)}>
                    {v.title}
                    {g && <span className={`dot${g.errors ? '' : ' w'}`} aria-hidden="true">●</span>}
                    {g && <span className="sr-only"> {t('editor.errorsSr', { errors: g.errors, warnings: g.warnings })}</span>}
                  </button>
                );
              })}
            </div>
            <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${active}`}>
            {!view && <p className="muted">{t('editor.noTabs')}</p>}
            {view && !fc && <p className="muted" role="status">{t('editor.loadingFields')}</p>}
            {view && fc && (view.multi
              ? <ViewGrid title={view.title} controls={controls} rows={data.multi[view.entity] ?? []} data={data} readOnly={readOnly} messages={byField} onChange={(rows, structural) => setRows(view.entity, rows, structural)} />
              : <ViewForm controls={controls} row={data.single[view.entity] ?? {}} data={data} readOnly={readOnly} messages={byField} onChange={(n, v) => setCell(view.entity, n, v)} />)}
            </div>
          </div>
        </div>
        <div>
          <MessagePanel groups={grouped.groups} general={grouped.general} onPick={pick} />
          <div className="card"><h2>{t('history.title')}</h2><Timeline items={req.history} /></div>
          <RequestExtras transId={req.header.transId} canAttach={al.attach} canComment={al.comment} />
          <div className="card muted">
            {t('editor.routing', { type: req.header.genType || '-', group: req.header.genField || '-', business: req.header.genField2 || '-', plant: req.header.genField3 || '-' })}
            {req.header.workItemId ? ` · ${t('editor.workItem', { id: req.header.workItemId })}` : ''}
          </div>
        </div>
      </div>

      <dialog ref={dlgRef} onClose={() => setDlg(null)}>
        <h2>{dlg === 'approve' ? t('dlg.approve') : dlg === 'sendback' ? t('dlg.sendBack') : dlg === 'reject' ? t('dlg.reject') : t('dlg.forward')}</h2>
        {dlg === 'forward' && <div className="field"><label className="lbl" htmlFor="agent">{t('dlg.forwardTo')}</label><input id="agent" value={agent} onChange={(e) => setAgent(e.target.value)} /></div>}
        <div className="field"><label className="lbl" htmlFor="cmt">{t('dlg.comment')}</label><textarea id="cmt" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        <div className="row"><button onClick={() => setDlg(null)}>{t('common.cancel')}</button><button className={dlg === 'reject' ? 'danger' : 'primary'} disabled={busy || (dlg === 'forward' && !agent)} onClick={() => dlg && act(dlg)}>{t('common.confirm')}</button></div>
      </dialog>
    </>
  );
}
