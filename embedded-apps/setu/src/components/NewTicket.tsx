'use client';
import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { createTicket } from '@/lib/api';
import { useSetu } from '@/lib/context';
import TicketFields, { type Values } from './TicketFields';
import { Button, Card, Field, Notice, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';

const EMPTY_TOP ={ requesterName: '', requesterEmail: '', requesterPhone: '', subject: '', description: '', source: 'Phone', statusId: '2', groupId: '', agentId: '', priority: '', tags: '' };

export default function NewTicket() {
  const { meta, openTicket } = useSetu();
  const [top, setTop] = useState(EMPTY_TOP);
  const [fields, setFields] = useState<Values>({});
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const set = (p: Partial<typeof EMPTY_TOP>) => setTop((t) => ({ ...t, ...p }));

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
        tags: top.tags.split(',').map((x) => x.trim()).filter(Boolean),
      };
      if (top.groupId) body.groupId = Number(top.groupId);
      if (top.agentId) body.agentId = Number(top.agentId);
      if (top.priority) body.priority = Number(top.priority);
      const t = await createTicket(body);
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
        <h2 className="text-xl font-extrabold tracking-tight">New ticket</h2>
        <p className="text-sm text-muted">For calls, WhatsApp, portal and walk-ins. Email tickets are created from the support mailbox automatically.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card title="Requester and issue">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Requester name" required><input className={inputCls} value={top.requesterName} onChange={(e) => set({ requesterName: e.target.value })} /></Field>
              <Field label="Email"><input className={inputCls} type="email" value={top.requesterEmail} onChange={(e) => set({ requesterEmail: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputCls} value={top.requesterPhone} onChange={(e) => set({ requesterPhone: e.target.value })} /></Field>
            </div>
            <div className="mt-3 space-y-3">
              <Field label="Subject" required><input className={inputCls} value={top.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
              <Field label="Description"><textarea rows={5} className={textareaCls} value={top.description} onChange={(e) => set({ description: e.target.value })} /></Field>
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
            <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Create another after this one
          </label>
          <Button variant="primary" className="w-full" onClick={submit} disabled={busy || !top.subject.trim() || !top.requesterName.trim()}>
            {busy ? <Spinner /> : <PlusCircle size={14} />} Create ticket
          </Button>
        </div>
      </div>
    </div>
  );
}
