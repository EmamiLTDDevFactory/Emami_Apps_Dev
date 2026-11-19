'use client';

import { useEffect, useState } from 'react';
import { MaterialData, Message } from '@/lib/types';
import { FieldDef, ColumnDef, tableRows, displayValue } from '@/lib/fieldConfig';
import { useValueHelp } from '@/lib/mmValueHelp';
import { Attachment, Comment, addAttachment, addComment, deleteAttachment, downloadAttachment, listAttachments, listComments } from '@/lib/mmApi';
import { fmtDateTime } from '@/lib/format';
import { VIEW_BY_ID } from '@/lib/fieldConfig';

export interface Ctl { mode: 'edit' | 'display'; required: boolean }

/** A select field: the list is read live from SAP; without a list SAP knows (or while it loads) the code can be typed */
function SelectInput({ id, name, value, onChange, invalid }: { id: string; name: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const vh = useValueHelp(name);
  if (vh.loading) return <select id={id} disabled><option>Loading from SAP…</option></select>;
  if (vh.error || vh.options.length === 0) {
    return (
      <>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} spellCheck={false} autoComplete="off" />
        <small className="muted">{vh.error ? 'No value list from SAP for this field – enter the code.' : 'SAP has no list for this field – enter the code.'}</small>
      </>
    );
  }
  const known = vh.options.some((o) => o.value === value);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
      <option value="">Choose…</option>
      {value && !known && <option value={value}>{value}</option>}
      {vh.options.map((o) => <option key={o.value} value={o.value}>{o.label ? `${o.value} – ${o.label}` : o.value}</option>)}
    </select>
  );
}

export function FieldInput({ def, data, value, ctl, error, onChange, alias, changed, comments }: {
  def: FieldDef;
  data: MaterialData;
  value: string;
  ctl: Ctl | null;
  error?: Message;
  onChange: (v: string) => void;
  alias?: boolean;
  /** MX: the field differs from the live value the request started from; `was` is that original value */
  changed?: { was: string };
  /** Comments section: the request it belongs to and whether the user may add one */
  comments?: { transId: string; canComment: boolean };
}) {
  if (!ctl) return null;
  const id = `f-${def.key}`;
  if (def.tech === 'ZCOMMENT') {
    return comments ? <div className="field field-wide"><CommentsPanel transId={comments.transId} canComment={comments.canComment} bare /></div> : null;
  }
  const edit = ctl.mode === 'edit' && !def.readOnly && def.type !== 'ref' && !alias;
  const cls = `field ${def.wide ? 'field-wide' : ''} ${error?.severity === 'E' ? 'field-error' : error?.severity === 'W' ? 'field-warn' : ''} ${edit ? '' : 'field-display'} ${def.type === 'ref' ? 'field-ref' : ''} ${changed ? 'field-changed' : ''}`;
  const wasText = changed ? (def.type === 'table' ? `${tableRows(changed.was).length} row(s)` : changed.was ? displayValue(def.key, changed.was, data) : 'empty') : '';
  const chip = changed && <span className="chg-chip" title={`Changed. Original value in SAP: ${wasText}`}>Changed</span>;

  if (def.type === 'table') {
    return (
      <div className={cls} title={changed ? `Changed. Original value in SAP: ${wasText}` : undefined}>
        <span className="field-label">{def.label}<span className="tech">{def.tech}</span>{chip}</span>
        <TableField def={def} value={value} edit={edit} baseUom={data.baseUom} onChange={onChange} />
        {error && <small className={error.severity === 'E' ? 'err' : 'warn-text'}>{error.text}</small>}
      </div>
    );
  }

  const shown = displayValue(def.key, value, data);
  return (
    <div className={cls} title={changed ? `Changed. Original value in SAP: ${wasText}` : undefined}>
      <label htmlFor={id} className="field-label">
        {def.label}
        {ctl.required && <span className="req">*</span>}
        {def.type === 'ref' ? <span className="tech" title="Maintained in another view">linked</span> : <span className="tech" title={alias ? 'Same SAP field as another field: display only' : undefined}>{def.tech}</span>}
        {chip}
      </label>
      {!edit ? (
        <div id={id} className="display-value" tabIndex={-1}>{shown || <span className="muted">—</span>}</div>
      ) : def.type === 'checkbox' ? (
        <label className="check check-field">
          <input id={id} type="checkbox" checked={value === 'X'} onChange={(e) => onChange(e.target.checked ? 'X' : '')} />
          {value === 'X' ? 'Yes' : 'No'}
        </label>
      ) : def.type === 'select' ? (
        <SelectInput id={id} name={def.help ?? def.tech} value={value} onChange={onChange} invalid={error?.severity === 'E'} />
      ) : def.type === 'textarea' ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <span className={def.unit ? 'input-unit' : undefined}>
          <input
            id={id}
            type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
            step="any"
            value={value}
            maxLength={def.maxLength}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error?.severity === 'E'}
          />
          {def.unit && <span className="unit">{def.unit}</span>}
        </span>
      )}
      {error && <small className={error.severity === 'E' ? 'err' : 'warn-text'}>{error.text}</small>}
    </div>
  );
}

