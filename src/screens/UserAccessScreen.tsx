import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Switch, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft, Mail, Plus, ShieldCheck, ShieldAlert, Trash2, Info, Check, Save, KeyRound,
  ChevronRight, Lock, Search, X, Pencil, Square, CheckSquare, FileSpreadsheet,
} from 'lucide-react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { APPS } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import type { AccessLevel, AppRole, UserAccessEntry } from '../types';
import { colors, fonts, radii, appColor } from '../theme/tokens';
import { exportUsersToExcel } from '../lib/exportUsersExcel';
import {
  listAuthorizedUsers, addAuthorizedUser, removeAuthorizedUser, setAppAccess, setUserActive, setAccessLevel,
} from '../lib/accessApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Audit & CAPA is the one app with its own role vocabulary (CQA/Depot) instead of the generic
 * User/Admin pair every other app uses — see roleOptionsFor/isElevatedRole below. */
const AUDIT_CAPA_APP_ID = 'audit-capa';
/** Mirrors embedded-apps/audit-capa/src/data/depots.js — kept in sync by hand since depots change
 * rarely; add a new one here too if it's ever added there, so it's selectable from Manage Access. */
const AUDIT_CAPA_DEPOTS = ['Delhi Depot', 'Kolkata Depot', 'Mumbai Depot'];

/** Options offered by the app-role picker popup, in display order — per-app, since Audit & CAPA
 * uses CQA/Depot (CQA = the elevated/admin-equivalent role, Depot = the base/user-equivalent role,
 * which also carries which depot that person belongs to) instead of User/Admin. */
function roleOptionsFor(appId: string | null | undefined): (AppRole | null)[] {
  if (appId === AUDIT_CAPA_APP_ID) return [null, 'Depot', 'CQA'];
  return [null, 'User', 'Admin'];
}

/** Whether `role` is the elevated/admin-equivalent role for `appId` — drives the checkmark shown
 * on an app chip. 'Admin' for the generic pair, 'CQA' for Audit & CAPA. */
function isElevatedRole(appId: string, role: AppRole | null): boolean {
  return appId === AUDIT_CAPA_APP_ID ? role === 'CQA' : role === 'Admin';
}
/** Hub-wide levels an admin can actually grant through this screen — 'Super Admin' is never
 * offered here at all, it only ever exists on the one permanently-seeded email (see db.js). */
const GRANTABLE_LEVELS: AccessLevel[] = ['Admin', 'Viewer'];
/** How many requests to have in flight at once for a bulk/mass operation — a courtesy to the
 * backend's Postgres pool (max 10 connections, see backend/db.js), not a hard technical limit. */
const BULK_CONCURRENCY = 8;

/** Local, unsaved edits for one user — undefined fields mean "unchanged from the server copy". */
type PendingChanges = {
  isActive?: boolean;
  accessLevel?: AccessLevel;
  roles: Record<string, AppRole | null>;
  /** Only meaningful for Audit & CAPA's 'Depot' role — see AUDIT_CAPA_DEPOTS. */
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

/** Runs `fn` over every item with at most `size` in flight at a time — plain Promise.all across
 * the full list would fire e.g. 130 queries at once against a 10-connection pool. */
async function runBatched<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const batch of chunk(items, size)) {
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

/** Splits pasted text on commas, semicolons, whitespace/newlines — however someone pastes a list
 * of emails out of Outlook/Excel/a Teams chat — then dedupes. */
function parseBulkEmails(text: string): string[] {
  const raw = text
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(raw));
}

export default function UserAccessScreen() {
  const [query, setQuery] = useState('');
  const navigation = useNavigation();
  const { userEmail, access } = useAuth();
  const actingLevel = access?.accessLevel;
  // Same rule CustomDrawerContent uses to hide the nav item — repeated here as a route-level
  // guard, since a Viewer could otherwise still reach this screen directly (deep link, back
  // button into a previously-open tab, etc).
  const canManageAccess = actingLevel === 'Super Admin' || actingLevel === 'Admin';

  const [users, setUsers] = useState<UserAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  // Keyed by email — edits made in the UI that haven't been saved to the server yet.
  const [pending, setPending] = useState<Record<string, PendingChanges>>({});

  const [exporting, setExporting] = useState(false);

  // Row selection, for the bulk action bar below the table.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkTargetApp, setBulkTargetApp] = useState<string | null>(null);

  // Per-user detail editor (access level + app roles) — opened via the row's Edit button, so the
  // table itself can stay one line per user instead of every row expanding permanently.
  const [editingEmail, setEditingEmail] = useState<string | null>(null);

  // App-role picker popup — tapping an app chip (in either the Add Users or per-user editor
  // dialog) opens this instead of blindly cycling the role, so it's clear which role is being
  // picked rather than tapping repeatedly and guessing which state you land on.
  const [rolePickerFor, setRolePickerFor] = useState<{ context: 'add' | 'edit'; appId: string } | null>(null);

  // "Add Users" dialog — Single mirrors the original one-email flow; Bulk Add accepts a
  // pasted/typed list. Both apply the same picked app roles to whoever gets added.
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [bulkEmailsText, setBulkEmailsText] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [newUserRoles, setNewUserRoles] = useState<Record<string, AppRole | null>>({});
  const [newUserDepots, setNewUserDepots] = useState<Record<string, string | null>>({});
  const [dialogError, setDialogError] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  React.useEffect(() => {
    listAuthorizedUsers().then((result) => {
      setLoading(false);
      if (result.ok && result.users) {
        setUsers(result.users);
      } else {
        setError(result.error || 'Could not load authorized users.');
      }
    });
  }, []);

  const openAddUserModal = () => {
    setAddMode('single');
    setNewUserEmail('');
    setBulkEmailsText('');
    setNewUserRoles({});
    setNewUserDepots({});
    setDialogError('');
    setShowAddModal(true);
  };

  const closeAddUserModal = () => {
    if (addingUser) return; // don't let a stray tap dismiss mid-save
    setShowAddModal(false);
    setRolePickerFor(null);
  };

  const setNewUserRole = (appId: string, role: AppRole | null) => {
    setNewUserRoles((prev) => ({ ...prev, [appId]: role }));
  };

  const setNewUserDepot = (appId: string, depot: string | null) => {
    setNewUserDepots((prev) => ({ ...prev, [appId]: depot }));
  };

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
    setDialogError('');
    setAddingUser(true);
    try {
      const result = await addAuthorizedUser(value);
      if (!result.ok) {
        setDialogError(result.error || 'Could not add this user.');
        return;
      }
      const grantedRoles = Object.entries(newUserRoles).filter((entry): entry is [string, AppRole] => !!entry[1]);
      const roleResults = await Promise.all(
        grantedRoles.map(([appId, role]) => setAppAccess(value, appId, role, newUserDepots[appId] ?? null))
      );
      const apps = grantedRoles
        .filter((_, i) => roleResults[i].ok)
        .map(([appId, role]) => ({ appId, role, depot: newUserDepots[appId] ?? undefined }));
      setUsers((prev) => [...prev, { email: value, isActive: true, accessLevel: 'Viewer', apps }]);
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
            const res = await addAuthorizedUser(email);
            if (!res.ok) return { email, ok: false as const };
            const roleResults = await Promise.all(
              grantedRoles.map(([appId, role]) => setAppAccess(email, appId, role, newUserDepots[appId] ?? null))
            );
            const apps = grantedRoles
              .filter((_, i) => roleResults[i].ok)
              .map(([appId, role]) => ({ appId, role, depot: newUserDepots[appId] ?? undefined }));
            return { email, ok: true as const, apps };
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
    const result = await removeAuthorizedUser(email);
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
  const effectiveAccessLevel = (user: UserAccessEntry): AccessLevel =>
    pending[user.email]?.accessLevel ?? user.accessLevel;
  const isDirty = (user: UserAccessEntry) => {
    const p = pending[user.email];
    if (!p) return false;
    if (p.isActive !== undefined && p.isActive !== user.isActive) return true;
    if (p.accessLevel !== undefined && p.accessLevel !== user.accessLevel) return true;
    if (Object.entries(p.roles).some(([appId, role]) => role !== roleOf(user, appId))) return true;
    if (p.depots && Object.entries(p.depots).some(([appId, depot]) => depot !== depotOf(user, appId))) return true;
    return false;
  };

  // Same matrix server.js's PATCH /access/users/:email/access-level enforces — this only gates
  // which chips are pressable, the server call is what actually decides whether it's allowed.
  const canSetAccessLevel = (user: UserAccessEntry, level: AccessLevel) => {
    if (user.accessLevel === 'Super Admin') return false; // the permanent Super Admin never changes
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
        calls.push(setUserActive(user.email, changes.isActive));
      }
      if (changes.accessLevel !== undefined && changes.accessLevel !== user.accessLevel && userEmail) {
        calls.push(setAccessLevel(user.email, changes.accessLevel, userEmail));
      }
      // Union of apps touched by either a role change or a depot-only change (e.g. moving an
      // existing Depot user to a different depot without changing their role).
      const touchedAppIds = new Set([...Object.keys(changes.roles), ...Object.keys(changes.depots ?? {})]);
      for (const appId of touchedAppIds) {
        const role = changes.roles[appId] !== undefined ? changes.roles[appId] : roleOf(user, appId);
        const depot = changes.depots?.[appId] !== undefined ? changes.depots[appId] : depotOf(user, appId);
        const roleChanged = changes.roles[appId] !== undefined && changes.roles[appId] !== roleOf(user, appId);
        const depotChanged = changes.depots?.[appId] !== undefined && changes.depots[appId] !== depotOf(user, appId);
        if (roleChanged || depotChanged) {
          calls.push(role ? setAppAccess(user.email, appId, role, depot) : setAppAccess(user.email, appId, null));
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

  // --- Selection + bulk actions -------------------------------------------------------------
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
      if (allVisibleSelected) {
        visibleUsers.forEach((u) => next.delete(u.email));
      } else {
        visibleUsers.forEach((u) => next.add(u.email));
      }
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
      const results = await runBatched(targets, BULK_CONCURRENCY, (u) => setUserActive(u.email, isActive));
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
      const results = await runBatched(targets, BULK_CONCURRENCY, (u) => setAppAccess(u.email, targetAppId, role));
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
      setBulkNote(
        `Set ${appLabel} to ${role ?? 'None'} for ${okEmails.size} of ${targets.length} selected user(s).` +
          (failed ? ` ${failed} failed.` : '')
      );
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      await exportUsersToExcel(visibleUsers, APPS);
    } catch {
      setError('Could not export the roster. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Route-level guard — matches CustomDrawerContent's nav-item filter, but this is what actually
  // stops a Viewer who reaches this screen directly (deep link, browser back/forward, etc). `access`
  // is null only while AuthContext's fetch is still in flight, not "access denied" — don't flash
  // the denial message during that brief window.
  if (access && !canManageAccess) {
    return (
      <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
        <View style={styles.deniedWrap}>
          <ShieldAlert size={32} color={colors.inkSoft} />
          <Text style={styles.deniedTitle}>You don't have access to this page</Text>
          <Text style={styles.deniedText}>Manage Access is only available to Super Admin and Admin users.</Text>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Home' as never)}>
            <ArrowLeft size={13} color={colors.ink} />
            <Text style={styles.backText}>Back to Emami Apps</Text>
          </Pressable>
        </View>
      </ScreenScaffold>
    );
  }

  const editTarget = editingEmail ? users.find((u) => u.email === editingEmail) ?? null : null;
  const closeEdit = () => {
    if (editTarget && saving === editTarget.email) return; // don't let a stray tap dismiss mid-save
    setEditingEmail(null);
    setRolePickerFor(null);
  };

  return (
    <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Home' as never)}>
            <ArrowLeft size={13} color={colors.ink} />
            <Text style={styles.backText}>Back to Emami Apps</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Manage Access</Text>
        </View>

        <Pressable
          style={[styles.baseCard, styles.ssoLinkCard]}
          onPress={() => navigation.navigate('SsoConfig' as never)}
          accessibilityRole="button"
          accessibilityLabel="Configure SSO"
        >
          <View style={styles.cardIconBox}>
            <KeyRound size={15} color={colors.rust} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.cardTitle}>Configure SSO</Text>
            <Text style={styles.cardSubtitle}>Set up "Sign in with Microsoft" by uploading Entra's Federation Metadata XML</Text>
          </View>
          <ChevronRight size={16} color={colors.inkSoft} />
        </Pressable>

        <View style={styles.noticeCard}>
          <Info size={15} color={colors.rust} />
          <Text style={styles.noticeText}>
            This list is the source of truth for who can sign in to EmamiApps at all — an email
            not listed here (or marked inactive) is blocked at login, regardless of sign-in method.
            Tap the pencil to edit a user's access level and app roles, tick rows to change many at
            once, or use Export/Add Users above the table.
          </Text>
        </View>

        <View style={[styles.baseCard, styles.card]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconBox}>
              <ShieldCheck size={15} color={colors.rust} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.cardTitle}>Authorized Users</Text>
              <Text style={styles.cardSubtitle}>Grant each person a role per app, and control who can sign in</Text>
            </View>
          </View>

          <View style={styles.toolbarRow}>
            <View style={[styles.inputWrap, styles.flex1]}>
              <Search size={14} color={colors.inkSoft} />
              <TextInput
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder="Search by email…"
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
                accessibilityLabel="Search authorized users by email"
              />
              {!!userSearch && (
                <Pressable onPress={() => setUserSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                  <X size={14} color={colors.inkSoft} />
                </Pressable>
              )}
            </View>
            <Pressable
              style={styles.exportTriggerBtn}
              onPress={handleExport}
              disabled={exporting || visibleUsers.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Export the visible roster to Excel"
            >
              {exporting ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <>
                  <FileSpreadsheet size={14} color={colors.ink} />
                  <Text style={styles.exportBtnText}>Export</Text>
                </>
              )}
            </Pressable>
            <Pressable style={styles.addTriggerBtn} onPress={openAddUserModal} accessibilityRole="button" accessibilityLabel="Add users">
              <Plus size={14} color={colors.white} />
              <Text style={styles.addBtnText}>Add Users</Text>
            </Pressable>
          </View>
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {selected.size > 0 && (
            <View style={styles.bulkBar}>
              <View style={styles.bulkBarHeaderRow}>
                <Text style={styles.bulkBarTitle}>{selected.size} selected</Text>
                <Pressable onPress={clearSelection} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear selection">
                  <X size={14} color={colors.inkSoft} />
                </Pressable>
              </View>

              <View style={styles.bulkRow}>
                <Text style={styles.bulkLabel}>Access level</Text>
                {GRANTABLE_LEVELS.map((level) => (
                  <Pressable
                    key={level}
                    onPress={() => bulkSetAccessLevel(level)}
                    disabled={bulkBusy}
                    style={styles.bulkChip}
                    accessibilityRole="button"
                    accessibilityLabel={`Set access level to ${level} for selected users`}
                  >
                    <Text style={styles.bulkChipText}>{level}</Text>
                  </Pressable>
                ))}
                <View style={styles.bulkDivider} />
                <Text style={styles.bulkLabel}>Status</Text>
                <Pressable onPress={() => bulkSetActive(true)} disabled={bulkBusy} style={styles.bulkChip} accessibilityRole="button" accessibilityLabel="Activate selected users">
                  <Text style={styles.bulkChipText}>Activate</Text>
                </Pressable>
                <Pressable onPress={() => bulkSetActive(false)} disabled={bulkBusy} style={styles.bulkChip} accessibilityRole="button" accessibilityLabel="Deactivate selected users">
                  <Text style={styles.bulkChipText}>Deactivate</Text>
                </Pressable>
              </View>

              <View style={styles.bulkRow}>
                <Text style={styles.bulkLabel}>App role</Text>
                <View style={styles.appChipsRow}>
                  {APPS.map((app) => {
                    const Icon = app.icon;
                    const accent = appColor(app.id);
                    const targeted = bulkTargetApp === app.id;
                    return (
                      <Pressable
                        key={app.id}
                        onPress={() => setBulkTargetApp(targeted ? null : app.id)}
                        style={[styles.appChip, { borderColor: targeted ? accent : colors.border }, targeted && { backgroundColor: `${accent}14` }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Target ${app.name} for a bulk role change`}
                        accessibilityState={{ selected: targeted }}
                      >
                        <Icon size={12.5} color={targeted ? accent : colors.inkSoft} />
                        <Text style={[styles.appChipText, { color: targeted ? accent : colors.inkSoft }]}>{app.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!!bulkTargetApp && (
                  <View style={styles.bulkRow}>
                    <Text style={styles.bulkLabel}>Set to</Text>
                    {roleOptionsFor(bulkTargetApp)
                      .filter((role): role is AppRole => role !== null)
                      .map((role) => (
                        <Pressable
                          key={role}
                          onPress={() => bulkSetAppRole(role)}
                          disabled={bulkBusy}
                          style={styles.bulkChip}
                          accessibilityRole="button"
                          accessibilityLabel={`Set role to ${role} for selected users`}
                        >
                          <Text style={styles.bulkChipText}>{role}</Text>
                        </Pressable>
                      ))}
                    <Pressable onPress={() => bulkSetAppRole(null)} disabled={bulkBusy} style={styles.bulkChip} accessibilityRole="button" accessibilityLabel="Remove role for selected users">
                      <Text style={styles.bulkChipText}>None</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {bulkBusy && <ActivityIndicator size="small" color={colors.rust} style={styles.loadingIndicator} />}
              {!!bulkNote && <Text style={styles.bulkNoteText}>{bulkNote}</Text>}
            </View>
          )}

          {loading ? (
            <ActivityIndicator size="small" color={colors.rust} style={styles.loadingIndicator} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
              <View style={styles.tableWrap}>
                <View style={styles.tableHeaderRow}>
                  <Pressable
                    onPress={toggleSelectAll}
                    style={styles.checkboxCell}
                    accessibilityRole="checkbox"
                    accessibilityLabel="Select all visible users"
                    accessibilityState={{ checked: allVisibleSelected }}
                  >
                    {allVisibleSelected ? <CheckSquare size={16} color={colors.rust} /> : <Square size={16} color={colors.inkSoft} />}
                  </Pressable>
                  <Text style={[styles.tableHeaderText, styles.emailCell]}>Email</Text>
                  <Text style={[styles.tableHeaderText, styles.accessCell]}>Access</Text>
                  <Text style={[styles.tableHeaderText, styles.appsCell]}>Apps</Text>
                  <Text style={[styles.tableHeaderText, styles.activeCell]}>Active</Text>
                  <Text style={[styles.tableHeaderText, styles.actionsCell]}>Actions</Text>
                </View>

                {visibleUsers.length === 0 && (
                  <Text style={styles.emptyText}>
                    {userSearch.trim() ? `No authorized users match "${userSearch.trim()}".` : 'No authorized users yet.'}
                  </Text>
                )}

                {/* Bounded to its own scroll area (rather than growing with the page) so the header,
                    search box, and bulk bar above stay put while reviewing a long roster — no more
                    scrolling the whole screen just to get past a handful of users. */}
                <ScrollView style={styles.tableBody} nestedScrollEnabled showsVerticalScrollIndicator>
                {visibleUsers.map((user, i) => {
                  const active = effectiveActive(user);
                  const grantedCount = APPS.filter((app) => effectiveRole(user, app.id)).length;
                  const dirty = isDirty(user);
                  const accessLevel = effectiveAccessLevel(user);
                  return (
                    <View
                      key={user.email}
                      style={[styles.tableRow, i < visibleUsers.length - 1 && styles.tableRowBorder, !active && styles.tableRowInactive]}
                    >
                      <Pressable
                        onPress={() => toggleSelected(user.email)}
                        style={styles.checkboxCell}
                        accessibilityRole="checkbox"
                        accessibilityLabel={`Select ${user.email}`}
                        accessibilityState={{ checked: selected.has(user.email) }}
                      >
                        {selected.has(user.email) ? <CheckSquare size={16} color={colors.rust} /> : <Square size={16} color={colors.inkSoft} />}
                      </Pressable>

                      <View style={styles.emailCell}>
                        <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
                      </View>

                      <View style={styles.accessCell}>
                        {user.accessLevel === 'Super Admin' ? (
                          <View style={styles.superAdminBadgeCompact}>
                            <ShieldCheck size={11} color={colors.rust} />
                            <Text style={styles.superAdminBadgeTextCompact}>Super</Text>
                          </View>
                        ) : (
                          <View style={[styles.accessLevelBadge, accessLevel === 'Admin' && styles.accessLevelBadgeAdmin]}>
                            <Text style={[styles.accessLevelBadgeText, accessLevel === 'Admin' && styles.accessLevelBadgeTextAdmin]}>
                              {accessLevel}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.appsCell}>
                        <Text style={styles.appsCountText}>{grantedCount}/{APPS.length}</Text>
                      </View>

                      <View style={styles.activeCell}>
                        <Switch
                          value={active}
                          onValueChange={() => toggleActivePending(user)}
                          trackColor={{ true: colors.rust, false: colors.border }}
                          accessibilityLabel={`${active ? 'Deactivate' : 'Activate'} ${user.email}`}
                        />
                      </View>

                      <View style={styles.actionsCell}>
                        {dirty && (
                          <Pressable
                            onPress={() => saveUser(user)}
                            disabled={saving === user.email}
                            style={styles.iconBtnSave}
                            accessibilityRole="button"
                            accessibilityLabel={`Save changes for ${user.email}`}
                          >
                            {saving === user.email ? <ActivityIndicator size="small" color={colors.white} /> : <Save size={13} color={colors.white} />}
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => setEditingEmail(user.email)}
                          style={styles.iconBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit access level and app roles for ${user.email}`}
                        >
                          <Pencil size={14} color={colors.ink} />
                        </Pressable>
                        <Pressable
                          onPress={() => removeUser(user.email)}
                          style={styles.iconBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${user.email}`}
                        >
                          <Trash2 size={14} color={colors.rust} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {/* Add Users — Single mirrors the original one-email flow; Bulk Add accepts a pasted list. */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={closeAddUserModal}>
        {/* No accessibilityRole="button" here — this wraps other button-role Pressables (close,
            chips, cancel, save), and react-native-web renders that role as a literal <button>;
            nesting one inside another is invalid HTML (see AppCard.tsx's own note on this). */}
        <Pressable style={styles.backdrop} onPress={closeAddUserModal}>
          {/* Swallow taps on the card itself so they don't bubble to the backdrop's onPress. */}
          <Pressable style={styles.dialogCard} onPress={() => {}}>
            <View style={styles.dialogHeaderRow}>
              <Text style={styles.dialogTitle}>Add Users</Text>
              <Pressable onPress={closeAddUserModal} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <X size={18} color={colors.inkSoft} />
              </Pressable>
            </View>

            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setAddMode('single')}
                style={[styles.tabBtn, addMode === 'single' && styles.tabBtnActive]}
                accessibilityRole="button"
                accessibilityLabel="Add a single user"
                accessibilityState={{ selected: addMode === 'single' }}
              >
                <Text style={[styles.tabBtnText, addMode === 'single' && styles.tabBtnTextActive]}>Single</Text>
              </Pressable>
              <Pressable
                onPress={() => setAddMode('bulk')}
                style={[styles.tabBtn, addMode === 'bulk' && styles.tabBtnActive]}
                accessibilityRole="button"
                accessibilityLabel="Add multiple users at once"
                accessibilityState={{ selected: addMode === 'bulk' }}
              >
                <Text style={[styles.tabBtnText, addMode === 'bulk' && styles.tabBtnTextActive]}>Bulk Add</Text>
              </Pressable>
            </View>

            {addMode === 'single' ? (
              <View style={styles.inputWrap}>
                <Mail size={14} color={colors.inkSoft} />
                <TextInput
                  value={newUserEmail}
                  onChangeText={(v) => { setNewUserEmail(v); if (dialogError) setDialogError(''); }}
                  placeholder="name@emamigroup.com"
                  placeholderTextColor={colors.inkSoft}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                  style={styles.input}
                  accessibilityLabel="Email address to grant access"
                />
              </View>
            ) : (
              <>
                <TextInput
                  value={bulkEmailsText}
                  onChangeText={(v) => { setBulkEmailsText(v); if (dialogError) setDialogError(''); }}
                  placeholder={'Paste emails — separated by commas, spaces, or one per line'}
                  placeholderTextColor={colors.inkSoft}
                  autoCapitalize="none"
                  multiline
                  numberOfLines={5}
                  style={styles.bulkTextArea}
                  accessibilityLabel="Paste multiple email addresses, one per line or comma-separated"
                />
                {parsedBulkEmails.length > 0 && (
                  <Text style={styles.bulkParseHint}>
                    {bulkValidEmails.length} new email{bulkValidEmails.length === 1 ? '' : 's'} ready to add
                    {bulkSkippedCount > 0 ? ` · ${bulkSkippedCount} skipped (invalid or already has access)` : ''}
                  </Text>
                )}
              </>
            )}

            <Text style={styles.dialogSectionLabel}>
              Assign app roles{addMode === 'bulk' ? ' (applied to every user added)' : ''}
            </Text>
            <View style={styles.appChipsRow}>
              {APPS.map((app) => {
                const role = newUserRoles[app.id] ?? null;
                const accent = appColor(app.id);
                const Icon = app.icon;
                return (
                  <Pressable
                    key={app.id}
                    onPress={() => setRolePickerFor({ context: 'add', appId: app.id })}
                    style={[
                      styles.appChip,
                      { borderColor: role ? accent : colors.border },
                      role && { backgroundColor: `${accent}14` },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${app.name} access for new user(s): ${role ?? 'None'}. Tap to choose a role.`}
                  >
                    <Icon size={12.5} color={role ? accent : colors.inkSoft} />
                    <Text style={[styles.appChipText, { color: role ? accent : colors.inkSoft }]}>
                      {app.name}{role ? ` · ${role}` : ''}
                    </Text>
                    {isElevatedRole(app.id, role) && <Check size={12} color={accent} />}
                  </Pressable>
                );
              })}
            </View>

            {newUserRoles[AUDIT_CAPA_APP_ID] === 'Depot' && (
              <>
                <Text style={styles.dialogSectionLabel}>Depot</Text>
                <View style={styles.appChipsRow}>
                  {AUDIT_CAPA_DEPOTS.map((depot) => {
                    const isCurrent = (newUserDepots[AUDIT_CAPA_APP_ID] ?? null) === depot;
                    return (
                      <Pressable
                        key={depot}
                        onPress={() => setNewUserDepot(AUDIT_CAPA_APP_ID, depot)}
                        style={[
                          styles.appChip,
                          { borderColor: isCurrent ? colors.rust : colors.border },
                          isCurrent && { backgroundColor: `${colors.rust}14` },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Set depot to ${depot}`}
                        accessibilityState={{ selected: isCurrent }}
                      >
                        <Text style={[styles.appChipText, { color: isCurrent ? colors.rust : colors.inkSoft }]}>{depot}</Text>
                        {isCurrent && <Check size={12} color={colors.rust} />}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {!!dialogError && <Text style={styles.errorText}>{dialogError}</Text>}
            {!!bulkProgress && <Text style={styles.bulkParseHint}>Adding {bulkProgress.done}/{bulkProgress.total}…</Text>}

            <View style={styles.dialogFooterRow}>
              <Pressable style={styles.dialogCancelBtn} onPress={closeAddUserModal} disabled={addingUser} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.dialogCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, styles.dialogSaveBtn]}
                onPress={addMode === 'single' ? submitNewUser : submitBulkUsers}
                disabled={addingUser}
                accessibilityRole="button"
                accessibilityLabel={addMode === 'single' ? 'Save new user' : 'Add all pasted users'}
              >
                {addingUser ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Save size={13} color={colors.white} />
                    <Text style={styles.saveBtnText}>
                      {addMode === 'single' ? 'Save' : `Add ${bulkValidEmails.length || ''} Users`}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Per-user editor — access level + app roles, opened via the table row's Edit button. */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={closeEdit}>
        <Pressable style={styles.backdrop} onPress={closeEdit}>
          <Pressable style={styles.dialogCard} onPress={() => {}}>
            {editTarget && (
              <>
                <View style={styles.dialogHeaderRow}>
                  <Text style={styles.dialogTitle} numberOfLines={1}>{editTarget.email}</Text>
                  <Pressable onPress={closeEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                    <X size={18} color={colors.inkSoft} />
                  </Pressable>
                </View>

                <View style={styles.accessLevelRow}>
                  <Text style={styles.accessLevelLabel}>Access level</Text>
                  {editTarget.accessLevel === 'Super Admin' ? (
                    <View style={styles.superAdminBadge}>
                      <ShieldCheck size={12} color={colors.rust} />
                      <Text style={styles.superAdminBadgeText}>Super Admin · Fixed</Text>
                    </View>
                  ) : (
                    <View style={styles.accessLevelChips}>
                      {GRANTABLE_LEVELS.map((level) => {
                        const isCurrent = effectiveAccessLevel(editTarget) === level;
                        const allowed = canSetAccessLevel(editTarget, level);
                        return (
                          <Pressable
                            key={level}
                            onPress={() => setAccessLevelPending(editTarget, level)}
                            disabled={!allowed}
                            style={[
                              styles.accessLevelChip,
                              isCurrent && styles.accessLevelChipActive,
                              !allowed && !isCurrent && styles.accessLevelChipDisabled,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Set ${editTarget.email} to ${level}`}
                            accessibilityState={{ selected: isCurrent, disabled: !allowed }}
                          >
                            {!allowed && !isCurrent && <Lock size={10} color={colors.inkSoft} />}
                            <Text style={[styles.accessLevelChipText, isCurrent && styles.accessLevelChipTextActive]}>
                              {level}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                <Text style={styles.dialogSectionLabel}>App roles</Text>
                <View style={styles.appChipsRow}>
                  {APPS.map((app) => {
                    const role = effectiveRole(editTarget, app.id);
                    const accent = appColor(app.id);
                    const Icon = app.icon;
                    return (
                      <Pressable
                        key={app.id}
                        onPress={() => setRolePickerFor({ context: 'edit', appId: app.id })}
                        style={[
                          styles.appChip,
                          { borderColor: role ? accent : colors.border },
                          role && { backgroundColor: `${accent}14` },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${app.name} access for ${editTarget.email}: ${role ?? 'None'}. Tap to choose a role.`}
                      >
                        <Icon size={12.5} color={role ? accent : colors.inkSoft} />
                        <Text style={[styles.appChipText, { color: role ? accent : colors.inkSoft }]}>
                          {app.name}{role ? ` · ${role}` : ''}
                        </Text>
                        {isElevatedRole(app.id, role) && <Check size={12} color={accent} />}
                      </Pressable>
                    );
                  })}
                </View>

                {effectiveRole(editTarget, AUDIT_CAPA_APP_ID) === 'Depot' && (
                  <>
                    <Text style={styles.dialogSectionLabel}>Depot</Text>
                    <View style={styles.appChipsRow}>
                      {AUDIT_CAPA_DEPOTS.map((depot) => {
                        const isCurrent = effectiveDepot(editTarget, AUDIT_CAPA_APP_ID) === depot;
                        return (
                          <Pressable
                            key={depot}
                            onPress={() => setPendingDepot(editTarget, AUDIT_CAPA_APP_ID, depot)}
                            style={[
                              styles.appChip,
                              { borderColor: isCurrent ? colors.rust : colors.border },
                              isCurrent && { backgroundColor: `${colors.rust}14` },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Set depot to ${depot} for ${editTarget.email}`}
                            accessibilityState={{ selected: isCurrent }}
                          >
                            <Text style={[styles.appChipText, { color: isCurrent ? colors.rust : colors.inkSoft }]}>{depot}</Text>
                            {isCurrent && <Check size={12} color={colors.rust} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <View style={styles.dialogFooterRow}>
                  <Pressable style={styles.dialogCancelBtn} onPress={closeEdit} accessibilityRole="button" accessibilityLabel="Close">
                    <Text style={styles.dialogCancelBtnText}>Close</Text>
                  </Pressable>
                  {isDirty(editTarget) && (
                    <Pressable
                      style={[styles.saveBtn, styles.dialogSaveBtn]}
                      onPress={() => saveUser(editTarget)}
                      disabled={saving === editTarget.email}
                      accessibilityRole="button"
                      accessibilityLabel={`Save changes for ${editTarget.email}`}
                    >
                      {saving === editTarget.email ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Save size={13} color={colors.white} />
                          <Text style={styles.saveBtnText}>Save changes</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* App-role picker — opened by tapping an app chip in either dialog above, instead of
          blindly cycling the role on tap. */}
      <Modal visible={!!rolePickerFor} transparent animationType="fade" onRequestClose={() => setRolePickerFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setRolePickerFor(null)}>
          <Pressable style={[styles.dialogCard, styles.rolePickerCard]} onPress={() => {}}>
            {rolePickerFor && (() => {
              const app = APPS.find((a) => a.id === rolePickerFor.appId);
              if (!app) return null;
              const Icon = app.icon;
              const accent = appColor(app.id);
              const currentRole = rolePickerFor.context === 'add'
                ? newUserRoles[rolePickerFor.appId] ?? null
                : editTarget ? effectiveRole(editTarget, rolePickerFor.appId) : null;
              const choose = (role: AppRole | null) => {
                if (rolePickerFor.context === 'add') setNewUserRole(rolePickerFor.appId, role);
                else if (editTarget) setPendingRole(editTarget, rolePickerFor.appId, role);
                setRolePickerFor(null);
              };
              return (
                <>
                  <View style={styles.dialogHeaderRow}>
                    <View style={styles.rolePickerTitleRow}>
                      <Icon size={16} color={accent} />
                      <Text style={styles.dialogTitle}>{app.name}</Text>
                    </View>
                    <Pressable onPress={() => setRolePickerFor(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                      <X size={18} color={colors.inkSoft} />
                    </Pressable>
                  </View>
                  <Text style={styles.rolePickerHint}>Choose this person's access for {app.name}</Text>
                  {roleOptionsFor(rolePickerFor.appId).map((role) => {
                    const isCurrent = currentRole === role;
                    const label = role ?? 'None';
                    return (
                      <Pressable
                        key={label}
                        onPress={() => choose(role)}
                        style={[styles.rolePickerOption, isCurrent && styles.rolePickerOptionActive]}
                        accessibilityRole="button"
                        accessibilityLabel={`Set ${app.name} access to ${label}`}
                        accessibilityState={{ selected: isCurrent }}
                      >
                        <Text style={[styles.rolePickerOptionText, isCurrent && styles.rolePickerOptionTextActive]}>
                          {label}
                        </Text>
                        {isCurrent && <Check size={15} color={colors.rust} />}
                      </Pressable>
                    );
                  })}
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  flex1: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  backText: {
    fontSize: 12,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  pageTitle: {
    fontSize: 18,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  deniedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 8,
  },
  deniedTitle: {
    fontSize: 16,
    fontFamily: fonts.sansBold,
    color: colors.ink,
    marginTop: 6,
  },
  deniedText: {
    fontSize: 13,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: 14,
  },
  accessLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  accessLevelLabel: {
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  superAdminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: `${colors.rust}14`,
  },
  superAdminBadgeText: {
    fontSize: 11.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.rust,
  },
  superAdminBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: `${colors.rust}14`,
  },
  superAdminBadgeTextCompact: {
    fontSize: 10.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.rust,
  },
  accessLevelChips: {
    flexDirection: 'row',
    gap: 8,
  },
  accessLevelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.appBg,
  },
  accessLevelChipActive: {
    borderColor: colors.rust,
    backgroundColor: `${colors.rust}14`,
  },
  accessLevelChipDisabled: {
    opacity: 0.55,
  },
  accessLevelChipText: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
  },
  accessLevelChipTextActive: {
    color: colors.rust,
    fontFamily: fonts.sansSemiBold,
  },
  accessLevelBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.appBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accessLevelBadgeAdmin: {
    backgroundColor: `${colors.rust}14`,
    borderColor: colors.rust,
  },
  accessLevelBadgeText: {
    fontSize: 10.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
  },
  accessLevelBadgeTextAdmin: {
    color: colors.rust,
  },
  ssoLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginBottom: 16,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: `${colors.rust}33`,
    backgroundColor: `${colors.rust}0d`,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.sansRegular,
    color: colors.ink,
    lineHeight: 17,
  },
  baseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
  },
  card: {
    padding: 20,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  cardIconBox: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14.5,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 1,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: colors.appBg,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.sansRegular,
    padding: 0,
    height: '100%',
  },
  addTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    height: 40,
    backgroundColor: colors.rust,
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.white,
  },
  exportTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    height: 40,
    backgroundColor: colors.white,
  },
  exportBtnText: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  errorText: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
    color: '#C0392B',
    marginTop: 8,
  },
  loadingIndicator: {
    marginTop: 18,
  },
  bulkBar: {
    borderWidth: 1,
    borderColor: `${colors.rust}33`,
    backgroundColor: `${colors.rust}0d`,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  bulkBarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bulkBarTitle: {
    fontSize: 12.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  bulkLabel: {
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
    marginRight: 2,
  },
  bulkDivider: {
    width: 1,
    height: 18,
    backgroundColor: `${colors.rust}33`,
    marginHorizontal: 4,
  },
  bulkChip: {
    borderWidth: 1,
    borderColor: colors.rust,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.white,
  },
  bulkChipText: {
    fontSize: 11.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.rust,
  },
  bulkNoteText: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
    color: colors.ink,
  },
  tableScroll: {
    marginTop: 8,
  },
  tableWrap: {
    minWidth: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  tableBody: {
    maxHeight: 460,
  },
  emptyText: {
    padding: 20,
    textAlign: 'center',
    fontSize: 12.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.appBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderText: {
    fontSize: 10.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowInactive: {
    backgroundColor: colors.appBg,
    opacity: 0.7,
  },
  checkboxCell: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailCell: {
    width: 240,
  },
  accessCell: {
    width: 90,
  },
  appsCell: {
    width: 50,
  },
  activeCell: {
    width: 44,
  },
  actionsCell: {
    width: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userEmail: {
    fontSize: 12.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  appsCountText: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
  },
  iconBtn: {
    width: 26,
    height: 26,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.appBg,
  },
  iconBtnSave: {
    width: 26,
    height: 26,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.rust,
  },
  appChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  appChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.appBg,
  },
  appChipText: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: radii.lg,
    paddingVertical: 10,
    backgroundColor: colors.rust,
  },
  saveBtnText: {
    fontSize: 12.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.white,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,27,51,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 20,
  },
  dialogHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 16,
    fontFamily: fonts.sansBold,
    color: colors.ink,
    flex: 1,
    marginRight: 10,
  },
  dialogSectionLabel: {
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 10,
  },
  rolePickerCard: {
    maxWidth: 300,
  },
  rolePickerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rolePickerHint: {
    fontSize: 12,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginBottom: 12,
  },
  rolePickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: colors.appBg,
  },
  rolePickerOptionActive: {
    borderColor: colors.rust,
    backgroundColor: `${colors.rust}14`,
  },
  rolePickerOptionText: {
    fontSize: 13.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  rolePickerOptionTextActive: {
    color: colors.rust,
  },
  dialogFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  dialogCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  dialogCancelBtnText: {
    fontSize: 12.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  dialogSaveBtn: {
    flex: 1,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 8,
    backgroundColor: colors.appBg,
  },
  tabBtnActive: {
    borderColor: colors.rust,
    backgroundColor: `${colors.rust}14`,
  },
  tabBtnText: {
    fontSize: 12.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
  },
  tabBtnTextActive: {
    color: colors.rust,
  },
  bulkTextArea: {
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.sansRegular,
    backgroundColor: colors.appBg,
  },
  bulkParseHint: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
    marginTop: 6,
  },
});
