import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft, ShieldAlert, Search, X, Info, BarChart3, Users, UserCheck, LogIn,
  MousePointerClick, TrendingUp, ShieldCheck, Download,
} from 'lucide-react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { appById } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { getMyProfile, type UserProfile } from '../lib/authApi';
import {
  getAdminOverview, getAdminRoster, getAdminUserAppStats, getAdminAppStats,
  type AdminOverview, type AdminRosterEntry, type AdminUserAppStat, type AdminAppStat,
} from '../lib/adminApi';
import { exportAdministrationReportToExcel } from '../lib/exportAdminExcel';
import { colors, fonts, radii, appColor } from '../theme/tokens';

/** App ids that manage their own role internally (own DB or SAP OData), rather than being
 * authorized through this hub's Manage Access — see mockData.ts's APPS for these ids. The chip
 * shown for these in the roster/drill-down below is only ever the generic hub-level grant, never
 * the app's real internal role, so it's captioned rather than presented as authoritative. */
const ROLE_MANAGED_INTERNALLY = new Set(['audit-capa', 'finance', 'market-rate', 'inventory', 'expense', 'hr']);

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

export default function AdministrationScreen() {
  const [query, setQuery] = useState('');
  const navigation = useNavigation();
  const { access } = useAuth();
  const actingLevel = access?.accessLevel;
  // Same rule CustomDrawerContent uses to hide the nav item — repeated here as a route-level
  // guard, since a Viewer could otherwise still reach this screen directly (deep link, back
  // button into a previously-open tab, etc). Same posture as UserAccessScreen.tsx.
  const canViewAdministration = actingLevel === 'Super Admin' || actingLevel === 'Admin';

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');

  const [roster, setRoster] = useState<AdminRosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');

  // Org-wide app-wise usage — fetched alongside overview/roster purely to back the Excel export
  // button below; the screen itself doesn't render this as its own section (yet), just downloads
  // it. Distinct from the per-user `appStats` state below (that one's the drill-down dialog).
  const [orgAppStats, setOrgAppStats] = useState<AdminAppStat[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const [selected, setSelected] = useState<AdminRosterEntry | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState('');

  // Per-app drill-down — opened by tapping an app tile inside the user-detail dialog above.
  const [appStats, setAppStats] = useState<Record<string, AdminUserAppStat>>({});
  const [appStatsLoading, setAppStatsLoading] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

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
      if (result.ok && result.apps) setOrgAppStats(result.apps);
      // No visible error state for this one — it only backs the Excel export, and that button
      // is already disabled (see canDownload below) if this fetch happens to fail.
    });
  }, []);

  const canDownload = !overviewLoading && !rosterLoading && !overviewError && !rosterError && !!overview;

  const handleDownload = async () => {
    if (!overview) return;
    setDownloading(true);
    setDownloadError('');
    try {
      await exportAdministrationReportToExcel(overview, roster, orgAppStats);
    } catch {
      setDownloadError('Could not generate the report. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const openUser = (user: AdminRosterEntry) => {
    setSelected(user);
    setSelectedProfile(null);
    setSelectedError('');
    setAppStats({});
    setSelectedAppId(null);
    if (!user.usage.hasLoggedIn) return; // nothing to fetch — getMyProfile would 404
    setSelectedLoading(true);
    getMyProfile(user.email).then((profile) => {
      setSelectedLoading(false);
      if (profile) setSelectedProfile(profile);
      else setSelectedError('Could not load this user’s activity.');
    });
    setAppStatsLoading(true);
    getAdminUserAppStats(user.email).then((result) => {
      setAppStatsLoading(false);
      if (result.ok && result.apps) {
        setAppStats(Object.fromEntries(result.apps.map((s) => [s.appId, s])));
      }
    });
  };

  const closeUser = () => {
    setSelected(null);
    setSelectedAppId(null);
  };

  const closeAppDetail = () => setSelectedAppId(null);

  const visibleRoster = roster.filter((u) => u.email.toLowerCase().includes(rosterSearch.trim().toLowerCase()));

  if (access && !canViewAdministration) {
    return (
      <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
        <View style={styles.deniedWrap}>
          <ShieldAlert size={32} color={colors.inkSoft} />
          <Text style={styles.deniedTitle}>You don't have access to this page</Text>
          <Text style={styles.deniedText}>Administration is only available to Super Admin and Admin users.</Text>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Home' as never)}>
            <ArrowLeft size={13} color={colors.ink} />
            <Text style={styles.backText}>Back to Emami Apps</Text>
          </Pressable>
        </View>
      </ScreenScaffold>
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
    <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Home' as never)}>
            <ArrowLeft size={13} color={colors.ink} />
            <Text style={styles.backText}>Back to Emami Apps</Text>
          </Pressable>
          <Text style={[styles.pageTitle, styles.flex1]}>Administration</Text>
          <Pressable
            style={[styles.downloadBtn, !canDownload && styles.downloadBtnDisabled]}
            onPress={handleDownload}
            disabled={!canDownload || downloading}
            accessibilityRole="button"
            accessibilityLabel="Download the full Administration report as Excel"
          >
            <Download size={13} color={colors.white} />
            <Text style={styles.downloadBtnText}>{downloading ? 'Preparing…' : 'Download Report'}</Text>
          </Pressable>
        </View>
        {!!downloadError && <Text style={styles.errorText}>{downloadError}</Text>}

        <View style={styles.noticeCard}>
          <Info size={15} color={colors.rust} />
          <Text style={styles.noticeText}>
            Org-wide KPIs and per-user access/activity, for monitoring only — role and access
            changes still happen in Manage Access. Some apps (Audit &amp; CAPA, RC Portal, Current
            Market Rate, Mould Health Inspection, Non CTC Expense, Dispatch Tracker) manage their
            own role internally; the chip shown for them here is only the generic hub-level grant.
          </Text>
        </View>

        {overviewError ? (
          <Text style={styles.errorText}>{overviewError}</Text>
        ) : overviewLoading ? (
          <ActivityIndicator size="small" color={colors.rust} style={styles.loadingIndicator} />
        ) : (
          <View style={styles.kpiRow}>
            {kpiTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <View key={tile.label} style={[styles.baseCard, styles.kpiTile]}>
                  <View style={styles.cardIconBox}>
                    <Icon size={15} color={colors.rust} />
                  </View>
                  <Text style={styles.kpiValue}>{tile.value}</Text>
                  <Text style={styles.kpiLabel}>{tile.label}</Text>
                  <Text style={styles.kpiSub}>{tile.sub}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={[styles.baseCard, styles.card]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconBox}>
              <BarChart3 size={15} color={colors.rust} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.cardTitle}>User Roster</Text>
              <Text style={styles.cardSubtitle}>Access level, app grants, and usage for every authorized user</Text>
            </View>
          </View>

          <View style={[styles.inputWrap, styles.searchUsersWrap]}>
            <Search size={14} color={colors.inkSoft} />
            <TextInput
              value={rosterSearch}
              onChangeText={setRosterSearch}
              placeholder="Search by email…"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              accessibilityLabel="Search users by email"
            />
            {!!rosterSearch && (
              <Pressable onPress={() => setRosterSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <X size={14} color={colors.inkSoft} />
              </Pressable>
            )}
          </View>

          {!!rosterError && <Text style={styles.errorText}>{rosterError}</Text>}

          {rosterLoading ? (
            <ActivityIndicator size="small" color={colors.rust} style={styles.loadingIndicator} />
          ) : (
            <View style={styles.list}>
              {visibleRoster.length === 0 && (
                <Text style={styles.emptyText}>
                  {rosterSearch.trim() ? `No users match "${rosterSearch.trim()}".` : 'No authorized users yet.'}
                </Text>
              )}
              {visibleRoster.map((user, i) => (
                <Pressable
                  key={user.email}
                  onPress={() => openUser(user)}
                  style={[
                    styles.userRow,
                    i < visibleRoster.length - 1 && styles.userRowBorder,
                    !user.isActive && styles.userRowInactive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`View activity for ${user.email}`}
                >
                  <View style={styles.userHeaderRow}>
                    <View style={styles.flex1}>
                      <Text style={styles.userEmail}>{user.email}</Text>
                      <Text style={styles.userCount}>
                        {user.usage.lastLogin ? `Last login ${formatDateShort(user.usage.lastLogin)}` : 'Never signed in'}
                        {' · '}{user.isActive ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                    {user.accessLevel === 'Super Admin' ? (
                      <View style={styles.superAdminBadge}>
                        <ShieldCheck size={12} color={colors.rust} />
                        <Text style={styles.superAdminBadgeText}>Super Admin</Text>
                      </View>
                    ) : (
                      <View style={[styles.accessLevelBadge, user.accessLevel === 'Admin' && styles.accessLevelBadgeAdmin]}>
                        <Text style={[styles.accessLevelBadgeText, user.accessLevel === 'Admin' && styles.accessLevelBadgeTextAdmin]}>
                          {user.accessLevel}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.usageStatsRow}>
                    <Text style={styles.usageStat}>{user.usage.logins} logins</Text>
                    <Text style={styles.usageStatDivider}>·</Text>
                    <Text style={styles.usageStat}>{user.usage.sessionsTotal} sessions</Text>
                    <Text style={styles.usageStatDivider}>·</Text>
                    <Text style={styles.usageStat}>{user.usage.appsOpened} apps opened</Text>
                    <Text style={styles.usageStatDivider}>·</Text>
                    <Text style={styles.usageStat}>{user.usage.timeSpent} spent</Text>
                    {user.usage.mostUsedApp && (
                      <>
                        <Text style={styles.usageStatDivider}>·</Text>
                        <Text style={styles.usageStat}>most used: {appLabel(user.usage.mostUsedApp)}</Text>
                      </>
                    )}
                  </View>

                  <View style={styles.appChipsRow}>
                    {user.apps.length === 0 ? (
                      <Text style={styles.noAppsText}>No app grants</Text>
                    ) : (
                      user.apps.map((grant) => {
                        const accent = appColor(grant.appId);
                        const app = appById(grant.appId);
                        const Icon = app?.icon;
                        return (
                          <View key={grant.appId} style={[styles.appChip, { borderColor: accent, backgroundColor: `${accent}14` }]}>
                            {Icon && <Icon size={12} color={accent} />}
                            <Text style={[styles.appChipText, { color: accent }]}>
                              {appLabel(grant.appId)} · {grant.role}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeUser}>
        <Pressable style={styles.backdrop} onPress={closeUser}>
          <Pressable style={styles.dialogCard} onPress={() => {}}>
            <View style={styles.dialogHeaderRow}>
              <Text style={styles.dialogTitle}>{selected?.email}</Text>
              <Pressable onPress={closeUser} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <X size={18} color={colors.inkSoft} />
              </Pressable>
            </View>

            {selected && !selected.usage.hasLoggedIn ? (
              <Text style={styles.emptyText}>This user hasn't signed in to EmamiApps yet.</Text>
            ) : selectedLoading ? (
              <ActivityIndicator size="small" color={colors.rust} style={styles.loadingIndicator} />
            ) : selectedError ? (
              <Text style={styles.errorText}>{selectedError}</Text>
            ) : selectedProfile ? (
              <>
                <View style={styles.detailGrid}>
                  <DetailField label="Last Login" value={formatDateTime(selectedProfile.lastLogin)} />
                  <DetailField label="Total Logins" value={String(selectedProfile.logins)} />
                  <DetailField label="Sessions" value={String(selectedProfile.sessionsTotal)} />
                  <DetailField label="Time Spent" value={selectedProfile.timeSpent} />
                  <DetailField label="Last Session" value={selectedProfile.lastSessionDuration || '—'} />
                  <DetailField label="Apps Opened" value={String(selectedProfile.appsOpened)} />
                  <DetailField label="Downloads" value={String(selectedProfile.downloads)} />
                  <DetailField label="Favorites Added" value={String(selectedProfile.favoritesAdded)} />
                  <DetailField label="Notifications Read" value={String(selectedProfile.notificationsRead)} />
                  <DetailField label="Most Used App" value={selectedProfile.mostUsedApp !== '—' ? appLabel(selectedProfile.mostUsedApp) : '—'} />
                </View>

                {selectedProfile.topApps.length > 0 && (
                  <>
                    <Text style={styles.dialogSectionLabel}>Top Apps</Text>
                    <View style={styles.appChipsRow}>
                      {selectedProfile.topApps.map((t) => {
                        const accent = appColor(t.appId);
                        const app = appById(t.appId);
                        const Icon = app?.icon;
                        return (
                          <View key={t.appId} style={[styles.appChip, { borderColor: accent, backgroundColor: `${accent}14` }]}>
                            {Icon && <Icon size={12} color={accent} />}
                            <Text style={[styles.appChipText, { color: accent }]}>{appLabel(t.appId)} · {t.opens} opens</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}

                <Text style={styles.dialogSectionLabel}>App Access · tap an app for its usage stats</Text>
                <View style={styles.appChipsRow}>
                  {(selected?.apps.length ?? 0) === 0 ? (
                    <Text style={styles.noAppsText}>No app grants</Text>
                  ) : (
                    selected!.apps.map((grant) => {
                      const accent = appColor(grant.appId);
                      const app = appById(grant.appId);
                      const Icon = app?.icon;
                      const internal = ROLE_MANAGED_INTERNALLY.has(grant.appId);
                      return (
                        <Pressable
                          key={grant.appId}
                          onPress={() => setSelectedAppId(grant.appId)}
                          style={[styles.appChip, { borderColor: accent, backgroundColor: `${accent}14` }]}
                          accessibilityRole="button"
                          accessibilityLabel={`View usage stats for ${appLabel(grant.appId)}`}
                        >
                          {Icon && <Icon size={12} color={accent} />}
                          <Text style={[styles.appChipText, { color: accent }]}>
                            {appLabel(grant.appId)} · {grant.role}{internal ? ' (hub grant only)' : ''}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* App-specific drill-down — opened by tapping an app tile in the dialog above. */}
      <Modal visible={!!selectedAppId} transparent animationType="fade" onRequestClose={closeAppDetail}>
        <Pressable style={styles.backdrop} onPress={closeAppDetail}>
          <Pressable style={styles.dialogCard} onPress={() => {}}>
            {selectedAppId && selected && (() => {
              const app = appById(selectedAppId);
              const Icon = app?.icon;
              const accent = appColor(selectedAppId);
              const grant = selected.apps.find((a) => a.appId === selectedAppId);
              const stat = appStats[selectedAppId];
              const internal = ROLE_MANAGED_INTERNALLY.has(selectedAppId);
              return (
                <>
                  <View style={styles.dialogHeaderRow}>
                    <View style={[styles.flex1, styles.appDetailTitleRow]}>
                      {Icon && <Icon size={17} color={accent} />}
                      <Text style={styles.dialogTitle} numberOfLines={1}>{appLabel(selectedAppId)}</Text>
                    </View>
                    <Pressable onPress={closeAppDetail} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                      <X size={18} color={colors.inkSoft} />
                    </Pressable>
                  </View>
                  <Text style={styles.cardSubtitle}>{selected.email}</Text>

                  {grant && (
                    <View style={[styles.appChip, styles.appDetailRoleChip, { borderColor: accent, backgroundColor: `${accent}14` }]}>
                      <Text style={[styles.appChipText, { color: accent }]}>
                        Role: {grant.role}{internal ? ' (hub grant only)' : ''}
                      </Text>
                    </View>
                  )}

                  {appStatsLoading ? (
                    <ActivityIndicator size="small" color={colors.rust} style={styles.loadingIndicator} />
                  ) : stat ? (
                    <View style={styles.detailGrid}>
                      <DetailField label="Total Opens" value={String(stat.opens)} />
                      <DetailField label="First Opened" value={formatDateTime(stat.firstOpened)} />
                      <DetailField label="Last Opened" value={formatDateTime(stat.lastOpened)} />
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>{selected.email} hasn't opened {appLabel(selectedAppId)} yet.</Text>
                  )}

                  {internal && (
                    <Text style={styles.appDetailInternalNote}>
                      This app manages its own role internally — the grant above is only the generic
                      hub-level access, not necessarily the user's real role inside the app.
                    </Text>
                  )}
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenScaffold>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  flex1: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
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
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.rust,
  },
  downloadBtnDisabled: {
    opacity: 0.5,
  },
  downloadBtnText: {
    fontSize: 12,
    fontFamily: fonts.sansSemiBold,
    color: colors.white,
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
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiTile: {
    flexGrow: 1,
    flexBasis: 170,
    padding: 14,
    gap: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontFamily: fonts.sansBold,
    color: colors.ink,
    marginTop: 6,
  },
  kpiLabel: {
    fontSize: 11.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
  },
  kpiSub: {
    fontSize: 10.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
  },
  searchUsersWrap: {
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
  emptyText: {
    padding: 20,
    textAlign: 'center',
    fontSize: 12.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
  },
  userRow: {
    padding: 14,
    gap: 8,
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
    gap: 10,
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
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    color: colors.rust,
  },
  accessLevelBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.appBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accessLevelBadgeAdmin: {
    backgroundColor: `${colors.rust}14`,
    borderColor: colors.rust,
  },
  accessLevelBadgeText: {
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
  },
  accessLevelBadgeTextAdmin: {
    color: colors.rust,
  },
  usageStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  usageStat: {
    fontSize: 11,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
  },
  usageStatDivider: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  appChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  noAppsText: {
    fontSize: 11.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
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
  appDetailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appDetailRoleChip: {
    alignSelf: 'flex-start',
    marginTop: 12,
    marginBottom: 16,
  },
  appDetailInternalNote: {
    fontSize: 11.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    lineHeight: 16,
    marginTop: 16,
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
    maxWidth: 520,
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
    fontSize: 15,
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
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailField: {
    minWidth: 130,
    flexGrow: 1,
    flexBasis: '30%',
    gap: 2,
  },
  detailLabel: {
    fontSize: 10,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
});
