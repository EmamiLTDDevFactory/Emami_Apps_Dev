'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Trash2, Lock, Download, Activity, History as HistoryIcon, Save, Info, Phone, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { AccessChangeEntry, AccessLevel, AppRole, UserAccessEntry } from '../../types';
import { getMyProfile, type UserProfile } from '../../lib/authApi';
import type { MyActivity } from '../../lib/authApi';
import { getAdminUserActivity, getAdminUserAppStats, type AdminUserAppStat } from '../../lib/adminApi';
import { CCB_APP_ID, getAccessHistory, getCcbRoles, removeAuthorizedUser, setAccessLevel, setAppAccess, setCcbRoles, setUserActive } from '../../lib/accessApi';
import { exportUserReportToExcel } from '../../lib/exportAdminExcel';
import { appColor, colors, fontWeights, fonts, radii } from '../../theme/tokens';
import SidePanel, { PanelTabs } from './SidePanel';
import ChangeTimeline from './ChangeTimeline';
import { SessionList, SignInList } from './UserActivityLists';
import {
  AUDIT_CAPA_APP_ID, AUDIT_CAPA_DEPOTS, auditCapaRoleNeedsDepot, GRANTABLE_LEVELS, ROLE_MANAGED_INTERNALLY, SORTED_APPS,
  AppIcon, EmptyState, Initials, LevelBadge, Skeleton, Spinner, StatusDot, Switch,
  appLabel, canSetLevel, chipStyle, depotOf, displayName, errorTextStyle, formatDateTime, inputStyle, inputWrapStyle,
  labelStyle, primaryBtnStyle, roleOf, roleOptionsFor, secondaryBtnStyle, timeAgo,
  type AdminUser,
} from './adminShared';

type Tab = 'access' | 'activity' | 'history';
type AppFilter = 'all' | 'granted' | 'none';

interface Draft {
  isActive: boolean;
  accessLevel: AccessLevel;
  roles: Record<string, AppRole | null>;
  depots: Record<string, string | null>;
}

function draftFrom(user: UserAccessEntry): Draft {
  return {
    isActive: user.isActive,
    accessLevel: user.accessLevel,
    roles: Object.fromEntries(SORTED_APPS.map((a) => [a.id, roleOf(user, a.id)])),
    depots: Object.fromEntries(SORTED_APPS.map((a) => [a.id, depotOf(user, a.id)])),
  };
}

