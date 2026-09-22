'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FilterBar from './FilterBar';
import AppGrid from './AppGrid';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { useSearch } from '../context/SearchContext';
import { useFilteredApps } from '../hooks/useFilteredApps';
import { useUnlockedAppIds, useAppRoles } from '../hooks/useAppAccess';
import { logEvent } from '../lib/authApi';
import { CATEGORIES } from '../data/mockData';
import { colors, fonts, fontWeights } from '../theme/tokens';
import type { AppItem, CategoryFilter, SortOption } from '../types';

interface AppListViewProps {
  title: string;
  onlyFavorites?: boolean;
}

function AppListViewContent({ title, onlyFavorites }: AppListViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { favorites, toggleFavorite } = useFavorites();
  const { userEmail } = useAuth();
  const { searchValue: query } = useSearch();
  const unlockedAppIds = useUnlockedAppIds();
  const appRoles = useAppRoles();

  // Seeds the category filter from ?category=... (see the Home page's segregation tiles, which
  // route here instead of filtering in place) — only read once, on the initial render; switching
  // categories from the FilterBar itself after that is plain local state, same as before.
  const requestedCategory = searchParams.get('category');
  const initialCategory: CategoryFilter = (CATEGORIES as string[]).includes(requestedCategory || '')
    ? (requestedCategory as CategoryFilter)
    : 'All';
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [sort, setSort] = useState<SortOption>('Alphabetical');

  const apps = useFilteredApps({ query, category, sort, favorites, onlyFavorites });

  const openApp = (app: AppItem) => {
    // Every app now always renders as a tile (locked ones just look locked, see AppCard) — tapping
    // a locked one routes to /apps/[id]'s own "you don't have access" message instead of opening it.
    if (!unlockedAppIds.has(app.id)) {
      router.push(`/apps/${app.id}`);
      return;
    }
    if (userEmail) logEvent(userEmail, 'APP_OPEN', app.id);
    if (app.url) {
      window.open(app.url, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(`/apps/${app.id}`);
  };

  const onToggleFavorite = (id: string) => {
    if (userEmail) logEvent(userEmail, favorites.has(id) ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD');
    toggleFavorite(id);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 16px 40px' }}>
      <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 22, color: colors.ink, marginTop: 0, marginBottom: 16 }}>{title}</p>
      <FilterBar category={category} onCategoryChange={setCategory} sort={sort} onSortChange={setSort} unlockedAppIds={unlockedAppIds} />
      <AppGrid
        apps={apps}
        favorites={favorites}
        query={query}
        onOpenApp={openApp}
        onToggleFavorite={onToggleFavorite}
        unlockedAppIds={unlockedAppIds}
        appRoles={appRoles}
      />
    </div>
  );
}

export default function AppListView(props: AppListViewProps) {
  return (
    <Suspense fallback={null}>
      <AppListViewContent {...props} />
    </Suspense>
  );
}
