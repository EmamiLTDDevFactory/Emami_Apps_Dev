'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Mail, Plus, ShieldCheck, ShieldAlert, Trash2, Info, Check, Save, KeyRound,
  ChevronRight, Lock, Search, X, Pencil, Square, CheckSquare, FileSpreadsheet, Phone,
} from 'lucide-react';
import { APPS } from '../../../data/mockData';
import Dialog from '../../../components/Dialog';
import { useAuth } from '../../../context/AuthContext';
import type { AccessLevel, AppRole, UserAccessEntry, UserAppGrant } from '../../../types';
import { colors, fonts, fontWeights, radii, appColor } from '../../../theme/tokens';
import { exportUsersToExcel } from '../../../lib/exportUsersExcel';
import {
  listAuthorizedUsers, addAuthorizedUser, removeAuthorizedUser, setAppAccess, setUserActive, setAccessLevel,
} from '../../../lib/accessApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Folds the backend's auto-granted defaults (e.g. Mediclaim/Term Policy — see server.js's
 * DEFAULT_GRANTED_APPS) together with whatever the admin explicitly picked in the Add User
 * dialog, so a just-added row shows its true granted apps right away instead of only after a
 * refresh. An explicit pick always wins over a default for the same app. */
function mergeAppGrants(defaults: UserAppGrant[] | undefined, explicit: UserAppGrant[]): UserAppGrant[] {
  const explicitAppIds = new Set(explicit.map((g) => g.appId));
  return [...(defaults || []).filter((g) => !explicitAppIds.has(g.appId)), ...explicit];
}
const AUDIT_CAPA_APP_ID = 'audit-capa';
const AUDIT_CAPA_DEPOTS = ['Delhi Depot', 'Kolkata Depot', 'Mumbai Depot'];
const PAYMENT_TRACKING_APP_ID = 'payment-tracking';
const FM_PO_DEVIATION_APP_ID = 'fm-po-deviation';
/** Apps shown here alphabetically by name — insertion order in mockData.ts reflects when each
 * app was added to the hub, not a meaningful display order. */
const SORTED_APPS = [...APPS].sort((a, b) => a.name.localeCompare(b.name));

function roleOptionsFor(appId: string | null | undefined): (AppRole | null)[] {
  if (appId === AUDIT_CAPA_APP_ID) return [null, 'Depot', 'CQA'];
  if (appId === PAYMENT_TRACKING_APP_ID) return [null, 'User', 'Admin', 'Finance'];
  // PO Deviation Approval has no Admin/User bifurcation — access is a single granted role.
  if (appId === FM_PO_DEVIATION_APP_ID) return [null, 'User'];
  return [null, 'User', 'Admin'];
}

function isElevatedRole(appId: string, role: AppRole | null): boolean {
  return appId === AUDIT_CAPA_APP_ID ? role === 'CQA' : role === 'Admin';
}
const GRANTABLE_LEVELS: AccessLevel[] = ['Admin', 'Viewer'];
const BULK_CONCURRENCY = 8;

type PendingChanges = {
  isActive?: boolean;
  accessLevel?: AccessLevel;
  roles: Record<string, AppRole | null>;
  depots?: Record<string, string | null>;
};

