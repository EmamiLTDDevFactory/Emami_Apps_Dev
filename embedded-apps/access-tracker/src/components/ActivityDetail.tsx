'use client';
import { useState } from 'react';
import { Clock, Download, LogIn, MonitorSmartphone } from 'lucide-react';
import type { UserActivity } from '@/lib/api';
import { appName } from '@/lib/apps';
import { downloadCsv, fmtDate, fmtDateTime, fmtDuration, fmtNum, fmtTime, fmtWeekday, relative, stamp } from '@/lib/format';
import { Button, Card, Empty, Pill } from './ui';

const PAGE = 25;

function MoreButton({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <div className="border-t border-line px-4 py-2.5 text-center">
      <button type="button" onClick={onMore} className="text-xs font-bold text-accent hover:underline">Show {Math.min(PAGE, total - shown)} more ({fmtNum(total - shown)} left)</button>
    </div>
  );
}

/** Every sign-in, newest first: date, weekday, time and how long ago. */
export function SignInList({ activity, email }: { activity: UserActivity; email: string }) {
  const [shown, setShown] = useState(PAGE);
  const { logins } = activity;
  const exportCsv = () => downloadCsv(`${email.split('@')[0]}-sign-ins-${stamp()}.csv`, ['Date', 'Day', 'Time'], logins.map((t) => [fmtDate(t), fmtWeekday(t), fmtTime(t)]));
  return (
    <Card
      title={<span className="inline-flex items-center gap-1.5"><LogIn size={14} className="text-accent" /> Sign-in history</span>}
      sub={`${fmtNum(logins.length)} sign-ins, newest first`}
      actions={<Button size="sm" onClick={exportCsv} disabled={!logins.length}><Download size={13} /> Export</Button>}
      bodyClass="p-0"
    >
      {!logins.length ? <Empty icon={LogIn} title="No sign-ins recorded" /> : (
        <>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-sunken/60 text-2xs font-bold uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-2">#</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Day</th><th className="px-3 py-2">Time</th><th className="px-4 py-2 text-right">When</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logins.slice(0, shown).map((t, i) => (
                <tr key={`${t}-${i}`} className="hover:bg-sunken/60">
                  <td className="num px-4 py-2 text-faint">{logins.length - i}</td>
                  <td className="num px-3 py-2 font-semibold">{fmtDate(t)}</td>
                  <td className="px-3 py-2 text-muted">{fmtWeekday(t)}</td>
                  <td className="num px-3 py-2 font-semibold">{fmtTime(t)}</td>
                  <td className="px-4 py-2 text-right text-muted">{relative(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <MoreButton shown={shown} total={logins.length} onMore={() => setShown((s) => s + PAGE)} />
        </>
      )}
    </Card>
  );
}

/** Every session, newest first: start, end, length, and each app opened during it with the time. */
export function SessionList({ activity, email }: { activity: UserActivity; email: string }) {
  const [shown, setShown] = useState(PAGE);
  const { sessions } = activity;
  const completed = sessions.filter((s) => s.end).length;
  const exportCsv = () =>
    downloadCsv(
      `${email.split('@')[0]}-sessions-${stamp()}.csv`,
      ['Date', 'Started', 'Ended', 'Duration', 'Apps opened'],
      sessions.map((s) => [fmtDate(s.start), fmtTime(s.start), s.end ? fmtTime(s.end) : 'No sign-out recorded', fmtDuration(s.durationSeconds), s.apps.map((a) => `${appName(a.appId)} (${fmtTime(a.at)})`).join('; ')]),
    );
  return (
    <Card
      title={<span className="inline-flex items-center gap-1.5"><MonitorSmartphone size={14} className="text-accent" /> Sessions</span>}
      sub={`${fmtNum(sessions.length)} sessions · ${fmtDuration(activity.recordedSeconds)} recorded across ${fmtNum(completed)} signed-out sessions`}
      actions={<Button size="sm" onClick={exportCsv} disabled={!sessions.length}><Download size={13} /> Export</Button>}
      bodyClass="p-0"
    >
      {!sessions.length ? <Empty icon={MonitorSmartphone} title="No sessions recorded" /> : (
        <>
          <ul className="divide-y divide-line">
            {sessions.slice(0, shown).map((s, i) => (
              <li key={`${s.start}-${i}`} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold">
                      {fmtWeekday(s.start)}, {fmtDate(s.start)}
                    </div>
                    <div className="num mt-0.5 flex items-center gap-1.5 text-2xs text-muted" title={`${fmtDateTime(s.start)} → ${s.end ? fmtDateTime(s.end) : 'no sign-out'}`}>
                      <Clock size={11} /> {fmtTime(s.start)} → {s.end ? fmtTime(s.end) : '…'}
                    </div>
                  </div>
                  {s.end ? <Pill tone="accent">{fmtDuration(s.durationSeconds)}</Pill> : <Pill title="The tab was closed or the session expired without signing out, so there is no end time">No sign-out recorded</Pill>}
                </div>
                {s.apps.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.apps.map((a, j) => (
                      <span key={j} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-sunken/60 px-2 py-1 text-2xs">
                        <span className="font-semibold text-ink">{appName(a.appId)}</span>
                        <span className="num text-muted">{fmtTime(a.at)}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-2xs text-faint">No apps opened in this session</p>
                )}
              </li>
            ))}
          </ul>
          <MoreButton shown={shown} total={sessions.length} onMore={() => setShown((x) => x + PAGE)} />
        </>
      )}
    </Card>
  );
}
