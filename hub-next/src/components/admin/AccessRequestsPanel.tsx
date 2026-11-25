'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, Download, FileText, CheckCircle2, XCircle, Undo2, ShieldAlert, ShieldCheck, ShieldQuestion, Send, AlertCircle, History } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../../theme/tokens';
import {
  AppIcon, EmptyState, Initials, Skeleton, Spinner, appLabel, cardStyle, chipStyle, displayName, errorTextStyle,
  inputStyle, inputWrapStyle, labelStyle, primaryBtnStyle, secondaryBtnStyle, sectionSubStyle, sectionTitleStyle, timeAgo,
} from './adminShared';
import SidePanel from './SidePanel';
import Dialog from '../Dialog';
import { EVENT_COLORS, EVENT_LABELS, StatusPill, formatBytes, formatDateTime } from '../access/requestShared';
import {
  decideAccessRequest, downloadRequestFile, getAccessRequest, listAccessRequests,
  type AccessRequestDetail, type AccessRequestSummary, type RequestStatus,
} from '../../lib/accessRequestsApi';

type Filter = 'Pending' | 'all' | RequestStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'Pending', label: 'Pending' },
  { id: 'Approved', label: 'Approved' },
  { id: 'Partially Approved', label: 'Partly approved' },
  { id: 'Rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

/** Super Admin inbox for access requests: every ticket, the supporting documents, a line-by-line approve/reject, and the
 * full audit trail. Approving grants the access automatically (backend/accessRequests.js). */
export default function AccessRequestsPanel({
  actingEmail, openId, onOpen, onChanged, notify,
}: {
  actingEmail: string | null;
  openId: number | null;
  onOpen: (id: number | null) => void;
  /** Called after a decision so the page can refresh people, history and the pending badge. */
  onChanged: () => void;
  notify: (message: string, tone?: 'success' | 'error') => void;
}) {
  const [filter, setFilter] = useState<Filter>('Pending');
  const [rows, setRows] = useState<AccessRequestSummary[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listAccessRequests().then((r) => {
      if (r.ok) { setRows(r.requests); setError(''); }
      else { setRows([]); setError(r.error); }
    });
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <div className="ac-fade">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} style={chipStyle(filter === f.id)}>
            {f.label} <span style={{ opacity: 0.7 }}>{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {rows === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={74} radius={16} />)}</div>
      ) : shown.length === 0 ? (
        <div style={cardStyle}><EmptyState icon={Inbox} title={error || (filter === 'Pending' ? 'Nothing waiting for approval' : 'No requests here')} hint={error ? undefined : 'New access requests from signed-in users and from the login page land here.'} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((r) => {
            const name = `${r.firstName} ${r.lastName}`;
            const apps = Array.from(new Set(r.items.map((i) => i.appId)));
            return (
              <button key={r.id} type="button" className="ac-card" onClick={() => onOpen(r.id)} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer', textAlign: 'left' }}>
                <Initials email={r.email} name={name} size={38} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={sectionTitleStyle}>{name}</span>
                    <span style={{ fontSize: 11, color: colors.inkSoft, fontFamily: fonts.sansMedium }}>{r.ref}</span>
                    {!r.requesterVerified && <span title="Raised from the login page; the email was not verified" style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, backgroundColor: `${colors.uat}14`, color: colors.uat, fontFamily: fonts.sansSemiBold }}>Not signed in</span>}
                  </span>
                  <span style={{ ...sectionSubStyle, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.email} · {r.items.length} role{r.items.length === 1 ? '' : 's'} in {apps.length} app{apps.length === 1 ? '' : 's'} · {timeAgo(r.createdAt)}
                  </span>
                  <span style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {apps.slice(0, 8).map((id) => <AppIcon key={id} appId={id} size={22} />)}
                    {apps.length > 8 && <span style={{ fontSize: 11, color: colors.inkSoft, alignSelf: 'center' }}>+{apps.length - 8}</span>}
                  </span>
                </span>
                <StatusPill status={r.status} />
              </button>
            );
          })}
        </div>
      )}

      {openId != null && (
        <RequestDrawer
          id={openId}
          actingEmail={actingEmail}
          onClose={() => onOpen(null)}
          notify={notify}
          onDecided={() => { load(); onChanged(); }}
        />
      )}
    </div>
  );
}

type Draft = Record<number, { decision?: 'Approved' | 'Rejected'; note: string }>;