function CellSelect({ col, value, onChange }: { col: ColumnDef; value: string; onChange: (v: string) => void }) {
  const vh = useValueHelp(col.help ?? '', {}, !!col.help);
  if (!col.help || vh.error || (!vh.loading && vh.options.length === 0)) {
    return <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={col.label} spellCheck={false} />;
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={col.label} disabled={vh.loading}>
      <option value="">{vh.loading ? 'Loading…' : 'Choose…'}</option>
      {value && !vh.options.some((o) => o.value === value) && <option value={value}>{value}</option>}
      {vh.options.map((o) => <option key={o.value} value={o.value}>{o.label ? `${o.value} – ${o.label}` : o.value}</option>)}
    </select>
  );
}

/** Editable grid for table fields (tax data, descriptions, units of measure) */
function TableField({ def, value, edit, baseUom, onChange }: { def: FieldDef; value: string; edit: boolean; baseUom: string; onChange: (v: string) => void }) {
  const rows = tableRows(value);
  const cols = def.columns ?? [];
  const write = (next: Record<string, string>[]) => onChange(JSON.stringify(next));
  const setCell = (i: number, k: string, v: string) => write(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const canAdd = edit && !def.fixedRows && (!def.maxRows || rows.length < def.maxRows);
  const addRow = () => write([...rows, Object.fromEntries(cols.map((c) => [c.key, c.key === 'baseUnit' ? baseUom : '']))]);
  const removeRow = (i: number) => write(rows.filter((_, j) => j !== i));
  return (
    <div className="ftable-wrap">
      <table className="ftable">
        <thead>
          <tr>
            {cols.map((c) => <th key={c.key}>{c.label}{c.required && edit && <span className="req">*</span>}</th>)}
            {edit && !def.fixedRows && <th aria-label="Remove" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="muted small">No rows{canAdd ? ' – add one below' : ''}.</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const v = c.key === 'baseUnit' && !r[c.key] ? baseUom : r[c.key] ?? '';
                if (!edit || c.type === 'readonly') return <td key={c.key}>{c.type === 'checkbox' ? (v === 'X' ? 'Yes' : '') : v || <span className="muted">—</span>}</td>;
                if (c.type === 'checkbox') return <td key={c.key}><input type="checkbox" checked={v === 'X'} onChange={(e) => setCell(i, c.key, e.target.checked ? 'X' : '')} aria-label={c.label} /></td>;
                if (c.type === 'select') return <td key={c.key}><CellSelect col={c} value={v} onChange={(x) => setCell(i, c.key, x)} /></td>;
                return <td key={c.key}><input type={c.type === 'number' ? 'number' : 'text'} value={v} onChange={(e) => setCell(i, c.key, e.target.value)} aria-label={c.label} /></td>;
              })}
              {edit && !def.fixedRows && (
                <td className="ftable-x"><button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(i)} aria-label={`Remove row ${i + 1}`}>✕</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canAdd && <button type="button" className="btn btn-ghost btn-sm ftable-add" onClick={addRow}>+ Add row</button>}
    </div>
  );
}

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

