'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import DOMPurify from 'dompurify';
import { ArrowRightLeft, Clock, Forward, Lock, Mail, MessageCircle, MessageSquare, Pencil, Phone, PhoneIncoming, PhoneOutgoing, Reply, Save, Send, User, Zap } from 'lucide-react';
import { addMessage, addTimeLog, classifyTicket, getTicket, updateTicket } from '@/lib/api';
import { CLASSIFICATION_LABEL, RECORD_CLASS_LABEL, appById, groupsFor, matrixPriority, needsReview, refOf, statusesFor, usesImpactUrgency, workspaceById, wsTone } from '@/lib/workspaces';
import { appOptions } from './Tickets';
import { useSamadhan } from '@/lib/context';
import { ACTION_LABEL, fmtDateTime, fmtMins, fmtSecs, htmlToText, relative } from '@/lib/format';
import { EDITABLE_FIELDS, type ActivityItem, type CallLog, type Conversation, type Ticket, type TicketDetail } from '@/lib/types';
import { ActivityLine, PriorityPill, SeverityPill, SlaBadge, StatusPill } from './badges';
import { CallPanel } from './Calls';
import { MyCannedButton } from './MyCanned';
import TicketFields, { type Values } from './TicketFields';
import { INSERT_REPLY_EVENT, TicketAssist } from './Insights';
import { InsertArticleButton } from './Solutions';
import { CsatCard, PresenceBar, RelatedTickets, TicketBanners, TicketTodos, TicketToolbar, fillCanned } from './TicketExtras';
import { Avatar, Button, Card, Field, Notice, Pill, Skeleton, Spinner, Tabs, cx, inputBase, inputCls, textareaCls } from './ui';
import { AttachmentsCard, FileTray, Paperclips, uploadPending, usePendingFiles } from './Attachments';
import { ExternalRefsCard, SapCard } from './Sap';
import { ItCard } from './ItDetails';
import { ApprovalsCard, ChangeCard, TransportsCard } from './Change';
import { DeclareMajorButton, MajorIncidentBanner, PirCard, ProblemCard } from './Problem';
import { ProgramCard } from './Program';
import { sizeOf } from '@/lib/files';

/**
 * Email bodies are untrusted: keep formatting, drop scripts, forms, style blocks, event handlers and positioning.
 * Remote images (tracking pixels tell the sender when and where a mail was opened) are held back until the agent
 * chooses to load them; embedded (data:) images show as normal.
 */
function safeHtml(html: string, loadRemoteImages: boolean): { html: string; blockedImages: number } {
  if (typeof window === 'undefined') return { html: '', blockedImages: 0 };
  let blockedImages = 0;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG' && !loadRemoteImages && /^\s*(https?:)?\/\//i.test(node.getAttribute('src') ?? '')) {
      node.removeAttribute('src');
      node.removeAttribute('srcset');
      node.setAttribute('alt', node.getAttribute('alt') || '[image]');
      blockedImages++;
    }
    const style = node.getAttribute('style');
    // Positioning, transforms and negative margins can lay a mail over the app's own buttons: drop that style.
    if (style && /position\s*:|z-index|inset\s*:|transform\s*:|margin[a-z-]*\s*:\s*-/i.test(style)) node.removeAttribute('style');
    // A remote url(...) in a style (background-image etc.) is a tracking pixel too: held back like remote images.
    else if (style && !loadRemoteImages && /url\s*\(\s*['"]?\s*(https?:)?\/\//i.test(style)) {
      node.removeAttribute('style');
      blockedImages++;
    }
  });
  const clean = DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'meta', 'link', 'base'],
    FORBID_ATTR: ['class', 'id', 'background'],
  });
  DOMPurify.removeHook('afterSanitizeAttributes');
  return { html: clean, blockedImages };
}

const KIND_STYLE: Record<Conversation['kind'], { box: string; label: string; icon: typeof Mail }> = {
  INCOMING: { box: 'border-line bg-panel', label: 'Requester', icon: Mail },
  REPLY: { box: 'border-accent/25 bg-accent/[0.04]', label: 'Reply', icon: Reply },
  NOTE: { box: 'border-warn/30 bg-[#FFF8E6]', label: 'Private note', icon: Lock },
  FORWARD: { box: 'border-line bg-sunken', label: 'Forwarded', icon: Forward },
};

type Props = { ticket: Ticket };
type Editable = Values & { statusId: string; priority: string; groupId: string; agentId: string; tags: string; applicationId: string; recordClass: string; impact: string; urgency: string };

const toForm = (t: Ticket): Editable => ({
  ...Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, t[k] ?? ''])),
  statusId: String(t.statusId),
  priority: String(t.priority),
  groupId: t.groupId ? String(t.groupId) : '',
  agentId: t.agentId ? String(t.agentId) : '',
  tags: t.tags.join(', '),
  // v7 Phase 3
  applicationId: t.applicationId ? String(t.applicationId) : '',
  recordClass: t.recordClass ?? '',
  impact: t.impact ? String(t.impact) : '',
  urgency: t.urgency ? String(t.urgency) : '',
});

export default function TicketView({ id }: { id: number }) {
  const [data, setData] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await getTicket(id));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the ticket.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!data) return error ? <Notice>{error}</Notice> : <Card><Skeleton rows={10} /></Card>;
  return <TicketScreen data={data} reload={load} />;
}

