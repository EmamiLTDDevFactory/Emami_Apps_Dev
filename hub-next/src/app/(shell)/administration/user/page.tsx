'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, X, ShieldCheck } from 'lucide-react';
import Dialog from '../../../../components/Dialog';
import { appById } from '../../../../data/mockData';
import { getMyProfile, type UserProfile } from '../../../../lib/authApi';
import {
  getAdminRoster, getAdminUserAppStats,
  type AdminRosterEntry, type AdminUserAppStat,
} from '../../../../lib/adminApi';
import { getAccessHistory } from '../../../../lib/accessApi';
import type { AccessChangeEntry } from '../../../../types';
import { exportUserReportToExcel } from '../../../../lib/exportAdminExcel';
import { colors, fonts, fontWeights, radii, appColor } from '../../../../theme/tokens';

/** App ids that manage their own role internally (own DB or SAP OData), rather than being
 * authorized through this hub's Manage Access — the chip shown for these here is only ever the
 * generic hub-level grant, never the app's real internal role. */
const ROLE_MANAGED_INTERNALLY = new Set(['audit-capa', 'finance', 'market-rate', 'inventory', 'expense', 'hr']);

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
function appLabel(appId: string): string {
  return appById(appId)?.name || appId;
}

/** Turns one change-history row into a short, readable sentence — mirrors the Administration
 * page's own copy of this (kept self-contained per this codebase's per-page convention). */
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
  if (changes.length === 0) return <p style={emptyTextStyle}>No changes recorded yet.</p>;
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 130, flexGrow: 1, flexBasis: '30%' }}>
      <p style={{ fontSize: 10, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, marginTop: 2, marginBottom: 0 }}>{value}</p>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <div className="admin-user-spinner" style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.border}`, borderTopColor: colors.rust, marginTop: 18 }} />
      <style jsx>{`
        .admin-user-spinner {
          animation: admin-user-spin 0.8s linear infinite;
        }
        @keyframes admin-user-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}

function AdminUserDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [user, setUser] = useState<AdminRosterEntry | null>(null);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState('');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [history, setHistory] = useState<AccessChangeEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [appStats, setAppStats] = useState<Record<string, AdminUserAppStat>>({});
  const [appStatsLoading, setAppStatsLoading] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    if (!email) {
      setRosterLoading(false);
      setRosterError('No user specified.');
      return;
    }

    setRosterLoading(true);
    getAdminRoster().then((result) => {
      setRosterLoading(false);
      if (!result.ok || !result.users) {
        setRosterError(result.error || 'Could not load the user roster.');
        return;
      }
      const found = result.users.find((u) => u.email === email);
      if (!found) {
        setRosterError(`${email} is not in the authorized user roster.`);
        return;
      }
      setUser(found);

      if (found.usage.hasLoggedIn) {
        setProfileLoading(true);
        getMyProfile(email).then((p) => {
          setProfileLoading(false);
          if (p) setProfile(p);
          else setProfileError("Could not load this user's activity.");
        });
        setAppStatsLoading(true);
        getAdminUserAppStats(email).then((r) => {
          setAppStatsLoading(false);
          if (r.ok && r.apps) setAppStats(Object.fromEntries(r.apps.map((s) => [s.appId, s])));
        });
      }
    });

    setHistoryLoading(true);
    getAccessHistory(email).then((result) => {
      setHistoryLoading(false);
      if (result.ok && result.changes) setHistory(result.changes);
    });
  }, [email]);

  const handleDownload = async () => {
    if (!user) return;
    setReportDownloading(true);
    setReportError('');
    try {
      await exportUserReportToExcel(user, profile, Object.values(appStats), history);
    } catch {
      setReportError('Could not generate the report. Please try again.');
    } finally {
      setReportDownloading(false);
    }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
        <button type="button" onClick={() => router.push('/administration')} style={backBtnStyle}>
          <ArrowLeft size={13} color={colors.ink} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Back to Administration</span>
        </button>
        <p style={{ fontSize: 18, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email || 'User'}</p>
        {user && (
          <button type="button" onClick={handleDownload} disabled={reportDownloading} style={downloadBtnStyle}>
            <Download size={13} color={colors.white} />
            <span style={downloadBtnTextStyle}>{reportDownloading ? 'Preparing…' : 'Download Report'}</span>
          </button>
        )}
      </div>
      {!!reportError && <p style={errorTextStyle}>{reportError}</p>}

      {rosterLoading ? (
        <Spinner />
      ) : rosterError ? (
        <p style={errorTextStyle}>{rosterError}</p>
      ) : user ? (
        <>
          <div style={{ ...baseCardStyle, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {user.accessLevel === 'Super Admin' ? (
                <span style={superAdminBadgeStyle}><ShieldCheck size={12} color={colors.rust} />Super Admin</span>
              ) : (
                <span style={{ ...accessLevelBadgeStyle, ...(user.accessLevel === 'Admin' ? accessLevelBadgeAdminStyle : null) }}>{user.accessLevel}</span>
              )}
              <span style={{ fontSize: 12.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft }}>{user.isActive ? 'Active' : 'Inactive'}</span>
            </div>

            {!user.usage.hasLoggedIn ? (
              <p style={emptyTextStyle}>This user hasn&apos;t signed in to EmamiApps yet.</p>
            ) : profileLoading ? (
              <Spinner />
            ) : profileError ? (
              <p style={errorTextStyle}>{profileError}</p>
            ) : profile ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <DetailField label="Last Login" value={formatDateTime(profile.lastLogin)} />
                  <DetailField label="Total Logins" value={String(profile.logins)} />
                  <DetailField label="Sessions" value={String(profile.sessionsTotal)} />
                  <DetailField label="Time Spent" value={profile.timeSpent} />
                  <DetailField label="Last Session" value={profile.lastSessionDuration || '—'} />
                  <DetailField label="Apps Opened" value={String(profile.appsOpened)} />
                  <DetailField label="Downloads" value={String(profile.downloads)} />
                  <DetailField label="Favorites Added" value={String(profile.favoritesAdded)} />
                  <DetailField label="Notifications Read" value={String(profile.notificationsRead)} />
                  <DetailField label="Most Used App" value={profile.mostUsedApp !== '—' ? appLabel(profile.mostUsedApp) : '—'} />
                </div>

                {profile.topApps.length > 0 && (
                  <>
                    <p style={sectionLabelStyle}>Top Apps</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {profile.topApps.map((t) => {
                        const accent = appColor(t.appId);
                        const app = appById(t.appId);
                        const Icon = app?.icon;
                        return (
                          <span key={t.appId} style={{ ...appChipStyle, borderColor: accent, backgroundColor: `${accent}14` }}>
                            {Icon && <Icon size={12} color={accent} />}
                            <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: accent }}>{appLabel(t.appId)} · {t.opens} opens</span>
                          </span>
                        );
                      })}
                    </div>
                  </>
                )}

                <p style={sectionLabelStyle}>App Access · click an app for its usage stats</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {user.apps.length === 0 ? (
                    <span style={{ fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>No app grants</span>
                  ) : (
                    user.apps.map((grant) => {
                      const accent = appColor(grant.appId);
                      const app = appById(grant.appId);
                      const Icon = app?.icon;
                      const internal = ROLE_MANAGED_INTERNALLY.has(grant.appId);
                      return (
                        <button key={grant.appId} type="button" onClick={() => setSelectedAppId(grant.appId)} style={{ ...appChipStyle, borderColor: accent, backgroundColor: `${accent}14`, cursor: 'pointer', border: `1px solid ${accent}` }}>
                          {Icon && <Icon size={12} color={accent} />}
                          <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: accent }}>{appLabel(grant.appId)} · {grant.role}{internal ? ' (hub grant only)' : ''}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            ) : null}
          </div>

          <div style={{ ...baseCardStyle, padding: 20 }}>
            <p style={{ fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 0, marginBottom: 14 }}>Recent Changes</p>
            {historyLoading ? <Spinner /> : <ChangeHistoryList changes={history} />}
          </div>
        </>
      ) : null}

      {selectedAppId && user && (() => {
        const app = appById(selectedAppId);
        const Icon = app?.icon;
        const accent = appColor(selectedAppId);
        const grant = user.apps.find((a) => a.appId === selectedAppId);
        const stat = appStats[selectedAppId];
        const internal = ROLE_MANAGED_INTERNALLY.has(selectedAppId);
        return (
          <Dialog onClose={() => setSelectedAppId(null)}>
            <div style={dialogHeaderRowStyle}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {Icon && <Icon size={17} color={accent} />}
                <p style={{ ...dialogTitleStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appLabel(selectedAppId)}</p>
              </div>
              <button type="button" onClick={() => setSelectedAppId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Close"><X size={18} color={colors.inkSoft} /></button>
            </div>
            <p style={{ fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 0 }}>{email}</p>

            {grant && (
              <span style={{ ...appChipStyle, borderColor: accent, backgroundColor: `${accent}14`, alignSelf: 'flex-start', marginTop: 12, marginBottom: 16, display: 'inline-flex' }}>
                <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: accent }}>Role: {grant.role}{internal ? ' (hub grant only)' : ''}</span>
              </span>
            )}

            {appStatsLoading ? (
              <Spinner />
            ) : stat ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <DetailField label="Total Opens" value={String(stat.opens)} />
                <DetailField label="First Opened" value={formatDateTime(stat.firstOpened)} />
                <DetailField label="Last Opened" value={formatDateTime(stat.lastOpened)} />
              </div>
            ) : (
              <p style={emptyTextStyle}>{email} hasn&apos;t opened {appLabel(selectedAppId)} yet.</p>
            )}

            {internal && (
              <p style={{ fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '16px', marginTop: 16 }}>
                This app manages its own role internally — the grant above is only the generic hub-level access, not necessarily the user&apos;s real role inside the app.
              </p>
            )}
          </Dialog>
        );
      })()}
    </div>
  );
}

export default function AdminUserDetailPage() {
  return (
    <Suspense fallback={null}>
      <AdminUserDetailContent />
    </Suspense>
  );
}

const backBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.border}`, borderRadius: radii.pill, padding: '7px 12px', backgroundColor: colors.white, cursor: 'pointer' };
const baseCardStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white };
const errorTextStyle: React.CSSProperties = { fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: '#C0392B', marginTop: 8 };
const emptyTextStyle: React.CSSProperties = { padding: 20, textAlign: 'center', fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, margin: 0 };
const downloadBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: radii.pill, padding: '8px 14px', backgroundColor: colors.rust, cursor: 'pointer', flexShrink: 0 };
const downloadBtnTextStyle: React.CSSProperties = { fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.white };
const superAdminBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: radii.pill, padding: '5px 10px', backgroundColor: `${colors.rust}14`, fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust, flexShrink: 0 };
const accessLevelBadgeStyle: React.CSSProperties = { display: 'inline-block', borderRadius: radii.pill, padding: '5px 10px', backgroundColor: colors.appBg, border: `1px solid ${colors.border}`, fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, flexShrink: 0 };
const accessLevelBadgeAdminStyle: React.CSSProperties = { backgroundColor: `${colors.rust}14`, borderColor: colors.rust, color: colors.rust };
const appChipStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid', borderRadius: radii.pill, padding: '6px 10px', backgroundColor: colors.appBg };
const dialogHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 };
const dialogTitleStyle: React.CSSProperties = { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, flex: 1, margin: 0 };
const sectionLabelStyle: React.CSSProperties = { fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 10 };
