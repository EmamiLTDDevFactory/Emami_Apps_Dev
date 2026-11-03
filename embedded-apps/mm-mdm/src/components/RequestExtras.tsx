'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useI18n, useT } from '@/i18n';
import { MAX_COMMENT_LENGTH, checkFile, fileProblemMessage, fmtSize } from '@/lib/attachments';
import type { AttachmentItem, CommentItem } from '@/lib/types';

const errText = (e: unknown, fallback: string): string => (e instanceof ApiError ? (e.messages.length ? e.messages.map((m) => m.message).join(' ') : e.message) : e instanceof Error ? e.message : fallback);
const stamp = (iso: string): string => (iso ? iso.slice(0, 16).replace('T', ' ') : '');

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; items: T[] };

/** Attachments and comment thread of a request. What the user may do comes from SAP's flags (allowed.attach / allowed.comment); nothing is inferred from the status. */
export function RequestExtras({ transId, canAttach, canComment }: { transId: string; canAttach: boolean; canComment: boolean }) {
  return (
    <>
      <Attachments transId={transId} canAttach={canAttach} />
      <Comments transId={transId} canComment={canComment} />
    </>
  );
}

function Attachments({ transId, canAttach }: { transId: string; canAttach: boolean }) {
  const { t, lang } = useI18n();
  const id = useId();
  const [list, setList] = useState<Load<AttachmentItem>>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [info, setInfo] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setList({ state: 'loading' });
    api.attachments(transId).then((items) => setList({ state: 'ready', items })).catch((e) => setList({ state: 'error', message: errText(e, t('common.unexpected')) }));
  }, [transId]);
  useEffect(load, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setProblem(''); setInfo('');
    const bad = checkFile(file.name, file.size, api.maxUploadBytes);
    if (bad) { setProblem(fileProblemMessage(bad, lang)); if (input.current) input.current.value = ''; return; }
    setBusy(true);
    try {
      await api.uploadAttachment(transId, file);
      setInfo(t('ext.added', { name: file.name }));
      load();
    } catch (e) { setProblem(errText(e, t('common.unexpected'))); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  const download = async (a: AttachmentItem) => {
    setProblem(''); setInfo('');
    try {
      const blob = await api.downloadAttachment(transId, a.attachId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = a.fileName;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setProblem(errText(e, t('common.unexpected'))); }
  };

  const remove = async (a: AttachmentItem) => {
    if (!confirm(t('ext.deleteConfirm', { name: a.fileName }))) return;
    setProblem(''); setInfo(''); setBusy(true);
    try { await api.deleteAttachment(transId, a.attachId); setInfo(t('ext.deleted', { name: a.fileName })); load(); } catch (e) { setProblem(errText(e, t('common.unexpected'))); } finally { setBusy(false); }
  };

  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{list.state === 'ready' ? t('ext.attachmentsN', { n: list.items.length }) : t('ext.attachments')}</h2>
      {list.state === 'loading' && <p className="muted" role="status">{t('ext.loadingAtt')}</p>}
      {list.state === 'error' && <p className="notice" role="alert">{list.message} <button type="button" onClick={load}>{t('common.retry')}</button></p>}
      {list.state === 'ready' && !list.items.length && <p className="muted">{t('ext.noAtt')}</p>}
      {list.state === 'ready' && list.items.length > 0 && (
        <ul className="extras">
          {list.items.map((a) => (
            <li key={a.attachId}>
              <div className="grow">
                <b>{a.fileName}</b>
                <div className="muted">{fmtSize(a.size)} · {a.uploadedBy} · {stamp(a.uploadedAt)}{a.level ? ` · ${t('ext.levelSuffix', { level: a.level })}` : ''}</div>
              </div>
              <button type="button" onClick={() => void download(a)} aria-label={t('ext.downloadFile', { name: a.fileName })}>{t('ext.download')}</button>
              {canAttach && <button type="button" className="danger" disabled={busy} onClick={() => void remove(a)} aria-label={t('ext.deleteFile', { name: a.fileName })}>{t('ext.delete')}</button>}
            </li>
          ))}
        </ul>
      )}
      {canAttach && (
        <div className="field">
          <label className="lbl" htmlFor={`${id}-f`}>{t('ext.add')}</label>
          <input ref={input} id={`${id}-f`} type="file" disabled={busy} aria-describedby={`${id}-d`} onChange={(e) => void upload(e.target.files?.[0])} />
          <div id={`${id}-d`} className="muted">{t('ext.addHint', { size: fmtSize(api.maxUploadBytes) })}</div>
        </div>
      )}
      <p className="muted" role="status" aria-live="polite">{info}</p>
      {problem && <p className="notice" role="alert">{problem}</p>}
    </section>
  );
}

function Comments({ transId, canComment }: { transId: string; canComment: boolean }) {
  const t = useT();
  const id = useId();
  const [list, setList] = useState<Load<CommentItem>>({ state: 'loading' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const load = useCallback(() => {
    setList({ state: 'loading' });
    api.comments(transId).then((items) => setList({ state: 'ready', items })).catch((e) => setList({ state: 'error', message: errText(e, t('common.unexpected')) }));
  }, [transId]);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) { setProblem(t('ext.writeFirst')); return; }
    setProblem(''); setBusy(true);
    try { await api.addComment(transId, text.trim()); setText(''); load(); } catch (err) { setProblem(errText(err, t('common.unexpected'))); } finally { setBusy(false); }
  };

  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{list.state === 'ready' ? t('ext.commentsN', { n: list.items.length }) : t('ext.comments')}</h2>
      {list.state === 'loading' && <p className="muted" role="status">{t('ext.loadingCmt')}</p>}
      {list.state === 'error' && <p className="notice" role="alert">{list.message} <button type="button" onClick={load}>{t('common.retry')}</button></p>}
      {list.state === 'ready' && !list.items.length && <p className="muted">{t('ext.noCmt')}</p>}
      {list.state === 'ready' && list.items.length > 0 && (
        <ol className="extras thread">
          {list.items.map((c) => (
            <li key={c.commentId}>
              <div className="muted">{c.user} · {stamp(c.createdAt)}{c.level ? ` · ${t('ext.levelSuffix', { level: c.level })}` : ''}</div>
              <div className="ctext">{c.text}</div>
            </li>
          ))}
        </ol>
      )}
      {canComment && (
        <form onSubmit={(e) => void add(e)}>
          <div className="field">
            <label className="lbl" htmlFor={`${id}-t`}>{t('ext.addComment')}</label>
            <textarea id={`${id}-t`} rows={3} maxLength={MAX_COMMENT_LENGTH} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
            <div className="muted">{text.length} / {MAX_COMMENT_LENGTH}</div>
          </div>
          <button type="submit" disabled={busy}>{t('ext.addComment')}</button>
        </form>
      )}
      {problem && <p className="notice" role="alert">{problem}</p>}
    </section>
  );
}