function TicketScreen({ data, reload }: { data: TicketDetail; reload: () => Promise<void> }) {
  const { ticket: t } = data;
  const { meta } = useSamadhan();
  const [replying, setReplying] = useState(false);
  // v7 Phase 4: SAP details for the SAP / S/4 desks (or whenever some exist); external references outside Secondary Sales.
  const deskKey = workspaceById(meta, t.workspaceId)?.key;
  const showSap = deskKey === 'SAP' || deskKey === 'S4_PROGRAM' || !!data.sap;
  const showRefs = (!!deskKey && deskKey !== 'SEC_SALES') || (data.externalRefs?.length ?? 0) > 0;
  // v7 Phase 5: IT details for the Digital Apps / Infra & IT desks (or whenever some exist).
  const showIt = deskKey === 'DIGITAL_APPS' || deskKey === 'INFRA_IT' || !!data.it;
  // v7 Phase 6: transports (SAP / S/4 changes), change plan / access validity, approvals (outside Secondary Sales or when started).
  const otherDesk = !!deskKey && deskKey !== 'SEC_SALES';
  const showTransports = (otherDesk && (deskKey === 'SAP' || deskKey === 'S4_PROGRAM') && t.recordClass === 'CHANGE') || (data.transports?.length ?? 0) > 0;
  const showChange = (otherDesk && (t.recordClass === 'CHANGE' || t.recordClass === 'ACCESS_REQUEST')) || !!data.change;
  const showApprovals = otherDesk || (data.approvals?.length ?? 0) > 0;
  // v7 Phase 7: PIR for major incidents (and once written); problem card outside Secondary Sales or when linked.
  const showPir = !!t.isMajorIncident || !!t.majorDeclaredAt || !!data.pir;
  // v7 Phase 8: programme details on the S/4 desk.
  const showProgram = deskKey === 'S4_PROGRAM' || !!data.program;
  const showProblem = (otherDesk && t.recordClass !== 'CHANGE' && t.recordClass !== 'ACCESS_REQUEST') || !!data.problem || t.recordClass === 'PROBLEM';
  return (
    <div className="space-y-4">
      <TicketToolbar data={data} reload={reload} />
      <TicketBanners ticket={t} reload={reload} />
      {meta.options['presence.enabled'] !== false && <PresenceBar ticketId={t.id} replying={replying} />}
      <MajorIncidentBanner ticket={t} reload={reload} />
      <TicketHeader ticket={t} reload={reload} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Thread data={data} />
          <Composer ticket={t} reload={reload} onTyping={setReplying} />
          <ActivityLog items={data.activities} />
        </div>
        <div className="space-y-4">
          <TicketAssist ticket={t} reload={reload} />
          <Properties ticket={t} reload={reload} />
          {showSap && <SapCard ticketId={t.id} sap={data.sap} reload={reload} />}
          {showProgram && <ProgramCard ticketId={t.id} program={data.program} isDefect={t.recordClass === 'DEFECT'} reload={reload} />}
          {showPir && <PirCard ticket={t} pir={data.pir} reload={reload} />}
          {showProblem && <ProblemCard ticket={t} problem={data.problem} incidents={data.incidents ?? []} knownError={data.knownError} reload={reload} />}
          {showApprovals && <ApprovalsCard ticket={t} approvals={data.approvals ?? []} reload={reload} />}
          {showChange && <ChangeCard ticket={t} change={data.change} reload={reload} />}
          {showTransports && <TransportsCard ticketId={t.id} transports={data.transports ?? []} reload={reload} />}
          {showIt && <ItCard ticketId={t.id} it={data.it} deskKey={deskKey} reload={reload} />}
          {showRefs && <ExternalRefsCard ticketId={t.id} refs={data.externalRefs ?? []} reload={reload} />}
          <AttachmentsCard ticketId={t.id} files={data.attachments ?? []} reload={reload} />
          <RelatedTickets data={data} reload={reload} />
          <Requester data={data} reload={reload} />
          <CsatCard data={data} />
          <TicketTodos data={data} reload={reload} />
          <TimeLogs data={data} reload={reload} />
        </div>
      </div>
    </div>
  );
}

/**
 * v7 Phase 3 (§J): "auto-classified" hint with one-click Confirm / Change application, for tickets the mail
 * classification placed by default, by AI or by weak keywords. Confirming or changing makes it a manual classification.
 */
