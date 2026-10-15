import React, { useEffect, useState } from 'react';
import { Modal, MultiPersonField, TypeIcon } from './ui.jsx';
import { ISSUE_TYPES, PROJECT_NAME, isEpic, byRank, issueKey } from '../../shared/pm.js';
import { stageDateKeyFor } from '../../shared/utils.js';
import { FIELD_LABELS, ASSIGNABLE_DEVELOPERS } from '../../shared/constants.js';

// Jira's "Create issue" dialog. Required fields match what the original New Item panel required
// (summary, status, module, functional area, priority) for anything but an epic or sub-task,
// so reports that group on those fields keep working.
export default function CreateIssueModal({ ws, preset = {}, profileName, onClose, onCreated, onError }) {
  const { options, statusOrder, people, epics, sprints, items, pmReady, createItem } = ws;
  const [form, setForm] = useState(() => ({
    issueType: 'Task', devList: '', description: '', status: statusOrder[0] || 'Not Started',
    area: '', func: '', priority: '', developer: '', epicId: '', sprintId: '', parentId: '',
    storyPoints: '', labels: '', startDate: '', targetDate: '', impact: '', complexity: '',
    spocFunction: '', spocIT: '', devFactory: '', remarks: '',
    ...preset,
  }));
  const [another, setAnother] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);

  // AI command bar "create_draft" handoff from Home.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('aiPendingDraft');
      if (raw) {
        setForm((f) => ({ ...f, ...JSON.parse(raw) }));
        sessionStorage.removeItem('aiPendingDraft');
      }
    } catch { /* ignore */ }
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const light = form.issueType === 'Epic' || form.issueType === 'Sub-task';
  const required = light ? ['devList'] : ['devList', 'status', 'area', 'func', 'priority'];
  const missing = required.filter((k) => !String(form[k] || '').trim());
  const openSprints = sprints.filter((s) => s.state !== 'closed');
  const parents = items.filter((x) => !isEpic(x) && x.issueType !== 'Sub-task').sort(byRank);
  const types = pmReady ? ISSUE_TYPES : ISSUE_TYPES.filter((t) => t.key === 'Task');

  async function submit() {
    setTouched(true);
    if (missing.length) { setError(`Please fill in: ${missing.map((k) => (k === 'devList' ? 'Summary' : FIELD_LABELS[k])).join(', ')}.`); return; }
    if (form.issueType === 'Sub-task' && !form.parentId) { setError('A sub-task needs a parent issue.'); return; }
    setSaving(true); setError(null);
    try {
      const payload = { ...form, devList: form.devList.trim() };
      if (payload.issueType === 'Epic') { payload.epicId = ''; payload.sprintId = ''; }
      if (payload.issueType !== 'Sub-task') payload.parentId = '';
      if (!payload.reporter && profileName) payload.reporter = profileName;
      const saved = await createItem(payload);
      onCreated?.(saved, { keepOpen: another });
      if (another) {
        setForm((f) => ({ ...f, devList: '', description: '', storyPoints: '' }));
        setTouched(false);
        setSaving(false);
      } else {
        onClose();
      }
    } catch (e) {
      setError(e.message || 'Could not create issue');
      onError?.(e.message);
      setSaving(false);
    }
  }

  const bad = (k) => touched && missing.includes(k);
  const stageKey = stageDateKeyFor(form.status);

  return (
    <Modal
      title="Create issue"
      onClose={onClose}
      width={680}
      className="pm-create"
      footer={<>
        <label className="pm-check-label pm-create-another"><input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} /> Create another</label>
        <button type="button" className="pm-btn pm-btn-subtle" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="pm-btn pm-btn-primary" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
      </>}
    >
      <p className="pm-modal-lead">Required fields are marked with an asterisk <i className="pm-req">*</i></p>
      <div className="pm-form">
        <div className="pm-field-row">
          <label className="pm-field"><span>Project</span><input value={PROJECT_NAME} disabled /></label>
          <label className="pm-field"><span>Issue type<i>*</i></span>
            <div className="pm-select-icon">
              <TypeIcon type={form.issueType} />
              <select value={form.issueType} onChange={(e) => set('issueType', e.target.value)}>
                {types.map((t) => <option key={t.key} value={t.key}>{t.key}</option>)}
              </select>
            </div>
          </label>
        </div>
        <label className="pm-field"><span>Summary<i>*</i></span>
          <input className={bad('devList') ? 'is-invalid' : ''} value={form.devList} onChange={(e) => set('devList', e.target.value)} autoFocus placeholder="e.g. Vendor master approval workflow" />
        </label>
        {pmReady && (
          <label className="pm-field"><span>Description</span>
            <textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Scope, business need, acceptance criteria…" />
          </label>
        )}
        {form.issueType === 'Sub-task' && (
          <label className="pm-field"><span>Parent issue<i>*</i></span>
            <select value={form.parentId} onChange={(e) => set('parentId', e.target.value)}>
              <option value="">Select parent</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{issueKey(p)} — {p.devList}</option>)}
            </select>
          </label>
        )}
        <div className="pm-field-row">
          <label className="pm-field"><span>Status{!light && <i>*</i>}</span>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {statusOrder.map((s) => <option key={s}>{s}</option>)}
            </select>
            {stageKey && <small className="pm-muted">{FIELD_LABELS[stageKey]} will default to today.</small>}
          </label>
          <label className="pm-field"><span>Priority{!light && <i>*</i>}</span>
            <select className={bad('priority') ? 'is-invalid' : ''} value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="">Select</option>
              {(options.priority || []).map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <div className="pm-field-row">
          <label className="pm-field"><span>Module{!light && <i>*</i>}</span>
            <select className={bad('area') ? 'is-invalid' : ''} value={form.area} onChange={(e) => set('area', e.target.value)}>
              <option value="">Select</option>
              {(options.area || []).map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className="pm-field"><span>Functional area / process{!light && <i>*</i>}</span>
            <input className={bad('func') ? 'is-invalid' : ''} value={form.func} onChange={(e) => set('func', e.target.value)} placeholder="e.g. Procure to Pay" />
          </label>
        </div>
        <div className="pm-field-row">
          <label className="pm-field"><span>Assignee</span>
            <select value={form.developer} onChange={(e) => set('developer', e.target.value)}>
              <option value="">Unassigned</option>
              {ASSIGNABLE_DEVELOPERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {profileName && ASSIGNABLE_DEVELOPERS.includes(profileName) && form.developer !== profileName && <button type="button" className="pm-link-btn pm-assign-me" onClick={() => set('developer', profileName)}>Assign to me</button>}
          </label>
          {pmReady && (
            <label className="pm-field"><span>Story points</span>
              <input type="number" min="0" step="0.5" value={form.storyPoints} onChange={(e) => set('storyPoints', e.target.value)} placeholder="e.g. 3" />
            </label>
          )}
        </div>
        <datalist id="create-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        {pmReady && form.issueType !== 'Epic' && (
          <div className="pm-field-row">
            <label className="pm-field"><span>Epic</span>
              <select value={form.epicId} onChange={(e) => set('epicId', e.target.value)}>
                <option value="">None</option>
                {epics.map((e) => <option key={e.id} value={e.id}>{e.devList}</option>)}
              </select>
            </label>
            <label className="pm-field"><span>Sprint</span>
              <select value={form.sprintId} onChange={(e) => set('sprintId', e.target.value)}>
                <option value="">Backlog</option>
                {openSprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === 'active' ? ' (active)' : ''}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="pm-field-row">
          <label className="pm-field"><span>Start date</span><input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
          <label className="pm-field"><span>Due date</span><input type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></label>
        </div>
        {pmReady && (
          <label className="pm-field"><span>Labels</span>
            <input value={form.labels} onChange={(e) => set('labels', e.target.value)} placeholder="Comma separated, e.g. S4-migration, audit" />
          </label>
        )}
        <details className="pm-more-fields">
          <summary>More delivery fields</summary>
          <div className="pm-field-row">
            <label className="pm-field"><span>Business impact</span>
              <select value={form.impact} onChange={(e) => set('impact', e.target.value)}><option value="">Select</option>{(options.impact || []).map((v) => <option key={v}>{v}</option>)}</select>
            </label>
            <label className="pm-field"><span>Technical complexity</span>
              <select value={form.complexity} onChange={(e) => set('complexity', e.target.value)}><option value="">Select</option>{(options.complexity || []).map((v) => <option key={v}>{v}</option>)}</select>
            </label>
          </div>
          <div className="pm-field-row">
            <label className="pm-field"><span>Function Owner</span><input list="create-people" value={form.spocFunction} onChange={(e) => set('spocFunction', e.target.value)} /></label>
            <div className="pm-field"><span>IT Stakeholders</span><MultiPersonField value={form.spocIT} people={people} onSave={(v) => set('spocIT', v)} placeholder="Add IT stakeholders…" /></div>
          </div>
          <div className="pm-field-row">
            <label className="pm-field"><span>Dev Factory</span>
              <select value={form.devFactory} onChange={(e) => set('devFactory', e.target.value)}><option value="">Select</option>{(options.devFactory || []).map((v) => <option key={v}>{v}</option>)}</select>
            </label>
            <label className="pm-field"><span>Remarks</span><input value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></label>
          </div>
        </details>
      </div>
      {error && <div className="pm-error">{error}</div>}
    </Modal>
  );
}
