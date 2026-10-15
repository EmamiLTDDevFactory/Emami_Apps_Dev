import React, { useCallback, useEffect, useState } from 'react';
import { ccbApi } from './api.js';
import { Blocker, Button, Card, DefinitionList, Field, Loading, Meta, Modal, Person, Pill, RoleBadge, ScopePill, useToast } from './ui.jsx';
import { ACTION_STATUS_META, CATEGORY_META, DECISION_META, FEASIBILITY_META, MEETING_STATUS_META, PRIORITY_META, REVIEW_META, actionOverdue, devTrackerLink, fmtDate, fmtDateTime, fmtTime, isoOf, requestLink } from './model.js';
import { ROUTES } from '../shared/routes.js';
import {
  AlertIcon, BoltIcon, CheckCircleIcon, CheckIcon, ChevronLeftIcon, ClockIcon, GavelIcon, PlayIcon, PlusIcon, PrinterIcon, RefreshIcon, TrashIcon, XIcon, ExternalIcon,
} from '../shared/icons.jsx';

const DECISION_BUTTONS = {
  decision: [
    { key: 'approved', label: 'Approve', variant: 'success', icon: CheckIcon },
    { key: 'approved_with_modifications', label: 'Approve with modifications', variant: 'primary', icon: CheckCircleIcon },
    { key: 'rejected', label: 'Reject', variant: 'danger', icon: XIcon },
    { key: 'deferred', label: 'Defer', variant: 'ghost', icon: ClockIcon },
  ],
  ratification: [
    { key: 'ratified', label: 'Ratify', variant: 'success', icon: CheckIcon },
    { key: 'not_ratified', label: 'Do not ratify', variant: 'danger', icon: XIcon },
  ],
};
const NOTES_REQUIRED = ['approved_with_modifications', 'rejected', 'deferred', 'not_ratified'];

