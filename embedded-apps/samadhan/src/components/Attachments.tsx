'use client';
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { Download, Eye, FileText, Image as ImageIcon, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { attachmentUrl, deleteAttachment, uploadAttachment } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { ACCEPT, ALLOWED_TEXT, blobOf, fmtSize, sizeOf, toPending, uploadName, type PendingFile } from '@/lib/files';
import type { Attachment } from '@/lib/types';
import { Button, Card, Modal, Notice, Spinner, cx } from './ui';

/*
   v7 attachments UI (master prompt §L): pick, paste (Ctrl+V) or drop files; large screenshots are compressed in the
   browser with an "Upload original" choice; images and PDFs are previewed in a modal, everything else downloads.
   Every download goes through a 5-minute signed link the server issues after its permission and scope checks.
*/

// ---------- pending files (before upload) ----------
export function usePendingFiles(perFileMb: number, maxFiles: number) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const add = useCallback(async (files: File[], pasted = false) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const next = await toPending(files, perFileMb, pasted);
      setPending((p) => [...p, ...next].slice(0, maxFiles));
    } finally {
      setBusy(false);
    }
  }, [perFileMb, maxFiles]);
  const onPaste = useCallback((e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) { e.preventDefault(); add(files, true); }
  }, [add]);
  const remove = (key: string) => setPending((p) => p.filter((x) => x.key !== key));
  const toggleOriginal = (key: string) => setPending((p) => p.map((x) => (x.key === key ? { ...x, useOriginal: !x.useOriginal } : x)));
  const ready = pending.filter((p) => !p.error);
  return { pending, setPending, add, onPaste, remove, toggleOriginal, busy, ready, clear: () => setPending([]) };
}
type Pending = ReturnType<typeof usePendingFiles>;