/** Attachments of the request, through the backend's attachment routes (SAP stores the files) */
export function AttachmentsPanel({ transId, canAttach }: { transId: string; canAttach: boolean }) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const load = () => listAttachments(transId).then((r) => { setItems(r); setError(''); }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [transId]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { await addAttachment(transId, file); setInputKey((k) => k + 1); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The file could not be uploaded.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="card attach-card">
      <h3>Attachments {items && <span className="count-chip">{items.length}</span>}</h3>
      {error && <p className="err small" role="alert">{error} <button type="button" className="link" onClick={() => void load()}>Try again</button></p>}
      {!items && !error && <p className="muted small">Loading from SAP…</p>}
      {items && items.length === 0 && <p className="muted small">No files attached.</p>}
      {items && items.length > 0 && (
        <ul className="attach-list">
          {items.map((a) => (
            <li key={a.attachId}>
              <button type="button" className="link" onClick={() => void downloadAttachment(transId, a).catch((e: Error) => setError(e.message))}>{a.fileName}</button>
              <small className="muted"> {fmtSize(a.size)}{a.uploadedBy && ` · ${a.uploadedBy}`}</small>
              {canAttach && (
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Delete ${a.fileName}`}
                  onClick={() => void deleteAttachment(transId, a.attachId).then(load).catch((e: Error) => setError(e.message))}>✕</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAttach && (
        <label className="field">
          <span className="field-label">Upload file</span>
          <input key={inputKey} type="file" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
      )}
    </section>
  );
}

export function MessagePanel({ messages, onPick, onClose }: { messages: Message[]; onPick: (m: Message) => void; onClose: () => void }) {
  const groups = new Map<string, Message[]>();
  messages.forEach((m) => {
    const k = m.view && VIEW_BY_ID[m.view] ? VIEW_BY_ID[m.view].label : 'General';
    groups.set(k, [...(groups.get(k) ?? []), m]);
  });
  const errors = messages.filter((m) => m.severity === 'E').length;
  return (
    <section className="card msg-panel" role="alert" aria-live="assertive">
      <div className="msg-head">
        <h3>{errors ? `${errors} error${errors > 1 ? 's' : ''}` : 'Messages'}</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Clear</button>
      </div>
      {Array.from(groups.entries()).map(([g, ms]) => (
        <div key={g} className="msg-group">
          <h4>{g}</h4>
          <ul>
            {ms.map((m, i) => (
              <li key={i} className={`msg msg-${m.severity}`}>
                <span className="msg-sev" aria-label={m.severity === 'E' ? 'Error' : m.severity === 'W' ? 'Warning' : 'Information'}>{m.severity}</span>
                {m.field ? <button className="link" onClick={() => onPick(m)}>{m.text}</button> : <span>{m.text}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Other open comment panels of the same page reload when one adds a comment */
const COMMENTS_EVENT = 'mm-comments-changed';

/** Comments of the request (backend GET/POST /requests/:id/comments), oldest first, newest last. `bare` = inside a view section (no card). */
export function CommentsPanel({ transId, canComment, bare }: { transId: string; canComment: boolean; bare?: boolean }) {
  const [items, setItems] = useState<Comment[] | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => listComments(transId)
    .then((r) => { setItems([...r].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))); setError(''); })
    .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    const on = (e: Event) => { if ((e as CustomEvent).detail?.transId === transId) void load(); };
    window.addEventListener(COMMENTS_EVENT, on);
    return () => window.removeEventListener(COMMENTS_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transId]);
  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addComment(transId, text.trim());
      setText('');
      await load();
      window.dispatchEvent(new CustomEvent(COMMENTS_EVENT, { detail: { transId } }));
    } catch (e) { setError(e instanceof Error ? e.message : 'The comment could not be added.'); }
    finally { setBusy(false); }
  }
  const Wrap = bare ? 'div' : 'section';
  return (
    <Wrap className={bare ? 'comments-bare' : 'card'}>
      <h3>Comments {items && <span className="count-chip">{items.length}</span>}</h3>
      {error && <p className="err small" role="alert">{error} <button type="button" className="link" onClick={() => void load()}>Try again</button></p>}
      {!items && !error && <p className="muted small">Loading…</p>}
      {items && items.length === 0 && <p className="muted small">No comments.</p>}
      {items && items.map((c) => (
        <blockquote key={c.commentId}>
          {c.text}
          <small className="muted"> — {c.user}{c.level && ` (${c.level})`}{c.createdAt && ` · ${fmtDateTime(c.createdAt)}`}</small>
        </blockquote>
      ))}
      {canComment ? (
        <>
          <label className="field">
            <span className="field-label">Add a comment</span>
            <textarea rows={2} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="button" className="btn btn-sm" onClick={() => void add()} disabled={busy || !text.trim()}>Add comment</button>
        </>
      ) : <p className="muted small">You cannot add comments at this step.</p>}
    </Wrap>
  );
}
