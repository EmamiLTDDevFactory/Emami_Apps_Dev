import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, appColor, shadows } from '../theme/tokens';
import { NAV, APPS } from '../data/mockData';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { useUnlockedAppIds } from '../hooks/useAppAccess';
import { logEvent } from '../lib/authApi';
import EmpAppMark from '../components/EmpAppMark';
import { Lock } from 'lucide-react-native';

export default function CustomDrawerContent({ state, navigation }: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { favorites } = useFavorites();
  const { access, userEmail } = useAuth();
  const unlockedAppIds = useUnlockedAppIds();
  const favoriteApps = APPS.filter((a) => favorites.has(a.id));
  const activeRoute = state.routeNames[state.index];
  // The always-visible "Quick access" strip below is likely the single most common way a favorite
  // app gets opened, but it never logged APP_OPEN — undercounting Settings' Apps Opened stat and
  // per-app bars for exactly the apps a user cares about most.
  const onOpenApp = (app: (typeof APPS)[number]) => {
    if (!unlockedAppIds.has(app.id)) return;
    if (userEmail) logEvent(userEmail, 'APP_OPEN', app.id);
    (navigation as any).navigate('AppDetail', { appId: app.id });
  };
  // Manage Access is only for Super Admin/Admin (see UserAccessScreen.tsx, which enforces the
  // same rule server-side too — this just keeps the nav item from showing to a Viewer at all).
  const canManageAccess = access?.accessLevel === 'Super Admin' || access?.accessLevel === 'Admin';
  const navItems = NAV.filter((item) => item.id !== 'UserAccess' || canManageAccess);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 16 }]}>
      <Pressable
        style={styles.brandRow}
        onPress={() => navigation.navigate('Home')}
        accessibilityRole="button"
        accessibilityLabel="Go to Home"
      >
        <EmpAppMark size={30} />
        <Text style={styles.brandText}>EMAMI APPS</Text>
      </Pressable>

      {favoriteApps.length > 0 && (
        <View style={styles.quickAccess}>
          <Text style={styles.quickAccessLabel}>Quick access</Text>
          <View style={styles.quickAccessRow}>
            {favoriteApps.map((app) => {
              const Icon = app.icon;
              const c = appColor(app.id);
              const locked = !unlockedAppIds.has(app.id);
              return (
                <Pressable
                  key={app.id}
                  onPress={() => onOpenApp(app)}
                  style={[styles.quickAccessBtn, { backgroundColor: locked ? colors.sidebarBorder : `${c}2e` }]}
                  accessibilityRole="button"
                  accessibilityLabel={locked ? `${app.name} — locked` : `Open ${app.name}`}
                  accessibilityState={{ disabled: locked }}
                >
                  {locked ? <Lock size={12} color={colors.sidebarTextSoft} /> : <Icon size={14} color={c} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <ScrollView style={styles.nav} contentContainerStyle={{ paddingBottom: 12 }}>
        {navItems.map((item) => {
          const active = activeRoute === item.id;
          const Icon = item.icon;
          return (
            <Pressable
              key={item.id}
              onPress={() => navigation.navigate(item.id)}
              style={[styles.navItem, active && styles.navItemActive]}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.navIconBox, active && styles.navIconBoxActive]}>
                <Icon size={15} color={active ? colors.white : colors.sidebarTextSoft} strokeWidth={2.2} />
              </View>
              <Text style={[styles.navLabel, { color: active ? colors.rust : colors.sidebarTextSoft, fontFamily: active ? fonts.sansBold : fonts.sansMedium }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.footerText}>© {new Date().getFullYear()} Emami Limited</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.sidebar,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  brandText: {
    color: colors.sidebarText,
    fontFamily: fonts.sansBold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  quickAccess: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.sidebarBorder,
    marginBottom: 8,
  },
  quickAccessLabel: {
    color: colors.sidebarTextSoft,
    fontSize: 10.5,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  quickAccessRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  quickAccessBtn: {
    width: 27,
    height: 27,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
    shadowOpacity: 0.25,
  },
  nav: {
    flex: 1,
    paddingHorizontal: 10,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 7,
    marginBottom: 4,
    borderRadius: radii.lg,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: colors.sidebarActive,
    borderLeftColor: colors.rust,
  },
  navIconBox: {
    width: 27,
    height: 27,
    borderRadius: radii.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconBoxActive: {
    backgroundColor: colors.rust,
  },
  navLabel: {
    fontSize: 13,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.sidebarBorder,
  },
  footerText: {
    color: colors.sidebarTextSoft,
    fontSize: 11,
    fontFamily: fonts.sansRegular,
  },
});
