'use client';
import { useEffect, useState } from 'react';
import { AlertOctagon, BookMarked, CheckCircle2, ExternalLink, GitMerge, Link2, Megaphone, Pencil, Save, Siren, Unlink, Video } from 'lucide-react';
import { createProblemFrom, declareMajor, linkProblem, majorUpdate, saveKnownError, savePir, standDownMajor } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime, relative } from '@/lib/format';
import type { KnownError, LinkedIncident, Pir, ProblemRef, Ticket } from '@/lib/types';
import { Button, Card, Field, Modal, Notice, Pill, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';
import { ItsmTag } from './Itsm';

/*
   v7 Phase 7 (master prompt §N 5): the Major-incident banner (bridge link, next-update countdown, post an update,
   stand down), Declare major incident, the post-incident review (PIR) form, and the Problem / known-error cards.
*/
type Reload = () => Promise<void>;
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Could not save.');

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function MajorIncidentBanner({ ticket: t, reload }: { ticket: Ticket; reload: Reload }) {
  const { can } = useSamadhan();
  const now = useNow();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!t.isMajorIncident) return null;
  const due = t.majorNextUpdateAt ? new Date(t.majorNextUpdateAt).getTime() - now : null;
  const mins = due !== null ? Math.round(due / 60_000) : null;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); setText(''); setOpen(false); await reload(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border-2 border-bad/50 bg-bad/10 p-3" role="alert" data-testid="major-banner">
      <div className="flex flex-wrap items-center gap-2">
        <Siren size={18} className="animate-pulse text-bad" />
        <b className="text-sm text-bad">MAJOR INCIDENT</b>
        {t.majorDeclaredAt && <span className="text-2xs text-muted">declared {relative(t.majorDeclaredAt)}</span>}
        {mins !== null && <Pill tone={mins < 0 ? 'bad' : mins <= 10 ? 'warn' : 'neutral'}>{mins < 0 ? `update overdue by ${-mins} min` : `next update in ${mins} min`}</Pill>}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {t.majorBridgeUrl && <a href={t.majorBridgeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-bad px-2.5 py-1 text-xs font-bold text-white hover:opacity-90"><Video size={13} /> Join bridge</a>}
          {can('ticket.note') && <Button size="sm" onClick={() => setOpen((o) => !o)}><Megaphone size={13} /> Post update</Button>}
          {can('ticket.declareMajor') && <Button size="sm" disabled={busy} onClick={() => window.confirm('Stand down the major incident?') && run(() => standDownMajor(t.id))}>Stand down</Button>}
        </div>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <textarea rows={3} className={textareaCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="What is known, what is being done, the next step and when" aria-label="Major incident update" />
          <Button size="sm" variant="primary" disabled={busy || text.trim().length < 5} onClick={() => run(() => majorUpdate(t.id, text))}>{busy ? <Spinner /> : <Megaphone size={13} />} Post update</Button>
        </div>
      )}
      {error && <div className="mt-2"><Notice onClose={() => setError('')}>{error}</Notice></div>}
    </div>
  );
}

