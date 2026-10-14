import React, { useCallback, useEffect, useState } from 'react';
import { ccbApi } from './api.js';
import MeetingRoom from './MeetingRoom.jsx';
import { Blocker, Button, CcbShell, Empty, Field, Loading, Meta, Modal, PageHeader, Pill, useCcbMe, useToast } from './ui.jsx';
import { MEETING_STATUS_META, fmtDate, fmtTime, isoOf, meetingLink, nextThirdFriday } from './model.js';
import { AlertIcon, BoltIcon, CalendarIcon, GavelIcon, InfoIcon, PlusIcon } from '../shared/icons.jsx';

function readParams() {
  const p = new URLSearchParams(window.location.search);
  return { id: p.get('id'), action: p.get('action') };
}

export default function Meetings() {
  const { me, error, loading, reload } = useCcbMe();
  const [params, setParams] = useState(readParams);
  useEffect(() => {
    const onPop = () => setParams(readParams());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((id) => {
    window.history.pushState({}, '', id ? meetingLink(id) : window.location.pathname);
    setParams(readParams());
    window.scrollTo(0, 0);
  }, []);

  return (
    <CcbShell active="ccbMeetings">
      {loading ? <Loading /> : error ? <Blocker error={error} onRetry={reload} /> : params.id ? (
        <MeetingRoom key={params.id} id={params.id} me={me} onBack={() => go(null)} />
      ) : (
        <MeetingList me={me} autoSchedule={params.action === 'schedule'} onOpen={go} />
      )}
    </CcbShell>
  );
}

function MeetingList({ me, autoSchedule, onOpen }) {
  const [data, setData] = useState({ loading: true, meetings: [], pendingCount: 0, settings: null, error: null });
  const [scheduling, setScheduling] = useState(autoSchedule && me.can.runMeetings);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    ccbApi.meetings()
      .then((d) => setData({ loading: false, meetings: d.meetings, pendingCount: d.pendingCount, settings: d.settings, error: null }))
      .catch((e) => setData((s) => ({ ...s, loading: false, error: e })));
  }, []);
  useEffect(load, [load]);

  if (data.loading) return <Loading />;
  if (data.error) return <Blocker error={data.error} onRetry={load} />;

  const upcoming = data.meetings.filter((m) => ['scheduled', 'in_progress'].includes(m.status)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const past = data.meetings.filter((m) => !['scheduled', 'in_progress'].includes(m.status));
  const s = data.settings;

  return (
    <>
      <PageHeader eyebrow="Change Control Board" title="CCB Meetings" sub="The board meets on the 3rd Friday of every month, or on an emergency basis. Decisions need a quorum of CCB members.">
        {me.can.runMeetings && <Button variant="primary" icon={PlusIcon} onClick={() => setScheduling(true)}>Schedule meeting</Button>}
      </PageHeader>

      <div className="ccb-banner">
        <InfoIcon size={15} />
        <span className="grow">
          <strong>{data.pendingCount}</strong> request{data.pendingCount === 1 ? '' : 's'} waiting for a CCB agenda · quorum <strong>{s.quorum}</strong> members ·
          next regular meeting <strong>{fmtDate(nextThirdFriday())}</strong> · default {s.meetingMode}, {s.meetingTime}
        </span>
      </div>

      <h3 className="ccb-section-label" style={{ marginTop: 0 }}>Upcoming</h3>
      {upcoming.length === 0 ? (
        <div className="ccb-card"><Empty icon={CalendarIcon} title="No meeting scheduled" action={me.can.runMeetings ? <Button variant="primary" icon={PlusIcon} onClick={() => setScheduling(true)}>Schedule the next meeting</Button> : null}>
          The CCB Secretary schedules each meeting; the agenda fills itself with every request awaiting the board.
        </Empty></div>
      ) : (
        <div className="ccb-meetings">{upcoming.map((m) => <MeetingCard key={m.id} m={m} onOpen={onOpen} />)}</div>
      )}

      <h3 className="ccb-section-label" style={{ marginTop: 22 }}>Past meetings</h3>
      {past.length === 0 ? <p className="ccb-muted" style={{ fontSize: 12.5 }}>No past meetings yet.</p> : (
        <div className="ccb-meetings">{past.map((m) => <MeetingCard key={m.id} m={m} onOpen={onOpen} />)}</div>
      )}

      {scheduling && (
        <ScheduleDialog settings={s} pending={data.pendingCount} onClose={() => setScheduling(false)} onDone={(m) => { setScheduling(false); showToast(m.teamsJoinUrl ? `${m.meetingNo} scheduled. Teams meeting sent to the board.` : m.teamsStatus === 'failed' ? `${m.meetingNo} scheduled, but the Teams meeting could not be created. See the meeting page.` : `${m.meetingNo} scheduled.`, m.teamsStatus === 'failed' ? 'error' : 'ok'); onOpen(m.id); }} />
      )}
      {toast}
    </>
  );
}

function MeetingCard({ m, onOpen }) {
  const d = new Date(m.scheduledAt);
  return (
    <a className={`ccb-mcard${m.isEmergency ? ' is-emergency' : ''}${['completed', 'cancelled'].includes(m.status) ? ' is-done' : ''}`} href={meetingLink(m.id)} onClick={(e) => { e.preventDefault(); onOpen(m.id); }}>
      <div className="ccb-mcard-top">
        <div className="ccb-date-tile">
          <div className="m">{d.toLocaleDateString('en-GB', { month: 'short' })}</div>
          <div className="d">{d.getDate()}</div>
          <div className="w">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <Meta meta={MEETING_STATUS_META} value={m.status} />
            {m.isEmergency && <Pill tone="red"><BoltIcon size={11} /> Emergency</Pill>}
            {m.teamsJoinUrl && m.teamsStatus !== 'cancelled' && <Pill tone="purple" title="Microsoft Teams meeting">Teams</Pill>}
          </div>
          <h3>{m.title}</h3>
          <div className="sub"><span className="ccb-mono">{m.meetingNo}</span> · {fmtTime(m.scheduledAt)} · {m.mode === 'online' ? 'Online' : m.mode === 'offline' ? 'In person' : 'Hybrid'}</div>
        </div>
      </div>
      <div className="ccb-mcard-stats">
        <span><b>{m.itemCount}</b> on agenda</span>
        {m.status === 'completed' ? (
          <>
            <span><b>{m.approvedCount}</b> approved</span>
            <span><b>{m.rejectedCount}</b> rejected</span>
            {m.deferredCount > 0 && <span><b>{m.deferredCount}</b> deferred</span>}
            <span><b>{m.presentCount}</b> present</span>
          </>
        ) : m.status === 'in_progress' ? <span><b>{m.decidedCount}</b> decided</span> : null}
      </div>
    </a>
  );
}

function ScheduleDialog({ settings, pending, onClose, onDone }) {
  const [form, setForm] = useState({ date: isoOf(nextThirdFriday()), time: settings.meetingTime || '15:00', mode: settings.meetingMode || 'online', venue: '', title: '', isEmergency: false, duration: '60' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const isThirdFriday = form.date === isoOf(nextThirdFriday(new Date(`${form.date}T00:00`)));

  async function go() {
    setBusy(true);
    setError('');
    try {
      const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();
      const d = await ccbApi.scheduleMeeting({ scheduledAt, mode: form.mode, venue: form.venue, title: form.title, isEmergency: form.isEmergency, durationMinutes: Number(form.duration) });
      onDone(d.meeting);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Schedule a CCB meeting" sub="The agenda is built automatically from every request awaiting the board, plus emergency approvals awaiting ratification." onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={CalendarIcon} busy={busy} onClick={go}>Schedule</Button></>}>
      <div className="ccb-form-grid">
        <Field label="Date" required hint={isThirdFriday && !form.isEmergency ? 'Regular slot: 3rd Friday of the month.' : undefined}>
          <input className="ccb-input" type="date" value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Time" required>
          <input className="ccb-input" type="time" value={form.time} onChange={set('time')} />
        </Field>
        <Field label="Duration">
          <select className="ccb-input" value={form.duration} onChange={set('duration')}>
            {[['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['90', '1 hour 30 minutes'], ['120', '2 hours'], ['180', '3 hours']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Mode" group>
          <div className="ccb-chips">
            {[['online', 'Online'], ['offline', 'In person'], ['hybrid', 'Hybrid']].map(([k, l]) => (
              <button key={k} type="button" className={`ccb-chip-toggle${form.mode === k ? ' on' : ''}`} onClick={() => setForm((f) => ({ ...f, mode: k }))}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="Venue" hint={form.mode === 'offline' ? 'An Outlook invitation goes to the board.' : 'A Microsoft Teams meeting is created and sent to the board automatically.'}>
          <input className="ccb-input" value={form.venue} onChange={set('venue')} placeholder={form.mode === 'online' ? 'Optional' : 'e.g. Board room, Emami Tower'} />
        </Field>
        <Field label="Title" hint="Leave blank for “CCB meeting — <month>”." wide>
          <input className="ccb-input" value={form.title} onChange={set('title')} />
        </Field>
      </div>
      <label className="ccb-switch">
        <input type="checkbox" checked={form.isEmergency} onChange={set('isEmergency')} />
        <div><strong>Emergency meeting</strong><span>Called outside the regular monthly cycle.</span></div>
      </label>
      <div className="ccb-callout tone-indigo"><GavelIcon size={15} /><span><strong>{pending}</strong> request{pending === 1 ? '' : 's'} will be added to the agenda. You can refresh the agenda until the meeting closes.</span></div>
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}
