'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { clearDrafts, draftUser, readDrafts, writeDrafts } from '@/lib/drafts';
import { MAX_RESPONSE, STATUS, obsKey, type Observation, type Track, type Workpaper } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { IconArrowLeft, IconLock } from '@/components/icons';

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const roleText = (o: Observation) => (o.myRole === 'OWNER' ? 'You are the owner' : 'You are the person responsible');

function Finding({ o }: { o: Observation }) {
  const rows: Array<[string, string]> = [
    ['Observation', o.observation], ['Root cause', o.rootCause], ['Business implication', o.businessImplication], ['Recommendation', o.recommendation],
    ['Risk', o.risk], ['Residual risk', o.residualRisk], ['Timeline', fmtDate(o.timeline)], ['Categories', o.categories.join(', ')],
  ];
  if (o.financialImpact) rows.splice(4, 0, ['Financial impact (lakh)', o.financialImpact]);
  return (
    <dl className="finding">
      {rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
    </dl>
  );
}

function Detail() {
  const q = useSearchParams();
  const track: Track = q.get('track') === 'mis' ? 'mis' : 'audit';
  const guid = q.get('guid') ?? '';
  const [wp, setWp] = useState<Workpaper | null>(null);
  const [error, setError] = useState('');
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'save' | 'submit'>('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const user = useMemo(() => draftUser(api.mode === 'demo'), []);

  const apply = useCallback((w: Workpaper) => {
    const fromSap = Object.fromEntries(w.observations.map((o) => [obsKey(o), o.myResponse]));
    const drafts = w.canRespond && w.draftStorage === 'browser' ? readDrafts(user, track, w.guid, Object.keys(fromSap)) : {};
    setWp(w);
    setSaved({ ...fromSap, ...drafts });
    setTexts({ ...fromSap, ...drafts });
  }, [user, track]);

  const load = useCallback(() => {
    if (!guid) { setError('No workpaper was chosen. Go back to My observations and open one.'); return; }
    setError('');
    setWp(null);
    api.get(track, guid).then(apply).catch((e: Error) => setError(e.message));
  }, [guid, track, apply]);
  useEffect(() => { load(); }, [load]);

  const editable = !!wp && wp.canRespond;
  const dirty = !!wp && Object.keys(texts).some((k) => (texts[k] ?? '') !== (saved[k] ?? ''));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const responses = () => (wp?.observations ?? []).map((o) => ({ lineItem: o.lineItem, ownerLineItem: o.ownerLineItem, text: texts[obsKey(o)] ?? '' }));
  const over = (wp?.observations ?? []).some((o) => (texts[obsKey(o)] ?? '').length > MAX_RESPONSE);
  const missing = (wp?.observations ?? []).filter((o) => !(texts[obsKey(o)] ?? '').trim());
  const canSubmit = editable && !missing.length && !over && !busy;

  const saveDraft = async () => {
    if (!wp) return;
    setMessage(null);
    if (wp.draftStorage === 'browser') {
      const ok = writeDrafts(user, track, wp.guid, texts);
      setSaved({ ...texts });
      setMessage(ok ? { kind: 'ok', text: 'Draft saved in this browser. It is not sent to the reviewer until you submit.' } : { kind: 'info', text: 'Your browser does not allow saving drafts; the draft is kept only while this page is open. Submit when you are ready.' });
      return;
    }
    setBusy('save');
    try { apply(await api.save(track, wp.guid, responses())); setMessage({ kind: 'ok', text: 'Draft saved.' }); } catch (e) { setMessage({ kind: 'err', text: (e as Error).message }); } finally { setBusy(''); }
  };

  const submit = async () => {
    if (!wp) return;
    setBusy('submit');
    setMessage(null);
    try {
      const after = await api.submit(track, wp.guid, responses());
      clearDrafts(user, track, wp.guid, wp.observations.map(obsKey));
      apply(after);
      setConfirm(false);
      setMessage(after.status === STATUS.responded
        ? { kind: 'ok', text: 'Your response was submitted. Every assignee has now responded, so the workpaper is with the reviewer ("Management responded").' }
        : { kind: 'ok', text: `Your response was submitted.${after.waitingFor.length ? ` Waiting for: ${after.waitingFor.join(', ')}.` : ''}` });
    } catch (e) {
      setConfirm(false);
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally { setBusy(''); }
  };

  const back = <Link href={`/?track=${track}`} className="row" style={{ display: 'inline-flex', gap: 6, marginBottom: 8 }}><IconArrowLeft size={14} /> My observations</Link>;
  if (error) return <>{back}<h1>Workpaper</h1><div className="banner err" role="alert"><p>{error}</p></div><button type="button" onClick={load}>Try again</button></>;
  if (!wp) return <>{back}<h1>Workpaper</h1><div role="status" aria-label="Loading workpaper"><div className="skeleton" /><div className="skeleton" style={{ marginTop: 10, height: 200 }} /></div></>;

  const closed = wp.status !== STATUS.toAuditee;
  return (
    <>
      {back}
      <h1>{wp.subProcess} <StatusBadge wp={wp} /></h1>
      <div className="ctx">
        <span><b>Process</b> {wp.process}</span><span><b>Location</b> {wp.location}{wp.city ? `, ${wp.city}` : ''}</span>
        <span><b>FY</b> {wp.fy}</span><span><b>Scheduling</b> {wp.scheduling}</span><span><b>Period</b> {wp.period}</span>
        <span><b>Performer</b> {wp.performer || '—'}</span><span><b>Reviewer</b> {wp.reviewer || '—'}</span>
        <span><b>Track</b> {track === 'mis' ? 'MIS' : 'Audit'}</span>
      </div>

      {closed && (
        <div className="banner warn" role="note"><IconLock size={16} /><p>{wp.status === STATUS.responded
          ? 'All responses were submitted and the workpaper is with the reviewer. It is read only.'
          : 'This workpaper is closed. It is read only.'}</p></div>
      )}
      {!closed && wp.mySubmitted && (
        <div className="banner" role="note"><p>You have submitted your response.{wp.waitingFor.length ? ` Waiting for: ${wp.waitingFor.join(', ')}.` : ''} You can still change it and submit again until everyone has responded.</p></div>
      )}
      {message && <div className={`banner ${message.kind === 'err' ? 'err' : message.kind === 'ok' ? 'ok' : ''}`} role={message.kind === 'err' ? 'alert' : 'status'}><p>{message.text}</p></div>}

      <div className="detail">
        <div>
          {!wp.observations.length && <div className="card"><p className="muted" style={{ margin: 0 }}>None of the observations of this workpaper are assigned to you.</p></div>}
          {wp.observations.map((o) => {
            const k = obsKey(o);
            const v = texts[k] ?? '';
            const id = `resp-${o.lineItem}-${o.ownerLineItem}`;
            return (
              <article key={k} className="card obs" aria-labelledby={`${id}-t`}>
                <h2 id={`${id}-t`}><span className="no">Observation {o.lineItem}</span> {o.title || 'Untitled observation'}</h2>
                <p className="muted" style={{ margin: '-4px 0 10px', fontSize: 12.5 }}>{roleText(o)}</p>
                <Finding o={o} />
                <div className="response">
                  <label htmlFor={id}>My response</label>
                  {editable ? (
                    <>
                      <textarea id={id} value={v} maxLength={MAX_RESPONSE + 500} aria-describedby={`${id}-c`} aria-invalid={v.length > MAX_RESPONSE || undefined}
                        placeholder="Describe the action you will take, who owns it and by when."
                        onChange={(e) => setTexts((t) => ({ ...t, [k]: e.target.value }))} />
                      <div id={`${id}-c`} className={`counter${v.length > MAX_RESPONSE ? ' over' : ''}`}>{v.length} / {MAX_RESPONSE} characters</div>
                    </>
                  ) : (
                    <p id={id} className="ctext" style={{ margin: 0 }}>{o.myResponse || <span className="muted">No response was submitted.</span>}</p>
                  )}
                </div>
              </article>
            );
          })}
          {editable && wp.observations.length > 0 && (
            <div className="card actionbar">
              <div className="row">
                <span className="grow muted" style={{ fontSize: 12.5 }}>
                  {missing.length ? `${missing.length} of ${wp.observations.length} observation${wp.observations.length === 1 ? '' : 's'} still need${missing.length === 1 ? 's' : ''} a response.` : over ? `A response is longer than ${MAX_RESPONSE} characters.` : 'Every observation has a response.'}
                  {dirty ? ' Unsaved changes.' : ''}
                </span>
                <button type="button" onClick={saveDraft} disabled={!!busy || !dirty}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
                <button type="button" className="primary" onClick={() => setConfirm(true)} disabled={!canSubmit}>{wp.mySubmitted ? 'Submit again' : 'Submit to reviewer'}</button>
              </div>
            </div>
          )}
        </div>
        <AttachmentsPanel track={track} guid={wp.guid} editable={editable} />
      </div>

      <ConfirmDialog open={confirm} title="Submit your response?" confirmLabel="Submit" busy={busy === 'submit'} onConfirm={submit} onCancel={() => setConfirm(false)}>
        <p>Your responses to {wp.observations.length} observation{wp.observations.length === 1 ? '' : 's'} will be stored in SAP.</p>
        <p>When every assignee of this workpaper has submitted, it moves to &quot;Management responded&quot; and the reviewer and performer are informed by e-mail.</p>
      </ConfirmDialog>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<div role="status" className="skeleton" aria-label="Loading" />}><Detail /></Suspense>;
}