function RequestDrawer({ id, actingEmail, onClose, notify, onDecided }: { id: number; actingEmail: string | null; onClose: () => void; notify: (m: string, t?: 'success' | 'error') => void; onDecided: () => void }) {
  const [req, setReq] = useState<AccessRequestDetail | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const [overallNote, setOverallNote] = useState('');
  const [confirm, setConfirm] = useState<'decide' | 'sendBack' | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    getAccessRequest(id).then((r) => {
      if (r.ok) setReq(r.request);
      else setError(r.error);
    });
  }, [id]);
  useEffect(load, [load]);

  const pending = useMemo(() => (req?.items ?? []).filter((i) => i.decision === 'Pending'), [req]);
  const isOwn = !!req && !!actingEmail && req.email === actingEmail;
  const canDecide = !!req && req.status === 'Pending' && !isOwn;
  const currentRole = (appId: string) => req?.currentGrants.find((g) => g.appId === appId)?.role ?? null;

  const setDecision = (itemId: number, appId: string, decision: 'Approved' | 'Rejected' | undefined) => {
    setFormError('');
    setDraft((cur) => {
      const next: Draft = { ...cur, [itemId]: { note: cur[itemId]?.note ?? '', decision } };
      if (decision === 'Approved') {
        // One role per application: approving this role un-decides any other approved role of the same app.
        for (const i of pending) if (i.id !== itemId && i.appId === appId && next[i.id]?.decision === 'Approved') next[i.id] = { note: next[i.id].note, decision: undefined };
      }
      return next;
    });
  };
  const setNote = (itemId: number, note: string) => setDraft((cur) => ({ ...cur, [itemId]: { decision: cur[itemId]?.decision, note } }));

  const approveAll = () => {
    const seen = new Set<string>();
    const next: Draft = {};
    for (const i of pending) {
      if (!seen.has(i.appId)) { seen.add(i.appId); next[i.id] = { decision: 'Approved', note: '' }; }
      else next[i.id] = { decision: 'Rejected', note: 'Only one role per application can be granted.' };
    }
    setDraft(next);
    setFormError('');
  };

  const approvedCount = pending.filter((i) => draft[i.id]?.decision === 'Approved').length;
  const rejectedCount = pending.filter((i) => draft[i.id]?.decision === 'Rejected').length;

  const review = () => {
    if (pending.some((i) => !draft[i.id]?.decision)) return setFormError('Approve or reject every line first.');
    if (pending.some((i) => draft[i.id]?.decision === 'Rejected' && (draft[i.id]?.note || '').trim().length < 5)) return setFormError('Give a short reason for every rejected line.');
    setFormError('');
    setConfirm('decide');
  };
  const sendBackReview = () => {
    if (overallNote.trim().length < 5) return setFormError('Write what the requester should fix, in the note box, to send it back.');
    setFormError('');
    setConfirm('sendBack');
  };

  const submit = async () => {
    if (!req || !confirm) return;
    setBusy(true);
    const res = await decideAccessRequest(
      req.id,
      confirm === 'sendBack'
        ? { sendBack: true, note: overallNote.trim() }
        : { note: overallNote.trim(), decisions: pending.map((i) => ({ itemId: i.id, decision: draft[i.id].decision!, note: draft[i.id].note.trim() })) }
    );
    setBusy(false);
    setConfirm(null);
    if (!res.ok) { setFormError(res.error); return; }
    notify(res.status === 'Rejected' ? `${req.ref} ${confirm === 'sendBack' ? 'sent back' : 'rejected'}.` : `${req.ref} ${res.status.toLowerCase()} — access granted.`);
    setDraft({});
    setOverallNote('');
    load();
    onDecided();
  };

  const download = async (f: AccessRequestDetail['files'][number]) => {
    const r = await downloadRequestFile(req!.id, f);
    if (!r.ok) notify(r.error || 'Could not open the file.', 'error');
    else load();
  };

  const name = req ? `${req.firstName} ${req.lastName}` : '';
  const acct = req?.account;

  return (
    <SidePanel
      onClose={onClose}
      width={620}
      header={
        <div style={{ padding: '18px 64px 16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {req && <Initials email={req.email} name={name} size={44} />}
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{req ? name : 'Access request'}</p>
            <p style={{ ...sectionSubStyle, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {req ? <>{req.ref} <StatusPill status={req.status} small /></> : 'Loading…'}
            </p>
          </div>
        </div>
      }
      footer={canDecide && pending.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {formError && <p style={{ ...errorTextStyle, margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><AlertCircle size={14} /> {formError}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="ac-btn" onClick={sendBackReview} disabled={busy} style={{ ...secondaryBtnStyle, color: '#DC2626' }}><Undo2 size={15} /> Send back</button>
            <button type="button" className="ac-btn" onClick={review} disabled={busy} style={{ ...primaryBtnStyle, flex: 1 }}>
              <Send size={15} /> Submit decision{approvedCount + rejectedCount > 0 ? ` (${approvedCount} approve, ${rejectedCount} reject)` : ''}
            </button>
          </div>
        </div>
      ) : undefined}
    >
      {!req ? (
        <div style={{ padding: 20 }}>{error ? <p style={errorTextStyle}>{error}</p> : <Skeleton height={140} radius={16} />}</div>
      ) : (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Who is asking, and how far to trust the identity */}
          <section style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {req.requesterVerified ? <ShieldCheck size={18} color={colors.green} style={{ marginTop: 1 }} /> : <ShieldQuestion size={18} color={colors.uat} style={{ marginTop: 1 }} />}
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '18px' }}>
                <b>{req.email}</b>
                <br />
                {req.requesterVerified ? 'Signed in to Emami Apps when this was raised.' : <>Raised from the login page — <b>email not verified</b>{req.submittedIp ? ` (from ${req.submittedIp})` : ''}. Check the attached mail before approving.</>}
              </div>
            </div>
            <div style={{ fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '18px', paddingTop: 10, borderTop: `1px solid ${colors.border}` }}>
              {acct?.exists
                ? <>Account exists · {acct.isActive ? 'active' : <b style={{ color: '#DC2626' }}>deactivated — reactivate in People before approving</b>} · {acct.accessLevel}</>
                : <>No account yet — approving any line <b>creates their sign-in</b> (Viewer) and grants the approved roles.</>}
            </div>
            <div style={{ fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '19px', paddingTop: 10, borderTop: `1px solid ${colors.border}` }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Why they need it</div>
              {req.justification}
            </div>
          </section>

          {isOwn && req.status === 'Pending' && (
            <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: radii.lg, backgroundColor: `${colors.uat}0d`, border: `1px solid ${colors.uatBorder}` }}>
              <ShieldAlert size={16} color={colors.uat} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '17px' }}>This is your own request — another Super Admin has to decide it.</p>
            </div>
          )}

          {/* Supporting documents */}
          <section>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Supporting documents ({req.files.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {req.files.map((f) => (
                <button key={f.id} type="button" className="ac-row" onClick={() => download(f)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: radii.lg, border: `1px solid ${colors.border}`, backgroundColor: colors.white, cursor: 'pointer', textAlign: 'left' }} title={`SHA-256 ${f.sha256}`}>
                  <FileText size={16} color={colors.rust} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
                  <span style={{ fontSize: 11, color: colors.inkSoft }}>{formatBytes(f.size)}</span>
                  <Download size={15} color={colors.inkSoft} />
                </button>
              ))}
            </div>
          </section>

          {/* The decision, one line per (app, role) */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ ...labelStyle, flex: 1 }}>Requested access ({req.items.length})</div>
              {canDecide && pending.length > 1 && <button type="button" className="ac-btn" onClick={approveAll} style={{ ...chipStyle(false, colors.green), height: 28 }}>Approve all</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {req.items.map((i) => {
                const d = draft[i.id];
                const decided = i.decision !== 'Pending';
                const cur = currentRole(i.appId);
                const approved = decided ? i.decision === 'Approved' : d?.decision === 'Approved';
                const rejected = decided ? i.decision === 'Rejected' : d?.decision === 'Rejected';
                return (
                  <div key={i.id} style={{ ...cardStyle, padding: 12, borderColor: approved ? colors.greenBorder : rejected ? '#DC262633' : colors.border }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <AppIcon appId={i.appId} size={32} />
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{appLabel(i.appId)}</div>
                        <div style={{ fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>
                          Role <b style={{ color: colors.ink }}>{i.role}</b>{i.depot ? ` · ${i.depot}` : ''}
                          {cur ? <> · currently <b>{cur}</b>{cur === i.role ? ' (no change)' : ''}</> : ' · no access today'}
                        </div>
                      </div>
                      {decided ? (
                        <StatusPill status={i.decision} small />
                      ) : canDecide ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="ac-btn" onClick={() => setDecision(i.id, i.appId, approved ? undefined : 'Approved')} aria-pressed={approved} style={{ ...chipStyle(approved, colors.green), display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} /> Approve</button>
                          <button type="button" className="ac-btn" onClick={() => setDecision(i.id, i.appId, rejected ? undefined : 'Rejected')} aria-pressed={rejected} style={{ ...chipStyle(rejected, '#DC2626'), display: 'inline-flex', alignItems: 'center', gap: 5 }}><XCircle size={14} /> Reject</button>
                        </div>
                      ) : <StatusPill status="Pending" small />}
                    </div>
                    {decided && i.decisionNote && <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>{i.decidedBy ? `${displayName(i.decidedBy)}: ` : ''}{i.decisionNote}</p>}
                    {!decided && canDecide && rejected && (
                      <div className="ac-input" style={{ ...inputWrapStyle, marginTop: 10 }}>
                        <input style={inputStyle} value={d?.note || ''} onChange={(e) => setNote(i.id, e.target.value)} placeholder="Reason shown to the requester (required)" maxLength={500} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {canDecide && (
              <div style={{ marginTop: 12 }}>
                <div style={{ ...labelStyle, marginBottom: 6 }}>Note to the requester (optional — required to send back)</div>
                <div className="ac-input" style={{ ...inputWrapStyle, height: 'auto', padding: '10px 12px' }}>
                  <textarea style={{ ...inputStyle, height: 60, resize: 'vertical', lineHeight: '18px' }} value={overallNote} onChange={(e) => setOverallNote(e.target.value)} maxLength={1000} placeholder="Included in the email they receive" />
                </div>
              </div>
            )}
            {req.decisionNote && req.status !== 'Pending' && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: colors.ink, fontFamily: fonts.sansMedium }}>Note sent: {req.decisionNote}</p>}
          </section>

          {/* Audit trail */}
          <section>
            <div style={{ ...labelStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><History size={13} /> Audit trail</div>
            <div style={{ borderLeft: `2px solid ${colors.border}`, marginLeft: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {req.events.map((e) => (
                <div key={e.id} style={{ position: 'relative', paddingLeft: 16 }}>
                  <span style={{ position: 'absolute', left: -6, top: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: EVENT_COLORS[e.type] || colors.inkSoft, border: `2px solid ${colors.white}` }} />
                  <div style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{EVENT_LABELS[e.type] || e.type}</div>
                  {e.detail && <div style={{ fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '17px', wordBreak: 'break-word' }}>{e.detail}</div>}
                  <div style={{ fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 2 }}>
                    {formatDateTime(e.occurredAt)} · {e.actor ? (e.actor === req.email ? name : displayName(e.actor)) : 'System'}{e.actorRole ? ` (${e.actorRole})` : ''}{e.ip ? ` · ${e.ip}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {confirm && req && (
        <Dialog onClose={() => !busy && setConfirm(null)} maxWidth={440}>
          <p style={{ margin: 0, fontSize: 16, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{confirm === 'sendBack' ? 'Send this request back?' : 'Submit your decision?'}</p>
          <p style={{ margin: '8px 0 0', fontSize: 13, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '19px' }}>
            {confirm === 'sendBack'
              ? <>Every line is rejected with your note and {req.firstName} is emailed. Nothing is granted.</>
              : <>
                  <b style={{ color: colors.green }}>{approvedCount} approved</b> and <b style={{ color: '#DC2626' }}>{rejectedCount} rejected</b>.
                  {approvedCount > 0 && (acct?.exists ? ' The approved roles are granted right away.' : ` ${req.firstName} gets a sign-in and the approved roles right away.`)} This can’t be edited afterwards; a new request would be needed.
                </>}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" className="ac-btn" onClick={() => setConfirm(null)} disabled={busy} style={secondaryBtnStyle}>Cancel</button>
            <button type="button" className="ac-btn" onClick={submit} disabled={busy} style={confirm === 'sendBack' ? { ...primaryBtnStyle, background: '#DC2626', boxShadow: 'none' } : primaryBtnStyle}>
              {busy ? <Spinner light /> : confirm === 'sendBack' ? 'Send back' : 'Confirm'}
            </button>
          </div>
        </Dialog>
      )}
    </SidePanel>
  );
}
