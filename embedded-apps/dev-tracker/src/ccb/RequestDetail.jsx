import React, { useCallback, useEffect, useState } from 'react';
import { ccbApi } from './api.js';
import RequestForm from './RequestForm.jsx';
import {
  Blocker, Button, Card, DefinitionList, Field, Loading, Meta, Modal, Person, Pill, ProcessStepper, Prose, ScopePill, useToast,
} from './ui.jsx';
import {
  CATEGORY_META, DECISION_META, FEASIBILITY_META, PRIORITY_META, ROUTE_META, STATUS_META,
  devTrackerLink, fmtDate, fmtDateTime, informOverdue, meetingLink, relative, stageLabel,
} from './model.js';
import { ROUTES } from '../shared/routes.js';
import {
  AlertIcon, BoltIcon, BoardIcon, CheckCircleIcon, ChevronLeftIcon, ExternalIcon, PencilIcon, SendIcon, TrashIcon, XIcon, RefreshIcon, GavelIcon, CheckIcon,
} from '../shared/icons.jsx';

// What each workflow action looks like and asks for. `review` = feasibility fields.
const ACTIONS = {
  submit: { label: 'Submit for feasibility review', variant: 'primary', icon: SendIcon, sub: 'Sends the request to the IT Application Head for the scope and feasibility check.' },
  recommend: { label: 'Recommend to CCB', variant: 'primary', icon: GavelIcon, review: true, sub: 'Records your feasibility assessment and puts the request on the next CCB meeting agenda.' },
  approve_out_of_scope: { label: 'Approve (outside CCB scope)', variant: 'success', icon: CheckCircleIcon, review: true, sub: 'Reports and cosmetic changes do not need the board. Approval creates the Dev Tracker assignment.' },
  approve_emergency: { label: 'Emergency approval', variant: 'danger', icon: BoltIcon, note: 'Written justification', sub: 'For an urgent business need or a critical system issue. The CCB must be informed within the inform window and the approval ratified at the next CCB meeting.' },
  return: { label: 'Return to IT SPOC', variant: 'ghost', icon: RefreshIcon, note: 'What needs clarifying?', sub: 'Sends the request back to draft so the IT SPOC can complete or correct it.' },
  reject: { label: 'Reject as not feasible', variant: 'danger', icon: XIcon, note: 'Reason for rejecting', sub: 'Closes the request. The reason is recorded and visible to everyone.' },
  withdraw: { label: 'Withdraw request', variant: 'danger', icon: TrashIcon, note: 'Reason for withdrawing', sub: 'Closes the request without a decision.' },
  mark_informed: { label: 'Mark CCB informed', variant: 'primary', icon: CheckIcon, sub: 'Confirms the board has been informed of this emergency approval in writing.' },
  terminate: { label: 'Terminate development', variant: 'danger', icon: XIcon, note: 'Reason for terminating', sub: 'Stops the change. Its Dev Tracker assignment is set to Cancelled.' },
};
const ACTION_ORDER = ['submit', 'recommend', 'approve_out_of_scope', 'mark_informed', 'approve_emergency', 'return', 'reject', 'terminate', 'withdraw'];

const HISTORY_LABEL = {
  logged: 'logged the request', submit: 'submitted it for feasibility review', edited: 'edited the request', withdraw: 'withdrew the request',
  return: 'returned it to the IT SPOC', reject: 'rejected it as not feasible', recommend: 'recommended it to the CCB',
  approve_out_of_scope: 'approved it (outside CCB scope)', approve_emergency: 'gave emergency approval', mark_informed: 'marked the CCB informed',
  terminate: 'terminated development', commented: 'commented', ccb_decision: 'recorded the CCB decision', ccb_ratification: 'recorded the CCB ratification',
  removed_from_agenda: 'removed it from a meeting agenda',
};

