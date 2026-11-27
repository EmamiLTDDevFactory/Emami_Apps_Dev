'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Wrench } from 'lucide-react';
import { changeCalendar } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import type { CalendarChange, ChangeWindow } from '@/lib/types';
import { Button, Card, Notice, Pill, Skeleton, cx } from './ui';
import { ItsmTag } from './Itsm';

/*
   v7 Phase 6 (§M /change-calendar): a month of planned changes with FREEZE and MAINTENANCE windows. Click a change
   to open it. On a phone the month becomes a day list.
*/
const DAY = 86_400_000;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const RISK_TONE: Record<string, string> = { High: 'border-bad/50 bg-bad/10', Medium: 'border-warn/50 bg-warn/10', Low: 'border-good/40 bg-good/10' };

export default function ChangeCalendar() {
  const { openTicket } = useSamadhan();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [data, setData] = useState<{ changes: CalendarChange[]; windows: ChangeWindow[] } | null>(null);
  const [error, setError] = useState('');
  const gridStart = useMemo(() => { const s = new Date(month); s.setDate(1 - ((s.getDay() + 6) % 7)); return s; }, [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * DAY)), [gridStart]);
  useEffect(() => {
    setData(null);
    changeCalendar(days[0].toISOString(), new Date(days[41].getTime() + DAY).toISOString()).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the calendar.'));
  }, [days]);
  const on = (d: Date) => {
    const s = d.getTime();
    const e = s + DAY;
    return {
      changes: (data?.changes ?? []).filter((c) => { const a = new Date(c.plannedStart).getTime(); const b = c.plannedEnd ? new Date(c.plannedEnd).getTime() : a; return a < e && b >= s; }),
      windows: (data?.windows ?? []).filter((w) => new Date(w.startsAt).getTime() < e && new Date(w.endsAt).getTime() > s),
    };
  };
  const today = ymd(new Date());
  const label = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return (
    <div className="space-y-4" data-testid="change-calendar">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight">Change calendar <ItsmTag practice={'change'} /></h2>
          <p className="text-sm text-muted">Planned changes by risk, with freeze and maintenance windows. Scheduling inside a freeze needs an override and a reason.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={14} /></Button>
          <span className="min-w-[9rem] text-center text-sm font-bold">{label}</span>
          <Button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={14} /></Button>
          <Button onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-2xs">
        <span className="flex items-center gap-1"><Lock size={12} className="text-bad" /> Freeze</span>
        <span className="flex items-center gap-1"><Wrench size={12} className="text-accent" /> Maintenance</span>
        {['Low', 'Medium', 'High'].map((r) => <span key={r} className={cx('rounded border px-1.5', RISK_TONE[r])}>{r} risk</span>)}
      </div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {!data ? <Skeleton rows={6} /> : (
        <>
          <Card bodyClass="p-0" className="hidden md:block">
            <div className="grid grid-cols-7 border-b border-line text-center text-2xs font-bold uppercase tracking-wide text-muted">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const x = on(d);
                const freeze = x.windows.some((w) => w.kind === 'FREEZE');
                return (
                  <div key={ymd(d)} className={cx('min-h-[104px] border-b border-r border-line p-1.5', d.getMonth() !== month.getMonth() && 'bg-sunken/50 opacity-60', freeze && 'bg-bad/5')}>
                    <div className={cx('mb-1 text-2xs font-bold', ymd(d) === today ? 'inline-grid h-5 w-5 place-items-center rounded-full bg-accent text-white' : 'text-muted')}>{d.getDate()}</div>
                    {x.windows.map((w) => <div key={`w${w.id}`} title={w.note ?? w.name} className={cx('mb-0.5 flex items-center gap-1 truncate text-[10px] font-bold', w.kind === 'FREEZE' ? 'text-bad' : 'text-accent')}>{w.kind === 'FREEZE' ? <Lock size={10} /> : <Wrench size={10} />}{w.name}</div>)}
                    {x.changes.slice(0, 3).map((c) => (
                      <button key={c.id} type="button" onClick={() => openTicket(c.id)} title={`${c.ref} ${c.subject}`} className={cx('mb-0.5 block w-full truncate rounded border px-1 text-left text-[10px] font-semibold', RISK_TONE[c.changeRisk ?? ''] ?? 'border-line bg-panel', c.isResolved && 'line-through opacity-60')}>
                        {c.ref} {c.subject}
                      </button>
                    ))}
                    {x.changes.length > 3 && <div className="text-[10px] text-muted">+{x.changes.length - 3} more</div>}
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="space-y-2 md:hidden">
            {days.filter((d) => d.getMonth() === month.getMonth()).map((d) => ({ d, x: on(d) })).filter(({ x }) => x.changes.length || x.windows.length).map(({ d, x }) => (
              <Card key={ymd(d)} bodyClass="p-3 space-y-1">
                <div className="text-xs font-bold">{d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                {x.windows.map((w) => <Pill key={`w${w.id}`} tone={w.kind === 'FREEZE' ? 'bad' : 'accent'}>{w.kind === 'FREEZE' ? 'Freeze' : 'Maintenance'}: {w.name}</Pill>)}
                {x.changes.map((c) => <button key={c.id} type="button" onClick={() => openTicket(c.id)} className={cx('block w-full rounded border px-2 py-1 text-left text-xs', RISK_TONE[c.changeRisk ?? ''] ?? 'border-line')}><b>{c.ref}</b> {c.subject}</button>)}
              </Card>
            ))}
            {!(data.changes.length || data.windows.length) && <p className="text-sm text-muted">Nothing planned this month.</p>}
          </div>
        </>
      )}
    </div>
  );
}
