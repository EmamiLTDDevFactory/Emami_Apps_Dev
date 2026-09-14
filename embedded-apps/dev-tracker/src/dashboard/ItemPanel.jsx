import React, { useEffect, useMemo, useState } from 'react';
import { FIELDS, STAGE_PIPELINE, MANUAL_ONLY_STATUSES, FIELD_LABELS as LABELS } from '../shared/constants.js';
import { suggestedStatus, revisedTarget, fmtDate } from '../shared/utils.js';
import { apiCreate, apiUpdate, apiDelete, apiHistory, getCurrentUserEmail } from '../shared/api.js';

const FIELD_GROUPS = [
  { title: 'Overview', fields: ['devList', 'status', 'func'] },
  { title: 'Classification', fields: ['area', 'priority', 'impact', 'complexity'] },
  { title: 'Ownership', fields: ['spocFunction', 'spocIT', 'devFactory', 'developer'] },
  { title: 'Timeline', fields: ['startDate', 'reqDiscussion', 'fsPrep', 'development', 'itTesting', 'userTesting', 'hypercare', 'targetDate'] },
  { title: 'Effort', fields: ['devTime', 'rework'] },
  { title: 'Notes', fields: ['reasonCategory', 'reasonDelay', 'remarks'] },
];

const DATE_FIELDS = new Set(['startDate', 'reqDiscussion', 'fsPrep', 'development', 'itTesting', 'userTesting', 'targetDate']);
const NUMBER_FIELDS = new Set(['hypercare', 'devTime', 'rework']);
const SELECT_FIELDS = {
  status: 'status', area: 'area', priority: 'priority', impact: 'impact',
  complexity: 'complexity', devFactory: 'devFactory', reasonCategory: 'reasonCategory',
};
function emptyForm() {
  const f = {};
  for (const key of FIELDS) f[key] = '';
  return f;
}

export default function ItemPanel({ mode, item, options, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const f = emptyForm();
    if (item) for (const key of FIELDS) f[key] = item[key] ?? '';
    return f;
  });
  const [invalidDevList, setInvalidDevList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState({ loading: mode === 'edit', rows: [] });
  const [statusApplied, setStatusApplied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const email = getCurrentUserEmail();

  useEffect(() => {
    // AI create_draft handoff: prefill from sessionStorage on the New Item panel.
    if (mode === 'new') {
      try {
        const raw = sessionStorage.getItem('aiPendingDraft');
        if (raw) {
          const draft = JSON.parse(raw);
          setForm((f) => ({ ...f, ...draft }));
          sessionStorage.removeItem('aiPendingDraft');
        }
      } catch {
        /* ignore */
      }
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'edit' || !item) return;
    let cancelled = false;
    apiHistory(item.id, email)
      .then((rows) => !cancelled && setHistory({ loading: false, rows: (rows || []).slice(0, 8) }))
      .catch(() => !cancelled && setHistory({ loading: false, rows: null }));
    return () => {
      cancelled = true;
    };
  }, [mode, item]);

  const suggestion = useMemo(() => {
    if (MANUAL_ONLY_STATUSES.includes(form.status)) return null;
    const s = suggestedStatus(form);
    return s !== form.status ? s : null;
  }, [form]);

  const revised = useMemo(() => revisedTarget(form), [form.targetDate, form.rework]);
  const showReworkWarning = Number(form.rework) > 0 && ['Hypercare', 'Completed'].includes(form.status);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'devList' && value.trim()) setInvalidDevList(false);
  }

  async function handleSave() {
    if (!form.devList.trim()) {
      setInvalidDevList(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {};
      for (const key of FIELDS) payload[key] = form[key] === '' ? '' : form[key];
      const saved = mode === 'edit' ? await apiUpdate(item.id, payload, email) : await apiCreate(payload, email);
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setSaving(true);
    try {
      await apiDelete(item.id, email);
      onSaved(null, { deletedId: item.id });
    } catch (e) {
      setError(e.message || 'Failed to delete item');
      setSaving(false);
    }
  }

  function renderField(key) {
    const label = LABELS[key];
    if (SELECT_FIELDS[key]) {
      const opts = options[SELECT_FIELDS[key]] || [];
      return (
        <div className="field" key={key}>
          <label>{label}</label>
          <select value={form[key] || ''} onChange={(e) => setField(key, e.target.value)}>
            <option value="">—</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (DATE_FIELDS.has(key)) {
      return (
        <div className="field" key={key}>
          <label>{label}</label>
          <input type="date" value={form[key] || ''} onChange={(e) => setField(key, e.target.value)} />
        </div>
      );
    }
    if (NUMBER_FIELDS.has(key)) {
      return (
        <div className="field" key={key}>
          <label>{label}</label>
          <input type="number" min="0" value={form[key] ?? ''} onChange={(e) => setField(key, e.target.value)} />
        </div>
      );
    }
    if (key === 'remarks' || key === 'reasonDelay') {
      return (
        <div className="field" key={key} style={{ gridColumn: '1/-1' }}>
          <label>{label}</label>
          <textarea value={form[key] || ''} onChange={(e) => setField(key, e.target.value)} />
        </div>
      );
    }
    return (
      <div className="field" key={key}>
        <label>{label}</label>
        <input
          type="text"
          value={form[key] || ''}
          className={key === 'devList' && invalidDevList ? 'invalid' : ''}
          onChange={(e) => setField(key, e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="overlay" id="overlay" onMouseDown={(e) => e.target.id === 'overlay' && onClose()}>
      <div className="panel">
        <div className="panel-head">
          <h2>{mode === 'edit' ? 'Edit item' : 'New item'}</h2>
          <button className="panel-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {suggestion && (
          <div className="hint-box">
            <span>Dates suggest status: <b>{suggestion}</b></span>
            <button onClick={() => { setField('status', suggestion); setStatusApplied(true); }}>Apply</button>
          </div>
        )}
        {form.targetDate && (
          <div className="readonly-box">Revised Target Date (auto): <b>{revised ? fmtDate(revised) : '—'}</b></div>
        )}
        {showReworkWarning && (
          <div className="hint-box warn">Rework of {form.rework} day(s) recorded after reaching {form.status} — double check the revised target above.</div>
        )}

        {FIELD_GROUPS.map((group) => (
          <div className="field-group" key={group.title}>
            <div className="field-group-title">{group.title}</div>
            <div className="field-row">
              {group.fields.map(renderField)}
            </div>
          </div>
        ))}

        {mode === 'edit' && (
          <div className="field-group">
            <div className="field-group-title">History</div>
            {history.loading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>}
            {!history.loading && history.rows === null && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Unable to load history.</div>}
            {!history.loading && history.rows && history.rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No changes logged yet.</div>}
            {!history.loading && history.rows && history.rows.map((h, i) => (
              <div className="history-item" key={i}>
                <b>{h.field}</b>: {h.oldValue || '—'} → {h.newValue || '—'}
                <span style={{ float: 'right', color: 'var(--muted)' }}>{fmtDate((h.changedAt || '').slice(0, 10))}</span>
              </div>
            ))}
          </div>
        )}

        {error && <div style={{ color: 'var(--st-red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

        <div className="panel-actions">
          <div>
            {mode === 'edit' && (
              <button className="btn btn-ghost" style={{ color: 'var(--st-red)' }} onClick={handleDelete} disabled={saving}>
                {confirmingDelete ? 'Confirm delete?' : 'Delete'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
