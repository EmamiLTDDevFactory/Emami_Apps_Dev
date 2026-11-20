'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { FieldKey, MaterialData, Message, ViewId } from '@/lib/types';
import { FieldDef, KEY_FIELD_BY_KEY, VIEWS, VIEW_BY_ID, VIEW_CATEGORIES, FIELD_BY_KEY, displayValue } from '@/lib/fieldConfig';
import { DESCRIPTION_MAX, LONG_TEXT_MAX } from '@/lib/keyFields';
import {
  Binding, Control, buildBindings, changedFields, fromBackend, indexFieldControl, isDirty, knownFields, toFieldMessages, toPatch, viewSelected,
} from '@/lib/mmMap';
import {
  BaseData, FieldControl, LoadedRequest, MmApiError, SapMessage, WorkflowAction, actOnRequest, checkDuplicates, deleteRequest, getBase, getFieldControl,
  getRequest, saveRequest, submitRequest, validateRequest,
} from '@/lib/mmApi';
import { appLabel, levelNo, levelText, statusOf } from '@/lib/workflowConfig';
import { fmtDateTime } from '@/lib/format';
import { hierarchyText, PH_LEVELS, splitHierarchy } from '@/lib/valueHelps';
import { phLoadCode } from '@/lib/phApi';
import { useVhTick, vhText } from '@/lib/mmValueHelp';
import { ErrorState, LoadingState, MaterialNo, StatusBadge } from '../ui';
import { AttachmentsPanel, CommentsPanel, Ctl, FieldInput, MessagePanel } from './Fields';
import KeyField from './KeyField';
import { LongTextField, ProductHierarchyField } from '../ValueHelp';
import {
  IconBox, IconBuilding, IconCheck, IconClock, IconDraft, IconEye, IconFlow, IconLayers, IconSave, IconSearch, IconSend, IconShare,
  IconTag, IconTrash, IconUndo, IconUser, IconX,
} from '../icons';

type DialogAction = 'submit' | 'approve' | 'sendback' | 'reject' | 'forward' | 'delete';

/** Key fields a user may change on an existing request; the org data and the material type are fixed once the request has started */
const EDITABLE_KEYS: FieldKey[] = ['materialGroup', 'division', 'businessVertical', 'scheme', 'prodHierarchy', 'description', 'longText'];
const ORG_TYPE: Record<string, string> = { P: 'New plant / storage location', S: 'New sales area', V: 'New valuation type' };

