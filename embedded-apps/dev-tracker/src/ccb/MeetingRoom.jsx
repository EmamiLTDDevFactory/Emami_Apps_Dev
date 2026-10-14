import React, { useCallback, useEffect, useState } from 'react';
import { ccbApi } from './api.js';
import { Blocker, Button, Card, DefinitionList, Field, Loading, Meta, Modal, Person, Pill, RoleBadge, ScopePill, useToast } from './ui.jsx';
import { CATEGORY_META, DECISION_META, FEASIBILITY_META, MEETING_STATUS_META, PRIORITY_META, devTrackerLink, fmtDate, fmtDateTime, fmtTime, requestLink } from './model.js';
import { ROUTES } from '../shared/routes.js';
import {
  AlertIcon, BoltIcon, CheckCircleIcon, CheckIcon, ChevronLeftIcon, ClockIcon, GavelIcon, PlayIcon, PrinterIcon, RefreshIcon, TrashIcon, XIcon, ExternalIcon,
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

  const load = useCallback(() => {
    return ccbApi.meeting(id)
      .then((d) => { setState({ loading: false, detail: d.detail, error: null }); setMinutes((m) => m || d.detail.meeting.minutes || ''); })
      .catch((e) => setState({ loading: false, detail: null, error: e }));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (state.loading) return <Loading label="Opening meeting room…" />;
  if (state.error) return <Blocker error={state.error} onRetry={load} />;

  const { meeting: m, items, attendance, people, names, quorum, notOnAgenda, canRun, teamsConfigured } = state.detail;
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
        <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#666' }}>Emami Limited · SAP Change Control Board</div>
        <h1 style={{ margin: '4px 0' }}>Minutes — {m.title}</h1>
        <div style={{ fontSize: 12 }}>{m.meetingNo} · {fmtDateTime(m.scheduledAt)} · {m.mode}{m.venue ? ` · ${m.venue}` : ''}</div>
        <div style={{ fontSize: 12, marginTop: 6 }}><b>Present:</b> {people.filter((p) => present.has(p.email)).map((p) => p.name).join(', ') || '—'}</div>
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
                  onDecide={(d) => setDeciding({ it, d })} onRemove={() => run(`rm${it.id}`, () => ccbApi.removeAgendaItem(m.id, it.id), 'Removed from agenda.')} />
              ))}
            </Card>
          )}
          {decisions.length > 0 && (
            <Card title="For decision" sub={`${decisions.length} change request${decisions.length > 1 ? 's' : ''} recommended by the IT Application Head`}>
              {decisions.map((it, i) => (
                <AgendaItem key={it.id} it={it} n={i + 1} live={live} canDecide={canRun && live && quorum.met} canRemove={canRun && ['scheduled', 'in_progress'].includes(m.status)} nameOf={nameOf}
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
      {confirm === 'cancel' && <CancelDialog meeting={m} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); showToast('Meeting cancelled. Its agenda items return to the queue.'); load(); }} />}
      {toast}
    </>
  );
}

function AgendaItem({ it, n, live, canDecide, canRemove, nameOf, onDecide, onRemove }) {
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
            <div><label>Inter-module impact</label><p>{it.crossModuleImpact || '—'}</p></div>
          </>
        )}
        {it.financialImpact && <div><label>Financial impact</label><p>{it.financialImpact}</p></div>}
        {it.requiredBy && <div><label>Required by</label><p>{fmtDate(it.requiredBy)}</p></div>}
      </div>
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
        <div className="ccb-callout tone-green"><CheckCircleIcon size={15} /><span>Approval creates the <strong>Dev Tracker assignment</strong> straight away, for the SAP Module Lead to assign a developer.</span></div>
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
