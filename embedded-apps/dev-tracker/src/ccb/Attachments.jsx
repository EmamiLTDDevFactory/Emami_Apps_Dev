import React, { useRef, useState } from 'react';
import { ATTACHMENT_EXTS, ATTACHMENT_MAX_MB, attachmentProblem, downloadAttachment, removeAttachment, uploadAttachment } from './api.js';
import { Button, Card } from './ui.jsx';
import { STATUS_META, fmtDateTime } from './model.js';
import { AlertIcon, DownloadIcon, PaperclipIcon, TrashIcon, UploadCloudIcon, XIcon } from '../shared/icons.jsx';

const ACCEPT = ATTACHMENT_EXTS.map((e) => `.${e}`).join(',');
export const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toUpperCase().slice(0, 4);

/** Uploads queued files one by one; returns the messages of those that failed (the rest are saved). */
export async function uploadAll(requestId, files) {
  const failed = [];
  for (const f of files) {
    try { await uploadAttachment(requestId, f); } catch (e) { failed.push(e.message); }
  }
  return failed;
}

/** Drop zone + "Browse" for picking files; checks type and size before anything is sent. */
function DropZone({ onFiles, busy, compact }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const take = (list) => { if (list?.length) onFiles([...list]); };
  return (
    <div
      className={`ccb-drop${over ? ' over' : ''}${compact ? ' compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) take(e.dataTransfer.files); }}
    >
      <UploadCloudIcon size={compact ? 16 : 20} />
      <span>
        <strong>Drop files here</strong> or{' '}
        <button type="button" className="ccb-link-btn" disabled={busy} onClick={() => input.current?.click()}>browse</button>
        <small>PDF, Word, Excel, PowerPoint, images, Outlook mail, ZIP · up to {ATTACHMENT_MAX_MB} MB each</small>
      </span>
      <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

function FileRow({ name, size, sub, actions }) {
  return (
    <li className="ccb-file">
      <span className="ccb-file-ext">{extOf(name) || <PaperclipIcon size={13} />}</span>
      <span className="ccb-file-main">
        <span className="ccb-file-name" title={name}>{name}</span>
        <span className="ccb-file-sub">{fmtSize(size)}{sub ? ` · ${sub}` : ''}</span>
      </span>
      {actions}
    </li>
  );
}

/**
 * Files picked in a form or dialog, uploaded by the caller once the request exists (uploadAll).
 * `existing` (optional) lists what is already attached, read-only.
 */
export function FilePicker({ files, onChange, existing = [], compact }) {
  const [problems, setProblems] = useState([]);
  function add(list) {
    const bad = list.map(attachmentProblem).filter(Boolean);
    const good = list.filter((f) => !attachmentProblem(f) && !files.some((x) => x.name === f.name && x.size === f.size));
    setProblems(bad);
    if (good.length) onChange([...files, ...good]);
  }
  return (
    <div className="ccb-files">
      {(existing.length > 0 || files.length > 0) && (
        <ul className="ccb-file-list">
          {existing.map((a) => <FileRow key={`a${a.id}`} name={a.fileName} size={a.sizeBytes} sub="attached" />)}
          {files.map((f, i) => (
            <FileRow
              key={`${f.name}-${f.size}-${i}`} name={f.name} size={f.size} sub="to upload"
              actions={<button type="button" className="ccb-icon-btn" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}><XIcon size={14} /></button>}
            />
          ))}
        </ul>
      )}
      <DropZone onFiles={add} compact={compact} />
      {problems.map((p) => <div key={p} className="ccb-error"><AlertIcon size={13} /> {p}</div>)}
    </div>
  );
}

/** The request's documents: download any, add more at any stage, remove your own until the decision. */
export function AttachmentsCard({ request: r, attachments, canAttach, nameOf, onChanged, showToast }) {
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  async function add(list) {
    const bad = list.map(attachmentProblem).filter(Boolean);
    const good = list.filter((f) => !attachmentProblem(f));
    if (bad.length) showToast(bad.join(' '), 'error');
    if (!good.length) return;
    setBusy(true);
    const failed = await uploadAll(r.id, good);
    setBusy(false);
    if (failed.length) showToast(failed.join(' '), 'error');
    else showToast(good.length === 1 ? `${good[0].name} attached.` : `${good.length} documents attached.`);
    onChanged();
  }
  async function remove(a) {
    setRemoving(a.id);
    try {
      await removeAttachment(r.id, a.id);
      showToast(`${a.fileName} removed.`);
      onChanged();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setRemoving(null);
    }
  }
  async function download(a) {
    try { await downloadAttachment(r.id, a); } catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <Card title="Attachments" sub={attachments.length ? `${attachments.length} document${attachments.length === 1 ? '' : 's'} · BRD, sign-offs, test evidence` : 'BRD, sign-offs, test evidence'}>
      {attachments.length === 0 && !canAttach && <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No documents attached.</p>}
      {attachments.length > 0 && (
        <ul className="ccb-file-list">
          {attachments.map((a) => (
            <FileRow
              key={a.id} name={a.fileName} size={a.sizeBytes}
              sub={`${nameOf(a.uploadedBy)} · ${fmtDateTime(a.uploadedAt)}${STATUS_META[a.stage] ? ` · ${STATUS_META[a.stage].label}` : ''}`}
              actions={(
                <span className="ccb-file-actions">
                  <button type="button" className="ccb-icon-btn" title="Download" aria-label={`Download ${a.fileName}`} onClick={() => download(a)}><DownloadIcon size={15} /></button>
                  {a.canRemove && <button type="button" className="ccb-icon-btn" title="Remove" aria-label={`Remove ${a.fileName}`} disabled={removing === a.id} onClick={() => remove(a)}><TrashIcon size={15} /></button>}
                </span>
              )}
            />
          ))}
        </ul>
      )}
      {canAttach && (
        <div style={{ marginTop: attachments.length ? 12 : 0 }}>
          {busy ? <Button busy>Uploading…</Button> : <DropZone onFiles={add} compact={attachments.length > 0} />}
        </div>
      )}
    </Card>
  );
}
