import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { ChevronRight, LayoutGrid } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenScaffold from '../components/ScreenScaffold';
import DashboardHero from '../components/DashboardHero';
import CompanyPulseCard from '../components/CompanyPulseCard';
import FilterBar from '../components/FilterBar';
import AppGrid from '../components/AppGrid';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { useFilteredApps } from '../hooks/useFilteredApps';
import { useUnlockedAppIds } from '../hooks/useAppAccess';
import { setScrollActivity } from '../hooks/useScrollActivity';
import { logEvent } from '../lib/authApi';
import { RECENT, appById } from '../data/mockData';
import { colors, fonts, radii, appColor } from '../theme/tokens';
import type { AppItem, CategoryFilter, SortOption } from '../types';
import type { RootStackParamList } from '../navigation/types';

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { favorites, toggleFavorite } = useFavorites();
  const { userEmail, profile } = useAuth();
  const unlockedAppIds = useUnlockedAppIds();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [sort, setSort] = useState<SortOption>('Alphabetical');

  const apps = useFilteredApps({ query, category, sort });

  const openApp = (app: AppItem) => {
    // Every app now always renders as a tile (locked ones just look locked, see AppCard) — tapping
    // a locked one routes to AppDetail's own "you don't have access" message instead of opening it.
    if (!unlockedAppIds.has(app.id)) {
      navigation.navigate('AppDetail', { appId: app.id });
      return;
    }
    if (userEmail) logEvent(userEmail, 'APP_OPEN', app.id);
    // Web: open the app in its own tab instead of navigating this one away. Native has no tab
    // concept, so it keeps going through AppDetail's in-app WebView.
    if (Platform.OS === 'web' && app.url) {
      Linking.openURL(app.url);
      return;
    }
    navigation.navigate('AppDetail', { appId: app.id });
  };

  const onToggleFavorite = (id: string) => {
    if (userEmail) logEvent(userEmail, favorites.has(id) ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD');
    toggleFavorite(id);
  };

  return (
    <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => setScrollActivity(true)}
        onScrollEndDrag={() => setScrollActivity(false)}
        onMomentumScrollBegin={() => setScrollActivity(true)}
        onMomentumScrollEnd={() => setScrollActivity(false)}
      >
        <DashboardHero
          name={profile?.name || userEmail || ''}
          lastLogin={profile?.lastLogin ? new Date(profile.lastLogin).toLocaleString() : '—'}
        />

        <CompanyPulseCard />

        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconBox}>
            <LayoutGrid size={15} color={colors.rust} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.sectionTitle}>My Applications</Text>
            <Text style={styles.sectionSubtitle}>Quick access to the applications you use most</Text>
          </View>
        </View>

        <FilterBar category={category} onCategoryChange={setCategory} sort={sort} onSortChange={setSort} />
        <AppGrid
          apps={apps}
          favorites={favorites}
          query={query}
          onOpenApp={openApp}
          onToggleFavorite={onToggleFavorite}
          scrollEnabled={false}
          unlockedAppIds={unlockedAppIds}
        />

        <Text style={[styles.recentTitle]}>Recently Used</Text>
        <View style={styles.recentList}>
          {RECENT.filter((r) => unlockedAppIds.has(r.id)).map((r, i, visible) => {
            const app = appById(r.id);
            if (!app) return null;
            const Icon = app.icon;
            const accent = appColor(app.id);
            return (
              <Pressable
                key={r.id}
                onPress={() => openApp(app)}
                style={[styles.recentRow, i < visible.length - 1 && styles.recentRowBorder]}
              >
                <View style={[styles.recentIcon, { backgroundColor: `${accent}1a` }]}>
                  <Icon size={16} color={accent} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.recentName}>{app.name}</Text>
                  <Text style={styles.recentWhen}>{r.when}</Text>
                </View>
                <ChevronRight size={15} color={colors.inkSoft} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionIconBox: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 1,
  },
  recentTitle: {
    fontSize: 15,
    fontFamily: fonts.sansBold,
    color: colors.ink,
    marginTop: 24,
    marginBottom: 14,
  },
  recentList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  recentRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  recentName: {
    fontSize: 13.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  recentWhen: {
    fontSize: 11.5,
    color: colors.inkSoft,
    fontFamily: fonts.sansRegular,
    marginTop: 2,
  },
});
