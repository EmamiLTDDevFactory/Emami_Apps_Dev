'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ShieldAlert, Search, X, Info, BarChart3, Users, UserCheck, LogIn,
  MousePointerClick, TrendingUp, ShieldCheck, Download, History,
} from 'lucide-react';
import Dialog from '../../../components/Dialog';
import { appById } from '../../../data/mockData';
import { useAuth } from '../../../context/AuthContext';
import {
  getAdminOverview, getAdminRoster, getAdminAppStats, getAdminAppUserStats,
  type AdminOverview, type AdminRosterEntry, type AdminAppStat, type AdminAppUserStat,
} from '../../../lib/adminApi';
import { getAccessHistory } from '../../../lib/accessApi';
import type { AccessChangeEntry } from '../../../types';
import { exportAdministrationReportToExcel, exportAppStatsToExcel, exportAppUserStatsToExcel } from '../../../lib/exportAdminExcel';
import { colors, fonts, fontWeights, radii, appColor } from '../../../theme/tokens';

function formatDateShort(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
function appLabel(appId: string): string {
  return appById(appId)?.name || appId;
}

/** Turns one change-history row into a short, readable sentence for the Change History feed. */
function describeChange(c: AccessChangeEntry): string {
  switch (c.changeType) {
    case 'USER_ADDED':
      return 'Added to Manage Access';
    case 'USER_REMOVED':
      return 'Removed from Manage Access';
    case 'ACTIVE_STATUS':
      return c.newValue === 'true' ? 'Activated' : 'Deactivated';
    case 'ACCESS_LEVEL':
      return `Access level changed: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`;
    case 'APP_ROLE': {
      const app = c.appId ? appLabel(c.appId) : 'an app';
      if (!c.oldValue) return `Granted ${app}: ${c.newValue}`;
      if (!c.newValue) return `Revoked ${app} (was ${c.oldValue})`;
      return `${app} role changed: ${c.oldValue} → ${c.newValue}`;
    }
    case 'MOBILE_SET':
      return 'Mobile number updated';
    default:
      return c.changeType;
  }
}

function ChangeHistoryList({ changes }: { changes: AccessChangeEntry[] }) {
  if (changes.length === 0) {
    return <p style={emptyTextStyle}>No changes recorded yet.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {changes.map((c, i) => (
        <div key={c.id} style={{ padding: '10px 0', borderBottom: i < changes.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{describeChange(c)}</span>
            <span style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, flexShrink: 0 }}>{formatDateTime(c.occurredAt)}</span>
          </div>
          <p style={{ fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 2, marginBottom: 0 }}>
            {c.targetEmail}{c.changedBy && c.changedBy !== c.targetEmail ? ` · by ${c.changedBy}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function AdministrationPage() {
  const router = useRouter();
  const { access } = useAuth();
  const actingLevel = access?.accessLevel;
  const canViewAdministration = actingLevel === 'Super Admin' || actingLevel === 'Admin';

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');

  const [roster, setRoster] = useState<AdminRosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');

  const [orgAppStats, setOrgAppStats] = useState<AdminAppStat[]>([]);
  const [orgAppStatsLoading, setOrgAppStatsLoading] = useState(true);
  const [orgAppStatsError, setOrgAppStatsError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [appDownloading, setAppDownloading] = useState(false);
  const [appDownloadError, setAppDownloadError] = useState('');

  const [orgHistory, setOrgHistory] = useState<AccessChangeEntry[]>([]);
  const [orgHistoryLoading, setOrgHistoryLoading] = useState(true);
  const [orgHistoryError, setOrgHistoryError] = useState('');

  const [appUsersFor, setAppUsersFor] = useState<string | null>(null);
  const [appUsers, setAppUsers] = useState<AdminAppUserStat[]>([]);
  const [appUsersLoading, setAppUsersLoading] = useState(false);
  const [appUsersError, setAppUsersError] = useState('');
  const [appUsersDownloading, setAppUsersDownloading] = useState(false);

  useEffect(() => {
    getAdminOverview().then((result) => {
      setOverviewLoading(false);
      if (result.ok && result.overview) setOverview(result.overview);
      else setOverviewError(result.error || 'Could not load the overview.');
    });
    getAdminRoster().then((result) => {
      setRosterLoading(false);
      if (result.ok && result.users) setRoster(result.users);
      else setRosterError(result.error || 'Could not load the user roster.');
    });
    getAdminAppStats().then((result) => {
      setOrgAppStatsLoading(false);
      if (result.ok && result.apps) {
        const sorted = [...result.apps].sort((a, b) => appLabel(a.appId).localeCompare(appLabel(b.appId)));
        setOrgAppStats(sorted);
      } else setOrgAppStatsError(result.error || 'Could not load app-wise usage.');
    });
    getAccessHistory().then((result) => {
      setOrgHistoryLoading(false);
      if (result.ok && result.changes) setOrgHistory(result.changes);
      else setOrgHistoryError(result.error || 'Could not load change history.');
    });
  }, []);

  const canDownload = !overviewLoading && !rosterLoading && !overviewError && !rosterError && !!overview;

  const handleDownload = async () => {
    if (!overview) return;
    setDownloading(true);
    setDownloadError('');
    try {
      await exportAdministrationReportToExcel(overview, roster, orgAppStats, orgHistory);
    } catch {
      setDownloadError('Could not generate the report. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleAppStatsDownload = async () => {
    setAppDownloading(true);
    setAppDownloadError('');
    try {
      await exportAppStatsToExcel(orgAppStats);
    } catch {
      setAppDownloadError('Could not generate the report. Please try again.');
    } finally {
      setAppDownloading(false);
    }
  };

  const openUser = (user: AdminRosterEntry) => {
    router.push(`/administration/user?email=${encodeURIComponent(user.email)}`);
  };

  const openAppUsers = (appId: string) => {
    setAppUsersFor(appId);
    setAppUsers([]);
    setAppUsersError('');
    setAppUsersLoading(true);
    getAdminAppUserStats(appId).then((result) => {
      setAppUsersLoading(false);
      if (result.ok && result.users) setAppUsers(result.users);
      else setAppUsersError(result.error || 'Could not load per-user stats for this app.');
    });
  };
  const closeAppUsers = () => setAppUsersFor(null);

  const handleAppUsersDownload = async () => {
    if (!appUsersFor) return;
    setAppUsersDownloading(true);
    try {
      await exportAppUserStatsToExcel(appUsersFor, appUsers);
    } finally {
      setAppUsersDownloading(false);
    }
  };

  const visibleRoster = roster.filter((u) => u.email.toLowerCase().includes(rosterSearch.trim().toLowerCase()));

  if (access && !canViewAdministration) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 }}>
        <ShieldAlert size={32} color={colors.inkSoft} />
        <p style={{ fontSize: 16, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 6 }}>You don&apos;t have access to this page</p>
        <p style={{ fontSize: 13, fontFamily: fonts.sansRegular, color: colors.inkSoft, textAlign: 'center', marginBottom: 14 }}>Administration is only available to Super Admin and Admin users.</p>
        <button type="button" onClick={() => router.push('/')} style={backBtnStyle}>
          <ArrowLeft size={13} color={colors.ink} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Back to Emami Apps</span>
        </button>
      </div>
    );
  }

  const kpiTiles = overview
    ? [
        { icon: Users, label: 'Authorized Users', value: String(overview.totalAuthorizedUsers), sub: `${overview.activeAuthorizedUsers} active` },
        { icon: UserCheck, label: 'Active (7d / 30d)', value: `${overview.activeLast7Days} / ${overview.activeLast30Days}`, sub: `${overview.neverLoggedIn} never signed in` },
        { icon: LogIn, label: 'Total Logins', value: String(overview.totalLogins), sub: 'all-time' },
        { icon: MousePointerClick, label: 'Total App Opens', value: String(overview.totalAppOpens), sub: 'all-time' },
        {
          icon: TrendingUp,
          label: 'Most Used App',
          value: overview.mostUsedApp ? appLabel(overview.mostUsedApp.appId) : '—',
          sub: overview.mostUsedApp ? `${overview.mostUsedApp.opens} opens` : 'no activity yet',
        },
      ]
    : [];

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
        <button type="button" onClick={() => router.push('/')} style={backBtnStyle}>
          <ArrowLeft size={13} color={colors.ink} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Back to Emami Apps</span>
        </button>
        <p style={{ fontSize: 18, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0, flex: 1 }}>Administration</p>
        <button type="button" onClick={handleDownload} disabled={!canDownload || downloading} style={{ ...downloadBtnStyle, ...(!canDownload ? { opacity: 0.5 } : null) }}>
          <Download size={13} color={colors.white} />
          <span style={downloadBtnTextStyle}>{downloading ? 'Preparing…' : 'Download Report'}</span>
        </button>
      </div>
      {!!downloadError && <p style={errorTextStyle}>{downloadError}</p>}

      <div style={noticeCardStyle}>
        <Info size={15} color={colors.rust} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={noticeTextStyle}>
          Org-wide KPIs, per-user access/activity, and a full change-history audit trail, for monitoring only — role and access changes still happen in Manage Access. Some apps
          (Audit &amp; CAPA, RC Portal, Current Market Rate, Mould Health Inspection, Non CTC Expense, Dispatch Tracker) manage their own role internally; the chip shown for them here is only the generic hub-level grant.
        </p>
      </div>

      {overviewError ? (
        <p style={errorTextStyle}>{overviewError}</p>
      ) : overviewLoading ? (
        <Spinner />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          {kpiTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <div key={tile.label} style={{ ...baseCardStyle, flexGrow: 1, flexBasis: 170, padding: 14 }}>
                <div style={cardIconBoxStyle}><Icon size={15} color={colors.rust} /></div>
                <p style={{ fontSize: 20, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 6, marginBottom: 0 }}>{tile.value}</p>
                <p style={{ fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, margin: 0 }}>{tile.label}</p>
                <p style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, margin: 0 }}>{tile.sub}</p>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ ...baseCardStyle, padding: 20, marginBottom: 16 }}>
        <div style={cardHeaderRowStyle}>
          <div style={cardIconBoxStyle}><BarChart3 size={15} color={colors.rust} /></div>
          <div style={{ flex: 1 }}>
            <p style={cardTitleStyle}>User Roster</p>
            <p style={cardSubtitleStyle}>Access level, app grants, and usage for every authorized user</p>
          </div>
        </div>

        <div style={{ ...inputWrapStyle, marginBottom: 10 }}>
          <Search size={14} color={colors.inkSoft} />
          <input value={rosterSearch} onChange={(e) => setRosterSearch(e.target.value)} placeholder="Search by email…" style={inputStyle} aria-label="Search users by email" />
          {!!rosterSearch && (
            <button type="button" onClick={() => setRosterSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear search"><X size={14} color={colors.inkSoft} /></button>
          )}
        </div>

        {!!rosterError && <p style={errorTextStyle}>{rosterError}</p>}

        {rosterLoading ? (
          <Spinner />
        ) : (
          <div style={{ marginTop: 18, border: `1px solid ${colors.border}`, borderRadius: radii.lg, overflow: 'hidden' }}>
            {visibleRoster.length === 0 && (
              <p style={emptyTextStyle}>{rosterSearch.trim() ? `No users match "${rosterSearch.trim()}".` : 'No authorized users yet.'}</p>
            )}
            {visibleRoster.map((user, i) => (
              <button
                key={user.email}
                type="button"
                onClick={() => openUser(user)}
                style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, padding: 14, background: user.isActive ? colors.white : colors.appBg, opacity: user.isActive ? 1 : 0.7, border: 'none', borderBottom: i < visibleRoster.length - 1 ? `1px solid ${colors.border}` : 'none', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, margin: 0 }}>{user.email}</p>
                    <p style={{ fontSize: 11, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft, marginTop: 2, marginBottom: 0 }}>
                      {user.usage.lastLogin ? `Last login ${formatDateShort(user.usage.lastLogin)}` : 'Never signed in'} · {user.isActive ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  {user.accessLevel === 'Super Admin' ? (
                    <span style={superAdminBadgeStyle}><ShieldCheck size={12} color={colors.rust} />Super Admin</span>
                  ) : (
                    <span style={{ ...accessLevelBadgeStyle, ...(user.accessLevel === 'Admin' ? accessLevelBadgeAdminStyle : null) }}>{user.accessLevel}</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  <span style={usageStatStyle}>{user.usage.logins} logins</span>
                  <span style={usageStatStyle}>·</span>
                  <span style={usageStatStyle}>{user.usage.sessionsTotal} sessions</span>
                  <span style={usageStatStyle}>·</span>
                  <span style={usageStatStyle}>{user.usage.appsOpened} apps opened</span>
                  <span style={usageStatStyle}>·</span>
                  <span style={usageStatStyle}>{user.usage.timeSpent} spent</span>
                  {user.usage.mostUsedApp && (<><span style={usageStatStyle}>·</span><span style={usageStatStyle}>most used: {appLabel(user.usage.mostUsedApp)}</span></>)}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {user.apps.length === 0 ? (
                    <span style={{ fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>No app grants</span>
                  ) : (
                    user.apps.map((grant) => {
                      const accent = appColor(grant.appId);
                      const app = appById(grant.appId);
                      const Icon = app?.icon;
                      return (
                        <span key={grant.appId} style={{ ...appChipStyle, borderColor: accent, backgroundColor: `${accent}14` }}>
                          {Icon && <Icon size={12} color={accent} />}
                          <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: accent }}>{appLabel(grant.appId)} · {grant.role}</span>
                        </span>
                      );
                    })
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...baseCardStyle, padding: 20, marginBottom: 16 }}>
        <div style={cardHeaderRowStyle}>
          <div style={cardIconBoxStyle}><TrendingUp size={15} color={colors.rust} /></div>
          <div style={{ flex: 1 }}>
            <p style={cardTitleStyle}>App-wise Usage</p>
            <p style={cardSubtitleStyle}>Total opens and unique users per app, org-wide</p>
          </div>
          <button type="button" onClick={handleAppStatsDownload} disabled={orgAppStats.length === 0 || appDownloading} style={{ ...downloadBtnStyle, ...(orgAppStats.length === 0 ? { opacity: 0.5 } : null) }}>
            <Download size={13} color={colors.white} />
            <span style={downloadBtnTextStyle}>{appDownloading ? 'Preparing…' : 'Download'}</span>
          </button>
        </div>

        {!!appDownloadError && <p style={errorTextStyle}>{appDownloadError}</p>}
        {!!orgAppStatsError && <p style={errorTextStyle}>{orgAppStatsError}</p>}

        {orgAppStatsLoading ? (
          <Spinner />
        ) : (
          <div style={{ marginTop: 18, border: `1px solid ${colors.border}`, borderRadius: radii.lg, overflow: 'hidden' }}>
            {orgAppStats.length === 0 && <p style={emptyTextStyle}>No app activity recorded yet.</p>}
            {orgAppStats.map((stat, i) => {
              const accent = appColor(stat.appId);
              const app = appById(stat.appId);
              const Icon = app?.icon;
              return (
                <button
                  key={stat.appId}
                  type="button"
                  onClick={() => openAppUsers(stat.appId)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, padding: 14, background: colors.white, border: 'none', borderBottom: i < orgAppStats.length - 1 ? `1px solid ${colors.border}` : 'none', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {Icon && <Icon size={15} color={accent} />}
                      <span style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{appLabel(stat.appId)}</span>
                    </div>
                    <span style={usageStatStyle}>Last opened {formatDateShort(stat.lastOpened)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <span style={usageStatStyle}>{stat.opens} opens</span>
                    <span style={usageStatStyle}>·</span>
                    <span style={usageStatStyle}>{stat.uniqueUsers} unique users</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ ...baseCardStyle, padding: 20 }}>
        <div style={cardHeaderRowStyle}>
          <div style={cardIconBoxStyle}><History size={15} color={colors.rust} /></div>
          <div style={{ flex: 1 }}>
            <p style={cardTitleStyle}>Change History</p>
            <p style={cardSubtitleStyle}>Every access/role change, org-wide — who made it and what changed</p>
          </div>
        </div>
        {!!orgHistoryError && <p style={errorTextStyle}>{orgHistoryError}</p>}
        {orgHistoryLoading ? (
          <Spinner />
        ) : (
          <div style={{ marginTop: 12, maxHeight: 420, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '0 14px' }}>
            <ChangeHistoryList changes={orgHistory} />
          </div>
        )}
      </div>

      {appUsersFor && (
        <Dialog onClose={closeAppUsers}>
          <div style={dialogHeaderRowStyle}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => {
                const Icon = appById(appUsersFor)?.icon;
                return Icon ? <Icon size={17} color={appColor(appUsersFor)} /> : null;
              })()}
              <p style={{ ...dialogTitleStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appLabel(appUsersFor)}</p>
            </div>
            <button type="button" onClick={handleAppUsersDownload} disabled={appUsers.length === 0 || appUsersDownloading} style={{ ...downloadBtnStyle, padding: '6px 10px', ...(appUsers.length === 0 ? { opacity: 0.5 } : null) }}>
              <Download size={12} color={colors.white} />
              <span style={downloadBtnTextStyle}>{appUsersDownloading ? 'Preparing…' : 'Download'}</span>
            </button>
            <button type="button" onClick={closeAppUsers} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Close"><X size={18} color={colors.inkSoft} /></button>
          </div>

          {appUsersLoading ? (
            <Spinner />
          ) : appUsersError ? (
            <p style={errorTextStyle}>{appUsersError}</p>
          ) : appUsers.length === 0 ? (
            <p style={emptyTextStyle}>No one has opened this app yet.</p>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {appUsers.map((u, i) => (
                <div key={u.email} style={{ padding: 14, borderBottom: i < appUsers.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                    <span style={usageStatStyle}>Last opened {formatDateShort(u.lastOpened)}</span>
                  </div>
                  <span style={usageStatStyle}>{u.opens} opens</span>
                </div>
              ))}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <>
      <div className="admin-spinner" style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.border}`, borderTopColor: colors.rust, marginTop: 18 }} />
      <style jsx>{`
        .admin-spinner {
          animation: admin-spin 0.8s linear infinite;
        }
        @keyframes admin-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}

const backBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.border}`, borderRadius: radii.pill, padding: '7px 12px', backgroundColor: colors.white, cursor: 'pointer' };
const baseCardStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white };
const cardIconBoxStyle: React.CSSProperties = { width: 30, height: 30, borderRadius: radii.md, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const cardHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 };
const cardTitleStyle: React.CSSProperties = { fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 };
const cardSubtitleStyle: React.CSSProperties = { fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 1, marginBottom: 0 };
const inputWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, borderRadius: radii.lg, padding: '0 12px', height: 40, backgroundColor: colors.appBg };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 13, color: colors.ink, fontFamily: fonts.sansRegular, border: 'none', outline: 'none', background: 'transparent', height: '100%' };
const errorTextStyle: React.CSSProperties = { fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: '#C0392B', marginTop: 8 };
const emptyTextStyle: React.CSSProperties = { padding: 20, textAlign: 'center', fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, margin: 0 };
const downloadBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: radii.pill, padding: '8px 14px', backgroundColor: colors.rust, cursor: 'pointer', flexShrink: 0 };
const downloadBtnTextStyle: React.CSSProperties = { fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.white };
const noticeCardStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, border: `1px solid ${colors.rust}33`, backgroundColor: `${colors.rust}0d`, borderRadius: radii.lg, padding: 14, marginBottom: 16 };
const noticeTextStyle: React.CSSProperties = { flex: 1, fontSize: 12, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '17px', margin: 0 };
const superAdminBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: radii.pill, padding: '5px 10px', backgroundColor: `${colors.rust}14`, fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust, flexShrink: 0 };
const accessLevelBadgeStyle: React.CSSProperties = { display: 'inline-block', borderRadius: radii.pill, padding: '5px 10px', backgroundColor: colors.appBg, border: `1px solid ${colors.border}`, fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, flexShrink: 0 };
const accessLevelBadgeAdminStyle: React.CSSProperties = { backgroundColor: `${colors.rust}14`, borderColor: colors.rust, color: colors.rust };
const usageStatStyle: React.CSSProperties = { fontSize: 11, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft };
const appChipStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid', borderRadius: radii.pill, padding: '6px 10px', backgroundColor: colors.appBg };
const dialogHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 };
const dialogTitleStyle: React.CSSProperties = { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, flex: 1, margin: 0 };