export default function MeetingRoom({ id, me, onBack }) {
  const [state, setState] = useState({ loading: true, detail: null, error: null });
  const [deciding, setDeciding] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [minutes, setMinutes] = useState('');
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, showToast] = useToast();
  const [reviewing, setReviewing] = useState(null); // { it, position }
  const [addingAction, setAddingAction] = useState(false);

  const load = useCallback(() => {
    return ccbApi.meeting(id)
      .then((d) => { setState({ loading: false, detail: d.detail, error: null }); setMinutes((m) => m || d.detail.meeting.minutes || ''); })
      .catch((e) => setState({ loading: false, detail: null, error: e }));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (state.loading) return <Loading label="Opening meeting room…" />;
  if (state.error) return <Blocker error={state.error} onRetry={load} />;

  const { meeting: m, items, attendance, people, names, quorum, notOnAgenda, canRun, teamsConfigured, reviews = [], actions = [], canReview } = state.detail;
  const reviewsOf = (itemId) => reviews.filter((v) => v.meetingItemId === itemId);
  const myEmail = (me?.email || '').toLowerCase();
  const open = ['scheduled', 'in_progress'].includes(m.status);
  const teamsLive = open && m.teamsStatus === 'created' && !!m.teamsJoinUrl;
  const nameOf = (e) => (e ? names[e] || e : '');
  const present = new Set(attendance.filter((a) => a.present).map((a) => a.email));
  const live = m.status === 'in_progress';
  const ratifications = items.filter((i) => i.kind === 'ratification');
  const decisions = items.filter((i) => i.kind === 'decision');
  const undecided = items.filter((i) => !i.decision).length;
  const members = people.filter((p) => p.roles.includes('CCB Member'));

  async function run(key, fn, success) {
    setBusy(key);
    try {
      await fn();
      if (success) showToast(success);
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function toggleAttendance(email, on) {
    try {
      await ccbApi.setAttendance(m.id, email, on);
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function saveMinutes() {
    setSavingMinutes(true);
    try {
      await ccbApi.updateMeeting(m.id, { minutes });
      showToast('Minutes saved.');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSavingMinutes(false);
    }
  }

  return (
    <>
      <a className="ccb-back ccb-no-print" href={ROUTES.ccbMeetings} onClick={(e) => { e.preventDefault(); onBack(); }}><ChevronLeftIcon size={13} /> All meetings</a>

      <div className="ccb-print-only" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#666' }}>Emami Limited · Change Control Board</div>
        <h1 style={{ margin: '4px 0' }}>Minutes — {m.title}</h1>
        <div style={{ fontSize: 12 }}>{m.meetingNo} · {fmtDateTime(m.scheduledAt)} · {m.mode}{m.venue ? ` · ${m.venue}` : ''}</div>
        <div style={{ fontSize: 12, marginTop: 6 }}><b>Present:</b> {people.filter((p) => present.has(p.email)).map((p) => p.name).join(', ') || '—'}</div>
        {actions.length > 0 && <div style={{ fontSize: 12 }}><b>Action items:</b> {actions.map((a) => `${a.title} (${nameOf(a.owner)}${a.dueDate ? `, due ${fmtDate(a.dueDate)}` : ''}${a.status !== 'open' ? `, ${a.status}` : ''})`).join('; ')}</div>}
        <div style={{ fontSize: 12 }}><b>Quorum:</b> {quorum.present} of {quorum.required} required CCB members {quorum.met ? '(met)' : '(not met)'}</div>
      </div>

      <div className="ccb-head">
        <div className="ccb-head-text">
          <div className="ccb-detail-title">
            <span className="ccb-key">{m.meetingNo}</span>
            {live ? <Pill tone="purple"><span className="ccb-live">In session</span></Pill> : <Meta meta={MEETING_STATUS_META} value={m.status} />}
            {m.isEmergency && <Pill tone="red"><BoltIcon size={11} /> Emergency meeting</Pill>}
          </div>
          <h1 className="page-title">{m.title}</h1>
          <p className="page-header-sub">
            {new Date(m.scheduledAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {fmtTime(m.scheduledAt)} ·{' '}
            {m.mode === 'online' ? 'Online' : m.mode === 'offline' ? 'In person' : 'Hybrid'}
            {m.venue && <> · {/^https?:\/\//.test(m.venue) ? <a href={m.venue} target="_blank" rel="noreferrer">Join link <ExternalIcon size={11} /></a> : m.venue}</>}
          </p>
        </div>
        <div className="ccb-head-actions">
          {teamsLive && <a className="ccb-btn primary ccb-no-print" style={{ textDecoration: 'none' }} href={m.teamsJoinUrl} target="_blank" rel="noreferrer"><ExternalIcon size={13} /> Join Teams meeting</a>}
          {canRun && ['scheduled', 'in_progress'].includes(m.status) && notOnAgenda > 0 && (
            <Button icon={RefreshIcon} busy={busy === 'refresh'} onClick={() => run('refresh', () => ccbApi.refreshAgenda(m.id), 'Agenda updated.')}>Add {notOnAgenda} waiting</Button>
          )}
          {canRun && m.status === 'scheduled' && <Button variant="danger" icon={XIcon} onClick={() => setConfirm('cancel')}>Cancel meeting</Button>}
          {canRun && m.status === 'scheduled' && <Button variant="primary" icon={PlayIcon} busy={busy === 'start'} onClick={() => run('start', () => ccbApi.startMeeting(m.id), 'Meeting started. Mark attendance to reach quorum.')}>Start meeting</Button>}
          {canRun && live && <Button variant="success" icon={CheckCircleIcon} onClick={() => setConfirm('complete')}>Close meeting</Button>}
          <Button icon={PrinterIcon} onClick={() => window.print()}>{m.status === 'completed' ? 'Print minutes' : 'Print agenda'}</Button>
        </div>
      </div>

      {open && canRun && teamsConfigured && m.mode !== 'offline' && (m.teamsStatus === 'failed' || m.teamsStatus === 'none' || (m.teamsError && m.teamsEventId)) && (
        <div className="ccb-banner warn ccb-no-print">
          <AlertIcon size={15} />
          <span className="grow">
            <strong>{m.teamsEventId ? 'The Teams invitation could not be updated.' : m.teamsStatus === 'failed' ? 'No Teams meeting yet.' : 'This meeting has no Teams meeting.'}</strong>{' '}
            {m.teamsError || 'Create one to send the board a Teams invitation.'}
          </span>
          <Button icon={RefreshIcon} busy={busy === 'teams'} onClick={() => run('teams', () => ccbApi.syncTeams(m.id), m.teamsEventId ? 'Teams invitation updated.' : 'Teams meeting created and sent to the board.')}>{m.teamsEventId ? 'Update invitation' : 'Create Teams meeting'}</Button>
        </div>
      )}
      {live && !quorum.met && (
        <div className="ccb-banner warn ccb-no-print"><AlertIcon size={15} /><span className="grow"><strong>Quorum not met.</strong> Mark at least {quorum.required} CCB members present before recording decisions ({quorum.present} so far).</span></div>
      )}
      {m.status === 'scheduled' && (
        <div className="ccb-banner ccb-no-print"><GavelIcon size={15} /><span className="grow">Agenda is open. {canRun ? 'Start the meeting when the board convenes to mark attendance and record decisions.' : 'Decisions are recorded by the CCB Secretary during the meeting.'}</span></div>
      )}

      <div className="ccb-grid two">
        <div>
          {items.length === 0 && (
            <Card><p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>Nothing on the agenda.{notOnAgenda && canRun ? ' Use “Add waiting” to pull in pending requests.' : ''}</p></Card>
          )}
          {ratifications.length > 0 && (
            <Card title="For ratification" sub="Emergency approvals given by the IT Application Head since the last meeting" className="ccb-no-break">
              {ratifications.map((it, i) => (
                <AgendaItem key={it.id} it={it} n={`R${i + 1}`} live={live} canDecide={canRun && live && quorum.met} canRemove={canRun && ['scheduled', 'in_progress'].includes(m.status)} nameOf={nameOf}
                  reviews={reviewsOf(it.id)} myEmail={myEmail} canReview={canReview && open && !it.decision}
                  onReview={(position) => (position === 'support' ? run(`rv${it.id}`, () => ccbApi.reviewItem(m.id, it.id, 'support', ''), 'Your support is recorded.') : position === '' ? run(`rv${it.id}`, () => ccbApi.reviewItem(m.id, it.id, '', ''), 'Your review is withdrawn.') : setReviewing({ it, position }))}
                  onDecide={(d) => setDeciding({ it, d })} onRemove={() => run(`rm${it.id}`, () => ccbApi.removeAgendaItem(m.id, it.id), 'Removed from agenda.')} />
              ))}
            </Card>
          )}
          {decisions.length > 0 && (
            <Card title="For decision" sub={`${decisions.length} change request${decisions.length > 1 ? 's' : ''} recommended by the IT Application Head`}>
              {decisions.map((it, i) => (
                <AgendaItem key={it.id} it={it} n={i + 1} live={live} canDecide={canRun && live && quorum.met} canRemove={canRun && ['scheduled', 'in_progress'].includes(m.status)} nameOf={nameOf}
                  reviews={reviewsOf(it.id)} myEmail={myEmail} canReview={canReview && open && !it.decision}
                  onReview={(position) => (position === 'support' ? run(`rv${it.id}`, () => ccbApi.reviewItem(m.id, it.id, 'support', ''), 'Your support is recorded.') : position === '' ? run(`rv${it.id}`, () => ccbApi.reviewItem(m.id, it.id, '', ''), 'Your review is withdrawn.') : setReviewing({ it, position }))}
                  onDecide={(d) => setDeciding({ it, d })} onRemove={() => run(`rm${it.id}`, () => ccbApi.removeAgendaItem(m.id, it.id), 'Removed from agenda.')} />
              ))}
            </Card>
          )}
        </div>

        <div className="ccb-stack">
          <Card title="Attendance & quorum" sub={`Quorum: ${quorum.required} CCB members`}>
            <div className={`ccb-quorum${quorum.met ? ' met' : ''}`}>
              <div className="ccb-quorum-top"><span><b>{quorum.present}</b> / {members.length || quorum.required} members present</span><span className="state">{quorum.met ? 'Quorum met' : 'No quorum'}</span></div>
              <div className="ccb-quorum-bar">{Array.from({ length: Math.max(members.length, quorum.required) }).map((_, i) => <i key={i} className={i < quorum.present ? 'on' : ''} />)}</div>
            </div>
            {people.length === 0 ? (
              <p className="ccb-muted" style={{ fontSize: 12, margin: 0 }}>No CCB members set up yet. Assign roles under <a href={ROUTES.ccbGovernance}>Governance</a>.</p>
            ) : people.map((p) => (
              <div className="ccb-attendee" key={p.email}>
                <Person name={p.name} sub={p.roles.join(' · ')} size={26} />
                {live && canRun ? (
                  <label className="ccb-toggle" title={present.has(p.email) ? 'Present' : 'Absent'}>
                    <input type="checkbox" checked={present.has(p.email)} onChange={(e) => toggleAttendance(p.email, e.target.checked)} />
                    <span />
                  </label>
                ) : m.status === 'completed' ? (
                  <Pill tone={present.has(p.email) ? 'green' : 'gray'}>{present.has(p.email) ? 'Present' : 'Absent'}</Pill>
                ) : null}
              </div>
            ))}
          </Card>

          <Card title="Action items" sub={`${actions.filter((a) => a.status === 'open').length} open · tracked to closure on the Meetings page`} className="ccb-no-break"
            actions={canRun && m.status !== 'cancelled' ? <Button size="sm" icon={PlusIcon} className="ccb-no-print" onClick={() => setAddingAction(true)}>Add</Button> : null}>
            {actions.length === 0 ? <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No action items{canRun && m.status !== 'cancelled' ? ' yet. Add follow-ups the board agrees, with an owner and a due date.' : '.'}</p> : actions.map((a) => (
              <div key={a.id} className="ccb-action-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t">{a.title}</div>
                  <div className="s">{nameOf(a.owner)}{a.dueDate ? ` · due ${fmtDate(a.dueDate)}` : ''}{a.crNo ? ` · ${a.crNo}` : ''}</div>
                </div>
                {actionOverdue(a) ? <Pill tone="red">Overdue</Pill> : <Meta meta={ACTION_STATUS_META} value={a.status} />}
                {a.status === 'open' && (canRun || a.owner === myEmail) && (
                  <Button size="sm" variant="ghost" icon={CheckIcon} className="ccb-no-print" busy={busy === `ac${a.id}`} onClick={() => run(`ac${a.id}`, () => ccbApi.updateAction(a.id, { status: 'done' }), 'Action marked done.')}>Done</Button>
                )}
              </div>
            ))}
          </Card>

          <Card title="Minutes" sub={m.status === 'completed' ? `Closed ${fmtDateTime(m.completedAt)}` : 'Discussion points, actions and anything not captured per item'}
            actions={canRun && m.status !== 'cancelled' ? <Button size="sm" variant="primary" busy={savingMinutes} onClick={saveMinutes}>Save</Button> : null}>
            {canRun && m.status !== 'cancelled' ? (
              <textarea className="ccb-textarea" style={{ minHeight: 180 }} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="1. Opening and confirmation of quorum…" />
            ) : (
              <div className="ccb-prose">{m.minutes || <span className="ccb-muted">No minutes recorded.</span>}</div>
            )}
          </Card>

          <Card title="Meeting record">
            <DefinitionList rows={[
              ['Scheduled by', nameOf(m.createdBy)],
              ['Started', m.startedAt ? fmtDateTime(m.startedAt) : null],
              ['Closed', m.completedAt ? fmtDateTime(m.completedAt) : null],
              ['Agenda', `${items.length} item${items.length === 1 ? '' : 's'} · ${items.length - undecided} decided`],
            ]} />
          </Card>
        </div>
      </div>

      {deciding && (
        <DecisionDialog meeting={m} item={deciding.it} decision={deciding.d} onClose={() => setDeciding(null)}
          onDone={(updated) => {
            const it = deciding.it;
            setDeciding(null);
            showToast(updated.devTrackerIssueNo != null && updated.devTrackerIssueNo !== it.devTrackerIssueNo
              ? `${it.crNo} approved — Assignment-${updated.devTrackerIssueNo} created in Dev Tracker.`
              : `${it.crNo}: ${DECISION_META[deciding.d].label.toLowerCase()}.`);
            load();
          }} />
      )}
      {confirm === 'complete' && (
        <Modal title="Close the meeting" sub="Locks the decisions and records the minutes. Deferred requests stay on the CCB queue for the next meeting." onClose={() => setConfirm(null)}
          footer={<><Button onClick={() => setConfirm(null)}>Keep open</Button><Button variant="success" icon={CheckCircleIcon} busy={busy === 'complete'} disabled={undecided > 0}
            onClick={() => run('complete', () => ccbApi.completeMeeting(m.id, minutes), 'Meeting closed.').then(() => setConfirm(null))}>Close meeting</Button></>}>
          {undecided > 0 ? (
            <div className="ccb-callout tone-amber"><AlertIcon size={15} /><span><strong>{undecided} item{undecided > 1 ? 's' : ''}</strong> still need{undecided === 1 ? 's' : ''} a decision. Defer anything the board did not take up.</span></div>
          ) : (
            <div className="ccb-callout tone-green"><CheckCircleIcon size={15} /><span>All {items.length} agenda item{items.length === 1 ? ' is' : 's are'} decided. The minutes below will be saved with the meeting.</span></div>
          )}
          <Field label="Minutes"><textarea className="ccb-textarea" style={{ minHeight: 140 }} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
        </Modal>
      )}
      {reviewing && (
        <ReviewDialog meeting={m} item={reviewing.it} position={reviewing.position} current={reviewsOf(reviewing.it.id).find((v) => v.email === myEmail)}
          onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); showToast('Your review is recorded.'); load(); }} />
      )}
      {addingAction && (
        <ActionDialog meeting={m} items={items} people={people} onClose={() => setAddingAction(false)} onDone={() => { setAddingAction(false); showToast('Action item added.'); load(); }} />
      )}
      {confirm === 'cancel' && <CancelDialog meeting={m} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); showToast('Meeting cancelled. Its agenda items return to the queue.'); load(); }} />}
      {toast}
    </>
  );
}

function AgendaItem({ it, n, live, canDecide, canRemove, nameOf, onDecide, onRemove, reviews = [], myEmail, canReview, onReview }) {
  const ratification = it.kind === 'ratification';
  return (
    <div className={`ccb-agenda-item kind-${it.kind} ${it.decision ? 'is-decided' : 'is-open'}${canDecide && !it.decision ? ' can-decide' : ''}`}>
      <div className="ccb-agenda-head">
        <span className="ccb-agenda-no">{n}</span>
        <div className="ccb-agenda-main">
          <h4><a href={requestLink(it.crNo)} style={{ color: 'inherit' }}>{it.title}</a></h4>
          <div className="ccb-agenda-meta">
            <span className="ccb-key">{it.crNo}</span>
            <ScopePill category={it.category} categories={CATEGORY_META} />
            <Meta meta={PRIORITY_META} value={it.priority} />
            <span className="ccb-muted" style={{ fontSize: 11.5 }}>{it.requestingFunction} · {it.sapSystem}{it.sapModules?.length ? ` · ${it.sapModules.join(', ')}` : ''}</span>
          </div>
        </div>
        {canRemove && !it.decision && (
          <button type="button" className="ccb-icon-btn ccb-no-print" title="Remove from agenda" onClick={onRemove}><TrashIcon size={14} /></button>
        )}
      </div>
      <div className="ccb-agenda-brief">
        <div><label>Requirement</label><p>{it.description}</p></div>
        <div><label>Business justification</label><p>{it.justification}</p></div>
        {ratification ? (
          <>
            <div><label>Emergency justification</label><p>{it.emergencyReason || '—'}</p></div>
            <div><label>Approved</label><p>{nameOf(it.requestDecidedBy)} · {fmtDateTime(it.requestDecidedAt)}{it.devTrackerIssueNo != null && <> · <a href={devTrackerLink(it.devTrackerIssueNo)}>Assignment-{it.devTrackerIssueNo}</a></>}</p></div>
          </>
        ) : (
          <>
            <div><label>Feasibility (IT Application Head)</label><p>{FEASIBILITY_META[it.feasibility]?.label || '—'}{it.reviewNotes ? ` — ${it.reviewNotes}` : ''}</p></div>
            <div><label>Impact on other systems</label><p>{it.crossModuleImpact || '—'}</p></div>
          </>
        )}
        {it.financialImpact && <div><label>Financial impact</label><p>{it.financialImpact}</p></div>}
        {it.requiredBy && <div><label>Required by</label><p>{fmtDate(it.requiredBy)}</p></div>}
      </div>
      <MemberReviews reviews={reviews} nameOf={nameOf} myEmail={myEmail} canReview={canReview} onReview={onReview} />
      {it.decision ? (
        <div className="ccb-outcome">
          <Meta meta={DECISION_META} value={it.decision} strong />
          <span className="ccb-muted">by {nameOf(it.decidedBy)} · {fmtTime(it.decidedAt)}</span>
          {it.notes && <p>{it.notes}</p>}
        </div>
      ) : canDecide ? (
        <div className="ccb-decide">
          {DECISION_BUTTONS[it.kind].map((b) => <Button key={b.key} size="sm" variant={b.variant} icon={b.icon} onClick={() => onDecide(b.key)}>{b.label}</Button>)}
        </div>
      ) : live ? null : null}
    </div>
  );
}

function DecisionDialog({ meeting, item, decision, onClose, onDone }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meta = DECISION_META[decision];
  const needsNotes = NOTES_REQUIRED.includes(decision);
  const label = {
    approved_with_modifications: 'Modifications agreed by the board', rejected: 'Board’s reasons for rejecting', deferred: 'Why deferred / what the board needs',
    not_ratified: 'Board’s reasons', approved: 'Board remarks (optional)', ratified: 'Remarks (optional)',
  }[decision];

  async function go() {
    setBusy(true);
    setError('');
    try {
      const d = await ccbApi.decide(meeting.id, item.id, decision, notes);
      onDone(d.request);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`${meta.label} — ${item.crNo}`} sub={item.title} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={meta.tone === 'red' ? 'danger-solid' : meta.tone === 'amber' ? 'primary' : 'success'} busy={busy} onClick={go}>Record decision</Button></>}>
      {(decision === 'approved' || decision === 'approved_with_modifications') && (
        <div className="ccb-callout tone-green"><CheckCircleIcon size={15} /><span>Approval creates the <strong>Dev Tracker assignment</strong> straight away, for the Module Lead to assign a developer.</span></div>
      )}
      {decision === 'deferred' && (
        <div className="ccb-callout tone-amber"><ClockIcon size={15} /><span>The request stays with the CCB and is added to the next meeting’s agenda.</span></div>
      )}
      <Field label={label} required={needsNotes}>
        <textarea className="ccb-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}

function CancelDialog({ meeting, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    try {
      await ccbApi.cancelMeeting(meeting.id, note);
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title={`Cancel ${meeting.meetingNo}`} sub="Agenda items go back to the queue for the next meeting." onClose={onClose}
      footer={<><Button onClick={onClose}>Keep meeting</Button><Button variant="danger-solid" busy={busy} onClick={go}>Cancel meeting</Button></>}>
      <Field label="Reason" required><textarea className="ccb-textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}

/** Board members' positions on an agenda item: tally, who said what, and the caller's own buttons. */
function MemberReviews({ reviews, nameOf, myEmail, canReview, onReview }) {
  const [open, setOpen] = useState(false);
  if (!reviews.length && !canReview) return null;
  const count = (p) => reviews.filter((v) => v.position === p).length;
  const mine = reviews.find((v) => v.email === myEmail);
  const flagged = reviews.filter((v) => v.position !== 'support');
  return (
    <div className="ccb-reviews">
      <div className="ccb-reviews-head">
        <span className="lbl">Board review</span>
        {reviews.length === 0 ? <span className="ccb-muted" style={{ fontSize: 11.5 }}>No positions yet</span> : Object.keys(REVIEW_META).map((p) => count(p) > 0 && (
          <Pill key={p} tone={REVIEW_META[p].tone}>{count(p)} {REVIEW_META[p].label.toLowerCase()}</Pill>
        ))}
        {reviews.length > 0 && <button type="button" className="ccb-linkbtn ccb-no-print" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'} who</button>}
        {canReview && (
          <span className="ccb-reviews-mine ccb-no-print">
            {Object.entries(REVIEW_META).map(([p, meta]) => (
              <button key={p} type="button" className={`ccb-chip-toggle tone-${meta.tone}${mine?.position === p ? ' on' : ''}`} onClick={() => onReview(p)}>{meta.label}</button>
            ))}
            {mine && <button type="button" className="ccb-linkbtn" onClick={() => onReview('')}>Withdraw</button>}
          </span>
        )}
      </div>
      {(open ? reviews : flagged).map((v) => (
        <div key={v.id} className="ccb-review-line">
          <Pill tone={REVIEW_META[v.position].tone}>{REVIEW_META[v.position].label}</Pill>
          <span><b>{nameOf(v.email)}</b>{v.note ? ` — ${v.note}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

function ReviewDialog({ meeting, item, position, current, onClose, onDone }) {
  const [note, setNote] = useState(current?.position === position ? current.note : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    try {
      await ccbApi.reviewItem(meeting.id, item.id, position, note);
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title={`${REVIEW_META[position].label} — ${item.crNo}`} sub={`${item.title}. Your position is advisory input for the meeting; the decision stays with the board.`} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!note.trim()} onClick={go}>Record</Button></>}>
      <Field label={position === 'oppose' ? 'Why you oppose it' : 'Your concern'} required>
        <textarea className="ccb-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={position === 'oppose' ? 'e.g. Duplicates the standard report ZFI_xx…' : 'e.g. Needs a regression test of the MM–FI postings…'} />
      </Field>
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}

function ActionDialog({ meeting, items, people, onClose, onDone }) {
  const week = new Date();
  week.setDate(week.getDate() + 7);
  const [form, setForm] = useState({ title: '', owner: '', dueDate: isoOf(week), requestId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function go() {
    setBusy(true);
    setError('');
    try {
      await ccbApi.addAction({ ...form, owner: form.owner.trim().toLowerCase(), meetingId: meeting.id, requestId: form.requestId || null });
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Add an action item" sub={`${meeting.meetingNo} · tracked until the owner closes it`} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={PlusIcon} busy={busy} disabled={!form.title.trim() || !form.owner.trim()} onClick={go}>Add</Button></>}>
      <Field label="Action" required><textarea className="ccb-textarea" style={{ minHeight: 70 }} value={form.title} onChange={set('title')} placeholder="e.g. Share the impact analysis on GST reports before the next meeting" /></Field>
      <div className="ccb-form-grid">
        <Field label="Owner" required hint="A board member or any Emami email.">
          <input className="ccb-input" list="ccb-action-owners" value={form.owner} onChange={set('owner')} placeholder="name@emamigroup.com" />
          <datalist id="ccb-action-owners">{people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}</datalist>
        </Field>
        <Field label="Due date"><input className="ccb-input" type="date" value={form.dueDate} onChange={set('dueDate')} /></Field>
        <Field label="Change request" wide>
          <select className="ccb-input" value={form.requestId} onChange={set('requestId')}>
            <option value="">General (not tied to a request)</option>
            {items.map((it) => <option key={it.id} value={it.requestId}>{it.crNo} — {it.title}</option>)}
          </select>
        </Field>
      </div>
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}