export default function RequestDetail({ crKey, me, onBack }) {
  const [state, setState] = useState({ loading: true, detail: null, error: null });
  const [dialog, setDialog] = useState(null);
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    ccbApi.request(crKey)
      .then((d) => setState({ loading: false, detail: d.detail, error: null }))
      .catch((e) => setState({ loading: false, detail: null, error: e }));
  }, [crKey]);
  useEffect(load, [load]);

  if (state.loading) return <Loading label="Loading change request…" />;
  if (state.error) return <Blocker error={state.error} onRetry={load} />;

  const { request: r, comments, history, agenda, devItem, names, actions } = state.detail;
  const nameOf = (e) => (e ? names[e] || e : null);
  const category = CATEGORY_META[r.category];
  const workflowActions = ACTION_ORDER.filter((a) => actions.includes(a));

  async function postComment() {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await ccbApi.comment(r.id, comment.trim());
      setComment('');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <a className="ccb-back" href={ROUTES.ccbRequests} onClick={(e) => { if (onBack) { e.preventDefault(); onBack(); } }}>
        <ChevronLeftIcon size={13} /> All change requests
      </a>

      <div className="ccb-head">
        <div className="ccb-head-text">
          <div className="ccb-detail-title">
            <span className="ccb-key">{r.crNo}</span>
            <Meta meta={STATUS_META} value={r.status} />
            <Meta meta={PRIORITY_META} value={r.priority} />
            {r.isEmergency && <Pill tone="red"><BoltIcon size={11} /> Emergency</Pill>}
          </div>
          <h1 className="page-title">{r.title}</h1>
          <p className="page-header-sub">
            {r.requestingFunction} · raised by {r.requestedBy} · logged by {nameOf(r.loggedBy)} {relative(r.createdAt)}
          </p>
        </div>
        <div className="ccb-head-actions">
          {actions.includes('edit') && <Button icon={PencilIcon} onClick={() => setEditing(true)}>Edit</Button>}
          {r.devTrackerIssueNo != null && <a className="ccb-btn primary" href={devTrackerLink(r.devTrackerIssueNo)}><BoardIcon size={15} /> Open in Dev Tracker</a>}
        </div>
      </div>

      {r.status === 'draft' && r.returnNote && (
        <div className="ccb-banner warn"><AlertIcon size={15} /><span className="grow"><strong>Returned for clarification:</strong> {r.returnNote}</span></div>
      )}
      {r.approvalRoute === 'emergency' && r.ratificationStatus === 'pending' && (
        <div className={`ccb-banner ${informOverdue(r) ? 'danger' : 'warn'}`}>
          <BoltIcon size={15} />
          <span className="grow">
            <strong>Emergency approval — ratification pending.</strong>{' '}
            {r.ccbInformedAt ? `CCB informed on ${fmtDate(r.ccbInformedAt)}.` : `CCB to be informed by ${fmtDate(r.informDueBy)}${informOverdue(r) ? ' (overdue)' : ''}.`}{' '}
            It will be on the next CCB meeting agenda for ratification.
          </span>
        </div>
      )}

      <Card title="Where this request is" sub="The CCB process, end to end — steps 6 to 9 update live from Dev Tracker." className="ccb-no-break">
        <ProcessStepper request={r} />
      </Card>

      <div className="ccb-grid two" style={{ marginTop: 16 }}>
        <div className="ccb-stack">
          <Card title="Business requirement">
            <div className="ccb-section-label">Requirement</div>
            <Prose>{r.description}</Prose>
            <div className="ccb-section-label">Business justification</div>
            <Prose>{r.justification}</Prose>
            <div className="ccb-section-label">Details</div>
            <DefinitionList rows={[
              ['Requesting function', r.requestingFunction],
              ['Raised by', r.requestedBy],
              ['BRD reference', r.brdReference && (/^https?:\/\//.test(r.brdReference) ? <a href={r.brdReference} target="_blank" rel="noreferrer">{r.brdReference} <ExternalIcon size={11} /></a> : r.brdReference)],
              ['IT area', `${r.sapSystem}${r.sapModules?.length ? ` · ${r.sapModules.join(', ')}` : ''}`],
              ['CCB category', <ScopePill category={r.category} categories={CATEGORY_META} />],
              ['Financial impact', r.financialImpact],
              ['Required by', r.requiredBy ? fmtDate(r.requiredBy) : null],
              r.isEmergency && ['Urgency', r.emergencyReason],
            ]} />
          </Card>

          <Card title="Scope & feasibility review" sub="Step 4 · IT Application Head">
            {r.reviewedAt ? (
              <DefinitionList rows={[
                ['Feasibility', <Meta meta={FEASIBILITY_META} value={r.feasibility} />],
                ['Impact on other systems', <Prose>{r.crossModuleImpact}</Prose>],
                ['Recommendation', r.reviewNotes && <Prose>{r.reviewNotes}</Prose>],
                ['Reviewed by', <Person name={nameOf(r.reviewedBy)} sub={fmtDateTime(r.reviewedAt)} />],
              ]} />
            ) : (
              <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>
                {r.status === 'draft' ? 'Not yet submitted.' : r.status === 'feasibility_review' ? 'With the IT Application Head for review.' : 'No review recorded.'}
              </p>
            )}
          </Card>

          <Card title="Decision" sub={category?.inScope ? 'Step 5 · Change Control Board' : 'Outside CCB scope · IT Application Head'}>
            {r.decidedAt ? (
              <DefinitionList rows={[
                ['Outcome', <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}><Meta meta={DECISION_META} value={r.decision} strong />{r.approvalRoute && <Meta meta={ROUTE_META} value={r.approvalRoute} />}</span>],
                ['Conditions / reasons', r.decisionNotes && <Prose>{r.decisionNotes}</Prose>],
                ['Decided', <Person name={nameOf(r.decidedBy)} sub={fmtDateTime(r.decidedAt)} />],
                r.meetingNo && ['Meeting', <a href={meetingLink(r.meetingId)}>{r.meetingNo}</a>],
                r.approvalRoute === 'emergency' && ['Ratification', <Meta meta={{ pending: { label: 'Pending', tone: 'amber' }, ...DECISION_META }} value={r.ratificationStatus} />],
                r.approvalRoute === 'emergency' && ['CCB informed', r.ccbInformedAt ? fmtDateTime(r.ccbInformedAt) : `Due by ${fmtDate(r.informDueBy)}`],
              ]} />
            ) : (
              <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>
                {r.status === 'awaiting_ccb' ? 'On the agenda for the next CCB meeting.' : r.status === 'withdrawn' ? 'Withdrawn before a decision.' : 'No decision yet.'}
              </p>
            )}
            {agenda.length > 0 && (
              <>
                <div className="ccb-section-label">CCB agenda history</div>
                <ul className="ccb-list">
                  {agenda.map((a) => (
                    <li key={a.id}>
                      <div className="ccb-list-main">
                        <a className="ccb-list-title" href={meetingLink(a.meetingId)}>{a.meetingNo} · {a.meetingTitle}</a>
                        <div className="ccb-list-sub">{fmtDate(a.scheduledAt)} · {a.kind === 'ratification' ? 'Ratification' : 'Decision'}{a.notes ? ` · ${a.notes}` : ''}</div>
                      </div>
                      {a.decision ? <Meta meta={DECISION_META} value={a.decision} /> : <Pill tone="blue">On agenda</Pill>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="Discussion" sub={`${comments.length} comment${comments.length === 1 ? '' : 's'}`}>
            {comments.length === 0 && <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No comments yet.</p>}
            {comments.map((c) => (
              <div className="ccb-comment" key={c.id}>
                <Person name={nameOf(c.authorEmail)} size={26} />
                <div className="ccb-comment-body">
                  <div className="ccb-comment-meta"><span>{relative(c.createdAt)}</span></div>
                  <div className="ccb-comment-text">{c.body}</div>
                </div>
              </div>
            ))}
            <div className="ccb-composer">
              <textarea className="ccb-textarea" placeholder="Add a comment for the SPOC, App Head or board…" value={comment} onChange={(e) => setComment(e.target.value)} />
              <Button variant="primary" icon={SendIcon} busy={posting} disabled={!comment.trim()} onClick={postComment}>Post</Button>
            </div>
          </Card>
        </div>

        <div className="ccb-stack">
          {workflowActions.length > 0 && (
            <Card title="Your next step" sub={`As ${me.roles.join(', ') || 'viewer'}`} className="ccb-actions-card ccb-no-print">
              <div className="ccb-actions-list">
                {workflowActions.map((a) => {
                  const A = ACTIONS[a];
                  return <Button key={a} variant={A.variant} icon={A.icon} onClick={() => setDialog(a)}>{A.label}</Button>;
                })}
              </div>
            </Card>
          )}

          <Card title="Delivery in Dev Tracker" sub="Steps 6–9 · Module Lead, developer, UAT, go-live">
            {devItem ? (
              <>
                <a className="ccb-delivery" href={devTrackerLink(devItem.issueNo)}>
                  <span className="ccb-delivery-ico"><BoardIcon size={17} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ccb-delivery-key">Assignment-{devItem.issueNo}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{stageLabel(r)}</span>
                  </span>
                  <ExternalIcon size={14} />
                </a>
                <div style={{ marginTop: 12 }}>
                  <DefinitionList rows={[
                    ['Status', devItem.status],
                    ['Developer', devItem.developer || <span className="ccb-muted">Not assigned yet</span>],
                    ['Start', devItem.startDate ? fmtDate(devItem.startDate) : null],
                    ['Target', devItem.targetDate ? fmtDate(devItem.targetDate) : null],
                    devItem.completedDate && ['Completed', fmtDate(devItem.completedDate)],
                  ]} />
                </div>
              </>
            ) : (
              <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>
                {r.status === 'approved' ? 'Assignment link unavailable.' : 'A Dev Tracker assignment is created automatically the moment this request is approved.'}
              </p>
            )}
          </Card>

          <Card title="People">
            <DefinitionList rows={[
              ['IT SPOC', <Person name={nameOf(r.loggedBy)} />],
              ['Module Lead', r.moduleLeadEmail && <Person name={nameOf(r.moduleLeadEmail)} />],
              ['Reviewer', r.reviewedBy && <Person name={nameOf(r.reviewedBy)} />],
              ['Decided by', r.decidedBy && <Person name={nameOf(r.decidedBy)} />],
            ]} />
          </Card>

          <Card title="Audit trail" sub="Append-only record of every action">
            <ol className="ccb-timeline">
              {history.map((h) => (
                <li key={h.id}>
                  <strong>{nameOf(h.actorEmail)}</strong> {HISTORY_LABEL[h.action] || h.action.replace(/_/g, ' ')}
                  {h.details?.decision && <> — <b>{DECISION_META[h.details.decision]?.label}</b></>}
                  {h.details?.devTrackerIssueNo != null && <> · created <a href={devTrackerLink(h.details.devTrackerIssueNo)}>Assignment-{h.details.devTrackerIssueNo}</a></>}
                  <small>{fmtDateTime(h.occurredAt)}{h.toStatus && h.toStatus !== h.fromStatus ? ` · ${STATUS_META[h.toStatus]?.label || h.toStatus}` : ''}</small>
                  {h.details?.note && <div className="note">{h.details.note}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {dialog && (
        <ActionDialog
          action={dialog}
          request={r}
          onClose={() => setDialog(null)}
          onDone={(updated) => {
            setDialog(null);
            const msg = updated.devTrackerIssueNo != null && updated.devTrackerIssueNo !== r.devTrackerIssueNo
              ? `${r.crNo} approved — Assignment-${updated.devTrackerIssueNo} created in Dev Tracker.`
              : `${r.crNo}: ${STATUS_META[updated.status]?.label || 'updated'}.`;
            showToast(msg);
            load();
          }}
        />
      )}
      {editing && (
        <RequestForm request={r} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); showToast('Changes saved.'); load(); }} />
      )}
      {toast}
    </>
  );
}

function ActionDialog({ action, request: r, onClose, onDone }) {
  const A = ACTIONS[action];
  const [note, setNote] = useState(action === 'approve_emergency' ? r.emergencyReason || '' : '');
  const [feasibility, setFeasibility] = useState(r.feasibility && r.feasibility !== 'not_feasible' ? r.feasibility : 'feasible');
  const [impact, setImpact] = useState(r.crossModuleImpact || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    setBusy(true);
    setError('');
    try {
      const extra = { note };
      if (A.review) Object.assign(extra, { feasibility, crossModuleImpact: impact });
      if (action === 'approve_emergency') extra.crossModuleImpact = impact;
      const d = await ccbApi.act(r.id, action, extra);
      onDone(d.request);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${A.label} — ${r.crNo}`}
      sub={A.sub}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={A.variant === 'ghost' ? 'primary' : A.variant === 'danger' ? 'danger-solid' : A.variant} icon={A.icon} busy={busy} onClick={go}>{A.label}</Button></>}
    >
      {A.review && (
        <>
          <Field label="Feasibility" required group>
            <div className="ccb-chips">
              {['feasible', 'feasible_with_conditions'].map((k) => (
                <button key={k} type="button" className={`ccb-chip-toggle${feasibility === k ? ' on' : ''}`} onClick={() => setFeasibility(k)}>{FEASIBILITY_META[k].label}</button>
              ))}
            </div>
          </Field>
          <Field label="Impact on other systems / modules" required hint='Which other modules, interfaces or reports are affected. Write "None" if there is none.'>
            <textarea className="ccb-textarea" value={impact} onChange={(e) => setImpact(e.target.value)} />
          </Field>
          <Field label={action === 'recommend' ? 'Recommendation to the board' : 'Approval notes'} hint="Optional. Shown to the board and in the audit trail.">
            <textarea className="ccb-textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
      {action === 'approve_emergency' && (
        <>
          <div className="ccb-callout tone-red"><BoltIcon size={15} /><span>Emergency approvals bypass the board. The CCB must be <strong>informed in writing</strong> and the approval <strong>ratified at the next CCB meeting</strong>.</span></div>
          {!r.reviewedAt && (
            <Field label="Impact on other systems / modules" hint="Optional but recommended.">
              <textarea className="ccb-textarea" value={impact} onChange={(e) => setImpact(e.target.value)} />
            </Field>
          )}
        </>
      )}
      {A.note && (
        <Field label={A.note} required>
          <textarea className="ccb-textarea" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      {!A.review && !A.note && action !== 'approve_emergency' && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>Confirm to continue.</p>
      )}
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}
