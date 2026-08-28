import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenScaffold from '../components/ScreenScaffold';
import FilterBar from '../components/FilterBar';
import AppGrid from '../components/AppGrid';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { useFilteredApps } from '../hooks/useFilteredApps';
import { useUnlockedAppIds } from '../hooks/useAppAccess';
import { logEvent } from '../lib/authApi';
import { colors, fonts } from '../theme/tokens';
import type { AppItem, CategoryFilter, SortOption } from '../types';
import type { RootStackParamList } from '../navigation/types';

interface AppListScreenProps {
  title: string;
  onlyFavorites?: boolean;
}

export default function AppListScreen({ title, onlyFavorites }: AppListScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { favorites, toggleFavorite } = useFavorites();
  const { userEmail } = useAuth();
  const unlockedAppIds = useUnlockedAppIds();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [sort, setSort] = useState<SortOption>('Alphabetical');

  const apps = useFilteredApps({ query, category, sort, favorites, onlyFavorites });

  // This screen (All Apps and, via onlyFavorites, the dedicated Favorites list) used to navigate/
  // toggle without logging APP_OPEN or FAVORITE_ADD/REMOVE at all — only HomeScreen's own grid did
  // — so Settings' Apps Opened count and per-app bars, and Favorites Added, undercounted whatever
  // usage came through here instead of the Home grid.
  const openApp = (app: AppItem) => {
    if (!unlockedAppIds.has(app.id)) return;
    if (userEmail) logEvent(userEmail, 'APP_OPEN', app.id);
    navigation.navigate('AppDetail', { appId: app.id });
  };

  const onToggleFavorite = (id: string) => {
    if (userEmail) logEvent(userEmail, favorites.has(id) ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD');
    toggleFavorite(id);
  };

  return (
    <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{title}</Text>
        <FilterBar category={category} onCategoryChange={setCategory} sort={sort} onSortChange={setSort} />
        <AppGrid
          apps={apps}
          favorites={favorites}
          query={query}
          onOpenApp={openApp}
          onToggleFavorite={onToggleFavorite}
          unlockedAppIds={unlockedAppIds}
        />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.ink,
    marginBottom: 16,
  },
});
