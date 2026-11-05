'use client';
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { admin } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { fmtDate, fmtMins, PRIORITY_LABEL } from '@/lib/format';
import type { DayWindow, SlaPolicy, SlaTarget } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Skeleton, Table, cx, inputCls } from '../ui';
import { checkboxCls, useAction, useLoad } from './shared';

/** Minutes typed as "2h 30m", "150" (minutes) or "4h". */
function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return NaN;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function TargetRow({ t, onSaved }: { t: SlaTarget; onSaved: () => void }) {
  const [fr, setFr] = useState(fmtMins(t.firstResponseMins));
  const [nr, setNr] = useState(t.nextResponseMins ? fmtMins(t.nextResponseMins) : '');
  const [res, setRes] = useState(fmtMins(t.resolutionMins));
  const [bh, setBh] = useState(t.businessHours);
  const [esc, setEsc] = useState(t.escalate);
  const act = useAction();
  const dirty = fr !== fmtMins(t.firstResponseMins) || nr !== (t.nextResponseMins ? fmtMins(t.nextResponseMins) : '') || res !== fmtMins(t.resolutionMins) || bh !== t.businessHours || esc !== t.escalate;

  const save = async () => {
    const f = parseDuration(fr), n = parseDuration(nr), r = parseDuration(res);
    if (!f || Number.isNaN(f) || !r || Number.isNaN(r) || Number.isNaN(n as number)) {
      act.setMsg({ tone: 'bad', text: 'Use minutes or e.g. 2h 30m, 1d 4h.' });
      return;
    }
    if (await act.run(() => admin.saveSlaTarget(t.id, { firstResponseMins: f, nextResponseMins: n, resolutionMins: r, businessHours: bh, escalate: esc }))) onSaved();
  };
  const cell = 'h-8 w-24 text-xs';
  return (
    <tr>
      <td className="px-3 py-2 font-semibold">{PRIORITY_LABEL[t.priority]}</td>
      <td className="px-3 py-2"><input aria-label="First response" className={cx(inputCls, cell)} value={fr} onChange={(e) => setFr(e.target.value)} /></td>
      <td className="px-3 py-2"><input aria-label="Next response" className={cx(inputCls, cell)} value={nr} placeholder="—" onChange={(e) => setNr(e.target.value)} /></td>
      <td className="px-3 py-2"><input aria-label="Resolution" className={cx(inputCls, cell)} value={res} onChange={(e) => setRes(e.target.value)} /></td>
      <td className="px-3 py-2"><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className={checkboxCls} checked={bh} onChange={(e) => setBh(e.target.checked)} /> {bh ? 'Business' : 'Calendar'}</label></td>
      <td className="px-3 py-2"><input type="checkbox" aria-label="Escalate" className={checkboxCls} checked={esc} onChange={(e) => setEsc(e.target.checked)} /></td>
      <td className="px-3 py-2 text-right">
        {act.msg && <span className={cx('mr-2 text-2xs font-semibold', act.msg.tone === 'bad' ? 'text-bad' : 'text-good')}>{act.msg.text}</span>}
        <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || act.busy} onClick={save}>Save</Button>
      </td>
    </tr>
  );
}

function PolicyCard({ p, onSaved }: { p: SlaPolicy; onSaved: () => void }) {
  const { meta } = useSetu();
  const [groups, setGroups] = useState(p.groupIds);
  const act = useAction();
  useEffect(() => setGroups(p.groupIds), [p.groupIds]);
  const dirty = JSON.stringify([...groups].sort()) !== JSON.stringify([...p.groupIds].sort());
  return (
    <Card title={<span className="flex items-center gap-2">{p.name}{p.isDefault && <Pill tone="accent">Default</Pill>}</span>} sub={p.isDefault ? 'Applies to tickets whose group has no other policy' : 'Applies to the linked groups'} bodyClass="p-0">
      <Table head={['Priority', 'First response', 'Next response', 'Resolution', 'Clock', 'Escalate', '']}>
        {p.targets.map((t) => <TargetRow key={`${t.id}-${t.firstResponseMins}-${t.resolutionMins}-${t.nextResponseMins}-${t.businessHours}`} t={t} onSaved={onSaved} />)}
      </Table>
      {!p.isDefault && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <span className="text-2xs font-bold uppercase tracking-wide text-muted">Linked groups</span>
          {meta.groups.map((g) => (
            <label key={g.id} className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" className={checkboxCls} checked={groups.includes(g.id)} onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))} />
              {g.name}
            </label>
          ))}
          <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || act.busy} onClick={async () => { if (await act.run(() => admin.saveSlaGroups(p.id, groups))) onSaved(); }}>Save groups</Button>
          {act.msg && <span className={cx('text-2xs font-semibold', act.msg.tone === 'bad' ? 'text-bad' : 'text-good')}>{act.msg.text}</span>}
        </div>
      )}
    </Card>
  );
}

