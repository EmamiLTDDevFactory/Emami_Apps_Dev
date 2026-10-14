import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, PriorityIcon, StatusPicker, TypeIcon, Popover, ProgressBar, StatusLozenge, TypeAndKey, epicColor } from './ui.jsx';
import { apiHistory, apiComments, apiCommentCreate, apiCommentUpdate, apiCommentDelete } from '../../shared/api.js';
import { FIELD_LABELS } from '../../shared/constants.js';
import { fmtDate, relativeTime, revisedTarget, isOverdue, riskLevel } from '../../shared/utils.js';
import { ISSUE_TYPES, PRIORITY_META, PROJECT_NAME, issueKey, typeOf, isEpic, statusCategory, byRank, rankBetween, parseLabels, points, fmtPoints } from '../../shared/pm.js';
import { RISK_META } from '../../shared/constants.js';
import { ChevronRightIcon, MoreIcon, PlusIcon, TrashIcon, GavelIcon } from '../../shared/icons.jsx';
import { ROUTES } from '../../shared/routes.js';

const PM_LABELS = {
  issueType: 'Issue Type', description: 'Description', storyPoints: 'Story Points', epicId: 'Epic',
  sprintId: 'Sprint', parentId: 'Parent', labels: 'Labels', reporter: 'Reporter', developer: 'Assignee',
  devList: 'Summary', targetDate: 'Due Date',
};
const labelFor = (f) => PM_LABELS[f] || FIELD_LABELS[f] || f;