function ClassificationHint({ ticket: t, reload }: Props & { reload: () => Promise<void> }) {
  const { meta, can } = useSamadhan();
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!t.applicationId || !needsReview(t.classificationSource, t.classificationConfidence) || !can('ticket.classify')) return null;
  const run = async (applicationId?: number) => {
    const target = applicationId ? appById(meta, applicationId) : null;
    if (target && target.workspaceId !== t.workspaceId && !window.confirm(`${target.name} is in another service desk. Move the ticket there? Its reference becomes ${target.code}-${t.id}.`)) return;
    setBusy(true);
    setError('');
    try { await classifyTicket(t.id, applicationId); setChanging(false); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-2.5 py-1.5 text-2xs" data-testid="classification-hint">
      <span className="font-semibold text-warn">Auto-classified as {t.applicationName}</span>
      <span className="text-muted">{CLASSIFICATION_LABEL[t.classificationSource ?? ''] ?? ''}{t.classificationConfidence ? ` · ${Math.round(t.classificationConfidence * 100)}% sure` : ''}</span>
      {changing ? (
        <select aria-label="Change application" autoFocus disabled={busy} defaultValue="" onChange={(e) => e.target.value && run(Number(e.target.value))} className={cx('h-7 text-2xs', inputBase)}>
          <option value="">Choose the application…</option>
          {appOptions(meta).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <>
          <Button size="sm" disabled={busy} onClick={() => run()}>Confirm</Button>
          {can('ticket.changeApplication') && <Button size="sm" disabled={busy} onClick={() => setChanging(true)}>Change</Button>}
        </>
      )}
      {error && <span className="text-bad">{error}</span>}
    </div>
  );
}

function TicketHeader({ ticket: t, reload }: Props & { reload: () => Promise<void> }) {
  const { meta, can } = useSamadhan();
  const toggleConfidential = async () => {
    if (!window.confirm(t.confidential ? 'Make this ticket visible to everyone in the desk again?' : 'Mark this ticket confidential? Only people allowed to see confidential tickets will find it.')) return;
    try { await updateTicket(t.id, { confidential: !t.confidential, expectedUpdatedAt: t.updatedAt }); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  };
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(t.subject);
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await updateTicket(t.id, { subject, expectedUpdatedAt: t.updatedAt });
      setEditing(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };
  return (
    <Card bodyClass="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-muted">
            <span className="num font-bold" data-testid="ticket-header-ref">{refOf(meta, t)}</span>
            {t.applicationName && <span className={cx('rounded-md border px-1.5 py-0.5 font-bold', wsTone(workspaceById(meta, t.workspaceId)))}>{t.applicationName}</span>}
            <span>· {t.source}</span>
            <span title={fmtDateTime(t.createdAt)}>· created {relative(t.createdAt)}</span>
            {t.escalatedAt && <Pill tone="bad">Escalated</Pill>}
            {t.confidential && <span data-testid="confidential-pill"><Pill tone="bad" title="Only people allowed to see confidential tickets can open this one"><Lock size={11} className="mr-0.5 inline" />Confidential</Pill></span>}
            {workspaceById(meta, t.workspaceId)?.key && workspaceById(meta, t.workspaceId)?.key !== 'SEC_SALES' && <DeclareMajorButton ticket={t} reload={reload} />}
            {can('ticket.setConfidential') && (
              <button type="button" className="text-2xs font-bold text-faint hover:text-accent" onClick={toggleConfidential} data-testid="toggle-confidential">{t.confidential ? 'Remove confidential' : 'Mark confidential'}</button>
            )}
          </div>
          <ActivityLine t={t} className="mt-1" />
          {editing ? (
            <div className="mt-1 flex gap-2">
              <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" autoFocus />
              <Button variant="primary" onClick={save} disabled={!subject.trim()}>Save</Button>
              <Button onClick={() => { setEditing(false); setSubject(t.subject); }}>Cancel</Button>
            </div>
          ) : (
            <h2 className="mt-0.5 flex items-start gap-2 text-lg font-extrabold leading-snug tracking-tight">
              <span className="min-w-0">{t.subject}</span>
              <button type="button" onClick={() => setEditing(true)} className="mt-1 shrink-0 text-faint hover:text-accent" aria-label="Edit subject"><Pencil size={14} /></button>
            </h2>
          )}
          {error && <div className="mt-2"><Notice onClose={() => setError('')}>{error}</Notice></div>}
          <ClassificationHint ticket={t} reload={reload} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityPill severity={t.severity} />
          <PriorityPill priority={t.priority} />
          <StatusPill t={t} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 border-t border-line pt-3 text-2xs sm:grid-cols-4">
        <div><div className="font-bold uppercase tracking-wide text-muted">SLA</div><SlaBadge t={t} /></div>
        <div><div className="font-bold uppercase tracking-wide text-muted">First response due</div><span className={cx('num font-semibold', t.frViolated && 'text-bad')}>{t.firstRespondedAt ? `Responded ${fmtDateTime(t.firstRespondedAt)}` : fmtDateTime(t.firstResponseDueAt)}</span></div>
        <div><div className="font-bold uppercase tracking-wide text-muted">Resolution due</div><span className={cx('num font-semibold', t.resViolated && 'text-bad')}>{fmtDateTime(t.resolutionDueAt)}</span></div>
        <div><div className="font-bold uppercase tracking-wide text-muted">{t.resolvedAt ? 'Resolved' : 'SLA paused so far'}</div><span className="num font-semibold">{t.resolvedAt ? fmtDateTime(t.resolvedAt) : fmtMins(t.slaPausedMins)}</span></div>
      </div>
    </Card>
  );
}

function Thread({ data }: { data: TicketDetail }) {
  const { ticket: t, conversations, calls } = data;
  // v7: files per message (portal uploads have no message of their own: they go with the description).
  const files = data.attachments ?? [];
  const filesOf = (convId: number | null) => files.filter((a) => (convId === null ? a.conversationId === null && a.channel === 'portal' : a.conversationId === convId));
  // Tickets created from email already carry the first message as an INCOMING conversation.
  const showDescription = !conversations.some((c) => c.kind === 'INCOMING') && t.description;
  // Messages and phone calls in one timeline.
  const entries = [
    ...conversations.map((c) => ({ at: c.createdAt, key: `m${c.id}`, c, call: null as CallLog | null })),
    ...(calls ?? []).map((call) => ({ at: call.createdAt, key: `c${call.id}`, c: null as Conversation | null, call })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const incomingWho = (c: Conversation) =>
    c.channel === 'whatsapp' || !c.fromEmail || c.fromEmail === t.requesterEmail ? t.requesterName : c.fromEmail;
  const sentTo = (c: Conversation) =>
    c.channel === 'whatsapp' ? `WhatsApp to ${t.requesterMobile ?? t.requesterPhone ?? 'the requester'}` : [c.toEmails.length ? `To ${c.toEmails.join(', ')}` : '', c.ccEmails.length ? `Cc ${c.ccEmails.join(', ')}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="space-y-3">
      {showDescription && (
        <Message kind="INCOMING" who={t.requesterName} sub={[t.requesterEmail ?? t.requesterPhone ?? '', t.source === 'Portal' ? 'via portal' : ''].filter(Boolean).join(' · ')} at={t.createdAt} html={t.description} footer={<Paperclips files={filesOf(null)} ticketId={t.id} />} />
      )}
      {entries.map((e) => (e.call ? <CallEntry key={e.key} call={e.call} /> : e.c && (
        <Message
          key={e.key}
          kind={e.c.kind}
          whatsapp={e.c.channel === 'whatsapp'}
          who={e.c.kind === 'INCOMING' ? incomingWho(e.c) : e.c.agentName ?? 'Samadhan automation'}
          sub={e.c.kind === 'INCOMING' ? e.c.fromPhone ?? e.c.fromEmail ?? '' : sentTo(e.c)}
          at={e.c.createdAt}
          html={e.c.bodyHtml}
          footer={<Paperclips files={filesOf(e.c.id)} ticketId={t.id} />}
        />
      )))}
      {!showDescription && entries.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
    </div>
  );
}

function CallEntry({ call }: { call: CallLog }) {
  const Icon = call.direction === 'INBOUND' ? PhoneIncoming : PhoneOutgoing;
  const tone = call.outcome === 'Connected' ? 'good' : 'warn';
  return (
    <article className="rounded-2xl border border-line bg-sunken/60 px-4 py-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-panel text-accent"><Icon size={14} /></span>
        <div className="min-w-0 flex-1 text-[13px]">
          <span className="font-semibold">{call.agentName}</span>
          <span className="text-muted"> · {call.direction === 'INBOUND' ? 'call from' : 'call to'} {call.phone}</span>
        </div>
        <Pill tone={tone}>{call.outcome}</Pill>
        {call.durationSecs > 0 && <span className="num text-2xs text-muted">{fmtSecs(call.durationSecs)}</span>}
        <time className="num text-2xs text-muted">{fmtDateTime(call.createdAt)}</time>
      </header>
      {call.notes && <p className="mt-2 whitespace-pre-wrap text-[13px] text-ink/90">{call.notes}</p>}
    </article>
  );
}

function Message({ kind, who, sub, at, html, whatsapp, footer }: { kind: Conversation['kind']; who: string; sub: string; at: string; html: string; whatsapp?: boolean; footer?: ReactNode }) {
  const s = KIND_STYLE[kind];
  const [loadImages, setLoadImages] = useState(false);
  const clean = useMemo(() => safeHtml(html, loadImages), [html, loadImages]);
  return (
    <article className={cx('rounded-2xl border p-4 shadow-card', s.box)}>
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Avatar email={who} name={who} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="truncate">{who}</span>
            <Pill tone={kind === 'NOTE' ? 'warn' : kind === 'REPLY' ? 'accent' : 'neutral'}><s.icon size={10} /> {s.label}</Pill>
            {whatsapp && <Pill tone="good"><MessageCircle size={10} /> WhatsApp</Pill>}
          </div>
          {sub && <div className="truncate text-2xs text-muted">{sub}</div>}
        </div>
        <time className="num text-2xs text-muted" title={fmtDateTime(at)}>{fmtDateTime(at)}</time>
      </header>
      {clean.blockedImages > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-1.5 text-2xs text-muted">
          {clean.blockedImages} remote image{clean.blockedImages > 1 ? 's' : ''} hidden to protect your privacy.
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setLoadImages(true)}>Show images</button>
        </div>
      )}
      <div className="mail-body" dangerouslySetInnerHTML={{ __html: clean.html }} />
      {footer}
    </article>
  );
}

function Composer({ ticket: t, reload, onTyping }: Props & { reload: () => Promise<void>; onTyping: (typing: boolean) => void }) {
  const { me, meta, mailEnabled, whatsappEnabled, attachments, can } = useSamadhan();
  const lim = attachments?.limits;
  const withFiles = Boolean(attachments?.enabled) && can('attachment.upload');
  const tray = usePendingFiles(lim?.agent.perFileMb ?? 10, lim?.agent.filesPerAction ?? 10);
  const viaWhatsApp = t.source === 'WhatsApp' && Boolean(t.requesterMobile || t.requesterPhone);
  const [kind, setKind] = useState<'REPLY' | 'NOTE' | 'FORWARD'>('REPLY');
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusAfter, setStatusAfter] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // Collision detection: the others see "replying" while there is text in the box.
  const typing = text.trim().length > 0;
  useEffect(() => { onTyping(typing); }, [typing, onTyping]);
  // v7: only the responses for this ticket's desk (and the ones for every desk).
  const deskCanned = useMemo(() => meta.cannedResponses.filter((c) => c.workspaceId == null || c.workspaceId === t.workspaceId), [meta.cannedResponses, t.workspaceId]);
  // "My responses" (private to me) first, then the shared folders.
  const folders = useMemo(() => {
    const m = new Map<string, typeof deskCanned>();
    for (const c of deskCanned) {
      const folder = c.ownerAgentId ? `My responses · ${c.folder}` : c.folder;
      m.set(folder, [...(m.get(folder) ?? []), c]);
    }
    return [...m.entries()];
  }, [deskCanned]);

  const insert = (body: string, replaceFrom?: number) => {
    const el = area.current;
    const plain = fillCanned(htmlToText(body), t, me.name);
    if (!el) return setText((x) => x + plain);
    const start = replaceFrom ?? el.selectionStart;
    const end = el.selectionEnd;
    const next = text.slice(0, start) + plain + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + plain.length;
    });
  };

  // "Use in reply" from the Assist card: switch to Reply and put the draft in the box for the agent to edit.
  useEffect(() => {
    const onInsert = (e: Event) => {
      const draft = (e as CustomEvent<string>).detail;
      if (typeof draft !== 'string') return;
      setKind('REPLY');
      setText(draft);
      requestAnimationFrame(() => { area.current?.focus(); area.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    };
    window.addEventListener(INSERT_REPLY_EVENT, onInsert);
    return () => window.removeEventListener(INSERT_REPLY_EVENT, onInsert);
  }, []);

  // "/code" + Tab expands a canned response.
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    const el = e.currentTarget;
    const before = text.slice(0, el.selectionStart);
    const m = /(?:^|\s)\/([a-z0-9_-]{1,30})$/i.exec(before);
    if (!m) return;
    // My own short code wins over a shared one with the same code.
    const code = m[1].toLowerCase();
    const canned = deskCanned.find((c) => c.ownerAgentId && c.shortCode?.toLowerCase() === code)
      ?? deskCanned.find((c) => c.shortCode?.toLowerCase() === code);
    if (!canned) return;
    e.preventDefault();
    insert(canned.body, el.selectionStart - m[1].length - 1);
  };

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      // v7: files go up first; the message then carries their ids (they are linked to it on the server).
      let attachmentIds: number[] = [];
      if (withFiles && tray.ready.length) {
        const up = await uploadPending(t.id, tray.ready);
        if (up.errors.length) throw new Error(`Nothing was sent - ${up.errors.join(' · ')}`);
        attachmentIds = up.saved.map((a) => a.id);
      }
      const delivery = await addMessage(t.id, { kind, text, attachmentIds, ...(statusAfter ? { statusAfter: Number(statusAfter) } : {}), ...(kind === 'FORWARD' ? { to, cc } : kind === 'REPLY' && cc && !viaWhatsApp ? { cc } : {}) });
      setStatusAfter('');
      setText('');
      tray.clear();
      setTo('');
      setCc('');
      if (delivery) {
        setMsg(delivery.sent ? { tone: 'good', text: 'Reply sent on WhatsApp.' } : { tone: 'bad', text: `Reply saved on the ticket but not sent on WhatsApp: ${delivery.reason ?? 'unknown reason'}.` });
      } else {
        setMsg({ tone: 'good', text: kind === 'NOTE' ? 'Note added.' : kind === 'REPLY' ? (mailEnabled ? 'Reply sent.' : 'Reply saved (mail is switched off on the server, so no email went out).') : 'Forwarded.' });
      }
      await reload();
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not send.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <Tabs
          label="Message type"
          value={kind}
          onChange={setKind}
          tabs={[
            { id: 'REPLY', label: <span className="inline-flex items-center gap-1"><Reply size={12} /> Reply</span> },
            { id: 'NOTE', label: <span className="inline-flex items-center gap-1"><Lock size={12} /> Private note</span> },
            { id: 'FORWARD', label: <span className="inline-flex items-center gap-1"><Forward size={12} /> Forward</span> },
          ]}
        />
      }
      actions={
        <div className="flex items-center gap-1.5">
        <MyCannedButton />
        <InsertArticleButton onInsert={(body) => insert(body)} />
        {deskCanned.length > 0 && (
          <select
            aria-label="Insert canned response"
            value=""
            onChange={(e) => { const c = deskCanned.find((x) => String(x.id) === e.target.value); if (c) insert(c.body); }}
            className={cx('h-8 max-w-[220px] text-xs', inputBase)}
          >
            <option value="">Canned responses…</option>
            {folders.map(([folder, list]) => (
              <optgroup key={folder} label={folder}>
                {list.map((c) => <option key={c.id} value={c.id}>{c.title}{c.shortCode ? ` (/${c.shortCode})` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        </div>
      }
    >
      <div className="space-y-2">
        {kind === 'REPLY' && viaWhatsApp && (
          <p className="flex items-center gap-1 text-2xs text-muted">
            <MessageCircle size={12} className="text-good" /> On WhatsApp to {t.requesterMobile || t.requesterPhone}
            {!whatsappEnabled && <em> - WhatsApp is switched off on the server, so the reply is saved on the ticket only</em>}
            {whatsappEnabled && <span> · WhatsApp only accepts free text within 24 hours of the requester&apos;s last message</span>}
          </p>
        )}
        {kind === 'REPLY' && !viaWhatsApp && <p className="text-2xs text-muted">To {t.requesterEmail ?? <em>no email on file - the reply is recorded on the ticket only</em>} · your signature is added automatically.</p>}
        {kind === 'FORWARD' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="To" required><input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@emamigroup.com, ..." /></Field>
            <Field label="Cc"><input className={inputCls} value={cc} onChange={(e) => setCc(e.target.value)} /></Field>
          </div>
        )}
        {kind === 'REPLY' && !viaWhatsApp && <input className={inputCls} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc (optional)" aria-label="Cc" />}
        <textarea
          ref={area}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={withFiles && !viaWhatsApp ? tray.onPaste : undefined}
          placeholder={kind === 'NOTE' ? 'Only agents see private notes.' : 'Write your message. Type /code then Tab to insert a canned response.'}
          className={cx(textareaCls, kind === 'NOTE' && 'bg-[#FFFBEF]')}
          aria-label="Message"
        />
        {withFiles && !viaWhatsApp && (
          <FileTray files={tray} maxFiles={lim?.agent.filesPerAction ?? 10} compact testId="composer-files"
            hint={kind !== 'NOTE' && lim && tray.ready.reduce((n, p) => n + sizeOf(p), 0) > lim.outboundMb * 1048576
              ? `Over ${lim.outboundMb} MB together: the email will carry a sign-in link instead of the files.`
              : `or drop / paste a screenshot · max ${lim?.agent.perFileMb ?? 10} MB each`} />
        )}
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select aria-label="Then set status" value={statusAfter} onChange={(e) => setStatusAfter(e.target.value)} className={cx('h-9 max-w-[240px] text-xs', inputBase)} title="Change the status in the same step (required fields are checked first)">
            <option value="">Keep status ({t.statusName})</option>
            {meta.statuses.filter((s) => s.id !== t.statusId).map((s) => <option key={s.id} value={s.id}>Then set: {s.name}</option>)}
          </select>
          <Button variant="primary" onClick={send} disabled={busy || !text.trim() || (kind === 'FORWARD' && !to.trim())}>
            {busy ? <Spinner /> : kind === 'NOTE' ? <MessageSquare size={14} /> : <Send size={14} />} {kind === 'NOTE' ? 'Add note' : kind === 'REPLY' ? 'Send reply' : 'Forward'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Properties({ ticket: t, reload }: Props & { reload: () => Promise<void> }) {
  const { meta, can } = useSamadhan();
  const original = useMemo(() => toForm(t), [t]);
  const [form, setForm] = useState<Editable>(original);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  useEffect(() => setForm(original), [original]);

  const changed = (Object.keys(form) as (keyof Editable)[]).filter((k) => (form[k] ?? '') !== (original[k] ?? ''));
  const set = (patch: Partial<Editable>) => setForm((f) => ({ ...f, ...patch } as Editable));

  const save = async () => {
    const patch: Record<string, unknown> = {};
    // Changing the application to one in another service desk moves the ticket (and its reference).
    if (changed.includes('applicationId')) {
      const target = appById(meta, Number(form.applicationId));
      if (target && target.workspaceId !== t.workspaceId && !window.confirm(`${target.name} is in another service desk. Move the ticket there? Its reference becomes ${target.code}-${t.id}.`)) return;
    }
    for (const k of changed) {
      const v = form[k] ?? '';
      if (k === 'statusId' || k === 'priority' || k === 'applicationId') patch[k] = Number(v);
      else if (k === 'groupId' || k === 'agentId' || k === 'impact' || k === 'urgency') patch[k] = v ? Number(v) : null;
      else if (k === 'tags') patch.tags = v.split(',').map((x) => x.trim()).filter(Boolean);
      else patch[k] = v;
    }
    setBusy(true);
    setMsg(null);
    try {
      // The version this form was loaded from: the server refuses the save if someone changed the ticket since.
      await updateTicket(t.id, { ...patch, expectedUpdatedAt: t.updatedAt });
      setMsg({ tone: 'good', text: 'Saved.' });
      await reload();
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  const groupAgents = meta.agents.filter((a) => a.active);
  // v7 Phase 3: the workspace follows the application chosen in this form.
  const wsId = appById(meta, Number(form.applicationId))?.workspaceId ?? t.workspaceId ?? null;
  const ws = workspaceById(meta, wsId);
  const matrix = usesImpactUrgency(meta, wsId);
  const fromMatrix = matrixPriority(meta, wsId, Number(form.impact) || null, Number(form.urgency) || null);
  const hasApps = (meta.applications?.length ?? 0) > 0;
  return (
    <Card title="Properties" sub={matrix ? 'Priority follows Impact × Urgency' : 'Severity and priority follow Category → Function'} actions={changed.length > 0 && <Pill tone="warn">{changed.length} unsaved</Pill>}>
      <div className="space-y-3">
        {hasApps && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Application" className="col-span-2" hint={ws && t.workspaceId !== ws.id ? `Moves the ticket to ${ws.name}` : undefined}>
              <select className={cx('h-9 w-full', inputBase)} value={form.applicationId} disabled={!can('ticket.changeApplication')} onChange={(e) => set({ applicationId: e.target.value })} data-testid="prop-application">
                {appOptions(meta, true).filter((o) => o.value === form.applicationId || appById(meta, Number(o.value))?.available).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Record class">
              <select className={cx('h-9 w-full', inputBase)} value={form.recordClass} onChange={(e) => set({ recordClass: e.target.value })}>
                {(meta.recordClasses ?? []).map((c) => <option key={c} value={c}>{RECORD_CLASS_LABEL[c] ?? c}</option>)}
              </select>
            </Field>
            {matrix && (
              <>
                <Field label="Impact">
                  <select className={cx('h-9 w-full', inputBase)} value={form.impact} onChange={(e) => set({ impact: e.target.value })}>
                    <option value="">—</option>
                    {Object.entries(meta.impacts ?? {}).map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}
                  </select>
                </Field>
                <Field label="Urgency" hint={fromMatrix ? `Priority: ${meta.priorities[fromMatrix]}` : undefined}>
                  <select className={cx('h-9 w-full', inputBase)} value={form.urgency} onChange={(e) => set({ urgency: e.target.value })}>
                    <option value="">—</option>
                    {Object.entries(meta.urgencies ?? {}).map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}
                  </select>
                </Field>
              </>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select className={cx('h-9 w-full', inputBase)} value={form.statusId} onChange={(e) => set({ statusId: e.target.value })}>
              {statusesFor(meta, wsId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={cx('h-9 w-full', inputBase)} value={form.priority} disabled={!can('ticket.overridePriority')} onChange={(e) => set({ priority: e.target.value })}>
              {Object.entries(meta.priorities).reverse().map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Group">
            <select className={cx('h-9 w-full', inputBase)} value={form.groupId} onChange={(e) => set({ groupId: e.target.value })}>
              <option value="">—</option>
              {groupsFor(meta, wsId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="Agent">
            <select className={cx('h-9 w-full', inputBase)} value={form.agentId} onChange={(e) => set({ agentId: e.target.value })}>
              <option value="">Unassigned</option>
              {groupAgents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.availability !== 'AVAILABLE' ? ` (${meta.agentStatuses[a.availability]})` : ''}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Tags" hint="Comma separated"><input className={inputCls} value={form.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
        <TicketFields compact values={form} onChange={(p) => set(p as Partial<Editable>)} workspaceKey={ws?.key} />
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        <div className="sticky bottom-0 flex gap-2 bg-panel pt-1">
          <Button variant="primary" className="flex-1" onClick={save} disabled={busy || changed.length === 0}>{busy ? <Spinner /> : <Save size={14} />} Save changes</Button>
          {changed.length > 0 && <Button onClick={() => setForm(original)}>Reset</Button>}
        </div>
        <p className="text-2xs text-faint">Fields marked * must be filled before a ticket can be resolved.</p>
      </div>
    </Card>
  );
}

function Requester({ data, reload }: { data: TicketDetail; reload: () => Promise<void> }) {
  const { meta, openTicket } = useSamadhan();
  const t = data.ticket;
  return (
    <Card title="Requester">
      <div className="space-y-1.5 text-[13px]">
        <div className="flex items-center gap-2 font-semibold"><User size={14} className="text-accent" /> {t.requesterName}</div>
        {t.requesterEmail && <div className="flex items-center gap-2 text-muted"><Mail size={14} /> {t.requesterEmail}</div>}
      </div>
      <CallPanel ticket={t} reload={reload} />
      {data.requesterTickets.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Other tickets</div>
          <ul className="space-y-1">
            {data.requesterTickets.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => openTicket(o.id)} className="w-full rounded-lg px-1.5 py-1 text-left hover:bg-sunken">
                  <div className="truncate text-xs font-semibold"><span className="num text-muted">{refOf(meta, o)}</span> {o.subject}</div>
                  <div className="text-2xs text-muted">{o.statusName} · {relative(o.createdAt)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function TimeLogs({ data, reload }: { data: TicketDetail; reload: () => Promise<void> }) {
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const total = data.timeLogs.reduce((a, l) => a + l.minutes, 0);
  const add = async () => {
    try {
      await addTimeLog(data.ticket.id, Number(minutes), note);
      setMinutes('');
      setNote('');
      setError('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log time.');
    }
  };
  return (
    <Card title="Time spent" sub={total ? `${fmtMins(total)} logged` : 'Nothing logged yet'} actions={<Clock size={14} className="text-muted" />}>
      <div className="flex gap-1.5">
        <input className={cx(inputCls, 'w-20')} type="number" min={1} max={1440} placeholder="Min" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" />
        <input className={inputCls} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        <Button onClick={add} disabled={!minutes}>Log</Button>
      </div>
      {error && <div className="mt-2"><Notice onClose={() => setError('')}>{error}</Notice></div>}
      {data.timeLogs.length > 0 && (
        <ul className="mt-2 space-y-1 text-2xs">
          {data.timeLogs.map((l) => (
            <li key={l.id} className="flex gap-2"><span className="num w-14 font-bold">{fmtMins(l.minutes)}</span><span className="min-w-0 flex-1 truncate text-muted">{l.agentName}{l.note ? ` · ${l.note}` : ''}</span><span className="text-faint">{relative(l.createdAt)}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const FIELD_LABEL: Record<string, string> = {
  statusId: 'Status', priority: 'Priority', groupId: 'Group', agentId: 'Agent', subject: 'Subject', tags: 'Tags',
  severity: 'Severity', callSubject: 'Call subject', distributorCode: 'Distributor code', distributorName: 'Distributor name',
  salesOrg: 'Sales org', asmName: 'ASM', depotCoordinator: 'Depot co-ordinator', mrUid: 'MR UID', mobileNo: 'Mobile',
  alternateMobileNo: 'Alternate mobile', callerName: 'Caller', callerContactNumber: 'Caller number', l2Agent: 'L2 agent',
  helpdeskAnalysis: 'HelpDesk analysis', rcaSolution: 'RCA / solution',
};

function ActivityLog({ items }: { items: ActivityItem[] }) {
  const { meta } = useSamadhan();
  const name = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'statusId') return meta.statuses.find((s) => s.id === v)?.name ?? String(v);
    if (field === 'priority') return meta.priorities[String(v)] ?? String(v);
    if (field === 'groupId') return meta.groups.find((g) => g.id === v)?.name ?? String(v);
    if (field === 'agentId') return meta.agents.find((a) => a.id === v)?.name ?? String(v);
    if (Array.isArray(v)) return v.join(', ') || '—';
    const s = String(v);
    return s.length > 60 ? `${s.slice(0, 60)}…` : s;
  };
  const describe = (a: ActivityItem): string => {
    const d = a.details ?? {};
    if (a.action === 'updated') {
      return Object.entries(d).map(([k, ch]) => {
        const c = ch as { from?: unknown; to?: unknown };
        return `${FIELD_LABEL[k] ?? k}: ${name(k, c.from)} → ${name(k, c.to)}`;
      }).join('; ');
    }
    if (a.action === 'created') return `Source ${String(d.source ?? '')}, severity ${String(d.severity ?? '').toLowerCase()}`;
    if (a.action === 'automation') return `${String(d.rule ?? '')}${d.skipped ? ` (skipped: ${String(d.skipped)})` : ''}`;
    if (a.action === 'email_sent') return `${String(d.template ?? '')} to ${String(d.to ?? '')}`;
    if (a.action === 'message') return `${({ REPLY: 'Reply', NOTE: 'Private note', FORWARD: 'Forward' } as Record<string, string>)[String(d.kind)] ?? String(d.kind)}${d.channel === 'whatsapp' ? ' on WhatsApp' : ''}`;
    if (a.action === 'requester_replied') return d.channel === 'whatsapp' ? 'On WhatsApp' : 'By email';
    if (a.action === 'call_logged') return `${d.direction === 'INBOUND' ? 'Call from requester' : 'Call to requester'} - ${String(d.outcome ?? '')}${d.minutes ? `, ${String(d.minutes)} min` : ''}`;
    if (a.action === 'whatsapp_failed') return String(d.reason ?? '');
    if (["linked", "unlinked", "merged_into", "merged_from", "child_of", "child_added"].includes(a.action)) return `#${String(d.ticket ?? '')}`;
    if (a.action === 'scenario') return String(d.name ?? '');
    if (a.action === 'csat_received') return ({ 3: 'Extremely satisfied', 2: 'Neither satisfied nor dissatisfied', 1: 'Extremely dissatisfied' } as Record<string, string>)[String(d.rating)] ?? '';
    if (a.action === 'whatsapp_sent') return 'Delivered to WhatsApp';
    return JSON.stringify(d);
  };
  return (
    <Card title="Activity" sub="Every change, automation and email on this ticket">
      {items.length === 0 ? (
        <p className="text-sm text-muted">No activity yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex gap-2.5 text-xs">
              <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg', a.action === 'automation' ? 'bg-warn/10 text-warn' : 'bg-sunken text-accent')}>
                {a.action === 'automation' ? <Zap size={12} /> : a.action === 'email_sent' ? <Mail size={12} /> : a.action === 'call_logged' ? <Phone size={12} /> : a.action.startsWith('whatsapp') ? <MessageCircle size={12} /> : <ArrowRightLeft size={12} />}
              </span>
              <div className="min-w-0 flex-1">
                <div><span className="font-semibold">{a.actorName ?? 'Samadhan'}</span> <span className="text-muted">· {ACTION_LABEL[a.action] ?? a.action}</span></div>
                <div className="break-words text-muted">{describe(a)}</div>
              </div>
              <time className="num shrink-0 text-2xs text-faint" title={fmtDateTime(a.createdAt)}>{relative(a.createdAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
