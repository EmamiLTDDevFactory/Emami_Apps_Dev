'use client';
import { useState } from 'react';
import { BookUser, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteMyCanned, saveMyCanned } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import type { CannedResponse } from '@/lib/types';
import { Button, Empty, Field, Modal, Notice, Spinner, inputCls, textareaCls } from './ui';

type Draft = { id?: number; folder: string; title: string; shortCode: string; body: string };

/**
 * "My responses": canned responses that belong to the signed-in agent only - no other agent (and no admin) sees
 * them. Shared responses for everyone stay in Admin > Canned responses.
 */
export function MyCannedButton() {
  const { meta, reloadMeta } = useSamadhan();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const mine = meta.cannedResponses.filter((c) => c.ownerAgentId !== null);

  const startEdit = (c?: CannedResponse) => {
    setMsg(null);
    setEdit(c ? { id: c.id, folder: c.folder, title: c.title, shortCode: c.shortCode ?? '', body: c.body } : { folder: 'General', title: '', shortCode: '', body: '' });
  };
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await reloadMeta();
      setMsg({ tone: 'good', text: done });
      return true;
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setOpen(true); setEdit(null); setMsg(null); }} title="My canned responses (only you see them)">
        <BookUser size={13} /> <span className="hidden sm:inline">My responses</span>
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={edit ? (edit.id ? 'Edit my response' : 'New personal response') : 'My canned responses'} width={640}>
        {edit ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Folder"><input className={inputCls} value={edit.folder} onChange={(e) => setEdit({ ...edit, folder: e.target.value })} /></Field>
              <Field label="Title" required className="sm:col-span-2"><input className={inputCls} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            </div>
            <Field label="Short code" hint="Type /code then Tab in the reply box. Yours win over a shared one with the same code.">
              <input className={inputCls} value={edit.shortCode} onChange={(e) => setEdit({ ...edit, shortCode: e.target.value })} />
            </Field>
            <Field label="Text" required><textarea rows={8} className={textareaCls} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)}>Back</Button>
              <Button variant="primary" disabled={busy || !edit.title.trim() || !edit.body.trim()} onClick={async () => { if (await run(() => saveMyCanned(edit), 'Saved.')) setEdit(null); }}>
                {busy && <Spinner />} Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">Only you see these. Shared responses for the whole team are managed by your Samadhan admin.</p>
            {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
            {mine.length === 0 ? (
              <Empty title="No personal responses yet" icon={BookUser}>Save the replies you type often.</Empty>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {mine.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">{c.title} {c.shortCode && <code className="ml-1 rounded bg-sunken px-1.5 text-2xs font-normal">/{c.shortCode}</code>}</div>
                      <div className="truncate text-2xs text-muted">{c.folder} · {c.body.replace(/<[^>]+>/g, ' ')}</div>
                    </div>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${c.title}`} onClick={() => startEdit(c)}><Pencil size={13} /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${c.title}`} onClick={() => { if (confirm(`Delete "${c.title}"?`)) run(() => deleteMyCanned(c.id), 'Deleted.'); }}><Trash2 size={13} /></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end"><Button variant="primary" onClick={() => startEdit()}><Plus size={13} /> New response</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
