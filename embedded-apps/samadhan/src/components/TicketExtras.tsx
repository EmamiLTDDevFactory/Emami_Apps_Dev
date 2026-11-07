'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckSquare, ChevronLeft, ChevronRight, Eye, EyeOff, GitBranch, Link2, ListTodo, Merge, MoreHorizontal, Plus, Printer, RotateCcw, ShieldAlert, Smile, Square, Trash2, Users, Wand2, X } from 'lucide-react';
import { addTodo, bulkTickets, deleteTodo, linkTickets, mergeTickets, reportPresence, runScenario, updateTodo, watchTicket } from '@/lib/api';
import { refOf } from '@/lib/workspaces';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime, relative } from '@/lib/format';
import type { PresenceAgent, RelatedTicket, Ticket, TicketDetail } from '@/lib/types';
import { Button, Card, Field, Modal, Notice, Pill, cx, inputCls } from './ui';

type Reload = () => Promise<void>;

/** Fills canned-response placeholders from the ticket (both Samadhan's {{ticket.x}} and the Freshdesk-style short forms). */
export function fillCanned(text: string, t: Ticket, agentName: string): string {
  const v: Record<string, string> = {
    'ticket.requester.name': t.requesterName, requester: t.requesterName, 'ticket.id': String(t.id), id: String(t.id),
    'ticket.subject': t.subject, 'ticket.agent.name': agentName, 'ticket.distributor.code': t.distributorCode ?? '', distributorCode: t.distributorCode ?? '',
    'ticket.distributor.name': t.distributorName ?? '', distributorName: t.distributorName ?? '', helpdesk_name: 'Emami Service Desk',
  };
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k: string) => v[k] ?? m);
}

