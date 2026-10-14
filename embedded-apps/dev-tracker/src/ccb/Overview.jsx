import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import RequestForm from './RequestForm.jsx';
import { Blocker, Button, Card, CcbShell, Empty, KpiTile, Loading, Meta, PageHeader, Person, Pill, RoleBadge, useCcbMe } from './ui.jsx';
import {
  DECISION_META, MEETING_STATUS_META, PROCESS_STEPS, STATUS_META, currentStepIndex, daysUntil, devTrackerLink, fiscalYearStart, fmtDate, fmtTime,
  informOverdue, isClosed, isInDelivery, meetingLink, nextThirdFriday, relative, requestLink, stageLabel,
} from './model.js';
import { ROUTES } from '../shared/routes.js';
import {
  AlertIcon, BoardIcon, BoltIcon, CalendarIcon, CheckCircleIcon, ClipboardIcon, ClockIcon, GavelIcon, PencilIcon, PlusIcon, SearchIcon, ArrowRightIcon, UsersIcon,
} from '../shared/icons.jsx';

const HISTORY_VERB = {
  submit: 'submitted for review', recommend: 'recommended to CCB', approve_out_of_scope: 'approved (outside CCB scope)',
  approve_emergency: 'emergency approval', reject: 'rejected at feasibility', terminate: 'development terminated',
};

export default function Overview() {
  const { me, error, loading, reload } = useCcbMe();
  const [data, setData] = useState({ loading: true, overview: null, error: null });
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    ccbApi.overview()
      .then((d) => setData({ loading: false, overview: d.overview, error: null }))
      .catch((e) => setData({ loading: false, overview: null, error: e }));
  }, []);
  useEffect(load, [load]);

  return (
    <CcbShell active="ccbOverview" onCreate={me?.can.log ? () => setCreating(true) : undefined}>
      {loading || data.loading ? <Loading /> : error || data.error ? <Blocker error={error || data.error} onRetry={() => { reload(); load(); }} /> : (
        <Dashboard me={me} ov={data.overview} onCreate={() => setCreating(true)} />
      )}
      {creating && (
        <RequestForm onClose={() => setCreating(false)} onSaved={(r) => { window.location.href = requestLink(r.crNo); }} />
      )}
    </CcbShell>
  );
}

