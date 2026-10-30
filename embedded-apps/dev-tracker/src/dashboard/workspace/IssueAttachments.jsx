import React, { useEffect, useRef, useState } from 'react';
import { apiAttachments, apiAttachmentDelete, apiAttachmentDownload, apiAttachmentUpload } from '../../shared/api.js';
import { ATTACHMENT_EXTS, ATTACHMENT_MAX_MB, attachmentProblem } from '../../ccb/api.js';
import { STATUS_META } from '../../ccb/model.js';
import { ROUTES } from '../../shared/routes.js';
import { DownloadIcon, GavelIcon, PaperclipIcon, TrashIcon, UploadCloudIcon } from '../../shared/icons.jsx';

// Issue view → Attachments: the issue's own documents (anyone can add; the uploader or an admin can
// remove), and — for an issue that came from an approved CCB request — that request's documents,
// read-only here (they are managed in the CCB). Same file rules as the CCB (backend/devTracker.js).

const ACCEPT = ATTACHMENT_EXTS.map((e) => `.${e}`).join(',');
const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toUpperCase().slice(0, 4);
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function FileRow({ a, sub, onDownload, onRemove, busy }) {
  return (
    <li className="pm-att">
      <span className="pm-att-ext">{extOf(a.fileName) || <PaperclipIcon size={13} />}</span>
      <span className="pm-att-main">
        <button type="button" className="pm-att-name" title={`Download ${a.fileName}`} onClick={onDownload}>{a.fileName}</button>
        <span className="pm-att-sub">{fmtSize(a.sizeBytes)} · {sub}</span>
      </span>
      <span className="pm-att-actions">
        <button type="button" className="pm-icon-btn" title="Download" aria-label={`Download ${a.fileName}`} onClick={onDownload}><DownloadIcon size={15} /></button>
        {onRemove && <button type="button" className="pm-icon-btn" title="Remove" aria-label={`Remove ${a.fileName}`} disabled={busy} onClick={onRemove}><TrashIcon size={15} /></button>}
      </span>
    </li>
  );
}

export default function IssueAttachments({ itemId, email, onError, onChanged }) {
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [removing, setRemoving] = useState(null);
  const [over, setOver] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiAttachments(itemId, email)
      .then((d) => !cancelled && setData(d || { attachments: [], ccb: null }))
      .catch(() => !cancelled && setData({ attachments: [], ccb: null, failed: true }));
    return () => { cancelled = true; };
  }, [itemId, email, tick]);

  async function add(list) {
    const files = [...(list || [])];
    if (!files.length) return;
    const bad = files.map(attachmentProblem).filter(Boolean);
    const good = files.filter((f) => !attachmentProblem(f));
    if (bad.length) onError(bad.join(' '));
    if (!good.length) return;
    setUploading(good.length);
    const failed = [];
    for (const f of good) {
      try { await apiAttachmentUpload(itemId, f, email); } catch (e) { failed.push(e.message); }
    }
    setUploading(0);
    if (failed.length) onError(failed.join(' '));
    setTick((t) => t + 1);
    onChanged?.();
  }
  async function remove(a) {
    if (!window.confirm(`Remove ${a.fileName}?`)) return;
    setRemoving(a.id);
    try { await apiAttachmentDelete(itemId, a.id, email); setTick((t) => t + 1); onChanged?.(); } catch (e) { onError(e.message); }
    setRemoving(null);
  }
  const download = (a, fromCcb) => apiAttachmentDownload(itemId, a, email, fromCcb).catch((e) => onError(e.message));

  const own = data?.attachments || [];
  const ccb = data?.ccb;
  const total = own.length + (ccb?.attachments.length || 0);

  return (
    <section className="pm-issue-block">
      <h3>Attachments{total ? <span className="pm-muted pm-att-count"> · {total}</span> : null}</h3>
      {!data && <div className="pm-muted">Loading…</div>}
      {data?.failed && <div className="pm-muted">Attachments are not available yet.</div>}

      {ccb && (
        <div className="pm-att-group">
          <div className="pm-att-group-head">
            <GavelIcon size={13} /> From change request <a href={`${ROUTES.ccbRequests}?cr=${encodeURIComponent(ccb.crNo)}`}>{ccb.crNo}</a>
            <span className="pm-muted"> · managed in the CCB</span>
          </div>
          {ccb.attachments.length ? (
            <ul className="pm-att-list">
              {ccb.attachments.map((a) => (
                <FileRow key={`c${a.id}`} a={a} sub={`${a.uploadedByName} · ${fmtWhen(a.uploadedAt)}${STATUS_META[a.stage] ? ` · ${STATUS_META[a.stage].label}` : ''}`} onDownload={() => download(a, true)} />
              ))}
            </ul>
          ) : <div className="pm-muted pm-att-empty">No documents on the change request.</div>}
        </div>
      )}

      {data && !data.failed && (
        <div className="pm-att-group">
          {ccb && <div className="pm-att-group-head"><PaperclipIcon size={13} /> Added on this issue</div>}
          {own.length > 0 && (
            <ul className="pm-att-list">
              {own.map((a) => (
                <FileRow
                  key={a.id} a={a} sub={`${a.uploadedByName || a.uploadedBy} · ${fmtWhen(a.uploadedAt)}`}
                  onDownload={() => download(a, false)} onRemove={a.canRemove ? () => remove(a) : null} busy={removing === a.id}
                />
              ))}
            </ul>
          )}
          <div
            className={`pm-att-drop${over ? ' is-over' : ''}${own.length ? ' is-compact' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (!uploading) add(e.dataTransfer.files); }}
          >
            <UploadCloudIcon size={18} />
            {uploading ? <span>Uploading {uploading} file{uploading === 1 ? '' : 's'}…</span> : (
              <span>
                <strong>Drop files here</strong> or{' '}
                <button type="button" className="pm-link-btn" onClick={() => input.current?.click()}>browse</button>
                <small>PDF, Word, Excel, PowerPoint, images, Outlook mail, ZIP · up to {ATTACHMENT_MAX_MB} MB each</small>
              </span>
            )}
            <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
      )}
    </section>
  );
}
