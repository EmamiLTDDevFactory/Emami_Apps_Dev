import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Camera, Clock3, LogOut } from 'lucide-react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import Avatar from '../components/Avatar';
import Badge from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { appById } from '../data/mockData';
import { colors, fonts, radii, categoryColors, appColor } from '../theme/tokens';

export default function SettingsScreen() {
  const [query, setQuery] = useState('');
  const { logout, userEmail, profile } = useAuth();
  const navigation = useNavigation();

  const mostUsedAppLabel = profile?.mostUsedApp
    ? appById(profile.mostUsedApp)?.name || profile.mostUsedApp
    : '—';

  const user = {
    name: profile?.name || userEmail || '',
    email: profile?.email || userEmail || '',
    mobile: profile?.mobile || '—',
    role: profile?.role || '—',
    status: profile?.status || '—',
    lastLogin: profile?.lastLogin ? new Date(profile.lastLogin).toLocaleString() : '—',
  };

  // First row matches the reference design's primary tiles (minus chat/token stats, which don't
  // apply to this hub); the rest are existing tiles this hub already tracked before that redesign
  // — kept so nothing already working gets dropped just to match the reference more literally.
  const STATS = [
    { label: 'Logins', value: profile?.logins ?? '—' },
    { label: 'Time Spent', value: profile?.timeSpent ?? '—' },
    { label: 'Apps Opened', value: profile?.appsOpened ?? '—' },
    { label: 'Downloads', value: profile?.downloads ?? '—' },
    { label: 'Favorites Added', value: profile?.favoritesAdded ?? '—' },
    { label: 'Notifications Read', value: profile?.notificationsRead ?? '—' },
    { label: 'Most Used App', value: mostUsedAppLabel },
  ];

  const topApps = profile?.topApps ?? [];
  const maxOpens = Math.max(1, ...topApps.map((a) => a.opens));

  return (
    <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Home' as never)}>
            <ArrowLeft size={13} color={colors.ink} />
            <Text style={styles.backText}>Back to Hub</Text>
          </Pressable>
          <Text style={styles.pageTitle}>My Profile</Text>
          <View style={styles.flex1} />
          <Pressable style={styles.signOutBtn} onPress={logout}>
            <LogOut size={13} color={colors.rust} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={[styles.baseCard, styles.card]}>
          <View style={styles.identityRow}>
            <View style={styles.avatarCol}>
              <View style={styles.avatarRow}>
                <Avatar name={user.name} size={56} />
                <Pressable style={styles.uploadBtn}>
                  <Camera size={12} color={colors.ink} />
                  <Text style={styles.uploadText}>Upload Photo</Text>
                </Pressable>
              </View>
              <Text style={styles.uploadHelper}>JPG, PNG or WebP · max 4MB · resized to 512×512</Text>
            </View>

            <View style={styles.infoCol}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{user.name}</Text>
                <Badge label={user.role} color={colors.amber} />
              </View>
              <Text style={styles.meta}>{user.mobile}</Text>
              <Text style={styles.meta}>{user.email}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.metaGrid}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Mobile</Text>
              <Text style={styles.metaValue}>{user.mobile}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Role</Text>
              <Text style={styles.metaValue}>{user.role}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={[styles.metaValue, { color: colors.green }]}>{user.status}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Last Login</Text>
              <Text style={styles.metaValue}>{user.lastLogin}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.baseCard, styles.timeCard]}>
          <View style={styles.timeHeaderRow}>
            <View style={styles.timeIconBox}>
              <Clock3 size={15} color={colors.white} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.timeTitle}>YOUR TIME ON APP</Text>
              <Text style={styles.timeSubtitle}>
                {profile?.lastSessionDuration
                  ? `Last session · ${profile.timeSpent} all-time`
                  : profile && profile.sessionsTotal <= 1
                    ? 'This is your first session — keep going, your time will land here next visit.'
                    : `Total time spent across all your sessions: ${profile?.timeSpent ?? '—'}.`}
              </Text>
            </View>
            <Badge label={`${profile?.sessionsTotal ?? 0} sessions total`} color={colors.inkSoft} />
          </View>

          {profile?.lastSessionDuration && (
            <Text style={styles.lastSessionValue}>{profile.lastSessionDuration}</Text>
          )}

          {topApps.length > 0 && (
            <View style={styles.appBars}>
              {topApps.map((a) => {
                const app = appById(a.appId);
                const accent = appColor(a.appId);
                const pct = Math.max(6, Math.round((a.opens / maxOpens) * 100));
                return (
                  <View key={a.appId} style={styles.appBarRow}>
                    <Text style={styles.appBarLabel} numberOfLines={1}>{app?.name || a.appId}</Text>
                    <View style={styles.appBarTrack}>
                      <View style={[styles.appBarFill, { width: `${pct}%`, backgroundColor: accent }]} />
                    </View>
                    <Text style={styles.appBarValue}>{a.opens}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={[styles.baseCard, styles.activityCard]}>
          <Text style={styles.activityTitle}>ACTIVITY</Text>
          <View style={styles.statsGrid}>
            {STATS.map((s) => (
              <View key={s.label} style={styles.statBox}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
            ))}
          </View>
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
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: `${colors.rust}40`,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: `${colors.rust}0d`,
  },
  signOutText: {
    fontSize: 12,
    fontFamily: fonts.sansSemiBold,
    color: colors.rust,
  },
  baseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  identityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  avatarCol: {
    minWidth: 160,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.appBg,
  },
  uploadText: {
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  uploadHelper: {
    fontSize: 10.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 8,
  },
  infoCol: {
    flex: 1,
    minWidth: 200,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    fontSize: 17,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  meta: {
    fontSize: 12.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  metaCell: {
    minWidth: 110,
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 13.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  timeCard: {
    borderLeftWidth: 3,
    borderLeftColor: categoryColors.Operations,
    padding: 16,
    marginBottom: 16,
  },
  timeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  timeIconBox: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: categoryColors.Operations,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeTitle: {
    fontSize: 11.5,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.5,
    color: colors.ink,
  },
  timeSubtitle: {
    fontSize: 12,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 3,
  },
  lastSessionValue: {
    fontSize: 30,
    fontFamily: fonts.sansBold,
    color: colors.ink,
    marginTop: 14,
    marginLeft: 46,
  },
  appBars: {
    marginTop: 16,
    marginLeft: 46,
    gap: 10,
  },
  appBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appBarLabel: {
    width: 110,
    fontSize: 12,
    fontFamily: fonts.sansMedium,
    color: colors.ink,
  },
  appBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.appBg,
    overflow: 'hidden',
  },
  appBarFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  appBarValue: {
    width: 24,
    textAlign: 'right',
    fontSize: 11.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.inkSoft,
  },
  activityCard: {
    padding: 20,
  },
  activityTitle: {
    fontSize: 12,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.6,
    color: colors.ink,
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statBox: {
    minWidth: 140,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.appBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
});
