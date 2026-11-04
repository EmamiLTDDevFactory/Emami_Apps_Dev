'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { ActionId, FieldKey, MaterialData, Message, ViewId } from '@/lib/types';
import { FieldDef, VIEW_BY_ID, VIEW_CATEGORIES, displayValue, tableRows } from '@/lib/fieldConfig';
import { USERS, levelDef, userName } from '@/lib/workflowConfig';
import {
  Result, approve, checkDuplicate, deleteDraft, forward, getAllowedActions, getFieldControl, reject, returnForward,
  routingKeys, saveDraft, sendBack, submit, validate, viewEditors,
} from '@/lib/service';
import { fmtDateTime } from '@/lib/format';
import { LevelStepper, MaterialNo, StatusBadge, whereNow } from '../ui';
import { PH_LEVELS, helpText, hierarchyText, splitHierarchy } from '@/lib/valueHelps';
import {
  IconBox, IconBuilding, IconCheck, IconClock, IconDraft, IconEye, IconFlow, IconLayers, IconSave, IconSearch, IconSend, IconShare,
  IconTag, IconTrash, IconUndo, IconUser, IconX,
} from '../icons';

type DialogAction = Extract<ActionId, 'SUBMIT' | 'APPROVE' | 'SEND_BACK' | 'REJECT' | 'FORWARD' | 'RETURN' | 'DELETE_DRAFT'>;

const PAGE_VIEW_TEXT = {
  NORMAL: { title: 'Normal view', text: 'Your part is the key data. Correct it if needed, then submit; the material views are maintained by the approval levels.' },
  PRELIMINARY: { title: 'Preliminary view', text: 'You see the views assigned to your level. Views open for input can be changed; the others are for review only.' },
  FORWARD: { title: 'Forwarded for input', text: 'A reviewer has asked for your input. Return the request with a comment, or reject it.' },
  DISPLAY: { title: 'Display', text: 'You have no action on this request at its current step.' },
};

export default function RequestPage({ transId }: { transId: string }) {
  const router = useRouter();
  const { db, user, run, notify } = useMdm();
  const r = db.requests.find((x) => x.transId === transId);

  const [data, setData] = useState<MaterialData | null>(r?.data ?? null);
  const [tab, setTab] = useState<ViewId | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const [comment, setComment] = useState('');
  const [toUser, setToUser] = useState('');
  const [dialogError, setDialogError] = useState('');

  // Reload when the stored request changes (after an action) or the user switches
  useEffect(() => {
    if (r) setData(r.data);
    setMessages([]);
    setTab(null); // land on the tab open for this user
  }, [r?.changedOn, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fc = useMemo(() => (r ? getFieldControl(r, user) : null), [r, user]);
  const actions = useMemo(() => (r ? getAllowedActions(r, user) : []), [r, user]);

  useEffect(() => {
    if (!fc) return;
    if (!tab || !fc.views.some((v) => v.id === tab)) setTab(fc.views.find((v) => v.mode === 'edit')?.id ?? fc.views[0]?.id ?? null);
  }, [fc, tab]);

  if (!r || !fc || !data) {
    return (
      <div className="card placeholder">
        <h2>Request {transId} not found</h2>
        <p className="muted">It may have been deleted as a draft.</p>
        <Link href="/master/material/requests" className="btn">Back to requests</Link>
      </div>
    );
  }

  const dirty = JSON.stringify(data) !== JSON.stringify(r.data);
  const level = levelDef(r.level);
  const isFinal = r.status === '01' && !!level?.final;
  const keys = routingKeys(r);
  const show = (k: FieldKey) => displayValue(k, r.data[k], r.data) || '—';
  const errorsIn = (v: ViewId) => messages.filter((m) => m.view === v && m.severity === 'E').length;

  const set = (k: FieldKey, v: string) => {
    setData((d) => (d ? { ...d, [k]: v } : d));
    setMessages((ms) => ms.filter((m) => m.field !== k));
  };

  function focusField(m: Message) {
    if (m.view) setTab(m.view);
    if (m.field) setTimeout(() => document.getElementById(`f-${m.field}`)?.focus(), 30);
  }

  function handle(res: Result, success: string) {
    setMessages(res.messages);
    if (!res.ok) {
      notify('error', res.messages.find((m) => m.severity === 'E')?.text ?? 'Action failed');
      const first = res.messages.find((m) => m.view);
      if (first) focusField(first);
      return false;
    }
    notify('success', success);
    return true;
  }

  function check() {
    const msgs = validate(r!, data!, fc!);
    setMessages(msgs.length ? msgs : [{ severity: 'I', text: 'No errors found' }]);
    notify(msgs.some((m) => m.severity === 'E') ? 'error' : 'success', msgs.length ? `${msgs.length} message(s) – see the message panel` : 'No errors found');
  }

  function duplicates() {
    const hits = checkDuplicate(db, r!.data.description, r!.transId);
    setMessages(
      hits.length
        ? hits.map((h) => ({ severity: 'W' as const, text: `Possible duplicate: ${h.kind.toLowerCase()} ${h.id} – ${h.description} (plant ${h.plant}, ${h.score}%)` }))
        : [{ severity: 'I', text: 'No duplicates found' }],
    );
  }

  function save() {
    handle(run((d) => saveDraft(d, r!.transId, data!, user)), user.level === null ? 'Draft saved' : 'Saved');
  }

  function openDialog(a: DialogAction) {
    setComment('');
    setToUser('');
    setDialogError('');
    setDialog(a);
  }

  function confirmDialog() {
    let res: Result;
    let msg = '';
    switch (dialog) {
      case 'SUBMIT':
        res = run((d) => submit(d, r!.transId, data!, user, comment));
        msg = `Request ${r!.transId} submitted to level 1`;
        break;
      case 'APPROVE':
        res = run((d) => approve(d, r!.transId, data!, user, comment));
        msg = isFinal ? `Request approved and posted` : `Approved – sent to level ${r!.level + 1}`;
        break;
      case 'SEND_BACK':
        res = run((d) => sendBack(d, r!.transId, user, comment));
        msg = `Sent back to ${userName(r!.initiator)}`;
        break;
      case 'REJECT':
        res = run((d) => reject(d, r!.transId, user, comment));
        msg = `Request ${r!.transId} rejected`;
        break;
      case 'FORWARD':
        res = run((d) => forward(d, r!.transId, user, toUser, comment));
        msg = `Forwarded to ${userName(toUser)}`;
        break;
      case 'RETURN':
        res = run((d) => returnForward(d, r!.transId, user, comment));
        msg = 'Input returned to the reviewer';
        break;
      case 'DELETE_DRAFT':
        res = run((d) => deleteDraft(d, r!.transId, user));
        msg = `Draft ${r!.transId} deleted`;
        break;
      default:
        return;
    }
    if (!res.ok && !res.messages.some((m) => m.view)) {
      setDialogError(res.messages[0]?.text ?? 'Action failed');
      return;
    }
    setDialog(null);
    if (handle(res, res.request?.status === '05' ? `Approved. Material ${res.request.materialNumber} posted in SAP` : msg) && dialog === 'DELETE_DRAFT') {
      router.push('/master/material');
    }
  }

  const DIALOG = {
    SUBMIT: { title: r.status === '02' ? 'Resubmit request' : 'Submit request', text: 'The request goes to level 1 (Sales Team) for approval.', button: r.status === '02' ? 'Resubmit' : 'Submit', commentLabel: 'Comment (optional)', tone: 'blue', Icon: IconSend },
    APPROVE: { title: isFinal ? 'Approve and post to SAP' : `Approve and send to level ${r.level + 1}`, text: isFinal ? 'The material is created in SAP and gets its number.' : `The request moves on to ${levelDef(r.level + 1)?.team ?? 'the next level'}.`, button: isFinal ? 'Approve and post' : 'Approve', commentLabel: 'Comment (optional)', tone: 'green', Icon: IconCheck },
    SEND_BACK: { title: 'Send back to initiator', text: `${userName(r.initiator)} corrects the data and resubmits.`, button: 'Send back', commentLabel: 'What should the initiator correct?', tone: 'amber', Icon: IconUndo },
    REJECT: { title: 'Reject request', text: 'The request is closed and cannot be resubmitted.', button: 'Reject', commentLabel: 'Reason for rejection', tone: 'red', Icon: IconX },
    FORWARD: { title: 'Forward for input', text: 'The person you choose answers, and the request comes back to you.', button: 'Forward', commentLabel: 'What input do you need?', tone: 'violet', Icon: IconShare },
    RETURN: { title: 'Return with input', text: 'Your answer goes back to the reviewer who asked.', button: 'Return', commentLabel: 'Your input', tone: 'blue', Icon: IconUndo },
    DELETE_DRAFT: { title: 'Delete draft', text: `Draft ${r.transId} and all of its data will be deleted. This cannot be undone.`, button: 'Delete draft', commentLabel: '', tone: 'red', Icon: IconTrash },
  } as const;

  const editable = actions.length > 0 && fc.views.some((v) => v.mode === 'edit');
  const pv = PAGE_VIEW_TEXT[fc.pageView];
  const PvIcon = fc.pageView === 'DISPLAY' ? IconEye : fc.pageView === 'FORWARD' ? IconShare : IconDraft;
  const hierarchy = r.data.prodHierarchy ? hierarchyText(r.data.prodHierarchy).split(' › ') : [];
  const phCodes = splitHierarchy(r.data.prodHierarchy);
  const typeText = helpText('materialType', r.data.materialType);
  const plantText = helpText('plant', r.data.plant);
  const dlg = dialog ? DIALOG[dialog] : null;
  const primary: { id: DialogAction; label: string; Icon: typeof IconCheck } | null =
    actions.includes('APPROVE') ? { id: 'APPROVE', label: isFinal ? 'Approve and post' : 'Approve', Icon: IconCheck }
    : actions.includes('SUBMIT') ? { id: 'SUBMIT', label: r.status === '02' ? 'Resubmit' : 'Submit for approval', Icon: IconSend }
    : actions.includes('RETURN') ? { id: 'RETURN', label: 'Return with input', Icon: IconUndo }
    : null;
  /** Filled fields per view (tab counters) and required progress for the open tab */
  const viewFill = (id: ViewId) => {
    const fs = VIEW_BY_ID[id].fields;
    return { filled: fs.filter((f) => !!data[f.key]).length, total: fs.length };
  };
  const editorsText = (id: ViewId) => {
    const lv = viewEditors(r.data.materialType, id);
    return lv.length ? `Maintained by ${lv.map((l) => `L${l} ${levelDef(l)?.team ?? ''}`).join(', ')}` : 'Display only for all levels';
  };
  const editorsTag = (id: ViewId) => {
    const lv = viewEditors(r.data.materialType, id);
    return lv.length ? lv.map((l) => `L${l}`).join(' ') : '—';
  };
  const reqFill = (id: ViewId) => {
    const fs = VIEW_BY_ID[id].fields.filter((f) => f.required);
    return { done: fs.filter((f) => !!String(data[f.key] ?? '').trim()).length, total: fs.length };
  };

  return (
    <div className="req-page">
      <header className={`home-banner req-banner req-banner-${r.status}`}>
        <div className="home-banner-text req-banner-text">
          <Link href="/master/material/requests" className="back back-light">All requests</Link>
          <div className="req-ids">
            <span className="id-chip id-chip-dark">{r.transId}</span>
            <StatusBadge status={r.status} />
            <span className="id-chip id-chip-dark">{r.appId} · Create</span>
          </div>
          <h2>{r.data.description || 'Untitled request'}</h2>
          <div className="req-facts req-facts-light">
            <span><IconTag size={14} /> {r.data.materialType}{typeText && ` · ${typeText}`}</span>
            <span><IconBuilding size={14} /> Plant {r.data.plant}{plantText && ` · ${plantText}`}</span>
            <span><IconUser size={14} /> {userName(r.initiator)}</span>
            <span><IconClock size={14} /> Changed {fmtDateTime(r.changedOn)}</span>
          </div>
        </div>
        <div className={`req-next pv-${fc.pageView.toLowerCase()}`}>
          <div className="req-next-top">
            <span className="pv-icon" aria-hidden><PvIcon size={18} /></span>
            <span className="pv-text">
              <strong>{pv.title}</strong>
              <span>{pv.text}</span>
            </span>
          </div>
          <span className="pv-where"><IconFlow size={13} /> {whereNow(r)}</span>
          {primary && (
            <button className="btn btn-white btn-block" onClick={() => openDialog(primary.id)}>
              <primary.Icon size={15} /> {primary.label}
            </button>
          )}
        </div>
      </header>

      <LevelStepper r={r} />

      <div className="req-grid">
        <div className="req-main">
          <section className="card keydata">
            <div className="block-head"><span className="block-icon"><IconTag size={16} /></span><h3>Key data</h3></div>
            <dl className="kv kv-tiles">
              <div><dt>Material</dt><dd><MaterialNo value={r.materialNumber} /></dd></div>
              <div><dt>Material type</dt><dd>{show('materialType')}</dd></div>
              <div><dt>Industry sector</dt><dd>{show('industrySector')}</dd></div>
              <div><dt>Material group</dt><dd>{show('materialGroup')}</dd></div>
              <div><dt>Division</dt><dd>{show('division')}</dd></div>
              <div><dt>Business vertical</dt><dd>{show('businessVertical')}</dd></div>
              <div><dt>Scheme</dt><dd>{show('scheme')}</dd></div>
            </dl>
            <div className="ph-block">
              <span className="ph-block-label">Product hierarchy</span>
              {hierarchy.length > 1 ? (
                <ol className="ph-trail">
                  {hierarchy.map((t, i) => (
                    <li key={i}><small>{PH_LEVELS[i]} · {phCodes[i]}</small><span>{t}</span></li>
                  ))}
                </ol>
              ) : <span className="muted">Not assigned</span>}
            </div>
            {r.data.longText && (
              <div className="longtext-block"><span className="ph-block-label">Long text</span><p>{r.data.longText}</p></div>
            )}

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
                {fc.views.filter((v) => v.mode === 'edit').length > 0
                  ? `${fc.views.filter((v) => v.mode === 'edit').length} of ${fc.views.length} views open for your input`
                  : `${fc.views.length} views · display only`}
              </span>
            </div>
            {fc.views.length === 0 && (
              <p className="muted views-empty">No material views are assigned to you for this request. The views are maintained by the approval levels.</p>
            )}
            {fc.views.length > 0 && <div className="views-layout">
              <nav className="view-nav" aria-label="Views">
                {VIEW_CATEGORIES.map((cat) => {
                  const inCat = fc.views.filter((v) => VIEW_BY_ID[v.id].category === cat);
                  if (!inCat.length) return null;
                  return (
                    <div key={cat} className="vn-group">
                      <span className="vn-cat">{cat}</span>
                      {inCat.map((v) => {
                        const fill = viewFill(v.id);
                        const errs = errorsIn(v.id);
                        return (
                          <button key={v.id} className={`vn-item ${tab === v.id ? 'active' : ''} ${v.mode === 'edit' ? 'editable' : ''}`} onClick={() => setTab(v.id)} aria-current={tab === v.id}>
                            <span className="vn-label">{VIEW_BY_ID[v.id].label}</span>
                            <span className="vn-meta">
                              {errs > 0 ? <span className="tab-count tab-count-error">{errs}</span> : <span className={`tab-fill ${fill.filled === fill.total ? 'full' : ''}`}>{fill.filled}/{fill.total}</span>}
                              <span className="tab-lvl" title={editorsText(v.id)}>{editorsTag(v.id)}</span>
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
                const mode = fc.views.find((v) => v.id === tab)?.mode;
                const idx = fc.views.findIndex((v) => v.id === tab);
                const prev = fc.views[idx - 1];
                const nextV = fc.views[idx + 1];
                const rf = reqFill(tab);
                return (
                  <div className="view-body">
                    <div className="view-title">
                      <div>
                        <h3>{view.label}</h3>
                        <span className="muted small">{editorsText(view.id)} · <span className="tech-inline">{view.table}</span></span>
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
                        const hasWide = g.fields.some((f) => f.wide);
                        return (
                          <section key={g.title} className={`vgroup ${hasWide ? 'vgroup-wide' : ''}`}>
                            <h4 className="vgroup-title">{g.title}</h4>
                            <div className="vgroup-fields">
                              {g.fields.map((f) => (
                                <FieldInput
                                  key={`${g.title}-${f.key}-${f.label}`}
                                  def={f}
                                  data={data}
                                  value={data[f.key] ?? ''}
                                  ctl={f.type === 'ref' ? { mode: 'display', required: false } : fc.field(f.key)}
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
                      <span className="muted small">View {idx + 1} of {fc.views.length}</span>
                      {nextV ? <button className="btn btn-sm" onClick={() => setTab(nextV.id)}>{VIEW_BY_ID[nextV.id].label} →</button> : <span />}
                    </div>
                  </div>
                );
              })()}
            </div>}
          </section>

          <div className="action-bar">
            <div className="action-bar-left">
              {dirty ? <span className="pill pill-warn">● Unsaved changes</span> : actions.length > 0 ? <span className="muted small">Your action is needed</span> : <span className="muted small">No action for you at this step</span>}
            </div>
            <div className="action-bar-right">
              <button className="btn btn-ghost" onClick={duplicates}><IconSearch size={15} /> Duplicates</button>
              {editable && <button className="btn" onClick={check}><IconCheck size={15} /> Check</button>}
              {actions.includes('DELETE_DRAFT') && <button className="btn btn-danger-ghost" onClick={() => openDialog('DELETE_DRAFT')}><IconTrash size={15} /> Delete</button>}
              {actions.includes('REJECT') && <button className="btn btn-danger-ghost" onClick={() => openDialog('REJECT')}><IconX size={15} /> Reject</button>}
              {actions.includes('SEND_BACK') && <button className="btn" onClick={() => openDialog('SEND_BACK')}><IconUndo size={15} /> Send back</button>}
              {actions.includes('FORWARD') && <button className="btn" onClick={() => openDialog('FORWARD')}><IconShare size={15} /> Forward</button>}
              {actions.includes('SAVE_DRAFT') && (
                <Link className="btn" href={`/master/material/new?id=${r.transId}`}><IconDraft size={15} /> Edit key data</Link>
              )}
              {actions.includes('SAVE') && (
                <button className="btn" onClick={save} disabled={!dirty}><IconSave size={15} /> Save</button>
              )}
              {actions.includes('SUBMIT') && <button className="btn btn-primary" onClick={() => openDialog('SUBMIT')}><IconSend size={15} /> {r.status === '02' ? 'Resubmit' : 'Submit'}</button>}
              {actions.includes('APPROVE') && <button className="btn btn-primary" onClick={() => openDialog('APPROVE')}><IconCheck size={15} /> {isFinal ? 'Approve and post' : 'Approve'}</button>}
              {actions.includes('RETURN') && <button className="btn btn-primary" onClick={() => openDialog('RETURN')}><IconUndo size={15} /> Return with input</button>}
            </div>
          </div>
        </div>

        <aside className="req-side">
          {messages.length > 0 && <MessagePanel messages={messages} onPick={focusField} onClose={() => setMessages([])} />}
          <section className="card details-card">
            <h3>Request details</h3>
            <dl className="details">
              <div><dt>Request</dt><dd className="matno">{r.transId}</dd></div>
              <div><dt>Workflow</dt><dd className="mono-sm">{keys.workflow}</dd></div>
              <div><dt>Routing keys</dt><dd className="mono-sm">{keys.materialType} · {keys.plant} · {keys.salesOrg}</dd></div>
              <div><dt>Initiator</dt><dd>{userName(r.initiator)}</dd></div>
              <div><dt>Created</dt><dd>{fmtDateTime(r.createdOn)}</dd></div>
              <div><dt>Last change</dt><dd>{fmtDateTime(r.changedOn)}</dd></div>
            </dl>
          </section>
          <section className="card">
            <h3>History <span className="count-chip">{r.history.length}</span></h3>
            <ol className="timeline">
              {[...r.history].reverse().map((h, i) => (
                <li key={i} className={`tl-${h.status === '03' ? 'rejected' : h.status === '02' ? 'returned' : h.department === 'System' ? 'system' : h.status === '04' ? 'forward' : 'normal'}`}>
                  <div className="tl-head"><strong>{h.action}</strong></div>
                  <div className="tl-meta">
                    <span className="tl-avatar" aria-hidden>{h.department === 'System' ? 'SAP' : h.by.split(' ').map((p) => p[0]).join('')}</span>
                    <span className="muted small">{h.by}{h.level ? `, L${h.level} ${h.department}` : h.department !== 'System' ? `, ${h.department}` : ''} · {fmtDateTime(h.at)}</span>
                  </div>
                  {h.comment && <blockquote>{h.comment}</blockquote>}
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
            {dialog !== 'DELETE_DRAFT' && (
              <>
                {dialog === 'FORWARD' && (
                  <label className="field">
                    <span className="field-label">Forward to<span className="req">*</span></span>
                    <select value={toUser} onChange={(e) => setToUser(e.target.value)} autoFocus>
                      <option value="">Choose a person…</option>
                      {USERS.filter((u) => u.level !== null && u.id !== user.id).map((u) => (
                        <option key={u.id} value={u.id}>{u.name} – L{u.level} {u.department}</option>
                      ))}
                    </select>
                  </label>
                )}
                {dialog === 'APPROVE' && dirty && <p className="alert alert-info small">Your unsaved changes are saved with the approval.</p>}
                <label className="field">
                  <span className="field-label">{dlg.commentLabel}</span>
                  <textarea rows={3} value={comment} onChange={(e) => { setComment(e.target.value); setDialogError(''); }} autoFocus={dialog !== 'FORWARD'} placeholder="Write a short note…" />
                </label>
              </>
            )}
            {dialogError && <p className="err small" role="alert">{dialogError}</p>}
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
              <button className={`btn ${dlg.tone === 'red' ? 'btn-danger' : 'btn-primary'}`} onClick={confirmDialog}>{dlg.button}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput({ def, data, value, ctl, error, onChange }: {
  def: FieldDef;
  data: MaterialData;
  value: string;
  ctl: { mode: 'edit' | 'display'; required: boolean } | null;
  error?: Message;
  onChange: (v: string) => void;
}) {
  if (!ctl) return null;
  const id = `f-${def.key}`;
  const edit = ctl.mode === 'edit' && !def.readOnly && def.type !== 'ref';
  const cls = `field ${def.wide ? 'field-wide' : ''} ${error?.severity === 'E' ? 'field-error' : error?.severity === 'W' ? 'field-warn' : ''} ${edit ? '' : 'field-display'} ${def.type === 'ref' ? 'field-ref' : ''}`;

  if (def.type === 'table') {
    return (
      <div className={cls}>
        <span className="field-label">{def.label}<span className="tech">{def.tech}</span></span>
        <TableField def={def} value={value} edit={edit} baseUom={data.baseUom} onChange={onChange} />
        {error && <small className={error.severity === 'E' ? 'err' : 'warn-text'}>{error.text}</small>}
      </div>
    );
  }
  if (def.type === 'attachments') {
    return (
      <div className={cls}>
        <AttachmentsField def={def} value={value} edit={edit} onChange={onChange} />
      </div>
    );
  }

  const shown = displayValue(def.key, value, data);
  return (
    <div className={cls}>
      <label htmlFor={id} className="field-label">
        {def.label}
        {ctl.required && <span className="req">*</span>}
        {def.type === 'ref' ? <span className="tech" title="Maintained in another view">linked</span> : <span className="tech">{def.tech}</span>}
      </label>
      {!edit ? (
        <div id={id} className="display-value" tabIndex={-1}>{shown || <span className="muted">—</span>}</div>
      ) : def.type === 'checkbox' ? (
        <label className="check check-field">
          <input id={id} type="checkbox" checked={value === 'X'} onChange={(e) => onChange(e.target.checked ? 'X' : '')} />
          {value === 'X' ? 'Yes' : 'No'}
        </label>
      ) : def.type === 'select' ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error?.severity === 'E'}>
          {!def.options!.some((o) => o.value === '') && <option value="">Choose…</option>}
          {def.options!.map((o) => <option key={o.value} value={o.value}>{o.value ? `${o.value} – ${o.label}` : o.label}</option>)}
        </select>
      ) : def.type === 'textarea' ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <span className={def.unit ? 'input-unit' : undefined}>
          <input
            id={id}
            type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
            step="any"
            min={def.type === 'number' ? 0 : undefined}
            value={value}
            maxLength={def.maxLength}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error?.severity === 'E'}
          />
          {def.unit && <span className="unit">{def.unit}</span>}
        </span>
      )}
      {error && <small className={error.severity === 'E' ? 'err' : 'warn-text'}>{error.text}</small>}
    </div>
  );
}

/** Editable grid for table fields (tax data, classification, descriptions, units of measure) */
function TableField({ def, value, edit, baseUom, onChange }: { def: FieldDef; value: string; edit: boolean; baseUom: string; onChange: (v: string) => void }) {
  const rows = tableRows(value);
  const cols = def.columns ?? [];
  const write = (next: Record<string, string>[]) => onChange(JSON.stringify(next));
  const setCell = (i: number, k: string, v: string) => write(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRow = () => write([...rows, Object.fromEntries(cols.map((c) => [c.key, c.key === 'baseUnit' ? baseUom : '']))]);
  const removeRow = (i: number) => write(rows.filter((_, j) => j !== i));
  return (
    <div className="ftable-wrap">
      <table className="ftable">
        <thead>
          <tr>
            {cols.map((c) => <th key={c.key}>{c.label}{c.required && edit && <span className="req">*</span>}</th>)}
            {edit && !def.fixedRows && <th aria-label="Remove" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="muted small">No rows{edit && !def.fixedRows ? ' – add one below' : ''}.</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const v = c.key === 'baseUnit' && !r[c.key] ? baseUom : r[c.key] ?? '';
                if (!edit || c.type === 'readonly') {
                  const label = c.options?.find((o) => o.value === v)?.label;
                  return <td key={c.key}>{c.type === 'checkbox' ? (v === 'X' ? 'Yes' : '') : label ? `${v} – ${label}` : v || <span className="muted">—</span>}</td>;
                }
                if (c.type === 'checkbox') return <td key={c.key}><input type="checkbox" checked={v === 'X'} onChange={(e) => setCell(i, c.key, e.target.checked ? 'X' : '')} aria-label={c.label} /></td>;
                if (c.type === 'select') {
                  return (
                    <td key={c.key}>
                      <select value={v} onChange={(e) => setCell(i, c.key, e.target.value)} aria-label={c.label}>
                        <option value="">Choose…</option>
                        {c.options!.map((o) => <option key={o.value} value={o.value}>{o.value} – {o.label}</option>)}
                      </select>
                    </td>
                  );
                }
                return <td key={c.key}><input type={c.type === 'number' ? 'number' : 'text'} value={v} onChange={(e) => setCell(i, c.key, e.target.value)} aria-label={c.label} /></td>;
              })}
              {edit && !def.fixedRows && (
                <td className="ftable-x"><button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(i)} aria-label={`Remove row ${i + 1}`}>✕</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {edit && !def.fixedRows && <button type="button" className="btn btn-ghost btn-sm ftable-add" onClick={addRow}>+ Add row</button>}
    </div>
  );
}

/** Attachment list (demo keeps file name, type and tag; files are not uploaded anywhere) */
function AttachmentsField({ def, value, edit, onChange }: { def: FieldDef; value: string; edit: boolean; onChange: (v: string) => void }) {
  const rows = tableRows(value);
  const [docType, setDocType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tag, setTag] = useState('');
  const [inputKey, setInputKey] = useState(0);
  function attach() {
    if (!file || !docType) return;
    const no = String(rows.length + 1).padStart(4, '0');
    onChange(JSON.stringify([...rows, { no, name: file.name, type: docType, tag, size: String(file.size) }]));
    setFile(null);
    setTag('');
    setInputKey((k) => k + 1);
  }
  return (
    <div className="attach">
      <p className="muted small">Attachment supports files like: .JPEG, .GIF, .XLS, .TXT, .JPG, .PDF</p>
      <div className="attach-grid">
        <div className="ftable-wrap">
          <table className="ftable">
            <thead><tr><th>Attachment Number</th><th>Attachment Name</th><th>Document Type</th><th>Tag</th>{edit && <th>Delete</th>}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="muted small">No files attached.</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="matno">{r.no}</td>
                  <td>{r.name}</td>
                  <td>{def.options?.find((o) => o.value === r.type)?.label ?? r.type}</td>
                  <td>{r.tag || <span className="muted">—</span>}</td>
                  {edit && <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(JSON.stringify(rows.filter((_, j) => j !== i)))}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="attach-form">
            <label className="field">
              <span className="field-label">Document Type</span>
              <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="">Choose…</option>
                {def.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Upload File</span>
              <input key={inputKey} type="file" accept=".jpeg,.jpg,.gif,.xls,.xlsx,.txt,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="field">
              <span className="field-label">Tag Name</span>
              <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={30} />
            </label>
            <button type="button" className="btn btn-primary btn-sm" onClick={attach} disabled={!file || !docType}>Attach</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MessagePanel({ messages, onPick, onClose }: { messages: Message[]; onPick: (m: Message) => void; onClose: () => void }) {
  const groups = new Map<string, Message[]>();
  messages.forEach((m) => {
    const k = m.view ? VIEW_BY_ID[m.view].label : 'General';
    groups.set(k, [...(groups.get(k) ?? []), m]);
  });
  const errors = messages.filter((m) => m.severity === 'E').length;
  return (
    <section className="card msg-panel" role="alert" aria-live="assertive">
      <div className="msg-head">
        <h3>{errors ? `${errors} error${errors > 1 ? 's' : ''}` : 'Messages'}</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Clear</button>
      </div>
      {Array.from(groups.entries()).map(([g, ms]) => (
        <div key={g} className="msg-group">
          <h4>{g}</h4>
          <ul>
            {ms.map((m, i) => (
              <li key={i} className={`msg msg-${m.severity}`}>
                <span className="msg-sev" aria-label={m.severity === 'E' ? 'Error' : m.severity === 'W' ? 'Warning' : 'Information'}>{m.severity}</span>
                {m.field ? <button className="link" onClick={() => onPick(m)}>{m.text}</button> : <span>{m.text}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