function roleOf(user: UserAccessEntry, appId: string): AppRole | null {
  return user.apps.find((a) => a.appId === appId)?.role ?? null;
}
function depotOf(user: UserAccessEntry, appId: string): string | null {
  return user.apps.find((a) => a.appId === appId)?.depot ?? null;
}
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
async function runBatched<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const batch of chunk(items, size)) {
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}
function parseBulkEmails(text: string): string[] {
  const raw = text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(raw));
}
function normalizeIndianMobileClient(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export default function ManageAccessPage() {
  const router = useRouter();
  const { userEmail, access } = useAuth();
  const actingLevel = access?.accessLevel;
  const canManageAccess = actingLevel === 'Super Admin' || actingLevel === 'Admin';

  const [users, setUsers] = useState<UserAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, PendingChanges>>({});
  const [exporting, setExporting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkTargetApp, setBulkTargetApp] = useState<string | null>(null);

  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [rolePickerFor, setRolePickerFor] = useState<{ context: 'add' | 'edit'; appId: string } | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserMobile, setNewUserMobile] = useState('');
  const [bulkEmailsText, setBulkEmailsText] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [newUserRoles, setNewUserRoles] = useState<Record<string, AppRole | null>>({});
  const [newUserDepots, setNewUserDepots] = useState<Record<string, string | null>>({});
  const [dialogError, setDialogError] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  useEffect(() => {
    listAuthorizedUsers().then((result) => {
      setLoading(false);
      if (result.ok && result.users) setUsers(result.users);
      else setError(result.error || 'Could not load authorized users.');
    });
  }, []);

  const openAddUserModal = () => {
    setAddMode('single');
    setNewUserEmail('');
    setNewUserMobile('');
    setBulkEmailsText('');
    setNewUserRoles({});
    setNewUserDepots({});
    setDialogError('');
    setShowAddModal(true);
  };
  const closeAddUserModal = () => {
    if (addingUser) return;
    setShowAddModal(false);
    setRolePickerFor(null);
  };
  const setNewUserRole = (appId: string, role: AppRole | null) => setNewUserRoles((prev) => ({ ...prev, [appId]: role }));
  const setNewUserDepot = (appId: string, depot: string | null) => setNewUserDepots((prev) => ({ ...prev, [appId]: depot }));

  const submitNewUser = async () => {
    const value = newUserEmail.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setDialogError('Enter a valid email address.');
      return;
    }
    if (users.some((u) => u.email === value)) {
      setDialogError('This email already has access.');
      return;
    }
    let mobile: string | undefined;
    if (newUserMobile.trim()) {
      const normalized = normalizeIndianMobileClient(newUserMobile.trim());
      if (!normalized) {
        setDialogError('Enter a valid 10-digit Indian mobile number, or leave it blank.');
        return;
      }
      mobile = normalized;
    }
    setDialogError('');
    setAddingUser(true);
    try {
      const result = await addAuthorizedUser(value, userEmail || undefined, mobile);
      if (!result.ok) {
        setDialogError(result.error || 'Could not add this user.');
        return;
      }
      const grantedRoles = Object.entries(newUserRoles).filter((entry): entry is [string, AppRole] => !!entry[1]);
      const roleResults = await Promise.all(
        grantedRoles.map(([appId, role]) => setAppAccess(value, appId, role, newUserDepots[appId] ?? null, userEmail || undefined))
      );
      const explicitApps = grantedRoles
        .filter((_, i) => roleResults[i].ok)
        .map(([appId, role]) => ({ appId, role, depot: newUserDepots[appId] ?? undefined }));
      const apps = mergeAppGrants(result.apps, explicitApps);
      setUsers((prev) => [...prev, { email: value, isActive: true, accessLevel: 'Viewer', mobile: mobile || null, apps }]);
      const failedRole = roleResults.find((r) => !r.ok);
      setShowAddModal(false);
      if (failedRole) {
        setError(failedRole.error || `${value} was added, but one or more app roles couldn't be saved — edit them below.`);
      }
    } finally {
      setAddingUser(false);
    }
  };

  const parsedBulkEmails = addMode === 'bulk' ? parseBulkEmails(bulkEmailsText) : [];
  const existingEmails = new Set(users.map((u) => u.email));
  const bulkValidEmails = parsedBulkEmails.filter((e) => EMAIL_RE.test(e) && !existingEmails.has(e));
  const bulkSkippedCount = parsedBulkEmails.length - bulkValidEmails.length;

  const submitBulkUsers = async () => {
    if (bulkValidEmails.length === 0) {
      setDialogError('Paste at least one valid, new email address.');
      return;
    }
    setDialogError('');
    setAddingUser(true);
    setBulkProgress({ done: 0, total: bulkValidEmails.length });
    const grantedRoles = Object.entries(newUserRoles).filter((entry): entry is [string, AppRole] => !!entry[1]);
    const added: UserAccessEntry[] = [];
    let failures = 0;
    try {
      for (const batch of chunk(bulkValidEmails, 5)) {
        const results = await Promise.all(
          batch.map(async (email) => {
            const res = await addAuthorizedUser(email, userEmail || undefined);
            if (!res.ok) return { email, ok: false as const };
            const roleResults = await Promise.all(
              grantedRoles.map(([appId, role]) => setAppAccess(email, appId, role, newUserDepots[appId] ?? null, userEmail || undefined))
            );
            const explicitApps = grantedRoles
              .filter((_, i) => roleResults[i].ok)
              .map(([appId, role]) => ({ appId, role, depot: newUserDepots[appId] ?? undefined }));
            return { email, ok: true as const, apps: mergeAppGrants(res.apps, explicitApps) };
          })
        );
        for (const r of results) {
          if (r.ok) added.push({ email: r.email, isActive: true, accessLevel: 'Viewer', apps: r.apps });
          else failures += 1;
        }
        setBulkProgress((prev) => (prev ? { done: prev.done + batch.length, total: prev.total } : null));
      }
      setUsers((prev) => [...prev, ...added]);
      setShowAddModal(false);
      if (failures > 0) {
        setError(`${added.length} of ${bulkValidEmails.length} users added. ${failures} failed — add those individually to retry.`);
      }
    } finally {
      setAddingUser(false);
      setBulkProgress(null);
    }
  };

  const removeUser = async (email: string) => {
    const result = await removeAuthorizedUser(email, userEmail || undefined);
    if (!result.ok) {
      setError(result.error || 'Could not remove this user.');
      return;
    }
    setUsers((prev) => prev.filter((u) => u.email !== email));
    setPending((prev) => {
      const { [email]: _drop, ...rest } = prev;
      return rest;
    });
    setSelected((prev) => {
      if (!prev.has(email)) return prev;
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
  };

  const visibleUsers = users.filter((u) => u.email.toLowerCase().includes(userSearch.trim().toLowerCase()));

  const effectiveActive = (user: UserAccessEntry) => pending[user.email]?.isActive ?? user.isActive;
  const effectiveRole = (user: UserAccessEntry, appId: string) => {
    const p = pending[user.email]?.roles[appId];
    return p !== undefined ? p : roleOf(user, appId);
  };
  const effectiveDepot = (user: UserAccessEntry, appId: string) => {
    const p = pending[user.email]?.depots?.[appId];
    return p !== undefined ? p : depotOf(user, appId);
  };
  const effectiveAccessLevel = (user: UserAccessEntry): AccessLevel => pending[user.email]?.accessLevel ?? user.accessLevel;
  const isDirty = (user: UserAccessEntry) => {
    const p = pending[user.email];
    if (!p) return false;
    if (p.isActive !== undefined && p.isActive !== user.isActive) return true;
    if (p.accessLevel !== undefined && p.accessLevel !== user.accessLevel) return true;
    if (Object.entries(p.roles).some(([appId, role]) => role !== roleOf(user, appId))) return true;
    if (p.depots && Object.entries(p.depots).some(([appId, depot]) => depot !== depotOf(user, appId))) return true;
    return false;
  };

  const canSetAccessLevel = (user: UserAccessEntry, level: AccessLevel) => {
    if (user.accessLevel === 'Super Admin') return false;
    if (actingLevel === 'Super Admin') return true;
    return actingLevel === 'Admin' && level === 'Viewer';
  };

  const setPendingRole = (user: UserAccessEntry, appId: string, role: AppRole | null) => {
    setPending((prev) => {
      const existing = prev[user.email] ?? { roles: {} };
      return { ...prev, [user.email]: { ...existing, roles: { ...existing.roles, [appId]: role } } };
    });
  };
  const setPendingDepot = (user: UserAccessEntry, appId: string, depot: string | null) => {
    setPending((prev) => {
      const existing = prev[user.email] ?? { roles: {} };
      return { ...prev, [user.email]: { ...existing, depots: { ...(existing.depots ?? {}), [appId]: depot } } };
    });
  };
  const setAccessLevelPending = (user: UserAccessEntry, level: AccessLevel) => {
    if (!canSetAccessLevel(user, level)) return;
    setPending((prev) => {
      const existing = prev[user.email] ?? { roles: {} };
      return { ...prev, [user.email]: { ...existing, accessLevel: level } };
    });
  };
  const toggleActivePending = (user: UserAccessEntry) => {
    const next = !effectiveActive(user);
    setPending((prev) => {
      const existing = prev[user.email] ?? { roles: {} };
      return { ...prev, [user.email]: { ...existing, isActive: next } };
    });
  };

  const saveUser = async (user: UserAccessEntry) => {
    const changes = pending[user.email];
    if (!changes) return;
    setError('');
    setSaving(user.email);
    try {
      const calls: Promise<{ ok: boolean; error?: string }>[] = [];
      if (changes.isActive !== undefined && changes.isActive !== user.isActive) {
        calls.push(setUserActive(user.email, changes.isActive, userEmail || undefined));
      }
      if (changes.accessLevel !== undefined && changes.accessLevel !== user.accessLevel && userEmail) {
        calls.push(setAccessLevel(user.email, changes.accessLevel, userEmail));
      }
      const touchedAppIds = new Set([...Object.keys(changes.roles), ...Object.keys(changes.depots ?? {})]);
      for (const appId of touchedAppIds) {
        const role = changes.roles[appId] !== undefined ? changes.roles[appId] : roleOf(user, appId);
        const depot = changes.depots?.[appId] !== undefined ? changes.depots[appId] : depotOf(user, appId);
        const roleChanged = changes.roles[appId] !== undefined && changes.roles[appId] !== roleOf(user, appId);
        const depotChanged = changes.depots?.[appId] !== undefined && changes.depots[appId] !== depotOf(user, appId);
        if (roleChanged || depotChanged) {
          calls.push(role ? setAppAccess(user.email, appId, role, depot, userEmail || undefined) : setAppAccess(user.email, appId, null, null, userEmail || undefined));
        }
      }
      const results = await Promise.all(calls);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setError(failed.error || 'Could not save some changes. Please try again.');
        return;
      }
      setUsers((prev) =>
        prev.map((u) => {
          if (u.email !== user.email) return u;
          const nextApps = u.apps.filter((a) => !touchedAppIds.has(a.appId));
          for (const appId of touchedAppIds) {
            const role = changes.roles[appId] !== undefined ? changes.roles[appId] : roleOf(user, appId);
            const depot = changes.depots?.[appId] !== undefined ? changes.depots[appId] : depotOf(user, appId);
            if (role) nextApps.push({ appId, role, depot: depot ?? undefined });
          }
          return { ...u, isActive: changes.isActive ?? u.isActive, accessLevel: changes.accessLevel ?? u.accessLevel, apps: nextApps };
        })
      );
      setPending((prev) => {
        const { [user.email]: _drop, ...rest } = prev;
        return rest;
      });
      setEditingEmail((current) => (current === user.email ? null : current));
    } finally {
      setSaving(null);
    }
  };

  const toggleSelected = (email: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };
  const allVisibleSelected = visibleUsers.length > 0 && visibleUsers.every((u) => selected.has(u.email));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleUsers.forEach((u) => next.delete(u.email));
      else visibleUsers.forEach((u) => next.add(u.email));
      return next;
    });
  };
  const clearSelection = () => {
    setSelected(new Set());
    setBulkTargetApp(null);
    setBulkNote('');
  };

  const bulkSetAccessLevel = async (level: AccessLevel) => {
    const targets = users.filter((u) => selected.has(u.email));
    const eligible = targets.filter((u) => canSetAccessLevel(u, level));
    const skipped = targets.length - eligible.length;
    if (eligible.length === 0) {
      setBulkNote('None of the selected users are eligible for that change.');
      return;
    }
    if (!userEmail) return;
    setBulkBusy(true);
    setBulkNote('');
    try {
      const results = await runBatched(eligible, BULK_CONCURRENCY, (u) => setAccessLevel(u.email, level, userEmail));
      const okEmails = new Set(eligible.filter((_, i) => results[i].ok).map((u) => u.email));
      const failed = eligible.length - okEmails.size;
      setUsers((prev) => prev.map((u) => (okEmails.has(u.email) ? { ...u, accessLevel: level } : u)));
      setBulkNote(
        `Set ${okEmails.size} of ${eligible.length} selected user(s) to ${level}.` +
          (skipped ? ` ${skipped} skipped (not eligible).` : '') +
          (failed ? ` ${failed} failed.` : '')
      );
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkSetActive = async (isActive: boolean) => {
    const targets = users.filter((u) => selected.has(u.email));
    if (targets.length === 0) return;
    setBulkBusy(true);
    setBulkNote('');
    try {
      const results = await runBatched(targets, BULK_CONCURRENCY, (u) => setUserActive(u.email, isActive, userEmail || undefined));
      const okEmails = new Set(targets.filter((_, i) => results[i].ok).map((u) => u.email));
      const failed = targets.length - okEmails.size;
      setUsers((prev) => prev.map((u) => (okEmails.has(u.email) ? { ...u, isActive } : u)));
      setBulkNote(`${isActive ? 'Activated' : 'Deactivated'} ${okEmails.size} of ${targets.length} selected user(s).` + (failed ? ` ${failed} failed.` : ''));
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkSetAppRole = async (role: AppRole | null) => {
    if (!bulkTargetApp) {
      setBulkNote('Pick an app to target first.');
      return;
    }
    const targetAppId = bulkTargetApp;
    const targets = users.filter((u) => selected.has(u.email));
    if (targets.length === 0) return;
    setBulkBusy(true);
    setBulkNote('');
    try {
      const results = await runBatched(targets, BULK_CONCURRENCY, (u) => setAppAccess(u.email, targetAppId, role, null, userEmail || undefined));
      const okEmails = new Set(targets.filter((_, i) => results[i].ok).map((u) => u.email));
      const failed = targets.length - okEmails.size;
      setUsers((prev) =>
        prev.map((u) => {
          if (!okEmails.has(u.email)) return u;
          const apps = u.apps.filter((a) => a.appId !== targetAppId);
          if (role) apps.push({ appId: targetAppId, role });
          return { ...u, apps };
        })
      );
      const appLabel = APPS.find((a) => a.id === targetAppId)?.name ?? targetAppId;
      setBulkNote(`Set ${appLabel} to ${role ?? 'None'} for ${okEmails.size} of ${targets.length} selected user(s).` + (failed ? ` ${failed} failed.` : ''));
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      await exportUsersToExcel(visibleUsers, SORTED_APPS);
    } catch {
      setError('Could not export the roster. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (access && !canManageAccess) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 }}>
        <ShieldAlert size={32} color={colors.inkSoft} />
        <p style={{ fontSize: 16, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 6 }}>You don&apos;t have access to this page</p>
        <p style={{ fontSize: 13, fontFamily: fonts.sansRegular, color: colors.inkSoft, textAlign: 'center', marginBottom: 14 }}>Manage Access is only available to Super Admin and Admin users.</p>
        <button type="button" onClick={() => router.push('/')} style={backBtnStyle}>
          <ArrowLeft size={13} color={colors.ink} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Back to Emami Apps</span>
        </button>
      </div>
    );
  }

  const editTarget = editingEmail ? users.find((u) => u.email === editingEmail) ?? null : null;
  const closeEdit = () => {
    if (editTarget && saving === editTarget.email) return;
    setEditingEmail(null);
    setRolePickerFor(null);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <button type="button" onClick={() => router.push('/')} style={backBtnStyle}>
          <ArrowLeft size={13} color={colors.ink} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Back to Emami Apps</span>
        </button>
        <p style={{ fontSize: 18, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>Manage Access</p>
      </div>

      <button
        type="button"
        onClick={() => router.push('/manage-access/sso')}
        style={{ ...baseCardStyle, display: 'flex', alignItems: 'center', gap: 10, padding: 14, marginBottom: 16, width: '100%', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={cardIconBoxStyle}><KeyRound size={15} color={colors.rust} /></div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>Configure SSO</p>
          <p style={{ fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 1, marginBottom: 0 }}>Set up &quot;Sign in with Microsoft&quot; by uploading Entra&apos;s Federation Metadata XML</p>
        </div>
        <ChevronRight size={16} color={colors.inkSoft} />
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, border: `1px solid ${colors.rust}33`, backgroundColor: `${colors.rust}0d`, borderRadius: radii.lg, padding: 14, marginBottom: 16 }}>
        <Info size={15} color={colors.rust} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ flex: 1, fontSize: 12, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '17px', margin: 0 }}>
          This list is the source of truth for who can sign in to EmamiApps at all — an email not listed here (or marked inactive) is blocked at login, regardless of sign-in method.
          Tap the pencil to edit a user&apos;s access level and app roles, tick rows to change many at once, or use Export/Add Users above the table.
        </p>
      </div>

      <div style={{ ...baseCardStyle, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={cardIconBoxStyle}><ShieldCheck size={15} color={colors.rust} /></div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>Authorized Users</p>
            <p style={{ fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 1, marginBottom: 0 }}>Grant each person a role per app, and control who can sign in</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ ...inputWrapStyle, flex: 1, minWidth: 200 }}>
            <Search size={14} color={colors.inkSoft} />
            <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by email…" style={inputStyle} aria-label="Search authorized users by email" />
            {!!userSearch && (
              <button type="button" onClick={() => setUserSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear search">
                <X size={14} color={colors.inkSoft} />
              </button>
            )}
          </div>
          <button type="button" onClick={handleExport} disabled={exporting || visibleUsers.length === 0} style={exportBtnStyle}>
            {exporting ? <Spinner /> : (<><FileSpreadsheet size={14} color={colors.ink} /><span style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Export</span></>)}
          </button>
          <button type="button" onClick={openAddUserModal} style={addBtnStyle}>
            <Plus size={14} color={colors.white} />
            <span style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.white }}>Add Users</span>
          </button>
        </div>
        {!!error && <p style={errorTextStyle}>{error}</p>}

        {selected.size > 0 && (
          <div style={{ border: `1px solid ${colors.rust}33`, backgroundColor: `${colors.rust}0d`, borderRadius: radii.lg, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{selected.size} selected</span>
              <button type="button" onClick={clearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear selection"><X size={14} color={colors.inkSoft} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={bulkLabelStyle}>Access level</span>
              {GRANTABLE_LEVELS.map((level) => (
                <button key={level} type="button" onClick={() => bulkSetAccessLevel(level)} disabled={bulkBusy} style={bulkChipStyle}>{level}</button>
              ))}
              <span style={{ width: 1, height: 18, backgroundColor: `${colors.rust}33`, margin: '0 4px' }} />
              <span style={bulkLabelStyle}>Status</span>
              <button type="button" onClick={() => bulkSetActive(true)} disabled={bulkBusy} style={bulkChipStyle}>Activate</button>
              <button type="button" onClick={() => bulkSetActive(false)} disabled={bulkBusy} style={bulkChipStyle}>Deactivate</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={bulkLabelStyle}>App role</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SORTED_APPS.map((app) => {
                    const accent = appColor(app.id);
                    const targeted = bulkTargetApp === app.id;
                    const Icon = app.icon;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => setBulkTargetApp(targeted ? null : app.id)}
                        style={{ ...appChipStyle, borderColor: targeted ? accent : colors.border, backgroundColor: targeted ? `${accent}14` : colors.appBg }}
                      >
                        <Icon size={12.5} color={targeted ? accent : colors.inkSoft} />
                        <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: targeted ? accent : colors.inkSoft }}>{app.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {!!bulkTargetApp && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={bulkLabelStyle}>Set to</span>
                  {roleOptionsFor(bulkTargetApp).filter((r): r is AppRole => r !== null).map((role) => (
                    <button key={role} type="button" onClick={() => bulkSetAppRole(role)} disabled={bulkBusy} style={bulkChipStyle}>{role}</button>
                  ))}
                  <button type="button" onClick={() => bulkSetAppRole(null)} disabled={bulkBusy} style={bulkChipStyle}>None</button>
                </div>
              )}
            </div>
            {bulkBusy && <Spinner />}
            {!!bulkNote && <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.ink }}>{bulkNote}</span>}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <div style={{ minWidth: 720, border: `1px solid ${colors.border}`, borderRadius: radii.lg, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', backgroundColor: colors.appBg, borderBottom: `1px solid ${colors.border}` }}>
                <button type="button" onClick={toggleSelectAll} style={{ width: 24, display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Select all visible users">
                  {allVisibleSelected ? <CheckSquare size={16} color={colors.rust} /> : <Square size={16} color={colors.inkSoft} />}
                </button>
                <span style={{ ...tableHeaderTextStyle, width: 220 }}>Email</span>
                <span style={{ ...tableHeaderTextStyle, width: 100 }}>Mobile</span>
                <span style={{ ...tableHeaderTextStyle, width: 90 }}>Access</span>
                <span style={{ ...tableHeaderTextStyle, width: 50 }}>Apps</span>
                <span style={{ ...tableHeaderTextStyle, width: 44 }}>Active</span>
                <span style={{ ...tableHeaderTextStyle, width: 90 }}>Actions</span>
              </div>

              {visibleUsers.length === 0 && (
                <p style={{ padding: 20, textAlign: 'center', fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, margin: 0 }}>
                  {userSearch.trim() ? `No authorized users match "${userSearch.trim()}".` : 'No authorized users yet.'}
                </p>
              )}

              <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                {visibleUsers.map((user, i) => {
                  const active = effectiveActive(user);
                  const grantedCount = APPS.filter((app) => effectiveRole(user, app.id)).length;
                  const dirty = isDirty(user);
                  const accessLevel = effectiveAccessLevel(user);
                  return (
                    <div
                      key={user.email}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', backgroundColor: active ? colors.white : colors.appBg, opacity: active ? 1 : 0.7, borderBottom: i < visibleUsers.length - 1 ? `1px solid ${colors.border}` : 'none' }}
                    >
                      <button type="button" onClick={() => toggleSelected(user.email)} style={{ width: 24, display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }} aria-label={`Select ${user.email}`}>
                        {selected.has(user.email) ? <CheckSquare size={16} color={colors.rust} /> : <Square size={16} color={colors.inkSoft} />}
                      </button>
                      <span style={{ width: 220, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
                      <span style={{ width: 100, fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.mobile || '—'}</span>
                      <span style={{ width: 90 }}>
                        {user.accessLevel === 'Super Admin' ? (
                          <span style={superAdminBadgeCompactStyle}><ShieldCheck size={11} color={colors.rust} />Super</span>
                        ) : (
                          <span style={{ ...accessLevelBadgeStyle, ...(accessLevel === 'Admin' ? accessLevelBadgeAdminStyle : null) }}>{accessLevel}</span>
                        )}
                      </span>
                      <span style={{ width: 50, fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft }}>{grantedCount}/{APPS.length}</span>
                      <span style={{ width: 44 }}>
                        <input type="checkbox" checked={active} onChange={() => toggleActivePending(user)} aria-label={`${active ? 'Deactivate' : 'Activate'} ${user.email}`} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                      </span>
                      <span style={{ width: 90, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {dirty && (
                          <button type="button" onClick={() => saveUser(user)} disabled={saving === user.email} style={iconBtnSaveStyle} aria-label={`Save changes for ${user.email}`}>
                            {saving === user.email ? <Spinner light /> : <Save size={13} color={colors.white} />}
                          </button>
                        )}
                        <button type="button" onClick={() => setEditingEmail(user.email)} style={iconBtnStyle} aria-label={`Edit access level and app roles for ${user.email}`}><Pencil size={14} color={colors.ink} /></button>
                        <button type="button" onClick={() => removeUser(user.email)} style={iconBtnStyle} aria-label={`Remove ${user.email}`}><Trash2 size={14} color={colors.rust} /></button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <Dialog onClose={closeAddUserModal}>
          <div style={dialogHeaderRowStyle}>
            <p style={dialogTitleStyle}>Add Users</p>
            <button type="button" onClick={closeAddUserModal} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Close"><X size={18} color={colors.inkSoft} /></button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button type="button" onClick={() => setAddMode('single')} style={{ ...tabBtnStyle, ...(addMode === 'single' ? tabBtnActiveStyle : null) }}>
              <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: addMode === 'single' ? colors.rust : colors.inkSoft }}>Single</span>
            </button>
            <button type="button" onClick={() => setAddMode('bulk')} style={{ ...tabBtnStyle, ...(addMode === 'bulk' ? tabBtnActiveStyle : null) }}>
              <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: addMode === 'bulk' ? colors.rust : colors.inkSoft }}>Bulk Add</span>
            </button>
          </div>

          {addMode === 'single' ? (
            <>
              <div style={inputWrapStyle}>
                <Mail size={14} color={colors.inkSoft} />
                <input value={newUserEmail} onChange={(e) => { setNewUserEmail(e.target.value); if (dialogError) setDialogError(''); }} placeholder="name@emamigroup.com" autoFocus style={inputStyle} aria-label="Email address to grant access" />
              </div>
              <div style={{ ...inputWrapStyle, marginTop: 8 }}>
                <Phone size={14} color={colors.inkSoft} />
                <input
                  value={newUserMobile}
                  onChange={(e) => { setNewUserMobile(e.target.value); if (dialogError) setDialogError(''); }}
                  placeholder="Mobile number (optional)"
                  style={inputStyle}
                  aria-label="Mobile number for the new user"
                />
              </div>
              <p style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 6, marginBottom: 0 }}>
                Shown on their Profile once they sign in for the first time — they can still change it themselves later.
              </p>
            </>
          ) : (
            <>
              <textarea
                value={bulkEmailsText}
                onChange={(e) => { setBulkEmailsText(e.target.value); if (dialogError) setDialogError(''); }}
                placeholder="Paste emails — separated by commas, spaces, or one per line"
                rows={5}
                style={bulkTextAreaStyle}
                aria-label="Paste multiple email addresses, one per line or comma-separated"
              />
              {parsedBulkEmails.length > 0 && (
                <p style={bulkParseHintStyle}>
                  {bulkValidEmails.length} new email{bulkValidEmails.length === 1 ? '' : 's'} ready to add
                  {bulkSkippedCount > 0 ? ` · ${bulkSkippedCount} skipped (invalid or already has access)` : ''}
                </p>
              )}
            </>
          )}

          <p style={dialogSectionLabelStyle}>Assign app roles{addMode === 'bulk' ? ' (applied to every user added)' : ''}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SORTED_APPS.map((app) => {
              const role = newUserRoles[app.id] ?? null;
              const accent = appColor(app.id);
              const Icon = app.icon;
              return (
                <button key={app.id} type="button" onClick={() => setRolePickerFor({ context: 'add', appId: app.id })} style={{ ...appChipStyle, borderColor: role ? accent : colors.border, backgroundColor: role ? `${accent}14` : colors.appBg }}>
                  <Icon size={12.5} color={role ? accent : colors.inkSoft} />
                  <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: role ? accent : colors.inkSoft }}>{app.name}{role ? ` · ${role}` : ''}</span>
                  {isElevatedRole(app.id, role) && <Check size={12} color={accent} />}
                </button>
              );
            })}
          </div>

          {newUserRoles[AUDIT_CAPA_APP_ID] === 'Depot' && (
            <>
              <p style={dialogSectionLabelStyle}>Depot</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AUDIT_CAPA_DEPOTS.map((depot) => {
                  const isCurrent = (newUserDepots[AUDIT_CAPA_APP_ID] ?? null) === depot;
                  return (
                    <button key={depot} type="button" onClick={() => setNewUserDepot(AUDIT_CAPA_APP_ID, depot)} style={{ ...appChipStyle, borderColor: isCurrent ? colors.rust : colors.border, backgroundColor: isCurrent ? `${colors.rust}14` : colors.appBg }}>
                      <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: isCurrent ? colors.rust : colors.inkSoft }}>{depot}</span>
                      {isCurrent && <Check size={12} color={colors.rust} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!!dialogError && <p style={errorTextStyle}>{dialogError}</p>}
          {!!bulkProgress && <p style={bulkParseHintStyle}>Adding {bulkProgress.done}/{bulkProgress.total}…</p>}

          <div style={dialogFooterRowStyle}>
            <button type="button" onClick={closeAddUserModal} disabled={addingUser} style={dialogCancelBtnStyle}>Cancel</button>
            <button type="button" onClick={addMode === 'single' ? submitNewUser : submitBulkUsers} disabled={addingUser} style={{ ...saveBtnStyle, flex: 1 }}>
              {addingUser ? <Spinner light /> : (<><Save size={13} color={colors.white} /><span style={saveBtnTextStyle}>{addMode === 'single' ? 'Save' : `Add ${bulkValidEmails.length || ''} Users`}</span></>)}
            </button>
          </div>
        </Dialog>
      )}

      {editTarget && (
        <Dialog onClose={closeEdit}>
          <div style={dialogHeaderRowStyle}>
            <p style={{ ...dialogTitleStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editTarget.email}</p>
            <button type="button" onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Close"><X size={18} color={colors.inkSoft} /></button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4 }}>Access level</span>
            {editTarget.accessLevel === 'Super Admin' ? (
              <span style={superAdminBadgeStyle}><ShieldCheck size={12} color={colors.rust} />Super Admin · Fixed</span>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                {GRANTABLE_LEVELS.map((level) => {
                  const isCurrent = effectiveAccessLevel(editTarget) === level;
                  const allowed = canSetAccessLevel(editTarget, level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setAccessLevelPending(editTarget, level)}
                      disabled={!allowed}
                      style={{ ...accessLevelChipStyle, ...(isCurrent ? accessLevelChipActiveStyle : null), ...(!allowed && !isCurrent ? { opacity: 0.55 } : null) }}
                    >
                      {!allowed && !isCurrent && <Lock size={10} color={colors.inkSoft} />}
                      <span style={{ fontSize: 11.5, fontFamily: isCurrent ? fonts.sansSemiBold : fonts.sansMedium, fontWeight: isCurrent ? fontWeights.sansSemiBold : fontWeights.sansMedium, color: isCurrent ? colors.rust : colors.inkSoft }}>{level}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <p style={dialogSectionLabelStyle}>App roles</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SORTED_APPS.map((app) => {
              const role = effectiveRole(editTarget, app.id);
              const accent = appColor(app.id);
              const Icon = app.icon;
              return (
                <button key={app.id} type="button" onClick={() => setRolePickerFor({ context: 'edit', appId: app.id })} style={{ ...appChipStyle, borderColor: role ? accent : colors.border, backgroundColor: role ? `${accent}14` : colors.appBg }}>
                  <Icon size={12.5} color={role ? accent : colors.inkSoft} />
                  <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: role ? accent : colors.inkSoft }}>{app.name}{role ? ` · ${role}` : ''}</span>
                  {isElevatedRole(app.id, role) && <Check size={12} color={accent} />}
                </button>
              );
            })}
          </div>

          {effectiveRole(editTarget, AUDIT_CAPA_APP_ID) === 'Depot' && (
            <>
              <p style={dialogSectionLabelStyle}>Depot</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AUDIT_CAPA_DEPOTS.map((depot) => {
                  const isCurrent = effectiveDepot(editTarget, AUDIT_CAPA_APP_ID) === depot;
                  return (
                    <button key={depot} type="button" onClick={() => setPendingDepot(editTarget, AUDIT_CAPA_APP_ID, depot)} style={{ ...appChipStyle, borderColor: isCurrent ? colors.rust : colors.border, backgroundColor: isCurrent ? `${colors.rust}14` : colors.appBg }}>
                      <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: isCurrent ? colors.rust : colors.inkSoft }}>{depot}</span>
                      {isCurrent && <Check size={12} color={colors.rust} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!!error && <p style={errorTextStyle}>{error}</p>}

          <div style={dialogFooterRowStyle}>
            <button type="button" onClick={closeEdit} style={dialogCancelBtnStyle}>Close</button>
            {isDirty(editTarget) && (
              <button type="button" onClick={() => saveUser(editTarget)} disabled={saving === editTarget.email} style={{ ...saveBtnStyle, flex: 1 }}>
                {saving === editTarget.email ? <Spinner light /> : (<><Save size={13} color={colors.white} /><span style={saveBtnTextStyle}>Save changes</span></>)}
              </button>
            )}
          </div>
        </Dialog>
      )}

      {rolePickerFor && (() => {
        const app = APPS.find((a) => a.id === rolePickerFor.appId);
        if (!app) return null;
        const Icon = app.icon;
        const accent = appColor(app.id);
        const currentRole = rolePickerFor.context === 'add' ? newUserRoles[rolePickerFor.appId] ?? null : editTarget ? effectiveRole(editTarget, rolePickerFor.appId) : null;
        const choose = (role: AppRole | null) => {
          if (rolePickerFor.context === 'add') setNewUserRole(rolePickerFor.appId, role);
          else if (editTarget) setPendingRole(editTarget, rolePickerFor.appId, role);
          setRolePickerFor(null);
        };
        return (
          <Dialog onClose={() => setRolePickerFor(null)} maxWidth={300}>
            <div style={dialogHeaderRowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <Icon size={16} color={accent} />
                <p style={dialogTitleStyle}>{app.name}</p>
              </div>
              <button type="button" onClick={() => setRolePickerFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Close"><X size={18} color={colors.inkSoft} /></button>
            </div>
            <p style={{ fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginBottom: 12 }}>Choose this person&apos;s access for {app.name}</p>
            {roleOptionsFor(rolePickerFor.appId).map((role) => {
              const isCurrent = currentRole === role;
              const label = role ?? 'None';
              return (
                <button key={label} type="button" onClick={() => choose(role)} style={{ ...rolePickerOptionStyle, ...(isCurrent ? rolePickerOptionActiveStyle : null) }}>
                  <span style={{ fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: isCurrent ? colors.rust : colors.ink }}>{label}</span>
                  {isCurrent && <Check size={15} color={colors.rust} />}
                </button>
              );
            })}
          </Dialog>
        );
      })()}
    </div>
  );
}

function Spinner({ light }: { light?: boolean }) {
  return (
    <>
      <div className="manage-access-spinner" style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${light ? 'rgba(255,255,255,0.4)' : colors.border}`, borderTopColor: light ? colors.white : colors.rust }} />
      <style jsx>{`
        .manage-access-spinner {
          animation: manage-access-spin 0.8s linear infinite;
        }
        @keyframes manage-access-spin {
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
const inputWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, borderRadius: radii.lg, padding: '0 12px', height: 40, backgroundColor: colors.appBg };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 13, color: colors.ink, fontFamily: fonts.sansRegular, border: 'none', outline: 'none', background: 'transparent', height: '100%' };
const exportBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '0 14px', height: 40, backgroundColor: colors.white, cursor: 'pointer' };
const addBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', borderRadius: radii.lg, padding: '0 16px', height: 40, backgroundColor: colors.rust, cursor: 'pointer' };
const errorTextStyle: React.CSSProperties = { fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: '#C0392B', marginTop: 8 };
const bulkLabelStyle: React.CSSProperties = { fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft };
const bulkChipStyle: React.CSSProperties = { border: `1px solid ${colors.rust}`, borderRadius: radii.pill, padding: '5px 10px', backgroundColor: colors.white, cursor: 'pointer', fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust };
const appChipStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid', borderRadius: radii.pill, padding: '6px 10px', cursor: 'pointer', background: 'none' };
const tableHeaderTextStyle: React.CSSProperties = { fontSize: 10.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0 };
const superAdminBadgeCompactStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: radii.pill, padding: '3px 8px', backgroundColor: `${colors.rust}14`, fontSize: 10.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust };
const accessLevelBadgeStyle: React.CSSProperties = { display: 'inline-block', borderRadius: radii.pill, padding: '3px 8px', backgroundColor: colors.appBg, border: `1px solid ${colors.border}`, fontSize: 10.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft };
const accessLevelBadgeAdminStyle: React.CSSProperties = { backgroundColor: `${colors.rust}14`, borderColor: colors.rust, color: colors.rust };
const iconBtnStyle: React.CSSProperties = { width: 26, height: 26, borderRadius: radii.md, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.appBg, border: 'none', cursor: 'pointer', flexShrink: 0 };
const iconBtnSaveStyle: React.CSSProperties = { ...iconBtnStyle, backgroundColor: colors.rust };
const dialogHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 };
const dialogTitleStyle: React.CSSProperties = { fontSize: 16, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, flex: 1, margin: 0 };
const dialogSectionLabelStyle: React.CSSProperties = { fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 10 };
const dialogFooterRowStyle: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 16 };
const dialogCancelBtnStyle: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '10px 0', backgroundColor: colors.white, cursor: 'pointer', fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink };
const saveBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', borderRadius: radii.lg, padding: '10px 0', backgroundColor: colors.rust, cursor: 'pointer' };
const saveBtnTextStyle: React.CSSProperties = { fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.white };
const tabBtnStyle: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '8px 0', backgroundColor: colors.appBg, cursor: 'pointer' };
const tabBtnActiveStyle: React.CSSProperties = { borderColor: colors.rust, backgroundColor: `${colors.rust}14` };
const bulkTextAreaStyle: React.CSSProperties = { width: '100%', borderRadius: radii.lg, padding: '10px 12px', minHeight: 100, fontSize: 13, color: colors.ink, fontFamily: fonts.sansRegular, backgroundColor: colors.appBg, border: 'none', outline: 'none', resize: 'vertical', boxSizing: 'border-box' };
const bulkParseHintStyle: React.CSSProperties = { fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft, marginTop: 6 };
const superAdminBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: radii.pill, padding: '5px 10px', backgroundColor: `${colors.rust}14`, fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust };
const accessLevelChipStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${colors.border}`, borderRadius: radii.pill, padding: '5px 10px', backgroundColor: colors.appBg, cursor: 'pointer' };
const accessLevelChipActiveStyle: React.CSSProperties = { borderColor: colors.rust, backgroundColor: `${colors.rust}14` };
const rolePickerOptionStyle: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '12px 14px', marginBottom: 8, backgroundColor: colors.appBg, cursor: 'pointer' };
const rolePickerOptionActiveStyle: React.CSSProperties = { borderColor: colors.rust, backgroundColor: `${colors.rust}14` };
