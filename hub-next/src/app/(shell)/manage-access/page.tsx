'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ShieldAlert, Search, X, Users, UserCheck, UserX, LogIn, MousePointerClick, TrendingUp, Download,
  UserPlus, LayoutGrid, History, Settings2, ChevronRight, ChevronDown, ChevronUp, KeyRound, FileSpreadsheet,
  CheckCircle2, AlertCircle, Crown, ShieldCheck, Eye, Sparkles, AppWindow, Square, CheckSquare, MinusSquare, Clock,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useIsWideScreen } from '../../../hooks/useIsWideScreen';
import type { AccessChangeEntry, AccessLevel, AppRole, UserAccessEntry } from '../../../types';
import { listAuthorizedUsers, setAccessLevel, setAppAccess, setUserActive, getAccessHistory } from '../../../lib/accessApi';
import { getAdminOverview, getAdminRoster, getAdminAppStats, type AdminOverview, type AdminRosterUsage, type AdminAppStat, type AdminRosterEntry } from '../../../lib/adminApi';
import { exportUsersToExcel } from '../../../lib/exportUsersExcel';
import { exportAdministrationReportToExcel, exportAppStatsToExcel } from '../../../lib/exportAdminExcel';
import { colors, fonts, fontWeights, radii, appColor } from '../../../theme/tokens';
import UserDrawer, { Segmented } from '../../../components/admin/UserDrawer';
import AppDrawer from '../../../components/admin/AppDrawer';
import AddUsersDialog from '../../../components/admin/AddUsersDialog';
import ChangeTimeline from '../../../components/admin/ChangeTimeline';
import {
  AdminStyles, AppIcon, EmptyState, Initials, LevelBadge, Skeleton, Spinner, StatusDot,
  AUDIT_CAPA_APP_ID, GRANTABLE_LEVELS, SORTED_APPS,
  appLabel, canSetLevel, cardStyle, chipStyle, displayName, inputStyle, inputWrapStyle, labelStyle, primaryBtnStyle,
  roleOf, roleOptionsFor, runBatched, secondaryBtnStyle, sectionSubStyle, sectionTitleStyle, timeAgo,
  type AdminUser,
} from '../../../components/admin/adminShared';

/** Admin Center — Manage Access and Administration merged into one screen: Overview (KPIs, top
 * apps, recent changes), People (the editable roster with usage, bulk actions and a per-person
 * drawer), Apps (per-app access + usage), Activity (the org-wide audit trail) and Settings (SSO).
 * The old /administration routes redirect here. */

type Tab = 'overview' | 'people' | 'apps' | 'activity' | 'settings';
type StatusFilter = 'all' | 'active' | 'inactive' | 'never';
type SortKey = 'name' | 'lastSeen' | 'apps' | 'level';
type ChangeFilter = 'all' | 'grants' | 'revokes' | 'people' | 'status' | 'level';

const BULK_CONCURRENCY = 8;
const LEVEL_RANK: Record<AccessLevel, number> = { 'Super Admin': 0, Admin: 1, Viewer: 2 };
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'people', label: 'People', icon: Users },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

function AdminCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isWide = useIsWideScreen();
  const { userEmail, access } = useAuth();
  const actingLevel = access?.accessLevel;
  const canManage = actingLevel === 'Super Admin' || actingLevel === 'Admin';

  const tab = (TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview') as Tab;
  const openEmail = searchParams.get('user');
  const openAppId = searchParams.get('app');
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );
  const goTab = (t: Tab) => setParams({ tab: t, user: null, app: null });
  const openUser = (email: string) => setParams({ user: email, app: null });
  const openApp = (appId: string) => setParams({ app: appId, user: null });

  // ── Data ──────────────────────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserAccessEntry[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [usage, setUsage] = useState<Record<string, AdminRosterUsage>>({});
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [appStats, setAppStats] = useState<AdminAppStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [history, setHistory] = useState<AccessChangeEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const refreshHistory = useCallback(() => {
    getAccessHistory().then((r) => {
      setHistoryLoading(false);
      if (r.ok && r.changes) setHistory(r.changes);
    });
  }, []);

  useEffect(() => {
    if (!canManage) return;
    listAuthorizedUsers().then((r) => {
      setUsersLoading(false);
      if (r.ok && r.users) setUsers(r.users);
      else setUsersError(r.error || 'Could not load people.');
    });
    getAdminRoster().then((r) => {
      if (r.ok && r.users) setUsage(Object.fromEntries(r.users.map((u) => [u.email, u.usage])));
    });
    Promise.all([getAdminOverview(), getAdminAppStats()]).then(([o, a]) => {
      setStatsLoading(false);
      if (o.ok && o.overview) setOverview(o.overview);
      if (a.ok && a.apps) setAppStats(a.apps);
    });
    refreshHistory();
  }, [canManage, refreshHistory]);

  const people: AdminUser[] = useMemo(() => users.map((u) => ({ ...u, usage: usage[u.email] ?? null })), [users, usage]);
  const statByApp = useMemo(() => Object.fromEntries(appStats.map((s) => [s.appId, s])), [appStats]);
  const accessCountByApp = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of users) for (const g of u.apps) m[g.appId] = (m[g.appId] || 0) + 1;
    return m;
  }, [users]);

  // ── Toast ─────────────────────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ id: number; message: string; tone: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ id: Date.now(), message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ── People filters / selection ───────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [levelFilter, setLevelFilter] = useState<AccessLevel | 'all'>('all');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const visiblePeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = people.filter((u) => {
      if (q && !u.email.includes(q) && !displayName(u.email, u.usage?.name).toLowerCase().includes(q) && !(u.mobile || '').includes(q)) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (statusFilter === 'never' && (!u.usage || u.usage.hasLoggedIn)) return false;
      if (levelFilter !== 'all' && u.accessLevel !== levelFilter) return false;
      if (appFilter === 'none' && u.apps.length > 0) return false;
      if (appFilter !== 'all' && appFilter !== 'none' && !roleOf(u, appFilter)) return false;
      return true;
    });
    const cmp = (a: AdminUser, b: AdminUser) => {
      switch (sort.key) {
        case 'lastSeen':
          return (new Date(a.usage?.lastLogin || 0).getTime() - new Date(b.usage?.lastLogin || 0).getTime()) * -1;
        case 'apps':
          return b.apps.length - a.apps.length;
        case 'level':
          return LEVEL_RANK[a.accessLevel] - LEVEL_RANK[b.accessLevel];
        default:
          return displayName(a.email, a.usage?.name).localeCompare(displayName(b.email, b.usage?.name));
      }
    };
    return [...list].sort((a, b) => cmp(a, b) * sort.dir);
  }, [people, search, statusFilter, levelFilter, appFilter, sort]);

  const filtersActive = !!search.trim() || statusFilter !== 'all' || levelFilter !== 'all' || appFilter !== 'all';
  const resetFilters = () => { setSearch(''); setStatusFilter('all'); setLevelFilter('all'); setAppFilter('all'); };
  const showPeople = (patch: { status?: StatusFilter; level?: AccessLevel | 'all'; app?: string }) => {
    setSearch('');
    setStatusFilter(patch.status ?? 'all');
    setLevelFilter(patch.level ?? 'all');
    setAppFilter(patch.app ?? 'all');
    goTab('people');
  };

  const allVisibleSelected = visiblePeople.length > 0 && visiblePeople.every((u) => selected.has(u.email));
  const someVisibleSelected = visiblePeople.some((u) => selected.has(u.email));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visiblePeople.forEach((u) => next.delete(u.email));
      else visiblePeople.forEach((u) => next.add(u.email));
      return next;
    });
  const toggleOne = (email: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  // ── Bulk actions ─────────────────────────────────────────────────────────────────────────
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMenu, setBulkMenu] = useState<'level' | 'app' | null>(null);
  const [bulkApp, setBulkApp] = useState<string>(SORTED_APPS[0]?.id ?? '');
  const [bulkRole, setBulkRole] = useState<AppRole | null>(null);

  const finishBulk = (message: string, failed: number) => {
    notify(message, failed ? 'error' : 'success');
    setSelected(new Set());
    setBulkMenu(null);
    refreshHistory();
  };
  const bulkLevel = async (level: AccessLevel) => {
    if (!userEmail) return;
    const targets = users.filter((u) => selected.has(u.email));
    const eligible = targets.filter((u) => canSetLevel(actingLevel, u, level));
    if (eligible.length === 0) return notify('None of the selected people can be set to that level', 'error');
    setBulkBusy(true);
    try {
      const results = await runBatched(eligible, BULK_CONCURRENCY, (u) => setAccessLevel(u.email, level, userEmail));
      const ok = new Set(eligible.filter((_, i) => results[i].ok).map((u) => u.email));
      setUsers((prev) => prev.map((u) => (ok.has(u.email) ? { ...u, accessLevel: level } : u)));
      const skipped = targets.length - eligible.length;
      finishBulk(`${ok.size} set to ${level}${skipped ? ` · ${skipped} skipped` : ''}${eligible.length - ok.size ? ` · ${eligible.length - ok.size} failed` : ''}`, eligible.length - ok.size);
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkActive = async (isActive: boolean) => {
    const targets = users.filter((u) => selected.has(u.email));
    setBulkBusy(true);
    try {
      const results = await runBatched(targets, BULK_CONCURRENCY, (u) => setUserActive(u.email, isActive, userEmail || undefined));
      const ok = new Set(targets.filter((_, i) => results[i].ok).map((u) => u.email));
      setUsers((prev) => prev.map((u) => (ok.has(u.email) ? { ...u, isActive } : u)));
      finishBulk(`${isActive ? 'Activated' : 'Deactivated'} ${ok.size} of ${targets.length}`, targets.length - ok.size);
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkAppRole = async () => {
    const targets = users.filter((u) => selected.has(u.email));
    if (bulkApp === AUDIT_CAPA_APP_ID && bulkRole === 'Depot') return notify('Depot roles need a depot — set them per person', 'error');
    setBulkBusy(true);
    try {
      const results = await runBatched(targets, BULK_CONCURRENCY, (u) => setAppAccess(u.email, bulkApp, bulkRole, null, userEmail || undefined));
      const ok = new Set(targets.filter((_, i) => results[i].ok).map((u) => u.email));
      setUsers((prev) =>
        prev.map((u) => {
          if (!ok.has(u.email)) return u;
          const apps = u.apps.filter((a) => a.appId !== bulkApp);
          if (bulkRole) apps.push({ appId: bulkApp, role: bulkRole });
          return { ...u, apps };
        })
      );
      finishBulk(`${appLabel(bulkApp)} ${bulkRole ? `set to ${bulkRole}` : 'revoked'} for ${ok.size} of ${targets.length}`, targets.length - ok.size);
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Exports ──────────────────────────────────────────────────────────────────────────────
  const exportPeople = async () => {
    setExporting(true);
    try {
      await exportUsersToExcel(visiblePeople, SORTED_APPS);
    } catch {
      notify('Could not export the list', 'error');
    } finally {
      setExporting(false);
    }
  };
  const downloadReport = async () => {
    if (!overview) return;
    setReportBusy(true);
    try {
      const roster: AdminRosterEntry[] = people.map((u) => ({
        email: u.email, isActive: u.isActive, accessLevel: u.accessLevel, apps: u.apps,
        usage: u.usage ?? { name: null, lastLogin: null, sessionsTotal: 0, logins: 0, timeSpent: '0m', appsOpened: 0, mostUsedApp: null, hasLoggedIn: false },
      }));
      await exportAdministrationReportToExcel(overview, roster, appStats, history);
    } catch {
      notify('Could not generate the report', 'error');
    } finally {
      setReportBusy(false);
    }
  };

  // ── Guard ────────────────────────────────────────────────────────────────────────────────
  if (access && !canManage) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 }}>
        <ShieldAlert size={32} color={colors.inkSoft} />
        <p style={{ fontSize: 16, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 6 }}>You don&apos;t have access to this page</p>
        <p style={{ fontSize: 13, fontFamily: fonts.sansRegular, color: colors.inkSoft, textAlign: 'center', marginBottom: 14 }}>Admin Center is only available to Super Admin and Admin users.</p>
        <button type="button" className="ac-btn" onClick={() => router.push('/')} style={secondaryBtnStyle}>
          <ArrowLeft size={14} /> Back to Emami Apps
        </button>
        <AdminStyles />
      </div>
    );
  }

  const drawerUser = openEmail ? people.find((u) => u.email === openEmail) ?? null : null;
  const activeCount = users.filter((u) => u.isActive).length;
  const neverCount = people.filter((u) => u.usage && !u.usage.hasLoggedIn).length;
  const noAppsCount = users.filter((u) => u.apps.length === 0).length;
  const adminCount = users.filter((u) => u.accessLevel !== 'Viewer').length;
  const pad = isWide ? 24 : 14;

  return (
    <div style={{ minHeight: '100%', padding: pad, paddingBottom: selected.size > 0 ? 120 : 48 }}>
      <AdminStyles />

      {/* ── Hero ── */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: radii.xxxl + 4, padding: isWide ? '26px 28px 0' : '20px 18px 0', background: `linear-gradient(125deg, ${colors.plumDeep} 0%, #2A2070 45%, ${colors.rust} 100%)`, boxShadow: '0 18px 40px -18px rgba(37,27,120,0.6)' }}>
        <div aria-hidden style={{ position: 'absolute', right: -60, top: -80, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,124,255,0.55), transparent 70%)' }} />
        <div aria-hidden style={{ position: 'absolute', left: '40%', bottom: -120, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,233,0.25), transparent 70%)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: '#C7C0FF', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              <ShieldCheck size={13} /> {actingLevel ?? 'Admin'}
            </span>
            <h1 style={{ margin: '6px 0 4px', fontSize: isWide ? 26 : 22, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.white, letterSpacing: -0.3 }}>Admin Center</h1>
            <p style={{ margin: 0, fontSize: 13, fontFamily: fonts.sansRegular, color: 'rgba(255,255,255,0.72)', maxWidth: 520 }}>
              Who can sign in, what they can open, and how Emami Apps is being used — all in one place.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="ac-btn" onClick={downloadReport} disabled={!overview || reportBusy || usersLoading} style={{ ...secondaryBtnStyle, backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.22)', color: colors.white }}>
              {reportBusy ? <Spinner light size={14} /> : <Download size={15} />} Full report
            </button>
            <button type="button" className="ac-btn" onClick={() => setShowAdd(true)} disabled={usersLoading} style={{ ...primaryBtnStyle, background: colors.white, color: colors.rust, boxShadow: '0 6px 16px -6px rgba(0,0,0,0.4)' }}>
              <UserPlus size={15} /> Add people
            </button>
          </div>
        </div>

        <nav className="ac-scroll" style={{ position: 'relative', display: 'flex', gap: 4, marginTop: 22, overflowX: 'auto' }} aria-label="Admin Center sections">
          {TABS.map((t) => {
            const active = t.id === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  borderRadius: `${radii.lg}px ${radii.lg}px 0 0`, backgroundColor: active ? colors.appBg : 'transparent',
                  color: active ? colors.rust : 'rgba(255,255,255,0.78)', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold,
                  transition: 'background-color 160ms, color 160ms',
                }}
              >
                <Icon size={15} />
                {t.label}
                {t.id === 'people' && !usersLoading && (
                  <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 999, backgroundColor: active ? `${colors.rust}17` : 'rgba(255,255,255,0.16)' }}>{users.length}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div key={tab} className="ac-fade" style={{ marginTop: 20 }}>
        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isWide ? 190 : 150}px, 1fr))`, gap: 12 }}>
              <Kpi icon={Users} accent={colors.rust} label="People with access" value={usersLoading ? null : users.length} sub={`${activeCount} can sign in`} onClick={() => showPeople({})} />
              <Kpi icon={UserCheck} accent="#16A34A" label="Active last 7 days" value={statsLoading ? null : overview?.activeLast7Days ?? '—'} sub={overview ? `${overview.activeLast30Days} in 30 days` : ''} />
              <Kpi icon={LogIn} accent="#0EA5E9" label="Total sign-ins" value={statsLoading ? null : overview?.totalLogins ?? '—'} sub="all time" />
              <Kpi icon={MousePointerClick} accent="#9333EA" label="App opens" value={statsLoading ? null : overview?.totalAppOpens ?? '—'} sub="all time" onClick={() => goTab('apps')} />
              <Kpi icon={TrendingUp} accent="#F59E0B" label="Most used app" value={statsLoading ? null : overview?.mostUsedApp ? appLabel(overview.mostUsedApp.appId) : '—'} sub={overview?.mostUsedApp ? `${overview.mostUsedApp.opens} opens` : 'no activity yet'} small onClick={overview?.mostUsedApp ? () => openApp(overview.mostUsedApp!.appId) : undefined} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isWide ? 'minmax(0, 1.25fr) minmax(0, 1fr)' : '1fr', gap: 16 }}>
              <div style={{ ...cardStyle, padding: 20 }}>
                <CardHead title="Top apps" sub="By total opens, org-wide" action={<LinkBtn onClick={() => goTab('apps')}>All apps</LinkBtn>} />
                {statsLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={28} />)}</div>
                ) : appStats.length === 0 ? (
                  <EmptyState icon={AppWindow} title="No app activity yet" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[...appStats].sort((a, b) => b.opens - a.opens).slice(0, 7).map((s, i, arr) => (
                      <button key={s.appId} type="button" className="ac-row" onClick={() => openApp(s.appId)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px', border: 'none', background: 'transparent', borderRadius: radii.md, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                        <span style={{ width: 18, fontSize: 12, fontFamily: fonts.sansBold, color: colors.inkSoft, textAlign: 'center' }}>{i + 1}</span>
                        <AppIcon appId={s.appId} size={30} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appLabel(s.appId)}</span>
                            <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, color: colors.ink, whiteSpace: 'nowrap' }}>{s.opens.toLocaleString()} <span style={{ color: colors.inkSoft, fontWeight: 500 }}>· {s.uniqueUsers} people</span></span>
                          </span>
                          <span style={{ display: 'block', height: 6, borderRadius: 3, backgroundColor: '#EEF0F4', marginTop: 6, overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${Math.max(3, (s.opens / (arr[0].opens || 1)) * 100)}%`, borderRadius: 3, background: `linear-gradient(90deg, ${appColor(s.appId)}88, ${appColor(s.appId)})` }} />
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ ...cardStyle, padding: 20 }}>
                  <CardHead title="Needs attention" sub="Quick filters into People" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <AttentionRow icon={Clock} accent="#F59E0B" label="Never signed in" count={neverCount} loading={usersLoading} onClick={() => showPeople({ status: 'never' })} />
                    <AttentionRow icon={UserX} accent="#E11D48" label="Sign-in blocked (inactive)" count={users.length - activeCount} loading={usersLoading} onClick={() => showPeople({ status: 'inactive' })} />
                    <AttentionRow icon={AppWindow} accent="#64748B" label="No apps granted" count={noAppsCount} loading={usersLoading} onClick={() => showPeople({ app: 'none' })} />
                    <AttentionRow icon={ShieldCheck} accent={colors.rust} label="Admins & Super Admins" count={adminCount} loading={usersLoading} onClick={() => goTab('people')} />
                  </div>
                </div>
                <div style={{ ...cardStyle, padding: 20, flex: 1 }}>
                  <CardHead title="Recent changes" sub="Latest access updates" action={<LinkBtn onClick={() => goTab('activity')}>View all</LinkBtn>} />
                  {historyLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={34} />)}</div>
                  ) : history.length === 0 ? (
                    <EmptyState icon={History} title="No changes yet" />
                  ) : (
                    <ChangeTimeline changes={history.slice(0, 5)} onOpenUser={openUser} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── People ── */}
        {tab === 'people' && (
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: isWide ? '18px 20px 14px' : 14, display: 'flex', flexDirection: 'column', gap: 12, borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="ac-input" style={{ ...inputWrapStyle, flex: 1, minWidth: 220 }}>
                  <Search size={15} color={colors.inkSoft} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or mobile…" style={inputStyle} aria-label="Search people" />
                  {!!search && <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear search"><X size={14} color={colors.inkSoft} /></button>}
                </div>
                <Select value={levelFilter} onChange={(v) => setLevelFilter(v as AccessLevel | 'all')} options={[{ value: 'all', label: 'All levels' }, { value: 'Super Admin', label: 'Super Admin' }, { value: 'Admin', label: 'Admin' }, { value: 'Viewer', label: 'Viewer' }]} />
                <Select value={appFilter} onChange={setAppFilter} options={[{ value: 'all', label: 'Any app' }, { value: 'none', label: 'No apps granted' }, ...SORTED_APPS.map((a) => ({ value: a.id, label: `Has ${a.name}` }))]} />
                <button type="button" className="ac-btn" onClick={exportPeople} disabled={exporting || visiblePeople.length === 0} style={secondaryBtnStyle}>
                  {exporting ? <Spinner size={14} /> : <FileSpreadsheet size={15} color="#16A34A" />} Export
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {([
                  ['all', 'Everyone', users.length],
                  ['active', 'Active', activeCount],
                  ['inactive', 'Inactive', users.length - activeCount],
                  ['never', 'Never signed in', neverCount],
                ] as [StatusFilter, string, number][]).map(([id, label, n]) => (
                  <button key={id} type="button" onClick={() => setStatusFilter(id)} style={chipStyle(statusFilter === id)}>
                    {label} <span style={{ opacity: 0.7 }}>{n}</span>
                  </button>
                ))}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontFamily: fonts.sansMedium, color: colors.inkSoft }}>
                  Showing {visiblePeople.length} of {users.length}
                </span>
                {filtersActive && <LinkBtn onClick={resetFilters}>Clear filters</LinkBtn>}
              </div>
            </div>

            {usersError && <p style={{ padding: '12px 20px', margin: 0, color: '#C0392B', fontSize: 12.5, fontFamily: fonts.sansMedium }}>{usersError}</p>}

            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', backgroundColor: '#FAFAFD', borderBottom: `1px solid ${colors.border}` }}>
              <button type="button" onClick={toggleAll} style={checkBtnStyle} aria-label="Select all shown">
                {allVisibleSelected ? <CheckSquare size={17} color={colors.rust} /> : someVisibleSelected ? <MinusSquare size={17} color={colors.rust} /> : <Square size={17} color="#A0A6B1" />}
              </button>
              <SortHead label="Person" k="name" sort={sort} setSort={setSort} style={{ flex: 1, minWidth: 0 }} />
              {isWide && <SortHead label="Level" k="level" sort={sort} setSort={setSort} style={{ width: 120 }} />}
              <SortHead label="Apps" k="apps" sort={sort} setSort={setSort} style={{ width: isWide ? 150 : 70 }} />
              {isWide && <SortHead label="Last seen" k="lastSeen" sort={sort} setSort={setSort} style={{ width: 110 }} />}
              {isWide && <span style={{ ...labelStyle, width: 80 }}>Status</span>}
              <span style={{ width: 16 }} />
            </div>

            {usersLoading ? (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Skeleton width={36} height={36} radius={18} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><Skeleton width="40%" height={12} /><Skeleton width="60%" height={10} /></div>
                  </div>
                ))}
              </div>
            ) : visiblePeople.length === 0 ? (
              <EmptyState icon={Search} title={filtersActive ? 'No one matches these filters' : 'No people yet'} hint={filtersActive ? 'Try clearing a filter or searching something else.' : 'Add the first person to get started.'} />
            ) : (
              <div>
                {visiblePeople.map((u) => {
                  const isSel = selected.has(u.email);
                  return (
                    <div
                      key={u.email}
                      className="ac-row"
                      onClick={() => openUser(u.email)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isWide ? '11px 20px' : '11px 14px', borderBottom: `1px solid ${colors.border}`, cursor: 'pointer', backgroundColor: isSel ? `${colors.rust}0a` : colors.white }}
                    >
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleOne(u.email); }} style={checkBtnStyle} aria-label={`Select ${u.email}`}>
                        {isSel ? <CheckSquare size={17} color={colors.rust} /> : <Square size={17} color="#A0A6B1" />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, opacity: u.isActive ? 1 : 0.6 }}>
                        <Initials email={u.email} name={u.usage?.name} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(u.email, u.usage?.name)}</p>
                          <p style={{ margin: '1px 0 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.email}
                            {!isWide && ` · ${u.usage?.hasLoggedIn ? timeAgo(u.usage.lastLogin) : 'Never signed in'}`}
                          </p>
                          {!isWide && (u.accessLevel !== 'Viewer' || !u.isActive) && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                              {u.accessLevel !== 'Viewer' && <LevelBadge level={u.accessLevel} compact />}
                              {!u.isActive && <StatusDot active={false} />}
                            </div>
                          )}
                        </div>
                      </div>
                      {isWide && <span style={{ width: 120 }}><LevelBadge level={u.accessLevel} compact /></span>}
                      <span style={{ width: isWide ? 150 : 70 }}><AppStack apps={u.apps.map((g) => g.appId)} max={isWide ? 4 : 1} /></span>
                      {isWide && (
                        <span style={{ width: 110, fontSize: 12, fontFamily: fonts.sansMedium, color: u.usage?.hasLoggedIn ? colors.ink : colors.inkSoft }} title={u.usage?.lastLogin ? new Date(u.usage.lastLogin).toLocaleString() : undefined}>
                          {u.usage ? (u.usage.hasLoggedIn ? timeAgo(u.usage.lastLogin) : 'Never') : '—'}
                        </span>
                      )}
                      {isWide && <span style={{ width: 80 }}><StatusDot active={u.isActive} /></span>}
                      <ChevronRight size={16} color="#A0A6B1" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Apps ── */}
        {tab === 'apps' && <AppsPanel accessCount={accessCountByApp} statByApp={statByApp} appStats={appStats} loading={statsLoading} onOpen={openApp} notify={notify} />}

        {/* ── Activity ── */}
        {tab === 'activity' && <ActivityPanel history={history} loading={historyLoading} onOpenUser={openUser} />}

        {/* ── Settings ── */}
        {tab === 'settings' && (
          <div style={{ display: 'grid', gridTemplateColumns: isWide ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 16 }}>
            <button type="button" className="ac-card" onClick={() => router.push('/manage-access/sso')} style={{ ...cardStyle, padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 44, height: 44, borderRadius: radii.lg, background: 'linear-gradient(135deg, #0EA5E9, #2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <KeyRound size={20} color={colors.white} />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ ...sectionTitleStyle, display: 'block' }}>Single sign-on (Microsoft)</span>
                <span style={{ ...sectionSubStyle, display: 'block', lineHeight: '17px' }}>Service-provider details for Entra and the identity-provider certificate in use.</span>
              </span>
              <ChevronRight size={18} color={colors.inkSoft} style={{ marginTop: 12 }} />
            </button>
            <div style={{ ...cardStyle, padding: 20 }}>
              <CardHead title="Access levels" sub="What each hub level can do" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <LevelExplainer icon={Crown} accent="#B45309" title="Super Admin" text="Everything Admin can do, plus promote people to Admin. Fixed — can’t be granted from here." />
                <LevelExplainer icon={ShieldCheck} accent={colors.rust} title="Admin" text="Opens Admin Center, adds and removes people, grants app access and sets people to Viewer." />
                <LevelExplainer icon={Eye} accent="#64748B" title="Viewer" text="Regular user — signs in and opens only the apps granted to them." />
              </div>
            </div>
            <div style={{ ...cardStyle, padding: 20, gridColumn: isWide ? '1 / -1' : undefined, display: 'flex', gap: 12, alignItems: 'flex-start', background: `linear-gradient(135deg, ${colors.rust}08, ${colors.white})` }}>
              <AlertCircle size={18} color={colors.rust} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '19px' }}>
                The People list is the source of truth for who can sign in. An email that isn&apos;t listed, or is marked inactive, is blocked at login whatever the sign-in method. Some apps
                (Audit &amp; CAPA, RC Portal, Current Market Rate, Mould Health Inspection, Non CTC Expense, Dispatch Tracker) also manage roles inside the app — the hub grant only opens the door.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="ac-pop" style={{ position: 'fixed', left: '50%', bottom: 22, transform: 'translateX(-50%)', zIndex: 80, width: 'max-content', maxWidth: 'calc(100vw - 24px)' }}>
          {bulkMenu && (
            <div className="ac-fade" style={{ marginBottom: 8, backgroundColor: colors.white, borderRadius: radii.xl, padding: 14, boxShadow: '0 20px 40px -12px rgba(21,17,41,0.35)', border: `1px solid ${colors.border}` }}>
              {bulkMenu === 'level' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={labelStyle}>Set level to</span>
                  {GRANTABLE_LEVELS.map((l) => (
                    <button key={l} type="button" className="ac-btn" disabled={bulkBusy || (actingLevel !== 'Super Admin' && l === 'Admin')} onClick={() => bulkLevel(l)} style={{ ...secondaryBtnStyle, height: 34 }}>
                      <LevelBadge level={l} compact />
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Select value={bulkApp} onChange={(v) => { setBulkApp(v); setBulkRole(null); }} options={SORTED_APPS.map((a) => ({ value: a.id, label: a.name }))} />
                  <Segmented size="sm" accent={appColor(bulkApp)} options={[{ value: null, label: 'Revoke' }, ...roleOptionsFor(bulkApp).map((r) => ({ value: r, label: r }))]} value={bulkRole} onChange={setBulkRole} />
                  <button type="button" className="ac-btn" disabled={bulkBusy} onClick={bulkAppRole} style={{ ...primaryBtnStyle, height: 34 }}>
                    {bulkBusy ? <Spinner light size={13} /> : <CheckCircle2 size={14} />} Apply
                  </button>
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, paddingLeft: 16, borderRadius: radii.pill, backgroundColor: colors.plumDeep, boxShadow: '0 20px 40px -12px rgba(21,17,41,0.55)', overflowX: 'auto' }}>
            <span style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.white, whiteSpace: 'nowrap', marginRight: 6 }}>
              {bulkBusy ? <Spinner light size={13} /> : selected.size} selected
            </span>
            <BarBtn active={bulkMenu === 'app'} onClick={() => setBulkMenu(bulkMenu === 'app' ? null : 'app')}>App access <ChevronDown size={13} /></BarBtn>
            <BarBtn active={bulkMenu === 'level'} onClick={() => setBulkMenu(bulkMenu === 'level' ? null : 'level')}>Level <ChevronDown size={13} /></BarBtn>
            <BarBtn disabled={bulkBusy} onClick={() => bulkActive(true)}>Activate</BarBtn>
            <BarBtn disabled={bulkBusy} onClick={() => bulkActive(false)}>Deactivate</BarBtn>
            <button type="button" onClick={() => { setSelected(new Set()); setBulkMenu(null); }} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', backgroundColor: 'rgba(255,255,255,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-label="Clear selection">
              <X size={15} color={colors.white} />
            </button>
          </div>
        </div>
      )}

      {/* ── Overlays ── */}
      {drawerUser && (
        <UserDrawer
          key={drawerUser.email}
          user={drawerUser}
          actingLevel={actingLevel}
          actingEmail={userEmail}
          onClose={() => setParams({ user: null })}
          onSaved={(updated) => { setUsers((prev) => prev.map((u) => (u.email === updated.email ? updated : u))); refreshHistory(); }}
          onRemoved={(email) => {
            setUsers((prev) => prev.filter((u) => u.email !== email));
            setSelected((prev) => { const n = new Set(prev); n.delete(email); return n; });
            setParams({ user: null });
            refreshHistory();
          }}
          notify={notify}
        />
      )}
      {openAppId && <AppDrawer appId={openAppId} users={people} stat={statByApp[openAppId]} onClose={() => setParams({ app: null })} onOpenUser={openUser} />}
      {showAdd && (
        <AddUsersDialog
          existingEmails={new Set(users.map((u) => u.email))}
          actingEmail={userEmail}
          onClose={() => setShowAdd(false)}
          onAdded={(added) => { setUsers((prev) => [...prev, ...added]); refreshHistory(); if (added.length && tab !== 'people') goTab('people'); }}
          notify={notify}
        />
      )}

      {toast && (
        <div key={toast.id} className="ac-pop" role="status" style={{ position: 'fixed', left: '50%', bottom: selected.size > 0 ? 90 : 24, transform: 'translateX(-50%)', zIndex: 120, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: radii.lg, backgroundColor: toast.tone === 'success' ? '#0F3D2A' : '#4C0519', color: colors.white, boxShadow: '0 16px 32px -10px rgba(0,0,0,0.4)', maxWidth: 'calc(100vw - 32px)' }}>
          {toast.tone === 'success' ? <CheckCircle2 size={17} color="#4ADE80" /> : <AlertCircle size={17} color="#FDA4AF" />}
          <span style={{ fontSize: 13, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', marginLeft: 4 }} aria-label="Dismiss"><X size={14} color="rgba(255,255,255,0.7)" /></button>
        </div>
      )}
    </div>
  );
}

// ── Panels ───────────────────────────────────────────────────────────────────────────────────

function AppsPanel({
  accessCount, statByApp, appStats, loading, onOpen, notify,
}: {
  accessCount: Record<string, number>;
  statByApp: Record<string, AdminAppStat>;
  appStats: AdminAppStat[];
  loading: boolean;
  onOpen: (appId: string) => void;
  notify: (m: string, t?: 'success' | 'error') => void;
}) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'opens' | 'access'>('opens');
  const [exporting, setExporting] = useState(false);
  const q = search.trim().toLowerCase();
  const apps = SORTED_APPS.filter((a) => !q || a.name.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q)).sort((a, b) => {
    if (sortBy === 'opens') return (statByApp[b.id]?.opens || 0) - (statByApp[a.id]?.opens || 0);
    if (sortBy === 'access') return (accessCount[b.id] || 0) - (accessCount[a.id] || 0);
    return a.name.localeCompare(b.name);
  });
  const maxAccess = Math.max(1, ...Object.values(accessCount));

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <div className="ac-input" style={{ ...inputWrapStyle, flex: 1, minWidth: 220 }}>
          <Search size={15} color={colors.inkSoft} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search apps or categories…" style={inputStyle} />
          {!!search && <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear"><X size={14} color={colors.inkSoft} /></button>}
        </div>
        <Segmented options={[{ value: 'opens', label: 'Most used' }, { value: 'access', label: 'Most access' }, { value: 'name', label: 'A–Z' }]} value={sortBy} onChange={(v) => setSortBy(v as typeof sortBy)} />
        <button
          type="button"
          className="ac-btn"
          disabled={appStats.length === 0 || exporting}
          onClick={async () => { setExporting(true); try { await exportAppStatsToExcel(appStats); } catch { notify('Could not export', 'error'); } finally { setExporting(false); } }}
          style={secondaryBtnStyle}
        >
          {exporting ? <Spinner size={14} /> : <FileSpreadsheet size={15} color="#16A34A" />} Export
        </button>
      </div>

      {apps.length === 0 ? (
        <div style={cardStyle}><EmptyState icon={LayoutGrid} title="No apps match" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
          {apps.map((a) => {
            const s = statByApp[a.id];
            const accent = appColor(a.id);
            const n = accessCount[a.id] || 0;
            return (
              <button key={a.id} type="button" className="ac-card" onClick={() => onOpen(a.id)} style={{ ...cardStyle, padding: 16, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', overflow: 'hidden' }}>
                <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.85 }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <AppIcon appId={a.id} size={40} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>{a.cat}</span>
                  </span>
                  <ChevronRight size={16} color="#A0A6B1" />
                </span>
                <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <MiniStat label="Access" value={n} />
                  <MiniStat label="Opens" value={loading ? '…' : s?.opens ?? 0} />
                  <MiniStat label="Users" value={loading ? '…' : s?.uniqueUsers ?? 0} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: '#EEF0F4', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(n / maxAccess) * 100}%`, background: accent, borderRadius: 3 }} />
                  </span>
                  <span style={{ fontSize: 11, fontFamily: fonts.sansMedium, color: colors.inkSoft, whiteSpace: 'nowrap' }}>Used {timeAgo(s?.lastOpened)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CHANGE_FILTERS: { id: ChangeFilter; label: string; match: (c: AccessChangeEntry) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'grants', label: 'Grants', match: (c) => c.changeType === 'APP_ROLE' && !!c.newValue },
  { id: 'revokes', label: 'Revokes', match: (c) => c.changeType === 'APP_ROLE' && !c.newValue },
  { id: 'people', label: 'Added / removed', match: (c) => c.changeType === 'USER_ADDED' || c.changeType === 'USER_REMOVED' },
  { id: 'status', label: 'Sign-in status', match: (c) => c.changeType === 'ACTIVE_STATUS' },
  { id: 'level', label: 'Level', match: (c) => c.changeType === 'ACCESS_LEVEL' },
];

function ActivityPanel({ history, loading, onOpenUser }: { history: AccessChangeEntry[]; loading: boolean; onOpenUser: (email: string) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ChangeFilter>('all');
  const [limit, setLimit] = useState(60);
  const q = search.trim().toLowerCase();
  const match = CHANGE_FILTERS.find((f) => f.id === filter)!.match;
  const list = history.filter((c) => match(c) && (!q || c.targetEmail.includes(q) || (c.changedBy || '').includes(q) || (c.appId ? appLabel(c.appId).toLowerCase().includes(q) : false)));

  return (
    <div style={{ ...cardStyle, padding: 20 }}>
      <CardHead title="Audit trail" sub="Every access change, who made it and when" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="ac-input" style={{ ...inputWrapStyle, flex: 1, minWidth: 220 }}>
          <Search size={15} color={colors.inkSoft} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setLimit(60); }} placeholder="Search person, admin or app…" style={inputStyle} />
          {!!search && <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear"><X size={14} color={colors.inkSoft} /></button>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {CHANGE_FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => { setFilter(f.id); setLimit(60); }} style={chipStyle(filter === f.id)}>{f.label}</button>
        ))}
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={36} />)}</div>
      ) : list.length === 0 ? (
        <EmptyState icon={History} title={q || filter !== 'all' ? 'Nothing matches' : 'No changes recorded yet'} />
      ) : (
        <>
          <ChangeTimeline changes={list.slice(0, limit)} onOpenUser={onOpenUser} />
          {list.length > limit && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
              <button type="button" className="ac-btn" onClick={() => setLimit((l) => l + 60)} style={secondaryBtnStyle}>Show more ({list.length - limit} left)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────────────────────

function Kpi({ icon: Icon, accent, label, value, sub, onClick, small }: { icon: React.ElementType; accent: string; label: string; value: number | string | null; sub: string; onClick?: () => void; small?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={onClick ? 'ac-card' : undefined} style={{ ...cardStyle, padding: 16, textAlign: 'left', cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', right: -18, top: -18, width: 70, height: 70, borderRadius: 35, backgroundColor: `${accent}10` }} />
      <span style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: `${accent}17`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={accent} />
      </span>
      <span>
        {value === null ? (
          <Skeleton width={70} height={22} />
        ) : (
          <span style={{ display: 'block', fontSize: small ? 16 : 24, lineHeight: small ? '24px' : '28px', fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
        )}
        <span style={{ display: 'block', fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, marginTop: 4 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 1 }}>{sub || ' '}</span>
      </span>
    </Tag>
  );
}

function AttentionRow({ icon: Icon, accent, label, count, loading, onClick }: { icon: React.ElementType; accent: string; label: string; count: number; loading: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ac-row" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', border: `1px solid ${colors.border}`, borderRadius: radii.lg, backgroundColor: colors.white, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      <span style={{ width: 30, height: 30, borderRadius: radii.md, backgroundColor: `${accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={15} color={accent} /></span>
      <span style={{ flex: 1, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{label}</span>
      {loading ? <Skeleton width={24} height={14} /> : <span style={{ fontSize: 14, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: count ? accent : colors.inkSoft }}>{count}</span>}
      <ChevronRight size={15} color="#A0A6B1" />
    </button>
  );
}

function AppStack({ apps, max }: { apps: string[]; max: number }) {
  if (apps.length === 0) return <span style={{ fontSize: 12, fontFamily: fonts.sansMedium, color: '#A0A6B1' }}>None</span>;
  const shown = apps.slice(0, max);
  return (
    <span style={{ display: 'flex', alignItems: 'center' }} title={apps.map(appLabel).join(', ')}>
      {shown.map((id, i) => (
        <span key={id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: radii.md, border: `2px solid ${colors.white}`, display: 'flex', backgroundColor: colors.white }}>
          <AppIcon appId={id} size={26} />
        </span>
      ))}
      {apps.length > max && <span style={{ marginLeft: 6, fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft }}>+{apps.length - max}</span>}
    </span>
  );
}

function SortHead({ label, k, sort, setSort, style }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; style?: React.CSSProperties }) {
  const active = sort.key === k;
  return (
    <button type="button" onClick={() => setSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : 1 })} style={{ ...labelStyle, ...style, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: active ? colors.rust : colors.inkSoft, textAlign: 'left' }}>
      {label}
      {active && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="ac-input" style={{ ...inputWrapStyle, position: 'relative', padding: 0, minWidth: 150 }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ appearance: 'none', WebkitAppearance: 'none', border: 'none', outline: 'none', background: 'transparent', height: '100%', width: '100%', padding: '0 34px 0 12px', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, cursor: 'pointer' }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} color={colors.inkSoft} style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
    </div>
  );
}

function CardHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
      <div style={{ flex: 1 }}>
        <p style={sectionTitleStyle}>{title}</p>
        {sub && <p style={sectionSubStyle}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust, whiteSpace: 'nowrap' }}>
      {children} <ChevronRight size={13} />
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <span style={{ display: 'block', padding: '8px 10px', borderRadius: radii.md, backgroundColor: '#F6F7FA' }}>
      <span style={{ display: 'block', fontSize: 15, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      <span style={{ display: 'block', fontSize: 10, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
    </span>
  );
}

function LevelExplainer({ icon: Icon, accent, title, text }: { icon: React.ElementType; accent: string; title: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ width: 30, height: 30, borderRadius: radii.md, backgroundColor: `${accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={15} color={accent} /></span>
      <span>
        <span style={{ display: 'block', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '17px' }}>{text}</span>
      </span>
    </div>
  );
}

function BarBtn({ children, onClick, active, disabled }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="ac-btn" onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: active ? colors.white : 'rgba(255,255,255,0.12)', color: active ? colors.plumDeep : colors.white, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>
      {children}
    </button>
  );
}

const checkBtnStyle: React.CSSProperties = { width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 };

export default function ManageAccessPage() {
  return (
    <Suspense fallback={null}>
      <AdminCenter />
    </Suspense>
  );
}
