'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ALLOWED_EXTENSIONS, type Attachment, type Track } from '@/lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { IconDownload, IconPaperclip, IconTrash } from './icons';

/** Files of the workpaper (auditors' annexures and every auditee's uploads): list and download all, upload, delete own. */
export function AttachmentsPanel({ track, guid, editable }: { track: Track; guid: string; editable: boolean }) {
  const [list, setList] = useState<Attachment[] | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const maxMb = Math.round(api.maxUploadBytes / (1024 * 1024));

  const load = useCallback(() => {
    setError('');
    api.attachments(track, guid).then(setList).catch((e: Error) => { setError(e.message); setList([]); });
  }, [track, guid]);
  useEffect(() => { load(); }, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setNote('');
    if (file.size > api.maxUploadBytes) { setError(`The file is larger than ${maxMb} MB.`); return; }
    setBusy(true);
    try {
      setList(await api.upload(track, guid, file));
      setNote(`${file.name} was attached.`);
    } catch (e) { setError((e as Error).message); } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const download = async (a: Attachment) => {
    setError('');
    try {
      const blob = await api.download(track, guid, a.name);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = a.name;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
  };
  const remove = async () => {
    if (!toDelete) return;
    setBusy(true); setError(''); setNote('');
    try {
      setList(await api.remove(track, guid, toDelete));
      setNote(`${toDelete} was deleted.`);
      setToDelete(null);
    } catch (e) { setError((e as Error).message); setToDelete(null); } finally { setBusy(false); }
  };

  return (
    <section className="card att" aria-labelledby="att-title">
      <h2 id="att-title"><IconPaperclip size={15} /> Attachments</h2>
      {error && <div className="banner err" role="alert"><p>{error}</p></div>}
      <p className="sr-only" role="status">{note}</p>
      {note && <p className="muted" aria-hidden="true" style={{ marginTop: 0 }}>{note}</p>}
      {list === null && <p className="muted" role="status">Loading attachments…</p>}
      {list !== null && !list.length && !error && <p className="muted">No files are attached to this workpaper yet.</p>}
      {list !== null && !!list.length && (
        <ul className="extras">
          {list.map((a) => (
            <li key={a.name}>
              <span className="name">{a.name}</span>
              {a.annexure && <span className="chip tag">Annexure</span>}
              {a.mine ? <span className="chip tag">Uploaded by you</span> : a.byAuditee && <span className="chip tag">Auditee</span>}
              <button type="button" onClick={() => download(a)} aria-label={`Download ${a.name}`}><IconDownload size={13} /> Download</button>
              {a.mine && editable && <button type="button" className="danger" onClick={() => setToDelete(a.name)} disabled={busy} aria-label={`Delete ${a.name}`}><IconTrash size={13} /> Delete</button>}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <div>
          <label className="lbl" htmlFor="file">Add a file</label>
          <input id="file" ref={input} type="file" accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')} onChange={(e) => upload(e.target.files?.[0])} disabled={busy} aria-describedby="file-hint" />
          <p id="file-hint" className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Up to {maxMb} MB. PDF, Office, image, text, e-mail or ZIP files. The file is stored right away.</p>
          {busy && <p className="muted" role="status">Please wait…</p>}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Files can only be added or removed while the workpaper is awaiting the auditees&apos; response.</p>
      )}
      <ConfirmDialog open={toDelete !== null} title="Delete this file?" confirmLabel="Delete" danger busy={busy} onConfirm={remove} onCancel={() => setToDelete(null)}>
        <p>{toDelete} will be removed from the workpaper.</p>
      </ConfirmDialog>
    </section>
  );
}