// Jira-style issue view: content on the left (summary, description, child issues, activity),
// fields on the right. Every field saves on its own as soon as it's changed — there is no global
// Save button, same as Jira.
export default function IssueView({ id, ws, email, profileName, isAdmin, onClose, onOpen, onError, onCreate }) {
  const { byId, items, sprints, options, statusOrder, people, epics, updateItem, createItem, deleteItem, pmReady } = ws;
  const it = byId.get(String(id));
  const [history, setHistory] = useState(null);
  const [comments, setComments] = useState(null);
  const [tab, setTab] = useState('comments');
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !e.target.closest('input,textarea,select')) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    if (!it) return undefined;
    let cancelled = false;
    apiHistory(it.id, email).then((rows) => !cancelled && setHistory(rows || [])).catch(() => !cancelled && setHistory([]));
    return () => { cancelled = true; };
  }, [it?.id, historyTick]);

  useEffect(() => {
    if (!it || !pmReady) return undefined;
    let cancelled = false;
    apiComments(it.id, email).then((rows) => !cancelled && setComments(rows || [])).catch(() => !cancelled && setComments([]));
    return () => { cancelled = true; };
  }, [it?.id, pmReady]);

  const children = useMemo(() => {
    if (!it) return [];
    return items.filter((c) => (isEpic(it) ? String(c.epicId) === String(it.id) : String(c.parentId) === String(it.id))).sort(byRank);
  }, [items, it]);

  if (!it) {
    return (
      <div className="pm-issue-backdrop" onMouseDown={onClose}>
        <div className="pm-issue pm-issue-missing" onMouseDown={(e) => e.stopPropagation()}>
          <p>This issue doesn't exist or was deleted.</p>
          <button type="button" className="pm-btn pm-btn-subtle" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const epic = it.epicId ? byId.get(String(it.epicId)) : null;
  const parent = it.parentId ? byId.get(String(it.parentId)) : null;
  const type = typeOf(it);
  const openSprints = sprints.filter((s) => s.state !== 'closed' || String(s.id) === String(it.sprintId));
  const rt = revisedTarget(it);
  const risk = riskLevel(it);

  async function save(patch) {
    try {
      await updateItem(it.id, patch);
      setHistoryTick((t) => t + 1);
    } catch (e) {
      onError(e.message || 'Could not save');
    }
  }

  async function handleDelete() {
    setMenuOpen(false);
    const extra = children.length ? ` Its ${children.length} child issue(s) will be kept but unlinked.` : '';
    if (!window.confirm(`Delete ${issueKey(it)} "${it.devList}"? This can't be undone.${extra}`)) return;
    try { await deleteItem(it.id); onClose(); } catch (e) { onError(e.message || 'Could not delete'); }
  }

  function copyLink() {
    setMenuOpen(false);
    const url = `${window.location.origin}${window.location.pathname}?issue=${issueKey(it)}`;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  }

  const sprintName = (sid) => sprints.find((s) => String(s.id) === String(sid))?.name;
  const itemName = (iid) => { const x = byId.get(String(iid)); return x ? `${issueKey(x)} ${x.devList}` : null; };
  const displayValue = (field, v) => {
    if (v == null || v === '') return 'None';
    if (field === 'sprintId') return sprintName(v) || 'a sprint';
    if (field === 'epicId' || field === 'parentId') return itemName(v) || 'an issue';
    if (field === 'priority') return PRIORITY_META[v]?.label ? `${PRIORITY_META[v].label} (${v})` : v;
    return v;
  };

  const activity = (() => {
    const h = (history || []).map((r) => ({ kind: 'history', at: r.changedAt, row: r }));
    const c = (comments || []).map((r) => ({ kind: 'comment', at: r.createdAt, row: r }));
    if (tab === 'history') return h;
    if (tab === 'comments') return c;
    return [...h, ...c].sort((a, b) => new Date(b.at) - new Date(a.at));
  })();

  return (
    <div className="pm-issue-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pm-issue" role="dialog" aria-modal="true" aria-label={`${issueKey(it)} ${it.devList}`}>
        <div className="pm-issue-top">
          <nav className="pm-crumbs" aria-label="Breadcrumb">
            <span>{PROJECT_NAME}</span>
            {epic && <><ChevronRightIcon size={10} /><button type="button" className="pm-crumb-link" onClick={() => onOpen(epic)}><TypeIcon type="Epic" size={14} /> {issueKey(epic)}</button></>}
            {parent && <><ChevronRightIcon size={10} /><button type="button" className="pm-crumb-link" onClick={() => onOpen(parent)}><TypeIcon type={typeOf(parent)} size={14} /> {issueKey(parent)}</button></>}
            <ChevronRightIcon size={10} />
            <TypePicker type={type} disabled={!pmReady} onChange={(t) => save({ issueType: t, ...(t === 'Epic' ? { epicId: '' } : {}), ...(t !== 'Sub-task' ? { parentId: '' } : {}) })} />
            <span className="pm-crumb-key">{issueKey(it)}</span>
          </nav>
          <div className="pm-issue-top-actions">
            {copied && <span className="pm-muted">Link copied</span>}
            <span className="pm-rel">
              <button type="button" className="pm-icon-btn" aria-label="More actions" onClick={() => setMenuOpen((o) => !o)}><MoreIcon size={18} /></button>
              <Popover open={menuOpen} onClose={() => setMenuOpen(false)} align="right">
                <button type="button" className="pm-pop-item" onClick={copyLink}>Copy link</button>
                <button type="button" className="pm-pop-item pm-danger" onClick={handleDelete}>Delete</button>
              </Popover>
            </span>
            <button type="button" className="pm-icon-btn" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>

        <div className="pm-issue-cols">
          <div className="pm-issue-main">
            <InlineText className="pm-issue-summary" value={it.devList} onSave={(v) => v.trim() && save({ devList: v.trim() })} required />
            <CcbLink item={it} />

            <section className="pm-issue-block">
              <h3>Description</h3>
              {pmReady ? (
                <DescriptionEditor value={it.description || ''} onSave={(v) => save({ description: v })} />
              ) : (
                <p className="pm-muted">Descriptions become available once the updated API is deployed. Use Remarks meanwhile.</p>
              )}
            </section>

            {pmReady && type !== 'Sub-task' && (
              <ChildIssues
                parent={it}
                list={children}
                isEpicParent={isEpic(it)}
                onOpen={onOpen}
                onCreateChild={async (summary) => {
                  const last = children[children.length - 1];
                  const fields = isEpic(it)
                    ? { devList: summary, issueType: 'Task', epicId: it.id, area: it.area || '' }
                    : { devList: summary, issueType: 'Sub-task', parentId: it.id, epicId: it.epicId || '', sprintId: it.sprintId || '', area: it.area || '' };
                  try { await createItem({ ...fields, status: 'Not Started', rank: rankBetween(last, null) }); } catch (e) { onError(e.message || 'Could not create'); }
                }}
                onLinkExisting={isEpic(it) ? () => onCreate({ issueType: 'Task', epicId: it.id }) : null}
              />
            )}

            <section className="pm-issue-block">
              <h3>Activity</h3>
              <div className="pm-tabs-sm" role="tablist">
                {[['all', 'All'], ['comments', 'Comments'], ['history', 'History']].map(([k, l]) => (
                  <button type="button" role="tab" aria-selected={tab === k} key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>
              {tab !== 'history' && pmReady && (
                <CommentComposer
                  name={profileName || email}
                  onSubmit={async (body) => {
                    const saved = await apiCommentCreate(it.id, body, email);
                    setComments((cur) => [...(cur || []), saved]);
                  }}
                  onError={onError}
                />
              )}
              {tab !== 'history' && !pmReady && <p className="pm-muted">Comments become available once the updated API is deployed.</p>}
              <div className="pm-activity">
                {(tab === 'history' ? history === null : tab === 'comments' ? comments === null && pmReady : history === null) && <div className="pm-muted">Loading…</div>}
                {activity.map((a) => (a.kind === 'comment' ? (
                  <Comment
                    key={`c-${a.row.id}`}
                    c={a.row}
                    canDelete={a.row.mine || isAdmin}
                    onSave={async (body) => {
                      const saved = await apiCommentUpdate(a.row.id, body, email);
                      setComments((cur) => cur.map((x) => (x.id === a.row.id ? saved : x)));
                    }}
                    onDelete={async () => {
                      if (!window.confirm('Delete this comment?')) return;
                      try { await apiCommentDelete(a.row.id, email); setComments((cur) => cur.filter((x) => x.id !== a.row.id)); } catch (e) { onError(e.message); }
                    }}
                    onError={onError}
                  />
                ) : (
                  <div className="pm-hist" key={`h-${a.row.id ?? a.at}-${a.row.field}`}>
                    <Avatar name={a.row.changedByUsername} size={28} />
                    <div>
                      <div className="pm-hist-line">
                        <b>{a.row.changedByUsername || 'Someone'}</b>{' '}
                        {a.row.field === '__created__' ? 'created the issue' : <>changed the <b>{labelFor(a.row.field)}</b></>}
                        <span className="pm-muted"> · {relativeTime(a.row.changedAt)}</span>
                      </div>
                      {a.row.field !== '__created__' && (
                        <div className="pm-hist-change">
                          {a.row.field === 'status' ? <StatusLozenge status={a.row.oldValue} /> : <span className="pm-hist-old">{displayValue(a.row.field, a.row.oldValue)}</span>}
                          <span aria-hidden="true">→</span>
                          {a.row.field === 'status' ? <StatusLozenge status={a.row.newValue} /> : <span>{displayValue(a.row.field, a.row.newValue)}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )))}
                {tab === 'comments' && comments && !comments.length && <div className="pm-muted">No comments yet.</div>}
                {tab === 'history' && history && !history.length && <div className="pm-muted">No changes recorded yet.</div>}
              </div>
            </section>
          </div>

          <aside className="pm-issue-side">
            <div className="pm-issue-status-row">
              <StatusPicker status={it.status} statuses={statusOrder} onChange={(s) => save({ status: s })} size="lg" />
              {risk !== 'onTrack' && risk !== 'done' && (
                <span className="pm-risk" style={{ color: RISK_META[risk].color, background: RISK_META[risk].soft }}>{RISK_META[risk].label}</span>
              )}
            </div>

            <div className="pm-details">
              <div className="pm-details-head">Details</div>
              <Field label="Assignee">
                <PersonField value={it.developer} people={people} onSave={(v) => save({ developer: v })} />
                {profileName && (it.developer || '') !== profileName && (
                  <button type="button" className="pm-link-btn pm-assign-me" onClick={() => save({ developer: profileName })}>Assign to me</button>
                )}
              </Field>
              <Field label="Reporter">
                {pmReady ? <PersonField value={it.reporter} people={people} onSave={(v) => save({ reporter: v })} /> : <span className="pm-muted">—</span>}
              </Field>
              <Field label="Priority">
                <SelectField value={it.priority} options={options.priority || []} render={(p) => <PriorityIcon priority={p} showLabel />} onSave={(v) => save({ priority: v })} />
              </Field>
              {pmReady && !isEpic(it) && (
                <Field label="Epic">
                  <SelectField
                    value={it.epicId ? String(it.epicId) : ''}
                    options={epics.filter((e) => e.id !== it.id).map((e) => String(e.id))}
                    render={(v) => { const e = byId.get(v); return e ? <span className="pm-epic-inline" style={{ '--epic': epicColor(e) }}>{e.devList}</span> : v; }}
                    onSave={(v) => save({ epicId: v })}
                    noneLabel="None"
                  />
                </Field>
              )}
              {pmReady && type === 'Sub-task' && (
                <Field label="Parent">
                  <SelectField
                    value={it.parentId ? String(it.parentId) : ''}
                    options={items.filter((x) => !isEpic(x) && x.issueType !== 'Sub-task' && x.id !== it.id).sort(byRank).map((x) => String(x.id))}
                    render={(v) => itemName(v) || v}
                    onSave={(v) => save({ parentId: v })}
                    noneLabel="None"
                    searchable
                  />
                </Field>
              )}
              {pmReady && !isEpic(it) && (
                <Field label="Sprint">
                  <SelectField
                    value={it.sprintId ? String(it.sprintId) : ''}
                    options={openSprints.map((s) => String(s.id))}
                    render={(v) => { const s = sprints.find((x) => String(x.id) === v); return s ? `${s.name}${s.state === 'active' ? ' (active)' : s.state === 'closed' ? ' (closed)' : ''}` : v; }}
                    onSave={(v) => save({ sprintId: v })}
                    noneLabel="Backlog"
                  />
                </Field>
              )}
              {pmReady && (
                <Field label="Story points">
                  <InlineText type="number" value={it.storyPoints ?? ''} placeholder="None" onSave={(v) => save({ storyPoints: v })} />
                </Field>
              )}
              {pmReady && (
                <Field label="Labels">
                  <LabelsField value={it.labels} onSave={(v) => save({ labels: v })} />
                </Field>
              )}
              <Field label="Module">
                <SelectField value={it.area} options={options.area || []} onSave={(v) => save({ area: v })} />
              </Field>
              <Field label="Start date">
                <InlineText type="date" value={it.startDate || ''} onSave={(v) => save({ startDate: v })} display={(v) => (v ? fmtDate(v) : 'None')} />
              </Field>
              <Field label="Due date">
                <InlineText type="date" value={it.targetDate || ''} onSave={(v) => save({ targetDate: v })} display={(v) => (v ? fmtDate(v) : 'None')} />
                {rt && rt !== it.targetDate && <div className="pm-muted pm-sub">Revised: {fmtDate(rt)} (+{it.rework}d rework)</div>}
                {isOverdue(it) && <div className="pm-overdue-note">Overdue</div>}
              </Field>
            </div>

            <Collapsible title="SAP details" defaultOpen>
              <Field label="Functional area"><InlineText value={it.func || ''} placeholder="None" onSave={(v) => save({ func: v })} /></Field>
              <Field label="Business impact"><SelectField value={it.impact} options={options.impact || []} onSave={(v) => save({ impact: v })} /></Field>
              <Field label="Complexity"><SelectField value={it.complexity} options={options.complexity || []} onSave={(v) => save({ complexity: v })} /></Field>
              <Field label="SPOC (Functional)"><PersonField value={it.spocFunction} people={people} onSave={(v) => save({ spocFunction: v })} /></Field>
              <Field label="SPOC (IT)"><PersonField value={it.spocIT} people={people} onSave={(v) => save({ spocIT: v })} /></Field>
              <Field label="Dev Factory"><SelectField value={it.devFactory} options={options.devFactory || []} onSave={(v) => save({ devFactory: v })} /></Field>
              <Field label="Man-days"><InlineText type="number" value={it.devTime ?? ''} placeholder="None" onSave={(v) => save({ devTime: v })} /></Field>
              <Field label="Rework (days)"><InlineText type="number" value={it.rework ?? ''} placeholder="None" onSave={(v) => save({ rework: v })} /></Field>
              <Field label="Delay reason"><SelectField value={it.reasonCategory} options={options.reasonCategory || []} onSave={(v) => save({ reasonCategory: v })} /></Field>
              <Field label="Delay detail"><InlineText multiline value={it.reasonDelay || ''} placeholder="None" onSave={(v) => save({ reasonDelay: v })} /></Field>
              <Field label="Remarks"><InlineText multiline value={it.remarks || ''} placeholder="None" onSave={(v) => save({ remarks: v })} /></Field>
            </Collapsible>

            <Collapsible title="Stage dates">
              {['reqDiscussion', 'fsPrep', 'development', 'itTesting', 'userTesting', 'hypercareDate', 'onHoldDate', 'completedDate', 'cancelledDate'].map((k) => (
                <Field key={k} label={FIELD_LABELS[k]}>
                  <InlineText type="date" value={it[k] || ''} onSave={(v) => save({ [k]: v })} display={(v) => (v ? fmtDate(v) : 'None')} />
                </Field>
              ))}
              <Field label="Hypercare (days)"><InlineText type="number" value={it.hypercare ?? ''} placeholder="None" onSave={(v) => save({ hypercare: v })} /></Field>
            </Collapsible>

            <div className="pm-issue-stamps">
              {it.createdAt && <div>Created {relativeTime(it.createdAt)}</div>}
              {it.updatedAt && <div>Updated {relativeTime(it.updatedAt)}</div>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="pm-field-line">
      <div className="pm-field-label">{label}</div>
      <div className="pm-field-value">{children}</div>
    </div>
  );
}

function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pm-details">
      <button type="button" className="pm-details-head pm-details-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`pm-caret${open ? ' is-open' : ''}`}><ChevronRightIcon size={11} /></span>{title}
      </button>
      {open && children}
    </div>
  );
}

// Click-to-edit value: text, number, date or multi-line. Saves on blur/Enter, Esc cancels.
export function InlineText({ value, onSave, type = 'text', placeholder = 'None', className = '', multiline = false, display, required = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef(null);
  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); if (ref.current.select && type === 'text') ref.current.select(); } }, [editing]);
  function commit() {
    setEditing(false);
    const v = typeof draft === 'string' ? draft : String(draft ?? '');
    if (required && !v.trim()) { setDraft(value ?? ''); return; }
    if (String(value ?? '') !== v) onSave(v);
  }
  if (editing) {
    const common = {
      ref,
      className: `pm-inline-input ${className}`,
      value: draft,
      onChange: (e) => { setDraft(e.target.value); },
      onBlur: commit,
      onKeyDown: (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); setDraft(value ?? ''); setEditing(false); }
        if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
      },
    };
    return multiline ? <textarea rows={3} {...common} /> : <input type={type} min={type === 'number' ? 0 : undefined} {...common} />;
  }
  const shown = display ? display(value) : (value === '' || value == null ? null : String(value));
  return (
    <button type="button" className={`pm-inline-view ${className}${shown == null || shown === 'None' ? ' is-empty' : ''}`} onClick={() => setEditing(true)}>
      {shown == null ? placeholder : shown}
    </button>
  );
}

function SelectField({ value, options, onSave, render, noneLabel = 'None', searchable = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = [...options];
  if (value && !list.includes(value)) list.unshift(value);
  const shown = searchable && q ? list.filter((o) => String(render ? (typeof render(o) === 'string' ? render(o) : o) : o).toLowerCase().includes(q.toLowerCase())) : list;
  return (
    <span className="pm-rel">
      <button type="button" className={`pm-inline-view${value ? '' : ' is-empty'}`} onClick={() => setOpen((o) => !o)}>
        {value ? (render ? render(value) : value) : noneLabel}
      </button>
      <Popover open={open} onClose={() => { setOpen(false); setQ(''); }} className="pm-pop-wide">
        {(searchable || list.length > 10) && <input className="pm-pop-search" autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="pm-pop-scroll">
          <button type="button" className={`pm-pop-item${!value ? ' is-active' : ''}`} onClick={() => { setOpen(false); if (value) onSave(''); }}>{noneLabel}</button>
          {shown.map((o) => (
            <button type="button" key={o} className={`pm-pop-item${o === value ? ' is-active' : ''}`} onClick={() => { setOpen(false); setQ(''); if (o !== value) onSave(o); }}>
              {render ? render(o) : o}
            </button>
          ))}
        </div>
      </Popover>
    </span>
  );
}

function PersonField({ value, people, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const listId = useMemo(() => `people-${Math.random().toString(36).slice(2)}`, []);
  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
  function commit() {
    setEditing(false);
    if ((value || '') !== draft.trim()) onSave(draft.trim());
  }
  if (editing) {
    return (
      <>
        <input
          className="pm-inline-input"
          autoFocus
          list={listId}
          value={draft}
          placeholder="Type a name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
        />
        <datalist id={listId}>{people.map((p) => <option key={p} value={p} />)}</datalist>
      </>
    );
  }
  return (
    <button type="button" className={`pm-inline-view pm-person${value ? '' : ' is-empty'}`} onClick={() => setEditing(true)}>
      <Avatar name={value} size={22} /> <span>{value || 'Unassigned'}</span>
    </button>
  );
}

function LabelsField({ value, onSave }) {
  const labels = parseLabels(value);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  function add() {
    const v = draft.trim().replace(/,/g, ' ');
    setDraft('');
    if (v && !labels.includes(v)) onSave([...labels, v].join(', '));
  }
  return (
    <div className="pm-labels">
      {labels.map((l) => (
        <span className="pm-tag pm-tag-label" key={l}>
          {l}
          <button type="button" aria-label={`Remove ${l}`} onClick={() => onSave(labels.filter((x) => x !== l).join(', '))}>×</button>
        </span>
      ))}
      {editing ? (
        <input
          className="pm-inline-input pm-label-input"
          autoFocus
          value={draft}
          placeholder="Add label"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { add(); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
        />
      ) : (
        <button type="button" className="pm-inline-view is-empty" onClick={() => setEditing(true)}>{labels.length ? '+' : 'None'}</button>
      )}
    </div>
  );
}

function TypePicker({ type, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="pm-rel">
      <button type="button" className="pm-crumb-link" onClick={() => setOpen((o) => !o)} disabled={disabled} title="Change issue type">
        <TypeIcon type={type} size={14} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)}>
        <div className="pm-pop-head">Change issue type</div>
        {ISSUE_TYPES.map((t) => (
          <button type="button" key={t.key} className={`pm-pop-item${t.key === type ? ' is-active' : ''}`} onClick={() => { setOpen(false); if (t.key !== type) onChange(t.key); }}>
            <TypeIcon type={t.key} /> {t.key}
          </button>
        ))}
      </Popover>
    </span>
  );
}

function DescriptionEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  if (!editing) {
    return (
      <div className={`pm-desc${value ? '' : ' is-empty'}`} onClick={() => setEditing(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}>
        {value ? value.split('\n').map((line, i) => <p key={i}>{line || ' '}</p>) : 'Add a description…'}
      </div>
    );
  }
  return (
    <div>
      <textarea className="pm-desc-input" rows={7} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Describe the requirement, scope, acceptance criteria…"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { onSave(draft); setEditing(false); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }} />
      <div className="pm-editor-actions">
        <button type="button" className="pm-btn pm-btn-primary pm-btn-sm" onClick={() => { if (draft !== value) onSave(draft); setEditing(false); }}>Save</button>
        <button type="button" className="pm-btn pm-btn-subtle pm-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

function ChildIssues({ list, isEpicParent, onOpen, onCreateChild, onLinkExisting }) {
  const [adding, setAdding] = useState(false);
  const [summary, setSummary] = useState('');
  const done = list.filter((c) => statusCategory(c.status) === 'done').length;
  const inprog = list.filter((c) => statusCategory(c.status) === 'inprogress').length;
  const pts = list.reduce((s, c) => s + points(c), 0);
  async function submit() {
    const s = summary.trim();
    if (!s) return;
    setSummary('');
    await onCreateChild(s);
  }
  return (
    <section className="pm-issue-block">
      <div className="pm-block-head">
        <h3>{isEpicParent ? 'Issues in this epic' : 'Child issues'}</h3>
        <div className="pm-block-head-actions">
          {onLinkExisting && <button type="button" className="pm-link-btn" onClick={onLinkExisting}>Create with details</button>}
          <button type="button" className="pm-icon-btn" aria-label="Add child issue" onClick={() => setAdding(true)}><PlusIcon size={15} /></button>
        </div>
      </div>
      {list.length > 0 && (
        <div className="pm-child-progress">
          <ProgressBar done={done} inprogress={inprog} total={list.length} height={8} />
          <span className="pm-muted">{Math.round((done / list.length) * 100)}% done{pts ? ` · ${fmtPoints(pts)} pts` : ''}</span>
        </div>
      )}
      <div className="pm-child-list">
        {list.map((c) => (
          <div className="pm-child-row" key={c.id} onClick={() => onOpen(c)}>
            <TypeAndKey item={c} onOpen={onOpen} />
            <span className="pm-row-title">{c.devList}</span>
            <PriorityIcon priority={c.priority} />
            <Avatar name={c.developer} size={22} />
            <StatusLozenge status={c.status} />
          </div>
        ))}
      </div>
      {adding && (
        <div className="pm-quick-create">
          <TypeIcon type={isEpicParent ? 'Task' : 'Sub-task'} />
          <input autoFocus value={summary} placeholder="What needs to be done?" onChange={(e) => setSummary(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); } }}
            onBlur={() => { if (!summary.trim()) setAdding(false); }} />
        </div>
      )}
      {!list.length && !adding && <div className="pm-muted">{isEpicParent ? 'No issues in this epic yet.' : 'No child issues.'}</div>}
    </section>
  );
}

function CommentComposer({ name, onSubmit, onError }) {
  const [focused, setFocused] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const b = body.trim();
    if (!b) return;
    setBusy(true);
    try { await onSubmit(b); setBody(''); setFocused(false); } catch (e) { onError(e.message || 'Could not add comment'); }
    setBusy(false);
  }
  return (
    <div className="pm-composer">
      <Avatar name={name} size={30} />
      <div className="pm-composer-box">
        <textarea
          rows={focused ? 4 : 1}
          value={body}
          placeholder="Add a comment…"
          onFocus={() => setFocused(true)}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); if (!body) setFocused(false); } }}
          disabled={busy}
        />
        {focused && (
          <div className="pm-editor-actions">
            <button type="button" className="pm-btn pm-btn-primary pm-btn-sm" onClick={submit} disabled={busy || !body.trim()}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="pm-btn pm-btn-subtle pm-btn-sm" onClick={() => { setBody(''); setFocused(false); }}>Cancel</button>
            <span className="pm-muted pm-qc-hint">Ctrl+Enter to save</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Comment({ c, canDelete, onSave, onDelete, onError }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const edited = c.updatedAt && c.createdAt && new Date(c.updatedAt) - new Date(c.createdAt) > 1000;
  return (
    <div className="pm-comment">
      <Avatar name={c.authorName || c.authorEmail} size={30} />
      <div className="pm-comment-main">
        <div className="pm-hist-line"><b>{c.authorName || c.authorEmail}</b> <span className="pm-muted">{relativeTime(c.createdAt)}{edited ? ' (edited)' : ''}</span></div>
        {editing ? (
          <>
            <textarea className="pm-desc-input" rows={3} value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} />
            <div className="pm-editor-actions">
              <button type="button" className="pm-btn pm-btn-primary pm-btn-sm" onClick={async () => { try { await onSave(draft.trim()); setEditing(false); } catch (e) { onError(e.message); } }} disabled={!draft.trim()}>Save</button>
              <button type="button" className="pm-btn pm-btn-subtle pm-btn-sm" onClick={() => { setDraft(c.body); setEditing(false); }}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="pm-comment-body">{c.body.split('\n').map((l, i) => <p key={i}>{l || ' '}</p>)}</div>
        )}
        {!editing && (
          <div className="pm-comment-actions">
            {c.mine && <button type="button" className="pm-link-btn" onClick={() => setEditing(true)}>Edit</button>}
            {canDelete && <button type="button" className="pm-link-btn" onClick={onDelete}><TrashIcon size={12} /> Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// Assignments created by a Change Control Board approval carry their CR number as a label
// (backend/changeControl.js) — link back to the request, its decision and audit trail.
function CcbLink({ item }) {
  const crNo = parseLabels(item.labels).find((l) => /^CCB-\d{4}-\d+$/i.test(l));
  if (!crNo) return null;
  return (
    <a className="pm-ccb-link" href={`${ROUTES.ccbRequests}?cr=${encodeURIComponent(crNo)}`}>
      <GavelIcon size={14} />
      <span>Approved through the Change Control Board · <b>{crNo}</b></span>
      <span className="pm-ccb-link-go">View request →</span>
    </a>
  );
}
