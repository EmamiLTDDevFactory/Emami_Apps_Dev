'use client';
import { useEffect, useState } from 'react';
import { PlusCircle, UserSearch } from 'lucide-react';
import { createTicket, searchContacts } from '@/lib/api';
import type { ContactMatch } from '@/lib/types';
import { useSamadhan, type NewTicketPreset } from '@/lib/context';
import TicketFields, { type Values } from './TicketFields';
import { Button, Card, Field, Notice, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';
import { FileTray, uploadPending, usePendingFiles } from './Attachments';

const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;
const EMPTY_TOP = { requesterName: '', requesterEmail: '', requesterPhone: '', subject: '', description: '', source: 'Phone', statusId: '2', groupId: '', agentId: '', priority: '', tags: '' };

// Top-of-form keys a preset can fill; everything else in a preset is a ticket field (TicketFields values).
const TOP_KEYS = Object.keys(EMPTY_TOP);

export default function NewTicket({ preset }: { preset?: NewTicketPreset }) {
  const { meta, openTicket, attachments, can } = useSamadhan();
  const withFiles = Boolean(attachments?.enabled) && can('attachment.upload');
  const tray = usePendingFiles(attachments?.limits.agent.perFileMb ?? 10, attachments?.limits.agent.filesPerAction ?? 10);
  const parentId = preset?.parentId;
  const [top, setTop] = useState({ ...EMPTY_TOP, ...Object.fromEntries(Object.entries(preset ?? {}).filter(([k, v]) => TOP_KEYS.includes(k) && typeof v === 'string')) });
  const [fields, setFields] = useState<Values>(Object.fromEntries(Object.entries(preset ?? {}).filter(([k, v]) => !TOP_KEYS.includes(k) && k !== 'parentId' && typeof v === 'string' && v)) as Values);
  const [another, setAnother] = useState(false);
  const [notify, setNotify] = useState(true);
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [lookup, setLookup] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const set = (p: Partial<typeof EMPTY_TOP>) => setTop((t) => ({ ...t, ...p }));
  const emailOk = EMAIL_RE.test(top.requesterEmail.trim());

  // Find the requester by name, email or phone (people who wrote in before), as the agent types.
  useEffect(() => {
    const q = lookup.trim();
    if (q.length < 2) { setMatches([]); return; }
    const id = setTimeout(() => { searchContacts(q).then(setMatches).catch(() => setMatches([])); }, 300);
    return () => clearTimeout(id);
  }, [lookup]);
  const pick = (c: ContactMatch) => {
    set({ requesterName: c.name, requesterEmail: c.email ?? '', requesterPhone: c.mobile || c.phone || '' });
    setMatches([]);
    setLookup('');
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        ...fields,
        requesterName: top.requesterName,
        requesterEmail: top.requesterEmail,
        requesterPhone: top.requesterPhone,
        subject: top.subject,
        description: top.description,
        source: top.source,
        statusId: Number(top.statusId),
        notifyRequester: notify,
        tags: top.tags.split(',').map((x) => x.trim()).filter(Boolean),
      };
      if (parentId) body.parentId = parentId;
      if (top.groupId) body.groupId = Number(top.groupId);
      if (top.agentId) body.agentId = Number(top.agentId);
      if (top.priority) body.priority = Number(top.priority);
      const t = await createTicket(body);
      // v7: files go up once the ticket exists; a failed file never loses the ticket.
      let fileErrors: string[] = [];
      if (withFiles && tray.ready.length) fileErrors = (await uploadPending(t.id, tray.ready)).errors;
      tray.clear();
      if (fileErrors.length) {
        setMsg({ tone: 'bad', text: `Ticket #${t.id} created, but some files were not added: ${fileErrors.join(' · ')}` });
        if (!another) setTimeout(() => openTicket(t.id), 2500);
        return;
      }
      if (another) {
        // Keep the requester and distributor details for the next call from the same person.
        setTop((x) => ({ ...EMPTY_TOP, requesterName: x.requesterName, requesterEmail: x.requesterEmail, requesterPhone: x.requesterPhone, source: x.source }));
        setMsg({ tone: 'good', text: `Ticket #${t.id} created. Log the next one below.` });
      } else {
        openTicket(t.id);
      }
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not create the ticket.' });
    } finally {
      setBusy(false);
    }
  };

  const sel = cx('h-9 w-full', inputBase);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{parentId ? `New child ticket of #${parentId}` : 'New ticket'}</h2>
        <p className="text-sm text-muted">Log a ticket on a requester&apos;s behalf (call, walk-in, message). Their email is needed: replies and updates go there. Email, portal and WhatsApp tickets arrive on their own.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card title="Requester and issue">
            <div className="relative mb-3">
              <UserSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input className={cx(inputCls, 'pl-8')} value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Find an existing requester by name, email or phone" aria-label="Find requester" />
              {matches.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => pick(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-sunken">
                        <span className="font-semibold">{c.name}</span>
                        <span className="min-w-0 flex-1 truncate text-2xs text-muted">{[c.email, c.mobile || c.phone].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Requester name" required><input className={inputCls} value={top.requesterName} onChange={(e) => set({ requesterName: e.target.value })} /></Field>
              <Field label="Email" required hint={top.requesterEmail && !emailOk ? <span className="text-bad">Not a valid email</span> : undefined}>
                <input className={inputCls} type="email" value={top.requesterEmail} onChange={(e) => set({ requesterEmail: e.target.value })} />
              </Field>
              <Field label="Phone"><input className={inputCls} value={top.requesterPhone} onChange={(e) => set({ requesterPhone: e.target.value })} /></Field>
            </div>
            <div className="mt-3 space-y-3">
              <Field label="Subject" required><input className={inputCls} value={top.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
              <Field label="Description"><textarea rows={5} className={textareaCls} value={top.description} onChange={(e) => set({ description: e.target.value })} onPaste={withFiles ? tray.onPaste : undefined} /></Field>
              {withFiles && <FileTray files={tray} maxFiles={attachments?.limits.agent.filesPerAction ?? 10} />}
            </div>
          </Card>
          <Card title="Ticket details" sub="Category → Function sets severity and priority. Required fields (*) can be completed before resolving.">
            <TicketFields values={fields} onChange={(p) => setFields((f) => ({ ...f, ...p }))} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Routing">
            <div className="space-y-3">
              <Field label="Source">
                <select className={sel} value={top.source} onChange={(e) => set({ source: e.target.value })}>
                  {meta.sources.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={sel} value={top.statusId} onChange={(e) => set({ statusId: e.target.value })}>
                  {meta.statuses.filter((s) => !s.isClosed).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Group" hint="Empty = routed by the automation rules">
                <select className={sel} value={top.groupId} onChange={(e) => set({ groupId: e.target.value })}>
                  <option value="">Automatic</option>
                  {meta.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Field label="Agent" hint="Empty = round robin where the group uses it">
                <select className={sel} value={top.agentId} onChange={(e) => set({ agentId: e.target.value })}>
                  <option value="">Automatic</option>
                  {meta.agents.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Priority" hint="Empty = from the severity matrix">
                <select className={sel} value={top.priority} onChange={(e) => set({ priority: e.target.value })}>
                  <option value="">From severity</option>
                  {Object.entries(meta.priorities).reverse().map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Tags" hint="Comma separated"><input className={inputCls} value={top.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
            </div>
          </Card>
          {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Email the requester their ticket number
          </label>
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Create another after this one
          </label>
          <Button variant="primary" className="w-full" onClick={submit} disabled={busy || !top.subject.trim() || !top.requesterName.trim() || !emailOk}>
            {busy ? <Spinner /> : <PlusCircle size={14} />} Create ticket
          </Button>
        </div>
      </div>
    </div>
  );
}