/** Drop area + "Add files" button + the list of files waiting to be sent. */
export function FileTray({ files, label = 'Add files', hint, maxFiles, compact = false, testId = 'file-tray' }: { files: Pending; label?: string; hint?: ReactNode; maxFiles: number; compact?: boolean; testId?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); files.add(Array.from(e.dataTransfer.files ?? [])); };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cx('rounded-xl border border-dashed p-2 transition', over ? 'border-accent bg-accent/5' : 'border-line')}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" type="button" onClick={() => input.current?.click()} disabled={files.pending.length >= maxFiles}><Paperclip size={13} /> {label}</Button>
        <span className="text-2xs text-muted">{hint ?? (compact ? 'or drop / paste here' : `Drop files here or paste a screenshot (Ctrl+V). Allowed: ${ALLOWED_TEXT}.`)}</span>
        {files.busy && <Spinner />}
        <input ref={input} type="file" multiple hidden accept={ACCEPT} aria-label={label}
          onChange={(e) => { files.add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>
      {files.pending.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.pending.map((p) => (
            <li key={p.key} className={cx('flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-xs', p.error ? 'bg-bad/10 text-bad' : 'bg-sunken')}>
              <FileText size={13} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate font-semibold" title={p.name}>{uploadName(p)}</span>
              <span className="text-muted">{fmtSize(sizeOf(p))}</span>
              {p.compressed && !p.error && (
                <button type="button" className="text-accent underline" onClick={() => files.toggleOriginal(p.key)}>
                  {p.useOriginal ? `Use compressed (${fmtSize(p.compressed.size)})` : `Compressed from ${fmtSize(p.original.size)} · Upload original`}
                </button>
              )}
              {p.error && <span>{p.error}</span>}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => files.remove(p.key)} className="text-muted hover:text-ink"><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Uploads the ready files of a tray to a ticket; returns the saved rows and the errors. */
export async function uploadPending(ticketId: number, files: PendingFile[], conversationId?: number) {
  const saved: Attachment[] = [];
  const errors: string[] = [];
  for (const p of files) {
    try {
      saved.push(await uploadAttachment(ticketId, blobOf(p), uploadName(p), conversationId));
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : 'could not upload'}`);
    }
  }
  return { saved, errors };
}

// ---------- saved files ----------
export function useFileOpener(ticketId: number) {
  const [preview, setPreview] = useState<{ file: Attachment; url: string } | null>(null);
  const [error, setError] = useState('');
  const download = async (a: Attachment) => {
    setError('');
    try {
      const url = await attachmentUrl(ticketId, a.id);
      const link = document.createElement('a');
      link.href = url;
      link.rel = 'noopener';
      link.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the file.');
    }
  };
  const open = async (a: Attachment) => {
    if (!a.preview) return download(a);
    setError('');
    try {
      // Loaded into the page as a blob, so the preview works inside the app while the direct link stays download-only.
      const res = await fetch(await attachmentUrl(ticketId, a.id, true));
      if (!res.ok) throw new Error(res.status === 410 ? 'The link expired - try again.' : 'Could not load the file.');
      const blob = new Blob([await res.arrayBuffer()], { type: a.contentType });
      setPreview({ file: a, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the file.');
    }
  };
  const close = () => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); };
  const modal = (
    <Modal open={!!preview} onClose={close} title={preview?.file.fileName ?? ''} width={900}>
      {preview && (
        <div className="p-3">
          {preview.file.contentType === 'application/pdf'
            ? <iframe title={preview.file.fileName} src={preview.url} className="h-[75vh] w-full rounded-lg border border-line" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={preview.url} alt={preview.file.fileName} className="mx-auto max-h-[75vh] max-w-full rounded-lg" />}
          <div className="mt-2 flex justify-end"><Button size="sm" onClick={() => download(preview.file)}><Download size={13} /> Download</Button></div>
        </div>
      )}
    </Modal>
  );
  return { open, download, modal, error, setError };
}

const iconFor = (a: Attachment) => (a.contentType.startsWith('image/') ? ImageIcon : FileText);

/** Paperclip chips under a conversation item. */
export function Paperclips({ files, ticketId }: { files: Attachment[]; ticketId: number }) {
  const opener = useFileOpener(ticketId);
  if (!files.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Attached files">
      <Paperclip size={13} className="text-muted" />
      {files.map((a) => {
        const Icon = iconFor(a);
        return (
          <button key={a.id} type="button" onClick={() => opener.open(a)} className="flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-2xs font-semibold hover:border-accent" title={`${a.fileName} · ${fmtSize(a.size)}`}>
            <Icon size={12} /> <span className="max-w-[160px] truncate">{a.fileName}</span>
          </button>
        );
      })}
      {opener.error && <span className="text-2xs text-bad">{opener.error}</span>}
      {opener.modal}
    </div>
  );
}

/** Ticket sidebar card: every file on the ticket, upload, preview, download, delete. */
export function AttachmentsCard({ ticketId, files, reload }: { ticketId: number; files: Attachment[]; reload: () => Promise<void> }) {
  const { attachments, can, me } = useSamadhan();
  const lim = attachments?.limits.agent;
  const tray = usePendingFiles(lim?.perFileMb ?? 10, lim?.filesPerAction ?? 10);
  const opener = useFileOpener(ticketId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const total = files.reduce((n, f) => n + f.size, 0);
  useEffect(() => { if (opener.error) setMsg({ tone: 'bad', text: opener.error }); }, [opener.error]);
  if (!attachments?.enabled) return null;
  const send = async () => {
    setBusy(true);
    setMsg(null);
    const { saved, errors } = await uploadPending(ticketId, tray.ready);
    setBusy(false);
    tray.clear();
    setMsg(errors.length ? { tone: 'bad', text: errors.join(' · ') } : { tone: 'good', text: `${saved.length} file(s) added.` });
    await reload();
  };
  const remove = async (a: Attachment) => {
    if (!confirm(`Delete ${a.fileName}? It is removed from the file server.`)) return;
    try { await deleteAttachment(ticketId, a.id); await reload(); } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not delete.' }); }
  };
  return (
    <Card title="Attachments" sub={files.length ? `${files.length} file(s) · ${fmtSize(total)}${lim ? ` of ${lim.perTicketMb} MB` : ''}` : 'No files yet'} actions={<Paperclip size={14} className="text-muted" />}>
      <div className="space-y-2" data-testid="attachments-card" onPaste={can('attachment.upload') ? tray.onPaste : undefined}>
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        {files.length > 0 && (
          <ul className="divide-y divide-line/70">
            {files.map((a) => {
              const Icon = iconFor(a);
              const mayDelete = can('attachment.delete') || (a.uploadedByAgentId === me.id && can('attachment.upload'));
              return (
                <li key={a.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <Icon size={14} className="shrink-0 text-accent" />
                  <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold hover:text-accent" onClick={() => opener.open(a)} title={a.fileName}>{a.fileName}</button>
                  <span className="shrink-0 text-muted">{fmtSize(a.size)}</span>
                  {a.preview && <button type="button" aria-label={`Preview ${a.fileName}`} onClick={() => opener.open(a)} className="text-muted hover:text-ink"><Eye size={13} /></button>}
                  <button type="button" aria-label={`Download ${a.fileName}`} onClick={() => opener.download(a)} className="text-muted hover:text-ink"><Download size={13} /></button>
                  {mayDelete && <button type="button" aria-label={`Delete ${a.fileName}`} onClick={() => remove(a)} className="text-muted hover:text-bad"><Trash2 size={13} /></button>}
                </li>
              );
            })}
          </ul>
        )}
        {can('attachment.upload') && (
          <>
            <FileTray files={tray} maxFiles={lim?.filesPerAction ?? 10} compact hint={`or drop / paste · max ${lim?.perFileMb ?? 10} MB each`} />
            {tray.ready.length > 0 && <Button size="sm" variant="primary" disabled={busy} onClick={send}>{busy ? <Spinner /> : <Upload size={13} />} Upload {tray.ready.length} file(s)</Button>}
          </>
        )}
      </div>
      {opener.modal}
    </Card>
  );
}