function Dashboard({ me, ov, onCreate }) {
  const { requests, upcoming, recent, pendingAgenda, settings, names } = ov;
  const nameOf = (e) => (e ? names[e] || e : '');
  const fyStart = fiscalYearStart();

  const k = useMemo(() => {
    const emergencies = requests.filter((r) => r.approvalRoute === 'emergency' && r.ratificationStatus === 'pending');
    return {
      review: requests.filter((r) => r.status === 'feasibility_review').length,
      awaiting: requests.filter((r) => r.status === 'awaiting_ccb').length,
      approvedFy: requests.filter((r) => r.decidedAt && new Date(r.decidedAt) >= fyStart && ['approved', 'terminated'].includes(r.status)).length,
      rejectedFy: requests.filter((r) => r.decidedAt && new Date(r.decidedAt) >= fyStart && r.status === 'rejected').length,
      delivery: requests.filter(isInDelivery).length,
      emergencies: emergencies.length,
      overdue: emergencies.filter(informOverdue).length,
    };
  }, [requests, fyStart]);

  const pipeline = useMemo(() => {
    const counts = PROCESS_STEPS.map(() => 0);
    requests.filter((r) => !isClosed(r)).forEach((r) => {
      const i = currentStepIndex(r);
      if (i < PROCESS_STEPS.length) counts[i]++;
    });
    return counts;
  }, [requests]);
  const maxPipe = Math.max(1, ...pipeline);

  const myActions = useMemo(() => {
    const out = [];
    const mineDraft = requests.filter((r) => r.status === 'draft' && r.loggedBy === me.email);
    mineDraft.forEach((r) => out.push({ r, tone: r.returnNote ? 'amber' : 'gray', icon: PencilIcon, text: r.returnNote ? 'Returned — clarify and resubmit' : 'Draft — complete and submit' }));
    if (me.can.review) {
      requests.filter((r) => r.status === 'feasibility_review' && r.loggedBy !== me.email)
        .forEach((r) => out.push({ r, tone: 'amber', icon: SearchIcon, text: 'Scope & feasibility review' }));
      requests.filter((r) => r.approvalRoute === 'emergency' && !r.ccbInformedAt && r.status === 'approved')
        .forEach((r) => out.push({ r, tone: informOverdue(r) ? 'red' : 'purple', icon: BoltIcon, text: `Inform CCB of emergency approval by ${fmtDate(r.informDueBy)}` }));
    }
    requests.filter((r) => r.status === 'approved' && r.moduleLeadEmail === me.email && !r.devDeveloper && r.devStatus === 'Not Started')
      .forEach((r) => out.push({ r, tone: 'teal', icon: BoardIcon, text: 'Assign a developer in Dev Tracker', href: devTrackerLink(r.devTrackerIssueNo) }));
    return out;
  }, [requests, me]);

  const delivery = requests.filter(isInDelivery).slice(0, 8);
  const next = upcoming[0];
  const regular = nextThirdFriday();

  return (
    <>
      <PageHeader
        eyebrow={<><GavelIcon size={13} /> Change Control Board</>}
        title="SAP change governance"
        sub="Changes to SAP ECC and BW are verified, planned, reviewed, approved and implemented in a controlled, orderly way — from the function’s requirement to transport into Production."
      >
        {me.can.runMeetings && <a className="ccb-btn" href={`${ROUTES.ccbMeetings}?action=schedule`}><CalendarIcon size={15} /> Schedule meeting</a>}
        {me.can.log && <Button variant="primary" icon={PlusIcon} onClick={onCreate}>Log change request</Button>}
      </PageHeader>

      <div className="ccb-banner">
        <UsersIcon size={15} />
        <span className="grow">
          {me.roles.length ? <>Signed in as <strong>{me.name}</strong> · your CCB roles: </> : <>Signed in as <strong>{me.name}</strong> · you have view access to the register.{me.isAdmin ? ' Assign CCB roles under Governance.' : ' Ask a Dev Tracker admin for a CCB role.'}</>}
          {me.roles.map((r) => <span key={r} style={{ marginLeft: 6 }}><RoleBadge role={r} /></span>)}
        </span>
        <a href={ROUTES.ccbGovernance} style={{ fontWeight: 600, fontSize: 12 }}>Governance <ArrowRightIcon size={12} /></a>
      </div>

      {k.overdue > 0 && (
        <div className="ccb-banner danger">
          <AlertIcon size={15} />
          <span className="grow"><strong>{k.overdue} emergency approval{k.overdue > 1 ? 's' : ''}</strong> not reported to the CCB within {settings.informDays} business days.</span>
          <a href={`${ROUTES.ccbRequests}?tab=delivery`} style={{ fontWeight: 600, fontSize: 12, color: 'inherit' }}>Review</a>
        </div>
      )}

      <div className="ccb-kpis">
        <KpiTile tone="amber" icon={SearchIcon} label="Feasibility review" value={k.review} sub="With IT Application Head" href={`${ROUTES.ccbRequests}?tab=review`} />
        <KpiTile tone="indigo" icon={GavelIcon} label="Awaiting CCB" value={k.awaiting} sub={next ? `Next meeting ${fmtDate(next.scheduledAt)}` : 'No meeting scheduled'} href={`${ROUTES.ccbRequests}?tab=ccb`} />
        <KpiTile tone="green" icon={CheckCircleIcon} label="Approved this FY" value={k.approvedFy} sub={`${k.rejectedFy} rejected · FY from ${fmtDate(fyStart)}`} href={ROUTES.ccbRequests} />
        <KpiTile tone="blue" icon={BoardIcon} label="In delivery" value={k.delivery} sub="Open in Dev Tracker" href={`${ROUTES.ccbRequests}?tab=delivery`} />
        <KpiTile tone="purple" icon={BoltIcon} label="Pending ratification" value={k.emergencies} sub="Emergency approvals" alert={k.overdue ? `${k.overdue} overdue` : null} href={`${ROUTES.ccbRequests}?tab=delivery`} />
      </div>

      <div className="ccb-grid two">
        <Card title="Process pipeline" sub="Open requests by the step they are at. Steps 2–5 are the new CCB controls.">
          <div className="ccb-pipeline">
            {PROCESS_STEPS.map((s, i) => (
              <div key={s.key} className={`ccb-pipe-row${s.isNew ? ' is-new' : ''}`}>
                <span className="ccb-pipe-no">{i + 1}</span>
                <span>{s.label}</span>
                <span className="ccb-pipe-track"><span className="ccb-pipe-fill" style={{ width: `${(pipeline[i] / maxPipe) * 100}%`, opacity: pipeline[i] ? 1 : 0 }} /></span>
                <span className="ccb-pipe-count">{pipeline[i]}</span>
              </div>
            ))}
          </div>
          <div className="ccb-legend">
            <span><i style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} /> New CCB step</span>
            <span><i style={{ background: 'var(--bg-alt)', border: '1px solid var(--border-strong)' }} /> Existing step (tracked in Dev Tracker)</span>
          </div>
        </Card>

        <div className="ccb-stack">
          {next ? (
            <div className="ccb-meeting-hero">
              <div className="lbl">{next.status === 'in_progress' ? <span className="ccb-live">In session now</span> : 'Next CCB meeting'}</div>
              <div className="count"><b>{next.itemCount}</b><small>agenda items</small></div>
              <div className="when">
                <span className="day">{new Date(next.scheduledAt).getDate()}</span>
                <span className="mon">{new Date(next.scheduledAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}<br />{new Date(next.scheduledAt).toLocaleDateString('en-GB', { weekday: 'long' })} · {fmtTime(next.scheduledAt)}</span>
              </div>
              <div className="meta">{next.title}</div>
              <div className="chips">
                <span className="chip">{next.mode === 'online' ? 'Online' : next.mode === 'offline' ? 'In person' : 'Hybrid'}</span>
                <span className="chip">Quorum {settings.quorum}</span>
                {next.status === 'scheduled' && <span className="chip">{daysUntil(next.scheduledAt) === 0 ? 'Today' : daysUntil(next.scheduledAt) === 1 ? 'Tomorrow' : `In ${daysUntil(next.scheduledAt)} days`}</span>}
                {pendingAgenda > 0 && <span className="chip">+{pendingAgenda} waiting</span>}
              </div>
              <a className="ccb-btn" href={meetingLink(next.id)}>{next.status === 'in_progress' ? 'Join meeting room' : 'Open agenda'} <ArrowRightIcon size={13} /></a>
              {next.teamsJoinUrl && next.teamsStatus === 'created' && <a className="ccb-btn" style={{ marginTop: 8 }} href={next.teamsJoinUrl} target="_blank" rel="noreferrer">Join Teams meeting <ArrowRightIcon size={13} /></a>}
            </div>
          ) : (
            <Card title="Next CCB meeting">
              <Empty icon={CalendarIcon} title="No meeting scheduled"
                action={me.can.runMeetings ? <a className="ccb-btn primary" href={`${ROUTES.ccbMeetings}?action=schedule`}><CalendarIcon size={15} /> Schedule for {fmtDate(regular)}</a> : null}>
                The board meets on the 3rd Friday of every month — next on <b>{fmtDate(regular)}</b>.{pendingAgenda ? ` ${pendingAgenda} request${pendingAgenda > 1 ? 's are' : ' is'} waiting for the agenda.` : ''}
              </Empty>
            </Card>
          )}

          <Card title="Needs your action" sub={myActions.length ? `${myActions.length} item${myActions.length > 1 ? 's' : ''}` : undefined}>
            {myActions.length === 0 ? (
              <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>You are all caught up.</p>
            ) : (
              <ul className="ccb-list">
                {myActions.slice(0, 7).map((a, i) => (
                  <li key={`${a.r.id}-${i}`}>
                    <span className={`ccb-action-ico tone-${a.tone}`}><a.icon size={14} /></span>
                    <div className="ccb-list-main">
                      <a className="ccb-list-title" href={a.href || requestLink(a.r.crNo)} style={{ display: 'block', whiteSpace: 'nowrap' }}>{a.r.title}</a>
                      <div className="ccb-list-sub"><span className="ccb-mono">{a.r.crNo}</span> · {a.text}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="ccb-grid halves" style={{ marginTop: 16 }}>
        <Card title="Recent decisions & movements" actions={<a className="ccb-btn sm quiet" href={ROUTES.ccbRequests}>Register <ArrowRightIcon size={12} /></a>}>
          {recent.length === 0 ? <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>Nothing yet.</p> : (
            <ul className="ccb-list">
              {recent.map((h) => (
                <li key={h.id}>
                  <Person name={nameOf(h.actorEmail)} size={26} />
                  <div className="ccb-list-main">
                    <a className="ccb-list-title" href={requestLink(h.crNo)} style={{ display: 'block', whiteSpace: 'nowrap' }}>{h.title}</a>
                    <div className="ccb-list-sub">
                      <span className="ccb-mono">{h.crNo}</span> · {h.details?.decision ? `CCB: ${DECISION_META[h.details.decision]?.label}` : HISTORY_VERB[h.action] || h.action} · {relative(h.occurredAt)}
                    </div>
                  </div>
                  {h.details?.decision && <Meta meta={DECISION_META} value={h.details.decision} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Approved changes in delivery" sub="Live from Dev Tracker" actions={<a className="ccb-btn sm quiet" href={ROUTES.board}>Dev board <ArrowRightIcon size={12} /></a>}>
          {delivery.length === 0 ? <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No approved changes in delivery.</p> : (
            <ul className="ccb-list">
              {delivery.map((r) => (
                <li key={r.id}>
                  <span className="ccb-action-ico tone-blue"><BoardIcon size={14} /></span>
                  <div className="ccb-list-main">
                    <a className="ccb-list-title" href={requestLink(r.crNo)} style={{ display: 'block', whiteSpace: 'nowrap' }}>{r.title}</a>
                    <div className="ccb-list-sub">
                      <a href={devTrackerLink(r.devTrackerIssueNo)} className="ccb-mono">Assignment-{r.devTrackerIssueNo}</a> · {stageLabel(r)}{r.devDeveloper ? ` · ${r.devDeveloper}` : ''}
                    </div>
                  </div>
                  {r.devTargetDate && <Pill tone="gray"><ClockIcon size={11} /> {fmtDate(r.devTargetDate)}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
