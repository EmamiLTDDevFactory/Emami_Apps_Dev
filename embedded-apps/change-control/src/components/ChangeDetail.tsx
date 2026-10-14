'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, MessageSquare } from 'lucide-react';
import { addComment, getDetail, transition, vote, type Action, type Detail, type Me, type Outcome } from '@/lib/api';
import {
  ACTION_LABEL, CATEGORY_LABEL, FLOW, LEVEL_LABEL, OUTCOME_LABEL, PRIORITY_LABEL, ROLE_LABEL, STATUS_LABEL, fmtDateTime, riskFromScore,
} from '@/lib/labels';
import { nameFromEmail } from '@/lib/hub';
import { Button, Card, Empty, Person, Pill, RiskPill, Skeleton, StatusPill, TypePill, cx, inputBase, inputCls } from './ui';

const textareaCls = cx('w-full py-2', inputBase);
const DANGER: Action[] = ['reject', 'cancel'];
const NOTE_REQUIRED: Action[] = ['reject', 'return_to_draft', 'cancel', 'emergency_approve', 'close'];

export default function ChangeDetail({ id, me, onChanged }: { id: number; me: Me; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDetail(id).then(setD).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Card><Empty title="Could not load this change request" icon={AlertTriangle}>{error}</Empty></Card>;
  if (!d) return <Card><Skeleton rows={12} /></Card>;

  const { change: c, names } = d;
  const name = (email: string | null) => (email ? names[email] || nameFromEmail(email) : '—');
  const step = FLOW.indexOf(c.status);
  const tally = { approve: 0, reject: 0, abstain: 0 };
  d.votes.forEach((v) => tally[v.decision]++);
  const myVote = d.votes.find((v) => v.voterEmail === me.email);

  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-xs font-semibold text-accent">{c.crNo}</div>
        <h2 className="text-xl font-extrabold tracking-tight">{c.title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusPill status={c.status} />
          <TypePill type={c.changeType} />
          <RiskPill risk={c.riskLevel} />
          <Pill>{PRIORITY_LABEL[c.priority]} priority</Pill>
          {c.outcome && <Pill tone={c.outcome === 'successful' ? 'good' : 'warn'}>Outcome: {OUTCOME_LABEL[c.outcome]}</Pill>}
        </div>
      </div>

      <Card bodyClass="scroll-thin overflow-x-auto p-4">
        {step === -1 ? (
          <p className="text-sm text-muted">
            This change is <strong className="text-ink">{STATUS_LABEL[c.status]}</strong>{c.decidedAt && <> as of {fmtDateTime(c.decidedAt)}</>}.
          </p>
        ) : (
          <ol className="flex min-w-[640px] items-center" aria-label="Workflow progress">
            {FLOW.map((s, i) => (
              <li key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <span
                    aria-current={i === step ? 'step' : undefined}
                    className={cx(
                      'grid h-7 w-7 place-items-center rounded-full text-2xs font-bold',
                      i < step && 'bg-accent text-white',
                      i === step && 'bg-gradient-to-br from-accent to-accent-deep text-white ring-4 ring-accent/15',
                      i > step && 'bg-sunken text-faint ring-1 ring-line',
                    )}
                  >
                    {i < step ? <Check size={13} /> : i + 1}
                  </span>
                  <span className={cx('whitespace-nowrap text-2xs', i === step ? 'font-bold text-ink' : 'text-muted')}>{STATUS_LABEL[s]}</span>
                </div>
                {i < FLOW.length - 1 && <div className={cx('mx-1 mb-5 h-0.5 flex-1 rounded', i < step ? 'bg-accent' : 'bg-line')} />}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card bodyClass="divide-y divide-line p-0">
            <Block title="Description">{c.description}</Block>
            <Block title="Business justification">{c.justification}</Block>
            <Block title="Implementation plan">{c.implementationPlan}</Block>
            <Block title="Rollback plan">{c.rollbackPlan}</Block>
            {c.testPlan && <Block title="Test / verification plan">{c.testPlan}</Block>}
            {c.reviewNotes && <Block title="Change Manager review notes">{c.reviewNotes}</Block>}
            {c.closureNotes && <Block title="Post-implementation review">{c.closureNotes}</Block>}
          </Card>

          {(c.status === 'cab_review' || d.votes.length > 0) && (
            <Card
              title="CAB votes"
              sub="Members advise; the CAB Chair makes the decision"
              bodyClass="p-0"
              actions={
                <span className="num flex gap-2 text-2xs font-semibold">
                  <span className="text-good">{tally.approve} approve</span>
                  <span className="text-bad">{tally.reject} reject</span>
                  <span className="text-muted">{tally.abstain} abstain</span>
                </span>
              }
            >
              {d.votes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted">No votes yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.votes.map((v) => (
                    <li key={v.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <Person email={v.voterEmail} name={names[v.voterEmail]} sub={v.comment || fmtDateTime(v.votedAt)} />
                      <Pill tone={v.decision === 'approve' ? 'good' : v.decision === 'reject' ? 'bad' : 'neutral'}>{v.decision}</Pill>
                    </li>
                  ))}
                </ul>
              )}
              {d.canVote && <VoteForm id={c.id} current={myVote?.decision} onDone={onChanged} />}
            </Card>
          )}

          <Card title="Discussion" bodyClass="p-0">
            {d.comments.length === 0 ? (
              <Empty title="No comments yet" icon={MessageSquare} />
            ) : (
              <ul className="divide-y divide-line">
                {d.comments.map((cm) => (
                  <li key={cm.id} className="px-4 py-3">
                    <div className="mb-1 flex items-center gap-2 text-2xs text-muted">
                      <span className="text-[13px] font-semibold text-ink">{name(cm.authorEmail)}</span>
                      <span className="num">{fmtDateTime(cm.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{cm.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <CommentForm id={c.id} onDone={onChanged} />
          </Card>
        </div>

        <aside className="space-y-4">
          {d.actions.length > 0 && <ActionPanel id={c.id} actions={d.actions} impact={c.impact} likelihood={c.likelihood} onDone={onChanged} />}

          <Card title="Details">
            <dl className="space-y-2 text-[13px]">
              <Row label="Requester">{name(c.requesterEmail)}</Row>
              <Row label="Implementer">{name(c.implementerEmail || c.requesterEmail)}</Row>
              <Row label="Category">{CATEGORY_LABEL[c.category]}</Row>
              <Row label="Affected systems">{c.affectedSystems}</Row>
              {c.affectedLocations && <Row label="Locations">{c.affectedLocations}</Row>}
              <Row label="Impact × likelihood">{LEVEL_LABEL[c.impact]} × {LEVEL_LABEL[c.likelihood]}</Row>
              <Row label="Downtime">{c.downtimeMinutes} min</Row>
              <Row label="Planned window">{fmtDateTime(c.plannedStart)} – {fmtDateTime(c.plannedEnd)}</Row>
              {c.actualStart && <Row label="Actual window">{fmtDateTime(c.actualStart)} – {fmtDateTime(c.actualEnd)}</Row>}
              <Row label="Submitted">{fmtDateTime(c.submittedAt)}</Row>
              <Row label="Decided">{fmtDateTime(c.decidedAt)}</Row>
              {c.closedAt && <Row label="Closed">{fmtDateTime(c.closedAt)}</Row>}
            </dl>
          </Card>

          <Card title="Audit trail" sub="Append-only">
            <ol className="relative space-y-3 border-l border-line pl-4">
              {d.history.map((h) => (
                <li key={h.id} className="relative text-2xs">
                  <span aria-hidden className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-panel" />
                  <div className="text-[12px] font-semibold">
                    {name(h.actorEmail)} {h.actorRole && <span className="font-normal text-muted">({ROLE_LABEL[h.actorRole as Me['role']] ?? h.actorRole})</span>}
                  </div>
                  <div className="text-muted">
                    {h.action.replaceAll('_', ' ')}
                    {h.toStatus && <> → <strong className="text-ink">{STATUS_LABEL[h.toStatus]}</strong></>}
                  </div>
                  <div className="num text-faint">{fmtDateTime(h.occurredAt)}</div>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <h3 className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">{title}</h3>
      <p className="whitespace-pre-wrap text-sm">{children}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ActionPanel({ id, actions, impact, likelihood, onDone }: { id: number; actions: Action[]; impact: number; likelihood: number; onDone: () => void }) {
  const [action, setAction] = useState<Action>(actions[0]);
  const [imp, setImp] = useState(impact);
  const [lik, setLik] = useState(likelihood);
  const [outcome, setOutcome] = useState<Outcome>('successful');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsNote = NOTE_REQUIRED.includes(action);

  async function go() {
    if (needsNote && !note.trim()) return setError('Please add a comment for this action.');
    setBusy(true);
    setError('');
    try {
      await transition(id, {
        action,
        note,
        ...(action === 'forward_to_cab' ? { impact: imp, likelihood: lik } : {}),
        ...(action === 'complete' ? { outcome } : {}),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.');
      setBusy(false);
    }
  }

  return (
    <Card title="Your action" className="border-accent/40 ring-2 ring-accent/10">
      <div className="space-y-3">
        <div className="space-y-1.5" role="radiogroup" aria-label="Action">
          {actions.map((a) => (
            <label key={a} className={cx('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold transition', action === a ? 'border-accent bg-accent/5' : 'border-line hover:bg-sunken', DANGER.includes(a) && 'text-bad')}>
              <input type="radio" name="action" checked={action === a} onChange={() => { setAction(a); setError(''); }} className="accent-[rgb(var(--accent))]" />
              {ACTION_LABEL[a]}
            </label>
          ))}
        </div>

        {action === 'forward_to_cab' && (
          <div className="grid grid-cols-2 gap-2">
            <LabelledSelect label="Impact" value={imp} onChange={setImp} />
            <LabelledSelect label="Likelihood" value={lik} onChange={setLik} />
            <div className="col-span-2 flex items-center gap-2 text-2xs text-muted">Assessed risk: <RiskPill risk={riskFromScore(imp, lik)} /></div>
          </div>
        )}
        {action === 'complete' && (
          <label className="block">
            <span className="mb-1 block text-2xs font-semibold text-muted">Outcome</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} className={inputCls}>
              {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-2xs font-semibold text-muted">Comment {needsNote ? '(required)' : '(optional)'}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={textareaCls} />
        </label>
        {error && <p role="alert" className="text-[13px] font-medium text-bad">{error}</p>}
        <Button variant="primary" className={cx('w-full', DANGER.includes(action) && '!from-bad !to-bad')} onClick={go} disabled={busy}>
          {busy ? 'Saving…' : ACTION_LABEL[action]}
        </Button>
      </div>
    </Card>
  );
}

function LabelledSelect({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(+e.target.value)} className={inputCls}>
        {[1, 2, 3].map((n) => <option key={n} value={n}>{LEVEL_LABEL[n]}</option>)}
      </select>
    </label>
  );
}

function VoteForm({ id, current, onDone }: { id: number; current?: string; onDone: () => void }) {
  const [decision, setDecision] = useState(current ?? 'approve');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    setBusy(true);
    setError('');
    try {
      await vote(id, { decision, comment });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not vote.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5 border-t border-line bg-sunken/60 px-4 py-3">
      <div className="text-[13px] font-semibold">{current ? `Your vote: ${current}. You can change it.` : 'Cast your vote'}</div>
      <div className="flex gap-4 text-[13px]" role="radiogroup" aria-label="Vote">
        {(['approve', 'reject', 'abstain'] as const).map((v) => (
          <label key={v} className="flex items-center gap-1.5 capitalize">
            <input type="radio" name={`vote-${id}`} checked={decision === v} onChange={() => setDecision(v)} className="accent-[rgb(var(--accent))]" /> {v}
          </label>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className={textareaCls} placeholder="Comment (required for reject)" />
      {error && <p role="alert" className="text-[13px] font-medium text-bad">{error}</p>}
      <Button variant="primary" onClick={go} disabled={busy}>{busy ? 'Saving…' : 'Submit vote'}</Button>
    </div>
  );
}

function CommentForm({ id, onDone }: { id: number; onDone: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await addComment(id, body);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-line px-4 py-3">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={textareaCls} placeholder="Add a comment…" aria-label="Add a comment" />
      {error && <p role="alert" className="text-[13px] font-medium text-bad">{error}</p>}
      <Button onClick={go} disabled={busy || !body.trim()}>{busy ? 'Posting…' : 'Post comment'}</Button>
    </div>
  );
}