export function SlaTab() {
  const { data, error, reload } = useLoad(admin.sla);
  return (
    <div className="space-y-4">
      <Notice tone="warn">Times accept minutes (90) or durations (1h 30m, 2d 4h). Business-hours targets count only working hours from the Business hours tab. Changes apply to new tickets and whenever a ticket&apos;s status, priority or group changes.</Notice>
      {error && <Notice>{error}</Notice>}
      {!data ? <Card><Skeleton /></Card> : data.map((p) => <PolicyCard key={p.id} p={p} onSaved={reload} />)}
    </div>
  );
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function BusinessHoursTab() {
  const { data, error, reload } = useLoad(admin.businessHours);
  const [days, setDays] = useState<DayWindow[] | null>(null);
  const [hDate, setHDate] = useState('');
  const [hName, setHName] = useState('');
  const act = useAction();
  const hAct = useAction();
  useEffect(() => { if (data?.businessHours) setDays(data.businessHours.days); }, [data]);

  if (error) return <Notice>{error}</Notice>;
  if (!data || !days) return <Card><Skeleton /></Card>;
  const setDay = (day: number, patch: Partial<DayWindow> | null) => {
    const has = days.find((d) => d.day === day);
    if (patch === null) setDays(days.filter((d) => d.day !== day));
    else if (has) setDays(days.map((d) => (d.day === day ? { ...d, ...patch } : d)));
    else setDays([...days, { day, start: '09:00', end: '20:00', ...patch }].sort((a, b) => a.day - b.day));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Working hours" sub={`Time zone ${data.businessHours?.timezone ?? 'Asia/Kolkata'}`}>
        <div className="space-y-2">
          {DAYS.map((name, day) => {
            const w = days.find((d) => d.day === day);
            return (
              <div key={day} className="flex items-center gap-3">
                <label className="flex w-32 items-center gap-2 text-[13px] font-medium">
                  <input type="checkbox" className={checkboxCls} checked={!!w} onChange={(e) => setDay(day, e.target.checked ? {} : null)} /> {name}
                </label>
                {w ? (
                  <>
                    <input type="time" aria-label={`${name} start`} className={cx(inputCls, 'w-28')} value={w.start} onChange={(e) => setDay(day, { start: e.target.value })} />
                    <span className="text-muted">to</span>
                    <input type="time" aria-label={`${name} end`} className={cx(inputCls, 'w-28')} value={w.end} onChange={(e) => setDay(day, { end: e.target.value })} />
                  </>
                ) : <span className="text-xs text-faint">Closed</span>}
              </div>
            );
          })}
        </div>
        {act.msg && <div className="mt-3"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
        <Button variant="primary" className="mt-4" disabled={act.busy} onClick={async () => { if (await act.run(() => admin.saveBusinessHours(days))) reload(); }}>Save hours</Button>
      </Card>
      <Card title="Holidays" sub="No working time is counted on these dates">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Date"><input type="date" className={cx(inputCls, 'w-40')} value={hDate} onChange={(e) => setHDate(e.target.value)} /></Field>
          <Field label="Name" className="min-w-[10rem] flex-1"><input className={inputCls} value={hName} onChange={(e) => setHName(e.target.value)} /></Field>
          <Button variant="primary" disabled={!hDate || !hName.trim() || hAct.busy} onClick={async () => { if (await hAct.run(() => admin.addHoliday(hDate, hName.trim()), 'Holiday added.')) { setHDate(''); setHName(''); reload(); } }}>Add</Button>
        </div>
        {hAct.msg && <div className="mt-2"><Notice tone={hAct.msg.tone} onClose={() => hAct.setMsg(null)}>{hAct.msg.text}</Notice></div>}
        <ul className="mt-3 divide-y divide-line">
          {data.holidays.length === 0 && <li className="py-2 text-sm text-muted">No holidays added.</li>}
          {data.holidays.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2 text-[13px]">
              <span className="num w-28 font-semibold">{fmtDate(`${h.date}T12:00:00+05:30`)}</span>
              <span className="flex-1">{h.name}</span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${h.name}`} onClick={async () => { await hAct.run(() => admin.deleteHoliday(h.id), 'Holiday removed.'); reload(); }}><Trash2 size={13} /></Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
