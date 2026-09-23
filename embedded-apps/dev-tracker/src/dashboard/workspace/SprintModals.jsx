import React, { useState } from 'react';
import { Modal } from './ui.jsx';
import { todayStr } from '../../shared/utils.js';
import { isDone, points, fmtPoints, shiftDate } from '../../shared/pm.js';

const DURATIONS = [
  { weeks: 1, label: '1 week' },
  { weeks: 2, label: '2 weeks' },
  { weeks: 3, label: '3 weeks' },
  { weeks: 4, label: '4 weeks' },
  { weeks: 0, label: 'Custom' },
];

// Create / edit / start share one form. Starting requires dates (the backend enforces it too).
export function SprintModal({ mode, sprint, issueCount = 0, onClose, onSubmit }) {
  const [name, setName] = useState(sprint?.name || '');
  const [goal, setGoal] = useState(sprint?.goal || '');
  const [startDate, setStartDate] = useState(sprint?.startDate || (mode === 'start' ? todayStr() : ''));
  const [weeks, setWeeks] = useState(sprint?.startDate && sprint?.endDate ? 0 : 2);
  const [endDate, setEndDate] = useState(sprint?.endDate || (mode === 'start' ? shiftDate(todayStr(), 13) : ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function pickDuration(w) {
    setWeeks(w);
    if (w && startDate) setEndDate(shiftDate(startDate, w * 7 - 1));
  }
  function changeStart(v) {
    setStartDate(v);
    if (weeks && v) setEndDate(shiftDate(v, weeks * 7 - 1));
  }

  async function submit() {
    if (mode === 'start' && (!startDate || !endDate)) { setError('Start and end dates are required to start a sprint.'); return; }
    if (startDate && endDate && endDate < startDate) { setError('End date must be after the start date.'); return; }
    setSaving(true); setError(null);
    try {
      await onSubmit({ name: name.trim(), goal: goal.trim(), startDate, endDate });
      onClose();
    } catch (e) {
      setError(e.message || 'Could not save sprint');
      setSaving(false);
    }
  }

  const title = mode === 'start' ? `Start sprint` : mode === 'edit' ? `Edit sprint: ${sprint?.name}` : 'Create sprint';
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={520}
      footer={<>
        <button type="button" className="pm-btn pm-btn-subtle" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="pm-btn pm-btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : mode === 'start' ? 'Start' : mode === 'edit' ? 'Update' : 'Create'}</button>
      </>}
    >
      {mode === 'start' && <p className="pm-modal-lead"><b>{issueCount}</b> issue{issueCount === 1 ? '' : 's'} will be included in this sprint.</p>}
      <div className="pm-form">
        <label className="pm-field"><span>Sprint name{mode === 'start' && <i>*</i>}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sprint 12" autoFocus />
        </label>
        <label className="pm-field"><span>Duration</span>
          <select value={weeks} onChange={(e) => pickDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => <option key={d.weeks} value={d.weeks}>{d.label}</option>)}
          </select>
        </label>
        <div className="pm-field-row">
          <label className="pm-field"><span>Start date{mode === 'start' && <i>*</i>}</span>
            <input type="date" value={startDate} onChange={(e) => changeStart(e.target.value)} />
          </label>
          <label className="pm-field"><span>End date{mode === 'start' && <i>*</i>}</span>
            <input type="date" value={endDate} disabled={weeks !== 0} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
        <label className="pm-field"><span>Sprint goal</span>
          <textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What does the team want to achieve?" />
        </label>
      </div>
      {error && <div className="pm-error">{error}</div>}
    </Modal>
  );
}

export function CompleteSprintModal({ sprint, items, openSprints, onClose, onSubmit, onCreateSprint }) {
  const inSprint = items.filter((it) => String(it.sprintId) === String(sprint.id) && it.issueType !== 'Epic');
  const done = inSprint.filter(isDone);
  const open = inSprint.filter((it) => !isDone(it));
  const others = openSprints.filter((s) => s.id !== sprint.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      let target = moveTo;
      if (moveTo === '__new__') target = (await onCreateSprint())?.id || '';
      await onSubmit(target || null);
      onClose();
    } catch (e) {
      setError(e.message || 'Could not complete sprint');
      setSaving(false);
    }
  }

  const pts = (list) => fmtPoints(list.reduce((s, it) => s + points(it), 0));
  return (
    <Modal
      title={`Complete ${sprint.name}`}
      onClose={onClose}
      width={500}
      footer={<>
        <button type="button" className="pm-btn pm-btn-subtle" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="pm-btn pm-btn-primary" onClick={submit} disabled={saving}>{saving ? 'Completing…' : 'Complete sprint'}</button>
      </>}
    >
      <div className="pm-complete-stats">
        <div><b>{done.length}</b><span>completed issue{done.length === 1 ? '' : 's'}</span><small>{pts(done)} pts</small></div>
        <div><b>{open.length}</b><span>open issue{open.length === 1 ? '' : 's'}</span><small>{pts(open)} pts</small></div>
      </div>
      {open.length > 0 ? (
        <label className="pm-field"><span>Move open issues to</span>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">Backlog</option>
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__new__">New sprint</option>
          </select>
        </label>
      ) : (
        <p className="pm-modal-lead">Every issue in this sprint is done.</p>
      )}
      {error && <div className="pm-error">{error}</div>}
    </Modal>
  );
}
