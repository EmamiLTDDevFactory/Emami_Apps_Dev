'use client';

import React, { useState } from 'react';
import { Clock, Download, LogIn, MonitorSmartphone } from 'lucide-react';
import type { MyActivity } from '../../lib/authApi';
import { colors, fontWeights, fonts, radii } from '../../theme/tokens';
import { EmptyState, appLabel, cardStyle, labelStyle, secondaryBtnStyle, sectionSubStyle, sectionTitleStyle, timeAgo } from './adminShared';

// Inline sign-in and session lists for the user drawer's Activity cards — same layout as
// Access Tracker's user drawer (embedded-apps/access-tracker/src/components/ActivityDetail.tsx).

const PAGE = 25;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtWeekday = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase();
function fmtDuration(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function downloadCsv(fileName: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

function Panel({ icon: Icon, title, sub, onExport, canExport, children }: { icon: React.ElementType; title: string; sub: string; onExport: () => void; canExport: boolean; children: React.ReactNode }) {
  return (
    <div className="ac-fade" style={{ ...cardStyle, marginTop: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={15} color={colors.rust} /> {title}</p>
          <p style={sectionSubStyle}>{sub}</p>
        </div>
        <button type="button" className="ac-btn" onClick={onExport} disabled={!canExport} style={{ ...secondaryBtnStyle, height: 32, fontSize: 12.5, padding: '0 12px' }}>
          <Download size={13} /> Export
        </button>
      </div>
      {children}
    </div>
  );
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <div style={{ borderTop: `1px solid ${colors.border}`, padding: '9px 16px', textAlign: 'center' }}>
      <button type="button" onClick={onMore} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust }}>
        Show {Math.min(PAGE, total - shown)} more ({total - shown} left)
      </button>
    </div>
  );
}

const th: React.CSSProperties = { ...labelStyle, fontSize: 10, padding: '8px 10px', textAlign: 'left' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, color: colors.ink, fontFamily: fonts.sansRegular, borderTop: `1px solid ${colors.border}` };
const strong: React.CSSProperties = { fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold };

/** Every sign-in, newest first: date, weekday, time and how long ago. */
export function SignInList({ activity, email }: { activity: MyActivity; email: string }) {
  const [shown, setShown] = useState(PAGE);
  const { logins } = activity;
  const exportCsv = () => downloadCsv(`${email.split('@')[0]}-sign-ins-${stamp()}.csv`, ['Date', 'Day', 'Time'], logins.map((t) => [fmtDate(t), fmtWeekday(t), fmtTime(t)]));
  return (
    <Panel icon={LogIn} title="Sign-in history" sub={`${logins.length} sign-in${logins.length === 1 ? '' : 's'}, newest first`} onExport={exportCsv} canExport={logins.length > 0}>
      {!logins.length ? <div style={{ padding: 16 }}><EmptyState icon={LogIn} title="No sign-ins recorded" /></div> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: colors.appBg }}>
                <tr><th style={{ ...th, paddingLeft: 16 }}>#</th><th style={th}>Date</th><th style={th}>Day</th><th style={th}>Time</th><th style={{ ...th, paddingRight: 16, textAlign: 'right' }}>When</th></tr>
              </thead>
              <tbody>
                {logins.slice(0, shown).map((t, i) => (
                  <tr key={`${t}-${i}`}>
                    <td style={{ ...td, paddingLeft: 16, color: colors.inkSoft }}>{logins.length - i}</td>
                    <td style={{ ...td, ...strong, whiteSpace: 'nowrap' }}>{fmtDate(t)}</td>
                    <td style={{ ...td, color: colors.inkSoft }}>{fmtWeekday(t)}</td>
                    <td style={{ ...td, ...strong, whiteSpace: 'nowrap' }}>{fmtTime(t)}</td>
                    <td style={{ ...td, paddingRight: 16, color: colors.inkSoft, textAlign: 'right', whiteSpace: 'nowrap' }}>{timeAgo(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <More shown={shown} total={logins.length} onMore={() => setShown((s) => s + PAGE)} />
        </>
      )}
    </Panel>
  );
}

const pill = (accent: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', borderRadius: radii.md, padding: '3px 8px', fontSize: 11.5, whiteSpace: 'nowrap',
  fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold,
  backgroundColor: accent ? `${colors.rust}14` : colors.appBg, color: accent ? colors.rust : colors.inkSoft,
});

/** Every session, newest first: start, end, length, and each app opened during it with the time. */
export function SessionList({ activity, email }: { activity: MyActivity; email: string }) {
  const [shown, setShown] = useState(PAGE);
  const { sessions } = activity;
  const completed = sessions.filter((s) => s.end).length;
  const exportCsv = () =>
    downloadCsv(
      `${email.split('@')[0]}-sessions-${stamp()}.csv`,
      ['Date', 'Started', 'Ended', 'Duration', 'Apps opened'],
      sessions.map((s) => [fmtDate(s.start), fmtTime(s.start), s.end ? fmtTime(s.end) : 'No sign-out recorded', fmtDuration(s.durationSeconds), s.apps.map((a) => `${appLabel(a.appId)} (${fmtTime(a.at)})`).join('; ')]),
    );
  return (
    <Panel
      icon={MonitorSmartphone} title="Sessions"
      sub={`${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${fmtDuration(activity.recordedSeconds)} recorded across ${completed} signed-out session${completed === 1 ? '' : 's'}`}
      onExport={exportCsv} canExport={sessions.length > 0}
    >
      {!sessions.length ? <div style={{ padding: 16 }}><EmptyState icon={MonitorSmartphone} title="No sessions recorded" /></div> : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sessions.slice(0, shown).map((s, i) => (
              <li key={`${s.start}-${i}`} style={{ padding: '12px 16px', borderTop: i ? `1px solid ${colors.border}` : 'none' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: colors.ink, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold }}>{fmtWeekday(s.start)}, {fmtDate(s.start)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>
                      <Clock size={11} /> {fmtTime(s.start)} → {s.end ? fmtTime(s.end) : '…'}
                    </div>
                  </div>
                  {s.end ? <span style={pill(true)}>{fmtDuration(s.durationSeconds)}</span> : <span style={pill(false)} title="The tab was closed or the session expired without signing out, so there is no end time">No sign-out recorded</span>}
                </div>
                {s.apps.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {s.apps.map((a, j) => (
                      <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.border}`, borderRadius: radii.md, backgroundColor: colors.appBg, padding: '4px 8px', fontSize: 11.5 }}>
                        <span style={{ ...strong, color: colors.ink }}>{appLabel(a.appId)}</span>
                        <span style={{ color: colors.inkSoft }}>{fmtTime(a.at)}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>No apps opened in this session</p>
                )}
              </li>
            ))}
          </ul>
          <More shown={shown} total={sessions.length} onMore={() => setShown((x) => x + PAGE)} />
        </>
      )}
    </Panel>
  );
}
