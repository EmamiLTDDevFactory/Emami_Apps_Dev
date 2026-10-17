'use client';
import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react';
import { admin } from '@/lib/api';
import { useSetu } from '@/lib/context';
import type { CannedResponse, EmailTemplate } from '@/lib/types';
import { Button, Card, Empty, Field, Modal, Notice, Pill, Skeleton, Table, cx, inputCls, textareaCls } from '../ui';
import { checkboxCls, useAction, useLoad } from './shared';

const PLACEHOLDERS = [
  'ticket.id', 'ticket.subject', 'ticket.description', 'ticket.url', 'ticket.status', 'ticket.group.name', 'ticket.agent.name',
  'ticket.requester.name', 'ticket.requester.email', 'ticket.first_response_due', 'ticket.resolution_due', 'comment.body', 'helpdesk_name',
];

const TEMPLATE_HINT: Record<string, string> = {
  'requester.ticket_received': 'Emailed to the requester when an email ticket is created',
  'reply.signature': 'Added under every agent reply',
  'forward.signature': 'Added under every forward',
  'requester.closing_reminder': 'Sent by the auto-close automations',
};

function TemplateEditor({ t, onSaved }: { t: EmailTemplate; onSaved: () => void }) {
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [enabled, setEnabled] = useState(t.enabled);
  const act = useAction();
  useEffect(() => { setSubject(t.subject); setBody(t.body); setEnabled(t.enabled); act.setMsg(null); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = subject !== t.subject || body !== t.body || enabled !== t.enabled;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[13px] font-medium">
        <input type="checkbox" className={checkboxCls} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
      </label>
      {t.subject !== '-' && <Field label="Subject"><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
      <Field label="Body (HTML)" hint="Use <br> for line breaks. Placeholder values are HTML-escaped.">
        <textarea rows={12} className={cx(textareaCls, 'font-mono text-xs')} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div>
        <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Placeholders</div>
        <div className="flex flex-wrap gap-1">{PLACEHOLDERS.map((p) => <code key={p} className="rounded bg-sunken px-1.5 py-0.5 text-2xs">{`{{${p}}}`}</code>)}</div>
      </div>
      <div>
        <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Preview</div>
        <div className="mail-body rounded-xl border border-line bg-bg p-3" dangerouslySetInnerHTML={{ __html: typeof window === 'undefined' ? '' : DOMPurify.sanitize(body) }} />
      </div>
      {act.msg && <Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice>}
      <Button variant="primary" disabled={!dirty || act.busy} onClick={async () => { if (await act.run(() => admin.saveTemplate(t.key, { subject, body, enabled }), 'Template saved.')) onSaved(); }}>Save template</Button>
    </div>
  );
}

export function TemplatesTab() {
  const { data, error, reload } = useLoad(admin.templates);
  const [key, setKey] = useState<string | null>(null);
  const current = useMemo(() => data?.find((t) => t.key === key) ?? data?.[0] ?? null, [data, key]);
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Card><Skeleton /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card title="Templates" sub="Agent notifications go to the Emami Apps inbox and Outlook" bodyClass="p-1.5">
        <ul>
          {data.map((t) => (
            <li key={t.key}>
              <button type="button" onClick={() => setKey(t.key)} className={cx('w-full rounded-lg px-2.5 py-1.5 text-left', current?.key === t.key ? 'bg-accent/10 text-accent' : 'hover:bg-sunken')}>
                <div className="flex items-center gap-2 text-[13px] font-semibold"><span className="truncate">{t.key}</span>{!t.enabled && <Pill>Off</Pill>}</div>
                <div className="text-2xs text-muted">{t.audience === 'requester' ? 'To requester' : 'To agents'}</div>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {current && <Card title={current.key} sub={TEMPLATE_HINT[current.key] ?? (current.audience === 'agent' ? 'Agent notification' : 'Requester email')}><TemplateEditor t={current} onSaved={reload} /></Card>}
    </div>
  );
}

export function CannedTab() {
  const { meta, reloadMeta } = useSetu();
  const [edit, setEdit] = useState<{ id?: number; folder: string; title: string; shortCode: string; body: string } | null>(null);
  const [filter, setFilter] = useState('');
  const act = useAction();
  const list = meta.cannedResponses.filter((c) => !filter || `${c.folder} ${c.title} ${c.shortCode ?? ''}`.toLowerCase().includes(filter.toLowerCase()));

  const open = (c?: CannedResponse) => {
    act.setMsg(null);
    setEdit(c ? { id: c.id, folder: c.folder, title: c.title, shortCode: c.shortCode ?? '', body: c.body } : { folder: 'General', title: '', shortCode: '', body: '' });
  };
  const save = async () => {
    if (!edit) return;
    if (await act.run(() => admin.saveCanned(edit), 'Canned response saved.')) {
      setEdit(null);
      await reloadMeta();
    }
  };

  return (
    <Card
      title="Canned responses"
      sub="Agents pick these in the reply box, or type /code then Tab"
      actions={<><input className={cx(inputCls, 'h-8 w-48 text-xs')} placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter" /><Button size="sm" variant="primary" onClick={() => open()}><Plus size={13} /> Add</Button></>}
      bodyClass="p-0"
    >
      {act.msg && !edit && <div className="p-4 pb-0"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
      {meta.cannedResponses.length === 0 ? <Empty title="No canned responses yet" icon={MessageSquareText} /> : (
        <Table head={['Folder', 'Title', 'Short code', 'Text', '']}>
          {list.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2 text-xs">{c.folder}</td>
              <td className="px-3 py-2 font-semibold">{c.title}</td>
              <td className="px-3 py-2">{c.shortCode ? <code className="rounded bg-sunken px-1.5 text-xs">/{c.shortCode}</code> : '—'}</td>
              <td className="max-w-md truncate px-3 py-2 text-xs text-muted">{c.body.replace(/<[^>]+>/g, ' ')}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => open(c)}><Pencil size={13} /></Button>
                <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (confirm(`Delete "${c.title}"?`)) { await act.run(() => admin.deleteCanned(c.id), 'Deleted.'); reloadMeta(); } }}><Trash2 size={13} /></Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit canned response' : 'Add canned response'} width={620}>
        {edit && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Folder"><input className={inputCls} value={edit.folder} onChange={(e) => setEdit({ ...edit, folder: e.target.value })} /></Field>
              <Field label="Title" required className="sm:col-span-2"><input className={inputCls} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            </div>
            <Field label="Short code" hint="Letters, numbers, - and _ (typed as /code + Tab)"><input className={inputCls} value={edit.shortCode} onChange={(e) => setEdit({ ...edit, shortCode: e.target.value })} /></Field>
            <Field label="Text" required><textarea rows={8} className={textareaCls} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            {act.msg && <Notice tone={act.msg.tone}>{act.msg.text}</Notice>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={act.busy || !edit.title.trim() || !edit.body.trim()}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