/** Watch, previous / next in the list the agent came from, scenarios and the More menu (merge, link, child, print, spam, trash). */
export function TicketToolbar({ data, reload }: { data: TicketDetail; reload: Reload }) {
  const { ticket: t } = data;
  const { meta, openTicket, listIds, newTicket, go } = useSamadhan();
  const [menu, setMenu] = useState<'scenarios' | 'more' | null>(null);
  const [dialog, setDialog] = useState<'merge' | 'link' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const i = listIds.indexOf(t.id);
  const prev = i > 0 ? listIds[i - 1] : null;
  const next = i >= 0 && i < listIds.length - 1 ? listIds[i + 1] : null;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMenu(null);
    setBusy(true);
    setMsg(null);
    try { await fn(); setMsg({ tone: 'good', text: ok }); await reload(); } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not do that.' }); } finally { setBusy(false); }
  };

  // Keyboard: w watch, j / k next / previous (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      if (e.key === 'j' && next) openTicket(next);
      if (e.key === 'k' && prev) openTicket(prev);
      if (e.key === 'w') act(() => watchTicket(t.id, !data.watching), data.watching ? 'You stopped watching this ticket.' : 'Watching - you will hear about requester replies.');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const child = () => {
    setMenu(null);
    newTicket({
      parentId: t.id, requesterName: t.requesterName, requesterEmail: t.requesterEmail ?? '', requesterPhone: t.requesterMobile ?? t.requesterPhone ?? '',
      subject: `${t.subject} - `, source: t.source === 'WhatsApp' || t.source === 'Portal' ? 'Phone' : t.source,
      region: t.region ?? '', distributorCode: t.distributorCode ?? '', distributorName: t.distributorName ?? '', salesOrg: t.salesOrg ?? '', state: t.state ?? '',
      depot: t.depot ?? '', asmName: t.asmName ?? '', depotCoordinator: t.depotCoordinator ?? '', type: t.type ?? '',
    });
  };
  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-sunken disabled:opacity-40';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" disabled={busy} onClick={() => act(() => watchTicket(t.id, !data.watching), data.watching ? 'You stopped watching this ticket.' : 'Watching - you will hear about requester replies.')} title="Watch (w)">
          {data.watching ? <EyeOff size={13} /> : <Eye size={13} />} {data.watching ? 'Unwatch' : 'Watch'}
        </Button>
        {data.watchers.length > 0 && <span className="text-2xs text-muted" title={data.watchers.map((w) => w.name).join(', ')}><Users size={12} className="mr-0.5 inline" />{data.watchers.length} watching</span>}
        <div className="relative">
          <Button size="sm" disabled={busy || !meta.scenarios.length} onClick={() => setMenu(menu === 'scenarios' ? null : 'scenarios')} title={meta.scenarios.length ? 'Run a set of actions in one click' : 'No scenarios yet (Admin > Scenarios)'}><Wand2 size={13} /> Scenarios</Button>
          {menu === 'scenarios' && (
            <Menu onClose={() => setMenu(null)}>
              {meta.scenarios.map((s) => (
                <button key={s.id} type="button" className={cx(item, 'flex-col items-start gap-0')} onClick={() => act(() => runScenario(t.id, s.id), `Scenario "${s.name}" done.`)}>
                  <span>{s.name}</span>{s.description && <span className="text-2xs font-normal text-muted">{s.description}</span>}
                </button>
              ))}
            </Menu>
          )}
        </div>
        <div className="relative">
          <Button size="sm" disabled={busy} onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-label="More actions"><MoreHorizontal size={14} /> More</Button>
          {menu === 'more' && (
            <Menu onClose={() => setMenu(null)}>
              <button type="button" className={item} disabled={Boolean(t.mergedIntoId)} onClick={() => { setMenu(null); setDialog('merge'); }}><Merge size={13} /> Merge tickets into this one</button>
              <button type="button" className={item} onClick={() => { setMenu(null); setDialog('link'); }}><Link2 size={13} /> Link tickets</button>
              <button type="button" className={item} disabled={Boolean(t.parentId)} onClick={child} title={t.parentId ? 'A child ticket cannot have children' : ''}><GitBranch size={13} /> Add child ticket</button>
              <button type="button" className={item} onClick={() => { setMenu(null); window.print(); }}><Printer size={13} /> Print</button>
              <div className="my-1 border-t border-line" />
              {t.spam
                ? <button type="button" className={item} onClick={() => act(() => bulkTickets([t.id], 'unspam'), 'Moved out of spam.')}><ShieldAlert size={13} /> Not spam</button>
                : <button type="button" className={item} onClick={() => window.confirm('Mark this ticket as spam? It leaves every list except Spam.') && act(() => bulkTickets([t.id], 'spam'), 'Marked as spam.')}><ShieldAlert size={13} /> Mark as spam</button>}
              {t.deletedAt
                ? <button type="button" className={item} onClick={() => act(() => bulkTickets([t.id], 'restore'), 'Restored from the trash.')}><RotateCcw size={13} /> Restore</button>
                : <button type="button" className={cx(item, 'text-bad')} onClick={() => window.confirm('Move this ticket to the trash?') && act(() => bulkTickets([t.id], 'trash'), 'Moved to the trash.')}><Trash2 size={13} /> Move to trash</button>}
            </Menu>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {listIds.length > 0 && i >= 0 && <span className="num text-2xs text-muted">{i + 1} / {listIds.length}</span>}
          <Button size="sm" variant="ghost" disabled={!prev} onClick={() => prev && openTicket(prev)} aria-label="Previous ticket (k)" title="Previous ticket (k)"><ChevronLeft size={14} /></Button>
          <Button size="sm" variant="ghost" disabled={!next} onClick={() => next && openTicket(next)} aria-label="Next ticket (j)" title="Next ticket (j)"><ChevronRight size={14} /></Button>
          <Button size="sm" variant="ghost" onClick={() => go('tickets')} title="Back to the list">List</Button>
        </div>
      </div>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <NumbersDialog
        open={dialog === 'merge'} onClose={() => setDialog(null)} title={`Merge into #${t.id}`}
        hint="The tickets you list are closed, and their conversations, calls, time logs and watchers move here. Later email replies to them land on this ticket."
        action="Merge" onSubmit={(ids) => act(() => mergeTickets(t.id, ids), `Merged ${ids.map((x) => `#${x}`).join(', ')} into this ticket.`)}
      />
      <NumbersDialog
        open={dialog === 'link'} onClose={() => setDialog(null)} title={`Link to #${t.id}`}
        hint="Linked tickets stay separate but show on each other's screen - use it for the same issue reported by several people."
        action="Link" onSubmit={(ids) => act(() => linkTickets(t.id, ids), `Linked ${ids.map((x) => `#${x}`).join(', ')}.`)}
      />
    </div>
  );
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-line bg-panel p-1.5 shadow-pop">{children}</div>
    </>
  );
}

function NumbersDialog({ open, onClose, title, hint, action, onSubmit }: { open: boolean; onClose: () => void; title: string; hint: string; action: string; onSubmit: (ids: number[]) => void }) {
  const [value, setValue] = useState('');
  useEffect(() => { if (open) setValue(''); }, [open]);
  const ids = [...new Set(value.split(/[\s,#]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">{hint}</p>
        <Field label="Ticket numbers" hint="Separate with commas or spaces"><input autoFocus className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 100123, 100124" /></Field>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ids.length} onClick={() => { onClose(); onSubmit(ids); }}>{action} {ids.length ? `(${ids.length})` : ''}</Button></div>
      </div>
    </Modal>
  );
}

/** Merged / spam / trash notices with the way back. */
export function TicketBanners({ ticket: t, reload }: { ticket: Ticket; reload: Reload }) {
  const { openTicket } = useSamadhan();
  const [error, setError] = useState('');
  const restore = async (action: 'restore' | 'unspam') => {
    try { await bulkTickets([t.id], action); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not restore.'); }
  };
  return (
    <>
      {t.mergedIntoId && (
        <Notice tone="warn">This ticket was merged into <button type="button" className="font-bold underline" onClick={() => openTicket(t.mergedIntoId!)}>#{t.mergedIntoId}</button>. Continue there.</Notice>
      )}
      {t.deletedAt && <Notice tone="warn">In the trash since {fmtDateTime(t.deletedAt)}. <button type="button" className="font-bold underline" onClick={() => restore('restore')}>Restore</button></Notice>}
      {t.spam && !t.deletedAt && <Notice tone="warn">Marked as spam. <button type="button" className="font-bold underline" onClick={() => restore('unspam')}>Not spam</button></Notice>}
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
    </>
  );
}

/**
 * Collision detection: tells the server every 20 s that this agent has the ticket open (viewing or replying) and shows
 * who else does, so two people do not answer the same requester.
 */
export function PresenceBar({ ticketId, replying }: { ticketId: number; replying: boolean }) {
  const [others, setOthers] = useState<PresenceAgent[]>([]);
  const mode: 'viewing' | 'replying' = replying ? 'replying' : 'viewing';
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    let alive = true;
    const ping = () => { if (document.visibilityState === 'visible') reportPresence(ticketId, modeRef.current).then((o) => alive && setOthers(o)).catch(() => {}); };
    ping();
    const id = setInterval(ping, 20_000);
    return () => { alive = false; clearInterval(id); reportPresence(ticketId, 'leave').catch(() => {}); };
  }, [ticketId]);
  // Tell the others promptly when this agent starts or stops typing.
  useEffect(() => { reportPresence(ticketId, mode).then(setOthers).catch(() => {}); }, [ticketId, mode]);
  if (!others.length) return null;
  const replyingNow = others.filter((o) => o.mode === 'replying');
  return (
    <div className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold', replyingNow.length ? 'border-bad/30 bg-bad/5 text-bad' : 'border-accent/25 bg-accent/5 text-accent')}>
      <Users size={14} />
      {replyingNow.length ? `${replyingNow.map((o) => o.name).join(', ')} ${replyingNow.length > 1 ? 'are' : 'is'} replying to this ticket right now.` : `${others.map((o) => o.name).join(', ')} ${others.length > 1 ? 'are' : 'is'} also viewing this ticket.`}
    </div>
  );
}

function RelatedRow({ r, rel, onUnlink }: { r: RelatedTicket; rel: string; onUnlink?: () => void }) {
  const { meta, openTicket } = useSamadhan();
  return (
    <li className="group flex items-center gap-2 py-1.5">
      <button type="button" onClick={() => openTicket(r.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] hover:text-accent">
        <span className="num text-2xs font-bold text-muted">{refOf(meta, r)}</span>
        <span className="truncate">{r.subject}</span>
      </button>
      <span className="shrink-0 text-2xs text-faint">{rel}</span>
      <Pill tone={r.isResolved ? 'good' : 'neutral'}>{r.statusName}</Pill>
      {onUnlink && <button type="button" onClick={onUnlink} className="text-faint opacity-0 hover:text-bad group-hover:opacity-100" aria-label={`Unlink #${r.id}`}><X size={13} /></button>}
    </li>
  );
}

/** Parent, child and linked tickets. */
export function RelatedTickets({ data, reload }: { data: TicketDetail; reload: Reload }) {
  const [error, setError] = useState('');
  if (!data.parent && !data.children.length && !data.links.length) return null;
  const unlink = async (id: number) => {
    try { await linkTickets(data.ticket.id, [id], true); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not unlink.'); }
  };
  const open = data.children.filter((c) => !c.isResolved).length;
  return (
    <Card title="Related tickets" sub={data.children.length ? `${data.children.length} child ticket${data.children.length > 1 ? 's' : ''}${open ? `, ${open} open - resolve them before this one` : ''}` : undefined}>
      <ul className="divide-y divide-line">
        {data.parent && <RelatedRow r={data.parent} rel="parent" />}
        {data.children.map((c) => <RelatedRow key={`c${c.id}`} r={c} rel="child" />)}
        {data.links.map((l) => <RelatedRow key={`l${l.id}`} r={l} rel="linked" onUnlink={() => unlink(l.id)} />)}
      </ul>
      {error && <div className="mt-2"><Notice onClose={() => setError('')}>{error}</Notice></div>}
    </Card>
  );
}

/** The agent's own to-dos for this ticket. */
export function TicketTodos({ data, reload }: { data: TicketDetail; reload: Reload }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } };
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><ListTodo size={15} className="text-accent" /> My to-dos</span>} sub="Only you see these">
      <ul className="space-y-1">
        {data.todos.map((td) => (
          <li key={td.id} className="group flex items-start gap-2 text-[13px]">
            <button type="button" onClick={() => run(() => updateTodo(td.id, { done: !td.done }))} className="mt-0.5 text-muted hover:text-accent" aria-label={td.done ? 'Mark not done' : 'Mark done'}>
              {td.done ? <CheckSquare size={15} className="text-good" /> : <Square size={15} />}
            </button>
            <span className={cx('min-w-0 flex-1', td.done && 'text-faint line-through')}>{td.text}{td.dueAt && <span className={cx('ml-1 text-2xs', !td.done && new Date(td.dueAt) < new Date() ? 'text-bad' : 'text-muted')}>· {relative(td.dueAt)}</span>}</span>
            <button type="button" onClick={() => run(() => deleteTodo(td.id))} className="text-faint opacity-0 hover:text-bad group-hover:opacity-100" aria-label="Delete to-do"><X size={13} /></button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(async () => { await addTodo({ text: text.trim(), ticketId: data.ticket.id, dueAt: due ? new Date(due).toISOString() : null }); setText(''); setDue(''); }); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do" aria-label="New to-do" className={cx(inputCls, 'h-8 text-xs')} />
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due" className={cx(inputCls, 'h-8 w-auto text-xs')} />
        <Button size="sm" type="submit" disabled={!text.trim()} aria-label="Add to-do"><Plus size={13} /></Button>
      </form>
      {error && <div className="mt-2"><Notice onClose={() => setError('')}>{error}</Notice></div>}
    </Card>
  );
}

const CSAT_LABEL = { 3: 'Extremely satisfied', 2: 'Neither satisfied nor dissatisfied', 1: 'Extremely dissatisfied' } as const;

/** The requester's satisfaction rating, once they have answered the survey. */
export function CsatCard({ data }: { data: TicketDetail }) {
  if (!data.csat) return null;
  const c = data.csat;
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Smile size={15} className="text-accent" /> Customer satisfaction</span>}>
      <Pill tone={c.rating === 3 ? 'good' : c.rating === 2 ? 'neutral' : 'bad'}>{CSAT_LABEL[c.rating]}</Pill>
      {c.comment && <p className="mt-2 whitespace-pre-wrap text-[13px]">&ldquo;{c.comment}&rdquo;</p>}
      <p className="mt-1 text-2xs text-muted">{fmtDateTime(c.createdAt)}</p>
    </Card>
  );
}