export default function UserDrawer({
  user,
  actingLevel,
  actingEmail,
  onClose,
  onSaved,
  onRemoved,
  notify,
}: {
  user: AdminUser;
  actingLevel: AccessLevel | undefined;
  actingEmail: string | null;
  onClose: () => void;
  onSaved: (updated: UserAccessEntry) => void;
  onRemoved: (email: string) => void;
  notify: (message: string, tone?: 'success' | 'error') => void;
}) {
  const usageRef = useRef<HTMLParagraphElement>(null);
  const [tab, setTab] = useState<Tab>('access');
  const [draft, setDraft] = useState<Draft>(() => draftFrom(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [appFilter, setAppFilter] = useState<AppFilter>('all');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [appStats, setAppStats] = useState<AdminUserAppStat[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  // Sign-ins / Sessions cards open their full list inline, below the cards (like Access Tracker).
  const [openList, setOpenList] = useState<'signins' | 'sessions' | null>(null);
  const [detail, setDetail] = useState<{ email: string; activity?: MyActivity; error?: string } | null>(null);
  useEffect(() => { setOpenList(null); }, [user.email]);
  useEffect(() => {
    if (!openList || detail?.email === user.email) return;
    let live = true;
    setDetail({ email: user.email });
    getAdminUserActivity(user.email).then((r) => { if (live) setDetail({ email: user.email, activity: r.activity, error: r.ok ? undefined : r.error }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openList, user.email]);
  const toggleList = (v: 'signins' | 'sessions') => setOpenList((o) => (o === v ? null : v));

  const [history, setHistory] = useState<AccessChangeEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // CCB roles (Change Control Board & CR Tracker): null available = this server has no Change Control, section hidden.
  const [ccb, setCcb] = useState<{ saved: string[]; draft: string[]; available: string[] | null }>({ saved: [], draft: [], available: null });
  useEffect(() => {
    let live = true;
    setCcb({ saved: [], draft: [], available: null });
    getCcbRoles(user.email).then((r) => { if (live && r.ok) setCcb({ saved: r.roles, draft: r.roles, available: r.available }); });
    return () => { live = false; };
  }, [user.email]);
  const toggleCcb = (role: string) => setCcb((c) => ({ ...c, draft: c.draft.includes(role) ? c.draft.filter((r) => r !== role) : [...c.draft, role] }));
  const ccbChanged = !!ccb.available && !!draft.roles[CCB_APP_ID] && [...ccb.draft].sort().join('|') !== [...ccb.saved].sort().join('|');

  // Re-seed the draft when a different person is opened, or after a save lands new data.
  useEffect(() => {
    setDraft(draftFrom(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email, user.apps, user.isActive, user.accessLevel]);

  useEffect(() => {
    if (tab === 'activity' && !activityLoaded) {
      setActivityLoaded(true);
      if (user.usage && !user.usage.hasLoggedIn) return;
      setActivityLoading(true);
      Promise.all([getMyProfile(user.email), getAdminUserAppStats(user.email)]).then(([p, s]) => {
        setActivityLoading(false);
        setProfile(p);
        if (s.ok && s.apps) setAppStats([...s.apps].sort((a, b) => b.opens - a.opens));
      });
    }
    if (tab === 'history' && !historyLoaded) {
      setHistoryLoaded(true);
      setHistoryLoading(true);
      getAccessHistory(user.email).then((r) => {
        setHistoryLoading(false);
        if (r.ok && r.changes) setHistory(r.changes);
      });
    }
  }, [tab, activityLoaded, historyLoaded, user.email, user.usage]);

  const isSuper = user.accessLevel === 'Super Admin';
  const changedAppIds = SORTED_APPS.filter(
    (a) => draft.roles[a.id] !== roleOf(user, a.id) || (draft.roles[a.id] && draft.depots[a.id] !== depotOf(user, a.id))
  ).map((a) => a.id);
  const changeCount = changedAppIds.length + (ccbChanged ? 1 : 0) + (draft.isActive !== user.isActive ? 1 : 0) + (draft.accessLevel !== user.accessLevel ? 1 : 0);
  const dirty = changeCount > 0;
  const grantedCount = SORTED_APPS.filter((a) => draft.roles[a.id]).length;

  const visibleApps = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return SORTED_APPS.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false;
      if (appFilter === 'granted') return !!draft.roles[a.id];
      if (appFilter === 'none') return !draft.roles[a.id];
      return true;
    });
  }, [appSearch, appFilter, draft.roles]);

  const setRole = (appId: string, role: AppRole | null) => {
    setDraft((d) => ({
      ...d,
      roles: { ...d.roles, [appId]: role },
      // Picking Depot/View on Audit & CAPA defaults the depot so the grant is never saved half-filled.
      depots: appId === AUDIT_CAPA_APP_ID && auditCapaRoleNeedsDepot(role) && !d.depots[appId] ? { ...d.depots, [appId]: AUDIT_CAPA_DEPOTS[0] } : d.depots,
    }));
  };

  const grantAllAsUser = () => {
    setDraft((d) => {
      const roles = { ...d.roles };
      for (const a of visibleApps) if (!roles[a.id] && a.id !== AUDIT_CAPA_APP_ID) roles[a.id] = roleOptionsFor(a.id)[0];
      return { ...d, roles };
    });
  };
  const revokeAllVisible = () => {
    setDraft((d) => {
      const roles = { ...d.roles };
      for (const a of visibleApps) roles[a.id] = null;
      return { ...d, roles };
    });
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setError('');
    try {
      const calls: Promise<{ ok: boolean; error?: string }>[] = [];
      if (draft.isActive !== user.isActive) calls.push(setUserActive(user.email, draft.isActive, actingEmail || undefined));
      if (draft.accessLevel !== user.accessLevel && actingEmail) calls.push(setAccessLevel(user.email, draft.accessLevel, actingEmail));
      for (const appId of changedAppIds) {
        const role = draft.roles[appId];
        calls.push(setAppAccess(user.email, appId, role, role ? draft.depots[appId] : null, actingEmail || undefined));
      }
      const results = await Promise.all(calls);
      // CCB roles after the grants: they need the Change Control Board & CR Tracker grant to exist first.
      if (ccbChanged) {
        const r = await setCcbRoles(user.email, ccb.draft);
        results.push(r);
        if (r.ok) setCcb((c) => ({ ...c, saved: c.draft }));
      }
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setError(failed.error || 'Some changes could not be saved. Please try again.');
        return;
      }
      const apps = SORTED_APPS.filter((a) => draft.roles[a.id]).map((a) => ({
        appId: a.id,
        role: draft.roles[a.id] as AppRole,
        depot: a.id === AUDIT_CAPA_APP_ID ? draft.depots[a.id] ?? undefined : undefined,
      }));
      // Keep any grant for an app id the hub catalog no longer lists, untouched.
      const unknown = user.apps.filter((g) => !SORTED_APPS.some((a) => a.id === g.appId));
      onSaved({ email: user.email, mobile: user.mobile, isActive: draft.isActive, accessLevel: draft.accessLevel, apps: [...unknown, ...apps] });
      setHistoryLoaded(false);
      notify(`Saved ${changeCount} change${changeCount === 1 ? '' : 's'} for ${displayName(user.email, user.usage?.name)}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    const result = await removeAuthorizedUser(user.email, actingEmail || undefined);
    setRemoving(false);
    if (!result.ok) {
      setError(result.error || 'Could not remove this user.');
      setConfirmRemove(false);
      return;
    }
    onRemoved(user.email);
    notify(`${user.email} removed — they can no longer sign in`);
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const downloadReport = async () => {
    setReportBusy(true);
    try {
      const rosterEntry = {
        email: user.email, isActive: user.isActive, accessLevel: user.accessLevel, apps: user.apps,
        usage: user.usage ?? { name: null, lastLogin: null, sessionsTotal: 0, logins: 0, timeSpent: '0m', appsOpened: 0, mostUsedApp: null, hasLoggedIn: false },
      };
      await exportUserReportToExcel(rosterEntry, profile, appStats, history);
    } catch {
      notify('Could not generate the report', 'error');
    } finally {
      setReportBusy(false);
    }
  };

  const name = displayName(user.email, user.usage?.name);
  // The full sign-in / session history for this person (My Profile's activity page in admin mode).

  const header = (
    <>
      <div style={{ padding: '20px 64px 16px 20px', display: 'flex', alignItems: 'center', gap: 14, background: `linear-gradient(135deg, ${colors.rust}0f, transparent 70%)` }}>
        <Initials email={user.email} name={user.usage?.name} size={52} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 17, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
          <p style={{ margin: '2px 0 8px', fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <LevelBadge level={user.accessLevel} compact />
            <StatusDot active={user.isActive} />
            {user.mobile && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>
                <Phone size={11} /> {user.mobile}
              </span>
            )}
            <span style={{ fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>
              {user.usage?.hasLoggedIn ? `Last seen ${timeAgo(user.usage.lastLogin)}` : 'Never signed in'}
            </span>
          </div>
        </div>
      </div>
      <PanelTabs<Tab>
        tabs={[
          { id: 'access', label: 'Access', count: grantedCount },
          { id: 'activity', label: 'Activity' },
          { id: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={setTab}
      />
    </>
  );

  const footer =
    tab !== 'access' ? null : confirmClose ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <AlertTriangle size={16} color={colors.uat} />
        <span style={{ flex: 1, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, minWidth: 160 }}>Discard {changeCount} unsaved change{changeCount === 1 ? '' : 's'}?</span>
        <button type="button" className="ac-btn" onClick={() => setConfirmClose(false)} style={secondaryBtnStyle}>Keep editing</button>
        <button type="button" className="ac-btn" onClick={onClose} style={{ ...primaryBtnStyle, background: '#E11D48', boxShadow: 'none' }}>Discard</button>
      </div>
    ) : dirty ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 8 }} />
          {changeCount} unsaved change{changeCount === 1 ? '' : 's'}
        </span>
        <button type="button" className="ac-btn" onClick={() => setDraft(draftFrom(user))} disabled={saving} style={secondaryBtnStyle}>Discard</button>
        <button type="button" className="ac-btn" onClick={save} disabled={saving} style={primaryBtnStyle}>
          {saving ? <Spinner light size={14} /> : <Save size={14} />} Save changes
        </button>
      </div>
    ) : (
      <span style={{ fontSize: 12, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft }}>All changes saved. Edits here apply only after you press Save.</span>
    );

  return (
    <SidePanel onClose={requestClose} header={header} footer={footer} width={600}>
      {tab === 'access' && (
        <div className="ac-fade" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!!error && <p style={{ ...errorTextStyle, margin: 0 }}>{error}</p>}

          {/* Sign-in + level */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
            <div style={settingBoxStyle}>
              <div style={{ flex: 1 }}>
                <p style={settingTitleStyle}>Can sign in</p>
                <p style={settingHintStyle}>{draft.isActive ? 'Allowed to sign in to Emami Apps' : 'Blocked at login — grants are kept'}</p>
              </div>
              <Switch on={draft.isActive} onChange={() => setDraft((d) => ({ ...d, isActive: !d.isActive }))} label="Allow sign-in" />
            </div>
            <div style={{ ...settingBoxStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <p style={settingTitleStyle}>Access level</p>
              {isSuper ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <LevelBadge level="Super Admin" compact />
                  <span style={settingHintStyle}>Fixed — cannot be changed</span>
                </span>
              ) : (
                <Segmented
                  options={GRANTABLE_LEVELS.map((l) => ({ value: l, label: l, disabled: !canSetLevel(actingLevel, user, l) }))}
                  value={draft.accessLevel}
                  onChange={(l) => setDraft((d) => ({ ...d, accessLevel: l }))}
                />
              )}
            </div>
          </div>

          {/* App access */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <span style={labelStyle}>App access · {grantedCount} of {SORTED_APPS.length}</span>
              <span style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={grantAllAsUser} style={linkBtnStyle}>Grant all shown</button>
                <button type="button" onClick={revokeAllVisible} style={{ ...linkBtnStyle, color: '#E11D48' }}>Revoke all shown</button>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div className="ac-input" style={{ ...inputWrapStyle, flex: 1, minWidth: 180, height: 36 }}>
                <Search size={14} color={colors.inkSoft} />
                <input value={appSearch} onChange={(e) => setAppSearch(e.target.value)} placeholder="Find an app…" style={inputStyle} aria-label="Filter apps" />
                {!!appSearch && (
                  <button type="button" onClick={() => setAppSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear"><X size={13} color={colors.inkSoft} /></button>
                )}
              </div>
              {(['all', 'granted', 'none'] as AppFilter[]).map((f) => (
                <button key={f} type="button" onClick={() => setAppFilter(f)} style={{ ...chipStyle(appFilter === f), padding: '0 12px', height: 36 }}>
                  {f === 'all' ? 'All' : f === 'granted' ? 'Granted' : 'No access'}
                </button>
              ))}
            </div>

            <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, overflow: 'hidden' }}>
              {visibleApps.length === 0 && <EmptyState icon={Search} title="No apps match" hint="Try a different name or filter." />}
              {visibleApps.map((app, i) => {
                const role = draft.roles[app.id];
                const changed = changedAppIds.includes(app.id);
                const accent = appColor(app.id);
                return (
                  <div key={app.id} style={{ padding: '10px 12px', borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`, backgroundColor: changed ? '#FFFBEB' : role ? colors.white : colors.cream }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <AppIcon appId={app.id} size={30} />
                      <div style={{ flex: 1, minWidth: 130 }}>
                        <p style={{ margin: 0, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: role ? colors.ink : colors.inkSoft, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {app.name}
                          {changed && <span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' }} title="Edited" />}
                        </p>
                        {ROLE_MANAGED_INTERNALLY.has(app.id) && <p style={{ margin: 0, fontSize: 10.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>Role inside the app is managed by the app</p>}
                      </div>
                      <Segmented
                        size="sm"
                        accent={accent}
                        options={[{ value: null, label: 'None' }, ...roleOptionsFor(app.id).map((r) => ({ value: r, label: r }))]}
                        value={role}
                        onChange={(r) => setRole(app.id, r)}
                      />
                    </div>
                    {app.id === CCB_APP_ID && ccb.available && (role || ccb.saved.length > 0) && (
                      <div style={{ marginTop: 10, paddingLeft: 40 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ ...labelStyle, fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            CCB roles
                            {ccbChanged && <span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' }} title="Edited" />}
                          </span>
                          {ccb.available.map((r) => (
                            <button key={r} type="button" disabled={!role} onClick={() => toggleCcb(r)} aria-pressed={ccb.draft.includes(r)}
                              style={{ ...chipStyle(ccb.draft.includes(r), accent), padding: '4px 10px', fontSize: 11.5, opacity: role ? 1 : 0.5, cursor: role ? 'pointer' : 'not-allowed' }}>
                              {r}
                            </button>
                          ))}
                        </div>
                        <p style={{ margin: '6px 0 0', fontSize: 10.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>
                          {role
                            ? 'Change Control Board roles. A person can hold more than one; nobody approves a request they logged.'
                            : `Still holds ${ccb.saved.join(', ')}. These apply again if access is re-granted; grant access to change them.`}
                        </p>
                      </div>
                    )}
                    {app.id === AUDIT_CAPA_APP_ID && auditCapaRoleNeedsDepot(role) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingLeft: 40, flexWrap: 'wrap' }}>
                        <span style={{ ...labelStyle, fontSize: 10 }}>Depot</span>
                        {AUDIT_CAPA_DEPOTS.map((d) => (
                          <button key={d} type="button" onClick={() => setDraft((x) => ({ ...x, depots: { ...x.depots, [app.id]: d } }))} style={{ ...chipStyle(draft.depots[app.id] === d, accent), padding: '4px 10px', fontSize: 11.5 }}>
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Danger zone */}
          {!isSuper && (
            <div style={{ border: '1px solid #FECDD3', borderRadius: radii.xl, padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', backgroundColor: '#FFF7F8' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ ...settingTitleStyle, color: '#BE123C' }}>Remove from Emami Apps</p>
                <p style={settingHintStyle}>Deletes this person and all their app grants. They will be blocked at sign-in.</p>
              </div>
              {confirmRemove ? (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="ac-btn" onClick={() => setConfirmRemove(false)} disabled={removing} style={{ ...secondaryBtnStyle, height: 36 }}>Cancel</button>
                  <button type="button" className="ac-btn" onClick={remove} disabled={removing} style={{ ...primaryBtnStyle, height: 36, background: '#E11D48', boxShadow: 'none' }}>
                    {removing ? <Spinner light size={13} /> : <Trash2 size={14} />} Yes, remove
                  </button>
                </span>
              ) : (
                <button type="button" className="ac-btn" onClick={() => setConfirmRemove(true)} style={{ ...secondaryBtnStyle, height: 36, color: '#E11D48', borderColor: '#FECDD3' }}>
                  <Trash2 size={14} /> Remove user
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="ac-fade" style={{ padding: 20 }}>
          {user.usage && !user.usage.hasLoggedIn ? (
            <EmptyState icon={Activity} title="No activity yet" hint={`${name} hasn't signed in to Emami Apps yet. Usage will show here after their first sign-in.`} />
          ) : activityLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={64} radius={12} />)}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button type="button" className="ac-btn" onClick={downloadReport} disabled={reportBusy} style={{ ...secondaryBtnStyle, height: 34 }}>
                  {reportBusy ? <Spinner size={13} /> : <Download size={14} />} Download report
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                <Stat label="Last sign-in" value={profile?.lastLogin ? timeAgo(profile.lastLogin) : timeAgo(user.usage?.lastLogin)} hint={formatDateTime(profile?.lastLogin ?? user.usage?.lastLogin)} onClick={() => toggleList('signins')} open={openList === 'signins'} />
                <Stat label="Sign-ins" value={String(profile?.logins ?? user.usage?.logins ?? 0)} hint="See every sign-in" onClick={() => toggleList('signins')} open={openList === 'signins'} />
                <Stat label="Sessions" value={String(profile?.sessionsTotal ?? user.usage?.sessionsTotal ?? 0)} hint="See each visit and its apps" onClick={() => toggleList('sessions')} open={openList === 'sessions'} />
                <Stat label="Time spent" value={profile?.timeSpent ?? user.usage?.timeSpent ?? '—'} hint="See how long each session lasted" onClick={() => toggleList('sessions')} open={openList === 'sessions'} />
                <Stat label="Apps opened" value={String(profile?.appsOpened ?? user.usage?.appsOpened ?? 0)} hint="Jump to usage by app" onClick={() => usageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
                <Stat label="Downloads" value={String(profile?.downloads ?? 0)} />
              </div>
              {openList && (detail?.email !== user.email || (!detail.activity && !detail.error) ? (
                <div style={{ marginTop: 12 }}><Skeleton height={160} radius={14} /></div>
              ) : detail.error || !detail.activity ? (
                <p style={errorTextStyle}>{detail.error || 'Could not load this person’s activity.'}</p>
              ) : openList === 'signins' ? (
                <SignInList activity={detail.activity} email={user.email} />
              ) : (
                <SessionList activity={detail.activity} email={user.email} />
              ))}

              <p ref={usageRef} style={{ ...labelStyle, margin: '22px 0 10px', scrollMarginTop: 12 }}>Usage by app</p>
              {appStats.length === 0 ? (
                <EmptyState icon={Activity} title="No apps opened yet" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {appStats.map((s) => {
                    const max = appStats[0].opens || 1;
                    const accent = appColor(s.appId);
                    return (
                      <div key={s.appId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AppIcon appId={s.appId} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                            <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appLabel(s.appId)}</span>
                            <span style={{ fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, whiteSpace: 'nowrap' }}>{s.opens} opens · {timeAgo(s.lastOpened)}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, backgroundColor: colors.appBg, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(4, (s.opens / max) * 100)}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${accent}99, ${accent})` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {user.apps.some((g) => ROLE_MANAGED_INTERNALLY.has(g.appId)) && (
                <p style={{ display: 'flex', gap: 8, fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansRegular, marginTop: 18, lineHeight: '16px' }}>
                  <Info size={14} style={{ flexShrink: 0 }} /> Some apps manage their own roles — the hub grant is only generic access to them.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="ac-fade" style={{ padding: 20 }}>
          {historyLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={40} radius={10} />)}
            </div>
          ) : history.length === 0 ? (
            <EmptyState icon={HistoryIcon} title="No changes recorded" hint="Every grant, revoke and status change for this person will show up here." />
          ) : (
            <ChangeTimeline changes={history} hideTarget />
          )}
        </div>
      )}
    </SidePanel>
  );
}

/** Pill-group selector — the role picker for each app row and the access-level picker. */
export function Segmented<T extends string | null>({
  options,
  value,
  onChange,
  size = 'md',
  accent = colors.rust,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  accent?: string;
}) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, borderRadius: radii.lg, backgroundColor: colors.appBg, gap: 2, flexShrink: 0 }}>
      {options.map((o) => {
        const active = o.value === value;
        const isNone = o.value === null;
        return (
          <button
            key={o.label}
            type="button"
            disabled={o.disabled && !active}
            onClick={() => onChange(o.value)}
            title={o.disabled && !active ? 'You can’t grant this level' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              border: 'none', borderRadius: radii.md, cursor: o.disabled && !active ? 'not-allowed' : 'pointer',
              padding: size === 'sm' ? '5px 10px' : '7px 14px',
              fontSize: size === 'sm' ? 11.5 : 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold,
              backgroundColor: active ? (isNone ? colors.white : accent) : 'transparent',
              color: active ? (isNone ? colors.ink : colors.white) : o.disabled ? colors.inkSoft : colors.inkSoft,
              boxShadow: active ? '0 1px 3px rgba(21,17,41,0.14)' : 'none',
              transition: 'background-color 140ms, color 140ms',
              flex: size === 'md' ? 1 : undefined, justifyContent: 'center',
            }}
          >
            {o.disabled && !active && <Lock size={10} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value, hint, onClick, open }: { label: string; value: string; hint?: string; onClick?: () => void; open?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={hint}
      aria-expanded={onClick && open !== undefined ? open : undefined}
      className={onClick ? 'ac-card' : undefined}
      style={{ position: 'relative', textAlign: 'left', width: '100%', cursor: onClick ? 'pointer' : 'default', border: open ? `1.5px solid ${colors.rust}` : `1px solid ${colors.border}`, boxShadow: open ? `0 0 0 3px ${colors.rust}1F` : undefined, borderRadius: radii.xl, padding: '12px 14px', backgroundColor: colors.white, font: 'inherit' }}
    >
      {onClick && (open
        ? <ChevronUp size={14} color={colors.rust} style={{ position: 'absolute', top: 10, right: 10 }} aria-hidden />
        : <ChevronDown size={14} color={colors.inkSoft} style={{ position: 'absolute', top: 10, right: 10 }} aria-hidden />)}
      <span style={{ ...labelStyle, display: 'block', margin: 0, fontSize: 10 }}>{label}</span>
      <span style={{ display: 'block', margin: '4px 0 0', fontSize: 17, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{value}</span>
    </Tag>
  );
}

const settingBoxStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${colors.border}`, borderRadius: radii.xl, padding: 14, backgroundColor: colors.white };
const settingTitleStyle: React.CSSProperties = { margin: 0, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink };
const settingHintStyle: React.CSSProperties = { margin: '2px 0 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft };
const linkBtnStyle: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust };
