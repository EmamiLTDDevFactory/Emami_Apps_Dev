import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Mail, Plus, ShieldCheck, Trash2, Info, Check, Save, KeyRound, ChevronRight } from 'lucide-react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { APPS } from '../data/mockData';
import type { AppRole, UserAccessEntry } from '../types';
import { colors, fonts, radii, appColor } from '../theme/tokens';
import { listAuthorizedUsers, addAuthorizedUser, removeAuthorizedUser, setAppAccess, setUserActive } from '../lib/accessApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Tap cycles a role through this order — None (no access) -> User -> Admin -> back to None. */
const ROLE_CYCLE: (AppRole | null)[] = [null, 'User', 'Admin'];

/** Local, unsaved edits for one user — undefined fields mean "unchanged from the server copy". */
type PendingChanges = {
  isActive?: boolean;
  roles: Record<string, AppRole | null>;
};

function roleOf(user: UserAccessEntry, appId: string): AppRole | null {
  return user.apps.find((a) => a.appId === appId)?.role ?? null;
}

export default function UserAccessScreen() {
  const [query, setQuery] = useState('');
  const navigation = useNavigation();

  const [users, setUsers] = useState<UserAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  // Keyed by email — edits made in the UI that haven't been saved to the server yet.
  const [pending, setPending] = useState<Record<string, PendingChanges>>({});

  useEffect(() => {
    listAuthorizedUsers().then((result) => {
      setLoading(false);
      if (result.ok && result.users) {
        setUsers(result.users);
      } else {
        setError(result.error || 'Could not load authorized users.');
      }
    });
  }, []);

  const addUser = async () => {
    const value = input.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setError('Enter a valid email address.');
      return;
    }
    if (users.some((u) => u.email === value)) {
      setError('This email already has access.');
      return;
    }
    setError('');
    // New users start with no modules granted — admin picks exactly which
    // apps this person should see, rather than defaulting to full access.
    const result = await addAuthorizedUser(value);
    if (!result.ok) {
      setError(result.error || 'Could not add this user.');
      return;
    }
    setUsers((prev) => [...prev, { email: value, isActive: true, apps: [] }]);
    setInput('');
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
  };

  const effectiveActive = (user: UserAccessEntry) => pending[user.email]?.isActive ?? user.isActive;
  const effectiveRole = (user: UserAccessEntry, appId: string) => {
    const p = pending[user.email]?.roles[appId];
    return p !== undefined ? p : roleOf(user, appId);
  };
  const isDirty = (user: UserAccessEntry) => {
    const p = pending[user.email];
    if (!p) return false;
    if (p.isActive !== undefined && p.isActive !== user.isActive) return true;
    return Object.entries(p.roles).some(([appId, role]) => role !== roleOf(user, appId));
  };

  const cycleRole = (user: UserAccessEntry, appId: string) => {
    const current = effectiveRole(user, appId);
    const next = ROLE_CYCLE[(ROLE_CYCLE.indexOf(current) + 1) % ROLE_CYCLE.length];
    setPending((prev) => {
      const existing = prev[user.email] ?? { roles: {} };
      return { ...prev, [user.email]: { ...existing, roles: { ...existing.roles, [appId]: next } } };
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
      for (const [appId, role] of Object.entries(changes.roles)) {
        if (role !== roleOf(user, appId)) {
          calls.push(setAppAccess(user.email, appId, role));
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
          const nextApps = u.apps.filter((a) => changes.roles[a.appId] === undefined);
          for (const [appId, role] of Object.entries(changes.roles)) {
            if (role) nextApps.push({ appId, role });
          }
          return { ...u, isActive: changes.isActive ?? u.isActive, apps: nextApps };
        })
      );
      setPending((prev) => {
        const { [user.email]: _drop, ...rest } = prev;
        return rest;
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Home' as never)}>
            <ArrowLeft size={13} color={colors.ink} />
            <Text style={styles.backText}>Back to Hub</Text>
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
            Tap an app chip to cycle its role: None → User → Admin. Changes save per-user via Save.
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

          <View style={styles.addRow}>
            <View style={styles.inputWrap}>
              <Mail size={14} color={colors.inkSoft} />
              <TextInput
                value={input}
                onChangeText={(v) => { setInput(v); if (error) setError(''); }}
                onSubmitEditing={addUser}
                placeholder="name@emamigroup.com"
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
                accessibilityLabel="Email address to grant access"
              />
            </View>
            <Pressable style={styles.addBtn} onPress={addUser} accessibilityRole="button" accessibilityLabel="Add user">
              <Plus size={14} color={colors.white} />
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {loading ? (
            <ActivityIndicator size="small" color={colors.rust} style={styles.loadingIndicator} />
          ) : (
          <View style={styles.list}>
            {users.map((user, i) => {
              const active = effectiveActive(user);
              const grantedCount = APPS.filter((app) => effectiveRole(user, app.id)).length;
              const dirty = isDirty(user);
              return (
                <View key={user.email} style={[styles.userRow, i < users.length - 1 && styles.userRowBorder, !active && styles.userRowInactive]}>
                  <View style={styles.userHeaderRow}>
                    <View style={styles.flex1}>
                      <Text style={styles.userEmail}>{user.email}</Text>
                      <Text style={styles.userCount}>{grantedCount}/{APPS.length} apps · {active ? 'Active' : 'Inactive'}</Text>
                    </View>
                    <View style={styles.userHeaderRight}>
                      <Switch
                        value={active}
                        onValueChange={() => toggleActivePending(user)}
                        trackColor={{ true: colors.rust, false: colors.border }}
                        accessibilityLabel={`${active ? 'Deactivate' : 'Activate'} ${user.email}`}
                      />
                      <Pressable
                        onPress={() => removeUser(user.email)}
                        hitSlop={8}
                        style={styles.removeBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${user.email}`}
                      >
                        <Trash2 size={14} color={colors.rust} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.appChipsRow}>
                    {APPS.map((app) => {
                      const role = effectiveRole(user, app.id);
                      const accent = appColor(app.id);
                      const Icon = app.icon;
                      return (
                        <Pressable
                          key={app.id}
                          onPress={() => cycleRole(user, app.id)}
                          style={[
                            styles.appChip,
                            { borderColor: role ? accent : colors.border },
                            role && { backgroundColor: `${accent}14` },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${app.name} access for ${user.email}: ${role ?? 'None'}. Tap to change.`}
                        >
                          <Icon size={12.5} color={role ? accent : colors.inkSoft} />
                          <Text style={[styles.appChipText, { color: role ? accent : colors.inkSoft }]}>
                            {app.name}{role ? ` · ${role}` : ''}
                          </Text>
                          {role === 'Admin' && <Check size={12} color={accent} />}
                        </Pressable>
                      );
                    })}
                  </View>

                  {dirty && (
                    <Pressable
                      style={styles.saveBtn}
                      onPress={() => saveUser(user)}
                      disabled={saving === user.email}
                      accessibilityRole="button"
                      accessibilityLabel={`Save changes for ${user.email}`}
                    >
                      {saving === user.email ? (
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
              );
            })}
          </View>
          )}
        </View>
      </ScrollView>
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
  addRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
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
  errorText: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
    color: '#C0392B',
    marginTop: 8,
  },
  loadingIndicator: {
    marginTop: 18,
  },
  list: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  userRow: {
    padding: 14,
  },
  userRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userRowInactive: {
    backgroundColor: colors.appBg,
    opacity: 0.7,
  },
  userHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  userHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  userEmail: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  userCount: {
    fontSize: 11,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
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
});
