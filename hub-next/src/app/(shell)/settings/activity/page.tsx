'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, LogIn, History, CalendarDays, Timer, Layers, ChevronDown, ChevronRight, Clock, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { useIsWideScreen } from '../../../../hooks/useIsWideScreen';
import { getMyActivity, type MyActivity, type MySession } from '../../../../lib/authApi';
import { appById } from '../../../../data/mockData';
import { colors, fonts, fontWeights, radii } from '../../../../theme/tokens';
import {
  AdminStyles, AppIcon, EmptyState, Skeleton,
  cardStyle, labelStyle, secondaryBtnStyle, sectionSubStyle, sectionTitleStyle, timeAgo,
} from '../../../../components/admin/adminShared';

/** My Profile › Sign-ins & sessions — the person's own history behind the Sign-ins and Sessions
 * tiles on My Profile. ?view=signins|sessions picks the tab, so each tile links straight to its own. */

type View = 'signins' | 'sessions';
const PAGE = 40;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
}
function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
function groupByDay<T>(items: T[], at: (t: T) => string): { day: string; items: T[] }[] {
  const out: { day: string; items: T[] }[] = [];
  for (const it of items) {
    const day = dayLabel(at(it));
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(it);
    else out.push({ day, items: [it] });
  }
  return out;
}

function ActivityContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isWide = useIsWideScreen();
  const { profile } = useAuth();
  const view: View = params.get('view') === 'sessions' ? 'sessions' : 'signins';
  const setView = (v: View) => router.replace(`${pathname}?view=${v}`, { scroll: false });

  const [activity, setActivity] = useState<MyActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notAvailable, setNotAvailable] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    getMyActivity().then((r) => {
      setLoading(false);
      if (r.ok && r.activity) setActivity(r.activity);
      else if (r.notAvailable) setNotAvailable(true);
      else setError(r.error || 'Could not load your activity.');
    });
  }, []);
  useEffect(() => setLimit(PAGE), [view]);

  const logins = activity?.logins ?? [];
  const sessions = activity?.sessions ?? [];
  const pad = isWide ? 24 : 14;

  const loginStats = useMemo(() => {
    const now = Date.now();
    const within = (days: number) => logins.filter((l) => now - new Date(l).getTime() < days * 86400000).length;
    const days = new Set(logins.map((l) => dayKey(new Date(l))));
    return { week: within(7), month: within(30), activeDays: days.size, first: logins[logins.length - 1] ?? null };
  }, [logins]);

  const sessionStats = useMemo(() => {
    const closed = sessions.filter((s) => s.durationSeconds != null);
    const avg = closed.length ? Math.round(closed.reduce((a, s) => a + (s.durationSeconds || 0), 0) / closed.length) : null;
    const longest = closed.reduce<MySession | null>((best, s) => (!best || (s.durationSeconds || 0) > (best.durationSeconds || 0) ? s : best), null);
    const appsPer = sessions.length ? (sessions.reduce((a, s) => a + s.apps.length, 0) / sessions.length).toFixed(1) : '0';
    return { avg, longest, appsPer, unclosed: sessions.length - closed.length };
  }, [sessions]);

  // Last 30 days, one bar per day.
  const last30 = useMemo(() => {
    const counts = new Map<string, number>();
    const source = view === 'signins' ? logins : sessions.map((s) => s.start);
    for (const l of source) counts.set(dayKey(new Date(l)), (counts.get(dayKey(new Date(l))) || 0) + 1);
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return { date: d, count: counts.get(dayKey(d)) || 0 };
    });
  }, [logins, sessions, view]);
  const maxDay = Math.max(1, ...last30.map((d) => d.count));
  const accent = view === 'signins' ? '#0EA5E9' : colors.rust;

  return (
    <div style={{ minHeight: '100%', padding: pad, paddingBottom: 48 }}>
      <AdminStyles />
      <button type="button" className="ac-btn" onClick={() => router.push('/settings')} style={{ ...secondaryBtnStyle, height: 34, borderRadius: radii.pill, marginBottom: 14 }}>
        <ArrowLeft size={14} /> Back to My Profile
      </button>

      {/* Header */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: radii.xxxl + 4, padding: isWide ? '24px 28px 0' : '18px 18px 0', background: `linear-gradient(125deg, ${colors.plumDeep} 0%, #2A2070 45%, ${colors.rust} 100%)`, boxShadow: '0 18px 40px -18px rgba(37,27,120,0.6)' }}>
        <div aria-hidden style={{ position: 'absolute', right: -60, top: -80, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,124,255,0.55), transparent 70%)' }} />
        <p style={{ position: 'relative', margin: 0, fontSize: 12, fontFamily: fonts.sansSemiBold, color: '#C7C0FF', letterSpacing: 0.8, textTransform: 'uppercase' }}>My Profile</p>
        <h1 style={{ position: 'relative', margin: '6px 0 4px', fontSize: isWide ? 25 : 21, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.white }}>Sign-ins &amp; sessions</h1>
        <p style={{ position: 'relative', margin: 0, fontSize: 13, fontFamily: fonts.sansRegular, color: 'rgba(255,255,255,0.72)' }}>
          Every time you signed in to Emami Apps, and what you did in each visit.
        </p>
        <nav style={{ position: 'relative', display: 'flex', gap: 4, marginTop: 20 }}>
          {([
            ['signins', 'Sign-ins', LogIn, activity ? logins.length : profile?.logins],
            ['sessions', 'Sessions', History, activity ? sessions.length : profile?.sessionsTotal],
          ] as [View, string, React.ElementType, number | undefined][]).map(([id, label, Icon, n]) => {
            const active = view === id;
            return (
              <button key={id} type="button" onClick={() => setView(id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', border: 'none', cursor: 'pointer', borderRadius: `${radii.lg}px ${radii.lg}px 0 0`, backgroundColor: active ? colors.appBg : 'transparent', color: active ? colors.rust : 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>
                <Icon size={15} /> {label}
                {n !== undefined && <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 999, backgroundColor: active ? `${colors.rust}17` : 'rgba(255,255,255,0.16)' }}>{n}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div key={view} className="ac-fade" style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {notAvailable || error ? (
          <div style={{ ...cardStyle, padding: 8 }}>
            <EmptyState
              icon={notAvailable ? Info : AlertCircle}
              title={notAvailable ? 'Your detailed history is on its way' : 'Could not load your history'}
              hint={notAvailable ? `So far you have ${profile?.logins ?? 0} sign-ins and ${profile?.sessionsTotal ?? 0} sessions. The full list will appear here once the server update is live.` : error}
            />
          </div>
        ) : (
          <>
            {/* Summary tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isWide ? 180 : 145}px, 1fr))`, gap: 12 }}>
              {view === 'signins' ? (
                <>
                  <Tile icon={LogIn} accent="#0EA5E9" label="Total sign-ins" value={loading ? null : logins.length} />
                  <Tile icon={CalendarDays} accent="#16A34A" label="Last 7 days" value={loading ? null : loginStats.week} />
                  <Tile icon={CalendarDays} accent={colors.rust} label="Last 30 days" value={loading ? null : loginStats.month} />
                  <Tile icon={Clock} accent="#F59E0B" label="Days you signed in" value={loading ? null : loginStats.activeDays} sub={loginStats.first ? `since ${new Date(loginStats.first).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}` : undefined} />
                </>
              ) : (
                <>
                  <Tile icon={History} accent={colors.rust} label="Total sessions" value={loading ? null : sessions.length} />
                  <Tile icon={Timer} accent="#0D9488" label="Average length" value={loading ? null : formatDuration(sessionStats.avg)} sub="of sessions you signed out of" />
                  <Tile icon={Timer} accent="#9333EA" label="Longest session" value={loading ? null : formatDuration(sessionStats.longest?.durationSeconds ?? null)} sub={sessionStats.longest ? new Date(sessionStats.longest.start).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : undefined} />
                  <Tile icon={Layers} accent="#F59E0B" label="Apps per session" value={loading ? null : sessionStats.appsPer} sub="on average" />
                </>
              )}
            </div>

            {/* 30-day chart */}
            <div style={{ ...cardStyle, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div>
                  <p style={sectionTitleStyle}>Last 30 days</p>
                  <p style={sectionSubStyle}>{view === 'signins' ? 'Sign-ins per day' : 'Sessions started per day'}</p>
                </div>
                {!loading && <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, color: colors.inkSoft }}>{last30.reduce((a, d) => a + d.count, 0)} in total</span>}
              </div>
              {loading ? (
                <Skeleton height={120} radius={10} />
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: isWide ? 6 : 3, height: 120 }}>
                    {last30.map((d) => (
                      <div key={d.date.toISOString()} title={`${d.date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}: ${d.count}`} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{ width: '100%', height: d.count ? `${Math.max(8, (d.count / maxDay) * 100)}%` : 3, borderRadius: 4, background: d.count ? `linear-gradient(180deg, ${accent}, ${accent}99)` : colors.border, transition: 'height 300ms' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10.5, fontFamily: fonts.sansMedium, color: colors.inkSoft }}>
                    <span>{last30[0].date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</span>
                    <span>Today</span>
                  </div>
                </>
              )}
            </div>

            {/* List */}
            <div style={{ ...cardStyle, padding: 20 }}>
              <p style={{ ...sectionTitleStyle, marginBottom: 14 }}>{view === 'signins' ? 'Every sign-in' : 'Every session'}</p>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={40} radius={10} />)}</div>
              ) : view === 'signins' ? (
                logins.length === 0 ? (
                  <EmptyState icon={LogIn} title="No sign-ins recorded yet" />
                ) : (
                  <DayGroups groups={groupByDay(logins.slice(0, limit), (l) => l)} render={(l, i) => (
                    <div key={`${l}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 4px' }}>
                      <span style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#0EA5E914', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><LogIn size={14} color="#0EA5E9" /></span>
                      <span style={{ flex: 1, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Signed in at {timeOf(l)}</span>
                      <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, color: colors.inkSoft }}>{timeAgo(l)}</span>
                    </div>
                  )} />
                )
              ) : sessions.length === 0 ? (
                <EmptyState icon={History} title="No sessions recorded yet" />
              ) : (
                <DayGroups groups={groupByDay(sessions.slice(0, limit), (s) => s.start)} render={(s, i) => <SessionRow key={`${s.start}-${i}`} session={s} />} />
              )}
              {!loading && (view === 'signins' ? logins.length : sessions.length) > limit && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                  <button type="button" className="ac-btn" onClick={() => setLimit((l) => l + PAGE)} style={secondaryBtnStyle}>
                    Show more ({(view === 'signins' ? logins.length : sessions.length) - limit} left)
                  </button>
                </div>
              )}
              {view === 'sessions' && !loading && sessionStats.unclosed > 0 && (
                <p style={{ display: 'flex', gap: 8, margin: '16px 0 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '16px' }}>
                  <Info size={14} style={{ flexShrink: 0 }} />
                  {sessionStats.unclosed} session{sessionStats.unclosed === 1 ? '' : 's'} ended without Sign out (tab closed or timed out), so their length isn&apos;t known. Use Sign out to have your time recorded.
                </p>
              )}
              {activity?.truncated && (
                <p style={{ margin: '10px 0 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>Showing your most recent activity only.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DayGroups<T>({ groups, render }: { groups: { day: string; items: T[] }[]; render: (t: T, i: number) => React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map((g) => (
        <div key={g.day}>
          <p style={{ ...labelStyle, margin: '0 0 4px' }}>{g.day} · {g.items.length}</p>
          <div style={{ borderTop: `1px solid ${colors.border}` }}>
            {g.items.map((it, i) => (
              <div key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>{render(it, i)}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionRow({ session: s }: { session: MySession }) {
  const [open, setOpen] = useState(false);
  const uniqueApps = Array.from(new Set(s.apps.map((a) => a.appId)));
  return (
    <div>
      <button type="button" className="ac-row" onClick={() => s.apps.length && setOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', border: 'none', background: 'transparent', cursor: s.apps.length ? 'pointer' : 'default', textAlign: 'left', flexWrap: 'wrap' }}>
        <span style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><History size={14} color={colors.rust} /></span>
        <span style={{ flex: 1, minWidth: 160 }}>
          <span style={{ display: 'block', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>
            {timeOf(s.start)} – {s.end ? timeOf(s.end) : <span style={{ color: colors.inkSoft, fontWeight: 500 }}>no sign-out</span>}
          </span>
          <span style={{ display: 'block', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 2 }}>
            {s.apps.length === 0 ? 'No apps opened' : `${s.apps.length} app open${s.apps.length === 1 ? '' : 's'} · ${uniqueApps.length} different app${uniqueApps.length === 1 ? '' : 's'}`}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {uniqueApps.slice(0, 4).map((id, i) => (
            <span key={id} style={{ marginLeft: i ? -7 : 0, border: `2px solid ${colors.white}`, borderRadius: radii.md, display: 'flex', backgroundColor: colors.white }}><AppIcon appId={id} size={24} /></span>
          ))}
          {uniqueApps.length > 4 && <span style={{ marginLeft: 5, fontSize: 11, fontFamily: fonts.sansSemiBold, color: colors.inkSoft }}>+{uniqueApps.length - 4}</span>}
        </span>
        <span style={{ minWidth: 64, textAlign: 'right', fontSize: 12.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: s.durationSeconds != null ? colors.ink : colors.inkSoft }}>
          {formatDuration(s.durationSeconds)}
        </span>
        {s.apps.length > 0 ? (open ? <ChevronDown size={15} color={colors.inkSoft} /> : <ChevronRight size={15} color={colors.inkSoft} />) : <span style={{ width: 15 }} />}
      </button>
      {open && (
        <div className="ac-fade" style={{ padding: '2px 4px 12px 46px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {s.apps.map((a, i) => (
            <div key={`${a.appId}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 44, fontSize: 11.5, fontFamily: fonts.sansMedium, color: colors.inkSoft }}>{timeOf(a.at)}</span>
              <AppIcon appId={a.appId} size={22} />
              <span style={{ fontSize: 12.5, fontFamily: fonts.sansMedium, color: colors.ink }}>{appById(a.appId)?.name || a.appId}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, accent, label, value, sub }: { icon: React.ElementType; accent: string; label: string; value: number | string | null; sub?: string }) {
  return (
    <div style={{ ...cardStyle, padding: 16, position: 'relative', overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', right: -18, top: -18, width: 70, height: 70, borderRadius: 35, backgroundColor: `${accent}10` }} />
      <span style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: `${accent}17`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={17} color={accent} /></span>
      <span style={{ display: 'block', marginTop: 10 }}>
        {value === null ? <Skeleton width={60} height={24} /> : <span style={{ display: 'block', fontSize: 24, lineHeight: '28px', fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>}
        <span style={{ display: 'block', fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, marginTop: 4 }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 1 }}>{sub}</span>}
      </span>
    </div>
  );
}

export default function MyActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityContent />
    </Suspense>
  );
}