export default function RequestPage({ transId }: { transId: string }) {
  const router = useRouter();
  const { notify, refreshInbox } = useMdm();
  useVhTick();

  const [req, setReq] = useState<LoadedRequest | null>(null);
  const [loadError, setLoadError] = useState('');
  const [fc, setFc] = useState<FieldControl | null>(null);
  const [fcError, setFcError] = useState('');
  const [data, setData] = useState<MaterialData | null>(null);
  const [tab, setTab] = useState<ViewId | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const [comment, setComment] = useState('');
  const [agent, setAgent] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseData, setBaseData] = useState<BaseData | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(false);

  const loadFc = useCallback((r: LoadedRequest) => {
    setFcError('');
    getFieldControl(r.header.materialType, r.level).then(setFc).catch((e: Error) => { setFc(null); setFcError(e.message); });
  }, []);

  const load = useCallback(() => {
    setLoadError('');
    setReq(null);
    getRequest(transId)
      .then((r) => { setReq(r); loadFc(r); })
      .catch((e: Error) => setLoadError(e.message));
  }, [transId, loadFc]);
  useEffect(() => { load(); }, [load]);

  const bindings = useMemo(() => buildBindings(knownFields(req?.data, fc)), [req, fc]);
  const idx = useMemo(() => indexFieldControl(fc), [fc]);
  const base = useMemo(() => (req ? fromBackend(req.data, bindings, req.header.objValue) : null), [req, bindings]);

  // A new load of the request (or of its field control, which can add bindings) resets the screen data
  useEffect(() => { if (base) setData(base); }, [base]);
  useEffect(() => { if (data?.prodHierarchy) void phLoadCode(data.prodHierarchy); }, [data?.prodHierarchy]);

  const allowed = req?.allowed;
  const isMx = req?.header.appId === 'MX';

  // MX only: the live values the change started from, loaded once per request (a failure just shows no highlight)
  useEffect(() => {
    setBaseData(null);
    setOnlyChanged(false);
    if (!isMx) return;
    let alive = true;
    getBase(transId).then((b) => { if (alive) setBaseData(b); }).catch(() => { /* no comparison available */ });
    return () => { alive = false; };
  }, [transId, isMx]);

  // fields differing from that base: key -> original value (nothing when there is no base)
  const changed = useMemo<Record<string, string>>(() => {
    if (!isMx || !baseData?.exists || !data) return {};
    const baseFlat = fromBackend({ single: baseData.data?.single ?? {}, multi: baseData.data?.multi ?? {}, views: [] }, bindings, req?.header.objValue ?? '');
    return changedFields(data, baseFlat, bindings);
  }, [isMx, baseData, data, bindings, req]);

  /* --------------------------- field control per field --------------------------- */
  function controlOf(b: Binding | undefined): Control | null {
    if (!b || !req) return null;
    let c: Control | null;
    if (idx.empty) return { shown: true, displayOnly: true, required: false };
    if (b.kind === 'comments') return { shown: true, displayOnly: false, required: false };
    if (b.table === 'class') c = idx.of(b.entity, 'ATWRT') ?? idx.ofEntity(b.entity) ?? { shown: true, displayOnly: false, required: false };
    else if (b.kind === 'table' || b.kind === 'longtext') c = idx.ofEntity(b.entity) ?? { shown: true, displayOnly: false, required: false };
    else c = idx.of(b.entity, b.field);
    return c && c.shown ? c : null;
  }
  function ctlOfDef(def: FieldDef): Ctl | null {
    const b = bindings.byKey[def.key];
    const c = controlOf(b);
    if (!c) return null;
    const edit = !!allowed?.edit && !c.displayOnly && !b!.alias && !def.readOnly && def.type !== 'ref';
    return { mode: edit ? 'edit' : 'display', required: c.required };
  }
  const keyEditable = (k: FieldKey): boolean => {
    if (!allowed?.edit || !EDITABLE_KEYS.includes(k)) return false;
    const b = bindings.byKey[k];
    if (!b) return false;
    const rule = idx.general(b.field) ?? (b.kind === 'scalar' ? idx.of(b.entity, b.field) : null);
    return !rule || (rule.shown && !rule.displayOnly);
  };
  const editableBinding = (b: Binding): boolean => {
    if (KEY_FIELD_BY_KEY[b.key]) return keyEditable(b.key);
    const def = FIELD_BY_KEY[b.key];
    return !!def && ctlOfDef(def as FieldDef)?.mode === 'edit';
  };

  /* --------------------------------- views ---------------------------------- */
  const views = useMemo(() => {
    if (!req) return [];
    return VIEWS.filter((v) => viewSelected(v.id, req.data.views)).map((v) => {
      const fields = v.groups.flatMap((g) => g.fields);
      const real = fields.filter((f) => f.type !== 'ref' && ctlOfDef(f));
      return { id: v.id, mode: (real.some((f) => ctlOfDef(f)?.mode === 'edit') ? 'edit' : 'display') as 'edit' | 'display', count: real.length };
    }).filter((v) => v.count > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, bindings, idx, allowed]);

  const changedKeys = useMemo(() => new Set(Object.keys(changed)), [changed]);
  const changedIn = (viewId: string) => VIEW_BY_ID[viewId].fields.filter((f) => changedKeys.has(f.key) && ctlOfDef(f)).length;
  const nChanged = views.reduce((n, v) => n + changedIn(v.id), 0);
  const shownViews = onlyChanged && nChanged > 0 ? views.filter((v) => changedIn(v.id) > 0) : views;

  useEffect(() => {
    if (!tab || !shownViews.some((v) => v.id === tab)) setTab(shownViews.find((v) => v.mode === 'edit')?.id ?? shownViews[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownViews.map((v) => v.id).join('|'), tab]);

  /* ------------------------------ derived state ------------------------------ */
  const dirty = !!(req && data && isDirty(data, req.data, bindings));
  const patch = () => toPatch(data!, req!.data, bindings, editableBinding);

  const mapMessages = (list: SapMessage[]): Message[] => toFieldMessages(list, bindings);
  function focusField(m: Message) {
    if (m.view) setTab(m.view);
    if (m.field) setTimeout(() => (document.getElementById(`f-${m.field}`) ?? document.getElementById(`k-${m.field}`))?.focus(), 30);
  }
  const set = (k: FieldKey, v: string) => {
    setData((d) => (d ? { ...d, [k]: v } : d));
    setMessages((ms) => ms.filter((m) => m.field !== k));
  };

  function fail(e: unknown, inDialog = false): void {
    const text = e instanceof Error ? e.message : 'The action failed.';
    const mapped = e instanceof MmApiError ? mapMessages(e.messages) : [];
    const list: Message[] = mapped.length ? mapped : [{ severity: 'E', text }];
    if (mapped.length && !mapped.some((m) => m.text === text)) list.unshift({ severity: 'E', text });
    setMessages(list);
    if (inDialog) setDialogError(text);
    notify('error', text);
    const first = mapped.find((m) => m.view || m.field);
    if (first) focusField(first);
  }

  async function perform(fn: () => Promise<{ request: LoadedRequest; messages: SapMessage[] }>, success: string, inDialog = false): Promise<boolean> {
    setBusy(true);
    setMessages([]);
    try {
      const res = await fn();
      setReq(res.request);
      loadFc(res.request);
      const msgs = toFieldMessages(res.messages, buildBindings(knownFields(res.request.data, fc)));
      setMessages(msgs);
      notify(msgs.some((m) => m.severity === 'E') ? 'warning' : 'success', success);
      void refreshInbox();
      return true;
    } catch (e) {
      fail(e, inDialog);
      return false;
    } finally { setBusy(false); }
  }

  async function check() {
    if (!req || !data) return;
    setBusy(true);
    setMessages([]);
    try {
      const r = await validateRequest(req.header.transId, patch());
      const msgs = mapMessages(r.messages);
      setMessages(msgs.length ? msgs : [{ severity: 'I', text: 'SAP found no errors' }]);
      notify(msgs.some((m) => m.severity === 'E') ? 'error' : 'success', msgs.length ? `${msgs.length} message(s) from SAP – see the message panel` : 'SAP found no errors');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function duplicates() {
    if (!req || !data) return;
    setBusy(true);
    try {
      const hits = await checkDuplicates(data.description, req.header.materialType);
      setMessages(hits.length
        ? hits.map((h) => ({ severity: 'W' as const, text: `Possible duplicate: material ${h.matnr.replace(/^0+/, '')} – ${h.description} (${h.score}%)` }))
        : [{ severity: 'I', text: 'No duplicates found' }]);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const save = () => perform(() => saveRequest(req!.header.transId, patch()), 'Saved');

  function openDialog(a: DialogAction) { setComment(''); setAgent(''); setDialogError(''); setDialog(a); }

  async function confirmDialog() {
    if (!req || !dialog) return;
    const id = req.header.transId;
    setDialogError('');
    let ok = false;
    if (dialog === 'delete') {
      setBusy(true);
      try { await deleteRequest(id); notify('success', `Draft ${id} deleted`); void refreshInbox(); setDialog(null); router.push('/master/material'); return; }
      catch (e) { fail(e, true); } finally { setBusy(false); }
      return;
    }
    if (dialog === 'submit') ok = await perform(() => submitRequest(id, patch(), comment), `Request ${id} submitted`, true);
    else if (dialog === 'approve') ok = await perform(() => actOnRequest(id, 'approve', { ...(dirty ? { data: patch() } : {}), comment }), 'Approved', true);
    else {
      const action = dialog as WorkflowAction;
      if (action === 'forward' && !agent.trim()) { setDialogError('Enter the SAP user to forward to.'); return; }
      ok = await perform(() => actOnRequest(id, action, { comment, ...(action === 'forward' ? { agent: agent.trim() } : {}) }),
        action === 'sendback' ? 'Sent back' : action === 'reject' ? `Request ${id} rejected` : 'Forwarded', true);
    }
    if (ok) setDialog(null);
  }

  /* --------------------------------- render --------------------------------- */
  if (loadError) {
    return (
      <div className="card placeholder">
        <ErrorState title={`Request ${transId} could not be loaded`} message={loadError} onRetry={load} />
        <Link href="/master/material/requests" className="btn">Back to requests</Link>
      </div>
    );
  }
  if (!req || !data || !allowed) return <div className="card placeholder"><LoadingState text={`Loading request ${transId} from SAP…`} /></div>;

  const h = req.header;
  const st = statusOf(h.status);
  const lvl = levelNo(req.level);
  const show = (k: FieldKey) => displayValue(k, data[k] ?? '', data) || '—';
  const errorsIn = (v: ViewId) => messages.filter((m) => m.view === v && m.severity === 'E').length;
  const typeText = vhText('MTART', {}, h.materialType);
  const plantText = data.plant ? vhText('WERKS', {}, data.plant) : '';
  const hierarchy = data.prodHierarchy ? hierarchyText(data.prodHierarchy).split(' › ') : [];
  const phCodes = splitHierarchy(data.prodHierarchy);
  const primary: { id: DialogAction; label: string; Icon: typeof IconCheck } | null =
    allowed.approve ? { id: 'approve', label: 'Approve', Icon: IconCheck }
    : allowed.submit ? { id: 'submit', label: h.status === '04' ? 'Resubmit' : 'Submit for approval', Icon: IconSend }
    : null;
  const pageMode = allowed.approve || allowed.sendBack || allowed.forward ? 'review' : allowed.edit ? 'edit' : 'display';
  const PvIcon = pageMode === 'display' ? IconEye : IconDraft;
  const fillOf = (id: ViewId) => {
    const fs = VIEW_BY_ID[id].fields.filter((f) => bindings.byKey[f.key] && ctlOfDef(f));
    return { filled: fs.filter((f) => !!data[f.key]).length, total: fs.length };
  };
  const reqFill = (id: ViewId) => {
    const fs = VIEW_BY_ID[id].fields.filter((f) => ctlOfDef(f)?.required);
    return { done: fs.filter((f) => !!String(data[f.key] ?? '').trim()).length, total: fs.length };
  };
  const unboundByView = bindings.unbound.filter((u) => u.viewId);
  const DIALOG = {
    submit: { title: h.status === '04' ? 'Resubmit request' : 'Submit request', text: 'SAP routes the request to its first approval level.', button: h.status === '04' ? 'Resubmit' : 'Submit', commentLabel: 'Comment (optional)', tone: 'blue', Icon: IconSend },
    approve: { title: 'Approve request', text: 'SAP moves the request on, or posts the material at the last level.', button: 'Approve', commentLabel: 'Comment (optional)', tone: 'green', Icon: IconCheck },
    sendback: { title: 'Send back', text: 'The request returns to SAP\'s previous step to be corrected.', button: 'Send back', commentLabel: 'What should be corrected?', tone: 'amber', Icon: IconUndo },
    reject: { title: 'Reject request', text: 'The request is closed.', button: 'Reject', commentLabel: 'Reason for rejection', tone: 'red', Icon: IconX },
    forward: { title: 'Forward for input', text: 'The person you name answers, and the request comes back to you.', button: 'Forward', commentLabel: 'What input do you need?', tone: 'violet', Icon: IconShare },
    delete: { title: 'Delete draft', text: `Draft ${h.transId} and all of its data will be deleted. This cannot be undone.`, button: 'Delete draft', commentLabel: '', tone: 'red', Icon: IconTrash },
  } as const;
  const dlg = dialog ? DIALOG[dialog] : null;
  const orgChips = [
    data.plant && `Plant ${data.plant}`,
    data.storageLocation && `Storage location ${data.storageLocation}`,
    data.salesOrg && `Sales area ${data.salesOrg}/${data.distChannel}`,
    (req.data.single.Valuation?.BWTAR as string | undefined) && `Valuation type ${req.data.single.Valuation.BWTAR}`,
  ].filter(Boolean) as string[];
  const keyInput = (k: FieldKey) => {
    const def = KEY_FIELD_BY_KEY[k]!;
    if (!keyEditable(k)) return <div key={k}><dt>{def.label}</dt><dd>{show(k)}</dd></div>;
    const msg = messages.find((m) => m.field === k)?.text;
    if (k === 'prodHierarchy') return <ProductHierarchyField key={k} id="k-prodHierarchy" value={data.prodHierarchy} onChange={(v) => set('prodHierarchy', v)} error={msg} />;
    if (k === 'longText') return <LongTextField key={k} value={data.longText} onChange={(v) => set('longText', v)} max={LONG_TEXT_MAX} error={msg} />;
    if (k === 'description') {
      return (
        <label key={k} className={`field field-wide ${msg ? 'field-error' : ''}`}>
          <span className="field-label">{def.label}<span className="req">*</span><span className="tech">MAKTX</span></span>
          <input id="k-description" value={data.description} maxLength={DESCRIPTION_MAX} onChange={(e) => set('description', e.target.value)} />
          {msg && <small className="err">{msg}</small>}
        </label>
      );
    }
    return <KeyField key={k} def={def} data={data} onChange={(v) => set(k, v)} error={msg} />;
  };

  return (
    <div className="req-page">
      <header className={`home-banner req-banner req-banner-${h.status}`}>
        <div className="home-banner-text req-banner-text">
          <Link href="/master/material/requests" className="back back-light">All requests</Link>
          <div className="req-ids">
            <span className="id-chip id-chip-dark">{h.transId}</span>
            <StatusBadge status={h.status} text={h.statusText} />
            <span className="id-chip id-chip-dark">{h.appId} · {appLabel(h.appId)}</span>
            <span className="id-chip id-chip-dark">{levelText(req.level)}</span>
          </div>
          <h2>{data.description || h.description || 'Untitled request'}</h2>
          <div className="req-facts req-facts-light">
            <span><IconTag size={14} /> {h.materialType || '—'}{typeText && ` · ${typeText}`}</span>
            <span><IconBuilding size={14} /> {data.plant ? `Plant ${data.plant}${plantText ? ` · ${plantText}` : ''}` : 'No plant'}</span>
            <span><IconUser size={14} /> {h.initiator || '—'}</span>
            {h.startDate && <span><IconClock size={14} /> Started {fmtDateTime(h.startDate)}</span>}
          </div>
          {h.appId !== 'MC' && (
            <div className="req-facts req-facts-light" aria-label="Organizational level of this request">
              <span><IconLayers size={14} /> {h.appId === 'MX' ? 'Change of' : 'Extension'}: material {h.objValue.replace(/^0+/, '') || '—'}</span>
              {h.appId === 'ME' && ORG_TYPE[h.genType] && <span>{ORG_TYPE[h.genType]}</span>}
              {orgChips.map((c) => <span key={c}>{c}</span>)}
            </div>
          )}
        </div>
        <div className={`req-next pv-${pageMode}`}>
          <div className="req-next-top">
            <span className="pv-icon" aria-hidden><PvIcon size={18} /></span>
            <span className="pv-text">
              <strong>{pageMode === 'review' ? 'Review' : pageMode === 'edit' ? 'Edit' : 'Display'}</strong>
              <span>{pageMode === 'review' ? 'SAP assigned this request to you. Fields open for input can be changed; then approve, send back, forward or reject.'
                : pageMode === 'edit' ? 'You can change the fields SAP opens for you, then save or submit.'
                : 'You have no action on this request at its current step.'}</span>
            </span>
          </div>
          <span className="pv-where"><IconFlow size={13} /> {st.label} · {levelText(req.level)}</span>
          {primary && (
            <button className="btn btn-white btn-block" onClick={() => openDialog(primary.id)} disabled={busy}>
              <primary.Icon size={15} /> {primary.label}
            </button>
          )}
        </div>
      </header>

      {fcError && (
        <div className="alert alert-error" role="alert">
          <p>The field control could not be read from SAP: {fcError}</p>
          <button type="button" className="btn btn-sm" onClick={() => loadFc(req)}>Try again</button>
        </div>
      )}
      {!fcError && fc && idx.empty && (
        <div className="alert alert-warn" role="status"><p>SAP returned no field control for material type {h.materialType || '—'} at {levelText(req.level)}: all fields are shown display only.</p></div>
      )}

      <div className="req-grid">
        <div className="req-main">
          <section className="card keydata">
            <div className="block-head"><span className="block-icon"><IconTag size={16} /></span><h3>Key data</h3></div>
            <dl className="kv kv-tiles">
              <div><dt>Material</dt><dd><MaterialNo value={h.objValue.replace(/^0+/, '')} /></dd></div>
              <div><dt>Material type</dt><dd>{show('materialType')}</dd></div>
              <div><dt>Industry sector</dt><dd>{show('industrySector')}</dd></div>
              {(['materialGroup', 'division', 'businessVertical', 'scheme'] as FieldKey[]).map((k) => keyInput(k))}
            </dl>
            <div className="ph-block">
              <span className="ph-block-label">Product hierarchy</span>
              {keyEditable('prodHierarchy') ? keyInput('prodHierarchy')
                : hierarchy.length > 1 ? (
                  <ol className="ph-trail">
                    {hierarchy.map((t, i) => <li key={i}><small>{PH_LEVELS[i]} · {phCodes[i]}</small><span>{t}</span></li>)}
                  </ol>
                ) : data.prodHierarchy ? <span className="matno">{data.prodHierarchy}</span> : <span className="muted">Not assigned</span>}
            </div>
            {keyEditable('description') && <div className="grid-form key-grid">{keyInput('description')}</div>}
            {keyEditable('longText') ? <div className="grid-form key-grid">{keyInput('longText')}</div>
              : data.longText && <div className="longtext-block"><span className="ph-block-label">Long text</span><p>{data.longText}</p></div>}

            <div className="block-head block-head-sep"><span className="block-icon"><IconBuilding size={16} /></span><h3>Organizational data</h3></div>
            <dl className="kv kv-tiles">
              <div><dt>Plant</dt><dd>{show('plant')}</dd></div>
              <div><dt>Storage location</dt><dd>{show('storageLocation')}</dd></div>
              <div><dt>Sales org</dt><dd>{show('salesOrg')}</dd></div>
              <div><dt>Distribution channel</dt><dd>{show('distChannel')}</dd></div>
              <div><dt>Warehouse</dt><dd>{show('warehouseNo')}</dd></div>
              <div><dt>Storage type</dt><dd>{show('storageType')}</dd></div>
            </dl>
          </section>

          <section className="card card-flush views-card">
            <div className="views-head">
              <div className="block-head"><span className="block-icon"><IconLayers size={16} /></span><h3>Material views</h3></div>
              <span className="muted small">
                {views.filter((v) => v.mode === 'edit').length > 0
                  ? `${views.filter((v) => v.mode === 'edit').length} of ${views.length} views open for your input`
                  : `${views.length} views · display only`}
              </span>
              {isMx && nChanged > 0 && (
                <button type="button" className={`chg-filter ${onlyChanged ? 'on' : ''}`} aria-pressed={onlyChanged} onClick={() => setOnlyChanged((x) => !x)}
                  title="Fields whose value differs from the live material the change started from">
                  Changed fields <span className="count-chip">{nChanged}</span>{onlyChanged ? ' · showing only these' : ''}
                </button>
              )}
            </div>
            {views.length === 0 && (
              <p className="muted views-empty">SAP shows no material view for you on this request at {levelText(req.level)}.</p>
            )}
            {views.length > 0 && <div className="views-layout">
              <nav className="view-nav" aria-label="Views">
                {VIEW_CATEGORIES.map((cat) => {
                  const inCat = shownViews.filter((v) => VIEW_BY_ID[v.id].category === cat);
                  if (!inCat.length) return null;
                  return (
                    <div key={cat} className="vn-group">
                      <span className="vn-cat">{cat}</span>
                      {inCat.map((v) => {
                        const fill = fillOf(v.id);
                        const errs = errorsIn(v.id);
                        return (
                          <button key={v.id} className={`vn-item ${tab === v.id ? 'active' : ''} ${v.mode === 'edit' ? 'editable' : ''}`} onClick={() => setTab(v.id)} aria-current={tab === v.id}>
                            <span className="vn-label">{VIEW_BY_ID[v.id].label}</span>
                            <span className="vn-meta">
                              {errs > 0 ? <span className="tab-count tab-count-error">{errs}</span> : <span className={`tab-fill ${fill.filled === fill.total ? 'full' : ''}`}>{fill.filled}/{fill.total}</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </nav>

              {tab && VIEW_BY_ID[tab] && (() => {
                const view = VIEW_BY_ID[tab];
                const cur = views.find((v) => v.id === tab);
                const mode = cur?.mode;
                const at = shownViews.findIndex((v) => v.id === tab);
                const prev = shownViews[at - 1];
                const nextV = shownViews[at + 1];
                const rf = reqFill(tab);
                return (
                  <div className="view-body">
                    <div className="view-title">
                      <div>
                        <h3>{view.label}</h3>
                        <span className="muted small"><span className="tech-inline">{view.table}</span></span>
                      </div>
                      <span className={`mode-pill ${mode === 'edit' ? 'is-edit' : ''}`}>
                        {mode === 'edit' ? <><IconDraft size={13} /> Open for your input</> : <><IconEye size={13} /> Display only</>}
                      </span>
                    </div>
                    {mode === 'edit' && rf.total > 0 && (
                      <div className={`section-badge view-progress ${rf.done === rf.total ? 'is-done' : ''}`}>
                        {rf.done === rf.total ? 'All required fields filled' : `${rf.done} of ${rf.total} required fields filled`}
                        <span className="section-badge-bar"><span style={{ width: `${(rf.done / rf.total) * 100}%` }} /></span>
                      </div>
                    )}
                    <div className="vgroups">
                      {view.groups.map((g) => {
                        const items = g.fields.map((f) => ({ f, ctl: ctlOfDef(f) })).filter((x) => x.ctl && (!onlyChanged || changedKeys.has(x.f.key)));
                        if (!items.length) return null;
                        const hasWide = items.some((x) => x.f.wide);
                        return (
                          <section key={g.title} className={`vgroup ${hasWide ? 'vgroup-wide' : ''}`}>
                            <h4 className="vgroup-title">{g.title}</h4>
                            <div className="vgroup-fields">
                              {items.map(({ f, ctl }) => (
                                <FieldInput
                                  key={`${g.title}-${f.key}-${f.label}`}
                                  def={f}
                                  data={data}
                                  value={data[f.key] ?? ''}
                                  ctl={ctl}
                                  alias={bindings.byKey[f.key]?.alias}
                                  changed={f.key in changed ? { was: changed[f.key] } : undefined}
                                  comments={{ transId: h.transId, canComment: allowed.comment }}
                                  error={f.type === 'ref' ? undefined : messages.find((m) => m.field === f.key)}
                                  onChange={(v) => set(f.key, v)}
                                />
                              ))}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                    <div className="view-pager">
                      {prev ? <button className="btn btn-ghost btn-sm" onClick={() => setTab(prev.id)}>← {VIEW_BY_ID[prev.id].label}</button> : <span />}
                      <span className="muted small">View {at + 1} of {shownViews.length}</span>
                      {nextV ? <button className="btn btn-sm" onClick={() => setTab(nextV.id)}>{VIEW_BY_ID[nextV.id].label} →</button> : <span />}
                    </div>
                  </div>
                );
              })()}
            </div>}
            {unboundByView.length > 0 && (
              <p className="muted small unbound-note">
                {unboundByView.length} field{unboundByView.length > 1 ? 's' : ''} of the screen definition have no counterpart in SAP&apos;s request data and are not shown.
              </p>
            )}
          </section>

          <div className="action-bar">
            <div className="action-bar-left">
              {dirty ? <span className="pill pill-warn">● Unsaved changes</span> : primary ? <span className="muted small">Your action is needed</span> : <span className="muted small">No action for you at this step</span>}
            </div>
            <div className="action-bar-right">
              <button className="btn btn-ghost" onClick={() => void duplicates()} disabled={busy}><IconSearch size={15} /> Duplicates</button>
              {allowed.validate && <button className="btn" onClick={() => void check()} disabled={busy}><IconCheck size={15} /> Check</button>}
              {allowed.deleteDraft && <button className="btn btn-danger-ghost" onClick={() => openDialog('delete')} disabled={busy}><IconTrash size={15} /> Delete</button>}
              {allowed.reject && <button className="btn btn-danger-ghost" onClick={() => openDialog('reject')} disabled={busy}><IconX size={15} /> Reject</button>}
              {allowed.sendBack && <button className="btn" onClick={() => openDialog('sendback')} disabled={busy}><IconUndo size={15} /> Send back</button>}
              {allowed.forward && <button className="btn" onClick={() => openDialog('forward')} disabled={busy}><IconShare size={15} /> Forward</button>}
              {allowed.saveDraft && <button className="btn" onClick={() => void save()} disabled={busy || !dirty}><IconSave size={15} /> {h.status === '00' ? 'Save draft' : 'Save'}</button>}
              {allowed.submit && <button className="btn btn-primary" onClick={() => openDialog('submit')} disabled={busy}><IconSend size={15} /> {h.status === '04' ? 'Resubmit' : 'Submit'}</button>}
              {allowed.approve && <button className="btn btn-primary" onClick={() => openDialog('approve')} disabled={busy}><IconCheck size={15} /> Approve</button>}
            </div>
          </div>
        </div>

        <aside className="req-side">
          {messages.length > 0 && <MessagePanel messages={messages} onPick={focusField} onClose={() => setMessages([])} />}
          <section className="card details-card">
            <h3>Request details</h3>
            <dl className="details">
              <div><dt>Request</dt><dd className="matno">{h.transId}</dd></div>
              <div><dt>Type</dt><dd>{h.appId} · {appLabel(h.appId)}</dd></div>
              <div><dt>Status</dt><dd>{h.status} · {h.statusText}</dd></div>
              <div><dt>Current level</dt><dd>{req.level}{lvl === 0 ? ' (initiator)' : ''}</dd></div>
              <div><dt>Initiator</dt><dd>{h.initiator || '—'}</dd></div>
              <div><dt>Started</dt><dd>{h.startDate ? fmtDateTime(h.startDate) : '—'}</dd></div>
              {h.endDate && <div><dt>Ended</dt><dd>{fmtDateTime(h.endDate)}</dd></div>}
              <div><dt>Views</dt><dd className="mono-sm">{req.data.views.join(', ') || 'all'}</dd></div>
              {h.isDuplicate && <div><dt>Duplicate</dt><dd>SAP marked this request as a possible duplicate</dd></div>}
            </dl>
          </section>
          <AttachmentsPanel transId={h.transId} canAttach={allowed.attach} materialType={h.materialType} />
          <CommentsPanel transId={h.transId} canComment={allowed.comment} />
          <section className="card">
            <h3>History <span className="count-chip">{req.history.length}</span></h3>
            {req.history.length === 0 && <p className="muted small">No history yet.</p>}
            <ol className="timeline">
              {[...req.history].reverse().map((x) => (
                <li key={x.serialNo} className="tl-normal">
                  <div className="tl-head"><strong>{x.level ? `Level ${levelNo(x.level)}` : 'Step'}{x.role && ` · ${x.role}`}</strong></div>
                  <div className="tl-meta">
                    <span className="tl-avatar" aria-hidden>{(x.user || '?').slice(0, 2).toUpperCase()}</span>
                    <span className="muted small">{x.user || '—'}{x.date ? ` · ${fmtDateTime(x.date)}` : ''}</span>
                  </div>
                  {x.comment && <blockquote>{x.comment}</blockquote>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {dialog && dlg && (
        <div className="overlay overlay-center" onClick={() => setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <span className={`dlg-icon tone-${dlg.tone}`} aria-hidden><dlg.Icon size={20} /></span>
              <div>
                <h2 id="dlg-title">{dlg.title}</h2>
                <p className="muted small">{dlg.text}</p>
              </div>
            </div>
            {dialog !== 'delete' && (
              <>
                {dialog === 'forward' && (
                  <label className="field">
                    <span className="field-label">Forward to (SAP user)<span className="req">*</span></span>
                    <input value={agent} onChange={(e) => { setAgent(e.target.value); setDialogError(''); }} autoFocus spellCheck={false} autoComplete="off" />
                  </label>
                )}
                {dialog === 'approve' && dirty && <p className="alert alert-info small">Your unsaved changes are sent with the approval.</p>}
                <label className="field">
                  <span className="field-label">{dlg.commentLabel}</span>
                  <textarea rows={3} value={comment} onChange={(e) => { setComment(e.target.value); setDialogError(''); }} autoFocus={dialog !== 'forward'} placeholder="Write a short note…" />
                </label>
              </>
            )}
            {dialogError && <p className="err small" role="alert">{dialogError}</p>}
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
              <button className={`btn ${dlg.tone === 'red' ? 'btn-danger' : 'btn-primary'}`} onClick={() => void confirmDialog()} disabled={busy}>{busy ? 'Working…' : dlg.button}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