export function DeclareMajorButton({ ticket: t, reload }: { ticket: Ticket; reload: Reload }) {
  const { can } = useSamadhan();
  const [open, setOpen] = useState(false);
  const [bridge, setBridge] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (t.isMajorIncident || !can('ticket.declareMajor')) return null;
  return (
    <>
      <button type="button" className="text-2xs font-bold text-faint hover:text-bad" onClick={() => setOpen(true)} data-testid="declare-major"><AlertOctagon size={11} className="mr-0.5 inline" />Declare major incident</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Declare a major incident">
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted">The desk leads and the team are alerted, a stakeholder update is due every 30 minutes, and a post-incident review is needed before it is resolved.</p>
          <Field label="Bridge link" hint="Teams / Meet link for the war room"><input className={inputCls} value={bridge} onChange={(e) => setBridge(e.target.value)} placeholder="https://" /></Field>
          <Field label="What is happening"><textarea rows={3} className={textareaCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {error && <Notice onClose={() => setError('')}>{error}</Notice>}
          <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await declareMajor(t.id, { bridgeUrl: bridge || undefined, note: note || undefined }); setOpen(false); await reload(); } catch (e) { setError(errText(e)); } finally { setBusy(false); } }}>
              {busy ? <Spinner /> : <Siren size={14} />} Declare
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const lines = (a?: { text: string; owner?: string }[]) => (a ?? []).map((x) => (x.owner ? `${x.text} — ${x.owner}` : x.text)).join('\n');
export function PirCard({ ticket: t, pir, reload }: { ticket: Ticket; pir: Pir | null | undefined; reload: Reload }) {
  const { meta, can } = useSamadhan();
  const blank = { summary: '', impactDescription: '', rootCause: '', rootCauseCategory: '', contributingFactors: '', timeline: '', correctiveActions: '', preventiveActions: '' };
  const toForm = (p?: Pir | null) => (p ? { summary: p.summary ?? '', impactDescription: p.impactDescription ?? '', rootCause: p.rootCause ?? '', rootCauseCategory: p.rootCauseCategory ?? '',
    contributingFactors: p.contributingFactors ?? '', timeline: lines(p.timeline), correctiveActions: lines(p.correctiveActions), preventiveActions: lines(p.preventiveActions) } : blank);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(toForm(pir));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setF(toForm(pir)), [pir]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = can('ticket.pir.edit');
  const save = async (reviewed = false) => {
    setBusy(true);
    setError('');
    try {
      await savePir(t.id, { ...f, rootCauseCategory: f.rootCauseCategory || null, ...(reviewed ? { reviewed: true } : {}) });
      setEditing(false);
      await reload();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const missing = t.isMajorIncident && (!pir?.summary || !pir?.rootCause);
  return (
    <Card title={<span className="inline-flex flex-wrap items-center gap-1.5">Post-incident review <ItsmTag practice="major" /></span>} sub={pir?.reviewedAt ? `Reviewed by ${pir.reviewedBy} · ${fmtDateTime(pir.reviewedAt)}` : missing ? 'Needed before this major incident is resolved' : 'What happened, why, and what changes'}
      actions={edit && !editing && <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> {pir ? 'Edit' : 'Write'}</Button>}>
      <div data-testid="pir-card" className="space-y-2 text-xs">
        {missing && !editing && <Notice tone="warn">Summary and root cause are required before resolving.</Notice>}
        {editing ? (
          <div className="space-y-2">
            <Field label="Summary" required><textarea rows={2} className={textareaCls} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
            <Field label="Business impact"><textarea rows={2} className={textareaCls} value={f.impactDescription} onChange={(e) => setF({ ...f, impactDescription: e.target.value })} /></Field>
            <Field label="Timeline" hint="One event per line, e.g. 10:05 alerts"><textarea rows={3} className={textareaCls} value={f.timeline} onChange={(e) => setF({ ...f, timeline: e.target.value })} /></Field>
            <Field label="Root cause" required><textarea rows={2} className={textareaCls} value={f.rootCause} onChange={(e) => setF({ ...f, rootCause: e.target.value })} /></Field>
            <Field label="Root cause category"><select className={cx('h-9 w-full', inputBase)} value={f.rootCauseCategory} onChange={(e) => setF({ ...f, rootCauseCategory: e.target.value })}><option value="">—</option>{(meta.sapLists?.rootCause ?? []).map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Contributing factors"><textarea rows={2} className={textareaCls} value={f.contributingFactors} onChange={(e) => setF({ ...f, contributingFactors: e.target.value })} /></Field>
            <Field label="Corrective actions" hint="One per line"><textarea rows={2} className={textareaCls} value={f.correctiveActions} onChange={(e) => setF({ ...f, correctiveActions: e.target.value })} /></Field>
            <Field label="Preventive actions" hint="One per line"><textarea rows={2} className={textareaCls} value={f.preventiveActions} onChange={(e) => setF({ ...f, preventiveActions: e.target.value })} /></Field>
            {error && <Notice onClose={() => setError('')}>{error}</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy} onClick={() => save(false)}>{busy ? <Spinner /> : <Save size={13} />} Save</Button>
              <Button disabled={busy || !f.summary.trim() || !f.rootCause.trim()} onClick={() => save(true)}><CheckCircle2 size={13} /> Save as reviewed</Button>
              <Button onClick={() => { setEditing(false); setF(toForm(pir)); }}>Cancel</Button>
            </div>
          </div>
        ) : pir ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {pir.summary && <><dt className="text-muted">Summary</dt><dd className="break-words">{pir.summary}</dd></>}
            {pir.rootCause && <><dt className="text-muted">Root cause</dt><dd className="break-words">{pir.rootCause}{pir.rootCauseCategory ? ` (${pir.rootCauseCategory})` : ''}</dd></>}
            {pir.timeline.length > 0 && <><dt className="text-muted">Timeline</dt><dd><ul className="list-inside list-disc">{pir.timeline.map((x, i) => <li key={i}>{x.text}</li>)}</ul></dd></>}
            {pir.correctiveActions.length > 0 && <><dt className="text-muted">Corrective</dt><dd><ul className="list-inside list-disc">{pir.correctiveActions.map((x, i) => <li key={i}>{x.text}{x.owner ? ` — ${x.owner}` : ''}</li>)}</ul></dd></>}
            {pir.preventiveActions.length > 0 && <><dt className="text-muted">Preventive</dt><dd><ul className="list-inside list-disc">{pir.preventiveActions.map((x, i) => <li key={i}>{x.text}</li>)}</ul></dd></>}
          </dl>
        ) : <p className="text-muted">Not written yet.</p>}
      </div>
    </Card>
  );
}

/** On an incident: its problem (or link / create one). On a problem: known-error details and the linked incidents. */
export function ProblemCard({ ticket: t, problem, incidents, knownError, reload }: { ticket: Ticket; problem: ProblemRef | null | undefined; incidents: LinkedIncident[]; knownError: KnownError | null | undefined; reload: Reload }) {
  const { meta, can, openTicket } = useSamadhan();
  const manage = can('problem.manage');
  const [num, setNum] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [ke, setKe] = useState<Partial<KnownError>>(knownError ?? {});
  useEffect(() => setKe(knownError ?? {}), [knownError]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); await reload(); return true; } catch (e) { setError(errText(e)); return false; } finally { setBusy(false); }
  };
  if (t.recordClass === 'PROBLEM') {
    return (
      <Card title={<span className="inline-flex flex-wrap items-center gap-1.5">Problem / known error <ItsmTag practice={['problem', 'knowledge']} /></span>} sub={knownError?.knownError ? 'Known error - the workaround is in the KEDB' : knownError?.status ?? 'Under investigation'}
        actions={manage && !editing && <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</Button>}>
        <div className="space-y-2 text-xs" data-testid="problem-card">
          {error && <Notice onClose={() => setError('')}>{error}</Notice>}
          {editing ? (
            <div className="space-y-2">
              <Field label="Status"><select className={cx('h-9 w-full', inputBase)} value={ke.status ?? 'Under investigation'} onChange={(e) => setKe({ ...ke, status: e.target.value })}>{(meta.problemStatuses ?? []).map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Symptom"><textarea rows={2} className={textareaCls} value={ke.symptom ?? ''} onChange={(e) => setKe({ ...ke, symptom: e.target.value })} /></Field>
              <Field label="Workaround"><textarea rows={2} className={textareaCls} value={ke.workaround ?? ''} onChange={(e) => setKe({ ...ke, workaround: e.target.value })} /></Field>
              <Field label="Root cause"><textarea rows={2} className={textareaCls} value={ke.rootCause ?? ''} onChange={(e) => setKe({ ...ke, rootCause: e.target.value })} /></Field>
              <Field label="Permanent fix"><textarea rows={2} className={textareaCls} value={ke.permanentFix ?? ''} onChange={(e) => setKe({ ...ke, permanentFix: e.target.value })} /></Field>
              <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={!!ke.knownError} onChange={(e) => setKe({ ...ke, knownError: e.target.checked })} /> Publish as a known error (KEDB)</label>
              <div className="flex gap-2"><Button variant="primary" disabled={busy} onClick={async () => { if (await run(() => saveKnownError(t.id, { status: ke.status, symptom: ke.symptom ?? null, workaround: ke.workaround ?? null, rootCause: ke.rootCause ?? null, permanentFix: ke.permanentFix ?? null, knownError: !!ke.knownError }))) setEditing(false); }}><Save size={13} /> Save</Button><Button onClick={() => setEditing(false)}>Cancel</Button></div>
            </div>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {knownError?.symptom && <><dt className="text-muted">Symptom</dt><dd className="break-words">{knownError.symptom}</dd></>}
              {knownError?.workaround && <><dt className="text-muted">Workaround</dt><dd className="break-words font-semibold text-good">{knownError.workaround}</dd></>}
              {knownError?.rootCause && <><dt className="text-muted">Root cause</dt><dd className="break-words">{knownError.rootCause}</dd></>}
              {knownError?.permanentFix && <><dt className="text-muted">Fix</dt><dd className="break-words">{knownError.permanentFix}</dd></>}
            </dl>
          )}
          <div className="border-t border-line pt-2">
            <div className="mb-1 font-bold">Linked incidents ({incidents.length})</div>
            {incidents.length === 0 ? <p className="text-muted">None yet.</p> : (
              <ul className="space-y-1">
                {incidents.map((i) => (
                  <li key={i.id} className="flex items-center gap-1.5">
                    <button type="button" className="num font-bold text-accent hover:underline" onClick={() => openTicket(i.id)}>{i.ref}</button>
                    <span className="min-w-0 flex-1 truncate">{i.subject}</span>
                    <Pill tone={i.isResolved ? 'good' : 'neutral'}>{i.statusName}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card title={<span className="inline-flex flex-wrap items-center gap-1.5">Problem <ItsmTag practice="problem" /></span>} sub={problem ? 'This incident is part of a known problem' : 'Recurring? Link it to a problem'}>
      <div className="space-y-2 text-xs" data-testid="problem-card">
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        {problem ? (
          <div className="rounded-lg border border-line p-2.5">
            <div className="flex items-center gap-1.5">
              <GitMerge size={13} className="text-accent" />
              <button type="button" className="num font-bold text-accent hover:underline" onClick={() => openTicket(problem.id)}>{problem.ref}</button>
              <span className="min-w-0 flex-1 truncate">{problem.subject}</span>
              {manage && <button type="button" aria-label="Unlink from the problem" className="text-muted hover:text-bad" disabled={busy} onClick={() => run(() => linkProblem(t.id, null))}><Unlink size={13} /></button>}
            </div>
            {problem.knownError && problem.workaround && <div className="mt-1.5 rounded-md bg-good/10 p-2"><BookMarked size={12} className="mr-1 inline text-good" /><b>Known error workaround:</b> {problem.workaround}</div>}
          </div>
        ) : manage ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input className={cx(inputCls, 'h-8 w-28 text-xs')} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ''))} placeholder="Problem #" aria-label="Problem number" />
            <Button size="sm" disabled={busy || !num} onClick={async () => { if (await run(() => linkProblem(t.id, Number(num)))) setNum(''); }}><Link2 size={13} /> Link</Button>
            <span className="text-muted">or</span>
            <Button size="sm" disabled={busy} onClick={async () => { let created: { id: number } | null = null; if (await run(async () => { created = await createProblemFrom(t.id); })) { if (created) openTicket((created as { id: number }).id); } }}><ExternalLink size={13} /> Create problem</Button>
          </div>
        ) : <p className="text-muted">Not linked.</p>}
      </div>
    </Card>
  );
}
